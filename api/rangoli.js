/**
 * Petal Mandala's storage, on Upstash Redis (added to the project from the Vercel Marketplace).
 *   GET  /api/rangoli/?action=index&rev=R      who is where; { same: true } if nothing changed since R
 *   GET  /api/rangoli/?action=pieces&ns=1,2,3  the drawings for those places (up to 10)
 *   POST /api/rangoli/?action=submit           { name, image }  -> { n }
 *   POST /api/rangoli/?action=check|reset      X-Admin-Password header
 *   POST /api/rangoli/?action=delete&n=N       X-Admin-Password header
 * A deleted place goes back on a free list, and the next person to submit fills it.
 * Every key expires two weeks after the last change, so nothing outlives the event.
 */
import { randomUUID } from 'node:crypto';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_PASSWORD = process.env.RANGOLI_ADMIN_PASSWORD;

const COUNT = 'rangoli:count';          // highest place ever handed out
const PIECE = 'rangoli:piece:';         // + n -> { id, name, image, at }
const INDEX = 'rangoli:index';          // hash n -> { id, name, at }, small enough to poll
const FREE = 'rangoli:free';            // sorted set of places freed by deleting
const REV = 'rangoli:rev';              // bumps on every change, so the display can skip unchanged polls
const TTL = 60 * 60 * 24 * 14;
const BATCH = 10;                       // keeps each response well under Vercel's size limit
const MAX_IMAGE = 900_000;              // a 480px PNG data URL is usually 30–250 KB

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

async function touch() {
  await redis(['INCR', REV]);
  for (const key of [COUNT, INDEX, FREE, REV]) await redis(['EXPIRE', key, String(TTL)]);
}

/** Hands out a place: a freed one first, otherwise the next new one. Both steps are atomic in Redis. */
async function takePlace() {
  const popped = await redis(['ZPOPMIN', FREE]);
  if (Array.isArray(popped) && popped.length) return parseInt(popped[0], 10);
  return redis(['INCR', COUNT]);
}

/** Designs saved before the index existed: build their index entries once. */
async function indexFromPieces() {
  const count = parseInt(await redis(['GET', COUNT]), 10) || 0;
  const flat = [];
  for (let start = 1; start <= count; start += BATCH) {
    const ns = [];
    for (let n = start; n < start + BATCH && n <= count; n++) ns.push(n);
    const values = await redis(['MGET', ...ns.map(n => PIECE + n)]);
    for (let k = 0; k < ns.length; k++) {
      if (!values[k]) continue;
      try {
        const { name = '', at = '' } = JSON.parse(values[k]);
        const meta = JSON.stringify({ id: `legacy-${ns[k]}`, name, at });
        await redis(['HSET', INDEX, String(ns[k]), meta]);
        flat.push(String(ns[k]), meta);
      } catch (e) {}
    }
  }
  return flat;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) {
    fail(res, 503, 'The mandala’s storage isn’t connected yet.');
    return;
  }
  const action = String(req.query.action || '');

  try {
    if (action === 'index' && req.method === 'GET') {
      const rev = String((await redis(['GET', REV])) ?? '0');
      if (req.query.rev !== undefined && String(req.query.rev) === rev) {
        res.status(200).json({ rev, same: true });
        return;
      }
      let flat = (await redis(['HGETALL', INDEX])) || [];
      if (!flat.length) flat = await indexFromPieces();
      const items = [];
      for (let k = 0; k < flat.length; k += 2) {
        try { items.push({ n: parseInt(flat[k], 10), ...JSON.parse(flat[k + 1]) }); } catch (e) {}
      }
      items.sort((a, b) => a.n - b.n);
      res.status(200).json({ rev, items });
      return;
    }

    if (action === 'pieces' && req.method === 'GET') {
      const ns = String(req.query.ns || '').split(',').map(x => parseInt(x, 10)).filter(n => n > 0).slice(0, BATCH);
      const entries = [];
      if (ns.length) {
        const values = await redis(['MGET', ...ns.map(n => PIECE + n)]);
        values.forEach((v, k) => {
          if (!v) return;
          try { entries.push({ n: ns[k], ...JSON.parse(v) }); } catch (e) {}
        });
      }
      res.status(200).json({ entries });
      return;
    }

    if (action === 'submit' && req.method === 'POST') {
      const { name, image } = req.body || {};
      if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > MAX_IMAGE) {
        fail(res, 400, 'That drawing couldn’t be saved.');
        return;
      }
      const cleanName = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
      const meta = { id: randomUUID(), name: cleanName, at: new Date().toISOString() };
      const n = await takePlace();
      await redis(['SET', PIECE + n, JSON.stringify({ ...meta, image }), 'EX', String(TTL)]);
      await redis(['HSET', INDEX, String(n), JSON.stringify(meta)]);
      await touch();
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

    if (action === 'delete' && req.method === 'POST') {
      if (!isAdmin(req)) {
        fail(res, 401, 'That password isn’t right.');
        return;
      }
      const n = parseInt(req.query.n, 10);
      if (!(n > 0)) {
        fail(res, 400, 'Unknown design.');
        return;
      }
      const removed = await redis(['HDEL', INDEX, String(n)]);
      await redis(['DEL', PIECE + n]);
      if (removed) await redis(['ZADD', FREE, String(n), String(n)]);
      await touch();
      res.status(200).json({ removed: Boolean(removed) });
      return;
    }

    if (action === 'reset' && req.method === 'POST') {
      if (!isAdmin(req)) {
        fail(res, 401, 'That password isn’t right.');
        return;
      }
      const count = parseInt(await redis(['GET', COUNT]), 10) || 0;
      const keys = [COUNT, INDEX, FREE];
      for (let n = 1; n <= count; n++) keys.push(PIECE + n);
      for (let k = 0; k < keys.length; k += 200) await redis(['DEL', ...keys.slice(k, k + 200)]);
      await touch();
      res.status(200).json({ removed: count });
      return;
    }

    fail(res, 400, 'Unknown request.');
  } catch (e) {
    fail(res, 502, 'The mandala’s storage didn’t respond. Try again in a moment.');
  }
}
