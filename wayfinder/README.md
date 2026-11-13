# Wayfinder

Photo-by-photo indoor directions. A visitor scans a QR code posted on a wall,
picks where they are going, and walks through one photo per leg with an arrow
drawn over it.

## How a visit works

1. The QR code encodes the anchor it is posted at:
   `https://<site>/wayfinder/?at=dining-hall`
2. The app reads `at`, shows "You are at Dining Hall", and lists destinations.
3. Picking one runs a breadth-first search over the authored steps and plays
   the shortest path, one photo at a time.

If `at` is missing or unknown, the app asks the visitor to tap where they are
instead of failing.

## The map: `public/building.json`

Two keys, and that is the whole model.

```jsonc
{
  "nodes": {
    "dining-hall": { "label": "Dining Hall", "destination": true },
    "rooms-200": {
      "label": "Rooms 200–220",
      "destination": true,
      "rooms": { "from": 200, "to": 220 }   // typed room numbers land here
    }
  },
  "steps": [
    {
      "from": "dining-hall",
      "to": "dining-hall-door",
      "photo": "dhToR/dhToR1.jpg",          // a file in public/photos/
      "arrow": "straight",                  // left | right | straight | up | down
      "text": "Leave the dining hall through the doorway ahead."
    }
  ]
}
```

- **nodes** are QR anchor points. `destination: true` puts one in the
  "Where to?" list; leave it off for hallway junctions people pass through but
  never ask for.
- **steps** are directed: each one is a single walk between two adjacent
  anchors, authored once and reused by every route that passes through it.
- **rooms** lets one anchor stand in for a numbered range, so a visitor types
  `214` instead of hunting through twenty list entries.
- **aliases** (optional) maps an old anchor id to its new one, so QR codes
  printed before a rename keep working: `"cafeteria": "dining-hall"`.

Arrows are SVG drawn on top of the photo at runtime, never baked into the image
— so re-labelling a leg means editing one line of JSON, not reshooting.

## Photos

One folder per route in `public/photos/`, named start + `To` + end, with the
step number:

```
photos/
  dhToR/   dining hall → rooms 200–220   dhToR1.jpg … dhToR6.jpg
  dhToL/   dining hall → library         dhToL2.jpg … dhToL4.jpg
  placeholder.svg
```

A step shared between routes keeps the name of the route it was shot for. The
library route starts by leaving the dining hall, so its first step reuses
`dhToR/dhToR1.jpg` and the folder starts at `dhToL2`.

Photos are portrait, 1050×1400, saved upright. Phones store photos sideways
with a "rotate when showing" flag; save the resized copy already rotated, so
nothing depends on that flag.

## Adding a leg

1. Photograph the walk in portrait, standing where the QR code goes, facing the
   direction of travel.
2. Resize to about 1400px on the long edge, rotated upright, and save it in the
   route's folder with the next name (`dhToL5.jpg`). Keep the full-size
   originals out of the repo.
3. Add the node to `nodes` if it is new, and a `steps` entry pointing at the
   photo.
4. Print a QR code for `?at=<that node id>` and post it at the spot.

No code changes are needed — the graph, the search and the player all read from
the JSON.

### Reusing a photo

Several steps can point at the same photo. A junction shot from the lobby can
serve the walk to the stairwell (`straight`), the mandir (`right`) and the
library (`left`), each with its own arrow and text. The arrow sits at a fixed
spot for each direction (centre, or near the left or right edge), so reuse
works best when the doorway you mean is roughly where that arrow lands.

Reverse legs usually need their own photo, since walking back you face the
other way.

## What is still placeholder

The dining hall → rooms 200–220 and dining hall → library routes are real
photography. **Mandir** is still a stub: it uses `photos/placeholder.svg` and
its step text is marked `PLACEHOLDER`.

Steps are directed, so the map currently routes *to* the rooms and the library
but not back.
Walking the route in reverse and photographing it adds the return legs.

## Commands

```bash
npm start          # ng serve, http://localhost:4200
npm run build      # production build into dist/wayfinder/browser
```

The production build sets `--base-href /wayfinder/`, which is where the site
serves it. The service worker (`@angular/pwa`) caches the app shell, the map and
the photos, so a visitor who loaded it once can still navigate on the building's
dead spots.
