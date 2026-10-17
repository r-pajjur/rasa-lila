// Local helper: serves index.html on http://localhost:8080 and forwards /seam/* to the Seam API,
// since Seam blocks direct browser calls. Run with: node server.js
// (On Vercel, api/seam.js does the forwarding instead.)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const SEAM = process.env.SEAM_BASE || 'https://connect.getseam.com';

http.createServer(async (req, res) => {
  if (req.url.startsWith('/seam/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const upstream = await fetch(SEAM + req.url.slice('/seam'.length), {
        method: req.method,
        headers: { 'Authorization': req.headers.authorization || '', 'Content-Type': 'application/json' },
        body: req.method === 'GET' ? undefined : Buffer.concat(chunks),
      });
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(await upstream.text());
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Could not reach Seam: ' + e.message } }));
    }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(here, 'index.html')).pipe(res);
}).listen(PORT, () => console.log(`Lock tester running at http://localhost:${PORT}`));
