// QUIZFORCE HQ — Cloudflare Pages Function, private statistics write endpoint.
// Deploy as functions/api/hq-track.js. Requires the existing D1 binding DB
// and qfhq_setup.sql run once on the same D1 database.
// No public GET endpoint: a future HQ dashboard must use authenticated reads.
const SUBJECTS=new Set(['Mathematics','English','Afrikaans','Natural Sciences','Social Sciences']);
const DIFFICULTIES=new Set(['easy','medium','hard']);
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
function rank(xp){return xp>=10000?5:xp>=6000?4:xp>=3000?3:xp>=1500?2:xp>=500?1:0}
export async function onRequestGet(){return respond({error:'HQ statistics are private'},405)}
export async function onRequestPost({request,env}){
 try{
  if(!env?.DB||typeof env.DB.prepare!=='function')return respond({error:'D1 database not configured'},503);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return respond({error:'Origin not allowed'},403);
  if(Number(request.headers.get('content-length')||0)>4096)return respond({error:'Payload too large'},413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>4096)return respond({error:'Payload too large'},413);
  let x;
  try{x=JSON.parse(raw)}catch{return respond({error:'Invalid JSON'},400)}
  if(!x||typeof x!=='object'||Array.isArray(x)||x.version!==1||!['sync','complete'].includes(x.type)||!uuid.test(x.playerId||''))return respond({error:'Invalid tracking event'},400);
  // An edit revision is assigned by HQ and applied locally before a player
  // reports it. A stale queued test must not undo a newer HQ correction.
  const syncRevision=x.syncRevision===undefined?0:x.syncRevision;
  if(!int(syncRevision,0,1000000000))return respond({error:'Invalid sync revision'},400);
  const p=x.progress;
  if(!p||typeof p!=='object'||!int(p.xp,0,100000000)||!int(p.tests,0,100000000)||!int(p.perfectRuns,0,100000000)||p.perfectRuns>p.tests)return respond({error:'Invalid progress'},400);
  const nick=x.nickname==null?null:String(x.nickname).trim();
  if(nick!==null&&!/^[\p{L}\p{N}_ .-]{2,18}$/u.test(nick))return respond({error:'Invalid nickname'},400);
  const isRun=x.type==='complete';
  if(isRun&&(!uuid.test(x.runId||'')||!SUBJECTS.has(x.subject)||!DIFFICULTIES.has(x.difficulty)||!int(x.correct,0,120)||!int(x.total,1,120)||x.correct>x.total||typeof x.speedrun!=='boolean'||!int(x.earnedXp,0,1000)||p.tests<1))return respond({error:'Invalid completed test'},400);
  // Pretracking tests are the local tests that happened before this event.
  // Distinct run IDs prevent double counting on retries, and SQL counts actual rows.
  const priorTests=Math.max(0,p.tests-(isRun?1:0));
  const db=env.DB;
  // A player ID is permanently associated with its first submitted nickname.
  // A different nickname must use a NEW player ID, even on the same device.
  // This prevents old clients or queued events from silently merging players.
  if(nick){
   await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_hq_overrides (
     player_id TEXT PRIMARY KEY, nickname_override TEXT, xp_override INTEGER,
     hidden INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`).run();
   const prior=await db.prepare(`SELECT p.nickname, o.nickname_override FROM qfhq_players p
     LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id
     WHERE p.player_id=?`).bind(x.playerId).first();
   const canonical=n=>String(n||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
   if(prior?.nickname&&canonical(prior.nickname)!==canonical(nick)&&canonical(prior.nickname_override)!==canonical(nick))
    return respond({error:'A different nickname needs a separate player profile'},409);
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_hq_game_revisions (
    player_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`
    INSERT INTO qfhq_players (player_id,nickname,xp,legacy_tests,perfect_runs,rank_index)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(player_id) DO UPDATE SET
      nickname=COALESCE(excluded.nickname,qfhq_players.nickname),
      xp=MAX(qfhq_players.xp,excluded.xp),
      legacy_tests=MAX(qfhq_players.legacy_tests,excluded.legacy_tests-qfhq_players.tracked_tests),
      perfect_runs=MAX(qfhq_players.perfect_runs,excluded.perfect_runs),
      rank_index=MAX(qfhq_players.rank_index,excluded.rank_index),
      updated_at=CURRENT_TIMESTAMP
  `).bind(x.playerId,nick,p.xp,priorTests,p.perfectRuns,rank(p.xp)).run();
  // If the client has actually applied the current HQ XP edit, let new XP
  // earned in the game increase the edited total (without bumping revision).
  // Older queued events and clients without the edit cannot overwrite it.
  if(syncRevision>0){
   await db.prepare(`UPDATE qfhq_hq_overrides SET
      xp_override=MAX(xp_override,?), updated_at=CURRENT_TIMESTAMP
      WHERE player_id=? AND xp_override IS NOT NULL
      AND EXISTS (SELECT 1 FROM qfhq_hq_game_revisions v
                  WHERE v.player_id=? AND v.revision=?)`)
     .bind(p.xp,x.playerId,x.playerId,syncRevision).run();
  }
  if(isRun){
   await db.prepare(`INSERT OR IGNORE INTO qfhq_runs
     (run_id,player_id,subject,difficulty,correct,total,speedrun,earned_xp)
     VALUES (?,?,?,?,?,?,?,?)`).bind(x.runId,x.playerId,x.subject,x.difficulty,x.correct,x.total,x.speedrun?1:0,x.earnedXp).run();
   await db.prepare(`UPDATE qfhq_players SET
      tracked_tests=(SELECT COUNT(*) FROM qfhq_runs WHERE player_id=?),
      updated_at=CURRENT_TIMESTAMP WHERE player_id=?`).bind(x.playerId,x.playerId).run();
  }
  return respond({ok:true},isRun?201:200);
 }catch(error){
  console.error('QUIZFORCE HQ tracking error',error);
  return respond({error:'HQ tracking unavailable; try again later'},503);
 }
}
