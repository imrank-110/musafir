/**
 * validateScenarios.mjs — Run all 6 flight scenarios to verify prayer
 * schedule consistency across routes, times, and directions.
 * 
 * Usage: node test/validateScenarios.mjs
 */

import { createManualSession, getAirports } from '../src/utils/flightApi.js';
import { precomputeFlightSchedule } from '../src/utils/prayerMath.js';

// Flight scenarios to test
const scenarios = [
  { name: 'IAH→DOH 8:20pm (overnight east)',      dep: 'IAH', arr: 'DOH', time: '20:20', durH: 16, durM: 20, nextDay: true },
  { name: 'IAH→LHR 8:20am (daytime east)',        dep: 'IAH', arr: 'LHR', time: '08:20', durH: 9,  durM: 40, nextDay: false },
  { name: 'DOH→IAH 12:00am (midnight west)',       dep: 'DOH', arr: 'IAH', time: '00:00', durH: 16, durM: 30, nextDay: false },
  { name: 'JFK→LHR 6:00pm (evening east)',         dep: 'JFK', arr: 'LHR', time: '18:00', durH: 7,  durM: 0,  nextDay: false },
  { name: 'DXB→JED 9:00am (short regional)',       dep: 'DXB', arr: 'JED', time: '09:00', durH: 3,  durM: 30, nextDay: false },
  { name: 'KUL→JED 9:00pm (long overnight multi)', dep: 'KUL', arr: 'JED', time: '21:00', durH: 9,  durM: 0,  nextDay: false },
];

// Expected cycle order (prayers appear in this sequence or a subset thereof)
const expectedCycle = ['fajr', 'sunrise', 'dhuhrAsr', 'maghribIsha'];
const displayNames = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhrAsr: 'Dhuhr/Asr', maghribIsha: 'Maghrib/Isha' };

let allPassed = true;

for (const sc of scenarios) {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║ ${sc.name.padEnd(58)}║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);

  const durationMinutes = sc.durH * 60 + sc.durM;
  const depDate = new Date('2026-06-07');

  const session = createManualSession(sc.dep, sc.arr, sc.time, durationMinutes, depDate, sc.nextDay);
  if (session.error) {
    console.log(`  ❌ SESSION ERROR: ${session.error}`);
    allPassed = false;
    continue;
  }

  const depAirport = session.route.departure;
  const arrAirport = session.route.arrival;
  const pathPoints = session.getState().pathPoints;

  console.log(`  ${sc.dep} (UTC${depAirport.tz >= 0 ? '+' : ''}${depAirport.tz}) → ${sc.arr} (UTC${arrAirport.tz >= 0 ? '+' : ''}${arrAirport.tz})`);
  console.log(`  Departure: ${sc.time} | Duration: ${sc.durH}h ${sc.durM}m`);
  console.log(`  Path points: ${pathPoints.length}`);

  const schedule = precomputeFlightSchedule(
    pathPoints, sc.time, depAirport.tz, durationMinutes, depDate, arrAirport.tz
  );

  // Check prayer markers
  const markers = schedule.prayerMarkers;
  console.log(`  ── Prayer Markers: ${markers.length} found ──`);

  if (markers.length === 0) {
    console.log(`  ⚠️  No prayer markers found.`);
    // Show first/last entry for debugging
    if (schedule.schedule.length > 0) {
      const first = schedule.schedule[0];
      const last = schedule.schedule[schedule.schedule.length - 1];
      console.log(`  First entry: elapsed=${first.elapsedMin}m, local=${first.localTimeStr}, slot=${first.activeSlot?.key || 'none'}`);
      console.log(`  Last entry:  elapsed=${last.elapsedMin}m, local=${last.localTimeStr}, slot=${last.activeSlot?.key || 'none'}`);
    }
    allPassed = false;
    continue;
  }

  // Check order: must be increasing elapsedAtStart
  let orderOk = true;
  for (let i = 1; i < markers.length; i++) {
    if (markers[i].elapsedAtStart < markers[i - 1].elapsedAtStart) {
      console.log(`  ❌ ORDER ERROR: ${markers[i].label} (${markers[i].elapsedAtStart}m) appears before ${markers[i-1].label} (${markers[i-1].elapsedAtStart}m)`);
      orderOk = false;
    }
  }

  // Check cycle order: each marker should follow the expected cycle
  let cycleOk = true;
  const markerKeys = markers.map(m => m.key);
  const markerCyclePos = markerKeys.map(k => expectedCycle.indexOf(k));

  for (let i = 1; i < markerCyclePos.length; i++) {
    const prev = markerCyclePos[i - 1];
    const curr = markerCyclePos[i];
    // Allowed: same (wrapped around), next in cycle, or later in cycle (if some slots were skipped)
    if (curr < prev && curr !== 0) {
      console.log(`  ❌ CYCLE ERROR: ${markers[i-1].label} → ${markers[i].label} breaks the cycle order`);
      cycleOk = false;
    }
  }

  // Check no duplicate keys
  const seenKeys = new Set();
  let dupOk = true;
  for (const m of markers) {
    if (seenKeys.has(m.key)) {
      console.log(`  ⚠️  DUPLICATE: ${m.label} appears twice`);
      dupOk = false;
    }
    seenKeys.add(m.key);
  }

  // Check each marker's elapsed time is within flight duration
  let boundsOk = true;
  for (const m of markers) {
    if (m.elapsedAtStart > durationMinutes) {
      console.log(`  ❌ BOUNDS ERROR: ${m.label} at ${m.elapsedAtStart}m exceeds flight duration ${durationMinutes}m`);
      boundsOk = false;
    }
  }

  // Print results
  console.log(`  ────────────────────────────────────────────`);
  for (const m of markers) {
    const h = Math.floor(m.elapsedAtStart / 60);
    const min = Math.round(m.elapsedAtStart % 60);
    console.log(`  ${m.label.padEnd(15)} ~${h}h ${min.toString().padStart(2)}m | local: ${m.localTime} | qibla: ${m.qibla.bearingText}`);
  }

  const passed = orderOk && cycleOk && dupOk && boundsOk;
  console.log(`  ────────────────────────────────────────────`);
  console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}`);
  if (!orderOk) allPassed = false;
  if (!cycleOk) allPassed = false;
  if (!dupOk) allPassed = false;
  if (!boundsOk) allPassed = false;
}

console.log(`\n${'═'.repeat(62)}`);
if (allPassed) {
  console.log(`✅ ALL ${scenarios.length} SCENARIOS PASSED`);
} else {
  console.log(`❌ SOME SCENARIOS FAILED`);
}
console.log(`${'═'.repeat(62)}\n`);