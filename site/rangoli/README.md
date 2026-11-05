# Community Rangoli

A shared Diwali rangoli for Chinmaya Mission Niagara. Everyone draws a small
circular rangoli on their phone or computer; it's cut into 4 quarters and
placed in the big rangoli, which fills in live on the display.

| Page | Who it's for |
| --- | --- |
| `/rangoli/` | Everyone: draw, add a name and an optional reflection, submit |
| `/rangoli/display/` | The big screen (shared over Zoom): the live rangoli, QR code, count, downloads |
| `/rangoli/admin/` | You: every rangoli with its reflection, delete one, download all, reset |

## How the big rangoli works

- **Drawing:** every stroke repeats once in each quarter of the circle,
  turned 90° each time. The lotus in the middle is fixed. Tools: three brush
  sizes, dot, petal, flower, diya, mango stamps, an eraser (removes a whole
  line or stamp), undo, start over. 12 rangoli-powder colours on black.
- **Placing:** ring *k* has 8*k* slots and holds 2*k* people. Each person's 4
  quarters go 90° apart, and people fill a ring at alternating positions,
  so a half-full ring still looks balanced. A new ring opens when the
  outermost one fills, and the display zooms out to fit.
- **Order:** a rangoli's place is its position in arrival order. Deleting one
  in admin moves everyone after it in by one place, so the big rangoli
  always stays packed from the centre out.
- **Display:** checks for changes every 2 seconds (one cheap call when
  nothing changed). New rangolis bloom in with the person's name. Hover a
  piece to see who made it; click or tap it to see their whole rangoli and
  reflection, with a download button.
- **Downloads:** the big rangoli at 3000×3000, and keepsake cards (rangoli,
  name, reflection) for individuals, all with the CM Niagara logo as a
  watermark. Admin's "Download all" zips a keepsake card for everyone.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `draw.js` | The drawing page |
| `display/` | The big screen |
| `admin/index.html` | Admin |
| `shared.js` | Colours, stamps, ring geometry, the lotus, the keepsake card, API calls |
| `mandala.js` | Renders the big rangoli: bends each quarter into its slot |
| `style.css` | Paper, ink and type for all three pages (`--font-display` swaps the title font) |
| `../../api/rangoli.js` | Storage on Upstash Redis |

## Storage

Upstash Redis, connected from the Vercel Storage tab (free tier). Each
rangoli is a 480px transparent PNG plus `{ name, reflection, at }`. Every key
expires two weeks after the last change, so nothing outlives the event; admin
can also reset by hand. The admin password is the `RANGOLI_ADMIN_PASSWORD`
setting on Vercel.

## Before the event

1. Open `/rangoli/admin/` and press **Reset the rangoli** to clear test
   drawings.
2. Put `rasa-lila.vercel.app/rangoli` in the Zoom chat, or show `qr.png`.
3. Share `/rangoli/display/` on screen.
