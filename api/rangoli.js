/**
 * Community Rangoli's storage, on Upstash Redis (added to the project from the Vercel Marketplace).
 *   GET  /api/rangoli/?action=index&rev=R       designs in arrival order; { same: true } if nothing changed since R
 *   GET  /api/rangoli/?action=pieces&ids=a,b    the drawings for those designs (up to 10)
 *   POST /api/rangoli/?action=submit            { name, reflection, image }  -> { n }
 *   POST /api/rangoli/?action=check|reset       X-Admin-Password header
 *   POST /api/rangoli/?action=delete&id=ID      X-Admin-Password header
 * A design's place in the rangoli is its position in arrival order, so deleting one moves
 * everyone after it down a place and the rangoli stays packed from the centre out.
 * Every key expires two weeks after the last change, so nothing outlives the event.
 */
import { randomUUID } from 'node:crypto';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_PASSWORD = process.env.RANGOLI_ADMIN_PASSWORD;

const SEQ = 'rangoli:seq';              // arrival counter, so order never ties
const ORDER = 'rangoli:order';          // sorted set: design id, scored by arrival
const META = 'rangoli:meta';            // hash id -> { id, name, reflection, at }
const IMG = 'rangoli:img:';             // + id -> PNG data URL
const REV = 'rangoli:rev';              // bumps on every change, so the display can skip unchanged polls
const TTL = 60 * 60 * 24 * 14;
const BATCH = 10;                       // keeps each response well under Vercel's size limit
const MAX_IMAGE = 900_000;              // a 480px PNG data URL is usually 30–250 KB
const MAX_REFLECTION = 600;

// earlier layouts, converted once
const OLD_COUNT = 'rangoli:count';
const OLD_PIECE = 'rangoli:piece:';
const OLD_INDEX = 'rangoli:index';
const OLD_FREE = 'rangoli:free';

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
  for (const key of [SEQ, ORDER, META, REV]) await redis(['EXPIRE', key, String(TTL)]);
}

let converted = false;
/** Moves designs saved under the older numbered layout into arrival order, keeping their order. */
async function convertOldLayout() {
  if (converted) return;
  const count = parseInt(await redis(['GET', OLD_COUNT]), 10) || 0;
  if (count) {
    // only one request converts; others carry on and see the result on their next poll
    const lock = await redis(['SET', 'rangoli:converting', '1', 'NX', 'EX', '60']);
    if (lock !== 'OK') return;
    const flat = (await redis(['HGETALL', OLD_INDEX])) || [];
    const metaByN = new Map();
    for (let k = 0; k < flat.length; k += 2) {
      try { metaByN.set(parseInt(flat[k], 10), JSON.parse(flat[k + 1])); } catch (e) {}
    }
    for (let n = 1; n <= count; n++) {
      const raw = await redis(['GET', OLD_PIECE + n]);
      if (!raw) continue;
      try {
        const piece = JSON.parse(raw);
        const meta = metaByN.get(n) || {};
        const id = meta.id && !String(meta.id).startsWith('legacy-') ? meta.id : randomUUID();
        const record = { id, name: meta.name ?? piece.name ?? '', at: meta.at || piece.at || new Date().toISOString() };
        const seq = await redis(['INCR', SEQ]);
        await redis(['SET', IMG + id, piece.image, 'EX', String(TTL)]);
        await redis(['HSET', META, id, JSON.stringify(record)]);
        await redis(['ZADD', ORDER, String(seq), id]);
      } catch (e) {}
    }
    const old = [OLD_COUNT, OLD_INDEX, OLD_FREE];
    for (let n = 1; n <= count; n++) old.push(OLD_PIECE + n);
    for (let k = 0; k < old.length; k += 200) await redis(['DEL', ...old.slice(k, k + 200)]);
    await touch();
  }
  converted = true;
}

async function orderedItems() {
  const ids = (await redis(['ZRANGE', ORDER, '0', '-1'])) || [];
  if (!ids.length) return [];
  const metas = await redis(['HMGET', META, ...ids]);
  const items = [];
  ids.forEach((id, k) => {
    let meta = {};
    try { meta = JSON.parse(metas[k] || '{}'); } catch (e) {}
    items.push({ n: items.length + 1, id, name: meta.name || '', reflection: meta.reflection || '', at: meta.at || '' });
  });
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) {
    fail(res, 503, 'The rangoli’s storage isn’t connected yet.');
    return;
  }
  const action = String(req.query.action || '');

  try {
    await convertOldLayout();

    if (action === 'index' && req.method === 'GET') {
      const rev = String((await redis(['GET', REV])) ?? '0');
      if (req.query.rev !== undefined && String(req.query.rev) === rev) {
        res.status(200).json({ rev, same: true });
        return;
      }
      res.status(200).json({ rev, items: await orderedItems() });
      return;
    }

    if (action === 'pieces' && req.method === 'GET') {
      const ids = String(req.query.ids || '').split(',').filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, BATCH);
      const entries = [];
      if (ids.length) {
        const values = await redis(['MGET', ...ids.map(id => IMG + id)]);
        values.forEach((image, k) => { if (image) entries.push({ id: ids[k], image }); });
      }
      res.status(200).json({ entries });
      return;
    }

    if (action === 'submit' && req.method === 'POST') {
      const { name, reflection, image } = req.body || {};
      if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > MAX_IMAGE) {
        fail(res, 400, 'That drawing couldn’t be saved.');
        return;
      }
      const id = randomUUID();
      const cleanName = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
      // keep line breaks in a reflection, drop other control characters
      const cleanReflection = String(reflection || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_REFLECTION);
      await redis(['SET', IMG + id, image, 'EX', String(TTL)]);
      await redis(['HSET', META, id, JSON.stringify({ id, name: cleanName, reflection: cleanReflection, at: new Date().toISOString() })]);
      const seq = await redis(['INCR', SEQ]);          // atomic, so two people never share a place
      await redis(['ZADD', ORDER, String(seq), id]);
      const rank = await redis(['ZRANK', ORDER, id]);
      await touch();
      res.status(200).json({ n: rank + 1, id });
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
      const id = String(req.query.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        fail(res, 400, 'Unknown design.');
        return;
      }
      const removed = await redis(['ZREM', ORDER, id]);
      await redis(['HDEL', META, id]);
      await redis(['DEL', IMG + id]);
      await touch();
      res.status(200).json({ removed: Boolean(removed) });
      return;
    }

    if (action === 'reset' && req.method === 'POST') {
      if (!isAdmin(req)) {
        fail(res, 401, 'That password isn’t right.');
        return;
      }
      const ids = (await redis(['ZRANGE', ORDER, '0', '-1'])) || [];
      const keys = [ORDER, META, SEQ, ...ids.map(id => IMG + id)];
      for (let k = 0; k < keys.length; k += 200) await redis(['DEL', ...keys.slice(k, k + 200)]);
      await touch();
      res.status(200).json({ removed: ids.length });
      return;
    }

    fail(res, 400, 'Unknown request.');
  } catch (e) {
    fail(res, 502, 'The rangoli’s storage didn’t respond. Try again in a moment.');
  }
}
