import io, re, json, time, urllib.request, urllib.parse

GEO_PATH = "src/utils/geoUtils.js"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

c = io.open(GEO_PATH, "r", encoding="utf-8").read()

start_marker = "const URBAN_BOUNDARIES = {"
end_marker = "};"
start = c.index(start_marker)
end = c.index(end_marker, start) + 2

entries = []
idx = start + len(start_marker)
while True:
    import re as re2
    m = re2.search(r"\'([^\']+)\'\s*:\s*{", c[idx:end])
    if not m:
        break
    city = m.group(1)
    entry_start = idx + m.start()
    depth = 0
    pos = entry_start
    while pos < end:
        ch = c[pos]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                entry_end = pos + 1
                break
        pos += 1
    entries.append((city, entry_start, entry_end))
    idx = entry_end + 1
    if idx >= end:
        break

print(f"Found {len(entries)} cities total")

for i, (city, es, ee) in enumerate(entries):
    print(f"{i+1}/{len(entries)}: {city}...", end=" ", flush=True)
    time.sleep(1.2)
    
    old_block = c[es:ee]
    center_match = re2.search(r"center:\s*\[([^,]+),\s*([^\]]+)\]", old_block[:200])
    
    if center_match:
        lat = center_match.group(1).strip()
        lon = center_match.group(2).strip()
    else:
        print("no center found, skipping")
        continue
    
    query = f"[out:json][timeout:12];(way[\\"landuse\\"~\\"residential|commercial|industrial|retail|mixed\\"](around:30000,{lat},{lon});relation[\\"landuse\\"~\\"residential|commercial|industrial|retail|mixed\\"](around:30000,{lat},{lon}););out geom;"
    
    try:
        data = urllib.parse.urlencode({"data": query}).encode()
        req = urllib.request.Request(OVERPASS_URL, data=data)
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        req.add_header("User-Agent", "MusafirApp/1.0")
        resp = urllib.request.urlopen(req, timeout=20)
        result = json.loads(resp.read())
        
        best_geom = None
        best_len = 0
        for el in result.get("elements", []):
            geom = el.get("geometry", [])
            if len(geom) > best_len:
                best_len = len(geom)
                best_geom = [[n["lat"], n["lon"]] for n in geom]
        
        if best_geom and best_len >= 10:
            fst = best_geom[0]
            lst = best_geom[-1]
            if abs(fst[0] - lst[0]) > 0.0001 or abs(fst[1] - lst[1]) > 0.0001:
                best_geom.append([fst[0], fst[1]])
            print(f"{best_len} points OK")
        else:
            print(f"no data (best={best_len})")
    except Exception as e:
        print(f"ERROR: {e}")

print("\\nDone")
