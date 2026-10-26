#!/usr/bin/env python3
"""
fetch_official_boundaries.py — single authoritative 'Urf boundary per city

The 'Urf = the Census **Urbanized Area** (built-up, "where people actually
live") outline — official, pre-made, no generation, no Overpass dependency.

This script:
  1. Downloads the national 2020 Urban Area boundary file once (cached in
     tools/cache/), ~9 MB, from Census TIGER.
  2. Maps our city labels to official UA names (curated; Raleigh+Durham unioned).
  3. Writes the simplified UA outline as THE single `boundary` for each US/PR
     city. Cities without a UA (Canadian cities, or no match) keep their
     existing legal boundary as the automatic fallback.
  4. Saves to public/, src/data/ and the root boundaries.json copy.

Usage:
    python tools/fetch_official_boundaries.py            # all cities
    python tools/fetch_official_boundaries.py --only "Houston,San Francisco Bay Area"
"""

import io
import json
import math
import os
import shutil
import sys
import urllib.request
import zipfile

from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_PATH = os.path.join(ROOT, "public", "city-boundaries.json")
SRC_DATA_PATH = os.path.join(ROOT, "src", "data", "city-boundaries.json")
ROOT_COPY_PATH = os.path.join(ROOT, "boundaries.json")
CACHE_DIR = os.path.join(ROOT, "tools", "cache")
UA_ZIP_URL = "https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_ua20_500k.zip"
UA_ZIP_PATH = os.path.join(CACHE_DIR, "cb_2020_us_ua20_500k.zip")
SIMPLIFY_DEG = 0.0025  # ~280 m Douglas-Peucker; keeps the built-up character but stays light

# label -> official Urbanized Area name token (prefix of the Census NAME20).
UA_MATCH = {
    "Houston": "Houston, TX",
    "Dallas-Fort Worth": "Dallas--Fort Worth",
    "San Antonio": "San Antonio",
    "Austin": "Austin",
    "New York City": "New York--Jersey City--Newark",
    "Boston": "Boston",
    "Philadelphia": "Philadelphia",
    "Washington DC": "Washington--Arlington",
    "Los Angeles": "Los Angeles--Long Beach",
    "San Diego": "San Diego",
    "Seattle": "Seattle",
    "Portland": "Portland, OR",
    "Chicago": "Chicago",
    "Detroit": "Detroit",
    "Minneapolis-St Paul": "Minneapolis--St. Paul",
    "St Louis": "St. Louis, MO",
    "Cleveland": "Cleveland",
    "Atlanta": "Atlanta",
    "Miami": "Miami--Fort Lauderdale",
    "Orlando": "Orlando",
    "Charlotte": "Charlotte",
    "Nashville": "Nashville",
    "Memphis": "Memphis",
    "New Orleans": "New Orleans",
    "Jacksonville": "Jacksonville",
    "Phoenix": "Phoenix",
    "Denver": "Denver",
    "Las Vegas": "Las Vegas",
    "Salt Lake City": "Salt Lake City",
    "Albuquerque": "Albuquerque",
    "Oklahoma City": "Oklahoma City",
    "Tulsa": "Tulsa",
    "Louisville": "Louisville",
    "Cincinnati": "Cincinnati",
    "Columbus": "Columbus, OH",
    "Indianapolis": "Indianapolis",
    "Kansas City": "Kansas City, MO",
    "Omaha": "Omaha, NE",
    "Milwaukee": "Milwaukee",
    "Pittsburgh": "Pittsburgh",
    "Buffalo": "Buffalo",
    "Richmond": "Richmond, VA",
    "San Juan": "San Juan, PR",
    "Sacramento": "Sacramento",
    "San Jose": "San Jose",
    "Tampa Bay": "Tampa--St. Petersburg",
    "San Francisco Bay Area": "San Francisco--Oakland",
    "Raleigh-Durham": ("Raleigh", "Durham"),  # union both UAs
}

# Canadian cities: no US Urbanized Area — keep the legal fallback for these.
CANADIAN = {
    "Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa",
    "Winnipeg", "Quebec City", "Hamilton", "Halifax", "London",
    "Kitchener-Waterloo",
}


def ensure_ua_file():
    os.makedirs(CACHE_DIR, exist_ok=True)
    if not os.path.exists(UA_ZIP_PATH) or os.path.getsize(UA_ZIP_PATH) < 5000000:
        print("Downloading Urban Areas (2020) ...")
        urllib.request.urlretrieve(UA_ZIP_URL, UA_ZIP_PATH)
    return UA_ZIP_PATH


