import { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createManualSession, getAirports } from '../utils/flightApi';
import {
  hoursToTimeString,
  precomputeFlightSchedule,
  getFlightStateAtElapsed,
} from '../utils/prayerMath';
import AirportSearch from './AirportSearch';

// ─── Plain Dot Icons (No Letters) ────────────────────────────────────────────

const planeIcon = L.divIcon({
  className: 'plane-marker',
  html: `<div style="
    width: 16px; height: 16px;
    background: #c4a882;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(196,168,130,0.3), 0 2px 8px rgba(0,0,0,0.2);
    transform: rotate(-45deg);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const airportIcon = L.divIcon({
  className: 'airport-marker',
  html: `<div style="
    width: 10px; height: 10px;
    background: #b89978;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.15);
  "></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

const kaabaIcon = L.divIcon({
  className: 'kaaba-marker',
  html: `<div style="
    width: 12px; height: 12px;
    background: #c4a882;
    border: 2px solid white;
    border-radius: 2px;
    box-shadow: 0 0 12px rgba(196,168,130,0.5);
  "></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// ─── Prayer Marker Icon Factory (Just Colored Dots) ─────────────────────────

function createPrayerIcon(color) {
  return L.divIcon({
    className: 'prayer-marker',
    html: `<div style="
      width: 12px; height: 12px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
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

// ─── Prayer Schedule Panel ────────────────────────────────────────────────────

function PrayerSchedule({ flightState, prayerMarkers }) {
  if (!flightState || !prayerMarkers) return null;

  const { localTime } = flightState;
  const activePrayers = prayerMarkers.filter(m => m.status !== 'not-during-flight');

  // Find the first prayer marker that is happening "now" (at departure time, elapsed = 0)
  // Since this is a static planner, show all markers chronologically
  const firstPrayer = activePrayers[0];

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0]">
      <h3 className="text-lg font-semibold text-[#3d352e] mb-3">
        Prayer Schedule
      </h3>

      <div className="flex items-center justify-between mb-4 p-3 bg-[#f5f0eb] rounded-xl border border-[#e0d5c8]">
        <div className="text-center">
          <div className="text-xs text-[#a09080]">Local at Departure</div>
          <div className="text-lg font-bold text-[#3d352e]">{localTime}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-[#a09080]">Prayers During Flight</div>
          <div className="text-lg font-bold text-[#c4a882]">{activePrayers.length}</div>
        </div>
      </div>

      {/* Upcoming Prayer + Qibla Arrow */}
      {firstPrayer && firstPrayer.qibla && (
        <div className="mb-4 p-3 bg-[#f5f0eb] rounded-xl border border-[#e0d5c8]">
          <div className="text-xs text-[#a09080] mb-2 font-semibold uppercase tracking-wider">
            First Prayer
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-[#3d352e]">
                {firstPrayer.label}
              </div>
              <div className="text-xs text-[#a09080]">
                ~{Math.floor(firstPrayer.elapsedAtStart / 60)}h {Math.round(firstPrayer.elapsedAtStart % 60)}m into flight
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-[#c4a882]/40" />
                <div
                  className="absolute top-1/2 left-1/2 w-0.5 h-[18px] origin-bottom rounded-full"
                  style={{
                    background: '#c4a882',
                    transform: `translate(-50%, -100%) rotate(${firstPrayer.qibla.bearing}deg)`,
                  }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#c4a882]" />
                </div>
                <div className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c4a882]" />
              </div>
              <div className="text-[10px] text-[#c4a882] font-bold mt-1">
                {firstPrayer.qibla.bearingText}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative pl-6">
        <div className="absolute left-[8px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#c4a882]/60 via-[#b89978]/60 to-[#c4a882]/60 shadow-[0_0_8px_rgba(196,168,130,0.3)]" />
        {activePrayers.map((marker, idx) => {
          const isFirst = idx === 0;

          return (
            <div
              key={marker.key}
              className={`flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
                isFirst
                  ? 'bg-white/80 backdrop-blur-2xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl border-[#c4a882]/40'
                  : 'hover:bg-[#ede6dc]/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: marker.color }}
                />
                <div>
                  <span className={`font-medium ${isFirst ? 'text-[#c4a882]' : 'text-[#3d352e]'}`}>
                    {marker.label}
                  </span>
                  <div className="text-xs text-[#a09080]">
                    ~{Math.floor(marker.elapsedAtStart / 60)}h {Math.round(marker.elapsedAtStart % 60)}m into flight
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-[#a09080]">Local: {marker.localTime}</div>
                  <div className="text-xs text-[#c4a882]">{marker.qibla?.bearingText || '--'}</div>
                </div>
              </div>
            </div>
          );
        })}
        {activePrayers.length === 0 && (
          <div className="text-center py-4 text-[#a09080] text-sm">
            No prayers during this flight.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Flight Info Panel ───────────────────────────────────────────────────────

function FlightInfoPanel({ flightState }) {
  if (!flightState) return null;

  const { departure, arrival, localTime, durationMinutes } = flightState;
  const totalH = Math.floor((durationMinutes || 0) / 60);
  const totalM = (durationMinutes || 0) % 60;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0]">
      <h3 className="text-lg font-semibold text-[#3d352e] mb-3">
        {departure?.code} → {arrival?.code}
      </h3>

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

      <div className="flex flex-wrap gap-2 mb-3">
        <span className="px-2 py-1 bg-[#ede6dc] text-[#8a7a6a] rounded-full text-xs">
          {totalH}h {totalM}m flight
        </span>
        <span className="px-2 py-1 bg-[#ede6dc] text-[#8a7a6a] rounded-full text-xs">
          Local: {localTime}
        </span>
      </div>
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

  const [flightState, setFlightState] = useState(null);
  const [prayerMarkers, setPrayerMarkers] = useState([]);
  const [qibla, setQibla] = useState(null);
  const [error, setError] = useState('');

  const airports = getAirports();

  // Generate the static flight overview
  const handleShowOverview = useCallback(() => {
    if (!depCode || !arrCode) {
      setError('Please select departure and arrival airports.');
      return;
    }

    const durationMinutes = (parseInt(durationH) || 0) * 60 + (parseInt(durationM) || 0);
    const newSession = createManualSession(depCode, arrCode, depTime, durationMinutes, new Date(depDate), nextDay);

    if (newSession.error) {
      setError(newSession.error);
      return;
    }

    const depAirport = newSession.route.departure;
    const arrAirport = newSession.route.arrival;
    const pathPoints = newSession.getState().pathPoints;
    const schedule = precomputeFlightSchedule(
      pathPoints,
      depTime,
      depAirport.tz,
      durationMinutes,
      new Date(depDate),
      arrAirport.tz
    );

    setError('');
    setPrayerMarkers(schedule.prayerMarkers);
    setQibla(schedule.prayerMarkers[0]?.qibla || null);

    const initial = getFlightStateAtElapsed(
      schedule.schedule, 0, durationMinutes, pathPoints,
      depCode, arrCode, newSession.route.departure, newSession.route.arrival
    );
    setFlightState(initial);
  }, [depCode, arrCode, depTime, durationH, durationM, depDate, nextDay]);

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
            In-Flight Prayer Planner
          </h1>
          <p className="text-[#8a7a6a] text-sm mt-1">
            Enter your flight details to see prayer times during your journey
          </p>
        </div>
      </div>

      {/* Input Form */}
      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 mb-4 transition-all duration-500 hover:border-[#d0c0b0]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="sm:col-span-1 lg:col-span-1">
              <AirportSearch
                airports={airports}
                value={depCode}
                onChange={setDepCode}
                label="Departure Airport"
                placeholder="e.g. JFK, DOH, LHR..."
                disabled={!!flightState}
              />
            </div>
            <div className="sm:col-span-1 lg:col-span-1">
              <AirportSearch
                airports={airports}
                value={arrCode}
                onChange={setArrCode}
                label="Arrival Airport"
                placeholder="e.g. IAH, DXB, CDG..."
                disabled={!!flightState}
              />
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Date</label>
              <input
                type="date"
                value={depDate}
                onChange={(e) => setDepDate(e.target.value)}
                disabled={!!flightState}
                className="w-full px-3 py-2.5 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882] disabled:bg-[#f5f0eb] disabled:text-[#a09080]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Departure Time</label>
              <input
                type="time"
                value={depTime}
                onChange={(e) => setDepTime(e.target.value)}
                disabled={!!flightState}
                className="w-full px-3 py-2.5 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882] disabled:bg-[#f5f0eb] disabled:text-[#a09080]"
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
                  disabled={!!flightState}
                  placeholder="h"
                  className="w-full px-2 py-2.5 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] text-center focus:outline-none focus:border-[#c4a882] disabled:bg-[#f5f0eb] disabled:text-[#a09080]"
                />
                <span className="flex items-center text-[#a09080] text-sm">h</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={durationM}
                  onChange={(e) => setDurationM(e.target.value)}
                  disabled={!!flightState}
                  placeholder="m"
                  className="w-full px-2 py-2.5 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] text-center focus:outline-none focus:border-[#c4a882] disabled:bg-[#f5f0eb] disabled:text-[#a09080]"
                />
                <span className="flex items-center text-[#a09080] text-sm">m</span>
              </div>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm text-[#8a7a6a] mb-2">
                <input
                  type="checkbox"
                  checked={nextDay}
                  onChange={(e) => setNextDay(e.target.checked)}
                  disabled={!!flightState}
                  className="w-4 h-4 accent-[#c4a882]"
                />
                Arrive next day
              </label>
              {!flightState ? (
                <button
                  onClick={handleShowOverview}
                  className="w-full px-4 py-2.5 bg-[#c4a882] hover:bg-[#b89978] text-white font-bold rounded-lg transition-colors"
                >
                  Go
                </button>
              ) : (
                <button
                  onClick={() => { setFlightState(null); setPrayerMarkers([]); setError(''); }}
                  className="w-full px-4 py-2.5 bg-[#d0b0a0] hover:bg-[#c0a090] text-white font-bold rounded-lg transition-colors"
                >
                  Back
                </button>
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

                  {flightState.pathPoints && flightState.pathPoints.length > 0 && (
                    <Polyline
                      positions={flightState.pathPoints.map(p => [p.lat, p.lng])}
                      pathOptions={{ color: '#c4a882', weight: 3, opacity: 0.6, dashArray: '10, 10' }}
                    />
                  )}

                  {prayerMarkers.filter(m => m.status !== 'not-during-flight').map((marker) => (
                    <Marker
                      key={marker.key}
                      position={[marker.position.lat, marker.position.lng]}
                      icon={createPrayerIcon(marker.color)}
                    >
                      <Popup>
                        <div className="text-sm">
                          <strong>{marker.label}</strong>
                          <br />
                          ~{Math.floor(marker.elapsedAtStart / 60)}h {Math.round(marker.elapsedAtStart % 60)}m into flight
                          <br />
                          {marker.qibla?.bearingText || '--'}
                          <br />
                          Local: {marker.localTime}
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                  {flightState.position && qibla && (
                    <QiblaLine
                      fromLat={flightState.position.lat}
                      fromLng={flightState.position.lng}
                      bearing={qibla.bearing}
                    />
                  )}

                  <Marker position={[21.4225, 39.8262]} icon={kaabaIcon}>
                    <Popup>
                      <div className="text-sm">
                        <strong>Kaaba</strong>
                        <br />
                        <span className="text-[#a09080]">Makkah, Saudi Arabia</span>
                      </div>
                    </Popup>
                  </Marker>

                  {flightState.departure && (
                    <Marker position={[flightState.departure.lat, flightState.departure.lng]} icon={airportIcon}>
                      <Popup>
                        <div className="text-sm">
                          <strong>{flightState.departure.code}</strong> — {flightState.departure.city}
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {flightState.arrival && (
                    <Marker position={[flightState.arrival.lat, flightState.arrival.lng]} icon={airportIcon}>
                      <Popup>
                        <div className="text-sm">
                          <strong>{flightState.arrival.code}</strong> — {flightState.arrival.city}
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>

              {/* Map Legend */}
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#8a7a6a]">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-[#b89978] rounded-full border border-white shadow-sm" />
                  <span>Airport</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-[#3b82f6] rounded-full border border-white shadow-sm" />
                  <span>Fajr</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-[#f97316] rounded-full border border-white shadow-sm" />
                  <span>Sunrise</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-[#f59e0b] rounded-full border border-white shadow-sm" />
                  <span>Dhuhr/Asr</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-[#ef4444] rounded-full border border-white shadow-sm" />
                  <span>Maghrib/Isha</span>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <FlightInfoPanel flightState={flightState} />
              <PrayerSchedule
                flightState={flightState}
                prayerMarkers={prayerMarkers}
              />
            </div>
          </div>
        )}

        {!flightState && !error && (
          <div className="text-center py-16">
            <div className="flex justify-center mb-4">
              <svg width="48" height="48" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="20" fill="#c4a882" opacity="0.3"/>
                <circle cx="25" cy="15" r="13" fill="#f5f0eb" opacity="0.85"/>
                <path d="M20 9 L21.25 13.5 L26 13.5 L22.25 16.5 L23.5 21 L20 18.5 L16.5 21 L17.75 16.5 L14 13.5 L18.75 13.5 Z" fill="#c4a882" opacity="0.6"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#3d352e] mb-2">Plan Your Flight</h2>
            <p className="text-[#8a7a6a] text-sm px-4">
              Type an airport code or city name, set your time and duration,
              <br className="hidden sm:block" />
              then see prayer times for your journey.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}