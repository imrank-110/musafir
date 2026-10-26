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
export const HADD_AL_TARAKHKHUS_KM = 22; // 22 km = 13.7 miles (round-trip: 8 farsakhs)
export const ONE_WAY_HADD_KM = 44; // 44 km = 27.3 miles (one-way: 8 farsakhs)

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter';
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

  // ─── Additional US Cities ─────────────────────────────────────────────────
  'New Orleans': {
    center: [29.9511, -90.0715],
    boundary: [
      [30.20, -90.30],  [30.15, -90.10],  [30.10, -89.90],  [29.95, -89.80],
      [29.80, -89.85],  [29.70, -90.00],  [29.75, -90.20],  [29.90, -90.30],
      [30.20, -90.30],
    ],
  },
  'Memphis': {
    center: [35.1495, -90.0490],
    boundary: [
      [35.40, -90.10],  [35.35, -89.90],  [35.25, -89.80],  [35.10, -89.80],
      [34.95, -89.90],  [34.90, -90.10],  [35.00, -90.20],  [35.15, -90.20],
      [35.40, -90.10],
    ],
  },
  'Louisville': {
    center: [38.2527, -85.7585],
    boundary: [
      [38.45, -85.90],  [38.40, -85.70],  [38.30, -85.55],  [38.15, -85.55],
      [38.05, -85.65],  [38.00, -85.80],  [38.10, -85.95],  [38.25, -85.95],
      [38.45, -85.90],
    ],
  },
  'Cincinnati': {
    center: [39.1031, -84.5120],
    boundary: [
      [39.35, -84.70],  [39.30, -84.50],  [39.20, -84.35],  [39.05, -84.30],
      [38.90, -84.35],  [38.85, -84.50],  [38.90, -84.70],  [39.05, -84.75],
      [39.20, -84.75],  [39.35, -84.70],
    ],
  },
  'Columbus': {
    center: [39.9612, -82.9988],
    boundary: [
      [40.20, -83.20],  [40.15, -83.00],  [40.05, -82.80],  [39.90, -82.75],
      [39.75, -82.80],  [39.70, -83.00],  [39.75, -83.20],  [39.90, -83.25],
      [40.20, -83.20],
    ],
  },
  'Indianapolis': {
    center: [39.7684, -86.1581],
    boundary: [
      [40.00, -86.40],  [39.95, -86.20],  [39.85, -86.00],  [39.70, -85.95],
      [39.55, -86.00],  [39.50, -86.20],  [39.55, -86.40],  [39.70, -86.45],
      [40.00, -86.40],
    ],
  },
  'Kansas City': {
    center: [39.0997, -94.5786],
    boundary: [
      [39.40, -94.80],  [39.35, -94.60],  [39.25, -94.40],  [39.10, -94.35],
      [38.95, -94.40],  [38.90, -94.60],  [38.95, -94.80],  [39.10, -94.85],
      [39.40, -94.80],
    ],
  },
  'Omaha': {
    center: [41.2565, -95.9345],
    boundary: [
      [41.50, -96.10],  [41.45, -95.90],  [41.35, -95.75],  [41.20, -95.75],
      [41.05, -95.85],  [41.00, -96.00],  [41.10, -96.15],  [41.25, -96.15],
      [41.50, -96.10],
    ],
  },
  'Milwaukee': {
    center: [43.0389, -87.9065],
    boundary: [
      [43.25, -88.10],  [43.20, -87.90],  [43.10, -87.75],  [42.95, -87.75],
      [42.85, -87.85],  [42.80, -88.00],  [42.90, -88.15],  [43.05, -88.15],
      [43.25, -88.10],
    ],
  },
  'Pittsburgh': {
    center: [40.4406, -79.9959],
    boundary: [
      [40.65, -80.10],  [40.60, -79.90],  [40.50, -79.75],  [40.35, -79.75],
      [40.25, -79.85],  [40.20, -80.00],  [40.30, -80.15],  [40.45, -80.15],
      [40.65, -80.10],
    ],
  },
  'Buffalo': {
    center: [42.8864, -78.8784],
    boundary: [
      [43.10, -78.95],  [43.05, -78.75],  [42.95, -78.65],  [42.80, -78.65],
      [42.70, -78.75],  [42.65, -78.90],  [42.75, -79.05],  [42.90, -79.05],
      [43.10, -78.95],
    ],
  },
  'Raleigh-Durham': {
    center: [35.7796, -78.6382],
    boundary: [
      [36.05, -78.90],  [36.00, -78.70],  [35.90, -78.50],  [35.75, -78.45],
      [35.60, -78.50],  [35.55, -78.70],  [35.60, -78.90],  [35.75, -78.95],
      [36.05, -78.90],
    ],
  },
  'Richmond': {
    center: [37.5407, -77.4360],
    boundary: [
      [37.75, -77.60],  [37.70, -77.40],  [37.60, -77.25],  [37.45, -77.25],
      [37.35, -77.35],  [37.30, -77.50],  [37.40, -77.65],  [37.55, -77.65],
      [37.75, -77.60],
    ],
  },
  'Oklahoma City': {
    center: [35.4676, -97.5164],
    boundary: [
      [35.70, -97.70],  [35.65, -97.50],  [35.55, -97.30],  [35.40, -97.30],
      [35.25, -97.40],  [35.20, -97.60],  [35.30, -97.75],  [35.45, -97.75],
      [35.70, -97.70],
    ],
  },
  'Tulsa': {
    center: [36.1540, -95.9928],
    boundary: [
      [36.35, -96.10],  [36.30, -95.90],  [36.20, -95.75],  [36.05, -95.75],
      [35.90, -95.85],  [35.85, -96.00],  [35.95, -96.15],  [36.10, -96.15],
      [36.35, -96.10],
    ],
  },
  'Jacksonville': {
    center: [30.3322, -81.6557],
    boundary: [
      [30.60, -81.90],  [30.55, -81.70],  [30.45, -81.50],  [30.30, -81.45],
      [30.15, -81.50],  [30.10, -81.70],  [30.20, -81.90],  [30.35, -81.95],
      [30.60, -81.90],
    ],
  },
  'San Juan': {
    center: [18.4655, -66.1057],
    boundary: [
      [18.55, -66.20],  [18.50, -66.05],  [18.45, -65.95],  [18.35, -65.95],
      [18.30, -66.05],  [18.30, -66.20],  [18.40, -66.25],  [18.55, -66.20],
    ],
  },

  // ─── Canada ───────────────────────────────────────────────────────────────
  'Toronto': {
    center: [43.6532, -79.3832],
    boundary: [
      [43.90, -79.70],  [43.85, -79.40],  [43.75, -79.20],  [43.60, -79.15],
      [43.45, -79.20],  [43.40, -79.40],  [43.45, -79.60],  [43.60, -79.70],
      [43.90, -79.70],
    ],
  },
  'Montreal': {
    center: [45.5017, -73.5673],
    boundary: [
      [45.75, -73.90],  [45.70, -73.60],  [45.60, -73.40],  [45.45, -73.35],
      [45.30, -73.40],  [45.25, -73.60],  [45.30, -73.80],  [45.45, -73.90],
      [45.75, -73.90],
    ],
  },
  'Vancouver': {
    center: [49.2827, -123.1207],
    boundary: [
      [49.50, -123.30],  [49.45, -123.10],  [49.35, -122.90],  [49.20, -122.85],
      [49.05, -122.90],  [49.00, -123.10],  [49.10, -123.30],  [49.25, -123.35],
      [49.50, -123.30],
    ],
  },
  'Calgary': {
    center: [51.0447, -114.0719],
    boundary: [
      [51.30, -114.30],  [51.25, -114.10],  [51.15, -113.90],  [51.00, -113.85],
      [50.85, -113.90],  [50.80, -114.10],  [50.90, -114.30],  [51.05, -114.35],
      [51.30, -114.30],
    ],
  },
  'Edmonton': {
    center: [53.5461, -113.4938],
    boundary: [
      [53.80, -113.70],  [53.75, -113.50],  [53.65, -113.30],  [53.50, -113.25],
      [53.35, -113.30],  [53.30, -113.50],  [53.40, -113.70],  [53.55, -113.75],
      [53.80, -113.70],
    ],
  },
  'Ottawa': {
    center: [45.4215, -75.6972],
    boundary: [
      [45.65, -75.90],  [45.60, -75.70],  [45.50, -75.50],  [45.35, -75.50],
      [45.25, -75.60],  [45.20, -75.80],  [45.30, -75.95],  [45.45, -75.95],
      [45.65, -75.90],
    ],
  },
  'Winnipeg': {
    center: [49.8951, -97.1384],
    boundary: [
      [50.15, -97.30],  [50.10, -97.10],  [50.00, -96.90],  [49.85, -96.85],
      [49.70, -96.90],  [49.65, -97.10],  [49.75, -97.30],  [49.90, -97.35],
      [50.15, -97.30],
    ],
  },
  'Quebec City': {
    center: [46.8139, -71.2080],
    boundary: [
      [47.05, -71.40],  [47.00, -71.20],  [46.90, -71.00],  [46.75, -71.00],
      [46.65, -71.10],  [46.60, -71.30],  [46.70, -71.45],  [46.85, -71.45],
      [47.05, -71.40],
    ],
  },
  'Hamilton': {
    center: [43.2557, -79.8711],
    boundary: [
      [43.45, -80.00],  [43.40, -79.80],  [43.30, -79.65],  [43.15, -79.65],
      [43.05, -79.75],  [43.00, -79.90],  [43.10, -80.05],  [43.25, -80.05],
      [43.45, -80.00],
    ],
  },
  'Halifax': {
    center: [44.6488, -63.5752],
    boundary: [
      [44.85, -63.70],  [44.80, -63.50],  [44.70, -63.35],  [44.55, -63.35],
      [44.45, -63.45],  [44.40, -63.60],  [44.50, -63.75],  [44.65, -63.75],
      [44.85, -63.70],
    ],
  },
  'London': {
    center: [42.9849, -81.2453],
    boundary: [
      [43.20, -81.40],  [43.15, -81.20],  [43.05, -81.05],  [42.90, -81.05],
      [42.80, -81.15],  [42.75, -81.30],  [42.85, -81.45],  [43.00, -81.45],
      [43.20, -81.40],
    ],
  },
  'Kitchener-Waterloo': {
    center: [43.4516, -80.4925],
    boundary: [
      [43.65, -80.60],  [43.60, -80.40],  [43.50, -80.25],  [43.35, -80.25],
      [43.25, -80.35],  [43.20, -80.50],  [43.30, -80.65],  [43.45, -80.65],
      [43.65, -80.60],
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
    message = `You are within the estimated city boundary of ${cityName}. You are considered a Resident (Hadir). Prayers: Tamam (Full). Fasting: Valid.`;
  } else if (!outsideHadd) {
    status = 'transition';
    message = `You are outside the 'Urf boundary but within ${HADD_AL_TARAKHKHUS_KM} km (${(HADD_AL_TARAKHKHUS_KM * 0.621371).toFixed(1)} miles). You have not yet reached Hadd al-Tarakhkhus. Prayers: Tamam (Full). Fasting: Valid.`;
  } else {
    status = 'traveler';
    message = `You are beyond Hadd al-Tarakhkhus (${HADD_AL_TARAKHKHUS_KM} km / ${(HADD_AL_TARAKHKHUS_KM * 0.621371).toFixed(1)} miles from the city boundary). You are considered a Traveler (Musafir). Prayers: Qasr (Shortened to 2 Rak'ahs). Fasting: Invalid (Qada required).`;
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
 * Calculate the distance from a point to the Hadd al-Tarakhkhus boundary.
 * Returns negative if inside (distance remaining), positive if outside (distance past).
 */
export function calculateDistanceToHadd(lat, lng, cityName) {
  const city = getUrfBoundary(cityName);
  if (!city) return null;

  const haddPolygon = generateHaddBoundary(cityName);
  if (haddPolygon && haddPolygon.length >= 3) {
    const insideHadd = pointInPolygon([lat, lng], haddPolygon);
    const distToHadd = distanceToPolygonBoundary([lat, lng], haddPolygon);
    return insideHadd ? -distToHadd : distToHadd;
  }

  // Fallback: circle-based
  let maxDist = 0;
  for (let i = 0; i < city.boundary.length; i++) {
    const [blat, blng] = city.boundary[i];
    const dist = haversineDistance(city.center[0], city.center[1], blat, blng);
    if (dist > maxDist) maxDist = dist;
  }
  const haddRadius = maxDist + HADD_AL_TARAKHKHUS_KM;
  const pointDist = haversineDistance(city.center[0], city.center[1], lat, lng);
  return pointDist - haddRadius;
}

/**
 * Generate a boundary polygon at a given distance from the city's 'Urf boundary.
 * @param {string} cityName
 * @param {number} distanceKm - Distance in km to buffer outward (e.g. 22 or 44)
 * @returns {[number, number][] | null}
 */
export function generateBoundaryAtDistance(cityName, distanceKm) {
  const city = getUrfBoundary(cityName);
  if (!city) return null;

  try {
    const buffered = bufferPolygon(city.boundary, distanceKm, city.center);
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
  return generateRadiusCircle(city.center[0], city.center[1], maxDist + distanceKm, 64);
}

/**
 * Generate the Hadd al-Tarakhkhus boundary (22 km round-trip).
 */
export function generateHaddBoundary(cityName) {
  return generateBoundaryAtDistance(cityName, HADD_AL_TARAKHKHUS_KM);
}

/**
 * Generate the one-way boundary (44 km).
 */
export function generateOneWayBoundary(cityName) {
  return generateBoundaryAtDistance(cityName, ONE_WAY_HADD_KM);
}

function isBeyondHadd(lat, lng, cityName, boundaryType) {
  const city = getUrfBoundary(cityName);
  if (!city) return false;
  const distance = boundaryType === 'one-way' ? ONE_WAY_HADD_KM : HADD_AL_TARAKHKHUS_KM;
  const boundaryPolygon = generateBoundaryAtDistance(cityName, distance);
  if (boundaryPolygon && boundaryPolygon.length >= 3) {
    return !pointInPolygon([lat, lng], boundaryPolygon);
  }
  let maxDist = 0;
  for (let i = 0; i < city.boundary.length; i++) {
    const [blat, blng] = city.boundary[i];
    const dist = haversineDistance(city.center[0], city.center[1], blat, blng);
    if (dist > maxDist) maxDist = dist;
  }
  const haddRadius = maxDist + distance;
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
// ─── Hadd al-Tarakhkhus (Visibility/Audibility Zone) ──────────────────────────
//
// IMPORTANT FIQH NOTE: The Hadd al-Tarakhkhus is NOT the 8-farsakh journey
// distance. Per Ayatollah Sistani, it is the point beyond which the walls of
// one's city can no longer be seen and the adhan can no longer be heard. It is
// typically MUCH CLOSER than the 'Urf boundary + the 8-farsakh threshold.
// Since many modern cities have no walls or public adhan, this is inherently
// subjective and must be determined by the mukallaf (the individual). We
// provide a data-driven *recommendation* based on the city's physical size
// (larger metros tend to have taller/denser edge development, visible from
// further away), but let the user adjust it via a slider.

const DEFAULT_HADD_RANGE = { min: 2, recommended: 6, max: 14 };

function estimateCityRadiusKm(cityData) {
  if (!cityData || !cityData.boundary || cityData.boundary.length === 0) return 10;
  let total = 0;
  for (let i = 0; i < cityData.boundary.length; i++) {
    const [lat, lng] = cityData.boundary[i];
    total += haversineDistance(cityData.center[0], cityData.center[1], lat, lng);
  }
  return total / cityData.boundary.length;
}

export function getHaddRange(cityName) {
  const city = getUrfBoundary(cityName);
  if (!city) return { ...DEFAULT_HADD_RANGE, radiusKm: 10, isDefault: true };
  if (city.haddRange) return { ...city.haddRange, radiusKm: estimateCityRadiusKm(city), isDefault: false };
  const radiusKm = estimateCityRadiusKm(city);
  const recommended = clamp(3.2 * Math.sqrt(radiusKm), 4, 13);
  const minKm = clamp(recommended * 0.4, 2, recommended - 1);
  const maxKm = clamp(recommended * 1.8, recommended + 1, 16);
  return {
    min: Math.round(minKm * 10) / 10,
    recommended: Math.round(recommended * 10) / 10,
    max: Math.round(maxKm * 10) / 10,
    radiusKm: Math.round(radiusKm * 10) / 10,
    isDefault: false,
  };
}
export function generateHaddZonePolygon(cityName, distanceKm) {
  const city = getUrfBoundary(cityName);
  if (!city) return null;
  const range = getHaddRange(cityName);
  const clamped = clamp(distanceKm, range.min, range.max);
  return generateBoundaryAtDistance(cityName, clamped);
}

export function calculateStatusWithHadd(lat, lng, cityName, userHaddKm, journeyFarsakhs) {
  const city = getUrfBoundary(cityName);
  if (!city) {
    return { status: "unknown", message: `No boundary data for "${cityName}". Please consult your local Islamic authority.` };
  }
  const insideUrf = pointInPolygon([lat, lng], city.boundary);
  if (insideUrf) {
    return {
      status: "resident",
      message: `You are within the city boundary of ${cityName}. You are a Resident (Hadir). Prayers: Tamam (Full). Fasting: Valid.`,
      detail: "inside-urf",
      cityName,
    };
  }
  const haddPolygon = generateHaddZonePolygon(cityName, userHaddKm);
  let pastHadd = false;
  if (haddPolygon && haddPolygon.length >= 3) {
    pastHadd = !pointInPolygon([lat, lng], haddPolygon);
  }
  if (!pastHadd) {
    return {
      status: "resident",
      message: `You have left the 'Urf boundary but are still within the Hadd al-Tarakhkhus (${userHaddKm} km). You have not yet "left" the city. You are a Resident (Hadir). Prayers: Tamam (Full). Fasting: Valid.`,
      detail: "before-hadd",
      userHaddKm,
      cityName,
    };
  }
  if (journeyFarsakhs < 8) {
    return {
      status: "resident",
      message: `You are past the Hadd al-Tarakhkhus (${userHaddKm} km), but your intended journey (${journeyFarsakhs} farsakhs) is less than 8. You are still a Resident (Hadir).`,
      detail: "past-hadd-but-short-journey",
      userHaddKm,
      journeyFarsakhs,
      cityName,
    };
  }
  return {
    status: "traveler",
    message: `You are past the Hadd al-Tarakhkhus (${userHaddKm} km) and your intended journey (${journeyFarsakhs} farsakhs) is 8 or more. You are a Traveler (Musafir). Prayers: Qasr (Shortened to 2 Rak'ahs). Fasting: Invalid (Qada required).`,
    detail: "traveler",
    userHaddKm,
    journeyFarsakhs,
    cityName,
  };
}

// ─── Overpass API: Fetch Built-Up Area (True 'Urf Boundary) ─────────────────

/**
 * Fetch the actual built-up area of a city using OpenStreetMap's Overpass API.
 * This queries for residential, commercial, and industrial landuse polygons
 * and merges them into a single outline — giving a much better 'Urf boundary
 * approximation than the administrative city limit.
 *
 * @param {string} cityName
 * @param {string} state - Optional state for disambiguation
 * @returns {Promise<{center: [number, number], boundary: [number, number][]} | null>}
 */
export async function fetchUrfBoundary(cityName, state) {
  // First get the city center via Nominatim
  const queries = state
    ? [`${cityName}, ${state}, USA`, `${cityName}, USA`, `${cityName}`]
    : [`${cityName}`, `${cityName}, USA`];

  let center = null;
  for (const query of queries) {
    try {
      const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;
      const results = await fetchWithThrottle(url);
      if (results && results.length > 0) {
        center = [parseFloat(results[0].lat), parseFloat(results[0].lon)];
        break;
      }
    } catch {}
  }
  if (!center) return null;

  // Query Overpass for built-up landuse areas within 30 km of the city center
  const overpassQuery = `
    [out:json][timeout:15];
    (
      way["landuse"~"residential|commercial|industrial|retail|mixed"](around:30000,${center[0]},${center[1]});
      relation["landuse"~"residential|commercial|industrial|retail|mixed"](around:30000,${center[0]},${center[1]});
    );
    out geom;
  `;

  try {
    const response = await fetch(OVERPASS_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });
    const data = await response.json();

    // Collect all polygon coordinates from the results
    const allPoints = [];
    const elements = data.elements || [];
    for (const el of elements) {
      if (el.geometry && el.geometry.length > 0) {
        for (const node of el.geometry) {
          allPoints.push([node.lat, node.lon]);
        }
      }
    }

    if (allPoints.length < 10) {
      // Not enough built-up data — fall back to a circular approximation
      return { center, boundary: generateApproximateBoundary(center[0], center[1], 15) };
    }

    // Use the actual OSM polygon geometry directly — find the element with the
    // most nodes (the largest residential polygon) and use its boundary as-is,
    // preserving real street/house contours instead of wrapping everything in
    // an artificial convex hull.
    let bestGeom = null;
    let bestLen = 0;
    for (const el of elements) {
      if (el.geometry && el.geometry.length > bestLen) {
        bestLen = el.geometry.length;
        bestGeom = el.geometry.map(n => [n.lat, n.lon]);
      }
    }
    if (bestGeom && bestGeom.length >= 3) {
      // Close the polygon
      const first = bestGeom[0];
      const last = bestGeom[bestGeom.length - 1];
      if (Math.abs(first[0] - last[0]) > 0.0001 || Math.abs(first[1] - last[1]) > 0.0001) {
        bestGeom.push([first[0], first[1]]);
      }
      return { center, boundary: bestGeom };
    }

    return { center, boundary: generateApproximateBoundary(center[0], center[1], 15) };
  } catch (e) {
    console.log(`[OVERPASS] Failed for ${cityName}: ${e.message}`);
    return { center, boundary: generateApproximateBoundary(center[0], center[1], 15) };
  }
}

// ─── Convex Hull (Monotone Chain) ─────────────────────────────────────────────

function convexHull(points) {
  if (points.length < 3) return null;

  // Sort by lat then lng
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const lower = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
      lower.pop();
    }
    lower.push(sorted[i]);
  }

  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
      upper.pop();
    }
    upper.push(sorted[i]);
  }

  // Remove last point of each list (it's repeated as first of the other)
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// ─── Origin-Based Status Calculation ──────────────────────────────────────────