def load_ua_shapes(path):
    """Return {name: shapely Polygon} for every Urbanized Area."""
    with zipfile.ZipFile(path) as zf:
        tmp = os.path.join(CACHE_DIR, "_ua_extract")
        zf.extractall(tmp)
    import shapefile as shp  # pyshp, build-time only

    out = {}
    sf = shp.Reader(os.path.join(tmp, "cb_2020_us_ua20_500k.shp"), encoding="utf-8")
    for rec in sf.iterShapeRecords():
        name = rec.record.NAME20 if "NAME20" in rec.record.as_dict() else None
        if not name:
            continue
        s = rec.shape
        if s.shapeType == 5:  # Polygon
            parts = list(s.parts) + [len(s.points)]
            polys = []
            for pi in range(len(s.parts)):
                ring = s.points[parts[pi]:parts[pi + 1]]
                if len(ring) < 4:
                    continue
                poly = Polygon([(y, x) for (x, y) in ring])  # [lon, lat] -> [lat, lon]
                if not poly.is_valid:
                    poly = poly.buffer(0)
                if poly.is_valid and not poly.is_empty:
                    polys.append(poly)
            if polys:
                merged = polys[0]
                if len(polys) > 1:
                    merged = unary_union(polys)
                out[name] = merged
    shutil.rmtree(tmp, ignore_errors=True)
    return out


def ring_to_latlng(poly, lat0):
    if isinstance(poly, MultiPolygon):
        # Bridge nearby parts (~4 km) so multi-part UAs (e.g. SF--Oakland across
        # the bay) read as one metro ring, without swallowing open water.
        bridged = poly.buffer(0.03, resolution=2).buffer(-0.03, resolution=2)
        poly = max(bridged.geoms, key=lambda g: g.area) if isinstance(bridged, MultiPolygon) else bridged
    poly = poly.simplify(SIMPLIFY_DEG, preserve_topology=True)
    ring = list(poly.exterior.coords)
    pts = [[round(la, 6), round(ln, 6)] for (la, ln) in ring]
    if len(pts) > 1 and (pts[0][0] != pts[-1][0] or pts[0][1] != pts[-1][1]):
        pts.append([pts[0][0], pts[0][1]])
    return pts


def area_km2(b, lat0):
    s = 0.0
    for i in range(len(b) - 1):
        s += b[i][0] * b[i + 1][1] - b[i + 1][0] * b[i][1]
    return abs(s / 2.0) * 111320.0 * 111320.0 * math.cos(math.radians(lat0)) / 1e6


def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        idx = args.index("--only") + 1
        only = [s.strip() for s in args[idx].split(",") if s.strip()]

    with io.open(PUBLIC_PATH, "r", encoding="utf-8") as f:
        bundle = json.load(f)
    cities = list(bundle.keys())
    if only:
        cities = [c for c in cities if c in only] or only

    ua_path = ensure_ua_file()
    uas = load_ua_shapes(ua_path)
    print(f"Loaded {len(uas)} Urbanized Areas from Census 2020")

    report = []
    for name in cities:
        entry = bundle.get(name)
        if not entry or not entry.get("center"):
            print(f"  SKIP {name} (no center)")
            continue
        lat0, lon0 = entry["center"][0], entry["center"][1]
        token = UA_MATCH.get(name)
        if token is None or name in CANADIAN:
            print(f"  KEEP (no US UA) {name}: legal boundary stays")
            report.append((name, "legal", area_km2(entry["boundary"], lat0)))
            continue
        if isinstance(token, tuple):
            matches = []
            for t in token:
                mm = [p for n, p in uas.items() if t.lower() in n.lower()]
                if mm:
                    matches.append(max(mm, key=lambda g: g.area))
            if not matches:
                print(f"  MISS {name}: no UA matched {token}")
                report.append((name, "legal", area_km2(entry["boundary"], lat0)))
                continue
            merged = unary_union(matches)
        else:
            mm = [p for n, p in uas.items() if token.lower() in n.lower()]
            if not mm:
                print(f"  MISS {name}: no UA matched '{token}'")
                report.append((name, "legal", area_km2(entry["boundary"], lat0)))
                continue
            merged = max(mm, key=lambda g: g.area)

        bnd = ring_to_latlng(merged, lat0)
        entry["boundary"] = bnd
        entry["source"] = "ua2020"
        area = area_km2(bnd, lat0)
        report.append((name, "ua2020", area))
        if isinstance(token, tuple):
            tag = "union of member UAs"
        else:
            tag = next((n for n in uas if token.lower() in n.lower()), token)[:40]
        print(f"  OK {name}: {len(bnd)} pts, {area:.0f} km2 ({tag})")

    data = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    for path in (PUBLIC_PATH, SRC_DATA_PATH, ROOT_COPY_PATH):
        with io.open(path, "w", encoding="utf-8") as f:
            f.write(data)

    print("\n---- Summary (source, area) ----")
    for name, src, area in report:
        print(f"  {name:<24} {src:<8} {area:>8.0f} km2")


if __name__ == "__main__":
    main()