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

// ─── Map Icons ────────────────────────────────────────────────────────────────

const planeIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:var(--accent,#b8860b);border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.15)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const airportIcon = L.divIcon({
  className: '',
  html: '<div style="width:10px;height:10px;background:var(--text-tertiary,#a3a3a3);border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.12)"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

const kaabaIcon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;background:var(--accent,#b8860b);border:2px solid #fff;border-radius:2px;box-shadow:0 0 10px rgba(184,134,11,0.4)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function createPrayerIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:11px;height:11px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.15)"></div>`,
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5],
  });
}

// ─── Fit Bounds ────────────────────────────────────────────────────────────────

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, bounds]);
  return null;
}

// ─── Qibla Line ────────────────────────────────────────────────────────────────

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
      pathOptions={{ color: 'var(--accent,#b8860b)', weight: 2, opacity: 0.5, dashArray: '6, 5' }}
    />
  );
}

// ─── Flight Info Panel ─────────────────────────────────────────────────────────

function FlightInfoPanel({ flightState }) {
  if (!flightState) return null;
  const { departure, arrival, localTime, durationMinutes } = flightState;
  const totalH = Math.floor((durationMinutes || 0) / 60);
  const totalM = (durationMinutes || 0) % 60;

  return (
    <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{departure?.code}</span>
            <span className="text-xs text-[var(--text-tertiary)]">{departure?.city}</span>
          </div>
          <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{arrival?.code}</span>
            <span className="text-xs text-[var(--text-tertiary)]">{arrival?.city}</span>
          </div>
        </div>
        <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-2.5 py-1 rounded-[var(--radius-sm)] font-medium">
          {totalH}h {totalM}m
        </div>
      </div>
      {localTime && (
        <div className="text-xs text-[var(--text-tertiary)]">
          Local time at departure: <span className="font-medium text-[var(--text-secondary)]">{localTime}</span>
        </div>
      )}
    </div>
  );
}

// ─── Prayer Schedule Panel ─────────────────────────────────────────────────────

const PRAYER_COLORS = {
  Fajr: '#3b82f6',
  Sunrise: '#f97316',
  Dhuhr: '#f59e0b',
  Asr: '#f59e0b',
  Maghrib: '#ef4444',
  Isha: '#ef4444',
};

