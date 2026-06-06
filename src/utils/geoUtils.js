/**
 * geoUtils.js — Geographic Utilities for Qasr Status & 'Urf Boundary
 *
 * Implements Ayatollah Sistani's rulings on traveler boundaries:
 * - 'Urf boundary: where the continuous urban sprawl ends
 * - Hadd al-Tarakhkhus: 22 km (13.7 miles) outward from the 'Urf boundary
 *
 * For large metropolitan areas, we model the 'Urf boundary using
 * structural density approximations.
 *
 * The Hadd al-Tarakhkhus boundary is now computed using a proper polygon
 * buffering algorithm (Minkowski sum / edge offsetting with arc joins)
 * rather than a simple circle approximation.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;
const HADD_AL_TARAKHKHUS_KM = 22; // 22 km = 13.7 miles

// ─── Metropolitan 'Urf Boundary Data ─────────────────────────────────────────
// These are approximations of where the continuous urban footprint breaks
// for major sprawling cities. Each entry defines a simplified polygon
// (array of [lat, lng] points) representing the estimated city limit.
//
// DISCLAIMER: These are structural density approximations, not official
// municipal boundaries. Users should use their own conscience ('Urf).

const URBAN_BOUNDARIES = {
  'Houston': {
    center: [29.7604, -95.3698],
    // Approximate boundary of Greater Houston continuous urban area
    // extending to Katy, Sugar Land, Pearland, The Woodlands, etc.
    boundary: [
      [30.20, -95.85],  // NW (Montgomery / The Woodlands area)
      [30.10, -95.60],  // N
      [30.05, -95.20],  // NE (Humble / Kingwood)
      [29.90, -95.00],  // E (Baytown)
      [29.60, -95.00],  // SE (Texas City / Galveston Bay)
      [29.50, -95.20],  // S (Pearland / Alvin)
      [29.45, -95.60],  // SW (Sugar Land / Richmond)
      [29.55, -95.85],  // W (Katy / Fulshear)
      [29.80, -95.90],  // NW (Cypress)
      [30.20, -95.85],  // back to start
    ],
  },
  'New York': {
    center: [40.7128, -74.0060],
    boundary: [
      [40.92, -74.05],  // N (Yonkers)
      [40.85, -73.85],  // NE (Bronx / Queens)
      [40.70, -73.70],  // E (Nassau County)
      [40.55, -73.80],  // SE (JFK area)
      [40.50, -74.00],  // S (Staten Island)
      [40.55, -74.20],  // SW (Elizabeth / Newark)
      [40.70, -74.25],  // W (Newark / Jersey City)
      [40.85, -74.20],  // NW (Hackensack)
      [40.92, -74.05],  // back
    ],
  },
  'Los Angeles': {
    center: [34.0522, -118.2437],
    boundary: [
      [34.30, -118.70],  // NW (Thousand Oaks)
      [34.25, -118.50],  // N (San Fernando Valley)
      [34.20, -118.20],  // NE (Glendale / Pasadena)
      [34.10, -117.90],  // E (San Gabriel Valley)
      [33.90, -117.80],  // SE (Orange County line)
      [33.70, -118.00],  // S (Long Beach)
      [33.70, -118.40],  // SW (Torrance / Palos Verdes)
      [33.90, -118.60],  // W (Santa Monica / Venice)
      [34.10, -118.70],  // NW (Malibu area)
      [34.30, -118.70],  // back
    ],
  },
  'Chicago': {
    center: [41.8781, -87.6298],
    boundary: [
      [42.10, -87.95],  // NW (Schaumburg / Arlington Heights)
      [42.05, -87.70],  // N (Evanston / Skokie)
      [42.00, -87.55],  // NE
      [41.80, -87.50],  // E (Lake Michigan shore)
      [41.65, -87.55],  // SE (Hammond / Gary)
      [41.60, -87.70],  // S (South Chicago suburbs)
      [41.65, -87.95],  // SW (Joliet area)
      [41.85, -88.00],  // W (Naperville / Aurora)
      [42.00, -88.05],  // NW (Elgin)
      [42.10, -87.95],  // back
    ],
  },
  'Dubai': {
    center: [25.2048, 55.2708],
    boundary: [
      [25.35, 55.10],   // NW (Jebel Ali)
      [25.30, 55.20],   // N
      [25.30, 55.40],   // NE (Sharjah border)
      [25.20, 55.45],   // E (Al Awir)
      [25.05, 55.40],   // SE
      [25.00, 55.20],   // S (Dubai South)
      [25.05, 55.05],   // SW (Dubai Investment Park)
      [25.20, 55.00],   // W (Jebel Ali Port)
      [25.35, 55.10],   // back
    ],
  },
  'London': {
    center: [51.5074, -0.1278],
    boundary: [
      [51.60, -0.50],   // NW (Uxbridge / Harrow)
      [51.60, -0.20],   // N (Barnet / Enfield)
      [51.60, 0.00],    // NE (Ilford / Romford)
      [51.50, 0.10],    // E (Bexley / Dartford)
      [51.40, 0.05],    // SE (Bromley / Croydon)
      [51.35, -0.15],   // S (Sutton)
      [51.40, -0.35],   // SW (Kingston / Twickenham)
      [51.50, -0.45],   // W (Hounslow / Heathrow)
      [51.60, -0.50],   // back
    ],
  },
  'Doha': {
    center: [25.2854, 51.5310],
    boundary: [
      [25.40, 51.40],   // NW (Al Khor area)
      [25.40, 51.50],   // N
      [25.38, 51.60],   // NE
      [25.30, 51.60],   // E (The Pearl / West Bay)
      [25.20, 51.55],   // SE (Industrial Area)
      [25.15, 51.45],   // S (Al Wakra)
      [25.20, 51.35],   // SW
      [25.30, 51.35],   // W (Al Rayyan)
      [25.40, 51.40],   // back
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function isValidLatLng(lat, lng) {
  return isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function wrapLng(lng) {
  return ((lng + 180) % 360 + 360) % 360 - 180;
}

// ─── Point-in-Polygon (Ray Casting) ──────────────────────────────────────────

/**
 * Check if a point [lat, lng] is inside a polygon.
 * Uses the ray-casting algorithm.
 */
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Distance Calculations ───────────────────────────────────────────────────

