# Rasa Lila

Small seva apps for the community, deployed together on Vercel at
rasa-lila.vercel.app.

| Path | App | Built with |
| --- | --- | --- |
| `/` | Landing page: a filing drawer of every app, behind a password | one hand-written HTML file + `middleware.js` |
| `/jeopardy/` | Committee Jeopardy board | one hand-written HTML file |
| `/habits-to-heroes/` | Habits to Heroes Jeopardy | one hand-written HTML file |
| `/room-booking/` | Room booking (retreat registration) | static HTML + ES modules |
| `/seekingculture/` | Seeking Culture class activities (gunas, The Yatra) | static HTML + JS, Firebase |
| `/wayfinder/` | Indoor wayfinding, photo by photo | Angular 19 + TypeScript, PWA |
| `/schlage/` | Schlage lock tester (access codes through Seam) | static HTML + `api/seam.js` |
| `/rangoli/` | Community Rangoli: a shared Diwali rangoli, with a live display and admin | static HTML + ES modules, `api/rangoli.js`, Upstash Redis |

Dhara lives in its own repo (`jyoti`) because it has an API, a cron job and
push notifications; the landing page links out to it.

Every app under `site/` uses relative paths, so `vercel.json` sets
`trailingSlash: true`. Without it, `/room-booking` would load its assets from
`/` instead of `/room-booking/`. API calls use the trailing slash too
(`/api/rangoli/?…`) to skip a redirect.

## Layout

```
site/                what gets served as-is (no build step)
  index.html           landing page (the filing drawer)
  jeopardy/            Committee Jeopardy
  habits-to-heroes/    Habits to Heroes Jeopardy
  room-booking/        room booking (moved from roomBookingLG)
  seekingculture/      class activities (moved from seekingculture); see yatra/README.md
  schlage/             Schlage lock tester; server.js is only for running it locally
  rangoli/             Community Rangoli (see rangoli/README.md)
wayfinder/           Angular app (see wayfinder/README.md)
api/                 Vercel functions, served at /api/<name>/
  rangoli.js           Community Rangoli's storage
  seam.js              forwards the lock tester's calls to Seam
middleware.js        the landing page password (only `/`; every app stays public)
scripts/build.mjs    copies site/ and the Angular build into dist/
dist/                build output, git-ignored; this is what Vercel serves
```

## Vercel settings

Set under the project's **Settings → Environment Variables**. Redeploy after
changing any of them.

| Variable | Used by | Notes |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Community Rangoli | Added automatically by connecting the Upstash for Redis store (Storage tab) |
| `RANGOLI_ADMIN_PASSWORD` | `/rangoli/admin/` | Without it, admin says the password isn't set up |
| `LANDING_PASSWORD` | the landing page | Optional. Without it, the built-in password is used (its hash is in `middleware.js`) |

## Running it locally

```bash
npm install          # also installs the Angular app's dependencies
npm start            # ng serve on http://localhost:4200 (wayfinder only)
```

For the whole site, including the landing page and Jeopardy:

```bash
npm run build
npx serve dist       # or: cd dist && python3 -m http.server 8777
```

A plain static server doesn't run `api/` or `middleware.js`, so Community
Rangoli can't save and the landing page has no password. `npx vercel dev`
runs everything, once you're logged in to Vercel.

The Jeopardy boards are plain HTML: open `site/jeopardy/index.html` in a
browser and it works, no server needed.

## Deploying

`vercel.json` already tells Vercel what to do: `npm run build`, serve `dist`,
and run `api/` and `middleware.js` alongside. Pushing to `main` is enough.

Node 20.19+ (or 22.12+) is needed to run the Angular CLI. This machine is on
20.17, which is why the app is pinned to Angular 19 rather than 20.
