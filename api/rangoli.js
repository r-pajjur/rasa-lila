/**
 * Petal Mandala's storage, on Upstash Redis (added to the project from the Vercel Marketplace).
 *   GET  /api/rangoli/?action=state&since=N   entries numbered after N, in small batches
 *   POST /api/rangoli/?action=submit          { name, image }  -> { n }
 *   POST /api/rangoli/?action=check|reset     X-Admin-Password header
 * Every key expires two weeks after the last submission, so nothing outlives the event.
 */
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_PASSWORD = process.env.RANGOLI_ADMIN_PASSWORD;

const COUNT = 'rangoli:count';
const PIECE = 'rangoli:piece:';
const TTL = 60 * 60 * 24 * 14;
const BATCH = 10;                       // keeps each response well under Vercel's size limit
const MAX_IMAGE = 900_000;              // a 480px PNG data URL is usually 30–250 KB

// numbering and saving happen in one step, so two people can never get the same place
const SUBMIT = `
local n = redis.call('INCR', KEYS[1])
redis.call('SET', '${PIECE}' .. n, ARGV[1], 'EX', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return n`;

const RESET = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
for i = 1, n do redis.call('DEL', '${PIECE}' .. i) end
redis.call('DEL', KEYS[1])
return n`;

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function fail(res, status, error) {
  res.status(status).json({ error });
}

function isAdmin(req) {
  return Boolean(ADMIN_PASSWORD) && req.headers['x-admin-password'] === ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) {
    fail(res, 503, 'The mandala’s storage isn’t connected yet.');
    return;
  }
  const action = String(req.query.action || '');

  try {
    if (action === 'state' && req.method === 'GET') {
      const since = Math.max(0, parseInt(req.query.since, 10) || 0);
      const count = parseInt(await redis(['GET', COUNT]), 10) || 0;
      const last = Math.min(count, since + BATCH);
      const entries = [];
      if (last > since) {
        const keys = [];
        for (let n = since + 1; n <= last; n++) keys.push(PIECE + n);
        const values = await redis(['MGET', ...keys]);
        values.forEach((v, k) => {
          if (!v) return;
          try { entries.push({ n: since + 1 + k, ...JSON.parse(v) }); } catch (e) {}
        });
      }
      res.status(200).json({ count, entries });
      return;
    }

    if (action === 'submit' && req.method === 'POST') {
      const { name, image } = req.body || {};
      if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > MAX_IMAGE) {
        fail(res, 400, 'That drawing couldn’t be saved.');
        return;
      }
      const cleanName = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
      const record = JSON.stringify({ name: cleanName, image, at: new Date().toISOString() });
      const n = await redis(['EVAL', SUBMIT, '1', COUNT, record, String(TTL)]);
      res.status(200).json({ n });
      return;
    }

    if (action === 'check' && req.method === 'POST') {
      if (!ADMIN_PASSWORD) {
        fail(res, 503, 'The admin password isn’t set up yet.');
        return;
      }
      if (!isAdmin(req)) {
        fail(res, 401, 'That password isn’t right.');
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'reset' && req.method === 'POST') {
      if (!isAdmin(req)) {
        fail(res, 401, 'That password isn’t right.');
        return;
      }
      const removed = await redis(['EVAL', RESET, '1', COUNT]);
      res.status(200).json({ removed });
      return;
    }

    fail(res, 400, 'Unknown request.');
  } catch (e) {
    fail(res, 502, 'The mandala’s storage didn’t respond. Try again in a moment.');
  }
}