/**
 * Calculate the Haversine distance between two points in km.
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δφ = (lat2 - lat1) * DEG;
  const Δλ = (lng2 - lng1) * DEG;

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate the minimum distance from a point to a polygon boundary.
 * Returns the distance in km.
 */
function distanceToPolygonBoundary(point, polygon) {
  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dist = distanceToSegment(point, p1, p2);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Distance from point to line segment in km.
 */
function distanceToSegment(point, segA, segB) {
  const [px, py] = point;
  const [ax, ay] = segA;
  const [bx, by] = segB;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return haversineDistance(px, py, ax, ay);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return haversineDistance(px, py, projX, projY);
}

// ─── Polygon Buffer Algorithm (True Minkowski Sum) ──────────────────────────
//
// The buffer of a polygon at distance d is the Minkowski sum of the polygon
// with a circle of radius d. Our implementation:
//
// 1. Convert lat/lng → local Cartesian (azimuthal equidistant projection)
// 2. For each edge, compute outward normal, offset by d
// 3. For convex vertices: join offset edges with a circular arc
//    For concave vertices: intersect the offset edges for a sharp corner
// 4. Convert back to lat/lng
// 5. Simplify using Ramer-Douglas-Peucker

/**
 * Convert lat/lng to local Cartesian coordinates (x, y in km) using
 * an azimuthal equidistant projection centered on the given origin.
 * This preserves distances from the origin and angles correctly for
 * the buffering operation.
 */
function latLngToCartesian(lat, lng, originLat, originLng) {
  const φ1 = originLat * DEG;
  const λ1 = originLng * DEG;
  const φ2 = lat * DEG;
  const λ2 = lng * DEG;
  const Δλ = λ2 - λ1;

  const cosVal = clamp(
    Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ),
    -1, 1
  );
  const c = Math.acos(cosVal);

  if (Math.abs(c) < 1e-12) return [0, 0];

  const k = c / Math.sin(c);
  const x = k * Math.cos(φ2) * Math.sin(Δλ);
  const y = k * (Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ));

  return [x * EARTH_RADIUS_KM, y * EARTH_RADIUS_KM];
}

/**
 * Convert local Cartesian (x, y in km) back to lat/lng.
 */
