/**
 * prayerMath.js — Solar Calculation Engine & Qibla Direction
 * 
 * Implements the University of Tehran (Institute of Geophysics) parameters
 * for Ayatollah Sistani's rulings:
 *   Fajr:   17.7° below horizon
 *   Maghrib: 4.5° below horizon
 *   Isha:   14.0° below horizon
 * 
 * Includes altitude correction for high-altitude flight and Qibla direction.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const TEHRAN_ANGLES = {
  fajr: 17.7,
  maghrib: 4.5,
  isha: 14.0,
};

const EARTH_RADIUS_KM = 6371;

// Kaaba coordinates
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sin(d) { return Math.sin(d * DEG); }
function cos(d) { return Math.cos(d * DEG); }
function tan(d) { return Math.tan(d * DEG); }
function asin(x) { return Math.asin(x) * RAD; }
function acos(x) { return Math.acos(x) * RAD; }
function atan2(y, x) { return Math.atan2(y, x) * RAD; }

function fixHour(a) {
  let h = a;
  while (h < 0) h += 24;
  while (h >= 24) h -= 24;
  return h;
}

function fixAngle(a) {
  let d = a;
  while (d < -180) d += 360;
  while (d > 180) d -= 360;
  return d;
}

function dhuhrMinutes(julianDay, longitude, timezone) {
  // Equation of time
  const n = julianDay - 2451545.0;
  let g = fixAngle(357.529 + 0.98560028 * n);
  let q = fixAngle(280.459 + 0.98564736 * n);
  let L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));

  const e = 23.439 - 0.00000036 * n;
  const RA = atan2(sin(L) * cos(e), cos(L)) / 15;
  const EqT = q / 15 - fixHour(RA);
  const noon = 12 + EqT;
  return noon - longitude / 15 - timezone;
}

function sunDeclination(julianDay) {
  const n = julianDay - 2451545.0;
  let g = fixAngle(357.529 + 0.98560028 * n);
  let q = fixAngle(280.459 + 0.98564736 * n);
  let L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
  const e = 23.439 - 0.00000036 * n;
  return asin(sin(e) * sin(L));
}

// ─── Altitude Correction ─────────────────────────────────────────────────────
// At altitude, the visible horizon dips, shifting prayer times.
// The dip angle (in degrees) = acos(R / (R + h)) where R = Earth radius, h = altitude.
// This effectively reduces the twilight angle for Fajr (makes it earlier)
// and increases it for Maghrib (makes it later).

function altitudeDipAngle(altitudeMeters) {
  if (!altitudeMeters || altitudeMeters <= 0) return 0;
  const r = EARTH_RADIUS_KM * 1000;
  return acos(r / (r + altitudeMeters));
}

function correctedAngle(baseAngle, altitudeMeters, isFajr) {
  const dip = altitudeDipAngle(altitudeMeters);
  if (isFajr) {
    return Math.max(baseAngle - dip, 0);
  }
  return baseAngle + dip;
}

// ─── Qibla Direction ─────────────────────────────────────────────────────────

/**
 * Calculate the Qibla direction (bearing to Kaaba) from a given location.
 * 
 * @param {number} lat - Current latitude in degrees
 * @param {number} lng - Current longitude in degrees
 * @returns {Object} { bearing: number (degrees from true north), 
 *                     bearingText: string (e.g., "47° NE"),
 *                     compassDirection: string (e.g., "NE") }
 */
export function calculateQiblaDirection(lat, lng) {
  const φ1 = lat * DEG;
  const φ2 = KAABA_LAT * DEG;
  const λ1 = lng * DEG;
  const λ2 = KAABA_LNG * DEG;
  const Δλ = λ2 - λ1;

  // Initial bearing formula
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let bearing = (atan2(y, x) + 360) % 360;

  // Compass direction text
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(bearing / 45) % 8;
  const compassDirection = directions[idx];

  return {
    bearing,
    bearingText: `${Math.round(bearing)}° ${compassDirection}`,
    compassDirection,
    kaabaLat: KAABA_LAT,
    kaabaLng: KAABA_LNG,
  };
}

/**
 * Calculate distance (km) from current position to Kaaba.
 */
