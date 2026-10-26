#!/usr/bin/env python3
"""
build_urfboundaries.py â€” Rebuild true 'Urf (built-up) boundary outlines

Problem with the old data: boundaries were either (a) hand-drawn 8â€“10 vertex
octagon approximations, (b) administrative/municipal limits from Nominatim
(broad, follow municipal lines, include undeveloped land), or (c) a single
"largest residential polygon" from Overpass (drastically under-covers sprawl).

This script generates the correct 'urf outline = the outer edge of the
*continuous built-up area* (the last houses):

  1. Query Overpass for landuse=residential|commercial|industrial|retail|mixed
     around each supported city center.
  2. Buffer-union all polygons with a small gap-bridging radius (BRIDGE_M) so
     adjacent subdivisions merge into one continuous outline without swallowing
     open countryside.
  3. Keep the dominant built-up component (drop distant satellite fragments),
     and fill small holes (parks/fields embedded within the built-up area).
  4. Simplify to ~100 m: preserves the jagged "built alongside streets/fields"
     character while keeping the polygon renderable for Leaflet.

Output: public/city-boundaries.json  { "<City>": { center, boundary } }
        boundaries.json              (copy, kept in sync with the public one)

Usage:
    python tools/build_urfboundaries.py                 # regenerate cities marked stale
    python tools/build_urfboundaries.py --all           # regenerate every city
    python tools/build_urfboundaries.py --only "Houston,New York City"
    python tools/build_urfboundaries.py --radius 50     # override query radius (km)
"""

import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_PATH = os.path.join(ROOT, "public", "city-boundaries.json")
SRC_DATA_PATH = os.path.join(ROOT, "src", "data", "city-boundaries.json")
ROOT_COPY_PATH = os.path.join(ROOT, "boundaries.json")
# Allow parallel builds to write to separate temp files (URF_OUTPUT=<path>),
# then tools/merge_boundaries.py combines them.
OUTPUT_PATH = os.environ.get("URF_OUTPUT") or PUBLIC_PATH

# â”€â”€â”€ Tunable parameters (the 'urf = continuous built-up area) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
BRIDGE_M = 500.0           # gap-bridging radius: connects developments up to
                           # ~2*BRIDGE apart. Calibrated against US suburbs:
                           # 150 m left neighborhoods isolated (DFW 26 -> 1,289
                           # km2 only at 500 m); 1 km swallowed open countryside.
SIMPLIFY_M = 100.0         # Douglasâ€“Peucker tolerance (keeps jaggies >100 m)
MIN_FRAGMENT_FRAC = 0.005  # drop components smaller than 0.5% of the largest
MAX_HOLE_FRAC = 0.02       # fill holes smaller than 2% of the polygon area
MAX_HOLE_KM2 = 6.0         # ... but never fill a hole bigger than this
MIN_AREA_KM2 = 3.0         # treat a result smaller than this as a failure
QUERY_RADIUS_DEFAULT_KM = 50.0
RATE_LIMIT_S = 1.5         # polite wait between Overpass calls

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]
# Rotate the mirror order per-process (URF_MIRROR_SHIFT=0..3) so parallel
# builders use different primaries and don't contend on one instance.
MIRROR_SHIFT = int(os.environ.get("URF_MIRROR_SHIFT", "0"))
OVERPASS_URLS = OVERPASS_URLS[MIRROR_SHIFT:] + OVERPASS_URLS[:MIRROR_SHIFT]
USER_AGENT = "MusafirUrfBoundaryGenerator/2.1 (Islamic travel rulings app; python urllib)"

DEG2M = 111320.0
MAX_RETRIES = 3
QUERY_TIMEOUT_S = 45  # fail fast on a slow mirror instead of stalling minutes

# Mirrors that recently failed are demoted (moved to the end of the rotation)
# so a dead instance doesn't stall every subsequent city.
_dead_mirrors = []
_VERBOSE = True


def _demote(url):
    """Move a failing mirror to the back of the rotation (self-healing)."""
    if url in OVERPASS_URLS and OVERPASS_URLS[-1] != url:
        OVERPASS_URLS.remove(url)
        OVERPASS_URLS.append(url)
    if url not in _dead_mirrors:
        _dead_mirrors.append(url)
        print(f"      [health] demoted {url}")


# â”€â”€â”€ Projection helpers (local equirectangular, metric) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def to_meters(lat, lon, lat0, lon0):
    x = (lon - lon0) * DEG2M * math.cos(math.radians(lat0))
    y = (lat - lat0) * DEG2M
    return x, y


def from_meters(x, y, lat0, lon0):
    lat = y / DEG2M + lat0
    lon = x / (DEG2M * math.cos(math.radians(lat0))) + lon0
    return lat, lon


