/**
 * flightApi.js — Flight Path Engine for Manual Flight Entry
 *
 * Takes user-inputted departure/arrival airport codes, time, and duration,
 * then generates a Great Circle flight path with position tracking.
 */

// ─── Airport Database (63 airports) ──────────────────────────────────────────

const AIRPORTS = {
  // Middle East (15)
  'DOH': { name: 'Hamad International', lat: 25.2731, lng: 51.6080, tz: 3, city: 'Doha', country: 'Qatar' },
  'DXB': { name: 'Dubai International', lat: 25.2532, lng: 55.3657, tz: 4, city: 'Dubai', country: 'UAE' },
  'AUH': { name: 'Abu Dhabi International', lat: 24.4333, lng: 54.6511, tz: 4, city: 'Abu Dhabi', country: 'UAE' },
  'SHJ': { name: 'Sharjah International', lat: 25.3286, lng: 55.5172, tz: 4, city: 'Sharjah', country: 'UAE' },
  'RUH': { name: 'King Khalid International', lat: 24.9577, lng: 46.6988, tz: 3, city: 'Riyadh', country: 'Saudi Arabia' },
  'JED': { name: 'King Abdulaziz International', lat: 21.6796, lng: 39.1565, tz: 3, city: 'Jeddah', country: 'Saudi Arabia' },
  'MED': { name: 'Prince Mohammad Bin Abdulaziz', lat: 24.5534, lng: 39.7051, tz: 3, city: 'Medina', country: 'Saudi Arabia' },
  'DMM': { name: 'King Fahd International', lat: 26.4712, lng: 49.7978, tz: 3, city: 'Dammam', country: 'Saudi Arabia' },
  'BAH': { name: 'Bahrain International', lat: 26.2708, lng: 50.6336, tz: 3, city: 'Manama', country: 'Bahrain' },
  'KWI': { name: 'Kuwait International', lat: 29.2266, lng: 47.9689, tz: 3, city: 'Kuwait City', country: 'Kuwait' },
  'MCT': { name: 'Muscat International', lat: 23.5933, lng: 58.2844, tz: 4, city: 'Muscat', country: 'Oman' },
  'SLL': { name: 'Salalah Airport', lat: 17.0387, lng: 54.0913, tz: 4, city: 'Salalah', country: 'Oman' },
  'AMM': { name: 'Queen Alia International', lat: 31.7225, lng: 35.9932, tz: 3, city: 'Amman', country: 'Jordan' },
  'BEY': { name: 'Beirut–Rafic Hariri International', lat: 33.8209, lng: 35.4884, tz: 2, city: 'Beirut', country: 'Lebanon' },
  'BGW': { name: 'Baghdad International', lat: 33.2625, lng: 44.2346, tz: 3, city: 'Baghdad', country: 'Iraq' },
  'NJF': { name: 'Al Najaf International', lat: 31.9897, lng: 44.4042, tz: 3, city: 'Najaf', country: 'Iraq' },
  'EBL': { name: 'Erbil International', lat: 36.2375, lng: 43.9631, tz: 3, city: 'Erbil', country: 'Iraq' },
  'BSR': { name: 'Basra International', lat: 30.5491, lng: 47.6621, tz: 3, city: 'Basra', country: 'Iraq' },
  'DAM': { name: 'Damascus International', lat: 33.4107, lng: 36.5143, tz: 3, city: 'Damascus', country: 'Syria' },
  'SAW': { name: 'Sabiha Gökçen International', lat: 40.8986, lng: 29.3092, tz: 3, city: 'Istanbul', country: 'Turkey' },

  // South Asia (8)
  'DEL': { name: 'Indira Gandhi International', lat: 28.5562, lng: 77.1000, tz: 5.5, city: 'Delhi', country: 'India' },
  'BOM': { name: 'Chhatrapati Shivaji Maharaj International', lat: 19.0896, lng: 72.8656, tz: 5.5, city: 'Mumbai', country: 'India' },
  'MAA': { name: 'Chennai International', lat: 12.9815, lng: 80.1638, tz: 5.5, city: 'Chennai', country: 'India' },
  'KHI': { name: 'Jinnah International', lat: 24.9065, lng: 67.1608, tz: 5, city: 'Karachi', country: 'Pakistan' },
  'LHE': { name: 'Allama Iqbal International', lat: 31.5216, lng: 74.4036, tz: 5, city: 'Lahore', country: 'Pakistan' },
  'ISB': { name: 'Islamabad International', lat: 33.5493, lng: 72.8259, tz: 5, city: 'Islamabad', country: 'Pakistan' },
  'DAC': { name: 'Shahjalal International', lat: 23.8433, lng: 90.3978, tz: 6, city: 'Dhaka', country: 'Bangladesh' },
  'CMB': { name: 'Bandaranaike International', lat: 7.1811, lng: 79.8837, tz: 5.5, city: 'Colombo', country: 'Sri Lanka' },

  // Southeast/East Asia (10)
  'KUL': { name: 'Kuala Lumpur International', lat: 2.7456, lng: 101.7072, tz: 8, city: 'Kuala Lumpur', country: 'Malaysia' },
  'SIN': { name: 'Singapore Changi', lat: 1.3644, lng: 103.9915, tz: 8, city: 'Singapore', country: 'Singapore' },
  'CGK': { name: 'Soekarno-Hatta International', lat: -6.1256, lng: 106.6558, tz: 7, city: 'Jakarta', country: 'Indonesia' },
  'BKK': { name: 'Suvarnabhumi Airport', lat: 13.6811, lng: 100.7470, tz: 7, city: 'Bangkok', country: 'Thailand' },
  'HND': { name: 'Tokyo Haneda', lat: 35.5494, lng: 139.7798, tz: 9, city: 'Tokyo', country: 'Japan' },
  'NRT': { name: 'Narita International', lat: 35.7647, lng: 140.3864, tz: 9, city: 'Tokyo', country: 'Japan' },
  'ICN': { name: 'Incheon International', lat: 37.4602, lng: 126.4407, tz: 9, city: 'Seoul', country: 'South Korea' },
  'PEK': { name: 'Beijing Capital International', lat: 40.0799, lng: 116.6031, tz: 8, city: 'Beijing', country: 'China' },
  'PVG': { name: 'Shanghai Pudong International', lat: 31.1443, lng: 121.8083, tz: 8, city: 'Shanghai', country: 'China' },
  'MNL': { name: 'Ninoy Aquino International', lat: 14.5086, lng: 121.0195, tz: 8, city: 'Manila', country: 'Philippines' },

  // Europe (12)
  'LHR': { name: 'London Heathrow', lat: 51.4700, lng: -0.4543, tz: 0, city: 'London', country: 'UK' },
  'CDG': { name: 'Charles de Gaulle', lat: 49.0097, lng: 2.5479, tz: 1, city: 'Paris', country: 'France' },
  'FRA': { name: 'Frankfurt Airport', lat: 50.0379, lng: 8.5622, tz: 1, city: 'Frankfurt', country: 'Germany' },
  'AMS': { name: 'Amsterdam Schiphol', lat: 52.3105, lng: 4.7683, tz: 1, city: 'Amsterdam', country: 'Netherlands' },
  'MAD': { name: 'Adolfo Suárez Madrid–Barajas', lat: 40.4983, lng: -3.5676, tz: 1, city: 'Madrid', country: 'Spain' },
  'IST': { name: 'Istanbul Airport', lat: 41.2608, lng: 28.7423, tz: 3, city: 'Istanbul', country: 'Turkey' },
  'FCO': { name: 'Leonardo da Vinci–Fiumicino', lat: 41.8003, lng: 12.2389, tz: 1, city: 'Rome', country: 'Italy' },
  'MUC': { name: 'Munich Airport', lat: 48.3538, lng: 11.7861, tz: 1, city: 'Munich', country: 'Germany' },
  'ZRH': { name: 'Zurich Airport', lat: 47.4582, lng: 8.5480, tz: 1, city: 'Zurich', country: 'Switzerland' },
  'ARN': { name: 'Stockholm Arlanda', lat: 59.6498, lng: 17.9239, tz: 1, city: 'Stockholm', country: 'Sweden' },
  'CPH': { name: 'Copenhagen Airport', lat: 55.6180, lng: 12.6508, tz: 1, city: 'Copenhagen', country: 'Denmark' },
  'DME': { name: 'Domodedovo International', lat: 55.4103, lng: 37.9028, tz: 3, city: 'Moscow', country: 'Russia' },

  // Africa (6)
  'CAI': { name: 'Cairo International', lat: 30.1219, lng: 31.4056, tz: 2, city: 'Cairo', country: 'Egypt' },
  'ADD': { name: 'Bole International', lat: 8.9778, lng: 38.7993, tz: 3, city: 'Addis Ababa', country: 'Ethiopia' },
  'NBO': { name: 'Jomo Kenyatta International', lat: -1.3192, lng: 36.9278, tz: 3, city: 'Nairobi', country: 'Kenya' },
  'TUN': { name: 'Tunis–Carthage International', lat: 36.8510, lng: 10.2272, tz: 1, city: 'Tunis', country: 'Tunisia' },
  'CMN': { name: 'Mohammed V International', lat: 33.3675, lng: -7.5900, tz: 1, city: 'Casablanca', country: 'Morocco' },
  'JNB': { name: 'O. R. Tambo International', lat: -26.1392, lng: 28.2460, tz: 2, city: 'Johannesburg', country: 'South Africa' },

  // Americas (10)
  'JFK': { name: 'John F. Kennedy International', lat: 40.6413, lng: -73.7781, tz: -5, city: 'New York', country: 'USA' },
  'ORD': { name: "O'Hare International", lat: 41.9742, lng: -87.9073, tz: -6, city: 'Chicago', country: 'USA' },
  'IAH': { name: 'George Bush Intercontinental', lat: 29.9902, lng: -95.3368, tz: -6, city: 'Houston', country: 'USA' },
  'LAX': { name: 'Los Angeles International', lat: 33.9416, lng: -118.4085, tz: -8, city: 'Los Angeles', country: 'USA' },
  'YYZ': { name: 'Toronto Pearson', lat: 43.6777, lng: -79.6248, tz: -5, city: 'Toronto', country: 'Canada' },
  'MEX': { name: 'Mexico City International', lat: 19.4363, lng: -99.0721, tz: -6, city: 'Mexico City', country: 'Mexico' },
  'GRU': { name: 'São Paulo–Guarulhos International', lat: -23.4356, lng: -46.4731, tz: -3, city: 'Sao Paulo', country: 'Brazil' },
  'EZE': { name: 'Ministro Pistarini International', lat: -34.8222, lng: -58.5358, tz: -3, city: 'Buenos Aires', country: 'Argentina' },
  'BOG': { name: 'El Dorado International', lat: 4.7016, lng: -74.1469, tz: -5, city: 'Bogota', country: 'Colombia' },
  'SCL': { name: 'Arturo Merino Benítez International', lat: -33.3930, lng: -70.7858, tz: -4, city: 'Santiago', country: 'Chile' },

  // Oceania (2)
  'SYD': { name: 'Sydney Kingsford Smith', lat: -33.9399, lng: 151.1753, tz: 11, city: 'Sydney', country: 'Australia' },
  'AKL': { name: 'Auckland Airport', lat: -37.0081, lng: 174.7917, tz: 13, city: 'Auckland', country: 'New Zealand' },
};

