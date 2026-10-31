/**
 * QUIZFORCE — private player-to-HQ messages.
 * Cloudflare Pages: GAME/functions/api/questions.js
 * Uses the SAME D1 binding (DB) as QUIZFORCE HQ. No HQ admin credentials here.
 * A random, per-player inbox key is generated and kept on the player's browser.
 * The server stores only its SHA-256 hash. Nicknames are NOT authentication.
 */
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const KEY = /^[0-9a-f]{64}$/i;
const NAME = /^[\p{L}\p{N}_ .-]{2,18}$/u;
const CATEGORIES = new Set(['Idea', 'Question', 'Bug report', 'Other']);
const MAX_BODY = 2500;
const respond = (data, status=200) => new Response(JSON.stringify(data), {status, headers:HEADERS});
const clean = x => String(x || '').normalize('NFC').trim().replace(/\s+/g, ' ');
const canonical = x => clean(x).toLocaleLowerCase('en');
const safeText = x => String(x || '').trim();
async function hashKey(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key.toLowerCase()));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_questions (
    question_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    inbox_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    reply TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    replied_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS qfhq_questions_inbox ON qfhq_questions (player_id,inbox_hash,created_at)').run();
}
export async function onRequestGet() { return respond({error:'Use the private inbox request'},405); }
export async function onRequestPost({request,env}) {
  try {
    if (!env?.DB || typeof env.DB.prepare !== 'function') return respond({error:'Messages are temporarily unavailable'},503);
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return respond({error:'Origin not allowed'},403);
    if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return respond({error:'JSON required'},415);
    if (Number(request.headers.get('Content-Length')||0) > MAX_BODY) return respond({error:'Message too large'},413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY) return respond({error:'Message too large'},413);
    let x;
    try { x=JSON.parse(raw); } catch { return respond({error:'Invalid message'},400); }
    if (!x || typeof x !== 'object' || Array.isArray(x) || !['send','inbox'].includes(x.action) || !UUID.test(x.playerId||'') || !KEY.test(x.inboxKey||'')) return respond({error:'Invalid player inbox'},400);
    const db=env.DB;
    await ensure(db);
    const inboxHash=await hashKey(x.inboxKey);
    if (x.action === 'inbox') {
      const rows = (await db.prepare(`SELECT question_id,category,message,reply,status,created_at,replied_at
        FROM qfhq_questions WHERE player_id=? AND inbox_hash=?
        ORDER BY created_at DESC, rowid DESC LIMIT 50`).bind(x.playerId,inboxHash).all()).results || [];
      return respond({ok:true,messages:rows.map(r=>({id:r.question_id,category:r.category,message:r.message,
        reply:r.reply||null,status:r.status,createdAt:r.created_at,repliedAt:r.replied_at}))});
    }
    const nickname=clean(x.nickname);
    const category=safeText(x.category);
    const message=safeText(x.message);
    if (!NAME.test(nickname)) return respond({error:'Use a nickname of 2–18 letters or numbers'},400);
    if (!CATEGORIES.has(category)) return respond({error:'Choose a message type'},400);
    if (message.length < 5 || message.length > 600) return respond({error:'Write between 5 and 600 characters'},400);
    if (/https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(message)) return respond({error:'Please do not include links or email addresses'},400);
    // Prevent a submitted score profile from being labelled with another person's nickname.
    const known = await db.prepare('SELECT nickname FROM qfhq_players WHERE player_id=?').bind(x.playerId).first();
    if (known?.nickname && canonical(known.nickname)!==canonical(nickname)) return respond({error:'That player profile belongs to a different nickname. Switch nicknames and try again.'},409);
    // Simple per-inbox anti-spam limits. For stronger public protection use Cloudflare rate limiting.
    const count = await db.prepare(`SELECT
      SUM(CASE WHEN created_at >= datetime('now','-1 hour') THEN 1 ELSE 0 END) AS hourly,
      COUNT(*) AS daily
      FROM qfhq_questions WHERE player_id=? AND inbox_hash=? AND created_at >= datetime('now','-1 day')`).bind(x.playerId,inboxHash).first();
    if (Number(count?.hourly||0) >= 5 || Number(count?.daily||0) >= 20) return respond({error:'You have sent a lot of messages. Please try again later.'},429);
    const id=crypto.randomUUID();
    await db.prepare(`INSERT INTO qfhq_questions (question_id,player_id,inbox_hash,nickname,category,message)
      VALUES (?,?,?,?,?,?)`).bind(id,x.playerId,inboxHash,nickname,category,message).run();
    return respond({ok:true,id},201);
  } catch(error) {
    console.error('QUIZFORCE private questions error:',error);
    return respond({error:'Could not contact HQ right now. Please try again.'},503);
  }
}
