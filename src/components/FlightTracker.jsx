import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createFlightSession, getAvailableRoutes } from '../utils/flightApi';
import { calculateFlightPrayerTimes, hoursToTimeString, getCurrentPrayerInfo } from '../utils/prayerMath';

// ─── Custom Plane Icon ───────────────────────────────────────────────────────

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

// ─── Prayer Timeline ─────────────────────────────────────────────────────────

function PrayerTimeline({ prayerTimes, currentPrayer }) {
  const order = [
    { key: 'fajr', label: 'Fajr', icon: 'F' },
    { key: 'sunrise', label: 'Sunrise', icon: 'S' },
    { key: 'dhuhr', label: 'Dhuhr', icon: 'D' },
    { key: 'asr', label: 'Asr', icon: 'A' },
    { key: 'maghrib', label: 'Maghrib', icon: 'M' },
    { key: 'isha', label: 'Isha', icon: 'I' },
  ];

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0]">
      <h3 className="text-lg font-semibold text-[#3d352e] mb-3">
        Prayer Timeline
      </h3>
      <div className="relative pl-6">
        <div className="absolute left-[8px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#c4a882]/60 via-[#b89978]/60 to-[#c4a882]/60 shadow-[0_0_8px_rgba(196,168,130,0.3)]" />
        {order.map(({ key, label, icon }, idx) => {
          const time = prayerTimes[key];
          const isCurrent = currentPrayer?.current?.name === key;
          const isPast = currentPrayer && (() => {
            const now = new Date();
            const nowH = now.getHours() + now.getMinutes() / 60;
            return time < nowH && key !== 'fajr';
          })();

          return (
            <div
              key={key}
              className={`flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
                isCurrent
                  ? 'bg-white/80 backdrop-blur-2xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl border-[#c4a882]/40'
                  : isPast
                  ? 'opacity-40'
                  : 'hover:bg-[#ede6dc]/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#ede6dc] flex items-center justify-center text-xs font-bold text-[#8a7a6a]">
                  {icon}
                </div>
                <span className={`font-medium ${isCurrent ? 'text-[#c4a882]' : 'text-[#3d352e]'}`}>
                  {label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-mono ${isCurrent ? 'text-[#3d352e] font-bold' : 'text-[#8a7a6a]'}`}>
                  {hoursToTimeString(time)}
                </span>
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

      {currentPrayer && (
        <div className="mt-4 p-3 bg-[#f5f0eb] rounded-xl border border-[#e0d5c8]">
          <div className="text-sm text-[#8a7a6a] mb-1">
            {currentPrayer.current?.label} window closes in:
          </div>
          <CountdownTimer seconds={currentPrayer.timeUntilNext} />
          {currentPrayer.next && (
            <div className="text-xs text-[#a09080] mt-1">
              Next: {currentPrayer.next.label} at {hoursToTimeString(currentPrayer.next.time)}
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

  const { state, flightCode, departure, arrival, altitude, groundSpeed, flightProgress, elapsedMinutes, durationMinutes, gate, boardingStatus, delayMinutes, runwayQueue, takeoffTime, estimatedArrival } = flightState;

  const progressPct = Math.round((flightProgress || 0) * 100);
  const elapsedH = Math.floor((elapsedMinutes || 0) / 60);
  const elapsedM = (elapsedMinutes || 0) % 60;
  const totalH = Math.floor((durationMinutes || 0) / 60);
  const totalM = (durationMinutes || 0) % 60;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0]">
      <h3 className="text-lg font-semibold text-[#3d352e] mb-3">
        {flightCode}
      </h3>

      {/* Route */}
      <div className="flex items-center justify-between mb-4 p-3 bg-[#f5f0eb] rounded-xl border border-[#e0d5c8]">
        <div className="text-center">
          <div className="text-xs text-[#a09080]">{departure?.code}</div>
          <div className="text-sm font-bold text-[#3d352e]">{departure?.city}</div>
        </div>
        <div className="text-[#a09080] text-lg">→</div>
        <div className="text-center">
          <div className="text-xs text-[#a09080]">{arrival?.code}</div>
          <div className="text-sm font-bold text-[#3d352e]">{arrival?.city}</div>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
          state === 'pre-takeoff' ? 'bg-[#f5f0eb] text-[#b89978] border border-[#e0d5c8]' :
          state === 'in-flight' ? 'bg-[#f5f0eb] text-[#c4a882] border border-[#e0d5c8]' :
          'bg-[#f5f0eb] text-[#a08060] border border-[#e0d5c8]'
        }`}>
          {state === 'pre-takeoff' ? 'Pre-Takeoff' : state === 'in-flight' ? 'In-Flight' : 'Landed'}
        </span>
        {state === 'pre-takeoff' && (
          <>
            <span className="px-2 py-1 bg-[#ede6dc] text-[#8a7a6a] rounded-full text-xs">{gate}</span>
            <span className={`px-2 py-1 rounded-full text-xs ${
              boardingStatus === 'On Time' ? 'bg-[#f5f0eb] text-[#a08060] border border-[#e0d5c8]' : 'bg-[#f0e0d0] text-[#8a5a4a] border border-[#d0b0a0]'
            }`}>
              {boardingStatus}
            </span>
            {delayMinutes > 0 && (
              <span className="px-2 py-1 bg-[#f0e0d0] text-[#8a5a4a] rounded-full text-xs border border-[#d0b0a0]">
                +{delayMinutes} min delay
              </span>
            )}
            {runwayQueue > 0 && (
              <span className="px-2 py-1 bg-[#f5f0eb] text-[#b89978] rounded-full text-xs border border-[#e0d5c8]">
                #{runwayQueue} in queue
              </span>
            )}
          </>
        )}
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

      {/* Takeoff / arrival times */}
      {takeoffTime && (
        <div className="text-xs text-[#a09080]">
          Takeoff: {takeoffTime.toLocaleTimeString()}
          {estimatedArrival && ` | ETA: ${estimatedArrival.toLocaleTimeString()}`}
        </div>
      )}
    </div>
  );
}

// ─── Main FlightTracker Component ────────────────────────────────────────────

export default function FlightTracker() {
  const [flightCode, setFlightCode] = useState('');
  const [departureDate, setDepartureDate] = useState(new Date().toISOString().split('T')[0]);
  const [session, setSession] = useState(null);
  const [flightState, setFlightState] = useState(null);
  const [prayerTimes, setPrayerTimes] = useState(null);
  const [currentPrayer, setCurrentPrayer] = useState(null);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);
  const availableRoutes = getAvailableRoutes();

  // Start tracking
  const startTracking = useCallback(() => {
    if (!flightCode.trim()) {
      setError('Please enter a flight code.');
      return;
    }

    const newSession = createFlightSession(flightCode.trim(), new Date(departureDate));
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
  }, [flightCode, departureDate]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Simulate takeoff
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

      // Calculate prayer times based on current position
      if (state.position) {
        const times = calculateFlightPrayerTimes(
          state.position.lat,
          state.position.lng,
          state.altitude || 0,
          new Date()
        );
        setPrayerTimes(times);

        const now = new Date();
        const nowH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        setCurrentPrayer(getCurrentPrayerInfo(times, nowH));
      }

      // Auto-stop when landed
      if (state.state === 'landed') {
        stopTracking();
      }
    };

    // Run tick every 2 seconds (simulating 1 minute of flight time)
    intervalRef.current = setInterval(tick, 2000);
    tick(); // Initial tick

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, session, stopTracking]);

  // Build map bounds
  const getMapBounds = () => {
    if (!flightState) return null;
    const points = flightState.pathPoints || [];
    if (points.length === 0) return null;
    return points.map(p => [p.lat, p.lng]);
  };

  const mapBounds = getMapBounds();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-[#e0d5c8] p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-[#3d352e]">
            In-Flight Prayer Tracker
          </h1>
          <p className="text-[#8a7a6a] text-sm mt-1">
            Track prayer times during your flight with real-time position updates
          </p>
        </div>
      </div>

      {/* Input Form */}
      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 mb-4 transition-all duration-500 hover:border-[#d0c0b0]">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Flight Code</label>
              <input
                type="text"
                value={flightCode}
                onChange={(e) => setFlightCode(e.target.value.toUpperCase())}
                placeholder="e.g., QR774"
                className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] placeholder-[#a09080] focus:outline-none focus:border-[#c4a882]"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Departure Date</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882]"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Quick Select</label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    setFlightCode(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882]"
                disabled={isRunning}
                value=""
              >
                <option value="">Select a route...</option>
                {availableRoutes.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} — {r.departure} → {r.arrival} ({Math.floor(r.duration / 60)}h {r.duration % 60}m)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              {!isRunning ? (
                <button
                  onClick={startTracking}
                  className="w-full px-4 py-2 bg-[#c4a882] hover:bg-[#b89978] text-white font-bold rounded-lg transition-colors"
                >
                  Start Tracking
                </button>
              ) : (
                <>
                  {session && session.state() === 'pre-takeoff' && (
                    <button
                      onClick={handleTakeoff}
                      className="flex-1 px-4 py-2 bg-[#b89978] hover:bg-[#a08060] text-white font-bold rounded-lg transition-colors"
                    >
                      Take Off
                    </button>
                  )}
                  <button
                    onClick={stopTracking}
                    className="flex-1 px-4 py-2 bg-[#d0b0a0] hover:bg-[#c0a090] text-white font-bold rounded-lg transition-colors"
                  >
                    Stop
                  </button>
                </>
              )}
            </div>
          </div>
          {error && (
            <div className="mt-3 p-3 bg-[#f0e0d0] border border-[#d0b0a0] rounded-lg text-[#8a5a4a] text-sm">
              {error}
            </div>
          )}
        </div>

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
                      pathOptions={{
                        color: '#c4a882',
                        weight: 3,
                        opacity: 0.6,
                        dashArray: '10, 10',
                      }}
                    />
                  )}

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

                  {/* Current position (plane) */}
                  {flightState.position && flightState.state === 'in-flight' && (
                    <Marker position={[flightState.position.lat, flightState.position.lng]} icon={planeIcon}>
                      <Popup>
                        <div className="text-sm">
                          <strong>{flightState.flightCode}</strong>
                          <br />
                          Alt: {Math.round(flightState.altitude * 3.28084).toLocaleString()} ft
                          <br />
                          Speed: {Math.round(flightState.groundSpeed * 0.539957)} kn
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <FlightInfoPanel flightState={flightState} />
              {prayerTimes && <PrayerTimeline prayerTimes={prayerTimes} currentPrayer={currentPrayer} />}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!flightState && !error && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4 text-[#c4a882] font-serif">M</div>
            <h2 className="text-xl font-bold text-[#3d352e] mb-2">Ready to Track Your Flight</h2>
            <p className="text-[#8a7a6a]">
              Enter a flight code above to start tracking prayer times during your journey.
              <br />
              Try <strong>QR774</strong> (Doha → Houston) or select from the dropdown.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}