// ─── Great Circle Navigation ─────────────────────────────────────────────────

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

function greatCirclePoint(lat1, lng1, lat2, lng2, f) {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const λ1 = lng1 * DEG;
  const λ2 = lng2 * DEG;

  const d = Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1));
  const sinD = Math.sin(d);
  
  if (sinD < 1e-10) {
    return { lat: lat1, lng: lng1 };
  }

  const a = Math.sin((1 - f) * d) / sinD;
  const b = Math.sin(f * d) / sinD;

  const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
  const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
  const z = a * Math.sin(φ1) + b * Math.sin(φ2);

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD,
    lng: Math.atan2(y, x) * RAD,
  };
}

function generateFlightPath(lat1, lng1, lat2, lng2, numPoints = 200) {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    points.push(greatCirclePoint(lat1, lng1, lat2, lng2, i / numPoints));
  }
  return points;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get all available airports.
 */
export function getAirports() {
  return Object.entries(AIRPORTS).map(([code, info]) => ({
    code,
    ...info,
  }));
}

/**
 * Look up airport info by IATA code.
 */
export function getAirportInfo(code) {
  return AIRPORTS[code.toUpperCase()] || null;
}

/**
 * Create a manual flight session from user inputs.
 *
 * @param {string} depCode - Departure airport IATA code (e.g., "DOH")
 * @param {string} arrCode - Arrival airport IATA code (e.g., "IAH")
 * @param {string} depTimeStr - Departure time as "HH:MM" (24h)
 * @param {number} durationMinutes - Total flight duration in minutes
 * @param {Date} depDate - Departure date
 * @param {boolean} nextDay - Whether arrival is the next day
 * @returns {Object} Flight tracking controller
 */