# â”€â”€â”€ Overpass client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def overpass_query(query):
    """Try each mirror once (POST then GET); dead mirrors are demoted so the
    next city starts with the currently-working instance."""
    payload = urllib.parse.urlencode({"data": query}).encode()
    last_err = None
    for url in list(OVERPASS_URLS):
        try:
            req = urllib.request.Request(url, data=payload)
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            req.add_header("User-Agent", USER_AGENT)
            with urllib.request.urlopen(req, timeout=QUERY_TIMEOUT_S) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            _demote(url)
            if _VERBOSE:
                print(f"      {url}: {exc}")
            # Some instances answer GET more reliably than POST.
            try:
                get_url = f"{url}?data={urllib.parse.quote(query)}"
                req = urllib.request.Request(get_url)
                req.add_header("User-Agent", USER_AGENT)
                with urllib.request.urlopen(req, timeout=QUERY_TIMEOUT_S) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception:  # noqa: BLE001
                pass
    raise RuntimeError(f"Overpass query failed for all mirrors: {last_err}")


def fetch_landuse_polygons(lat0, lon0, radius_m, ways_only=False):
    """Query Overpass and return list of shapely Polygons in local metric coords."""
    radius_km = int(radius_m / 1000)
    relation_clause = ""
    if not ways_only:
        relation_clause = (
            f'  relation["landuse"~"residential|commercial|industrial|retail|mixed"]'
            f'(around:{radius_km}000,{lat0},{lon0});\n'
        )
    query = (
        f'[out:json][timeout:90];\n'
        f'(\n'
        f'  way["landuse"~"residential|commercial|industrial|retail|mixed"](around:{radius_km}000,{lat0},{lon0});\n'
        f'{relation_clause}'
        f');\n'
        f'out geom;'
    )
    data = overpass_query(query)

    polys = []
    for el in data.get("elements", []):
        geom = el.get("geometry")
        if not geom or len(geom) < 4:
            continue
        pts = [to_meters(g["lat"], g["lon"], lat0, lon0) for g in geom]
        # drop duplicated closing point so shapely gets a linear ring without repeat
        if pts and len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue
        try:
            poly = Polygon(pts)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_valid and not poly.is_empty and poly.area > 0:
                polys.append(poly)
        except Exception:  # noqa: BLE001
            continue
    return polys


def build_urf_outline(polys, lat0, lon0):
    """Merge built-up polygons into one continuous 'urf outline (metric)."""
    if not polys:
        return None

    # Buffer-union-buffer: bridges gaps up to ~2*BRIDGE_M between developments.
    merged = unary_union([p.buffer(BRIDGE_M, resolution=2) for p in polys])
    merged = merged.buffer(-BRIDGE_M, resolution=2)

    # Keep the dominant contiguous component (drops distant satellite fragments).
    if isinstance(merged, MultiPolygon):
        components = sorted(merged.geoms, key=lambda g: g.area, reverse=True)
    else:
        components = [merged]
    if not components:
        return None
    largest = components[0]

    # Drop remaining tiny fragments relative to the largest one.
    keep = [g for g in components if g.area >= MIN_FRAGMENT_FRAC * largest.area]
    if not keep:
        return None
    outline = keep[0]
    if len(keep) > 1:
        outline = unary_union(keep)

    # Fill small holes (parks/fields embedded inside the built-up area).
    if isinstance(outline, MultiPolygon):
        outline = max(outline.geoms, key=lambda g: g.area)
    hole_threshold = min(MAX_HOLE_FRAC * outline.area, MAX_HOLE_KM2 * 1e6)
    if outline.interiors:
        remaining = [h for h in outline.interiors if h.area > hole_threshold]
        outline = Polygon(outline.exterior, remaining)

    # Simplify (keep the jagged character, drop sub-100 m noise).
    outline = outline.simplify(SIMPLIFY_M, preserve_topology=True)
    if outline.is_empty or outline.area < MIN_AREA_KM2 * 1e6:
        return None

    return outline


def polygon_to_latlng(poly, lat0, lon0):
    """Convert metric polygon to a closed [[lat, lng], ...] ring (6 decimals)."""
    ring = list(poly.exterior.coords)
    pts = []
    for x, y in ring:
        lat, lon = from_meters(x, y, lat0, lon0)
        pts.append([round(lat, 6), round(lon, 6)])
    # ensure closed
    if len(pts) > 1 and (pts[0][0] != pts[-1][0] or pts[0][1] != pts[-1][1]):
        pts.append([pts[0][0], pts[0][1]])
    return pts


def area_km2_latlng(boundary, lat0):
    """Approximate area (kmÂ²) of a closed lat/lng ring via shoelace."""
    n = len(boundary)
    a = 0.0
    for i in range(n - 1):
        a += boundary[i][0] * boundary[i + 1][1] - boundary[i + 1][0] * boundary[i][1]
    a = abs(a / 2.0)
    return a * DEG2M * DEG2M * math.cos(math.radians(lat0)) / 1e6


