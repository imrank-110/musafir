/**
 * flightApi.js — Mock Aviation API & Flight Path Engine
 *
 * Simulates a REST aviation API (Aviationstack / AirLabs style) for
 * pre-takeoff tracking, then switches to offline dead-reckoning mode
 * once the aircraft departs.
 *
 * Uses Great Circle navigation to project the plane's position
 * minute-by-minute along the flight path.
 */

// ─── Airport Database ────────────────────────────────────────────────────────

const AIRPORTS = {
  'JFK': { name: 'John F. Kennedy International', lat: 40.6413, lng: -73.7781, tz: -5, city: 'New York' },
  'LHR': { name: 'London Heathrow', lat: 51.4700, lng: -0.4543, tz: 0, city: 'London' },
  'DXB': { name: 'Dubai International', lat: 25.2532, lng: 55.3657, tz: 4, city: 'Dubai' },
  'DOH': { name: 'Hamad International', lat: 25.2731, lng: 51.6080, tz: 3, city: 'Doha' },
  'IST': { name: 'Istanbul Airport', lat: 41.2608, lng: 28.7423, tz: 3, city: 'Istanbul' },
  'ORD': { name: "O'Hare International", lat: 41.9742, lng: -87.9073, tz: -6, city: 'Chicago' },
  'IAH': { name: 'George Bush Intercontinental', lat: 29.9902, lng: -95.3368, tz: -6, city: 'Houston' },
  'LAX': { name: 'Los Angeles International', lat: 33.9416, lng: -118.4085, tz: -8, city: 'Los Angeles' },
  'CDG': { name: 'Charles de Gaulle', lat: 49.0097, lng: 2.5479, tz: 1, city: 'Paris' },
  'SYD': { name: 'Sydney Kingsford Smith', lat: -33.9399, lng: 151.1753, tz: 11, city: 'Sydney' },
  'KUL': { name: 'Kuala Lumpur International', lat: 2.7456, lng: 101.7072, tz: 8, city: 'Kuala Lumpur' },
  'BAH': { name: 'Bahrain International', lat: 26.2708, lng: 50.6336, tz: 3, city: 'Manama' },
  'RUH': { name: 'King Khalid International', lat: 24.9577, lng: 46.6988, tz: 3, city: 'Riyadh' },
  'JED': { name: 'King Abdulaziz International', lat: 21.6796, lng: 39.1565, tz: 3, city: 'Jeddah' },
  'MAD': { name: 'Adolfo Suárez Madrid–Barajas', lat: 40.4983, lng: -3.5676, tz: 1, city: 'Madrid' },
  'FRA': { name: 'Frankfurt Airport', lat: 50.0379, lng: 8.5622, tz: 1, city: 'Frankfurt' },
  'SIN': { name: 'Singapore Changi', lat: 1.3644, lng: 103.9915, tz: 8, city: 'Singapore' },
  'HND': { name: 'Tokyo Haneda', lat: 35.5494, lng: 139.7798, tz: 9, city: 'Tokyo' },
  'YYZ': { name: 'Toronto Pearson', lat: 43.6777, lng: -79.6248, tz: -5, city: 'Toronto' },
  'AMS': { name: 'Amsterdam Schiphol', lat: 52.3105, lng: 4.7683, tz: 1, city: 'Amsterdam' },
};

// ─── Route Database ──────────────────────────────────────────────────────────

const ROUTES = {
  'QR774': { dep: 'DOH', arr: 'IAH', duration: 16 * 60 + 20 }, // Doha → Houston ~16h20m
  'QR725': { dep: 'DOH', arr: 'LHR', duration: 7 * 60 + 30 },
  'QR920': { dep: 'DOH', arr: 'SYD', duration: 14 * 60 + 0 },
  'EK201': { dep: 'DXB', arr: 'JFK', duration: 14 * 60 + 0 },
  'EK001': { dep: 'DXB', arr: 'LHR', duration: 7 * 60 + 15 },
  'TK001': { dep: 'IST', arr: 'JFK', duration: 10 * 60 + 30 },
  'TK002': { dep: 'IST', arr: 'LAX', duration: 13 * 60 + 0 },
  'BA001': { dep: 'LHR', arr: 'JFK', duration: 7 * 60 + 45 },
  'BA002': { dep: 'LHR', arr: 'DXB', duration: 6 * 60 + 30 },
  'LH400': { dep: 'FRA', arr: 'JFK', duration: 8 * 60 + 30 },
  'SQ001': { dep: 'SIN', arr: 'HND', duration: 6 * 60 + 45 },
  'SQ002': { dep: 'SIN', arr: 'LHR', duration: 13 * 60 + 0 },
  'AA100': { dep: 'JFK', arr: 'LAX', duration: 6 * 60 + 0 },
  'UA200': { dep: 'ORD', arr: 'LHR', duration: 7 * 60 + 30 },
  'QR300': { dep: 'DOH', arr: 'KUL', duration: 7 * 60 + 45 },
  'QR400': { dep: 'DOH', arr: 'CDG', duration: 6 * 60 + 30 },
  'QR500': { dep: 'DOH', arr: 'IST', duration: 4 * 60 + 0 },
  'QR600': { dep: 'DOH', arr: 'BAH', duration: 1 * 60 + 0 },
  'QR700': { dep: 'DOH', arr: 'MAD', duration: 7 * 60 + 0 },
  'QR800': { dep: 'DOH', arr: 'AMS', duration: 6 * 60 + 15 },
};

