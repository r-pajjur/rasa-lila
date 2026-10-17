/**
 * Forwards the Schlage lock tester's calls to the Seam API, since Seam blocks
 * direct browser calls. The caller sends their own Seam key; nothing is stored here.
 *   POST /api/seam?path=/devices/list
 */
const SEAM = 'https://connect.getseam.com';
const ALLOWED = ['/connect_webviews/', '/devices/', '/access_codes/'];

export default async function handler(req, res) {
  const path = String(req.query.path || '');
  if (req.method !== 'POST' || !ALLOWED.some(prefix => path.startsWith(prefix)) || path.includes('..')) {
    res.status(400).json({ error: { message: 'Not a lock tester request.' } });
    return;
  }
  try {
    const upstream = await fetch(SEAM + path, {
      method: 'POST',
      headers: { 'Authorization': req.headers.authorization || '', 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    });
    res.status(upstream.status).setHeader('Content-Type', 'application/json');
    res.send(await upstream.text());
  } catch (e) {
    res.status(502).json({ error: { message: 'Could not reach Seam: ' + e.message } });
  }
}