/**
 * Calculate Qasr status based on distance from a journey origin city.
 * This handles the case where someone is in a remote area — we check
 * if they've traveled far enough from their origin to be a traveler.
 *
 * @param {number} currentLat
 * @param {number} currentLng
 * @param {string} originCityName - The city where the journey started
 * @param {string} boundaryType - 'round-trip' or 'one-way'
 * @returns {Object} Status object
 */
export function calculateQasrStatusFromOrigin(currentLat, currentLng, originCityName, boundaryType = 'round-trip') {
  const city = getUrfBoundary(originCityName);
  if (!city) {
    return {
      status: 'unknown',
      message: `No boundary data for origin city "${originCityName}". Please select a supported city.`,
      distanceFromOrigin: null,
      haddDistance: boundaryType === 'one-way' ? ONE_WAY_HADD_KM : HADD_AL_TARAKHKHUS_KM,
      originCity: originCityName,
    };
  }

  const distance = boundaryType === 'one-way' ? ONE_WAY_HADD_KM : HADD_AL_TARAKHKHUS_KM;
  const distFromOrigin = haversineDistance(currentLat, currentLng, city.center[0], city.center[1]);

  // Check if still inside the origin's 'Urf boundary
  const insideUrf = pointInPolygon([currentLat, currentLng], city.boundary);

  // Check if beyond the Hadd boundary from origin
  const haddPolygon = generateBoundaryAtDistance(originCityName, distance);
  let beyondHadd = false;
  if (haddPolygon && haddPolygon.length >= 3) {
    beyondHadd = !pointInPolygon([currentLat, currentLng], haddPolygon);
  } else {
    // Fallback: circle-based check
    let maxDist = 0;
    for (let i = 0; i < city.boundary.length; i++) {
      const [blat, blng] = city.boundary[i];
      const d = haversineDistance(city.center[0], city.center[1], blat, blng);
      if (d > maxDist) maxDist = d;
    }
    const haddRadius = maxDist + distance;
    beyondHadd = distFromOrigin > haddRadius;
  }

  let status;
  let message;

  if (insideUrf) {
    status = 'resident';
    message = `You are still within the city boundary of your origin (${originCityName}). You are a Resident (Hadir). Prayers: Tamam (Full). Fasting: Valid.`;
  } else if (!beyondHadd) {
    status = 'transition';
    message = `You have left the city boundary of ${originCityName} but have not yet reached Hadd al-Tarakhkhus (${distance} km). Prayers: Tamam (Full). Fasting: Valid.`;
  } else {
    status = 'traveler';
    message = `You are beyond Hadd al-Tarakhkhus (${distance} km) from your origin (${originCityName}). You are a Traveler (Musafir). Prayers: Qasr (Shortened to 2 Rak'ahs). Fasting: Invalid (Qada required).`;
  }

  return {
    status,
    message,
    distanceFromOrigin: distFromOrigin,
    isInsideUrf: insideUrf,
    isBeyondHadd: beyondHadd,
    haddDistance: distance,
    originCity: originCityName,
    originCenter: city.center,
    originBoundary: city.boundary,
  };
}