// ─── Great Circle Navigation ─────────────────────────────────────────────────

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

/**
 * Calculate the distance (km) and initial bearing between two lat/lng points.
 */
function greatCircleParams(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const λ1 = lng1 * DEG;
  const λ2 = lng2 * DEG;
  const Δλ = λ2 - λ1;

  const a = Math.sin(Δλ) * Math.cos(φ2);
  const b = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(a, b); // initial bearing in radians

  const d = Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * EARTH_RADIUS_KM;

  return { distance: d, bearing: θ * RAD };
}

/**
 * Calculate a point along a Great Circle path given fraction f (0..1).
 */
function greatCirclePoint(lat1, lng1, lat2, lng2, f) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const λ1 = lng1 * DEG;
  const λ2 = lng2 * DEG;
  const Δλ = λ2 - λ1;

  const a = Math.sin((1 - f) * Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)));
  const b = Math.sin(f * Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)));

  // Use spherical linear interpolation (slerp)
  const sinD = Math.sin(Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)));
  if (sinD < 1e-10) {
    // Points are nearly the same
    return { lat: lat1, lng: lng1 };
  }

  const x = (Math.sin((1 - f) * Math.asin(sinD)) * Math.cos(φ1) * Math.cos(λ1) + Math.sin(f * Math.asin(sinD)) * Math.cos(φ2) * Math.cos(λ2)) / sinD;
  const y = (Math.sin((1 - f) * Math.asin(sinD)) * Math.cos(φ1) * Math.sin(λ1) + Math.sin(f * Math.asin(sinD)) * Math.cos(φ2) * Math.sin(λ2)) / sinD;
  const z = (Math.sin((1 - f) * Math.asin(sinD)) * Math.sin(φ1) + Math.sin(f * Math.asin(sinD)) * Math.sin(φ2)) / sinD;

  const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD;
  const lng = Math.atan2(y, x) * RAD;

  return { lat, lng };
}

/**
 * Generate waypoints along the Great Circle path for the flight route polyline.
 */
export function generateFlightPath(lat1, lng1, lat2, lng2, numPoints = 100) {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    points.push(greatCirclePoint(lat1, lng1, lat2, lng2, f));
  }
  return points;
}

// ─── Mock Flight State Machine ───────────────────────────────────────────────

/**
 * Parse a flight code like "QR 774" or "QR774" into airline + number.
 */
function parseFlightCode(code) {
  const cleaned = code.replace(/\s+/g, '').toUpperCase();
  const match = cleaned.match(/^([A-Z]{2})(\d{1,4})$/);
  if (!match) return null;
  return { airline: match[1], number: match[2], full: cleaned };
}

/**
 * Look up a route by flight code.
 */
function lookupRoute(flightCode) {
  const parsed = parseFlightCode(flightCode);
  if (!parsed) return null;
  const route = ROUTES[parsed.full];
  if (!route) return null;
  const dep = AIRPORTS[route.dep];
  const arr = AIRPORTS[route.arr];
  if (!dep || !arr) return null;
  return {
    flightCode: parsed.full,
    airline: parsed.airline,
    flightNumber: parsed.number,
    departure: { ...dep, code: route.dep },
    arrival: { ...arr, code: route.arr },
    durationMinutes: route.duration,
  };
}

/**
 * Create a mock flight tracking session.
 * 
 * @param {string} flightCode - e.g., "QR 774"
 * @param {Date} departureDate - The scheduled departure date
 * @returns {Object} Flight tracking controller
 */