export function createManualSession(depCode, arrCode, depTimeStr, durationMinutes, depDate, nextDay) {
  const dep = AIRPORTS[depCode.toUpperCase()];
  const arr = AIRPORTS[arrCode.toUpperCase()];

  if (!dep || !arr) {
    return { error: `Invalid airport code. Please select from the list.` };
  }

  if (depCode.toUpperCase() === arrCode.toUpperCase()) {
    return { error: 'Departure and arrival airports must be different.' };
  }

  if (!durationMinutes || durationMinutes < 10) {
    return { error: 'Flight duration must be at least 10 minutes.' };
  }

  // Parse departure time
  const [depH, depM] = depTimeStr.split(':').map(Number);
  if (isNaN(depH) || isNaN(depM)) {
    return { error: 'Invalid departure time.' };
  }

  // Build departure datetime
  const depDateTime = new Date(depDate);
  depDateTime.setHours(depH, depM, 0, 0);

  // Build arrival datetime
  const arrDateTime = new Date(depDateTime);
  arrDateTime.setMinutes(arrDateTime.getMinutes() + durationMinutes);

  // Generate flight path
  const pathPoints = generateFlightPath(dep.lat, dep.lng, arr.lat, arr.lng, 200);

  // State
  let state = 'pre-takeoff';
  let takeoffTime = null;
  let currentPosition = { lat: dep.lat, lng: dep.lng };
  let elapsedMinutes = 0;
  let altitude = 0;
  let groundSpeed = 0;
  let flightProgress = 0;

  function takeOff() {
    if (state !== 'pre-takeoff') return;
    state = 'in-flight';
    takeoffTime = new Date();
    elapsedMinutes = 0;
    altitude = 0;
    groundSpeed = 0;
    flightProgress = 0;
    currentPosition = { lat: dep.lat, lng: dep.lng };
  }

  function tick() {
    if (state === 'in-flight') {
      elapsedMinutes += 1;
      flightProgress = Math.min(elapsedMinutes / durationMinutes, 1);

      // Simulate climb, cruise, descent
      if (flightProgress < 0.05) {
        altitude = Math.min(10668, flightProgress / 0.05 * 10668);
        groundSpeed = 250 + (flightProgress / 0.05) * 600;
      } else if (flightProgress > 0.85) {
        const descentProgress = (flightProgress - 0.85) / 0.15;
        altitude = Math.max(0, 10668 * (1 - descentProgress));
        groundSpeed = Math.max(250, 850 * (1 - descentProgress * 0.7));
      } else {
        altitude = 10668;
        groundSpeed = 850;
      }

      const idx = Math.min(Math.floor(flightProgress * (pathPoints.length - 1)), pathPoints.length - 1);
      currentPosition = pathPoints[idx];

      if (flightProgress >= 1) {
        state = 'landed';
        currentPosition = { lat: arr.lat, lng: arr.lng };
        altitude = 0;
        groundSpeed = 0;
      }
    }
  }

  function getState() {
    const now = new Date();

    if (state === 'pre-takeoff') {
      return {
        state: 'pre-takeoff',
        flightCode: `${depCode}${arrCode}`,
        departure: { ...dep, code: depCode.toUpperCase() },
        arrival: { ...arr, code: arrCode.toUpperCase() },
        scheduledDeparture: depDateTime,
        position: currentPosition,
        altitude: 0,
        groundSpeed: 0,
        flightProgress: 0,
        elapsedMinutes: 0,
        durationMinutes,
        pathPoints,
        timestamp: now,
      };
    }

    if (state === 'in-flight') {
      return {
        state: 'in-flight',
        flightCode: `${depCode}${arrCode}`,
        departure: { ...dep, code: depCode.toUpperCase() },
        arrival: { ...arr, code: arrCode.toUpperCase() },
        takeoffTime,
        position: currentPosition,
        altitude: Math.round(altitude),
        groundSpeed: Math.round(groundSpeed),
        flightProgress,
        elapsedMinutes,
        durationMinutes,
        pathPoints,
        timestamp: now,
        estimatedArrival: new Date(takeoffTime.getTime() + durationMinutes * 60000),
      };
    }

    return {
      state: 'landed',
      flightCode: `${depCode}${arrCode}`,
      departure: { ...dep, code: depCode.toUpperCase() },
      arrival: { ...arr, code: arrCode.toUpperCase() },
      takeoffTime,
      position: currentPosition,
      altitude: 0,
      groundSpeed: 0,
      flightProgress: 1,
      elapsedMinutes: durationMinutes,
      durationMinutes,
      pathPoints,
      timestamp: now,
      landedAt: now,
    };
  }

  return {
    route: { departure: dep, arrival: arr, durationMinutes },
    takeOff,
    tick,
    getState,
    state: () => state,
  };
}