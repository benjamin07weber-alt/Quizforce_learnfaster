
import { getStore } from '@netlify/blobs';

const SUBJECTS = new Set([
  'Mathematics',
  'English',
  'Afrikaans',
  'Natural Sciences',
  'Social Sciences'
]);

const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json'
};

const reply = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

export default async (request) => {
  try {
    const store = getStore('quizforce-global-scores');

    if (request.method === 'POST') {
      if (Number(request.headers.get('content-length') || 0) > 2048) {
        return reply({ error: 'Too much data' }, 413);
      }

      const raw = await request.text();
      if (raw.length > 2048) {
        return reply({ error: 'Too much data' }, 413);
      }

      let x;
      try {
        x = JSON.parse(raw);
      } catch {
        return reply({ error: 'Invalid data' }, 400);
      }

      const name = String(x.name || '').trim();
      const subject = String(x.subject || '');
      const total = Number(x.total);
      const correct = Number(x.correct);
      const pct = Number(x.pct);

      if (
        !/^[\p{L}\p{N}_ .-]{2,18}$/u.test(name) ||
        !SUBJECTS.has(subject) ||
        !Number.isInteger(total) ||
        total < 1 ||
        total > 120 ||
        !Number.isInteger(correct) ||
        correct < 0 ||
        correct > total ||
        !Number.isInteger(pct) ||
        pct !== Math.round(correct / total * 100)
      ) {
        return reply({ error: 'Invalid score or nickname' }, 400);
      }

      const record = {
        name,
        subject,
        total,
        correct,
        pct,
        at: new Date().toISOString()
      };

      await store.setJSON('score-' + crypto.randomUUID(), record);
      return reply({ ok: true }, 201);
    }

    if (request.method === 'GET') {
      const { blobs } = await store.list();

      const latest = blobs
        .filter(b => b.key.startsWith('score-'))
        .slice(-1000);

      const rows = (
        await Promise.all(
          latest.map(async b => {
            try {
              return await store.get(b.key, { type: 'json' });
            } catch {
              return null;
            }
          })
        )
      ).filter(Boolean);

      rows.sort((a, b) =>
        b.pct - a.pct || b.total - a.total
      );

      const overall = rows.slice(0, 10);

      const bySubject = Array.from(SUBJECTS).flatMap(s =>
        rows.filter(x => x.subject === s).slice(0, 10)
      );

      return reply({
        scores: [
          ...new Map(
            [...overall, ...bySubject].map((x, i) => [
              x.at + '-' + x.name + '-' + i,
              x
            ])
          ).values()
        ]
      });
    }

    return reply({ error: 'Method not allowed' }, 405);

  } catch (e) {
    return reply({
      error: 'Leaderboard temporarily unavailable'
    }, 503);
  }
};