export function createFlightSession(flightCode, departureDate) {
  const route = lookupRoute(flightCode);
  if (!route) {
    return { error: `Flight "${flightCode}" not found in database. Try QR774, QR725, EK201, etc.` };
  }

  // State
  let state = 'pre-takeoff'; // 'pre-takeoff' | 'in-flight' | 'landed'
  let takeoffTime = null;
  let currentPosition = { lat: route.departure.lat, lng: route.departure.lng };
  let elapsedMinutes = 0;
  let altitude = 0;
  let groundSpeed = 0;
  let flightProgress = 0; // 0..1

  // Pre-takeoff mock data
  let gate = `Gate ${Math.floor(Math.random() * 30) + 1}`;
  let boardingStatus = 'On Time';
  let delayMinutes = 0;
  let runwayQueue = Math.floor(Math.random() * 5);

  // Generate the full flight path
  const pathPoints = generateFlightPath(
    route.departure.lat, route.departure.lng,
    route.arrival.lat, route.arrival.lng,
    200
  );

  /**
   * Simulate takeoff — transitions from pre-takeoff to in-flight.
   */
  function takeOff() {
    if (state !== 'pre-takeoff') return;
    state = 'in-flight';
    takeoffTime = new Date();
    elapsedMinutes = 0;
    altitude = 0;
    groundSpeed = 0;
    flightProgress = 0;
    currentPosition = { lat: route.departure.lat, lng: route.departure.lng };
  }

  /**
   * Advance the simulation by one minute.
   */
  function tick() {
    if (state === 'pre-takeoff') {
      // Simulate ground operations
      const r = Math.random();
      if (r < 0.1) {
        delayMinutes += 1;
        boardingStatus = 'Delayed';
      } else if (r < 0.3 && delayMinutes > 0) {
        delayMinutes = Math.max(0, delayMinutes - 1);
        if (delayMinutes === 0) boardingStatus = 'On Time';
      }
      if (runwayQueue > 0 && Math.random() < 0.3) {
        runwayQueue -= 1;
      }
      return;
    }

    if (state === 'in-flight') {
      elapsedMinutes += 1;
      flightProgress = Math.min(elapsedMinutes / route.durationMinutes, 1);

      // Simulate climb, cruise, descent
      if (flightProgress < 0.05) {
        // Climb phase
        altitude = Math.min(10668, flightProgress / 0.05 * 10668); // 35,000 ft = 10,668 m
        groundSpeed = 250 + (flightProgress / 0.05) * 600;
      } else if (flightProgress > 0.85) {
        // Descent phase
        const descentProgress = (flightProgress - 0.85) / 0.15;
        altitude = Math.max(0, 10668 * (1 - descentProgress));
        groundSpeed = Math.max(250, 850 * (1 - descentProgress * 0.7));
      } else {
        // Cruise
        altitude = 10668; // 35,000 ft
        groundSpeed = 850; // ~460 knots
      }

      // Calculate position along path
      const idx = Math.min(Math.floor(flightProgress * (pathPoints.length - 1)), pathPoints.length - 1);
      currentPosition = pathPoints[idx];

      // Check for landing
      if (flightProgress >= 1) {
        state = 'landed';
        currentPosition = { lat: route.arrival.lat, lng: route.arrival.lng };
        altitude = 0;
        groundSpeed = 0;
      }
    }
  }

  /**
   * Get the current flight state snapshot.
   */
  function getState() {
    const now = new Date();

    if (state === 'pre-takeoff') {
      return {
        state: 'pre-takeoff',
        flightCode: route.flightCode,
        departure: route.departure,
        arrival: route.arrival,
        gate,
        boardingStatus,
        delayMinutes,
        runwayQueue,
        scheduledDeparture: departureDate,
        position: currentPosition,
        altitude: 0,
        groundSpeed: 0,
        flightProgress: 0,
        elapsedMinutes: 0,
        durationMinutes: route.durationMinutes,
        pathPoints,
        timestamp: now,
      };
    }

    if (state === 'in-flight') {
      return {
        state: 'in-flight',
        flightCode: route.flightCode,
        departure: route.departure,
        arrival: route.arrival,
        takeoffTime,
        position: currentPosition,
        altitude: Math.round(altitude),
        groundSpeed: Math.round(groundSpeed),
        flightProgress,
        elapsedMinutes,
        durationMinutes: route.durationMinutes,
        pathPoints,
        timestamp: now,
        estimatedArrival: new Date(takeoffTime.getTime() + route.durationMinutes * 60000),
      };
    }

    // Landed
    return {
      state: 'landed',
      flightCode: route.flightCode,
      departure: route.departure,
      arrival: route.arrival,
      takeoffTime,
      position: currentPosition,
      altitude: 0,
      groundSpeed: 0,
      flightProgress: 1,
      elapsedMinutes: route.durationMinutes,
      durationMinutes: route.durationMinutes,
      pathPoints,
      timestamp: now,
      landedAt: now,
    };
  }

  return {
    route,
    takeOff,
    tick,
    getState,
    state: () => state,
  };
}

/**
 * Look up airport info by IATA code.
 */
export function getAirportInfo(code) {
  return AIRPORTS[code.toUpperCase()] || null;
}

/**
 * Get all available routes for the dropdown.
 */
export function getAvailableRoutes() {
  return Object.entries(ROUTES).map(([code, route]) => ({
    code,
    departure: AIRPORTS[route.dep]?.city || route.dep,
    arrival: AIRPORTS[route.arr]?.city || route.arr,
    duration: route.duration,
  }));
}