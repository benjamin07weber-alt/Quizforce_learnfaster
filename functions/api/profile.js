import {requireClaim} from './nickname.js';
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
const AVATARS=['🦁','🚀','🦊','🐯','🦄','🤖','🐼','🦉','🐬','🐉','🦋','🦖','🐺','🐸','🐙','🦈','🐲','🦅','🐱','🐶','🦇','👽','👾','🧑‍🚀','🛸','🌙','⭐','⚡','💎','🪐','🔥'];
const COLORS=['cyan','violet','blue','green','orange','pink','red','yellow','mint','indigo','coral','silver'];
const SHOP=Object.freeze({
 "blue_frame":{"name": "🔵 Blue Border", "cost": 100, "field": "frame", "category": "Frames", "rarity": "Common", "description": "A cool electric-blue outline."},
 "fire_frame":{"name": "🔥 Fire Frame", "cost": 250, "field": "frame", "category": "Frames", "rarity": "Rare", "description": "A fiery glow around your avatar."},
 "galaxy_frame":{"name": "🌌 Galactic Frame", "cost": 1000, "field": "frame", "category": "Frames", "rarity": "Epic", "description": "Deep-space purple and blue."},
 "neon_frame":{"name": "💚 Neon Frame", "cost": 350, "field": "frame", "category": "Frames", "rarity": "Rare", "description": "An intense neon-green glow."},
 "ice_frame":{"name": "❄️ Ice Frame", "cost": 450, "field": "frame", "category": "Frames", "rarity": "Rare", "description": "Frosty blue crystal energy."},
 "rainbow_frame":{"name": "🌈 Rainbow Frame", "cost": 850, "field": "frame", "category": "Frames", "rarity": "Epic", "description": "A colourful animated border."},
 "diamond_frame":{"name": "💎 Diamond Frame", "cost": 1400, "field": "frame", "category": "Frames", "rarity": "Legendary", "description": "Shimmering diamond-blue shine."},
 "solar_frame":{"name": "☀️ Solar Frame", "cost": 2000, "field": "frame", "category": "Frames", "rarity": "Legendary", "description": "A golden solar halo."},
 "gold_name":{"name": "👑 Golden Name", "cost": 500, "field": "title", "category": "Titles", "rarity": "Epic", "description": "The original golden-name upgrade."},
 "captain_title":{"name": "🧑‍🚀 Space Captain", "cost": 300, "field": "title", "category": "Titles", "rarity": "Rare", "description": "Show your captain title."},
 "wizard_title":{"name": "🪄 Quiz Wizard", "cost": 450, "field": "title", "category": "Titles", "rarity": "Rare", "description": "A magical quiz-master title."},
 "speedster_title":{"name": "⚡ Speedster", "cost": 600, "field": "title", "category": "Titles", "rarity": "Epic", "description": "Made for lightning-fast minds."},
 "genius_title":{"name": "🧠 Cosmic Genius", "cost": 1100, "field": "title", "category": "Titles", "rarity": "Epic", "description": "The genius of the galaxy."},
 "legend_title":{"name": "🌠 Galactic Legend", "cost": 1800, "field": "title", "category": "Titles", "rarity": "Legendary", "description": "The ultimate space legend."},
 "banner_stars":{"name": "✨ Starfield", "cost": 120, "field": "banner", "category": "Banners", "rarity": "Common", "description": "A sparkling night-sky backdrop."},
 "banner_ocean":{"name": "🌊 Ocean Waves", "cost": 200, "field": "banner", "category": "Banners", "rarity": "Common", "description": "A bright ocean-blue profile."},
 "banner_sunset":{"name": "🌅 Sunset", "cost": 300, "field": "banner", "category": "Banners", "rarity": "Rare", "description": "A warm pink-and-orange sunset."},
 "banner_nebula":{"name": "🌌 Nebula", "cost": 650, "field": "banner", "category": "Banners", "rarity": "Epic", "description": "A purple cosmic nebula."},
 "banner_aurora":{"name": "🌈 Aurora", "cost": 900, "field": "banner", "category": "Banners", "rarity": "Epic", "description": "A glowing northern-lights sky."},
 "banner_gold":{"name": "🏆 Gold Rush", "cost": 1300, "field": "banner", "category": "Banners", "rarity": "Legendary", "description": "A premium gold profile background."},
 "flair_sparkles":{"name": "✨ Sparkles", "cost": 100, "field": "flair", "category": "Flair", "rarity": "Common", "description": "Floating sparkles beside your name."},
 "flair_lightning":{"name": "⚡ Lightning", "cost": 240, "field": "flair", "category": "Flair", "rarity": "Rare", "description": "Electric energy beside your name."},
 "flair_comet":{"name": "☄️ Comet", "cost": 390, "field": "flair", "category": "Flair", "rarity": "Rare", "description": "A blazing comet name decoration."},
 "flair_crown":{"name": "👑 Crown", "cost": 750, "field": "flair", "category": "Flair", "rarity": "Epic", "description": "Show a royal crown."},
 "flair_dragon":{"name": "🐉 Dragon", "cost": 1250, "field": "flair", "category": "Flair", "rarity": "Legendary", "description": "A legendary dragon companion."},
 "style_neon":{"name": "💚 Neon Text", "cost": 200, "field": "nameStyle", "category": "Name styles", "rarity": "Common", "description": "Your nickname lights up in neon."},
 "style_ice":{"name": "🧊 Ice Text", "cost": 320, "field": "nameStyle", "category": "Name styles", "rarity": "Rare", "description": "Icy blue lettering."},
 "style_glow":{"name": "✨ Glow Text", "cost": 420, "field": "nameStyle", "category": "Name styles", "rarity": "Rare", "description": "A bright glowing nickname."},
 "style_rainbow":{"name": "🌈 Rainbow Text", "cost": 720, "field": "nameStyle", "category": "Name styles", "rarity": "Epic", "description": "A shifting rainbow name."},
 "style_gold":{"name": "🏅 Gold Text", "cost": 950, "field": "nameStyle", "category": "Name styles", "rarity": "Epic", "description": "A rich golden name effect."},
 "style_fire":{"name": "🔥 Fire Text", "cost": 1200, "field": "nameStyle", "category": "Name styles", "rarity": "Legendary", "description": "A blazing orange nickname."},
 "sound_retro":{"name": "🕹️ Retro Beeps", "cost": 180, "field": "soundPack", "category": "Sound packs", "rarity": "Common", "description": "Old-school arcade sound effects"},
 "sound_arcade":{"name": "🎮 Arcade Boost", "cost": 420, "field": "soundPack", "category": "Sound packs", "rarity": "Rare", "description": "Bouncy game-show tones"},
 "sound_space":{"name": "🛸 Space Signals", "cost": 750, "field": "soundPack", "category": "Sound packs", "rarity": "Epic", "description": "Spacey sci-fi sound effects"},
 "sound_stadium":{"name": "📣 Stadium Roar", "cost": 1150, "field": "soundPack", "category": "Sound packs", "rarity": "Epic", "description": "Extra-big cheering and applause"},
 "aura_spark":{"name": "✨ Spark Aura", "cost": 320, "field": "profileEffect", "category": "Auras", "rarity": "Rare", "description": "A gentle sparkling profile glow"},
 "aura_neon":{"name": "💚 Neon Aura", "cost": 680, "field": "profileEffect", "category": "Auras", "rarity": "Epic", "description": "A vibrant neon profile glow"},
 "aura_ice":{"name": "❄️ Frost Aura", "cost": 980, "field": "profileEffect", "category": "Auras", "rarity": "Epic", "description": "An icy halo for your avatar"},
 "aura_gold":{"name": "🏅 Golden Aura", "cost": 1550, "field": "profileEffect", "category": "Auras", "rarity": "Legendary", "description": "Shimmering golden light around your profile"},
 "secret_meteor_frame":{"name": "☄️ Meteor Frame", "cost": 650, "field": "frame", "category": "Secret Vault", "rarity": "Rare", "description": "A blazing meteor trail around your avatar", "unlockLevel": 3, "secret": true},
 "secret_moon_banner":{"name": "🌙 Moon Base", "cost": 650, "field": "banner", "category": "Secret Vault", "rarity": "Rare", "description": "A secret lunar profile background", "unlockLevel": 3, "secret": true},
 "secret_shadow_name":{"name": "🥷 Shadow Name", "cost": 950, "field": "nameStyle", "category": "Secret Vault", "rarity": "Epic", "description": "A mysterious dark-violet nickname effect", "unlockLevel": 5, "secret": true},
 "secret_rocket_flair":{"name": "🚀 Rocket Buddy", "cost": 1200, "field": "flair", "category": "Secret Vault", "rarity": "Epic", "description": "A tiny rocket beside your name", "unlockLevel": 5, "secret": true},
 "secret_star_title":{"name": "🌟 Star Commander", "cost": 1450, "field": "title", "category": "Secret Vault", "rarity": "Epic", "description": "Become a commander of the stars", "unlockLevel": 8, "secret": true},
 "secret_supernova_banner":{"name": "💥 Supernova", "cost": 1800, "field": "banner", "category": "Secret Vault", "rarity": "Legendary", "description": "An explosive stellar background", "unlockLevel": 8, "secret": true},
 "secret_cosmic_sound":{"name": "🪐 Cosmic Choir", "cost": 1600, "field": "soundPack", "category": "Secret Vault", "rarity": "Legendary", "description": "Ethereal chimes and a galactic victory sound", "unlockLevel": 10, "secret": true},
 "secret_dragon_aura":{"name": "🐉 Dragon Aura", "cost": 1950, "field": "profileEffect", "category": "Secret Vault", "rarity": "Legendary", "description": "A fiery dragon-coloured aura", "unlockLevel": 10, "secret": true},
 "secret_blackhole_frame":{"name": "🕳️ Black Hole", "cost": 2200, "field": "frame", "category": "Secret Vault", "rarity": "Mythic", "description": "A swirling dark-matter frame", "unlockLevel": 12, "secret": true},
 "secret_nova_name":{"name": "🌠 Nova Name", "cost": 2450, "field": "nameStyle", "category": "Secret Vault", "rarity": "Mythic", "description": "A pulsating cosmic name effect", "unlockLevel": 12, "secret": true},
 "secret_phoenix_flair":{"name": "🦅 Phoenix Buddy", "cost": 2700, "field": "flair", "category": "Secret Vault", "rarity": "Mythic", "description": "A rare phoenix companion", "unlockLevel": 15, "secret": true},
 "secret_crystal_aura":{"name": "💠 Crystal Aura", "cost": 2900, "field": "profileEffect", "category": "Secret Vault", "rarity": "Mythic", "description": "A sparkling crystal halo", "unlockLevel": 15, "secret": true},
 "secret_celestial_banner":{"name": "🌌 Celestial Gate", "cost": 3300, "field": "banner", "category": "Secret Vault", "rarity": "Mythic", "description": "Open a portal into deep space", "unlockLevel": 20, "secret": true},
 "secret_legendary_sound":{"name": "🎺 Royal Fanfare", "cost": 3600, "field": "soundPack", "category": "Secret Vault", "rarity": "Mythic", "description": "A champion-only victory fanfare", "unlockLevel": 20, "secret": true},
 "secret_titan_title":{"name": "👑 Cosmic Titan", "cost": 4100, "field": "title", "category": "Secret Vault", "rarity": "Mythic", "description": "A title reserved for elite players", "unlockLevel": 25, "secret": true},
 "secret_plasma_frame":{"name": "⚛️ Plasma Core", "cost": 4400, "field": "frame", "category": "Secret Vault", "rarity": "Mythic", "description": "A glowing plasma energy frame", "unlockLevel": 25, "secret": true},
 "secret_rainbow_aura":{"name": "🌈 Prism Aura", "cost": 4800, "field": "profileEffect", "category": "Secret Vault", "rarity": "Mythic", "description": "A shifting rainbow aura", "unlockLevel": 30, "secret": true},
 "secret_quantum_name":{"name": "🔮 Quantum Name", "cost": 5200, "field": "nameStyle", "category": "Secret Vault", "rarity": "Mythic", "description": "A shimmering rainbow-violet nickname", "unlockLevel": 30, "secret": true},
 "secret_eternal_banner":{"name": "♾️ Eternal Universe", "cost": 6000, "field": "banner", "category": "Secret Vault", "rarity": "Mythic", "description": "The rarest cosmic horizon", "unlockLevel": 40, "secret": true},
 "secret_hyperdrive_sound":{"name": "🚀 Hyperdrive Sound", "cost": 6400, "field": "soundPack", "category": "Secret Vault", "rarity": "Mythic", "description": "An ultra-rare sci-fi victory soundtrack", "unlockLevel": 40, "secret": true},
 "secret_omega_frame":{"name": "🌟 Omega Frame", "cost": 7500, "field": "frame", "category": "Secret Vault", "rarity": "Mythic", "description": "The ultimate champion frame", "unlockLevel": 50, "secret": true},
 "secret_omega_title":{"name": "🏆 QUIZFORCE Omega", "cost": 8000, "field": "title", "category": "Secret Vault", "rarity": "Mythic", "description": "The rarest title in the galaxy", "unlockLevel": 50, "secret": true}
});
const AWARDS=['founder','helper','star','champion'];
const SUBJECTS=['none','Mathematics','English','Afrikaans','Natural Sciences','Social Sciences'];
const RANKS=[{at:1,name:'Space Cadet'},{at:5,name:'Star Explorer'},{at:10,name:'Star Pilot'},{at:20,name:'Galactic Champion'},{at:35,name:'Cosmic Legend'},{at:50,name:'QUIZFORCE Omega'}];
const levelStart=n=>200*(n-1)+25*(n-1)*(n-2);
function getLevel(xp){let number=1;while(number<100&&xp>=levelStart(number+1))number++;const currentXp=levelStart(number),nextXp=levelStart(number+1);return {number,rank:RANKS.filter(r=>r.at<=number).at(-1).name,currentXp,nextXp,earned:xp-currentXp,needed:nextXp-currentXp,percent:Math.max(0,Math.min(100,Math.floor(100*(xp-currentXp)/(nextXp-currentXp))))}}
const SHOP_COUNT=Object.keys(SHOP).length;
const BADGE_NAMES={first:'🚀 First Launch',ten:'🎯 Ten Tests',perfect:'💯 Perfect Score',legend:'👑 Galactic Legend',level5:'🌟 Star Explorer',level10:'🚀 Star Pilot',level20:'🏆 Galactic Champion',level30:'💎 Cosmic Master',founder:'🌟 Founder',helper:'💡 Helpful Hero',star:'⭐ Star Player',champion:'🏆 HQ Champion'};
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
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_cosmetic_extras (
  player_id TEXT PRIMARY KEY, banner TEXT NOT NULL DEFAULT 'none',
  flair TEXT NOT NULL DEFAULT 'none', name_style TEXT NOT NULL DEFAULT 'none',
  motto TEXT NOT NULL DEFAULT '', celebration TEXT NOT NULL DEFAULT 'confetti',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_profile_settings (
  player_id TEXT PRIMARY KEY, sound_pack TEXT NOT NULL DEFAULT 'classic',
  profile_effect TEXT NOT NULL DEFAULT 'none',
  favourite_subject TEXT NOT NULL DEFAULT 'none',
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
 const [player,spent,owned,awards,extras,settings,best]=await Promise.all([
  one(db,`SELECT p.xp AS baseXp,COALESCE(o.xp_override,p.xp) AS xp,
    p.legacy_tests+p.tracked_tests AS games,p.perfect_runs AS perfect
    FROM qfhq_players p LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id WHERE p.player_id=?`,[p.player_id]),
  one(db,'SELECT COALESCE(SUM(cost),0) AS spent FROM qfhq_shop_purchases WHERE player_id=?',[p.player_id]),
  all(db,'SELECT item_id FROM qfhq_shop_purchases WHERE player_id=?',[p.player_id]),
  all(db,'SELECT badge_id FROM qfhq_awarded_badges WHERE player_id=?',[p.player_id]),
  one(db,'SELECT banner,flair,name_style AS nameStyle,motto,celebration FROM qfhq_cosmetic_extras WHERE player_id=?',[p.player_id]),
  one(db,'SELECT sound_pack AS soundPack,profile_effect AS profileEffect,favourite_subject AS favouriteSubject FROM qfhq_profile_settings WHERE player_id=?',[p.player_id]),
  one(db,'SELECT COALESCE(MAX(CASE WHEN total>0 THEN ROUND(100.0*correct/total) ELSE 0 END),0) AS bestPct FROM qfhq_runs WHERE player_id=?',[p.player_id]).catch(()=>null)
 ]);
 const xp=clamp(player?.xp),games=clamp(player?.games),perfect=clamp(player?.perfect);
 const level=getLevel(xp);
 const badges=awards.map(r=>r.badge_id).filter(id=>AWARDS.includes(id));
 if(games>=1)badges.push('first');if(games>=10)badges.push('ten');if(perfect>=1)badges.push('perfect');if(xp>=10000)badges.push('legend');
 if(level.number>=5)badges.push('level5');if(level.number>=10)badges.push('level10');if(level.number>=20)badges.push('level20');if(level.number>=30)badges.push('level30');
 return {playerId:p.player_id,nickname:p.nickname,avatar:p.avatar,color:p.color,
  frame:p.frame,title:p.title,favoriteBadge:p.favorite_badge,
  banner:extras?.banner||'none',flair:extras?.flair||'none',nameStyle:extras?.nameStyle||'none',
  motto:extras?.motto||'',celebration:extras?.celebration||'confetti',
  soundPack:settings?.soundPack||'classic',profileEffect:settings?.profileEffect||'none',favouriteSubject:settings?.favouriteSubject||'none',level,
  xp,games,perfect,bestPct:clamp(best?.bestPct),spent:clamp(spent?.spent),balance:Math.max(0,xp-clamp(spent?.spent)),
  owned:owned.map(r=>r.item_id).filter(id=>Object.hasOwn(SHOP,id)),badges,
  shop:Object.fromEntries(Object.entries(SHOP).map(([id,item])=>{
   const isOwned=owned.some(r=>r.item_id===id),locked=Boolean(item.secret&&level.number<item.unlockLevel&&!isOwned);
   return [id,locked?{name:'🔒 Mystery Upgrade',description:'A secret cosmetic. Reach the required level to reveal it!',cost:item.cost,field:item.field,category:item.category,rarity:'???',secret:true,unlockLevel:item.unlockLevel,locked:true}:{...item,locked:false}];
  })),shopCount:SHOP_COUNT,secretCount:Object.values(SHOP).filter(item=>item.secret).length,
  nextSecretLevel:Math.min(...Object.values(SHOP).filter(item=>item.secret&&item.unlockLevel>level.number).map(item=>item.unlockLevel),Infinity),badgeNames:BADGE_NAMES};
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
  const ownership=await requireClaim(db,x.nickname,x.playerId,x.inboxKey);
  if(!ownership.ok)return reply({ok:false,error:ownership.error},ownership.status);
  const auth=await authenticate(db,x);if(auth.error)return reply({ok:false,error:auth.error},auth.status);
  const p=auth.p;
  if(x.action==='buy'){
   const item=SHOP[x.itemId];if(!item)return reply({ok:false,error:'Unknown shop item'},400);
   if(item.secret){const player=await one(db,`SELECT COALESCE(o.xp_override,p.xp) AS xp FROM qfhq_players p LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id WHERE p.player_id=?`,[p.player_id]);
    if(getLevel(clamp(player?.xp)).number<item.unlockLevel)return reply({ok:false,error:`Unlocks at Level ${item.unlockLevel}. Keep earning XP!`},403);
   }
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
   if(!['avatar','color','frame','title','favoriteBadge','banner','flair','nameStyle','motto','celebration','soundPack','profileEffect','favouriteSubject'].includes(field)||typeof value!=='string')return reply({ok:false,error:'Invalid profile choice'},400);
   if(field==='avatar'&&!AVATARS.includes(value)||field==='color'&&!COLORS.includes(value))return reply({ok:false,error:'Invalid free choice'},400);
   if(field==='motto'){
    if(value.length>48||/[\x00-\x1F\x7F]/.test(value))return reply({ok:false,error:'Motto must be 48 characters or fewer, on one line.'},400);
    await db.prepare(`INSERT OR IGNORE INTO qfhq_cosmetic_extras(player_id) VALUES (?)`).bind(p.player_id).run();
    await db.prepare(`UPDATE qfhq_cosmetic_extras SET motto=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(value.trim(),p.player_id).run();
   }else if(field==='celebration'){
    if(!['confetti','stars','fireworks','none'].includes(value))return reply({ok:false,error:'Invalid celebration style'},400);
    await db.prepare(`INSERT OR IGNORE INTO qfhq_cosmetic_extras(player_id) VALUES (?)`).bind(p.player_id).run();
    await db.prepare(`UPDATE qfhq_cosmetic_extras SET celebration=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(value,p.player_id).run();
   }else if(field==='favouriteSubject'){
    if(!SUBJECTS.includes(value))return reply({ok:false,error:'Choose a valid subject'},400);
    await db.prepare('INSERT OR IGNORE INTO qfhq_profile_settings(player_id) VALUES (?)').bind(p.player_id).run();
    await db.prepare('UPDATE qfhq_profile_settings SET favourite_subject=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?').bind(value,p.player_id).run();
   }else if(['frame','title','banner','flair','nameStyle','soundPack','profileEffect'].includes(field)){
    if(value!==(field==='soundPack'?'classic':'none')){
     const item=SHOP[value];if(!item||item.field!==field)return reply({ok:false,error:'Invalid cosmetic'},400);
     const owned=await one(db,'SELECT item_id FROM qfhq_shop_purchases WHERE player_id=? AND item_id=?',[p.player_id,value]);
     if(!owned)return reply({ok:false,error:'Buy this item first'},403);
    }
    if(['frame','title'].includes(field)){
     await db.prepare(`UPDATE qfhq_cosmetic_profiles SET ${field}=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(value,p.player_id).run();
    }else if(['soundPack','profileEffect'].includes(field)){
     const col=field==='soundPack'?'sound_pack':'profile_effect';
     await db.prepare('INSERT OR IGNORE INTO qfhq_profile_settings(player_id) VALUES (?)').bind(p.player_id).run();
     await db.prepare(`UPDATE qfhq_profile_settings SET ${col}=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(value,p.player_id).run();
    }else{
     const col={banner:'banner',flair:'flair',nameStyle:'name_style'}[field];
     await db.prepare(`INSERT OR IGNORE INTO qfhq_cosmetic_extras(player_id) VALUES (?)`).bind(p.player_id).run();
     await db.prepare(`UPDATE qfhq_cosmetic_extras SET ${col}=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(value,p.player_id).run();
    }
   }else if(field==='favoriteBadge'){
    if(value!=='none'){
     const current=await profileData(db,p);
     if(!current.badges.includes(value))return reply({ok:false,error:'Badge not yet earned'},403);
    }
    await db.prepare(`UPDATE qfhq_cosmetic_profiles SET favorite_badge=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(value,p.player_id).run();
   }else{
    await db.prepare(`UPDATE qfhq_cosmetic_profiles SET ${field}=?,updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(value,p.player_id).run();
   }
  }
  const updated=await one(db,'SELECT * FROM qfhq_cosmetic_profiles WHERE player_id=?',[p.player_id]);
  return reply({ok:true,data:await profileData(db,updated)});
 }catch(error){console.error('QUIZFORCE v5 profile error',error);return reply({ok:false,error:'Profile service unavailable. Try again.'},503)}
}