function PrayerSchedule({ flightState, prayerMarkers }) {
  if (!flightState || !prayerMarkers) return null;
  const activePrayers = prayerMarkers.filter(m => m.status !== 'not-during-flight');
  const firstPrayer = activePrayers[0];

  return (
    <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Prayer Schedule</h3>
        <span className="text-xs font-medium text-[var(--accent)] bg-[var(--accent-light)] px-2.5 py-1 rounded-[var(--radius-sm)]">
          {activePrayers.length} during flight
        </span>
      </div>

      {firstPrayer && firstPrayer.qibla && (
        <div className="flex items-center justify-between bg-[var(--bg-secondary)] rounded-[var(--radius-sm)] px-3.5 py-2.5 mb-4">
          <div>
            <div className="text-xs font-medium text-[var(--text-primary)]">{firstPrayer.label}</div>
            <div className="text-[11px] text-[var(--text-tertiary)]">
              ~{Math.floor(firstPrayer.elapsedAtStart / 60)}h {Math.round(firstPrayer.elapsedAtStart % 60)}m into flight
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border border-[var(--border)]" />
              <div className="absolute top-1/2 left-1/2 w-0.5 h-3.5 bg-[var(--accent)] origin-bottom rounded-full"
                style={{ transform: `translate(-50%, -100%) rotate(${firstPrayer.qibla.bearing}deg)` }}>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-[var(--accent)]" />
              </div>
            </div>
            <div className="text-[10px] text-[var(--accent)] font-medium mt-0.5">{firstPrayer.qibla.bearingText}</div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {activePrayers.map((marker, idx) => {
          const color = PRAYER_COLORS[marker.label] || '#a3a3a3';
          return (
            <div key={marker.key} className="flex items-center justify-between px-3.5 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-secondary)] transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{marker.label}</span>
                  <div className="text-[11px] text-[var(--text-tertiary)]">
                    ~{Math.floor(marker.elapsedAtStart / 60)}h {Math.round(marker.elapsedAtStart % 60)}m
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[var(--text-secondary)]">{marker.localTime}</div>
                <div className="text-[11px] text-[var(--accent)]">{marker.qibla?.bearingText || '--'}</div>
              </div>
            </div>
          );
        })}
        {activePrayers.length === 0 && (
          <div className="text-center py-6 text-sm text-[var(--text-tertiary)]">No prayers during this flight.</div>
        )}
      </div>
    </div>
  );
}

// ─── Map Legend ────────────────────────────────────────────────────────────────

function MapLegend() {
  const items = [
    { color: '#a3a3a3', label: 'Airport' },
    { color: '#3b82f6', label: 'Fajr' },
    { color: '#f97316', label: 'Sunrise' },
    { color: '#f59e0b', label: 'Dhuhr/Asr' },
    { color: '#ef4444', label: 'Maghrib/Isha' },
  ];
  return (
    <div className="flex flex-wrap gap-3 mt-2">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

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

  const handleShowOverview = useCallback(() => {
    if (!depCode || !arrCode) {
      setError('Please select departure and arrival airports.');
      return;
    }
    const durationMinutes = (parseInt(durationH) || 0) * 60 + (parseInt(durationM) || 0);
    const newSession = createManualSession(depCode, arrCode, depTime, durationMinutes, new Date(depDate), nextDay);
    if (newSession.error) { setError(newSession.error); return; }
    const depAirport = newSession.route.departure;
    const arrAirport = newSession.route.arrival;
    const pathPoints = newSession.getState().pathPoints;
    const schedule = precomputeFlightSchedule(pathPoints, depTime, depAirport.tz, durationMinutes, new Date(depDate), arrAirport.tz);
    setError('');
    setPrayerMarkers(schedule.prayerMarkers);
    setQibla(schedule.prayerMarkers[0]?.qibla || null);
    const initial = getFlightStateAtElapsed(schedule.schedule, 0, durationMinutes, pathPoints, depCode, arrCode, newSession.route.departure, newSession.route.arrival);
    setFlightState(initial);
  }, [depCode, arrCode, depTime, durationH, durationM, depDate, nextDay]);

  const getMapBounds = () => {
    if (!flightState) return null;
    const points = flightState.pathPoints || [];
    if (points.length === 0) return null;
    return points.map(p => [p.lat, p.lng]);
  };
  const mapBounds = getMapBounds();

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">In-Flight Prayer Planner</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Enter your flight details to see prayer times during your journey</p>
      </div>

      {/* Form Card */}
      <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
          <div className="sm:col-span-1 lg:col-span-1">
            <AirportSearch airports={airports} value={depCode} onChange={setDepCode} label="Departure" placeholder="e.g. JFK, DOH..." disabled={!!flightState} />
          </div>
          <div className="sm:col-span-1 lg:col-span-1">
            <AirportSearch airports={airports} value={arrCode} onChange={setArrCode} label="Arrival" placeholder="e.g. IAH, DXB..." disabled={!!flightState} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Date</label>
            <input type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)} disabled={!!flightState}
              className="w-full h-11 px-3 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] disabled:bg-[var(--bg-secondary)] disabled:text-[var(--text-tertiary)]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Departure Time</label>
            <input type="time" value={depTime} onChange={(e) => setDepTime(e.target.value)} disabled={!!flightState}
              className="w-full h-11 px-3 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] disabled:bg-[var(--bg-secondary)] disabled:text-[var(--text-tertiary)]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Duration</label>
            <div className="flex gap-1.5 items-center">
              <input type="number" min="0" max="24" value={durationH} onChange={(e) => setDurationH(e.target.value)} disabled={!!flightState} placeholder="h"
                className="w-full h-11 px-2 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] disabled:bg-[var(--bg-secondary)] disabled:text-[var(--text-tertiary)]" />
              <span className="text-xs text-[var(--text-tertiary)] font-medium">h</span>
              <input type="number" min="0" max="59" value={durationM} onChange={(e) => setDurationM(e.target.value)} disabled={!!flightState} placeholder="m"
                className="w-full h-11 px-2 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] disabled:bg-[var(--bg-secondary)] disabled:text-[var(--text-tertiary)]" />
              <span className="text-xs text-[var(--text-tertiary)] font-medium">m</span>
            </div>
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] mb-2.5">
              <input type="checkbox" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} disabled={!!flightState}
                className="w-4 h-4 rounded-[3px] border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent-light)]" />
              Arrive next day
            </label>
            {!flightState ? (
              <button onClick={handleShowOverview}
                className="w-full h-11 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-[var(--radius-sm)] transition-colors">
                Plan Flight
              </button>
            ) : (
              <button onClick={() => { setFlightState(null); setPrayerMarkers([]); setError(''); }}
                className="w-full h-11 bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] text-sm font-semibold rounded-[var(--radius-sm)] transition-colors">
                Back
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="mt-3 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[var(--radius-sm)] text-sm text-[var(--danger)]">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {flightState && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden" style={{ height: '420px' }}>
              <MapContainer center={[flightState.position?.lat || 0, flightState.position?.lng || 0]} zoom={4} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <FitBounds bounds={mapBounds} />
                {flightState.pathPoints && flightState.pathPoints.length > 0 && (
                  <Polyline positions={flightState.pathPoints.map(p => [p.lat, p.lng])} pathOptions={{ color: 'var(--accent,#b8860b)', weight: 2.5, opacity: 0.4, dashArray: '8, 8' }} />
                )}
                {prayerMarkers.filter(m => m.status !== 'not-during-flight').map((marker) => (
                  <Marker key={marker.key} position={[marker.position.lat, marker.position.lng]} icon={createPrayerIcon(PRAYER_COLORS[marker.label] || '#a3a3a3')}>
                    <Popup>
                      <div className="text-sm"><strong>{marker.label}</strong><br />~{Math.floor(marker.elapsedAtStart / 60)}h {Math.round(marker.elapsedAtStart % 60)}m<br />{marker.qibla?.bearingText || '--'}<br />Local: {marker.localTime}</div>
                    </Popup>
                  </Marker>
                ))}
                {flightState.position && qibla && <QiblaLine fromLat={flightState.position.lat} fromLng={flightState.position.lng} bearing={qibla.bearing} />}
                <Marker position={[21.4225, 39.8262]} icon={kaabaIcon}>
                  <Popup><div className="text-sm"><strong>Kaaba</strong><br /><span className="text-[var(--text-tertiary)]">Makkah, Saudi Arabia</span></div></Popup>
                </Marker>
                {flightState.departure && <Marker position={[flightState.departure.lat, flightState.departure.lng]} icon={airportIcon}>
                  <Popup><div className="text-sm"><strong>{flightState.departure.code}</strong> — {flightState.departure.city}</div></Popup>
                </Marker>}
                {flightState.arrival && <Marker position={[flightState.arrival.lat, flightState.arrival.lng]} icon={airportIcon}>
                  <Popup><div className="text-sm"><strong>{flightState.arrival.code}</strong> — {flightState.arrival.city}</div></Popup>
                </Marker>}
              </MapContainer>
            </div>
            <MapLegend />
          </div>
          <div className="space-y-3">
            <FlightInfoPanel flightState={flightState} />
            <PrayerSchedule flightState={flightState} prayerMarkers={prayerMarkers} />
          </div>
        </div>
      )}

      {/* Empty State */}
      {!flightState && !error && (
        <div className="text-center py-16">
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 rounded-full bg-[var(--accent-light)] flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#b8860b)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </div>
          </div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1.5">Plan Your Flight</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
            Type an airport code or city name, set your time and duration, then see prayer times for your journey.
          </p>
        </div>
      )}
    </div>
  );
}