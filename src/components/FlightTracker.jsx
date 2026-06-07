import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createManualSession, getAirports } from '../utils/flightApi';
import {
  calculateFlightPrayerTimes,
  hoursToTimeString,
  calculateQiblaDirection,
  getCombinedPrayerSlots,
  getPrayersDuringFlight,
} from '../utils/prayerMath';

// ─── Custom Icons ────────────────────────────────────────────────────────────

const planeIcon = L.divIcon({
  className: 'plane-marker',
  html: `<div style="
    width: 32px; height: 32px;
    background: #c4a882;
    border: 2px solid white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    color: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transform: rotate(-45deg);
  ">P</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const airportIcon = L.divIcon({
  className: 'airport-marker',
  html: `<div style="
    width: 24px; height: 24px;
    background: #b89978;
    border: 2px solid white;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    color: white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  ">A</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const kaabaIcon = L.divIcon({
  className: 'kaaba-marker',
  html: `<div style="
    width: 20px; height: 20px;
    background: #c4a882;
    border: 2px solid white;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    color: white;
    box-shadow: 0 0 12px rgba(196,168,130,0.5);
  ">K</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// ─── Prayer Marker Icon Factory ──────────────────────────────────────────────

function createPrayerIcon(color, label, isActive = false) {
  return L.divIcon({
    className: 'prayer-marker',
    html: `<div style="
      width: ${isActive ? 28 : 22}px; height: ${isActive ? 28 : 22}px;
      background: ${color};
      border: ${isActive ? '3px solid white' : '2px solid white'};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${isActive ? 8 : 7}px;
      font-weight: bold;
      color: white;
      box-shadow: ${isActive ? `0 0 16px ${color}80` : `0 2px 6px rgba(0,0,0,0.2)`};
      transition: all 0.3s;
    ">${label}</div>`,
    iconSize: [isActive ? 28 : 22, isActive ? 28 : 22],
    iconAnchor: [isActive ? 14 : 11, isActive ? 14 : 11],
  });
}

// ─── Auto-Fit Map ────────────────────────────────────────────────────────────

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, bounds]);
  return null;
}

// ─── Qibla Line on Map ───────────────────────────────────────────────────────

function QiblaLine({ fromLat, fromLng, bearing }) {
  if (!fromLat || !fromLng || bearing == null) return null;

  const distanceKm = 500;
  const bearingRad = bearing * Math.PI / 180;
  const latRad = fromLat * Math.PI / 180;
  const lngRad = fromLng * Math.PI / 180;
  const R = 6371;

  const endLat = Math.asin(
    Math.sin(latRad) * Math.cos(distanceKm / R) +
    Math.cos(latRad) * Math.sin(distanceKm / R) * Math.cos(bearingRad)
  );
  const endLng = lngRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distanceKm / R) * Math.cos(latRad),
    Math.cos(distanceKm / R) - Math.sin(latRad) * Math.sin(endLat)
  );

  return (
    <Polyline
      positions={[[fromLat, fromLng], [endLat * 180 / Math.PI, endLng * 180 / Math.PI]]}
      pathOptions={{ color: '#c4a882', weight: 2, opacity: 0.7, dashArray: '8, 6' }}
    />
  );
}

// ─── Countdown Timer ─────────────────────────────────────────────────────────