export function distanceToKaaba(lat, lng) {
  const φ1 = lat * DEG;
  const φ2 = KAABA_LAT * DEG;
  const Δλ = (KAABA_LNG - lng) * DEG;
  return Math.acos(
    Math.sin(φ1) * Math.sin(φ2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  ) * EARTH_RADIUS_KM;
}

// ─── Main Prayer Time Calculator ─────────────────────────────────────────────

/**
 * Calculate prayer times for a given date, location, and altitude.
 * 
 * @param {Date} date - JavaScript Date object
 * @param {number} lat - Latitude in degrees
 * @param {number} lng - Longitude in degrees
 * @param {number} timezone - Timezone offset from UTC (e.g., -5 for EST)
 * @param {number} altitudeMeters - Altitude in meters (0 for ground)
 * @returns {Object} { fajr, sunrise, dhuhr, asr, maghrib, isha, midnight }
 *   All times are in hours (0-24) local time.
 */
export function calculatePrayerTimes(date, lat, lng, timezone, altitudeMeters = 0) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Julian Day
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 79) - 32083;
  jd = jd - Math.floor((y - 1) / 100) + Math.floor((y - 1) / 400) + 2;

  const dhuhrBase = dhuhrMinutes(jd, lng, timezone);
  const dhuhr = fixHour(dhuhrBase);

  const dec = sunDeclination(jd);
  const noon = dhuhrBase - 12;

  function hourAngle(angle) {
    const numerator = sin(angle) - sin(lat) * sin(dec);
    const denominator = cos(lat) * cos(dec);
    if (Math.abs(denominator) < 1e-10) return NaN;
    const val = numerator / denominator;
    if (val > 1 || val < -1) return NaN;
    return acos(val) / 15;
  }

  // Sunrise / Sunset
  const sunriseAngle = -0.833 - altitudeDipAngle(altitudeMeters);
  const sunriseHA = hourAngle(sunriseAngle);
  const sunrise = fixHour(dhuhrBase - sunriseHA);
  const sunset = fixHour(dhuhrBase + sunriseHA);

  // Fajr (with altitude correction)
  const fajrAngle = correctedAngle(TEHRAN_ANGLES.fajr, altitudeMeters, true);
  const fajrHA = hourAngle(-fajrAngle);
  const fajr = fixHour(dhuhrBase - fajrHA);

  // Maghrib (with altitude correction)
  const maghribAngle = correctedAngle(TEHRAN_ANGLES.maghrib, altitudeMeters, false);
  const maghribHA = hourAngle(-maghribAngle);
  const maghrib = fixHour(dhuhrBase + maghribHA);

  // Isha
  const ishaAngle = TEHRAN_ANGLES.isha;
  const ishaHA = hourAngle(-ishaAngle);
  const isha = fixHour(dhuhrBase + ishaHA);

  // Asr (shadow length = 1, standard for Shia)
  const A = Math.abs(lat - dec);
  const arc = atan2(1, tan(A) + 1);
  const asrNumerator = sin(arc) - sin(lat) * sin(dec);
  const asrDenominator = cos(lat) * cos(dec);
  let asrHA = NaN;
  if (Math.abs(asrDenominator) > 1e-10) {
    const asrVal = asrNumerator / asrDenominator;
    if (asrVal >= -1 && asrVal <= 1) {
      asrHA = acos(asrVal) / 15;
    }
  }
  const asr = fixHour(dhuhrBase + (isNaN(asrHA) ? 0 : asrHA));

  // Midnight
  let midnight = fixHour(sunset + (sunrise + 24 - sunset) / 2);

  return {
    fajr: fixHour(fajr),
    sunrise: fixHour(sunrise),
    dhuhr: fixHour(dhuhr),
    asr: fixHour(asr),
    maghrib: fixHour(maghrib),
    isha: fixHour(isha),
    midnight: fixHour(midnight),
  };
}

/**
 * Convert decimal hours to "HH:MM" string.
 */
export function hoursToTimeString(hours) {
  if (hours == null || isNaN(hours)) return '--:--';
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Get the current prayer window info.
 */
export function getCurrentPrayerInfo(prayerTimes, nowHours) {
  const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const labels = {
    fajr: 'Fajr',
    sunrise: 'Sunrise',
    dhuhr: 'Dhuhr',
    asr: 'Asr',
    maghrib: 'Maghrib',
    isha: 'Isha',
  };

  const events = order.map((key) => ({
    time: prayerTimes[key],
    name: key,
    label: labels[key],
  }));

  let current = null;
  let next = null;

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const nextEvt = events[i + 1] || { time: events[0].time + 24, name: events[0].name, label: events[0].label };

    if (nowHours >= evt.time && nowHours < nextEvt.time) {
      current = evt;
      next = nextEvt;
      break;
    }
  }

  if (!current) {
    const lastEvent = events[events.length - 1];
    if (nowHours >= lastEvent.time) {
      current = lastEvent;
      next = { time: events[0].time + 24, name: events[0].name, label: events[0].label };
    } else {
      current = { time: events[events.length - 1].time - 24, name: events[events.length - 1].name, label: events[events.length - 1].label };
      next = events[0];
    }
  }

  const timeUntilNext = next ? (next.time - nowHours) * 3600 : 0;
  const windowElapsed = current ? (nowHours - current.time) * 3600 : 0;
  const windowDuration = next ? (next.time - current.time) * 3600 : 0;

  return {
    current,
    next,
    timeUntilNext: Math.max(0, timeUntilNext),
    windowElapsed: Math.max(0, windowElapsed),
    windowDuration: Math.max(0, windowDuration),
  };
}