function cartesianToLatLng(x, y, originLat, originLng) {
  const φ1 = originLat * DEG;
  const λ1 = originLng * DEG;

  const d = Math.sqrt(x * x + y * y) / EARTH_RADIUS_KM;

  if (Math.abs(d) < 1e-12) return [originLat, originLng];

  const asinVal = clamp(
    Math.cos(d) * Math.sin(φ1) + (y * Math.sin(d) * Math.cos(φ1)) / d,
    -1, 1
  );
  const φ2 = Math.asin(asinVal);

  const λ2 = λ1 + Math.atan2(
    x * Math.sin(d),
    d * Math.cos(φ1) * Math.cos(d) - y * Math.sin(φ1) * Math.sin(d)
  );

  return [φ2 * RAD, wrapLng(λ2 * RAD)];
}

/**
 * Compute the 2D cross product of vectors (p1→p2) × (p1→p3).
 */
function crossProduct2D(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/**
 * Determine if the polygon is wound clockwise (CW) or counter-clockwise (CCW).
 * Uses the shoelace formula. Returns true for CW.
 */
function isClockwise(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum > 0;
}

/**
 * Find the intersection point of two infinite lines defined by segments
 * (p1→p2) and (p3→p4). Returns null if parallel.
 * All points in Cartesian [x, y].
 */
function lineIntersection(p1, p2, p3, p4) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

  const ix = x1 + t * (x2 - x1);
  const iy = y1 + t * (y2 - y1);

  // Check for NaN
  if (!isFinite(ix) || !isFinite(iy)) return null;

  return [ix, iy];
}

/**
 * Compute the outward normal for an edge.
 * For a CW polygon, outward is to the RIGHT of the direction of travel.
 * For a CCW polygon, outward is to the LEFT.
 * Returns [nx, ny] as a unit vector, or null if edge is degenerate.
 */
function outwardNormal(ax, ay, bx, by, cw) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-12) return null;

  // Perpendicular: (-dy, dx) is LEFT, (dy, -dx) is RIGHT
  if (cw) {
    return [dy / len, -dx / len]; // RIGHT
  } else {
    return [-dy / len, dx / len]; // LEFT
  }
}

/**
 * Add arc points between two outward normals around a vertex.
 * This creates a smooth rounded corner for convex vertices.
 */
function addArcPoints(result, vertex, n1, n2, radius, originLat, originLng, segments) {
  const [vx, vy] = vertex;

  // Compute the angles of the outward normals
  const angle1 = Math.atan2(n1[1], n1[0]);
  const angle2 = Math.atan2(n2[1], n2[0]);

  // We want the exterior arc between the two normals.
  // The exterior arc spans the larger angle (> 180° for convex).
  // Start at angle1, sweep through the exterior to angle2.
  let startAngle = angle1;
  let endAngle = angle2;

  // Compute the signed angular difference from startAngle to endAngle
  let diff = endAngle - startAngle;
  // Normalize to (-2π, 2π)
  while (diff > 2 * Math.PI) diff -= 2 * Math.PI;
  while (diff < -2 * Math.PI) diff += 2 * Math.PI;

  // For the exterior arc, we want the angle that goes the "long way around"
  // If |diff| <= π, we're going the short way → reverse direction
  if (Math.abs(diff) <= Math.PI) {
    // Take the complementary long arc
    if (diff >= 0) {
      diff = diff - 2 * Math.PI; // Go the other way (negative, larger magnitude)
    } else {
      diff = diff + 2 * Math.PI; // Go the other way (positive, larger magnitude)
    }
  }

  // Generate arc points
  const steps = Math.max(segments, Math.ceil(Math.abs(diff) / (Math.PI / Math.max(segments, 1))));
  for (let s = 0; s <= steps; s++) {
    const frac = s / steps;
    const angle = startAngle + frac * diff;
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const px = vx + nx * radius;
    const py = vy + ny * radius;
    const [lat, lng] = cartesianToLatLng(px, py, originLat, originLng);
    if (isValidLatLng(lat, lng)) {
      result.push([lat, lng]);
    }
  }
}

/**
 * Fallback: use a simple offset around the vertex when the normal-based
 * approach fails (e.g. parallel edges).
 */
