/**
 * prayerMath.js — Solar Calculation Engine & Qibla Direction
 * 
 * Implements the University of Tehran (Institute of Geophysics) parameters
 * for Ayatollah Sistani's rulings:
 *   Fajr:   17.7° below horizon
 *   Maghrib: 4.5° below horizon
 *   Isha:   14.0° below horizon
 * 
 * Includes altitude correction for high-altitude flight, Qibla direction,
 * and UTC-based flight prayer scheduling.
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

// ─── Timezone from Longitude ─────────────────────────────────────────────────

function getTimezoneFromLng(lng) {
  return Math.round(lng / 15);
}

// ─── Qibla Direction ─────────────────────────────────────────────────────────

export function calculateQiblaDirection(lat, lng) {
  const φ1 = lat * DEG;
  const φ2 = KAABA_LAT * DEG;
  const λ1 = lng * DEG;
  const λ2 = KAABA_LNG * DEG;
  const Δλ = λ2 - λ1;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let bearing = (atan2(y, x) + 360) % 360;

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

export function calculatePrayerTimes(date, lat, lng, timezone, altitudeMeters = 0) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 79) - 32083;
  jd = jd - Math.floor((y - 1) / 100) + Math.floor((y - 1) / 400) + 2;

  const dhuhrBase = dhuhrMinutes(jd, lng, timezone);
  const dhuhr = fixHour(dhuhrBase);

  const dec = sunDeclination(jd);

  function hourAngle(angle) {
    const numerator = sin(angle) - sin(lat) * sin(dec);
    const denominator = cos(lat) * cos(dec);
    if (Math.abs(denominator) < 1e-10) return NaN;
    const val = numerator / denominator;
    if (val > 1 || val < -1) return NaN;
    return acos(val) / 15;
  }

  const sunriseAngle = -0.833 - altitudeDipAngle(altitudeMeters);
  const sunriseHA = hourAngle(sunriseAngle);
  const sunrise = fixHour(dhuhrBase - sunriseHA);
  const sunset = fixHour(dhuhrBase + sunriseHA);

  const fajrAngle = correctedAngle(TEHRAN_ANGLES.fajr, altitudeMeters, true);
  const fajrHA = hourAngle(-fajrAngle);
  const fajr = fixHour(dhuhrBase - fajrHA);

  const maghribAngle = correctedAngle(TEHRAN_ANGLES.maghrib, altitudeMeters, false);
  const maghribHA = hourAngle(-maghribAngle);
  const maghrib = fixHour(dhuhrBase + maghribHA);

  const ishaAngle = TEHRAN_ANGLES.isha;
  const ishaHA = hourAngle(-ishaAngle);
  const isha = fixHour(dhuhrBase + ishaHA);

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

export function hoursToTimeString(hours) {
  if (hours == null || isNaN(hours)) return '--:--';
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

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

export function calculateFlightPrayerTimes(lat, lng, altitudeMeters, date) {
  const tz = getTimezoneFromLng(lng);
  return calculatePrayerTimes(date, lat, lng, tz, altitudeMeters);
}

export function generateFlightPrayerSchedule(lat, lng, altitudeMeters, date, elapsedMinutes, durationMinutes) {
  const times = calculateFlightPrayerTimes(lat, lng, altitudeMeters, date);
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

export function getCombinedPrayerSlots(prayerTimes) {
  if (!prayerTimes) return [];
  return [
    {
      key: 'fajr',
      label: 'Fajr',
      short: 'F',
      startTime: prayerTimes.fajr,
      endTime: prayerTimes.sunrise,
      color: '#3b82f6',
    },
    {
      key: 'dhuhrAsr',
      label: 'Dhuhr/Asr',
      short: 'D/A',
      startTime: prayerTimes.dhuhr,
      endTime: prayerTimes.maghrib,
      color: '#f59e0b',
    },
    {
      key: 'maghribIsha',
      label: 'Maghrib/Isha',
      short: 'M/I',
      startTime: prayerTimes.maghrib,
      endTime: prayerTimes.midnight,
      color: '#ef4444',
    },
  ];
}

export function getPrayersDuringFlight(slots, takeoffHours, landingHours) {
  return slots.map(slot => {
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

// ─── UTC-Based Flight Prayer Scheduling ──────────────────────────────────────

/**
 * Get the altitude and ground speed at a given flight progress (0..1).
 */
