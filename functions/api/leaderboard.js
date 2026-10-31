// QUIZFORCE Edition 12 — Cloudflare Pages Functions + D1 leaderboard.
// Put this file at /functions/api/leaderboard.js in the GitHub repository.
// In Cloudflare Pages > Settings > Bindings, bind the existing D1 database
// named quizforce-leaderboard with the variable name DB, then redeploy.

const SUBJECTS = new Set([
  'Mathematics', 'English', 'Afrikaans',
  'Natural Sciences', 'Social Sciences'
]);

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: HEADERS });

async function ensureLinks(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_public_score_links (
    score_id INTEGER PRIMARY KEY,
    player_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function getDB(context) {
  const db = context.env?.DB;
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Missing Cloudflare D1 binding DB');
  }
  return db;
}

export async function onRequestGet(context) {
  try {
    const db = getDB(context);
    await ensureLinks(db);
    // Only submissions made with Live Sync v2 have player/run IDs.
    // Older unlinked scores remain exactly as they were.
    const result = await db.prepare(`
      SELECT s.id, COALESCE(o.nickname_override,s.player_name) AS name,
        s.subject, COALESCE(c.correct_override,s.correct) AS correct,
        COALESCE(c.total_override,s.total) AS total,
        s.country, s.created_at AS at
      FROM scores s
      LEFT JOIN qfhq_public_score_links l ON l.score_id=s.id
      LEFT JOIN qfhq_hq_overrides o ON o.player_id=l.player_id
      LEFT JOIN qfhq_hq_run_corrections c ON c.run_id=l.run_id
      WHERE s.total > 0 AND COALESCE(o.hidden,0)=0
      ORDER BY s.id DESC
      LIMIT 1000
    `).all();

    const rows = (result.results || []).map(row => ({
      name: row.name,
      subject: row.subject,
      correct: Number(row.correct),
      total: Number(row.total),
      pct: Math.round(100 * Number(row.correct) / Number(row.total)),
      country: row.country || '',
      at: row.at || ''
    }));

    // Keep the highest percentages first, then reward longer tests.
    rows.sort((a, b) => b.pct - a.pct || b.total - a.total);

    const overall = rows.slice(0, 10);
    const bySubject = [...SUBJECTS].flatMap(subject =>
      rows.filter(row => row.subject === subject).slice(0, 10)
    );

    // Return the union so the existing front-end filters still work.
    const unique = new Map();
    for (const row of [...overall, ...bySubject]) {
      const key = [row.name.toLowerCase(), row.subject, row.correct, row.total].join('|');
      if (!unique.has(key)) unique.set(key, row);
    }
    return reply({ scores: [...unique.values()] });
  } catch (error) {
    console.error('QUIZFORCE leaderboard GET:', error);
    return reply({ error: 'Leaderboard temporarily unavailable' }, 503);
  }
}

export async function onRequestPost(context) {
  try {
    const db = getDB(context);
    const request = context.request;
    if (Number(request.headers.get('content-length') || 0) > 2048) {
      return reply({ error: 'Too much data' }, 413);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 2048) {
      return reply({ error: 'Too much data' }, 413);
    }
    let x;
    try {
      x = JSON.parse(raw);
    } catch {
      return reply({ error: 'Invalid data' }, 400);
    }
    if (!x || typeof x !== 'object' || Array.isArray(x)) {
      return reply({ error: 'Invalid data' }, 400);
    }
    const name = String(x.name || '').trim();
    const subject = String(x.subject || '');
    const total = Number(x.total);
    const correct = Number(x.correct);
    const pct = Number(x.pct);
    const country = String(x.country || '').trim().toUpperCase();

    if (
      !/^[\p{L}\p{N}_ .-]{2,18}$/u.test(name) ||
      !SUBJECTS.has(subject) ||
      !Number.isInteger(total) || total < 1 || total > 120 ||
      !Number.isInteger(correct) || correct < 0 || correct > total ||
      !Number.isInteger(pct) || pct !== Math.round(100 * correct / total) ||
      (country !== '' && !/^[A-Z]{2}$/.test(country))
    ) {
      return reply({ error: 'Invalid score or nickname' }, 400);
    }

    // Optional tracking link is created only for new QUIZFORCE submissions.
    const linked = x.playerId != null && x.runId != null;
    if (linked && (!UUID.test(x.playerId) || !UUID.test(x.runId))) {
      return reply({ error: 'Invalid HQ tracking reference' }, 400);
    }
    await ensureLinks(db);
    const inserted = await db.prepare(`
      INSERT INTO scores (player_name, subject, correct, total, country)
      VALUES (?, ?, ?, ?, ?)
    `).bind(name, subject, correct, total, country || null).run();
    const scoreId = inserted.meta?.last_row_id;
    if (linked && Number.isInteger(scoreId) && scoreId > 0) {
      // The run can still be queued locally when the player submits a score.
      // Link first; the HQ run correction joins when the run later arrives.
      await db.prepare(`INSERT OR IGNORE INTO qfhq_public_score_links
        (score_id,player_id,run_id) VALUES (?,?,?)`)
        .bind(scoreId,x.playerId,x.runId).run();
    }
    return reply({ ok: true, linked: Boolean(linked && scoreId) }, 201);
  } catch (error) {
    console.error('QUIZFORCE leaderboard POST:', error);
    return reply({ error: 'Leaderboard temporarily unavailable' }, 503);
  }
}
