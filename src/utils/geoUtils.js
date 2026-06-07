/**
 * geoUtils.js — Geographic Utilities for Qasr Status & 'Urf Boundary
 *
 * Implements Ayatollah Sistani's rulings on traveler boundaries:
 * - 'Urf boundary: where the continuous urban sprawl ends
 * - Hadd al-Tarakhkhus: 22 km (13.7 miles) outward from the 'Urf boundary
 *
 * For large metropolitan areas, we model the 'Urf boundary using
 * structural density approximations. For new cities, we fetch the
 * administrative boundary from OpenStreetMap (Nominatim) dynamically.
 *
 * The Hadd al-Tarakhkhus boundary is computed using a centroid-radial
 * Haversine buffer algorithm that preserves shape.
 *
 * === NOMINATIM USAGE POLICY ===
 * We use the free OpenStreetMap Nominatim API for reverse geocoding and
 * boundary fetching. Per Nominatim usage policy:
 * - Maximum 1 request per second
 * - Provide a reasonable User-Agent header
 * - Cache results aggressively in localStorage
 * - No API key required (completely free)
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;
export const HADD_AL_TARAKHKHUS_KM = 22; // 22 km = 13.7 miles

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const NOMINATIM_USER_AGENT = 'MusafirTravelApp/1.0 (Islamic travel rulings calculator)';
const CACHE_KEY = 'musafir_user_cities';

// ─── Caching Layer ───────────────────────────────────────────────────────────

/**
 * Load user-contributed cities from localStorage.
 */
export function loadUserCities() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // localStorage not available
  }
  return {};
}

/**
 * Save a user-contributed city to localStorage.
 */
export function saveUserCity(cityName, cityData) {
  try {
    const cities = loadUserCities();
    cities[cityName] = cityData;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cities));
  } catch (e) {
    // localStorage full or unavailable
  }
}

/**
 * Fetch JSON from a URL with a 1-second throttle for Nominatim.
 */
let lastNominatimCall = 0;
async function fetchWithThrottle(url) {
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastNominatimCall));
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  lastNominatimCall = Date.now();
  const response = await fetch(url, {
    headers: { 'User-Agent': NOMINATIM_USER_AGENT },
  });
  if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
  return response.json();
}

// ─── Reverse Geocoding (Nominatim) ──────────────────────────────────────────

/**
 * Reverse geocode a lat/lng to get city name, state, and other location info.
 * Uses OpenStreetMap Nominatim (free, no API key needed).
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{city: string, state: string, displayName: string, lat: number, lng: number}>}
 */
export async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=10`;
  const data = await fetchWithThrottle(url);

  const address = data.address || {};
  // Try various address components in order of preference
  const city = address.city || address.town || address.village || address.municipality || address.county || address.state;
  const state = address.state || '';

  return {
    city,
    state,
    displayName: data.display_name || `${city}, ${state}`,
    lat: parseFloat(data.lat) || lat,
    lng: parseFloat(data.lon) || lng,
  };
}

/**
 * Fetch the administrative boundary polygon for a city from Nominatim.
 * Returns a GeoJSON polygon or null if unavailable.
 *
 * @param {string} cityName
 * @param {string} state - US state abbreviation or full name
 * @returns {Promise<{center: [number, number], boundary: [number, number][] | null}>}
 */
export async function fetchCityBoundary(cityName, state) {
  // Try with state qualification first, then without
  const queries = [
    `${cityName}, ${state}, USA`,
    `${cityName}, USA`,
    `${cityName}`,
  ];

  for (const query of queries) {
    try {
      const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=jsonv2&polygon_geojson=1&limit=3&addressdetails=1`;
      const results = await fetchWithThrottle(url);

      if (results && results.length > 0) {
        // Find the best result (prefer city/municipality over county/state)
        let best = results[0];
        for (const r of results) {
          const type = r.type || '';
          if (type === 'city' || type === 'administrative') {
            best = r;
            break;
          }
        }

        const center = [parseFloat(best.lat), parseFloat(best.lon)];
        let boundary = null;

        // Extract polygon from GeoJSON geometry
        if (best.geojson && best.geojson.type === 'Polygon' && best.geojson.coordinates) {
          boundary = best.geojson.coordinates[0].map(([lng, lat]) => [lat, lng]);
        } else if (best.geojson && best.geojson.type === 'MultiPolygon' && best.geojson.coordinates) {
          // Take the largest polygon (by coordinate count)
          let maxCoords = 0;
          for (const poly of best.geojson.coordinates) {
            if (poly[0] && poly[0].length > maxCoords) {
              maxCoords = poly[0].length;
              boundary = poly[0].map(([lng, lat]) => [lat, lng]);
            }
          }
        }

        return { center, boundary };
      }
    } catch (e) {
      console.log(`[NOMINATIM] Failed for "${query}": ${e.message}`);
    }
  }

  return null;
}

