/**
 * geoUtils.js — Geographic Utilities for Qasr Status & 'Urf Boundary
 *
 * Implements Ayatollah Sistani's rulings on traveler boundaries:
 * - 'Urf boundary: where the continuous urban sprawl ends
 * - Hadd al-Tarakhkhus: 22 km (13.7 miles) outward from the 'Urf boundary
 *
 * For large metropolitan areas, we model the 'Urf boundary using
 * structural density approximations.
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
 * Returns the distance in km. Negative means inside the polygon.
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
  if (!city) return null; // Unknown city
  return pointInPolygon([lat, lng], city.boundary);
}

/**
 * Calculate the Qasr status for a given location.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} cityName - City name for 'Urf boundary lookup
 * @returns {Object} { isInsideUrf, distanceFromBoundary, isOutsideHadd, status }
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

  // If inside the 'Urf boundary, distance is negative (how far inside)
  // If outside, distance is positive (how far outside)
  const signedDist = inside ? -distToBoundary : distToBoundary;

  // Hadd al-Tarakhkhus: 22 km from the 'Urf boundary
  const isOutsideHadd = !inside && distToBoundary >= HADD_AL_TARAKHKHUS_KM;

  let status;
  let message;

  if (inside) {
    status = 'resident';
    message = `You are within the estimated 'Urf boundary of ${cityName}. You are considered a Resident (Hadir). Prayers: Tamam (Full). Fasting: Valid.`;
  } else if (!isOutsideHadd) {
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
    isOutsideHadd,
    haddDistance: HADD_AL_TARAKHKHUS_KM,
    status,
    message,
    cityName,
    cityCenter: city.center,
    boundary: city.boundary,
  };
}

/**
 * Generate a circle of points around a center at a given radius.
 * Used for drawing the 22 km Hadd al-Tarakhkhus boundary on the map.
 * 
 * @param {number} centerLat 
 * @param {number} centerLng 
 * @param {number} radiusKm 
 * @param {number} numPoints 
 * @returns {Array} [[lat, lng], ...]
 */
export function generateRadiusCircle(centerLat, centerLng, radiusKm, numPoints = 64) {
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const bearing = (360 / numPoints) * i;
    const brng = bearing * DEG;
    const d = radiusKm / EARTH_RADIUS_KM; // angular distance in radians
    const φ1 = centerLat * DEG;
    const λ1 = centerLng * DEG;

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brng));
    const λ2 = λ1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));

    points.push([φ2 * RAD, λ2 * RAD]);
  }
  return points;
}

/**
 * Generate the Hadd al-Tarakhkhus boundary polygon.
 * This is the 22 km buffer around the 'Urf boundary polygon.
 * For simplicity, we generate a circle centered on the city center
 * with radius = (max distance from center to boundary) + 22 km.
 */
export function generateHaddBoundary(cityName) {
  const city = URBAN_BOUNDARIES[cityName];
  if (!city) return null;

  // Find the maximum distance from center to any boundary point
  let maxDist = 0;
  for (const [lat, lng] of city.boundary) {
    const dist = haversineDistance(city.center[0], city.center[1], lat, lng);
    if (dist > maxDist) maxDist = dist;
  }

  const haddRadius = maxDist + HADD_AL_TARAKHKHUS_KM;
  return generateRadiusCircle(city.center[0], city.center[1], haddRadius);
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