/**
 * Calculate prayer times along a flight path at a given moment.
 */
export function calculateFlightPrayerTimes(lat, lng, altitudeMeters, date) {
  const tz = Math.round(lng / 15);
  return calculatePrayerTimes(date, lat, lng, tz, altitudeMeters);
}

/**
 * Generate a prayer schedule indexed by elapsed flight time (minutes).
 * 
 * @param {number} lat - Current latitude
 * @param {number} lng - Current longitude
 * @param {number} altitudeMeters - Current altitude
 * @param {Date} date - Current date/time
 * @param {number} elapsedMinutes - Minutes into the flight
 * @param {number} durationMinutes - Total flight duration
 * @returns {Object} prayer times with elapsed-minute annotations
 */
export function generateFlightPrayerSchedule(lat, lng, altitudeMeters, date, elapsedMinutes, durationMinutes) {
  const times = calculateFlightPrayerTimes(lat, lng, altitudeMeters, date);
  
  // Calculate Qibla at this position
  const qibla = calculateQiblaDirection(lat, lng);
  
  return {
    times,
    qibla,
    position: { lat, lng },
    altitude: altitudeMeters,
    elapsedMinutes,
    durationMinutes,
    progress: durationMinutes > 0 ? elapsedMinutes / durationMinutes : 0,
  };
}

/**
 * Get combined prayer slots for travel (Shia practice).
 * Returns Fajr, Dhuhr/Asr (combined), and Maghrib/Isha (combined).
 * 
 * @param {Object} prayerTimes - Raw prayer times from calculatePrayerTimes()
 * @returns {Array} Combined prayer slots with start/end times and labels
 */
export function getCombinedPrayerSlots(prayerTimes) {
  if (!prayerTimes) return [];

  return [
    {
      key: 'fajr',
      label: 'Fajr',
      short: 'F',
      startTime: prayerTimes.fajr,
      endTime: prayerTimes.sunrise,
      color: '#3b82f6', // blue
    },
    {
      key: 'dhuhrAsr',
      label: 'Dhuhr/Asr',
      short: 'D/A',
      startTime: prayerTimes.dhuhr,
      endTime: prayerTimes.maghrib,
      color: '#f59e0b', // amber
    },
    {
      key: 'maghribIsha',
      label: 'Maghrib/Isha',
      short: 'M/I',
      startTime: prayerTimes.maghrib,
      endTime: prayerTimes.midnight,
      color: '#ef4444', // red
    },
  ];
}

/**
 * Determine which combined prayer slots fall within a flight window.
 * 
 * @param {Array} slots - Combined prayer slots from getCombinedPrayerSlots()
 * @param {number} takeoffHours - Takeoff time in decimal hours (local)
 * @param {number} landingHours - Landing time in decimal hours (local)
 * @returns {Array} Slots annotated with flight status
 */
export function getPrayersDuringFlight(slots, takeoffHours, landingHours) {
  return slots.map(slot => {
    const startInFlight = slot.startTime >= takeoffHours && slot.startTime <= landingHours;
    const endInFlight = slot.endTime >= takeoffHours && slot.endTime <= landingHours;
    const overlaps = slot.startTime < landingHours && slot.endTime > takeoffHours;

    let status;
    let effectiveStart = slot.startTime;
    let effectiveEnd = slot.endTime;

    if (!overlaps) {
      status = 'not-during-flight';
    } else {
      status = 'during-flight';
      if (slot.startTime < takeoffHours) {
        effectiveStart = takeoffHours;
        status = 'partially-during-flight';
      }
      if (slot.endTime > landingHours) {
        effectiveEnd = landingHours;
        status = 'partially-during-flight';
      }
    }

    // Calculate elapsed flight time when this prayer occurs
    const elapsedAtStart = Math.max(0, (effectiveStart - takeoffHours) * 60);
    const elapsedAtEnd = Math.max(0, (effectiveEnd - takeoffHours) * 60);
    const windowMinutes = Math.max(0, effectiveEnd - effectiveStart) * 60;

    return {
      ...slot,
      status,
      effectiveStart,
      effectiveEnd,
      elapsedAtStart,
      elapsedAtEnd,
      windowMinutes,
    };
  });
}