function addOffsetPoint(result, vertex, n1, n2, radius, originLat, originLng) {
  const [vx, vy] = vertex;
  // Average the normals to get a bisector direction
  let nx = (n1[0] + n2[0]) / 2;
  let ny = (n1[1] + n2[1]) / 2;
  const len = Math.sqrt(nx * nx + ny * ny);
  if (len > 1e-12) {
    nx /= len;
    ny /= len;
  } else {
    nx = n1[0];
    ny = n1[1];
  }
  const px = vx + nx * radius;
  const py = vy + ny * radius;
  const [lat, lng] = cartesianToLatLng(px, py, originLat, originLng);
  if (isValidLatLng(lat, lng)) {
    result.push([lat, lng]);
  }
}

/**
 * Buffer a polygon outward by a given distance in km.
 * Uses edge offsetting with arc joining at convex vertices.
 *
 * Algorithm:
 * 1. Convert polygon to local Cartesian coordinates
 * 2. Offset each edge outward by the buffer distance
 * 3. At each vertex:
 *    - Convex (interior angle < 180°): offset edges diverge → join with circular arc
 *    - Concave (interior angle > 180°): offset edges converge → use intersection
 * 4. Convert back to lat/lng
 * 5. Simplify using Ramer-Douglas-Peucker
 *
 * @param {Array} polygon - Array of [lat, lng] pairs
 * @param {number} offsetKm - Buffer distance in km
 * @param {Array} origin - [lat, lng] for the local projection center
 * @returns {Array} Buffered polygon as [lat, lng] pairs
 */
export function bufferPolygon(polygon, offsetKm, origin) {
  if (!polygon || polygon.length < 3) return polygon;

  const [originLat, originLng] = origin;

  // Step 1: Convert to local Cartesian
  const cartesian = polygon.map(([lat, lng]) =>
    latLngToCartesian(lat, lng, originLat, originLng)
  );

  const cw = isClockwise(cartesian);
  const n = cartesian.length;

  if (n < 3) return polygon;

  const ARC_SEGMENTS = 8; // Number of points in each arc join
  const result = [];

  for (let i = 0; i < n; i++) {
    const prev = cartesian[(i - 1 + n) % n];
    const curr = cartesian[i];
    const next = cartesian[(i + 1) % n];

    // Outward normals for edges meeting at this vertex
    const n1 = outwardNormal(prev[0], prev[1], curr[0], curr[1], cw);
    const n2 = outwardNormal(curr[0], curr[1], next[0], next[1], cw);

    // If either normal is null (degenerate edge), skip
    if (!n1 || !n2) {
      addOffsetPoint(result, curr, n1 || [0, 0], n2 || [0, 0], offsetKm, originLat, originLng);
      continue;
    }

    // Offset edges
    const p1a = [prev[0] + n1[0] * offsetKm, prev[1] + n1[1] * offsetKm];
    const p1b = [curr[0] + n1[0] * offsetKm, curr[1] + n1[1] * offsetKm];
    const p2a = [curr[0] + n2[0] * offsetKm, curr[1] + n2[1] * offsetKm];
    const p2b = [next[0] + n2[0] * offsetKm, next[1] + n2[1] * offsetKm];

    // Determine if the vertex is convex or concave using cross product
    const cross = crossProduct2D(prev[0], prev[1], curr[0], curr[1], next[0], next[1]);

    // For a CW polygon:
    //   cross > 0  = left turn  → interior is convex? No...
    // Let's think: In a CW polygon, the interior is on the RIGHT.
    // A right turn (negative cross) means the interior angle < 180° (convex).
    // A left turn (positive cross) means the interior angle > 180° (concave).
    //
    // For a CCW polygon, interior is on the LEFT.
    // A left turn (positive cross) means interior angle < 180° (convex).
    // A right turn (negative cross) means interior angle > 180° (concave).

    const isConvex = cw ? (cross < 0) : (cross > 0);

    if (isConvex) {
      // Convex vertex: offset edges DIVERGE
      // Join the offset edges with a circular arc around the vertex
      addArcPoints(result, curr, n1, n2, offsetKm, originLat, originLng, ARC_SEGMENTS);
    } else {
      // Concave vertex: offset edges CONVERGE
      // Use the intersection of the offset edges for a sharp corner
      const intersection = lineIntersection(p1a, p1b, p2a, p2b);

      if (intersection) {
        const [ix, iy] = intersection;
        const distI = Math.sqrt((ix - curr[0]) ** 2 + (iy - curr[1]) ** 2);

        // Sanity check: intersection should be at a reasonable distance
        if (distI < offsetKm * 10) {
          const [lat, lng] = cartesianToLatLng(ix, iy, originLat, originLng);
          if (isValidLatLng(lat, lng)) {
            result.push([lat, lng]);
          } else {
            // Fallback to arc
            addArcPoints(result, curr, n1, n2, offsetKm, originLat, originLng, ARC_SEGMENTS);
          }
        } else {
          // Unreasonable intersection, fallback to arc
          addArcPoints(result, curr, n1, n2, offsetKm, originLat, originLng, ARC_SEGMENTS);
        }
      } else {
        // Parallel offset edges — just offset the vertex along the bisector
        addOffsetPoint(result, curr, n1, n2, offsetKm, originLat, originLng);
      }
    }
  }

  if (result.length < 3) {
    // Fallback: if buffering failed, return the original polygon (no buffer)
    return polygon;
  }

  // Step 6: Simplify using Ramer-Douglas-Peucker
  const simplified = simplifyPolygon(result, 1.0); // 1.0 km tolerance

  // Ensure we have a valid polygon
  if (simplified.length < 3) {
    return result;
  }

  // Ensure the polygon is closed
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (Math.abs(first[0] - last[0]) > 0.0001 || Math.abs(first[1] - last[1]) > 0.0001) {
    simplified.push([first[0], first[1]]);
  }

  return simplified;
}

