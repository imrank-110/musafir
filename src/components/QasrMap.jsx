import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  calculateQasrStatus,
  getSupportedCities,
  getUrfBoundary,
  generateUrfPolygon,
  generateHaddBoundary,
  HADD_AL_TARAKHKHUS_KM,
  reverseGeocode,
  fetchCityBoundary,
  findCityForLocation,
  saveUserCity,
  calculateDistanceToHadd,
} from '../utils/geoUtils';

// ─── Map Icons ────────────────────────────────────────────────────────────────

const userLocationIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:var(--accent,#b8860b);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.15)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const monitoringIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;background:var(--accent,#b8860b);border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(184,134,11,0.2),0 2px 8px rgba(0,0,0,0.12);animation:pulse 1.5s infinite"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const cityCenterIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:var(--text-tertiary,#a3a3a3);border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.12)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ─── Map Controller ──────────────────────────────────────────────────────────

function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || 10);
    }
  }, [map, center, zoom]);
  return null;
}

// ─── Notifications ────────────────────────────────────────────────────────────

async function playAlertSound() {
  try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      o.frequency.setValueAtTime(440, ctx.currentTime + 0.3);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.6);
    } catch {}
  }
}

async function sendNotification(title, body) {
  try {
    await LocalNotifications.schedule({
      notifications: [{ title, body, id: Date.now(), schedule: { at: new Date(Date.now() + 100) }, iconColor: '#b8860b' }],
    });
  } catch {
    if (!('Notification' in window)) return;
    try {
      if (Notification.permission === 'granted') new Notification(title, { body, icon: '/favicon.svg' });
      else if (Notification.permission !== 'denied') {
        const p = await Notification.requestPermission();
        if (p === 'granted') new Notification(title, { body, icon: '/favicon.svg' });
      }
    } catch {}
  }
}

// ─── Verdict Questionnaire ───────────────────────────────────────────────────