function CountdownTimer({ seconds }) {
  if (seconds <= 0) return <span className="text-[#c0392b] font-bold">CLOSED</span>;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return (
    <span className="font-mono text-lg font-bold text-[#c4a882]">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

// ─── Combined Prayer Timeline ────────────────────────────────────────────────

function PrayerTimeline({ flightState, prayerSlots, currentSlot, qibla }) {
  if (!flightState || !prayerSlots) return null;

  const { elapsedMinutes, durationMinutes } = flightState;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0]">
      <h3 className="text-lg font-semibold text-[#3d352e] mb-3">
        Prayer Schedule
      </h3>

      {/* Flight Timer */}
      <div className="flex items-center justify-between mb-4 p-3 bg-[#f5f0eb] rounded-xl border border-[#e0d5c8]">
        <div className="text-center">
          <div className="text-xs text-[#a09080]">Elapsed</div>
          <div className="text-lg font-bold text-[#3d352e]">
            {Math.floor(elapsedMinutes / 60)}h {elapsedMinutes % 60}m
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-[#a09080]">Duration</div>
          <div className="text-lg font-bold text-[#3d352e]">
            {Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-[#a09080]">Progress</div>
          <div className="text-lg font-bold text-[#c4a882]">
            {durationMinutes > 0 ? Math.round((elapsedMinutes / durationMinutes) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Qibla Direction */}
      {qibla && (
        <div className="flex items-center justify-between mb-4 p-3 bg-[#f5f0eb] rounded-xl border border-[#e0d5c8]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#c4a882]/20 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#c4a882] rounded-sm" style={{ transform: `rotate(${qibla.bearing}deg)` }} />
            </div>
            <div>
              <div className="text-xs text-[#a09080]">Qibla Direction</div>
              <div className="text-sm font-bold text-[#3d352e]">{qibla.bearingText}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#a09080]">Distance to Kaaba</div>
            <div className="text-sm font-bold text-[#3d352e]">
              {Math.round(
                Math.acos(
                  Math.sin(flightState.position.lat * Math.PI / 180) * Math.sin(21.4225 * Math.PI / 180) +
                  Math.cos(flightState.position.lat * Math.PI / 180) * Math.cos(21.4225 * Math.PI / 180) *
                  Math.cos((39.8262 - flightState.position.lng) * Math.PI / 180)
                ) * 6371
              ).toLocaleString()} km
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative pl-6">
        <div className="absolute left-[8px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#c4a882]/60 via-[#b89978]/60 to-[#c4a882]/60 shadow-[0_0_8px_rgba(196,168,130,0.3)]" />
        {prayerSlots.map((slot) => {
          const isCurrent = currentSlot?.key === slot.key;
          const isPast = currentSlot && prayerSlots.indexOf(slot) < prayerSlots.indexOf(currentSlot);

          return (
            <div
              key={slot.key}
              className={`flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
                isCurrent
                  ? 'bg-white/80 backdrop-blur-2xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl border-[#c4a882]/40'
                  : isPast
                  ? 'opacity-40'
                  : 'hover:bg-[#ede6dc]/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: slot.color }}
                >
                  {slot.short}
                </div>
                <div>
                  <span className={`font-medium ${isCurrent ? 'text-[#c4a882]' : 'text-[#3d352e]'}`}>
                    {slot.label}
                  </span>
                  <div className="text-xs text-[#a09080]">
                    {slot.status === 'not-during-flight' ? (
                      <span className="text-[#a09080]">Not during flight</span>
                    ) : (
                      <>
                        ~{Math.floor(slot.elapsedAtStart / 60)}h {Math.round(slot.elapsedAtStart % 60)}m into flight
                        {slot.status === 'partially-during-flight' && (
                          <span className="text-[#b89978]"> (partial)</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  {slot.status !== 'not-during-flight' ? (
                    <>
                      <div className="text-xs text-[#a09080]">
                        {Math.round(slot.windowMinutes)} min window
                      </div>
                      <div className="text-xs text-[#a09080]">
                        {slot.status === 'during-flight' ? 'Full window' : 'Partial window'}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-[#a09080]">Outside flight</div>
                  )}
                </div>
                {isCurrent && (
                  <span className="px-2 py-0.5 bg-gradient-to-r from-[#c4a882] to-[#b89978] text-white text-xs rounded-full font-bold shadow-lg shadow-[#c4a882]/30">
                    NOW
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Current Prayer Countdown */}
      {currentSlot && (
        <div className="mt-4 p-3 bg-[#f5f0eb] rounded-xl border border-[#e0d5c8]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-[#8a7a6a]">
              {currentSlot.label} window closes in:
            </div>
            <CountdownTimer seconds={currentSlot.remainingSeconds || 0} />
          </div>
          <div className="flex items-center justify-between text-xs text-[#a09080]">
            <span>Started: ~{Math.floor(currentSlot.elapsedAtStart / 60)}h {Math.round(currentSlot.elapsedAtStart % 60)}m</span>
            <span>Window: {Math.round(currentSlot.windowMinutes)} min</span>
          </div>
          {qibla && (
            <div className="text-xs text-[#c4a882] mt-1">
              Face Qibla: {qibla.bearingText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Flight Info Panel ───────────────────────────────────────────────────────

function FlightInfoPanel({ flightState }) {
  if (!flightState) return null;

  const { state, flightCode, departure, arrival, altitude, groundSpeed, flightProgress, elapsedMinutes, durationMinutes } = flightState;

  const progressPct = Math.round((flightProgress || 0) * 100);
  const elapsedH = Math.floor((elapsedMinutes || 0) / 60);
  const elapsedM = (elapsedMinutes || 0) % 60;
  const totalH = Math.floor((durationMinutes || 0) / 60);
  const totalM = (durationMinutes || 0) % 60;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0]">
      <h3 className="text-lg font-semibold text-[#3d352e] mb-3">
        {departure?.code} → {arrival?.code}
      </h3>

      {/* Route */}
      <div className="flex items-center justify-between mb-4 p-3 bg-[#f5f0eb] rounded-xl border border-[#e0d5c8]">
        <div className="text-center">
          <div className="text-xs text-[#a09080]">{departure?.code}</div>
          <div className="text-sm font-bold text-[#3d352e]">{departure?.city}</div>
          <div className="text-xs text-[#a09080]">{departure?.country}</div>
        </div>
        <div className="text-[#a09080] text-lg">→</div>
        <div className="text-center">
          <div className="text-xs text-[#a09080]">{arrival?.code}</div>
          <div className="text-sm font-bold text-[#3d352e]">{arrival?.city}</div>
          <div className="text-xs text-[#a09080]">{arrival?.country}</div>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
          state === 'pre-takeoff' ? 'bg-[#f5f0eb] text-[#b89978] border border-[#e0d5c8]' :
          state === 'in-flight' ? 'bg-[#f5f0eb] text-[#c4a882] border border-[#e0d5c8]' :
          'bg-[#f5f0eb] text-[#a08060] border border-[#e0d5c8]'
        }`}>
          {state === 'pre-takeoff' ? 'Pre-Takeoff' : state === 'in-flight' ? 'In-Flight' : 'Landed'}
        </span>
      </div>

      {/* Flight metrics */}
      {state === 'in-flight' && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2 bg-[#f5f0eb] rounded-lg">
            <div className="text-xs text-[#a09080]">Altitude</div>
            <div className="text-sm font-bold text-[#3d352e]">{Math.round(altitude * 3.28084).toLocaleString()} ft</div>
          </div>
          <div className="p-2 bg-[#f5f0eb] rounded-lg">
            <div className="text-xs text-[#a09080]">Ground Speed</div>
            <div className="text-sm font-bold text-[#3d352e]">{Math.round(groundSpeed * 0.539957).toLocaleString()} kn</div>
          </div>
          <div className="p-2 bg-[#f5f0eb] rounded-lg">
            <div className="text-xs text-[#a09080]">Elapsed</div>
            <div className="text-sm font-bold text-[#3d352e]">{elapsedH}h {elapsedM}m</div>
          </div>
          <div className="p-2 bg-[#f5f0eb] rounded-lg">
            <div className="text-xs text-[#a09080]">Remaining</div>
            <div className="text-sm font-bold text-[#3d352e]">{totalH - elapsedH}h {Math.max(0, totalM - elapsedM)}m</div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {state === 'in-flight' && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-[#a09080] mb-1">
            <span>{departure?.code}</span>
            <span>{progressPct}%</span>
            <span>{arrival?.code}</span>
          </div>
          <div className="w-full bg-[#ede6dc] rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#c4a882] to-[#b89978] h-full rounded-full transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main FlightTracker Component ────────────────────────────────────────────

export default function FlightTracker() {
  const [depCode, setDepCode] = useState('');
  const [arrCode, setArrCode] = useState('');
  const [depDate, setDepDate] = useState(new Date().toISOString().split('T')[0]);
  const [depTime, setDepTime] = useState('14:30');
  const [durationH, setDurationH] = useState('16');
  const [durationM, setDurationM] = useState('20');
  const [nextDay, setNextDay] = useState(false);

  const [session, setSession] = useState(null);
  const [flightState, setFlightState] = useState(null);
  const [prayerSlots, setPrayerSlots] = useState(null);
  const [currentSlot, setCurrentSlot] = useState(null);
  const [qibla, setQibla] = useState(null);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1);

  const intervalRef = useRef(null);
  const airports = getAirports();

  // Start simulation
  const startSimulation = useCallback(() => {
    if (!depCode || !arrCode) {
      setError('Please select departure and arrival airports.');
      return;
    }

    const durationMinutes = (parseInt(durationH) || 0) * 60 + (parseInt(durationM) || 0);
    const newSession = createManualSession(depCode, arrCode, depTime, durationMinutes, new Date(depDate), nextDay);

    if (newSession.error) {
      setError(newSession.error);
      setSession(null);
      setFlightState(null);
      return;
    }

    setError('');
    setSession(newSession);
    setFlightState(newSession.getState());
    setIsRunning(true);
    setSpeed(1);
  }, [depCode, arrCode, depTime, durationH, durationM, depDate, nextDay]);

  // Stop simulation
  const stopSimulation = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Take off
  const handleTakeoff = useCallback(() => {
    if (session && session.state() === 'pre-takeoff') {
      session.takeOff();
      setFlightState(session.getState());
    }
  }, [session]);

  // Main simulation loop
  useEffect(() => {
    if (!isRunning || !session) return;

    const tick = () => {
      session.tick();
      const state = session.getState();
      setFlightState(state);

      // Calculate prayer times and Qibla at current position
      if (state.position && state.state === 'in-flight') {
        const times = calculateFlightPrayerTimes(
          state.position.lat,
          state.position.lng,
          state.altitude || 0,
          new Date()
        );

        // Get combined prayer slots
        const slots = getCombinedPrayerSlots(times);

        // Calculate takeoff and landing times in local hours
        const takeoffH = state.takeoffTime
          ? state.takeoffTime.getHours() + state.takeoffTime.getMinutes() / 60
          : 0;
        const landingH = state.takeoffTime
          ? (state.takeoffTime.getHours() + state.durationMinutes / 60) % 24
          : 0;

        const flightSlots = getPrayersDuringFlight(slots, takeoffH, landingH);
        setPrayerSlots(flightSlots);

        // Find current slot
        const now = new Date();
        const nowH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        const current = flightSlots.find(s =>
          s.status !== 'not-during-flight' &&
          nowH >= s.effectiveStart &&
          nowH < s.effectiveEnd
        );
        if (current) {
          const remaining = Math.max(0, (current.effectiveEnd - nowH) * 3600);
          setCurrentSlot({ ...current, remainingSeconds: remaining });
        } else {
          setCurrentSlot(null);
        }

        // Qibla
        const q = calculateQiblaDirection(state.position.lat, state.position.lng);
        setQibla(q);
      }

      // Auto-stop when landed
      if (state.state === 'landed') {
        stopSimulation();
      }
    };

    const intervalMs = Math.max(100, 2000 / speed);
    intervalRef.current = setInterval(tick, intervalMs);
    tick();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, session, stopSimulation, speed]);

  // Build map bounds
  const getMapBounds = () => {
    if (!flightState) return null;
    const points = flightState.pathPoints || [];
    if (points.length === 0) return null;
    return points.map(p => [p.lat, p.lng]);
  };

  const mapBounds = getMapBounds();

  // Calculate prayer marker positions along the flight path
  const getPrayerMarkers = () => {
    if (!flightState || !prayerSlots || !flightState.pathPoints) return [];
    const path = flightState.pathPoints;
    const duration = flightState.durationMinutes;

    return prayerSlots
      .filter(s => s.status !== 'not-during-flight')
      .map(slot => {
        const frac = Math.min(1, Math.max(0, slot.elapsedAtStart / duration));
        const idx = Math.min(Math.floor(frac * (path.length - 1)), path.length - 1);
        return {
          ...slot,
          position: path[idx],
          isActive: currentSlot?.key === slot.key,
        };
      });
  };

  const prayerMarkers = getPrayerMarkers();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-[#e0d5c8] p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-[#3d352e]">
            In-Flight Prayer Tracker
          </h1>
          <p className="text-[#8a7a6a] text-sm mt-1">
            Enter your flight details to see prayer times during your journey
          </p>
        </div>
      </div>

      {/* Input Form */}
      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 mb-4 transition-all duration-500 hover:border-[#d0c0b0]">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Departure Airport</label>
              <select
                value={depCode}
                onChange={(e) => setDepCode(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882]"
                disabled={isRunning}
              >
                <option value="">Select...</option>
                {airports.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.city}, {a.country}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Arrival Airport</label>
              <select
                value={arrCode}
                onChange={(e) => setArrCode(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882]"
                disabled={isRunning}
              >
                <option value="">Select...</option>
                {airports.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.city}, {a.country}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Date</label>
              <input
                type="date"
                value={depDate}
                onChange={(e) => setDepDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882]"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Departure Time</label>
              <input
                type="time"
                value={depTime}
                onChange={(e) => setDepTime(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882]"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Duration</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={durationH}
                  onChange={(e) => setDurationH(e.target.value)}
                  placeholder="h"
                  className="w-full px-2 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] text-center focus:outline-none focus:border-[#c4a882]"
                  disabled={isRunning}
                />
                <span className="flex items-center text-[#a09080]">h</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={durationM}
                  onChange={(e) => setDurationM(e.target.value)}
                  placeholder="m"
                  className="w-full px-2 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] text-center focus:outline-none focus:border-[#c4a882]"
                  disabled={isRunning}
                />
                <span className="flex items-center text-[#a09080]">m</span>
              </div>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm text-[#8a7a6a] mb-2">
                <input
                  type="checkbox"
                  checked={nextDay}
                  onChange={(e) => setNextDay(e.target.checked)}
                  className="w-4 h-4 accent-[#c4a882]"
                  disabled={isRunning}
                />
                Arrive next day
              </label>
              {!isRunning ? (
                <button
                  onClick={startSimulation}
                  className="w-full px-4 py-2 bg-[#c4a882] hover:bg-[#b89978] text-white font-bold rounded-lg transition-colors"
                >
                  Start Simulation
                </button>
              ) : (
                <div className="flex gap-1">
                  {session && session.state() === 'pre-takeoff' && (
                    <button
                      onClick={handleTakeoff}
                      className="flex-1 px-3 py-2 bg-[#b89978] hover:bg-[#a08060] text-white font-bold rounded-lg transition-colors text-sm"
                    >
                      Take Off
                    </button>
                  )}
                  <button
                    onClick={stopSimulation}
                    className="flex-1 px-3 py-2 bg-[#d0b0a0] hover:bg-[#c0a090] text-white font-bold rounded-lg transition-colors text-sm"
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-3 p-3 bg-[#f0e0d0] border border-[#d0b0a0] rounded-lg text-[#8a5a4a] text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Speed Controls */}
        {isRunning && session && session.state() === 'in-flight' && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl">
            <span className="text-sm text-[#8a7a6a]">Speed:</span>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                  speed === s
                    ? 'bg-[#c4a882] text-white'
                    : 'bg-[#ede6dc] text-[#8a7a6a] hover:bg-[#e0d5c8]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}

        {/* Main Content */}
        {flightState && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Map */}
            <div className="lg:col-span-2">
              <div className="bg-white/70 backdrop-blur rounded-xl overflow-hidden border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)]" style={{ height: '500px' }}>
                <MapContainer
                  center={[flightState.position?.lat || 0, flightState.position?.lng || 0]}
                  zoom={4}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <FitBounds bounds={mapBounds} />

                  {/* Flight path */}
                  {flightState.pathPoints && flightState.pathPoints.length > 0 && (
                    <Polyline
                      positions={flightState.pathPoints.map(p => [p.lat, p.lng])}
                      pathOptions={{ color: '#c4a882', weight: 3, opacity: 0.6, dashArray: '10, 10' }}
                    />
                  )}

                  {/* Prayer markers along the path */}
                  {prayerMarkers.map((marker) => (
                    <Marker
                      key={marker.key}
                      position={[marker.position.lat, marker.position.lng]}
                      icon={createPrayerIcon(marker.color, marker.short, marker.isActive)}
                    >
                      <Popup>
                        <div className="text-sm">
                          <strong>{marker.label}</strong>
                          <br />
                          ~{Math.floor(marker.elapsedAtStart / 60)}h {Math.round(marker.elapsedAtStart % 60)}m into flight
                          <br />
                          Window: {Math.round(marker.windowMinutes)} min
                          <br />
                          {marker.isActive ? <span className="text-[#c4a882]">Active Now</span> : <span className="text-[#a09080]">Upcoming</span>}
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                  {/* Qibla line */}
                  {flightState.position && flightState.state === 'in-flight' && qibla && (
                    <QiblaLine
                      fromLat={flightState.position.lat}
                      fromLng={flightState.position.lng}
                      bearing={qibla.bearing}
                    />
                  )}

                  {/* Kaaba marker */}
                  <Marker position={[21.4225, 39.8262]} icon={kaabaIcon}>
                    <Popup>
                      <div className="text-sm">
                        <strong>Kaaba</strong>
                        <br />
                        <span className="text-[#a09080]">Makkah, Saudi Arabia</span>
                      </div>
                    </Popup>
                  </Marker>

                  {/* Departure marker */}
                  {flightState.departure && (
                    <Marker position={[flightState.departure.lat, flightState.departure.lng]} icon={airportIcon}>
                      <Popup>
                        <div className="text-sm">
                          <strong>{flightState.departure.code}</strong> — {flightState.departure.city}
                          <br />
                          <span className="text-[#a09080]">Departure</span>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Arrival marker */}
                  {flightState.arrival && (
                    <Marker position={[flightState.arrival.lat, flightState.arrival.lng]} icon={airportIcon}>
                      <Popup>
                        <div className="text-sm">
                          <strong>{flightState.arrival.code}</strong> — {flightState.arrival.city}
                          <br />
                          <span className="text-[#a09080]">Arrival</span>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Plane marker */}
                  {flightState.position && flightState.state === 'in-flight' && (
                    <Marker position={[flightState.position.lat, flightState.position.lng]} icon={planeIcon}>
                      <Popup>
                        <div className="text-sm">
                          <strong>{flightState.departure?.code} → {flightState.arrival?.code}</strong>
                          <br />
                          Alt: {Math.round(flightState.altitude * 3.28084).toLocaleString()} ft
                          <br />
                          Speed: {Math.round(flightState.groundSpeed * 0.539957)} kn
                          <br />
                          Qibla: {qibla?.bearingText || '--'}
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>

              {/* Map Legend */}
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#8a7a6a]">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-[#c4a882] rounded-full" />
                  <span>Plane</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-[#b89978] rounded" />
                  <span>Airport</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-[#c4a882] rounded-sm" />
                  <span>Kaaba</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-[#3b82f6] rounded-full" />
                  <span>Fajr</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-[#f59e0b] rounded-full" />
                  <span>Dhuhr/Asr</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-[#ef4444] rounded-full" />
                  <span>Maghrib/Isha</span>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <FlightInfoPanel flightState={flightState} />
              <PrayerTimeline
                flightState={flightState}
                prayerSlots={prayerSlots}
                currentSlot={currentSlot}
                qibla={qibla}
              />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!flightState && !error && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4 text-[#c4a882] font-serif">M</div>
            <h2 className="text-xl font-bold text-[#3d352e] mb-2">Plan Your Flight</h2>
            <p className="text-[#8a7a6a]">
              Select departure and arrival airports, set your time and duration,
              <br />
              then start the simulation to see prayer times during your journey.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}