/**
 * Ramer-Douglas-Peucker polygon simplification.
 * Reduces the number of points while preserving shape.
 *
 * @param {Array} points - Array of [lat, lng] pairs
 * @param {number} epsilon - Maximum allowed deviation in km
 * @returns {Array} Simplified points
 */
export function simplifyPolygon(points, epsilon) {
  if (points.length <= 2) return points;

  const [firstLat, firstLng] = points[0];
  const [lastLat, lastLng] = points[points.length - 1];

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const [lat, lng] = points[i];
    const dist = perpendicularDistanceKm(lat, lng, firstLat, firstLng, lastLat, lastLng);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPolygon(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPolygon(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

/**
 * Perpendicular distance from a point to a line segment in km.
 */
function perpendicularDistanceKm(lat, lng, lat1, lng1, lat2, lng2) {
  const originLat = (lat1 + lat2) / 2;
  const originLng = (lng1 + lng2) / 2;

  const [px, py] = latLngToCartesian(lat, lng, originLat, originLng);
  const [ax, ay] = latLngToCartesian(lat1, lng1, originLat, originLng);
  const [bx, by] = latLngToCartesian(lat2, lng2, originLat, originLng);

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-12) {
    return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Check if two line segments intersect (excluding shared endpoints).
 */
function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const o1 = crossProduct2D(x1, y1, x2, y2, x3, y3);
  const o2 = crossProduct2D(x1, y1, x2, y2, x4, y4);
  const o3 = crossProduct2D(x3, y3, x4, y4, x1, y1);
  const o4 = crossProduct2D(x3, y3, x4, y4, x2, y2);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// ─── Main Qasr Status Functions ──────────────────────────────────────────────

/**
 * Get the 'Urf boundary for a given city name.
 */
export function getUrfBoundary(cityName) {
  return URBAN_BOUNDARIES[cityName] || null;
}

/**
 * Get all supported cities with 'Urf boundary data.
 */
export function getSupportedCities() {
  return Object.keys(URBAN_BOUNDARIES);
}

/**
 * Determine if a point is inside the 'Urf boundary of a city.
 */
export function isInsideUrfBoundary(lat, lng, cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) return null;
  return pointInPolygon([lat, lng], city.boundary);
}

/**
 * Check if a point is beyond the Hadd al-Tarakhkhus boundary.
 * Uses the buffered polygon for accurate determination.
 */
function isBeyondHadd(lat, lng, cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) return false;

  const buffered = generateHaddBoundary(cityName);
  if (!buffered || buffered.length < 3) return false;

  return !pointInPolygon([lat, lng], buffered);
}

/**
 * Calculate the Qasr status for a given location.
 */
export function calculateQasrStatus(lat, lng, cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) {
    return {
      isInsideUrf: null,
      distanceFromBoundary: null,
      isOutsideHadd: null,
      status: 'unknown',
      message: `No 'Urf boundary data available for "${cityName}". Please consult your local Islamic authority.`,
    };
  }

  const inside = pointInPolygon([lat, lng], city.boundary);
  const distToBoundary = distanceToPolygonBoundary([lat, lng], city.boundary);
  const signedDist = inside ? -distToBoundary : distToBoundary;

  const outsideHadd = isBeyondHadd(lat, lng, cityName);

  let status;
  let message;

  if (inside) {
    status = 'resident';
    message = `You are within the estimated 'Urf boundary of ${cityName}. You are considered a Resident (Hadir). Prayers: Tamam (Full). Fasting: Valid.`;
  } else if (!outsideHadd) {
    status = 'transition';
    message = `You are outside the 'Urf boundary but within ${HADD_AL_TARAKHKHUS_KM} km (${(HADD_AL_TARAKHKHUS_KM * 0.621371).toFixed(1)} miles). You have not yet reached Hadd al-Tarakhkhus. Prayers: Tamam (Full). Fasting: Valid.`;
  } else {
    status = 'traveler';
    message = `You are beyond Hadd al-Tarakhkhus (${HADD_AL_TARAKHKHUS_KM} km / ${(HADD_AL_TARAKHKHUS_KM * 0.621371).toFixed(1)} miles from the 'Urf boundary). You are considered a Traveler (Musafir). Prayers: Qasr (Shortened to 2 Rak'ahs). Fasting: Invalid (Qada required).`;
  }

  return {
    isInsideUrf: inside,
    distanceFromBoundary: signedDist,
    distanceKm: distToBoundary,
    isOutsideHadd: outsideHadd,
    haddDistance: HADD_AL_TARAKHKHUS_KM,
    status,
    message,
    cityName,
    cityCenter: city.center,
    boundary: city.boundary,
  };
}

/**
 * Generate the Hadd al-Tarakhkhus boundary polygon.
 * Now computed using the true polygon buffering algorithm.
 */
export function generateHaddBoundary(cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) return null;

  // Helper: compute the fallback circle boundary
  function fallbackCircle() {
    const maxDist = Math.max(
      ...city.boundary.map(([lat, lng]) =>
        haversineDistance(city.center[0], city.center[1], lat, lng)
      )
    );
    return generateRadiusCircle(city.center[0], city.center[1], maxDist + HADD_AL_TARAKHKHUS_KM);
  }

  // Helper: validate that EVERY point in the polygon is a valid LatLng
  function isValidPolygon(poly) {
    if (!poly || poly.length < 3) return false;
    for (const [lat, lng] of poly) {
      if (!isFinite(lat) || !isFinite(lng)) return false;
      if (lat < -90 || lat > 90) return false;
      if (lng < -180 || lng > 180) return false;
    }
    return true;
  }

  try {
    const buffered = bufferPolygon(city.boundary, HADD_AL_TARAKHKHUS_KM, city.center);
    if (isValidPolygon(buffered)) {
      return buffered;
    }
    // If buffer produced invalid points, fall back to circle
    console.warn('Polygon buffer produced invalid points, falling back to circle approximation');
    return fallbackCircle();
  } catch (e) {
    console.warn('Polygon buffer failed, falling back to circle approximation:', e);
    return fallbackCircle();
  }
}

/**
 * Generate a circle of points around a center at a given radius.
 * Used as fallback for the Hadd al-Tarakhkhus boundary.
 */
function generateRadiusCircle(centerLat, centerLng, radiusKm, numPoints = 64) {
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const bearing = (360 / numPoints) * i;
    const brng = bearing * DEG;
    const d = radiusKm / EARTH_RADIUS_KM;
    const φ1 = centerLat * DEG;
    const λ1 = centerLng * DEG;

    const sinVal = clamp(
      Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brng),
      -1, 1
    );
    const φ2 = Math.asin(sinVal);
    const λ2 = λ1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * sinVal
    );

    points.push([φ2 * RAD, wrapLng(λ2 * RAD)]);
  }
  return points;
}

/**
 * Generate the 'Urf boundary polygon for map display.
 */
export function generateUrfPolygon(cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) return null;
  return city.boundary;
}

export { HADD_AL_TARAKHKHUS_KM };