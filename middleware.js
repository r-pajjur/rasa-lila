/**
 * Puts a password on the landing page only. Every app under it stays public,
 * so QR codes and links people were given keep working.
 * The password can be changed with a LANDING_PASSWORD environment variable on Vercel.
 */
export const config = { matcher: ['/', '/index.html'] };

// sha256 of the default password, so it isn't written out in this public repo
const DEFAULT_HASH = '021f8d8dda20cb6414c6ffbfa7f19bfb0b43d2887208fc3faa6c61c1dbc86f60';
const COOKIE = 'rl_workspace';

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function passwordHash() {
  const env = typeof process !== 'undefined' ? process.env.LANDING_PASSWORD : undefined;
  return env ? sha256(env) : DEFAULT_HASH;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.split(/;\s*/).find(part => part.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

export default async function middleware(request) {
  const hash = await passwordHash();
  const token = await sha256('workspace:' + hash);

  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const given = String(form?.get('password') || '');
    if (given && (await sha256(given)) === hash) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: '/',
          'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }
    return page(true);
  }

  if (readCookie(request, COOKIE) === token) return;   // let the landing page through
  return page(false);
}

function page(wrong) {
  return new Response(LOCK_PAGE.replace('<!--ERROR-->', wrong
    ? '<p class="error" role="alert">That password isn’t right. Try again.</p>' : ''), {
    status: wrong ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const LOCK_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Rasa Lila</title>
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#14213D" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap" />
<style>
  :root { --desk: #14213D; --cream: #F6EEDC; --card: #FFFCF2; --ink: #1C1A24; --tape: #111014; --tomato: #FF5A36; --sun: #FFC53D; color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    display: grid; place-items: center; min-height: 100vh;
    padding: 24px max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
    color: var(--cream); font: 400 16px/1.5 'Space Mono', ui-monospace, Menlo, monospace;
    background:
      radial-gradient(1000px 600px at 78% -10%, rgba(255, 197, 61, .18), transparent 60%),
      linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px) 0 0 / 28px 28px,
      linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px) 0 0 / 28px 28px,
      var(--desk);
  }
  .card {
    position: relative; width: min(100%, 400px); padding: 40px 26px 26px; color: var(--ink);
    background:
      linear-gradient(90deg, transparent 20px, #F08A8A 20px 21.5px, transparent 21.5px),
      repeating-linear-gradient(transparent 0 25px, #B9D3EA 25px 26px) 0 30px,
      var(--card);
    border-radius: 3px; transform: rotate(-1.2deg);
    box-shadow: 0 2px 0 rgba(0,0,0,.08), 0 18px 34px -10px rgba(0,0,0,.55);
  }
  .label {
    position: absolute; top: -14px; left: 26px; padding: 3px 10px 2px; background: var(--tape); color: #F4F4F4;
    font: 700 13px/1.3 'Space Mono', monospace; letter-spacing: .14em; text-transform: uppercase; transform: rotate(-2deg);
  }
  h1 { margin: 0 0 6px; font: italic 400 38px/1 'Instrument Serif', Georgia, serif; }
  p { margin: 0 0 18px; font-size: 14px; color: #5C5866; }
  label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  input {
    width: 100%; height: 46px; padding: 0 12px; border: 2px solid var(--ink); border-radius: 3px; background: #fff;
    font: 400 16px 'Space Mono', monospace; color: var(--ink);
  }
  button {
    margin-top: 14px; width: 100%; height: 48px; border: 0; border-radius: 3px; cursor: pointer;
    background: var(--tomato); color: var(--ink); font: 700 14px 'Space Mono', monospace; letter-spacing: .1em; text-transform: uppercase;
    box-shadow: 3px 3px 0 var(--ink);
  }
  button:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--ink); }
  input:focus-visible, button:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
  .error { margin: 0 0 14px; color: #C0281A; font-weight: 700; }
</style>
</head>
<body>
  <form class="card" method="post" action="/">
    <span class="label">Private</span>
    <h1>Raghav’s personal workspace</h1>
    <p>Enter the password to open it.</p>
    <!--ERROR-->
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
    <button type="submit">Open</button>
  </form>
</body>
</html>`;
