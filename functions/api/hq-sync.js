// QUIZFORCE HQ Live Sync v2: PUBLIC READ-ONLY endpoint.
// Admin edits must be made only through the password-protected HQ site.
// This endpoint intentionally does not accept POST, passwords, or private game history.
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: HEADERS });
export async function onRequestGet({ request, env }) {
  try {
    if (!env?.DB || typeof env.DB.prepare !== 'function') return reply({ error: 'Database unavailable' }, 503);
    const db = env.DB;
    const url = new URL(request.url);
    const id = url.searchParams.get('playerId');
    if (id && !UUID.test(id)) return reply({ error: 'Invalid player ID' }, 400);
    // Admin tables are created by the HQ login function. IF NOT EXISTS is safe
    // if this endpoint is visited before the first HQ login.
    await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_hq_game_revisions (
      player_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
    // Cosmetics are optional. Create the table before the first profile visit
    // so existing leaderboard requests continue to work on fresh deployments.
    await db.prepare(`CREATE TABLE IF NOT EXISTS qfhq_cosmetic_profiles (
      player_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, key_hash TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '🚀', color TEXT NOT NULL DEFAULT 'cyan',
      frame TEXT NOT NULL DEFAULT 'none', title TEXT NOT NULL DEFAULT 'none',
      favorite_badge TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
    const player = id ? await db.prepare(`
      SELECT p.player_id, COALESCE(o.nickname_override,p.nickname) AS nickname,
        COALESCE(o.xp_override,p.xp) AS xp,
        CASE WHEN o.nickname_override IS NULL THEN 0 ELSE 1 END AS nickname_overridden,
        COALESCE(v.revision,0) AS revision, c.avatar,c.color,c.frame,c.title
      FROM qfhq_players p
      LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id
      LEFT JOIN qfhq_hq_game_revisions v ON v.player_id=p.player_id
      LEFT JOIN qfhq_cosmetic_profiles c ON c.player_id=p.player_id
      WHERE p.player_id=? LIMIT 1`).bind(id).first() : null;
    const rows = (await db.prepare(`
      SELECT COALESCE(o.nickname_override,p.nickname) AS nickname,
        COALESCE(o.xp_override,p.xp) AS xp,c.avatar,c.color,c.frame,c.title
      FROM qfhq_players p LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id
      LEFT JOIN qfhq_cosmetic_profiles c ON c.player_id=p.player_id
      WHERE COALESCE(o.hidden,0)=0
        AND COALESCE(o.nickname_override,p.nickname) IS NOT NULL
      ORDER BY xp DESC, p.tracked_tests DESC LIMIT 5`).all()).results || [];
    const featured = await db.prepare(`SELECT value FROM qfhq_hq_settings WHERE key='featured_player'`).first();
    let champion = null;
    if (featured?.value && UUID.test(featured.value)) {
      const f = await db.prepare(`
        SELECT COALESCE(o.nickname_override,p.nickname) AS nickname,
          COALESCE(o.xp_override,p.xp) AS xp,c.avatar,c.color,c.frame,c.title
        FROM qfhq_players p LEFT JOIN qfhq_hq_overrides o ON o.player_id=p.player_id
        LEFT JOIN qfhq_cosmetic_profiles c ON c.player_id=p.player_id
        WHERE p.player_id=? AND COALESCE(o.hidden,0)=0`).bind(featured.value).first();
      if (f?.nickname) champion = { nickname: String(f.nickname), xp: Number(f.xp) || 0, avatar:f.avatar||null,color:f.color||null,frame:f.frame||null,title:f.title||null, featured: true };
    }
    if (!champion && rows.length) champion = { nickname: String(rows[0].nickname), xp: Number(rows[0].xp) || 0, avatar:rows[0].avatar||null,color:rows[0].color||null,frame:rows[0].frame||null,title:rows[0].title||null, featured: false };
    return reply({ ok: true,
      player: player ? { nickname: player.nickname || null, xp: Number(player.xp) || 0,
        nicknameOverridden: Boolean(player.nickname_overridden), revision: Number(player.revision) || 0,
        avatar:player.avatar||null,color:player.color||null,frame:player.frame||null,title:player.title||null } : null,
      champion,
      leaders: rows.map(r => ({ nickname: String(r.nickname), xp: Number(r.xp) || 0,
        avatar:r.avatar||null,color:r.color||null,frame:r.frame||null,title:r.title||null }))
    });
  } catch (error) {
    console.error('QUIZFORCE HQ public sync error:', error);
    return reply({ error: 'HQ sync temporarily unavailable' }, 503);
  }
}
export async function onRequestPost() { return reply({ error: 'Read only' }, 405); }
