import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  calculateStatusWithHadd,
  getSupportedCities,
  getUrfBoundary,
  getBoundarySource,
  getHaddRange,
  generateUrfPolygon,
  generateHaddBoundary,
  generateOneWayBoundary,
  generateHaddZonePolygon,
  HADD_AL_TARAKHKHUS_KM,
  ONE_WAY_HADD_KM,
  reverseGeocode,
  fetchUrfBoundary,
  fetchCityBoundary,
  findCityForLocation,
  saveUserCity,
  calculateDistanceToHadd,
  loadBoundaries,
  loadLegalBoundaries,
  getLegalBoundary,
} from '../utils/geoUtils';

// ΓöÇΓöÇΓöÇ Map Icons ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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

// ΓöÇΓöÇΓöÇ Map Controller ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || 10);
    }
  }, [map, center, zoom]);
  return null;
}

// ΓöÇΓöÇΓöÇ Notifications ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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

// ΓöÇΓöÇΓöÇ Verdict Questionnaire ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
            {verdict.details.map((d, i) => <p key={i} className="text-xs text-[var(--text-secondary)] flex gap-1.5"><span className="text-[var(--accent)]">ΓÇö</span>{d}</p>)}
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

// ΓöÇΓöÇΓöÇ Main Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
  const [boundariesLoaded, setBoundariesLoaded] = useState(false);
  const [legalBoundariesReady, setLegalBoundariesReady] = useState(false);
  const [boundaryType, setBoundaryType] = useState('round-trip'); // 'round-trip' | 'one-way'
  const [showHaddZone, setShowHaddZone] = useState(true);
  const [showLegalLimits, setShowLegalLimits] = useState(true);
  const [showLegalExplainer, setShowLegalExplainer] = useState(false);
  const [showHaddExplainer, setShowHaddExplainer] = useState(false);
  const [showBoundaryExplainer, setShowBoundaryExplainer] = useState(false);
  const [userHaddKm, setUserHaddKm] = useState(6);
  const watchIdRef = useRef(null);
  const prevStatusRef = useRef(null);
  const supportedCities = getSupportedCities();

  useEffect(() => () => { if (watchIdRef.current !== null) Geolocation.clearWatch({ id: watchIdRef.current }); }, []);

  // Load the bundled built-up ('urf) boundary outlines once on mount. The data
  // is compiled into the bundle, so this resolves immediately and simply removes
  // any stale cached admin boundaries for the supported cities.
  useEffect(() => {
    let cancelled = false;
    loadBoundaries().then(() => {
      if (!cancelled) setBoundariesLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch the legal (on-paper) city-limit overlays lazily, only once a city is
  // chosen. The file is not bundled (4 MB); the browser HTTP cache serves
  // repeat loads.
  useEffect(() => {
    if (cityName && !legalBoundariesReady) {
      loadLegalBoundaries().then(() => setLegalBoundariesReady(true));
    }
  }, [cityName, legalBoundariesReady]);

  // Recalc status whenever the Hadd changes. The 8-farsakh journey is the
  // standard assumption (removed the per-user Intended Journey selector).
  useEffect(() => {
    if (cityName && location) {
      setQasrStatus(calculateStatusWithHadd(location.lat, location.lng, cityName, userHaddKm, 8));
    }
  }, [userHaddKm, cityName, location]);

  const handleHaddChange = useCallback((newKm) => {
    setUserHaddKm(newKm);
  }, []);

  const handlePositionUpdate = useCallback((lat, lng) => {
    setLocation({ lat, lng });
    setMonitorPath(prev => [...prev, [lat, lng]]);
    if (cityName) {
      const status = calculateStatusWithHadd(lat, lng, cityName, userHaddKm, 8);
      setQasrStatus(status);
      const dist = calculateDistanceToHadd(lat, lng, cityName);
      setDistanceToHadd(dist);
      if (status.status === 'traveler' && !haddAlerted) { setHaddAlerted(true); playAlertSound(); sendNotification('Hadd al-Tarakhkhus Crossed!', "You are now a Traveler (Musafir). Prayers: Qasr (2 Rak'ahs). Fasting: Invalid (Qada required)."); }
      if (prevStatusRef.current === 'resident' && status.status === 'traveler') setHaddAlerted(false);
      prevStatusRef.current = status.status;
    }
  }, [cityName, userHaddKm, haddAlerted]);

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

  // Apply the city-recommended Hadd al-Tarakhkhus and compute the full ruling.
  const applyLocationStatus = useCallback((latitude, longitude, city) => {
    const range = getHaddRange(city);
    handleHaddChange(range.recommended);
    return calculateStatusWithHadd(latitude, longitude, city, range.recommended, 8);
  }, [handleHaddChange]);

  async function processLocation(latitude, longitude) {
    setLocation({ lat: latitude, lng: longitude }); setIsLoading(false);
    const matchedCity = findCityForLocation(latitude, longitude);
    if (matchedCity) { setCityName(matchedCity); setQasrStatus(applyLocationStatus(latitude, longitude, matchedCity)); setError(''); setDetectedCityName(`Snapped to ${matchedCity}`); return; }
    try {
      const geoResult = await reverseGeocode(latitude, longitude);
      const reverseCity = geoResult.city;
      if (!reverseCity) { setError('Could not determine your city. Please select one from the dropdown.'); return; }
      const cityData = getUrfBoundary(reverseCity);
      if (cityData) { setCityName(reverseCity); setQasrStatus(applyLocationStatus(latitude, longitude, reverseCity)); setError(''); setDetectedCityName(`Located: ${reverseCity}, ${geoResult.state || ''}`); return; }
      setDetectedCityName(`Discovering: ${reverseCity}...`);
      // Prefer a real built-up outline; fall back to the administrative boundary.
      let boundaryData = null;
      try { boundaryData = await fetchUrfBoundary(reverseCity, geoResult.state || ''); } catch {}
      if (!boundaryData?.boundary) { boundaryData = await fetchCityBoundary(reverseCity, geoResult.state || ''); }
      if (boundaryData?.boundary) { saveUserCity(reverseCity, { center: boundaryData.center, boundary: boundaryData.boundary }); setCityName(reverseCity); setQasrStatus(applyLocationStatus(latitude, longitude, reverseCity)); setError(''); setDetectedCityName(`New city discovered: ${reverseCity}`); }
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
    if (cityData) {
      setLocation({ lat: cityData.center[0], lng: cityData.center[1] });
      const range = getHaddRange(city);
      handleHaddChange(range.recommended);
      setQasrStatus(calculateStatusWithHadd(cityData.center[0], cityData.center[1], city, range.recommended, 8));
      setError(''); setDetectedCityName('');
    }
  }, [handleHaddChange]);

  const urfPolygon = cityName ? generateUrfPolygon(cityName) : null;
  // The 8-farsakh ring: 22 km round-trip / 44 km one-way, a true outward buffer
  // from the 'urf boundary (never self-intersecting, even on jagged city lines).
  const haddBoundary = useMemo(() =>
    (cityName ? (boundaryType === 'one-way' ? generateOneWayBoundary(cityName) : generateHaddBoundary(cityName)) : null),
    [cityName, boundaryType]);
  // The Hadd al-Tarakhkhus (visibility/audibility) zone: user-adjustable km.
  const haddZonePolygon = useMemo(() =>
    (cityName && showHaddZone ? generateHaddZonePolygon(cityName, userHaddKm) : null),
    [cityName, showHaddZone, userHaddKm]);
  const boundaryInfo = cityName ? getBoundarySource(cityName) : null;
  const legalBoundaryRings = (cityName && legalBoundariesReady && showLegalLimits) ? getLegalBoundary(cityName) : null;

  // ΓöÇΓöÇΓöÇ Render ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
        <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Journey Type</span>
            <div className="flex gap-1">
              <button onClick={() => setBoundaryType('round-trip')}
                className={`text-xs font-medium px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors ${boundaryType === 'round-trip' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'}`}>Round-trip</button>
              <button onClick={() => setBoundaryType('one-way')}
                className={`text-xs font-medium px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors ${boundaryType === 'one-way' ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'}`}>One-way</button>
            </div>
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
              {urfPolygon && <Polygon positions={urfPolygon} pathOptions={{ color: '#22c55e', weight: 2.5, fillColor: '#22c55e', fillOpacity: 0.05 }} />}
              {legalBoundaryRings && legalBoundaryRings.rings.map((ring, i) => (
                <Polygon key={i} positions={ring} interactive={false} pathOptions={{ color: '#3b82f6', weight: 2, dashArray: '8, 6', fillColor: '#3b82f6', fillOpacity: 0 }} />
              ))}
              {haddZonePolygon && <Polygon positions={haddZonePolygon} pathOptions={{ color: '#8b5cf6', weight: 2, fillColor: '#8b5cf6', fillOpacity: 0 }} />}
              {haddBoundary && <Polygon positions={haddBoundary} pathOptions={{ color: boundaryType === 'one-way' ? '#f97316' : '#6b7280', weight: 3, fillColor: boundaryType === 'one-way' ? '#f97316' : '#6b7280', fillOpacity: 0, dashArray: '10, 8' }} />}
              {monitorPath.length > 1 && <Polygon positions={monitorPath} pathOptions={{ color: 'var(--accent,#b8860b)', weight: 2.5, fillOpacity: 0 }} />}
              {location && <Marker position={[location.lat, location.lng]} icon={isMonitoring ? monitoringIcon : userLocationIcon}>
                <Popup><div className="text-sm"><strong>Your Location</strong><br />{location.lat.toFixed(4)}, {location.lng.toFixed(4)}<br />Status: {qasrStatus?.status === 'traveler' ? 'Traveler' : qasrStatus?.status === 'resident' ? 'Resident' : 'Unknown'}</div></Popup>
              </Marker>}
            </MapContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <div className="w-3 h-3 rounded" style={{ background: '#22c55e', opacity: 0.5 }} />
              <span>City Boundary</span>
              <button onClick={() => setShowBoundaryExplainer(!showBoundaryExplainer)}
                className="w-5 h-5 rounded-full bg-transparent hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center justify-center text-[11px] font-semibold leading-none" title="How was the city boundary generated?">ℹ</button>
            </div>
            {showHaddZone && (
              <span className="flex items-center gap-1">
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                  <div className="w-3 h-3 rounded" style={{ background: '#8b5cf6', opacity: 0.4 }} />
                  <span>Hadd al-Tarakhkhus ({userHaddKm} km)</span>
                </div>
                <button onClick={() => setShowHaddExplainer(!showHaddExplainer)}
                  className="w-5 h-5 rounded-full bg-transparent hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center justify-center text-[11px] font-semibold leading-none" title="Why this recommendation?">ℹ</button>
              </span>
            )}
            <span className="flex items-center gap-1">
              <button onClick={() => setShowLegalLimits(!showLegalLimits)}
                title={showLegalLimits ? 'Hide legal city limits' : 'Show legal city limits'}
                className={`flex items-center gap-1.5 text-xs rounded-full px-1.5 py-0.5 transition-colors ${showLegalLimits ? 'text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]' : 'text-[var(--text-tertiary)] opacity-50 line-through hover:opacity-75'}`}>
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: 'transparent', border: '1.5px dashed #3b82f6' }} />
                <span>Legal city limits</span>
              </button>
              <button onClick={() => setShowLegalExplainer(!showLegalExplainer)}
                className="w-5 h-5 rounded-full bg-transparent hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center justify-center text-[11px] font-semibold leading-none" title="What are the legal city limits?">ℹ</button>
            </span>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><div className="w-3 h-3 rounded" style={{ background: boundaryType === 'one-way' ? '#f97316' : '#6b7280', opacity: boundaryType === 'one-way' ? 0.5 : 0.4 }} /><span>{boundaryType === 'one-way' ? 'Hadd (44 km)' : 'Hadd (22 km)'}</span></div>
            {boundaryInfo && boundaryInfo.kind !== 'none' && (
              <div className={`px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-medium border ${boundaryInfo.kind === 'osm' ? 'bg-[var(--accent-light)] text-[var(--accent)] border-transparent' : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border-[var(--border)]'}`} title={`Boundary data source: ${boundaryInfo.kind}`}>
                {boundaryInfo.kind === 'osm' ? 'Built-up · Census 2020' : boundaryInfo.kind === 'generated' ? 'Generated' : 'Approximate'}
                {boundaryInfo.areaKm2 ? ` · ${Math.round(boundaryInfo.areaKm2).toLocaleString()} km²` : ''}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><div className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full" /><span>Your Location</span></div>
            {isMonitoring && <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]"><div className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full animate-pulse" /><span>Monitoring</span></div>}
          </div>
          {showBoundaryExplainer && (
            <div className="mt-2 text-[11px] text-[var(--text-tertiary)] leading-relaxed space-y-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3">
              <p>
                <strong className="text-[var(--text-secondary)]">The green line is the 'Urf boundary</strong> — the city's continuous built-up area (its neighborhoods and outskirts), not its legal or administrative limit. Traveller distances are measured from here because, per Ayatollah Sistani, <em>"the start of the eight farsakhs must be calculated from the point beyond which a person is deemed to be a traveller."</em>
              </p>
              <p>
                <strong className="text-[var(--text-secondary)]">How it's generated:</strong> for the bundled cities, official Census 2020 urban-area polygons and OpenStreetMap built-up landuse are merged into a single outline at build time. For cities we haven't pre-mapped, the app queries OpenStreetMap on the spot and traces the built-up area; the administrative boundary is only a last resort.
              </p>
              <p>
                <strong className="text-[var(--text-secondary)]">The blue dashed line</strong> is the city's legal (administrative) border — the boundary on paper. The green 'Urf line extends beyond it wherever continuous housing has sprawled past the legal line; in a few annexation-heavy cities the legal charter area is instead larger than the built-up footprint. The fiqhi traveller distance is measured from the green line.
              </p>
            </div>
          )}
          {showLegalExplainer && (
            <div className="mt-2 text-[11px] text-[var(--text-tertiary)] leading-relaxed space-y-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3">
              <p>
                <strong className="text-[var(--text-secondary)]">The blue dashed line is the legal city limit</strong> — the city's administrative border on paper, set by its charter or the census. It is usually smaller than the built-up City Boundary because urban sprawl grows beyond it.
              </p>
              <p>
                It is shown purely for comparison — the traveller's measurements (the 8 farsakhs and the Hadd al-Tarakhkhus) start from the <strong className="text-[var(--text-secondary)]">green City Boundary</strong>, not from this legal line.
              </p>
            </div>
          )}

          {showHaddExplainer && (
            <div className="mt-2 text-[11px] text-[var(--text-tertiary)] leading-relaxed space-y-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3">
              <p>
                Per <strong>Ruling 1304</strong>, the Hadd al-Tarakhkhus is the point where the people of the town — including those living on its outskirts — can no longer see you. For today's connected cities this point lies a few miles past the City Boundary — applied here within the <strong>3–8 km (2–5 mi)</strong> band, anchored at <strong>5 km (3 mi)</strong> → <strong className="text-[#8b5cf6]">Hadd ≈ {userHaddKm} km</strong>.
              </p>
              <p>
                <strong className="text-[var(--text-secondary)]">Disclaimer:</strong> this is an estimate, not a binding ruling. Layout and your own observation may differ per city — you are free to adopt the Hadd you judge correct.
              </p>
            </div>
          )}
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
                {qasrStatus.detail === 'inside-urf' && <div className="text-[var(--text-secondary)]">Inside the 'Urf boundary ⟶ Resident (Tamam)</div>}
                {qasrStatus.detail === 'before-hadd' && <div className="text-[var(--text-secondary)]">Left the 'Urf but still within the Hadd al-Tarakhkhus ⟶ Resident</div>}
                {qasrStatus.detail === 'past-hadd-but-short-journey' && <div className="text-[var(--text-secondary)]">Past the Hadd but the journey is under 8 farsakhs ⟶ Resident</div>}
                {qasrStatus.detail === 'traveler' && <div className="text-[var(--accent)]">Past the Hadd + journey is 8+ farsakhs ⟶ Traveler (Qasr)</div>}
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
              <strong className="text-[var(--text-secondary)]">Important:</strong> The 'Urf boundary starts from the city's legal limits and expands with the continuous built-up area (urban sprawl). Per Ayatollah Sistani: <em>"The start of the eight farsakhs must be calculated from the point beyond which a person is deemed to be a traveller."</em> The Hadd al-Tarakhkhus (visibility/audibility) zone is subjective and shown as the purple ring; the 22/44 km ring is the 8-farsakh journey measure from the 'Urf outskirts. The green City Boundary is the starting point of the 8 farsakhs — not the blue legal city limits. ΓÇö This is a guide — please use your own judgment and consult a qualified authority.
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
