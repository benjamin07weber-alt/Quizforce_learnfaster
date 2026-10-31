/** QUIZFORCE v5.2 — worldwide nickname reservation.
 * A nickname is owned by one anonymous playerId + browser secret, not by
 * whichever device happens to type the name. All protected game writes
 * import requireClaim() so client-side checks cannot be bypassed.
 * Existing D1 binding: DB. No HQ password or new Cloudflare secret needed.
 */
const JSON_HEADERS={
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store, max-age=0',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'
};
const respond=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:JSON_HEADERS});
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const KEY=/^[0-9a-f]{64}$/i;
const NAME=/^[\p{L}\p{N}_ .-]{2,18}$/u;
const normalize=x=>String(x||'').normalize('NFC').trim().replace(/\s+/g,' ');
const canon=x=>normalize(x).toLocaleLowerCase('en');
async function hashSecret(key,prefix='qf5-profile:'){
 const bytes=new TextEncoder().encode(prefix+key.toLowerCase());
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function ensure(db){
 await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_nickname_claims (
  nickname_key TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  player_id TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 )`).run();
}
const first=(db,sql,...params)=>db.prepare(sql).bind(...params).first();
const all=async(db,sql)=>((await db.prepare(sql).all()).results||[]);

// Protect pre-v5.2 registered names too. Do not allow a stranger to claim
// Benno3 merely because the old account has not visited the updated app yet.
async function legacyOwners(db,key){
 const owners=new Set();
 const tables=[
  'SELECT player_id,nickname FROM qfhq_players WHERE nickname IS NOT NULL',
  'SELECT player_id,nickname FROM qfhq_cosmetic_profiles',
  'SELECT player_id,nickname_override AS nickname FROM qfhq_hq_overrides WHERE nickname_override IS NOT NULL'
 ];
 for(const sql of tables){
  try{for(const row of await all(db,sql))if(canon(row.nickname)===key)owners.add(row.player_id)}
  catch(e){if(!String(e).includes('no such table'))throw e}
 }
 return owners;
}

export async function requireClaim(db,nickname,playerId,inboxKey){
 const name=normalize(nickname);
 if(!NAME.test(name)||!UUID.test(playerId||'')||!KEY.test(inboxKey||''))
  return {ok:false,status:400,error:'Choose a valid registered nickname.'};
 await ensure(db);
 const row=await first(db,'SELECT player_id,key_hash FROM qfhq_nickname_claims WHERE nickname_key=?',canon(name));
 if(!row)return {ok:false,status:409,error:'Register this nickname on Home before using it.'};
 if(row.player_id!==playerId||row.key_hash!==await hashSecret(inboxKey))
  return {ok:false,status:409,error:'Nickname already taken on another profile. Choose your own nickname.'};
 return {ok:true};
}

async function register(db,nickname,playerId,inboxKey){
 const name=normalize(nickname),key=canon(name),hash=await hashSecret(inboxKey);
 await ensure(db);
 const claimed=await first(db,'SELECT player_id,key_hash FROM qfhq_nickname_claims WHERE nickname_key=?',key);
 if(claimed){
  if(claimed.player_id===playerId&&claimed.key_hash===hash)return {ok:true,nickname:name,playerId};
  return {ok:false,status:409,error:'Nickname already taken! Please choose another.'};
 }
 const already=await first(db,'SELECT nickname_key FROM qfhq_nickname_claims WHERE player_id=?',playerId);
 if(already)return {ok:false,status:409,error:'This player ID already owns a different nickname.'};
 const owners=await legacyOwners(db,key);
 if(owners.size>1)return {ok:false,status:409,error:'This nickname belongs to multiple older records. Ask the QUIZFORCE creator for help.'};
 if(owners.size===1&&!owners.has(playerId))return {ok:false,status:409,error:'Nickname already taken! Please choose another.'};
 // A preexisting player ID cannot be used to register a different name.
 const old=await first(db,'SELECT nickname FROM qfhq_players WHERE player_id=?',playerId);
 if(old?.nickname&&canon(old.nickname)!==key)
  return {ok:false,status:409,error:'This player profile already belongs to a different nickname.'};
 // Protect the original v5 cosmetic key and v4 private inbox for legacy users.
 const cosmetic=await first(db,'SELECT nickname,key_hash FROM qfhq_cosmetic_profiles WHERE player_id=?',playerId).catch(e=>{
  if(String(e).includes('no such table'))return null;throw e;
 });
 if(cosmetic){
  if(canon(cosmetic.nickname)!==key||cosmetic.key_hash!==hash)
   return {ok:false,status:403,error:'This nickname is protected by its original profile key.'};
 }
 const messageKeys=await (async()=>((await db.prepare('SELECT DISTINCT inbox_hash FROM qfhq_questions WHERE player_id=?').bind(playerId).all()).results||[]))().catch(e=>{
  if(String(e).includes('no such table'))return [];throw e;
 });
 if(messageKeys.length){
  const oldHash=await hashSecret(inboxKey,'');
  if(!messageKeys.some(row=>row.inbox_hash===oldHash))
   return {ok:false,status:403,error:'This nickname is protected by its original message inbox key.'};
 }
 // Unique PRIMARY KEY + UNIQUE(player_id) make simultaneous claims atomic.
 await db.prepare(`INSERT OR IGNORE INTO qfhq_nickname_claims
  (nickname_key,nickname,player_id,key_hash) VALUES (?,?,?,?)`).bind(key,name,playerId,hash).run();
 const result=await first(db,'SELECT player_id,key_hash FROM qfhq_nickname_claims WHERE nickname_key=?',key);
 if(result?.player_id!==playerId||result?.key_hash!==hash)
  return {ok:false,status:409,error:'Nickname already taken! Please choose another.'};
 // Registering creates a zero-game player in HQ. Old scores/XP are untouched.
 await db.prepare(`INSERT OR IGNORE INTO qfhq_players (player_id,nickname) VALUES (?,?)`).bind(playerId,name).run();
 return {ok:true,nickname:name,playerId};
}

export async function onRequestPost({request,env}){
 try{
  if(!env?.DB?.prepare)return respond({ok:false,error:'Nickname service unavailable'},503);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==new URL(request.url).origin)return respond({ok:false,error:'Origin not allowed'},403);
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return respond({ok:false,error:'JSON required'},415);
  if(Number(request.headers.get('Content-Length')||0)>1024)return respond({ok:false,error:'Request too large'},413);
  const raw=await request.text();if(new TextEncoder().encode(raw).length>1024)return respond({ok:false,error:'Request too large'},413);
  let x;try{x=JSON.parse(raw)}catch{return respond({ok:false,error:'Invalid JSON'},400)}
  if(x?.action!=='register'||!NAME.test(normalize(x.nickname))||!UUID.test(x.playerId||'')||!KEY.test(x.inboxKey||''))
   return respond({ok:false,error:'Choose a nickname of 2–18 letters or numbers.'},400);
  const result=await register(env.DB,x.nickname,x.playerId,x.inboxKey);
  return respond(result,result.ok?200:result.status);
 }catch(error){console.error('QUIZFORCE nickname registration error',error);return respond({ok:false,error:'Could not check nickname. Try again online.'},503)}
}
export async function onRequestGet(){return respond({ok:false,error:'Register through the app'},405)}