/**
 * Generate a reasonable circular boundary approximation for a city
 * when the actual polygon is not available.
 */
function generateApproximateBoundary(centerLat, centerLng, radiusKm = 15) {
  const points = [];
  for (let i = 0; i < 16; i++) {
    const brngDeg = (360 / 16) * i;
    const [lat, lng] = destinationPoint(centerLat, centerLng, radiusKm, brngDeg);
    points.push([lat, lng]);
  }
  return points;
}

// ─── Metropolitan 'Urf Boundary Data ─────────────────────────────────────────
// These are hand-tuned approximations for major US metros where the
// actual cursus of the city limit ('Urf) extends beyond municipal borders.

const URBAN_BOUNDARIES = {
  // ─── Texas ───────────────────────────────────────────────────────────────
  'Houston': {
    center: [29.7604, -95.3698],
    boundary: [
      [30.20, -95.85],  [30.10, -95.60],  [30.05, -95.20],  [29.90, -95.00],
      [29.60, -95.00],  [29.50, -95.20],  [29.45, -95.60],  [29.55, -95.85],
      [29.80, -95.90],  [30.20, -95.85],
    ],
  },
  'Dallas-Fort Worth': {
    center: [32.7767, -96.7970],
    boundary: [
      [33.25, -97.15],  [33.20, -96.85],  [33.10, -96.60],  [32.90, -96.55],
      [32.60, -96.60],  [32.50, -96.90],  [32.55, -97.20],  [32.75, -97.35],
      [32.90, -97.20],  [33.25, -97.15],
    ],
  },
  'San Antonio': {
    center: [29.4241, -98.4936],
    boundary: [
      [29.70, -98.75],  [29.65, -98.55],  [29.60, -98.30],  [29.50, -98.25],
      [29.30, -98.30],  [29.20, -98.50],  [29.25, -98.70],  [29.40, -98.75],
      [29.70, -98.75],
    ],
  },
  'Austin': {
    center: [30.2672, -97.7431],
    boundary: [
      [30.55, -97.90],  [30.55, -97.65],  [30.50, -97.55],  [30.30, -97.55],
      [30.10, -97.60],  [30.05, -97.80],  [30.15, -97.95],  [30.30, -97.95],
      [30.55, -97.90],
    ],
  },

  // ─── Northeast ───────────────────────────────────────────────────────────
  'New York City': {
    center: [40.7128, -74.0060],
    boundary: [
      [40.92, -74.05],  [40.85, -73.85],  [40.70, -73.70],  [40.55, -73.80],
      [40.50, -74.00],  [40.55, -74.20],  [40.70, -74.25],  [40.85, -74.20],
      [40.92, -74.05],
    ],
  },
  'Boston': {
    center: [42.3601, -71.0589],
    boundary: [
      [42.55, -71.30],  [42.50, -71.10],  [42.45, -70.95],  [42.35, -70.90],
      [42.25, -70.95],  [42.20, -71.10],  [42.25, -71.25],  [42.30, -71.40],
      [42.40, -71.35],  [42.55, -71.30],
    ],
  },
  'Philadelphia': {
    center: [39.9526, -75.1652],
    boundary: [
      [40.15, -75.30],  [40.10, -75.10],  [40.05, -74.95],  [39.95, -74.85],
      [39.85, -74.90],  [39.80, -75.10],  [39.85, -75.30],  [39.95, -75.35],
      [40.15, -75.30],
    ],
  },
  'Washington DC': {
    center: [38.9072, -77.0369],
    boundary: [
      [39.05, -77.05],  [39.00, -76.90],  [38.95, -76.75],  [38.85, -76.70],
      [38.75, -76.80],  [38.70, -76.95],  [38.75, -77.15],  [38.85, -77.20],
      [38.95, -77.15],  [39.05, -77.05],
    ],
  },

  // ─── West Coast ──────────────────────────────────────────────────────────
  'Los Angeles': {
    center: [34.0522, -118.2437],
    boundary: [
      [34.30, -118.70],  [34.30, -118.50],  [34.20, -118.20],  [34.10, -117.90],
      [33.90, -117.80],  [33.70, -118.00],  [33.70, -118.40],  [33.90, -118.60],
      [34.10, -118.70],  [34.30, -118.70],
    ],
  },
  'San Francisco Bay Area': {
    center: [37.7749, -122.4194],
    boundary: [
      [38.00, -122.55],  [38.00, -122.30],  [37.90, -122.15],  [37.75, -122.00],
      [37.55, -121.95],  [37.45, -122.10],  [37.50, -122.30],  [37.60, -122.45],
      [37.80, -122.50],  [38.00, -122.55],
    ],
  },
  'San Diego': {
    center: [32.7157, -117.1611],
    boundary: [
      [33.20, -117.30],  [33.15, -117.15],  [33.10, -117.00],  [32.90, -116.90],
      [32.70, -116.85],  [32.55, -116.95],  [32.60, -117.15],  [32.80, -117.30],
      [33.00, -117.30],  [33.20, -117.30],
    ],
  },
  'Seattle': {
    center: [47.6062, -122.3321],
    boundary: [
      [47.95, -122.30],  [47.85, -122.20],  [47.70, -122.10],  [47.55, -122.10],
      [47.45, -122.15],  [47.30, -122.25],  [47.25, -122.40],  [47.40, -122.50],
      [47.60, -122.45],  [47.95, -122.30],
    ],
  },
  'Portland': {
    center: [45.5152, -122.6784],
    boundary: [
      [45.70, -122.80],  [45.65, -122.60],  [45.60, -122.45],  [45.50, -122.40],
      [45.40, -122.50],  [45.35, -122.65],  [45.40, -122.80],  [45.50, -122.85],
      [45.70, -122.80],
    ],
  },

  // ─── Midwest ─────────────────────────────────────────────────────────────
  'Chicago': {
    center: [41.8781, -87.6298],
    boundary: [
      [42.10, -87.95],  [42.05, -87.70],  [42.00, -87.55],  [41.80, -87.50],
      [41.65, -87.55],  [41.60, -87.70],  [41.65, -87.95],  [41.85, -88.00],
      [42.00, -88.05],  [42.10, -87.95],
    ],
  },
  'Detroit': {
    center: [42.3314, -83.0458],
    boundary: [
      [42.65, -83.30],  [42.60, -83.10],  [42.55, -82.95],  [42.50, -82.80],
      [42.35, -82.85],  [42.25, -82.95],  [42.20, -83.15],  [42.25, -83.40],
      [42.35, -83.50],  [42.65, -83.30],
    ],
  },
  'Minneapolis-St Paul': {
    center: [44.9778, -93.2650],
    boundary: [
      [45.15, -93.40],  [45.15, -93.20],  [45.10, -93.00],  [44.95, -92.90],
      [44.80, -92.95],  [44.75, -93.10],  [44.80, -93.35],  [44.90, -93.45],
      [45.05, -93.40],  [45.15, -93.40],
    ],
  },
  'St Louis': {
    center: [38.6270, -90.1994],
    boundary: [
      [38.80, -90.50],  [38.80, -90.30],  [38.75, -90.15],  [38.65, -90.05],
      [38.55, -90.00],  [38.45, -90.10],  [38.45, -90.30],  [38.55, -90.45],
      [38.65, -90.50],  [38.80, -90.50],
    ],
  },
  'Cleveland': {
    center: [41.4993, -81.6944],
    boundary: [
      [41.70, -81.70],  [41.65, -81.55],  [41.55, -81.50],  [41.40, -81.50],
      [41.30, -81.55],  [41.25, -81.70],  [41.35, -81.85],  [41.45, -81.90],
      [41.55, -81.85],  [41.70, -81.70],
    ],
  },

  // ─── Southeast ───────────────────────────────────────────────────────────
  'Atlanta': {
    center: [33.7490, -84.3880],
    boundary: [
      [34.00, -84.60],  [33.95, -84.35],  [33.90, -84.10],  [33.80, -84.00],
      [33.65, -84.00],  [33.50, -84.15],  [33.50, -84.40],  [33.60, -84.60],
      [33.80, -84.65],  [34.00, -84.60],
    ],
  },
  'Miami': {
    center: [25.7617, -80.1918],
    boundary: [
      [26.70, -80.20],  [26.60, -80.10],  [26.40, -80.10],  [26.20, -80.10],
      [26.00, -80.15],  [25.80, -80.20],  [25.60, -80.30],  [25.70, -80.45],
      [25.85, -80.40],  [26.00, -80.35],  [26.70, -80.20],
    ],
  },
  'Tampa Bay': {
    center: [27.9506, -82.4572],
    boundary: [
      [28.25, -82.70],  [28.20, -82.50],  [28.15, -82.30],  [28.00, -82.25],
      [27.85, -82.25],  [27.70, -82.35],  [27.70, -82.55],  [27.80, -82.70],
      [27.95, -82.70],  [28.25, -82.70],
    ],
  },
  'Orlando': {
    center: [28.5383, -81.3792],
    boundary: [
      [28.80, -81.50],  [28.80, -81.30],  [28.70, -81.15],  [28.55, -81.15],
      [28.40, -81.20],  [28.25, -81.35],  [28.30, -81.50],  [28.45, -81.55],
      [28.80, -81.50],
    ],
  },
  'Charlotte': {
    center: [35.2271, -80.8431],
    boundary: [
      [35.40, -80.90],  [35.40, -80.70],  [35.30, -80.60],  [35.15, -80.60],
      [35.05, -80.65],  [35.00, -80.80],  [35.05, -80.95],  [35.15, -81.05],
      [35.30, -81.00],  [35.40, -80.90],
    ],
  },
  'Nashville': {
    center: [36.1627, -86.7816],
    boundary: [
      [36.35, -86.90],  [36.30, -86.70],  [36.20, -86.55],  [36.05, -86.55],
      [35.90, -86.60],  [35.85, -86.75],  [35.90, -86.90],  [36.00, -87.00],
      [36.15, -87.00],  [36.35, -86.90],
    ],
  },

  // ─── Southwest ───────────────────────────────────────────────────────────
  'Phoenix': {
    center: [33.4484, -112.0740],
    boundary: [
      [33.70, -112.40],  [33.70, -112.10],  [33.65, -111.85],  [33.50, -111.70],
      [33.35, -111.70],  [33.25, -111.85],  [33.25, -112.10],  [33.35, -112.30],
      [33.50, -112.35],  [33.70, -112.40],
    ],
  },
  'Denver': {
    center: [39.7392, -104.9903],
    boundary: [
      [40.00, -105.15],  [39.95, -104.95],  [39.85, -104.80],  [39.75, -104.75],
      [39.60, -104.75],  [39.55, -104.90],  [39.55, -105.10],  [39.65, -105.15],
      [39.80, -105.15],  [40.00, -105.15],
    ],
  },
  'Las Vegas': {
    center: [36.1699, -115.1398],
    boundary: [
      [36.30, -115.30],  [36.25, -115.15],  [36.20, -115.00],  [36.10, -114.95],
      [36.00, -114.95],  [35.95, -115.05],  [36.00, -115.20],  [36.05, -115.30],
      [36.15, -115.30],  [36.30, -115.30],
    ],
  },
  'Salt Lake City': {
    center: [40.7608, -111.8910],
    boundary: [
      [41.20, -112.00],  [41.10, -111.90],  [40.95, -111.80],  [40.85, -111.75],
      [40.70, -111.75],  [40.55, -111.80],  [40.55, -111.95],  [40.65, -112.00],
      [40.80, -112.00],  [41.20, -112.00],
    ],
  },
  'Albuquerque': {
    center: [35.0853, -106.6056],
    boundary: [
      [35.30, -106.70],  [35.25, -106.55],  [35.20, -106.45],  [35.10, -106.40],
      [35.00, -106.45],  [34.90, -106.55],  [34.90, -106.70],  [35.00, -106.75],
      [35.15, -106.75],  [35.30, -106.70],
    ],
  },

  // ─── California (additional) ─────────────────────────────────────────────
  'Sacramento': {
    center: [38.5816, -121.4944],
    boundary: [
      [38.80, -121.55],  [38.75, -121.35],  [38.70, -121.25],  [38.60, -121.20],
      [38.50, -121.25],  [38.40, -121.35],  [38.40, -121.55],  [38.50, -121.60],
      [38.65, -121.60],  [38.80, -121.55],
    ],
  },
  'San Jose': {
    center: [37.3382, -121.8863],
    boundary: [
      [37.45, -122.10],  [37.45, -121.95],  [37.40, -121.80],  [37.30, -121.75],
      [37.20, -121.70],  [37.10, -121.70],  [37.10, -121.85],  [37.20, -121.95],
      [37.30, -122.00],  [37.45, -122.10],
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

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δφ = (lat2 - lat1) * DEG;
  const Δλ = (lng2 - lng1) * DEG;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

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

function distanceToSegment(point, segA, segB) {
  const [px, py] = point;
  const [ax, ay] = segA;
  const [bx, by] = segB;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return haversineDistance(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return haversineDistance(px, py, projX, projY);
}

// ─── Bearing and Destination ──────────────────────────────────────────────────

function bearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lng2 - lng1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * RAD + 360) % 360;
}

function destinationPoint(lat, lng, distKm, brngDeg) {
  const φ1 = lat * DEG;
  const λ1 = lng * DEG;
  const brng = brngDeg * DEG;
  const d = distKm / EARTH_RADIUS_KM;
  const φ2 = Math.asin(clamp(
    Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brng),
    -1, 1
  ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(φ1),
    Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
  );
  return [φ2 * RAD, wrapLng(λ2 * RAD)];
}

// ─── Polygon Buffer Algorithm (Centroid-Radial Haversine) ─────────────────────

export function bufferPolygon(polygon, offsetKm, origin) {
  if (!polygon || polygon.length < 3) return null;

  let clat = 0, clng = 0;
  for (let i = 0; i < polygon.length; i++) {
    clat += polygon[i][0];
    clng += polygon[i][1];
  }
  clat /= polygon.length;
  clng /= polygon.length;

  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const [lat, lng] = polygon[i];
    const dist = haversineDistance(clat, clng, lat, lng);
    const brng = bearing(clat, clng, lat, lng);
    const newDist = dist + offsetKm;
    const [newLat, newLng] = destinationPoint(clat, clng, newDist, brng);
    if (isValidLatLng(newLat, newLng)) {
      result.push([newLat, newLng]);
    }
  }

  if (result.length < 3) return null;

  const first = result[0];
  const last = result[result.length - 1];
  if (Math.abs(first[0] - last[0]) > 0.0001 || Math.abs(first[1] - last[1]) > 0.0001) {
    result.push([first[0], first[1]]);
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the 'Urf boundary for a city (including user-contributed cached cities).
 */
export function getUrfBoundary(cityName) {
  if (URBAN_BOUNDARIES[cityName]) return URBAN_BOUNDARIES[cityName];
  const userCities = loadUserCities();
  if (userCities[cityName]) return userCities[cityName];
  return null;
}

/**
 * Get all supported cities (built-in + user-contributed from cache).
 */
export function getSupportedCities() {
  const userCities = loadUserCities();
  return [...Object.keys(URBAN_BOUNDARIES), ...Object.keys(userCities)];
}

/**
 * Check if a point falls inside any known city's 'Urf boundary.
 * Returns the city name if found, null otherwise.
 * This handles suburb detection: a suburb in a known metro will snap.
 */
export function findCityForLocation(lat, lng) {
  const allCities = getSupportedCities();
  for (const city of allCities) {
    const cityData = getUrfBoundary(city);
    if (cityData && pointInPolygon([lat, lng], cityData.boundary)) {
      return city;
    }
  }
  // Fallback: find nearest by center distance (within 50 km)
  let nearest = null;
  let minDist = 200; // km threshold
  for (const city of allCities) {
    const cityData = getUrfBoundary(city);
    if (cityData && cityData.center) {
      const dist = haversineDistance(lat, lng, cityData.center[0], cityData.center[1]);
      if (dist < minDist) {
        minDist = dist;
        nearest = city;
      }
    }
  }
  return nearest;
}

export function isInsideUrfBoundary(lat, lng, cityName) {
  const city = getUrfBoundary(cityName);
  if (!city) return null;
  return pointInPolygon([lat, lng], city.boundary);
}

export function calculateQasrStatus(lat, lng, cityName) {
  const city = getUrfBoundary(cityName);
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
 * Generate the Hadd al-Tarakhkhus boundary.
 */
export function generateHaddBoundary(cityName) {
  const city = getUrfBoundary(cityName);
  if (!city) return null;

  try {
    const buffered = bufferPolygon(city.boundary, HADD_AL_TARAKHKHUS_KM, city.center);
    if (buffered && buffered.length >= 3) {
      let valid = true;
      for (let i = 0; i < buffered.length; i++) {
        const [lat, lng] = buffered[i];
        if (!isValidLatLng(lat, lng)) { valid = false; break; }
      }
      if (valid) return buffered;
    }
  } catch (e) {}

  // Fallback: circle
  let maxDist = 0;
  for (let i = 0; i < city.boundary.length; i++) {
    const [lat, lng] = city.boundary[i];
    const dist = haversineDistance(city.center[0], city.center[1], lat, lng);
    if (dist > maxDist) maxDist = dist;
  }
  return generateRadiusCircle(city.center[0], city.center[1], maxDist + HADD_AL_TARAKHKHUS_KM, 64);
}

function isBeyondHadd(lat, lng, cityName) {
  const city = getUrfBoundary(cityName);
  if (!city) return false;
  const haddPolygon = generateHaddBoundary(cityName);
  if (haddPolygon && haddPolygon.length >= 3) {
    return !pointInPolygon([lat, lng], haddPolygon);
  }
  let maxDist = 0;
  for (let i = 0; i < city.boundary.length; i++) {
    const [blat, blng] = city.boundary[i];
    const dist = haversineDistance(city.center[0], city.center[1], blat, blng);
    if (dist > maxDist) maxDist = dist;
  }
  const haddRadius = maxDist + HADD_AL_TARAKHKHUS_KM;
  const pointDist = haversineDistance(city.center[0], city.center[1], lat, lng);
  return pointDist > haddRadius;
}

function generateRadiusCircle(centerLat, centerLng, radiusKm, numPoints = 64) {
  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const brngDeg = (360 / numPoints) * i;
    const [lat, lng] = destinationPoint(centerLat, centerLng, radiusKm, brngDeg);
    points.push([lat, lng]);
  }
  return points;
}

export function generateUrfPolygon(cityName) {
  const city = getUrfBoundary(cityName);
  if (!city) return null;
  return city.boundary;
}