function getFlightMetrics(progress) {
  let altitude = 0;
  let groundSpeed = 0;

  if (progress < 0.05) {
    altitude = Math.min(10668, progress / 0.05 * 10668);
    groundSpeed = 250 + (progress / 0.05) * 600;
  } else if (progress > 0.85) {
    const descent = (progress - 0.85) / 0.15;
    altitude = Math.max(0, 10668 * (1 - descent));
    groundSpeed = Math.max(250, 850 * (1 - descent * 0.7));
  } else {
    altitude = 10668;
    groundSpeed = 850;
  }

  return { altitude, groundSpeed };
}

/**
 * Pre-compute the full flight prayer schedule using UTC-based time.
 * 
 * This is the core fix: instead of using the computer's local clock, we
 * simulate the flight's own clock starting from the departure UTC time.
 * At each position along the path, we calculate the local time using
 * the timezone of that position, then compute prayer times for that
 * exact location and time.
 * 
 * @param {Array} pathPoints - Array of {lat, lng} along the Great Circle
 * @param {string} depTimeStr - Departure local time "HH:MM"
 * @param {number} depTz - Departure airport timezone offset (e.g., 3 for DOH)
 * @param {number} durationMinutes - Total flight duration
 * @param {Date} depDate - Departure date
 * @param {number} scanInterval - Minutes between each scan point (default: 2)
 * @returns {Object} { schedule, prayerMarkers }
 */
export function precomputeFlightSchedule(pathPoints, depTimeStr, depTz, durationMinutes, depDate, scanInterval = 2) {
  // Parse departure time
  const [depH, depM] = depTimeStr.split(':').map(Number);
  const depLocalMinutes = depH * 60 + depM;

  // Departure UTC in minutes
  const depUtcMinutes = depLocalMinutes - depTz * 60;

  const schedule = [];
  const prayerMarkers = [];
  const combinedPrayerSlots = [];

  // Track active prayer for combining slots
  let currentSlot = null;

  // Scan the flight path
  const numScans = Math.ceil(durationMinutes / scanInterval);

  for (let i = 0; i <= numScans && i * scanInterval <= durationMinutes; i++) {
    const elapsedMin = i * scanInterval;
    const progress = durationMinutes > 0 ? elapsedMin / durationMinutes : 0;

    // Get position from path
    const idx = Math.min(Math.floor(progress * (pathPoints.length - 1)), pathPoints.length - 1);
    const pos = pathPoints[idx];
    if (!pos) continue;

    // Current UTC time at this elapsed minute
    const utcMin = depUtcMinutes + elapsedMin;
    const utcHours = (utcMin / 60) % 24;

    // Local time at this position
    const posTz = getTimezoneFromLng(pos.lng);
    let localHours = (utcHours + posTz + 24) % 24;

    // Build a Date for this position's local time
    const localDate = new Date(depDate);
    const totalLocalMinutes = localHours * 60;
    localDate.setHours(Math.floor(totalLocalMinutes / 60), Math.round(totalLocalMinutes % 60), 0, 0);
    // Add days if needed
    if (depUtcMinutes + elapsedMin >= 1440) {
      localDate.setDate(localDate.getDate() + 1);
    }

    // Flight metrics
    const { altitude, groundSpeed } = getFlightMetrics(progress);

    // Calculate prayer times at this position
    const prayerTimes = calculatePrayerTimes(localDate, pos.lat, pos.lng, posTz, altitude);

    // Qibla at this position
    const qibla = calculateQiblaDirection(pos.lat, pos.lng);

    // Determine which combined prayer slot is active at this local time
    const slots = getCombinedPrayerSlots(prayerTimes);
    const activeSlot = slots.find(s => localHours >= s.startTime && localHours < s.endTime);

    schedule.push({
      elapsedMin,
      progress,
      position: pos,
      localHours,
      localTimeStr: hoursToTimeString(localHours),
      altitude: Math.round(altitude),
      groundSpeed: Math.round(groundSpeed),
      prayerTimes,
      qibla,
      activeSlot: activeSlot || null,
    });
  }

  // Build combined prayer slots with their elapsed times and positions
  // Scan the schedule to find where each prayer starts and ends
  const prayerOrder = [
    { key: 'fajr', label: 'Fajr', short: 'F', color: '#3b82f6' },
    { key: 'dhuhrAsr', label: 'Dhuhr/Asr', short: 'D/A', color: '#f59e0b' },
    { key: 'maghribIsha', label: 'Maghrib/Isha', short: 'M/I', color: '#ef4444' },
  ];

  for (const p of prayerOrder) {
    let startEntry = null;
    let endEntry = null;
    let qiblaAtMid = null;

    for (const entry of schedule) {
      if (entry.activeSlot && entry.activeSlot.key === p.key) {
        if (!startEntry) {
          startEntry = entry;
        }
        endEntry = entry;
        // Qibla at midpoint
        if (!qiblaAtMid) {
          qiblaAtMid = entry.qibla;
        }
      }
    }

    if (startEntry && endEntry) {
      const elapsedAtStart = startEntry.elapsedMin;
      const elapsedAtEnd = endEntry.elapsedMin + scanInterval; // +scanInterval because the last entry is still inside

      // Use LOCAL prayer time duration — not flight elapsed minutes — for the window
      const pt = startEntry.prayerTimes;
      let windowMinutes = 0;
      if (p.key === 'fajr') {
        windowMinutes = ((pt.sunrise - pt.fajr) * 60);
      } else if (p.key === 'dhuhrAsr') {
        windowMinutes = ((pt.maghrib - pt.dhuhr) * 60);
      } else if (p.key === 'maghribIsha') {
        windowMinutes = ((pt.midnight - pt.maghrib) * 60);
      }
      windowMinutes = Math.max(0, windowMinutes);

      // Position at start of prayer
      const startIdx = Math.min(Math.floor((elapsedAtStart / durationMinutes) * (pathPoints.length - 1)), pathPoints.length - 1);
      const startPos = pathPoints[startIdx];

      prayerMarkers.push({
        key: p.key,
        label: p.label,
        short: p.short,
        color: p.color,
        elapsedAtStart,
        elapsedAtEnd,
        windowMinutes,
        position: startPos,
        localTime: startEntry.localTimeStr,
        qibla: qiblaAtMid || startEntry.qibla,
        status: 'during-flight',
      });
    } else {
      prayerMarkers.push({
        key: p.key,
        label: p.label,
        short: p.short,
        color: p.color,
        elapsedAtStart: 0,
        elapsedAtEnd: 0,
        windowMinutes: 0,
        position: null,
        qibla: null,
        status: 'not-during-flight',
      });
    }
  }

  return {
    schedule,
    prayerMarkers,
    durationMinutes,
    depUtcMinutes,
  };
}

