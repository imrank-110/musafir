#!/usr/bin/env python3
"""
merge_boundaries.py — merge parallel URF_OUTPUT files back into the bundle.

Usage:
    python tools/merge_boundaries.py out_a.json "out_b.json:Tulsa,Louisville"
Each argument may be just a file (all cities win) or "file:cityA,cityB"
(only the listed cities win). The public file's own values are the base and
only the named/listed cities are replaced.
"""
import io
import json
import sys

PUBLIC = "public/city-boundaries.json"
SRC_DATA = "src/data/city-boundaries.json"
ROOT_COPY = "boundaries.json"

merged = {}
with io.open(PUBLIC, "r", encoding="utf-8") as f:
    merged.update(json.load(f))

applied = 0
for arg in sys.argv[1:]:
    if not arg:
        continue
    if ":" in arg:
        path, names = arg.split(":", 1)
        want = [n.strip() for n in names.split(",") if n.strip()]
    else:
        path, want = arg, None
    with io.open(path, "r", encoding="utf-8") as f:
        part = json.load(f)
    for city, data in part.items():
        if data.get("boundary") and (want is None or city in want):
            merged[city] = data
            applied += 1

for out in (PUBLIC, SRC_DATA, ROOT_COPY):
    with io.open(out, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
print(f"Merged {applied} city entries; {len(merged)} cities total.")