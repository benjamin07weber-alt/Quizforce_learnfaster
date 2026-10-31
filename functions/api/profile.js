/** QUIZFORCE v5 • nickname-specific cosmetic profiles and shop.
 * Cloudflare Pages Function: GAME/functions/api/profile.js
 * Uses existing D1 binding DB; no admin password in public code.
 * Cosmetics only. Purchases spend a wallet balance, NOT lifetime/rank XP.
 * Existing qfhq_players progress is player-reported, not anti-cheat verified.
 */
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const KEY=/^[0-9a-f]{64}$/i;
const NAME=/^[\p{L}\p{N}_ .-]{2,18}$/u;
const AVATARS=['🦁','🚀','🦊','🐯','🦄','🤖','🐼','🦉','🐬','🐉'];
const COLORS=['cyan','violet','blue','green','orange','pink'];
const SHOP=Object.freeze({blue_frame:{name:'🔵 Blue Border',cost:100,field:'frame'},fire_frame:{name:'🔥 Fire Frame',cost:250,field:'frame'},gold_name:{name:'👑 Golden Name',cost:500,field:'title'},galaxy_frame:{name:'🌌 Galactic Frame',cost:1000,field:'frame'}});
const AWARDS=['founder','helper','star','champion'];
const BADGE_NAMES={first:'🚀 First Launch',ten:'🎯 Ten Tests',perfect:'💯 Perfect Score',legend:'👑 Galactic Legend',founder:'🌟 Founder',helper:'💡 Helpful Hero',star:'⭐ Star Player',champion:'🏆 HQ Champion'};
const normalize=x=>String(x||'').normalize('NFC').trim().replace(/\s+/g,' ');
const canon=x=>normalize(x).toLocaleLowerCase('en');
const all=async(db,sql,args=[])=>((await db.prepare(sql).bind(...args).all()).results||[]);
const one=async(db,sql,args=[])=>db.prepare(sql).bind(...args).first();
const clamp=x=>Math.max(0,Math.floor(Number(x)||0));
async function hashKey(key){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('qf5-profile:'+key.toLowerCase()));return [...new Uint8Array(d)].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function ensure(db){
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_hq_overrides (
  player_id TEXT PRIMARY KEY, nickname_override TEXT, xp_override INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_hq_run_corrections (
  run_id TEXT PRIMARY KEY, correct_override INTEGER NOT NULL,
  total_override INTEGER NOT NULL, xp_override INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_cosmetic_profiles (
  player_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, key_hash TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🚀', color TEXT NOT NULL DEFAULT 'cyan',
  frame TEXT NOT NULL DEFAULT 'none', title TEXT NOT NULL DEFAULT 'none',
  favorite_badge TEXT NOT NULL DEFAULT 'none',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_shop_purchases (
  player_id TEXT NOT NULL, item_id TEXT NOT NULL, cost INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id,item_id)
 )`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_awarded_badges (
  player_id TEXT NOT NULL, badge_id TEXT NOT NULL,
  awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id,badge_id)
 )`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_hq_settings (
  key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`).run();
}
function parseSetting(row){try{return row?.value?JSON.parse(row.value):null}catch{return null}}
async function competitionBoard(db,competition){
 if(!competition?.title||!competition?.start||!competition?.end)return [];
 const subject=competition.subject;
 // The FIRST eligible 10+ question attempt per player counts. This prevents
 // repeatedly replaying a competition just to improve the recorded result.
 const sql=`WITH eligible AS (
  SELECT r.player_id, r.completed_at,
   COALESCE(c.correct_override,r.correct) AS correct,
   COALESCE(c.total_override,r.total) AS total,
   ROW_NUMBER() OVER (PARTITION BY r.player_id ORDER BY r.completed_at ASC,r.rowid ASC) AS attempt
  FROM qfhq_runs r
  LEFT JOIN qfhq_hq_run_corrections c ON c.run_id=r.run_id
  LEFT JOIN qfhq_hq_overrides o ON o.player_id=r.player_id
  WHERE (?='All subjects' OR r.subject=?)
   AND r.total>=10 AND datetime(r.completed_at)>=datetime(?)
   AND datetime(r.completed_at)<datetime(?) AND COALESCE(o.hidden,0)=0
 ) SELECT e.player_id AS playerId,COALESCE(o.nickname_override,p.nickname) AS nickname,
  e.correct,e.total,e.completed_at AS completedAt
  FROM eligible e JOIN qfhq_players p ON p.player_id=e.player_id
  LEFT JOIN qfhq_hq_overrides o ON o.player_id=e.player_id
  WHERE e.attempt=1 AND e.total>0
  ORDER BY 1.0*e.correct/e.total DESC,e.correct DESC,e.completed_at ASC LIMIT 10`;
 try{return (await all(db,sql,[subject,subject,competition.start,competition.end])).map(r=>({
  nickname:r.nickname||'Player',correct:clamp(r.correct),total:clamp(r.total),completedAt:r.completedAt
 }))}catch(e){console.warn('Competition leaderboard unavailable',e);return []}
}
async function publicData(db){
 const [a,c]=await Promise.all([one(db,"SELECT value FROM qfhq_hq_settings WHERE key='v5_announcement'"),one(db,"SELECT value FROM qfhq_hq_settings WHERE key='v5_competition'")]);
 let announcement=parseSetting(a),competition=parseSetting(c);
 if(!announcement?.text||announcement.expiresAt&&Date.parse(announcement.expiresAt)<Date.now())announcement=null;
 if(!competition?.title)competition=null;
 const leaderboard=competition?await competitionBoard(db,competition):[];
 return {announcement,competition,leaderboard};
}
async function profileData(db,p){
 const [player,spent,owned,awards]=await Promise.all([
  one(db,`SELECT p.xp AS baseXp,COALESCE(o.xp_override,p.xp) AS xp,
    p.legacy_tests+p.tracked_tests AS games,p.perfect_runs AS perfect
    FROM qfhq_players p LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id WHERE p.player_id=?`,[p.player_id]),
  one(db,'SELECT COALESCE(SUM(cost),0) AS spent FROM qfhq_shop_purchases WHERE player_id=?',[p.player_id]),
  all(db,'SELECT item_id FROM qfhq_shop_purchases WHERE player_id=?',[p.player_id]),
  all(db,'SELECT badge_id FROM qfhq_awarded_badges WHERE player_id=?',[p.player_id])
 ]);
 const xp=clamp(player?.xp),games=clamp(player?.games),perfect=clamp(player?.perfect);
 const badges=awards.map(r=>r.badge_id).filter(id=>AWARDS.includes(id));
 if(games>=1)badges.push('first');if(games>=10)badges.push('ten');if(perfect>=1)badges.push('perfect');if(xp>=10000)badges.push('legend');
 return {playerId:p.player_id,nickname:p.nickname,avatar:p.avatar,color:p.color,
  frame:p.frame,title:p.title,favoriteBadge:p.favorite_badge,
  xp,games,perfect,spent:clamp(spent?.spent),balance:Math.max(0,xp-clamp(spent?.spent)),
  owned:owned.map(r=>r.item_id).filter(id=>Object.hasOwn(SHOP,id)),badges,
  shop:SHOP,badgeNames:BADGE_NAMES};
}
async function authenticate(db,x){
 if(!UUID.test(x.playerId||'')||!KEY.test(x.inboxKey||'')||!NAME.test(normalize(x.nickname)))return {error:'Enter a valid nickname to open your profile.',status:400};
 const nickname=normalize(x.nickname),keyHash=await hashKey(x.inboxKey);
 // One nickname per UUID, as in the existing v3 tracking system.
 const known=await one(db,`SELECT p.nickname,o.nickname_override FROM qfhq_players p
  LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id WHERE p.player_id=?`,[x.playerId]);
 if(known?.nickname&&canon(known.nickname)!==canon(nickname)&&canon(known.nickname_override)!==canon(nickname))
  return {error:'This player ID belongs to a different nickname.',status:409};
 await db.prepare(`INSERT OR IGNORE INTO qfhq_cosmetic_profiles(player_id,nickname,key_hash)
  VALUES (?,?,?)`).bind(x.playerId,nickname,keyHash).run();
 const p=await one(db,'SELECT * FROM qfhq_cosmetic_profiles WHERE player_id=?',[x.playerId]);
 if(!p||p.key_hash!==keyHash)return {error:'This profile was already linked to another browser key. Keep using the original app installation.',status:403};
 if(canon(p.nickname)!==canon(nickname))return {error:'That profile belongs to a different nickname.',status:409};
 return {p};
}
export async function onRequest({request,env}){
 try{
  if(!env?.DB?.prepare)return reply({ok:false,error:'Database unavailable'},503);
  const db=env.DB,url=new URL(request.url),method=request.method.toUpperCase();
  if(!['GET','POST'].includes(method))return reply({ok:false,error:'Method not allowed'},405);
  await ensure(db);
  if(method==='GET')return reply({ok:true,data:await publicData(db)});
  const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return reply({ok:false,error:'Origin not allowed'},403);
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({ok:false,error:'JSON required'},415);
  if(Number(request.headers.get('Content-Length')||0)>3000)return reply({ok:false,error:'Request too large'},413);
  const raw=await request.text();if(new TextEncoder().encode(raw).length>3000)return reply({ok:false,error:'Request too large'},413);
  let x;try{x=JSON.parse(raw)}catch{return reply({ok:false,error:'Invalid JSON'},400)}
  if(!x||typeof x!=='object'||Array.isArray(x)||!['load','buy','set'].includes(x.action))return reply({ok:false,error:'Invalid action'},400);
  const auth=await authenticate(db,x);if(auth.error)return reply({ok:false,error:auth.error},auth.status);
  const p=auth.p;
  if(x.action==='buy'){
   const item=SHOP[x.itemId];if(!item)return reply({ok:false,error:'Unknown shop item'},400);
   // A single conditional INSERT checks wallet balance and uniqueness atomically.
   // Total rank XP remains unchanged; only the spendable wallet is reduced.
   const result=await db.prepare(`INSERT OR IGNORE INTO qfhq_shop_purchases(player_id,item_id,cost)
    SELECT ?,?,? WHERE EXISTS (
     SELECT 1 FROM qfhq_players pl LEFT JOIN qfhq_hq_overrides ov ON ov.player_id=pl.player_id
     WHERE pl.player_id=? AND MAX(0,COALESCE(ov.xp_override,pl.xp)) -
      COALESCE((SELECT SUM(cost) FROM qfhq_shop_purchases WHERE player_id=?),0) >= ?
    )`).bind(p.player_id,x.itemId,item.cost,p.player_id,p.player_id,item.cost).run();
   if(!Number(result?.meta?.changes))return reply({ok:false,error:'Already owned, or not enough spendable XP.'},409);
  }else if(x.action==='set'){
   const field=x.field,value=x.value;
   if(!['avatar','color','frame','title','favoriteBadge'].includes(field)||typeof value!=='string')return reply({ok:false,error:'Invalid profile choice'},400);
   if(field==='avatar'&&!AVATARS.includes(value)||field==='color'&&!COLORS.includes(value))return reply({ok:false,error:'Invalid free choice'},400);
   if(field==='frame'||field==='title'){
    if(value!=='none'){
     const item=SHOP[value];if(!item||item.field!==field)return reply({ok:false,error:'Invalid cosmetic'},400);
     const owned=await one(db,'SELECT item_id FROM qfhq_shop_purchases WHERE player_id=? AND item_id=?',[p.player_id,value]);
     if(!owned)return reply({ok:false,error:'Buy this item first'},403);
    }
   }
   if(field==='favoriteBadge'){
    if(value!=='none'){
     const current=await profileData(db,p);
     if(!current.badges.includes(value))return reply({ok:false,error:'Badge not yet earned'},403);
    }
   }
   const col={avatar:'avatar',color:'color',frame:'frame',title:'title',favoriteBadge:'favorite_badge'}[field];
   await db.prepare(`UPDATE qfhq_cosmetic_profiles SET ${col}=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(value,p.player_id).run();
  }
  const updated=await one(db,'SELECT * FROM qfhq_cosmetic_profiles WHERE player_id=?',[p.player_id]);
  return reply({ok:true,data:await profileData(db,updated)});
 }catch(error){console.error('QUIZFORCE v5 profile error',error);return reply({ok:false,error:'Profile service unavailable. Try again.'},503)}
}