function VerdictQuestionnaire({ qasrStatus, onReset }) {
  const [step, setStep] = useState(1);
  const [stayDuration, setStayDuration] = useState('');
  const [hasWatan, setHasWatan] = useState(null);
  const [passingThroughWatan, setPassingThroughWatan] = useState(null);
  const [verdict, setVerdict] = useState(null);

  const handleSubmit = useCallback(() => {
    if (!qasrStatus) return;
    const isTraveler = qasrStatus.status === 'traveler';
    const stayDays = parseInt(stayDuration, 10);
    let finalStatus = isTraveler ? 'traveler' : 'resident';
    let prayers = isTraveler ? "Qasr (Shortened to 2 Rak'ahs)" : 'Tamam (Full 4 Rak\'ahs)';
    let fasting = isTraveler ? 'Invalid (Must make up via Qada)' : 'Valid';
    let details = [];
    if (isTraveler && stayDays >= 10) { finalStatus = 'resident'; prayers = 'Tamam (Full 4 Rak\'ahs)'; fasting = 'Valid'; details.push('You intend to stay 10 days or more. You are considered a Resident at your destination.'); }
    if (passingThroughWatan === 'yes') { finalStatus = 'resident'; prayers = 'Tamam (Full 4 Rak\'ahs)'; fasting = 'Valid'; details.push('You are passing through your Watan (hometown). Travel status is reset. You are a Resident here.'); }
    if (!isTraveler) details.push("You are within the city limits ('Urf boundary). You are a Resident.");
    if (isTraveler && stayDays < 10 && passingThroughWatan !== 'yes') { details.push('You are beyond Hadd al-Tarakhkhus (22 km from city limits). You are a Traveler.'); if (stayDays > 0) details.push(`You intend to stay ${stayDays} days (less than 10). Traveler status maintained.`); }
    setVerdict({ finalStatus, prayers, fasting, details });
  }, [qasrStatus, stayDuration, passingThroughWatan]);

  if (verdict) {
    return (
      <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-5 slide-up">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Your Ruling (Hukm)</h3>
        <div className={`border rounded-[var(--radius-sm)] p-4 ${verdict.finalStatus === 'traveler' ? 'border-[var(--accent)]/30 bg-[var(--accent-light)]' : 'border-[var(--border)] bg-[var(--bg-secondary)]'}`}>
          <p className={`text-base font-semibold text-center mb-3 ${verdict.finalStatus === 'traveler' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
            {verdict.finalStatus === 'traveler' ? 'Traveler (Musafir)' : 'Resident (Hadir)'}
          </p>
          <div className="space-y-2">
            <div className="flex justify-between items-center bg-white rounded-[var(--radius-sm)] px-3 py-2 border border-[var(--border)]">
              <span className="text-xs text-[var(--text-secondary)]">Prayers</span>
              <span className={`text-xs font-semibold ${verdict.prayers.includes('Qasr') ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{verdict.prayers}</span>
            </div>
            <div className="flex justify-between items-center bg-white rounded-[var(--radius-sm)] px-3 py-2 border border-[var(--border)]">
              <span className="text-xs text-[var(--text-secondary)]">Fasting</span>
              <span className={`text-xs font-semibold ${verdict.fasting.includes('Invalid') ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>{verdict.fasting}</span>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {verdict.details.map((d, i) => <p key={i} className="text-xs text-[var(--text-secondary)] flex gap-1.5"><span className="text-[var(--accent)]">—</span>{d}</p>)}
          </div>
        </div>
        <button onClick={() => { setVerdict(null); setStep(1); setStayDuration(''); setHasWatan(null); setPassingThroughWatan(null); onReset?.(); }} className="w-full h-10 mt-4 bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-sm font-semibold text-[var(--text-primary)] rounded-[var(--radius-sm)] transition-colors">Start Over</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Step {step} of 3</h3>
        <div className="flex gap-1.5">
          {[1, 2, 3].map(s => <div key={s} className={`w-2 h-2 rounded-full ${s === step ? 'bg-[var(--accent)]' : s < step ? 'bg-[var(--text-tertiary)]' : 'bg-[var(--border)]'}`} />)}
        </div>
      </div>
      {step === 1 && (
        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-3">How many days do you intend to stay at your destination?</p>
          <input type="number" min="0" max="365" value={stayDuration} onChange={e => setStayDuration(e.target.value)} placeholder="Enter number of days..." className="w-full h-11 px-3 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] mb-3" />
          <button onClick={() => setStep(2)} disabled={!stayDuration} className="w-full h-11 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--border)] disabled:text-[var(--text-tertiary)] text-white text-sm font-semibold rounded-[var(--radius-sm)] transition-colors">Next</button>
        </div>
      )}
      {step === 2 && (
        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-3">Do you have a Watan (hometown) that you are passing through?</p>
          <div className="flex gap-2 mb-3">
            <button onClick={() => { setHasWatan('yes'); setPassingThroughWatan('yes'); setStep(3); }} className={`flex-1 h-11 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors ${hasWatan === 'yes' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}>Yes</button>
            <button onClick={() => { setHasWatan('no'); setPassingThroughWatan('no'); setStep(3); }} className={`flex-1 h-11 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors ${hasWatan === 'no' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}>No</button>
          </div>
          <button onClick={() => setStep(1)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">Back</button>
        </div>
      )}
      {step === 3 && (
        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-3">Are you passing through your Watan during this trip?</p>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setPassingThroughWatan('yes')} className={`flex-1 h-11 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors ${passingThroughWatan === 'yes' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}>Yes</button>
            <button onClick={() => setPassingThroughWatan('no')} className={`flex-1 h-11 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors ${passingThroughWatan === 'no' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}>No</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="flex-1 h-11 bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-sm font-semibold text-[var(--text-primary)] rounded-[var(--radius-sm)] transition-colors">Back</button>
            <button onClick={handleSubmit} disabled={!passingThroughWatan} className="flex-1 h-11 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--border)] disabled:text-[var(--text-tertiary)] text-white text-sm font-semibold rounded-[var(--radius-sm)] transition-colors">Get Verdict</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function QasrMap() {
  const [location, setLocation] = useState(null);
  const [cityName, setCityName] = useState('');
  const [qasrStatus, setQasrStatus] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [detectedCityName, setDetectedCityName] = useState('');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [haddAlerted, setHaddAlerted] = useState(false);
  const [distanceToHadd, setDistanceToHadd] = useState(null);
  const [monitorPath, setMonitorPath] = useState([]);
  const watchIdRef = useRef(null);
  const prevStatusRef = useRef(null);
  const supportedCities = getSupportedCities();

  useEffect(() => () => { if (watchIdRef.current !== null) Geolocation.clearWatch({ id: watchIdRef.current }); }, []);

  const handlePositionUpdate = useCallback((lat, lng) => {
    setLocation({ lat, lng });
    setMonitorPath(prev => [...prev, [lat, lng]]);
    if (cityName) {
      const status = calculateQasrStatus(lat, lng, cityName);
      setQasrStatus(status);
      const dist = calculateDistanceToHadd(lat, lng, cityName);
      setDistanceToHadd(dist);
      if (status.status === 'traveler' && !haddAlerted) { setHaddAlerted(true); playAlertSound(); sendNotification('Hadd al-Tarakhkhus Crossed!', "You are now a Traveler (Musafir). Prayers: Qasr (2 Rak'ahs). Fasting: Invalid (Qada required)."); }
      if (prevStatusRef.current === 'resident' && status.status === 'traveler') setHaddAlerted(false);
      prevStatusRef.current = status.status;
    }
  }, [cityName, haddAlerted]);

  const startMonitoring = useCallback(async () => {
    if (!cityName) { setError('Please select a city or use your current location first.'); return; }
    setIsMonitoring(true); setHaddAlerted(false); setMonitorPath([]); setDistanceToHadd(null); prevStatusRef.current = null;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    try {
      watchIdRef.current = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000 }, (pos, err) => { if (err) return; if (pos) handlePositionUpdate(pos.coords.latitude, pos.coords.longitude); });
    } catch {
      if (navigator.geolocation) watchIdRef.current = navigator.geolocation.watchPosition(pos => handlePositionUpdate(pos.coords.latitude, pos.coords.longitude), () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
    }
  }, [cityName, handlePositionUpdate]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    if (watchIdRef.current !== null) { try { Geolocation.clearWatch({ id: watchIdRef.current }); } catch { navigator.geolocation.clearWatch(watchIdRef.current); } watchIdRef.current = null; }
  }, []);

  async function processLocation(latitude, longitude) {
    setLocation({ lat: latitude, lng: longitude }); setIsLoading(false);
    const matchedCity = findCityForLocation(latitude, longitude);
    if (matchedCity) { setCityName(matchedCity); setQasrStatus(calculateQasrStatus(latitude, longitude, matchedCity)); setError(''); setDetectedCityName(`Snapped to ${matchedCity}`); return; }
    try {
      const geoResult = await reverseGeocode(latitude, longitude);
      const reverseCity = geoResult.city;
      if (!reverseCity) { setError('Could not determine your city. Please select one from the dropdown.'); return; }
      const cityData = getUrfBoundary(reverseCity);
      if (cityData) { setCityName(reverseCity); setQasrStatus(calculateQasrStatus(latitude, longitude, reverseCity)); setError(''); setDetectedCityName(`Located: ${reverseCity}, ${geoResult.state || ''}`); return; }
      setDetectedCityName(`Discovering: ${reverseCity}...`);
      const boundaryData = await fetchCityBoundary(reverseCity, geoResult.state || '');
      if (boundaryData?.boundary) { saveUserCity(reverseCity, { center: boundaryData.center, boundary: boundaryData.boundary }); setCityName(reverseCity); setQasrStatus(calculateQasrStatus(latitude, longitude, reverseCity)); setError(''); setDetectedCityName(`New city discovered: ${reverseCity}`); }
      else { setCityName(''); setQasrStatus({ isInsideUrf: null, distanceFromBoundary: null, isOutsideHadd: true, status: 'unknown', message: `No boundary data for "${reverseCity}". You are likely a Traveler. Please consult a qualified Islamic authority.`, cityName: reverseCity, cityCenter: [latitude, longitude] }); setDetectedCityName(`Unknown city: ${reverseCity}`); }
    } catch (e) { setError(`Could not determine location: ${e.message}. Please select a city from the dropdown.`); }
  }

  const getCurrentLocation = useCallback(async () => {
    setIsLoading(true); setError('');
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      await processLocation(position.coords.latitude, position.coords.longitude);
    } catch {
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => processLocation(pos.coords.latitude, pos.coords.longitude), err => { setError(`Could not get location: ${err.message}`); setIsLoading(false); }, { enableHighAccuracy: true, timeout: 15000 });
      else { setError('Could not get location.'); setIsLoading(false); }
    }
  }, []);

  const handleCitySelect = useCallback((city) => {
    setCityName(city);
    const cityData = getUrfBoundary(city);
    if (cityData) { setLocation({ lat: cityData.center[0], lng: cityData.center[1] }); setQasrStatus(calculateQasrStatus(cityData.center[0], cityData.center[1], city)); setError(''); setDetectedCityName(''); }
  }, []);

  const urfPolygon = cityName ? generateUrfPolygon(cityName) : null;
  const haddBoundary = cityName ? generateHaddBoundary(cityName) : null;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Hadd Crossing Alert */}
      {haddAlerted && (
        <div className="bg-[var(--accent)] text-white px-4 py-3 rounded-[var(--radius-md)] mb-4 flex items-center justify-between animate-slide-up">
          <div>
            <p className="text-sm font-semibold">Hadd al-Tarakhkhus Crossed</p>
            <p className="text-xs text-white/80">You are now a Traveler (Musafir). Prayers: Qasr. Fasting: Qada required.</p>
          </div>
          <button onClick={() => setHaddAlerted(false)} className="text-xs font-medium px-2.5 py-1 bg-white/20 rounded-[var(--radius-sm)] hover:bg-white/30 transition-colors">Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Qasr Status Checker</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Determine your traveler status based on Ayatollah Sistani's rulings</p>
      </div>

      {/* Controls Card */}
      <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <button onClick={getCurrentLocation} disabled={isLoading || isMonitoring}
              className="w-full h-11 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--border)] disabled:text-[var(--text-tertiary)] text-white text-sm font-semibold rounded-[var(--radius-sm)] transition-colors flex items-center justify-center gap-2">
              {isLoading ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Locating...</> : 'Use Current Location'}
            </button>
            {detectedCityName && <p className="text-xs text-[var(--accent)] mt-1">{detectedCityName}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Or Select a City</label>
            <select onChange={e => { if (e.target.value) handleCitySelect(e.target.value); }} value={cityName} disabled={isMonitoring}
              className="w-full h-11 px-3 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] disabled:bg-[var(--bg-secondary)]">
              <option value="">Select a city...</option>
              {supportedCities.map(city => <option key={city} value={city}>{city}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="mt-3 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[var(--radius-sm)] text-sm text-[var(--danger)]">{error}</div>}
      </div>

      {/* Map + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden" style={{ height: '420px' }}>
            <MapContainer center={location ? [location.lat, location.lng] : [29.7604, -95.3698]} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapController center={location ? [location.lat, location.lng] : null} zoom={10} />
              {urfPolygon && <Polygon positions={urfPolygon} pathOptions={{ color: '#22c55e', weight: 2.5, fillColor: '#22c55e', fillOpacity: 0.1 }} />}
              {haddBoundary && <Polygon positions={haddBoundary} pathOptions={{ color: '#6b7280', weight: 3, fillColor: '#6b7280', fillOpacity: 0.06, dashArray: '10, 8' }} />}
              {monitorPath.length > 1 && <Polygon positions={monitorPath} pathOptions={{ color: 'var(--accent,#b8860b)', weight: 2.5, fillOpacity: 0 }} />}
              {location && <Marker position={[location.lat, location.lng]} icon={isMonitoring ? monitoringIcon : userLocationIcon}>
                <Popup><div className="text-sm"><strong>Your Location</strong><br />{location.lat.toFixed(4)}, {location.lng.toFixed(4)}<br />Status: {qasrStatus?.status === 'traveler' ? 'Traveler' : qasrStatus?.status === 'resident' ? 'Resident' : 'Unknown'}</div></Popup>
              </Marker>}
            </MapContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><div className="w-3 h-3 rounded" style={{ background: '#22c55e', opacity: 0.5 }} /><span>'Urf (Resident Zone)</span></div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><div className="w-3 h-3 rounded" style={{ background: '#6b7280', opacity: 0.4 }} /><span>Hadd (22 km)</span></div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><div className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full" /><span>Your Location</span></div>
            {isMonitoring && <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]"><div className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full animate-pulse" /><span>Monitoring</span></div>}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {qasrStatus && (
            <div className={`bg-white border rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-5 ${qasrStatus.status === 'traveler' ? 'border-[var(--accent)]/40' : qasrStatus.status === 'resident' ? 'border-[var(--border)]' : 'border-[var(--border)]'}`}>
              <p className={`text-sm font-semibold mb-1 ${qasrStatus.status === 'traveler' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                {qasrStatus.status === 'traveler' ? 'Traveler' : qasrStatus.status === 'resident' ? 'Resident' : 'Transition Zone'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mb-3">{qasrStatus.message}</p>
              <div className="text-xs text-[var(--text-tertiary)] space-y-0.5">
                {qasrStatus.cityName && <div>City: <span className="text-[var(--text-secondary)]">{qasrStatus.cityName}</span></div>}
                {qasrStatus.distanceKm != null && <div>Distance from boundary: <span className="text-[var(--text-secondary)]">{Math.abs(qasrStatus.distanceKm).toFixed(1)} km</span></div>}
                <div>Hadd al-Tarakhkhus: <span className="text-[var(--text-secondary)]">{qasrStatus.haddDistance || HADD_AL_TARAKHKHUS_KM} km</span></div>
                {distanceToHadd != null && <div>To Hadd: <span className={distanceToHadd < 0 ? 'text-[var(--text-secondary)]' : 'text-[var(--accent)]'}>{distanceToHadd < 0 ? `${Math.abs(distanceToHadd).toFixed(1)} km` : `${distanceToHadd.toFixed(1)} km past`}</span></div>}
              </div>
            </div>
          )}

          {/* Monitor */}
          <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Driving Monitor</h3>
            {!isMonitoring ? (
              <div>
                <button onClick={startMonitoring} disabled={!cityName} className="w-full h-11 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--border)] disabled:text-[var(--text-tertiary)] text-white text-sm font-semibold rounded-[var(--radius-sm)] transition-colors">Start Monitoring</button>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">{cityName ? 'Get notified when you cross the Hadd boundary.' : 'Select a city or use your location first.'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
                  <span className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full animate-pulse" /> Monitoring Active
                </div>
                {distanceToHadd != null && <div className={`text-sm font-semibold text-center py-2 rounded-[var(--radius-sm)] ${distanceToHadd < 0 ? 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]' : 'bg-[var(--accent-light)] text-[var(--accent)]'}`}>{distanceToHadd < 0 ? `${Math.abs(distanceToHadd).toFixed(1)} km until Hadd` : `${distanceToHadd.toFixed(1)} km past Hadd`}</div>}
                <button onClick={stopMonitoring} className="w-full h-11 bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-primary)] text-sm font-semibold rounded-[var(--radius-sm)] transition-colors">Stop Monitoring</button>
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-md)] p-4">
            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
              <strong className="text-[var(--text-secondary)]">Important:</strong> The 'Urf boundary is an estimation based on structural density, census data, or OpenStreetMap boundaries. Per Ayatollah Sistani: <em>"The start of the eight farsakhs must be calculated from the point beyond which a person is deemed to be a traveller."</em> This is a guide — please use your own judgment and consult a qualified authority.
            </p>
          </div>

          {/* Questionnaire */}
          {qasrStatus && !showQuestionnaire && (
            <button onClick={() => setShowQuestionnaire(true)} className="w-full h-11 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-[var(--radius-sm)] transition-colors">Get Complete Verdict</button>
          )}
          {showQuestionnaire && <VerdictQuestionnaire qasrStatus={qasrStatus} onReset={() => setShowQuestionnaire(false)} />}
        </div>
      </div>

      {/* Empty State */}
      {!qasrStatus && !error && (
        <div className="text-center py-16">
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 rounded-full bg-[var(--accent-light)] flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#b8860b)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>
          </div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1.5">Check Your Traveler Status</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
            Use your current location or select a city to see the 'Urf boundary and determine if you are a Traveler (Qasr) or Resident (Tamam).
          </p>
        </div>
      )}
    </div>
  );
}