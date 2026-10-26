# Musafir — Qasr Status & 'Urf Boundary App

Determines Muslim traveler (Musafir) status per Ayatollah Sistani's rulings,
measuring the **Hadd al-Tarakhkhus** (22/44 km) from the **'Urf boundary** —
where the continuous built-up area of a town ends (the last houses).

## City boundary data

`public/city-boundaries.json` contains real built-up outlines for the supported
cities, generated from OpenStreetMap landuse data. A copy is also compiled
into the app bundle at build time (`src/data/city-boundaries.json`), so every
deployment — web, Vercel, or Capacitor — always ships with the data:

- **Source**: each city's **legal (administrative) boundary** (Nominatim) as the
  base, **expanded by the continuous built-up area** (OSM
  `landuse=residential|commercial|industrial|retail|mixed` merged at a 500 m
  gap-bridging buffer, anchored to the legal city within ~2.5 km).
- **Method**: 'Urf = legal boundary ∪ built-up sprawl, satellite fragments
  dropped, small holes filled, simplified to ~100 m so it keeps the jagged
  "follows-the-houses" character. Metro labels union their member cities
  adaptively.
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
