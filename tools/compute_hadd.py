#!/usr/bin/env python3
"""
compute_hadd.py — per-city Hadd al-Tarakhkhus (hybrid sight + sound, density-lowered)

Physics & fiqh model (per Sistani Ruling 1304 & Q&A for interconnected cities):
  The Hadd is the point where the town's people (incl. outskirts) can no longer
  see the traveller — reached "a few miles past the city limits". Applied here:
  vis = 3.57 * sqrt(h_edge) retained only as an upper sanity note
  aud = urban-sound model sunk by density (noisy/dense -> shorter)
  rec = 5.0 km ("few miles" ≈ 3 mi anchor) + density-based adjustment
      = clamp(5.0 + (aud - 6.0)*0.35 - knockdown*0.5, 3.0, 8.0)   [2-5 mi]

Reads population/land density from the official Census 2020 UA list
(tools/cache/ua_list.xlsx) for 'ua2020' cities; Canadian/legal-only cities use
a sensible mid density default. Writes `haddRecommended` (+ `haddModel` for the
in-app explainer) into every city entry and persists the bundle.
"""

import io
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_PATH = os.path.join(ROOT, "public", "city-boundaries.json")
SRC_DATA_PATH = os.path.join(ROOT, "src", "data", "city-boundaries.json")
ROOT_COPY_PATH = os.path.join(ROOT, "boundaries.json")
UA_LIST = os.path.join(ROOT, "tools", "cache", "ua_list.xlsx")

EDGE_H_M = 11.0          # typical edge (last houses) height proxy, meters
DEN_BASE = 1500.0        # reference metro density (ppl/km2)
DEFAULT_DENSITY = 1800.0 # for cities without UA attributes (Canada, etc.)
TARGET_RANGE = (3.0, 8.0)  # "a few miles past the city limit" (2-5 mi, Ruling 1304 Q&A)


def compute_hadd(density_km2):
    vis = min(max(3.57 * math.sqrt(EDGE_H_M), 5.0), 20.0)
    # Denser, noisier city -> adhan fades sooner.
    aud = min(max(12.5 / (1.0 + 0.55 * (density_km2 / DEN_BASE)), 2.0), 12.5)
    # Dense metros get knocked further down (traffic, walls, noise).
    knockdown = min(max(1.6 * max(0.0, density_km2 / DEN_BASE - 1.0), 0.0), 4.0)
    # Anchor at "a few miles" (~5 km / 3 mi past the city boundary) and adjust
    # for density: denser/noisier cities lose sight & sound sooner, so their
    # Hadd lands lower inside the 3-8 km (2-5 mi) band.
    rec = min(max(5.0 + (aud - 6.0) * 0.35 - knockdown * 0.5, TARGET_RANGE[0]), TARGET_RANGE[1])
    return {
        "edgeH": EDGE_H_M,
        "density": round(density_km2),
        "vis": round(vis, 1),
        "aud": round(aud, 1),
        "knockdown": round(knockdown, 1),
        "hadd": round(rec, 1),
        "basis": "Ruling 1304 Q&A: a few miles past the city boundary (3-8 km)",
    }


def load_ua_density():
    """name -> persons per km2 from the official Census 2020 UA list."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(UA_LIST, read_only=True)
        ws = wb.active
        rows = [r for r in ws.iter_rows(values_only=True) if r and r[1]]
    except Exception:
        return {}
    out = {}
    for r in rows[1:]:
        name, pop, land = r[1], r[2], r[4]  # NAME, POP, AREALAND (m2) — r[5] is sq-mi
        if name and pop and land:
            out[str(name).strip()] = float(pop) / (float(land) / 1e6)
    return out


def main():
    # reuse the same UA name tokens used by fetch_official_boundaries
    sys_path = os.path.dirname(os.path.abspath(__file__))
    import sys
    sys.path.insert(0, sys_path)
    from fetch_official_boundaries import UA_MATCH, CANADIAN

    with io.open(PUBLIC_PATH, "r", encoding="utf-8") as f:
        bundle = json.load(f)

    dens_by_name = load_ua_density()
    print(f"UA density rows: {len(dens_by_name)}")

    for name, entry in bundle.items():
        token = UA_MATCH.get(name)
        density = None
        if entry.get("source") == "ua2020" and token:
            if isinstance(token, tuple):
                # use the first member density (metro core)
                den = [v for k, v in dens_by_name.items() if token[0].lower() in k.lower()]
                density = max(den) if den else None
            else:
                den = [v for k, v in dens_by_name.items() if token.lower() in k.lower()]
                density = max(den) if den else None
        if density is None:
            density = DEFAULT_DENSITY  # Canada / legal-only fallback
        model = compute_hadd(density)
        entry["haddRecommended"] = model["hadd"]
        entry["haddModel"] = model
        print(f"  {name:<24} density={density:>6.0f} ppl/km2 -> Hadd {model['hadd']} km "
              f"(vis {model['vis']} / aud {model['aud']})")

    data = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    for path in (PUBLIC_PATH, SRC_DATA_PATH, ROOT_COPY_PATH):
        with io.open(path, "w", encoding="utf-8") as f:
            f.write(data)
    print("\nSaved per-city Hadd al-Tarakhkhus.")


if __name__ == "__main__":
    main()