def ring_bbox_span_km(boundary, lat0):
    min_lat = min(p[0] for p in boundary)
    max_lat = max(p[0] for p in boundary)
    min_lng = min(p[1] for p in boundary)
    max_lng = max(p[1] for p in boundary)
    ew = (max_lng - min_lng) * DEG2M * math.cos(math.radians(lat0)) / 1000.0
    ns = (max_lat - min_lat) * DEG2M / 1000.0
    return ew, ns


def load_current():
    # Parallel builds start from the shared public file as the city/center source,
    # then write their results to their own URF_OUTPUT file.
    if os.path.exists(OUTPUT_PATH):
        with io.open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    if os.path.exists(PUBLIC_PATH):
        with io.open(PUBLIC_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_all(boundaries):
    with io.open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(boundaries, f, ensure_ascii=False, separators=(",", ":"))
    if OUTPUT_PATH == PUBLIC_PATH:
        # keep the runtime bundle (src/data, imported by the app) and the root
        # copy in sync (previously an identical duplicate)
        with io.open(SRC_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(boundaries, f, ensure_ascii=False, separators=(",", ":"))
        with io.open(ROOT_COPY_PATH, "w", encoding="utf-8") as f:
            json.dump(boundaries, f, ensure_ascii=False, separators=(",", ":"))


def main():
    args = sys.argv[1:]
    # Windows consoles default to cp1252 which cannot print box drawing/Â² chars.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    only = None
    radius_override = None
    bridge_override = None
    if "--only" in args:
        idx = args.index("--only") + 1
        only = [s.strip() for s in args[idx].split(",") if s.strip()]
    if "--radius" in args:
        idx = args.index("--radius") + 1
        radius_override = float(args[idx])
    if "--bridge" in args:
        idx = args.index("--bridge") + 1
        bridge_override = float(args[idx])
    ways_only = "--ways-only" in args

    global BRIDGE_M
    if bridge_override:
        BRIDGE_M = bridge_override

    current = load_current()
    cities = list(current.keys())
    if not cities:
        print("No existing boundaries found â€” nothing to regenerate from.")
        sys.exit(1)

    if only:
        cities = [c for c in cities if c in only] or only
        missing = [c for c in only if c not in current]
        if missing:
            print(f"WARN: '{missing}' are not in the existing data (need a center); skipping.")

    results = dict(current)
    stats = []

    for i, name in enumerate(cities, 1):
        entry = current.get(name)
        if not entry or not entry.get("center"):
            print(f"[{i}/{len(cities)}] {name}: SKIP (no stored center)")
            continue
        center = entry["center"]
        lat0, lon0 = float(center[0]), float(center[1])
        old_bound = entry.get("boundary")

        # Choose query radius: cover the existing extent + margin, clamp to [50, 60] km.
        radius_m = QUERY_RADIUS_DEFAULT_KM * 1000
        if old_bound and len(old_bound) > 2:
            ew, ns = ring_bbox_span_km(old_bound, lat0)
            radius_m = max(radius_m, max(ew, ns) * 1000 / 2 + 10000)
        radius_m = min(radius_m, 60000)
        if radius_override:
            radius_m = radius_override * 1000

        print(f"[{i}/{len(cities)}] {name}: querying Overpass (r={radius_m/1000:.0f} km)...", end=" ", flush=True)
        try:
            polys = fetch_landuse_polygons(lat0, lon0, radius_m, ways_only=ways_only)
            print(f"got {len(polys)} polygons", end="; ", flush=True)
            outline = build_urf_outline(polys, lat0, lon0)
            if outline is None:
                print("FAILED (merged area below threshold)")
                stats.append((name, "FAILED", old_bound and len(old_bound) or 0, 0))
                continue
            boundary = polygon_to_latlng(outline, lat0, lon0)
            results[name] = {"center": [round(lat0, 6), round(lon0, 6)], "boundary": boundary}
            save_all(results)  # incremental: don't lose work if a later city fails

            old_area = area_km2_latlng(old_bound, lat0) if old_bound else 0.0
            new_area = area_km2_latlng(boundary, lat0)
            ew, ns = ring_bbox_span_km(boundary, lat0)
            print(f"OK: {len(boundary)} pts, {new_area:.0f} km2 (was {old_area:.0f}), span {ew:.1f}x{ns:.1f} km")
            stats.append((name, "OK", len(boundary), new_area))
        except Exception as exc:  # noqa: BLE001
            print(f"ERROR: {exc}")
            stats.append((name, f"ERROR: {exc}", 0, 0))

        time.sleep(RATE_LIMIT_S)

    print("\n---- Summary ----")
    for name, status, pts, area in stats:
        flag = "  <== CHECK" if status not in ("OK", "FAILED") or (status == "OK" and area < 30) else ""
        print(f"  {name:<24} {status:<24} pts={pts:<6} area={area:.0f} km2{flag}")
    print("\nSaved to", PUBLIC_PATH)


if __name__ == "__main__":
    main()
