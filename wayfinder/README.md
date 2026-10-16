# Wayfinder

Photo-by-photo indoor directions. A visitor scans a QR code posted on a wall,
picks where they are going, and walks through one photo per leg with an arrow
drawn over it.

## How a visit works

1. The QR code encodes the anchor it is posted at:
   `https://<site>/wayfinder/?at=cafeteria`
2. The app reads `at`, shows "You are at Cafeteria", and lists destinations.
3. Picking one runs a breadth-first search over the authored steps and plays
   the shortest path, one photo at a time.

If `at` is missing or unknown, the app asks the visitor to tap where they are
instead of failing.

## The map: `public/building.json`

Two keys, and that is the whole model.

```jsonc
{
  "nodes": {
    "cafeteria": { "label": "Cafeteria", "destination": true },
    "rooms-200": {
      "label": "Rooms 200–220",
      "destination": true,
      "rooms": { "from": 200, "to": 220 }   // typed room numbers land here
    }
  },
  "steps": [
    {
      "from": "cafeteria",
      "to": "sunroom",
      "photo": "pic1.jpg",                  // a file in public/photos/
      "arrow": "straight",                  // left | right | straight | up | down
      "text": "Leave the cafeteria through the doorway ahead."
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

Arrows are SVG drawn on top of the photo at runtime, never baked into the image
— so re-labelling a leg means editing one line of JSON, not reshooting.

## Adding a leg

1. Photograph the walk, facing the direction of travel.
2. Drop the JPG in `public/photos/`. Roughly 1400px on the long edge keeps the
   page quick: `sips -Z 1400 -s formatOptions 72 in.JPG --out public/photos/x.jpg`
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

The cafeteria → rooms 200–220 route is real photography. **Mandir** and
**library** are stubs: they use `photos/placeholder.svg` and their step text is
marked `PLACEHOLDER`. Replace both once those legs are photographed.

Steps are directed, so the map currently routes *to* the rooms but not back.
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
