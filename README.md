# Musafir — Qasr Status & 'Urf Boundary App

Determines Muslim traveler (Musafir) status per Ayatollah Sistani's rulings,
measuring the **Hadd al-Tarakhkhus** (22/44 km) from the **'Urf boundary** —
where the continuous built-up area of a town ends (the last houses).

## City boundary data

`public/city-boundaries.json` contains real built-up outlines for the supported
cities, generated from OpenStreetMap landuse data. A copy is also compiled
into the app bundle at build time (`src/data/city-boundaries.json`), so every
deployment — web, Vercel, or Capacitor — always ships with the data:

- **Source**: OSM `landuse=residential|commercial|industrial|retail|mixed`
  polygons within ~50 km of each city center (queried from public Overpass mirrors).
- **Method**: polygons are merged with a 500 m gap-bridging buffer (so adjacent
  subdivisions connect into one continuous built-up outline without swallowing
  open countryside), satellite fragments are dropped, small holes are filled,
  and the outline is simplified to ~100 m so it keeps its jagged
  "follows-the-houses" character.
- The app loads the bundle at startup; it takes priority over every other source.

### Regenerating the data

```bash
pip install shapely
npm run build:boundaries        # python tools/build_urfboundaries.py --all
npm run validate:boundaries     # node test/validateBoundaries.mjs
```

For testing single cities or tuning parameters:

```bash
python tools/build_urfboundaries.py --only "Houston,New York City"
python tools/build_urfboundaries.py --only "Philadelphia" --bridge 500 --radius 50
```

Parallel builds (two processes, merged afterwards):

```bash
$env:URF_OUTPUT='out_a.json'; python tools/build_urfboundaries.py --only "<list A>"
$env:URF_OUTPUT='out_b.json'; python tools/build_urfboundaries.py --only "<list B>"
python tools/merge_boundaries.py out_a.json out_b.json
```

Cities not in the bundle are discovered at runtime: `fetchUrfBoundary()` queries
Overpass and traces a **concave outline** (marching squares over a ~250 m grid)
around the built-up landuse, falling back to the administrative boundary last.

## App

Two tabs: **Flight** (flight-path qibla & prayer-time tracker) and **Qasr**
(traveler-status checker). Built with Vite, React 19, Leaflet + Capacitor.