/**
 * Get the current flight state from a pre-computed schedule.
 */
export function getFlightStateAtElapsed(schedule, elapsedMinutes, durationMinutes, pathPoints, depCode, arrCode, depInfo, arrInfo) {
  // Find the closest schedule entry
  const entry = schedule.reduce((closest, e) => {
    return Math.abs(e.elapsedMin - elapsedMinutes) < Math.abs(closest.elapsedMin - elapsedMinutes) ? e : closest;
  }, schedule[0]);

  const progress = durationMinutes > 0 ? elapsedMinutes / durationMinutes : 0;

  // Get position from path
  const idx = Math.min(Math.floor(progress * (pathPoints.length - 1)), pathPoints.length - 1);
  const pos = pathPoints[idx] || entry.position;

  let state = 'in-flight';
  if (elapsedMinutes <= 0) state = 'pre-takeoff';
  if (elapsedMinutes >= durationMinutes) state = 'landed';

  const isCurrentlyInPrayer = entry && entry.activeSlot;

  return {
    state,
    flightCode: `${depCode}${arrCode}`,
    departure: depInfo,
    arrival: arrInfo,
    position: pos,
    altitude: entry?.altitude || 0,
    groundSpeed: entry?.groundSpeed || 0,
    flightProgress: progress,
    elapsedMinutes,
    durationMinutes,
    pathPoints,
    timestamp: new Date(),
    localTime: entry?.localTimeStr || '--:--',
    currentPrayer: isCurrentlyInPrayer ? {
      label: entry.activeSlot.label,
      key: entry.activeSlot.key,
      color: entry.activeSlot.color,
      localTime: hoursToTimeString(entry.activeSlot.startTime),
      endTime: hoursToTimeString(entry.activeSlot.endTime),
      timeUntilNext: Math.max(0, (entry.activeSlot.endTime - entry.localHours) * 3600),
    } : null,
    qibla: entry?.qibla || null,
  };
}