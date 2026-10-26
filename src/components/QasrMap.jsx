import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  calculateQasrStatus,
  calculateQasrStatusFromOrigin,
  calculateStatusWithHadd,
  getSupportedCities,
  getUrfBoundary,
  getApproximateBoundary,
  getBoundarySource,
  getHaddRange,
  generateUrfPolygon,
  generateHaddBoundary,
  generateOneWayBoundary,
  generateHaddZonePolygon,
  generateBoundaryAtDistance,
  fetchUrfBoundary,
  loadBoundaries,
  HADD_AL_TARAKHKHUS_KM,
  ONE_WAY_HADD_KM,
  reverseGeocode,
  fetchCityBoundary,
  findCityForLocation,
  saveUserCity,
  haversineDistance,
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
  const [originCity, setOriginCity] = useState(''); // Journey origin city
  const [useOrigin, setUseOrigin] = useState(false); // Whether to use origin-based calculation
  const [boundaryType, setBoundaryType] = useState('round-trip'); // 'round-trip' | 'one-way'
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [haddAlerted, setHaddAlerted] = useState(false);
  const [distanceToHadd, setDistanceToHadd] = useState(null);
  const [monitorPath, setMonitorPath] = useState([]);
  const [showHaddZone, setShowHaddZone] = useState(true);
  const [showHaddExplainer, setShowHaddExplainer] = useState(false);
  const [showCityBoundaryInfo, setShowCityBoundaryInfo] = useState(false);
  const [showLegacyBoundary, setShowLegacyBoundary] = useState(false);
  const [userHaddKm, setUserHaddKm] = useState(5);
  const [journeyFarsakhs, setJourneyFarsakhs] = useState(8);
  const [boundariesLoaded, setBoundariesLoaded] = useState(false);
  const watchIdRef = useRef(null);
  const prevStatusRef = useRef(null);
  const supportedCities = getSupportedCities();

  useEffect(() => () => { if (watchIdRef.current !== null) Geolocation.clearWatch({ id: watchIdRef.current }); }, []);

  // Load the bundled built-up ('urf) boundary outlines once on mount.
  // Also purges stale cached admin boundaries for the official cities.
  useEffect(() => {
    let cancelled = false;
    loadBoundaries().then(() => {
      if (!cancelled) setBoundariesLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Load saved Hadd from localStorage
  useEffect(() => {
    try { const saved = localStorage.getItem('musafir_user_hadd'); if (saved) setUserHaddKm(parseFloat(saved)); } catch {}
  }, []);

  // Recalc status when Hadd or journey changes
  useEffect(() => {
    if (cityName && location) {
      const s = calculateStatusWithHadd(location.lat, location.lng, cityName, userHaddKm, journeyFarsakhs);
      setQasrStatus(s);
    }
  }, [userHaddKm, journeyFarsakhs, cityName, location]);

  const handleHaddChange = useCallback((newKm) => {
    setUserHaddKm(newKm);
    try { localStorage.setItem('musafir_user_hadd', newKm.toString()); } catch {}
  }, []);

  const handlePositionUpdate = useCallback((lat, lng) => {
    setLocation({ lat, lng });
    setMonitorPath(prev => [...prev, [lat, lng]]);
    if (cityName) {
      const status = calculateStatusWithHadd(lat, lng, cityName, userHaddKm, journeyFarsakhs);
      setQasrStatus(status);
      if (status.status === 'traveler' && !haddAlerted) { setHaddAlerted(true); playAlertSound(); sendNotification('Hadd al-Tarakhkhus Crossed!', "You are now a Traveler (Musafir)."); }
      if (prevStatusRef.current === 'resident' && status.status === 'traveler') setHaddAlerted(false);
      prevStatusRef.current = status.status;
    }
  }, [cityName, userHaddKm, journeyFarsakhs, haddAlerted]);

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
    const recalc = (city) => {
      const r = getHaddRange(city);
      handleHaddChange(r.recommended);
      return calculateStatusWithHadd(latitude, longitude, city, r.recommended, journeyFarsakhs);
    };
    const matchedCity = findCityForLocation(latitude, longitude);
    if (matchedCity) { setCityName(matchedCity); setQasrStatus(recalc(matchedCity)); setError(''); setDetectedCityName(`Snapped to ${matchedCity}`); return; }
    try {
      const geoResult = await reverseGeocode(latitude, longitude);
      const reverseCity = geoResult.city;
      if (!reverseCity) { setError('Could not determine your city. Please select one from the dropdown.'); return; }
      const cityData = getUrfBoundary(reverseCity);
      if (cityData) { setCityName(reverseCity); setQasrStatus(recalc(reverseCity)); setError(''); setDetectedCityName(`Located: ${reverseCity}, ${geoResult.state || ''}`); return; }
      setDetectedCityName(`Discovering: ${reverseCity}...`);
      // Try Overpass API first for a true 'Urf boundary (built-up area)
      const urfData = await fetchUrfBoundary(reverseCity, geoResult.state || '');
      if (urfData?.boundary) {
        saveUserCity(reverseCity, { center: urfData.center, boundary: urfData.boundary });
        setCityName(reverseCity);
        setQasrStatus(recalc(reverseCity));
        setError('');
        setDetectedCityName(`'Urf boundary generated: ${reverseCity}`);
      } else {
        // Fallback: administrative boundary from Nominatim
        const boundaryData = await fetchCityBoundary(reverseCity, geoResult.state || '');
        if (boundaryData?.boundary) {
          saveUserCity(reverseCity, { center: boundaryData.center, boundary: boundaryData.boundary });
          setCityName(reverseCity);
          setQasrStatus(recalc(reverseCity));
          setError('');
          setDetectedCityName(`New city discovered: ${reverseCity}`);
        } else {
          setCityName('');
          setQasrStatus({ isInsideUrf: null, distanceFromBoundary: null, isOutsideHadd: true, status: 'unknown', message: `No boundary data for "${reverseCity}". You are likely a Traveler. Please consult a qualified Islamic authority.`, cityName: reverseCity, cityCenter: [latitude, longitude] });
          setDetectedCityName(`Unknown city: ${reverseCity}`);
        }
      }
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

  const handleCitySelect = useCallback(async (city) => {
    setCityName(city);
    let cityData = null;
    // Prefer the official bundled built-up ('urf) outline — no runtime fetch
    // needed and it cannot be displaced by a coarse admin boundary.
    cityData = getUrfBoundary(city);
    // For cities outside the official bundle, generate a true built-up outline
    // via Overpass (concave outline), falling back to the admin boundary.
    if (!cityData) {
      try {
        const result = await fetchUrfBoundary(city);
        if (result && result.boundary) {
          saveUserCity(city, { center: result.center, boundary: result.boundary });
          cityData = result;
        }
      } catch {}
    }
    if (cityData) {
      setLocation({ lat: cityData.center[0], lng: cityData.center[1] });
      const r = getHaddRange(city);
      handleHaddChange(r.recommended);
      setQasrStatus(calculateStatusWithHadd(cityData.center[0], cityData.center[1], city, r.recommended, journeyFarsakhs));
      setError('');
      setDetectedCityName('');
    }
  }, [journeyFarsakhs, boundariesLoaded]);

  const urfPolygon = cityName ? generateUrfPolygon(cityName) : null;
  const legacyPolygon = (cityName && showLegacyBoundary) ? getApproximateBoundary(cityName) : null;
  const boundaryInfo = cityName ? getBoundarySource(cityName) : null;
  const haddZonePolygon = (cityName && showHaddZone) ? generateHaddZonePolygon(cityName, userHaddKm) : null;
  const activeBoundary = cityName
    ? (boundaryType === 'one-way' ? generateOneWayBoundary(cityName) : generateHaddBoundary(cityName))
    : null;
  const haddRange = cityName ? getHaddRange(cityName) : { min: 2, recommended: 5, max: 14 };
  const activeDistance = boundaryType === 'one-way' ? ONE_WAY_HADD_KM : HADD_AL_TARAKHKHUS_KM;

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

        {/* Journey Origin */}
        <div className="mt-3 pt-3 border-t border-[var(--border-light)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Journey Origin</span>
            <button
              onClick={() => {
                setUseOrigin(!useOrigin);
                if (!useOrigin && cityName) setOriginCity(cityName);
              }}
              className={`text-xs font-medium px-2.5 py-1 rounded-[var(--radius-sm)] transition-colors ${
                useOrigin ? 'bg-[var(--accent-light)] text-[var(--accent)]' : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'
              }`}
            >
              {useOrigin ? 'Using origin' : 'Set origin'}
            </button>
          </div>
          {useOrigin && (
            <div>
              <select
                value={originCity}
                onChange={e => setOriginCity(e.target.value)}
                className="w-full h-11 px-3 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]"
              >
                <option value="">Select origin city...</option>
                {supportedCities.map(city => <option key={city} value={city}>{city}</option>)}
              </select>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                Status will be calculated based on distance from your origin city.
              </p>
            </div>
          )}
        </div>

        {error && <div className="mt-3 px-3.5 py-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-[var(--radius-sm)] text-sm text-[var(--danger)]">{error}</div>}
      </div>

      {/* Hadd al-Tarakhkhus Controls */}
      {cityName && (
      <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Hadd al-Tarakhkhus</h3><button onClick={() => setShowHaddExplainer(!showHaddExplainer)} class="w-7 h-7 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center text-xs font-semibold" title="Why this recommendation?">ⓘ</button>
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={showHaddZone} onChange={e => setShowHaddZone(e.target.checked)} className="w-3.5 h-3.5 rounded accent-[var(--accent)]" />
            Show on map
          </label>
        </div>
        <p className="text-[11px] text-[var(--text-tertiary)] mb-2">
          The Hadd is where city walls are no longer visible or the adhan can no longer be heard. Based on {cityName} (radius ~{Math.round(haddRange.recommended * 1.5)} km),
          the recommended distance is <strong className="text-[var(--accent)]">{haddRange.recommended} km</strong>. Adjust below per your own judgment.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)]">{haddRange.min} km</span>
          <input
            type="range"
            min={haddRange.min}
            max={haddRange.max}
            step={0.5}
            value={userHaddKm}
            onChange={e => handleHaddChange(parseFloat(e.target.value))}
            className="w-full h-6 accent-[var(--accent)]"
          />
          <span className="text-[10px] text-[var(--text-tertiary)]">{haddRange.max} km</span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-[var(--text-secondary)]">Your Hadd: <strong class="text-[var(--accent)]">{userHaddKm} km</strong></span>
          <span className="text-[11px] text-[var(--text-tertiary)]">Recommended: {haddRange.recommended} km</span>
        </div>

        {showHaddExplainer && (
        <div className="mt-2 p-3 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs text-[var(--text-tertiary)] leading-relaxed slide-up">
          <p className="font-medium text-[var(--text-secondary)] mb-1">Why {haddRange.recommended} km?</p>
          <p>The Hadd al-Tarakhkhus is where <strong>city walls are no longer visible</strong> or the <strong>adhan can no longer be heard</strong> (Ayatollah Sistani). Modern cities lack walls and public adhan, so this is inherently <strong>subjective</strong> ? this is a recommendation, not a ruling.</p>
          {!haddRange.isDefault ? (
            <p className="mt-1"><strong>{cityName}</strong>’s ‘Urf boundary has an estimated average radius of <strong>{haddRange.radiusKm} km</strong>. Larger metros have taller/denser edge development visible from farther away. Using a horizon-visibility formula (3.2 × √radius), the recommended Hadd is <strong>{haddRange.recommended} km</strong>, with a plausible range of {haddRange.min}–{haddRange.max} km.</p>
          ) : (
            <p className="mt-1">This city uses a generic fallback. Adjust the slider to your best judgment.</p>
          )}
          <p className="mt-1">Adjust the slider above to where you personally believe the city’s presence is no longer perceptible.</p>
        </div>
        )}

        <div className="mt-2.5 pt-2.5 border-t border-[var(--border-light)]">
          <p className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Intended journey distance</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="100"
              value={journeyFarsakhs}
              onChange={e => setJourneyFarsakhs(parseInt(e.target.value) || 0)}
              className="w-16 h-9 px-2 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]"
            />
            <span className="text-xs text-[var(--text-secondary)]">farsakhs</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">~{Math.round(journeyFarsakhs * 5.5)} km</span>
            {journeyFarsakhs < 8 ? (
              <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded-[var(--radius-sm)]">Under 8 — not a traveler</span>
            ) : (
              <span className="text-xs text-[var(--accent)] bg-[var(--accent-light)] px-2 py-0.5 rounded-[var(--radius-sm)]">8+ farsakhs — traveler if past Hadd</span>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Boundary Type Toggle */}
      {cityName && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Boundary:</span>
          <div className="flex bg-[var(--bg-secondary)] rounded-[var(--radius-sm)] p-0.5">
            <button
              onClick={() => setBoundaryType('round-trip')}
              className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-all ${
                boundaryType === 'round-trip'
                  ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Round-trip (22 km)
            </button>
            <button
              onClick={() => setBoundaryType('one-way')}
              className={`px-3 py-1.5 text-xs font-medium rounded-[6px] transition-all ${
                boundaryType === 'one-way'
                  ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              One-way (44 km)
            </button>
          </div>
        </div>
      )}

      {/* Map + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden" style={{ height: '420px' }}>
            <MapContainer center={location ? [location.lat, location.lng] : [29.7604, -95.3698]} zoom={10} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapController center={location ? [location.lat, location.lng] : null} zoom={10} />
              {urfPolygon && <Polygon positions={urfPolygon} pathOptions={{ color: '#22c55e', weight: 2.5, fillColor: '#22c55e', fillOpacity: 0.1 }} />}
              {legacyPolygon && (
                <Polygon
                  positions={legacyPolygon}
                  pathOptions={{ color: '#e11d48', weight: 2, dashArray: '6 4', fillColor: '#e11d48', fillOpacity: 0.05 }}
                  interactive={false}
                />
              )}
              {haddZonePolygon && (
                <Polygon
                  positions={haddZonePolygon}
                  pathOptions={{
                    color: '#8b5cf6',
                    weight: 3,
                    fillColor: '#8b5cf6',
                    fillOpacity: 0.08,
                    dashArray: '8, 6',
                  }}
                >
                  <Popup><div className="text-sm"><strong>Hadd al-Tarakhkhus</strong><br />Your setting: {userHaddKm} km<br /><span className="text-[var(--text-tertiary)]">Where city walls disappear / adhan fades</span></div></Popup>
                </Polygon>
              )}
              {activeBoundary && (
                <Polygon
                  positions={activeBoundary}
                  pathOptions={{
                    color: boundaryType === 'one-way' ? '#f97316' : '#6b7280',
                    weight: 3,
                    fillColor: boundaryType === 'one-way' ? '#f97316' : '#6b7280',
                    fillOpacity: boundaryType === 'one-way' ? 0.15 : 0.06,
                    dashArray: boundaryType === 'one-way' ? 'none' : '10, 8',
                  }}
                />
              )}
              {monitorPath.length > 1 && <Polygon positions={monitorPath} pathOptions={{ color: 'var(--accent,#b8860b)', weight: 2.5, fillOpacity: 0 }} />}
              {location && <Marker position={[location.lat, location.lng]} icon={isMonitoring ? monitoringIcon : userLocationIcon}>
                <Popup><div className="text-sm"><strong>Your Location</strong><br />{location.lat.toFixed(4)}, {location.lng.toFixed(4)}<br />Status: {qasrStatus?.status === 'traveler' ? 'Traveler' : qasrStatus?.status === 'resident' ? 'Resident' : 'Unknown'}</div></Popup>
              </Marker>}
            </MapContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><div className="w-3 h-3 rounded" style={{ background: '#22c55e', opacity: 0.5 }} /><span>City Boundary</span><button onClick={() => setShowCityBoundaryInfo(!showCityBoundaryInfo)} class="w-5 h-5 rounded-full bg-transparent hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center justify-center text-[9px] leading-none" title="About the City Boundary">ℹ</button></div>
            {boundaryInfo && boundaryInfo.kind !== 'none' && (
              <div className={`px-1.5 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-medium border ${boundaryInfo.kind === 'osm' ? 'bg-[var(--accent-light)] text-[var(--accent)] border-transparent' : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border-[var(--border)]'}`} title={`Boundary data source: ${boundaryInfo.kind}`}>
                {boundaryInfo.kind === 'osm' ? 'OSM built-up' : boundaryInfo.kind === 'generated' ? 'Generated' : 'Approximate'}
                {boundaryInfo.areaKm2 ? ` · ${Math.round(boundaryInfo.areaKm2).toLocaleString()} km²` : ''}
              </div>
            )}
            {cityName && getApproximateBoundary(cityName) && (
              <button onClick={() => setShowLegacyBoundary(!showLegacyBoundary)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-[var(--radius-sm)] transition-colors ${showLegacyBoundary ? 'bg-[#e11d48]/15 text-[#e11d48]' : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>
                {showLegacyBoundary ? 'Old boundary: shown' : 'Compare with old boundary'}
              </button>
            )}
            {showHaddZone && <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><div className="w-3 h-3 rounded" style={{ background: '#8b5cf6', opacity: 0.4 }} /><span>Hadd al-Tarakhkhus ({userHaddKm} km)</span></div>}
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <div className="w-3 h-3 rounded" style={{ background: boundaryType === 'one-way' ? '#f97316' : '#6b7280', opacity: boundaryType === 'one-way' ? 0.5 : 0.4 }} />
              <span>{boundaryType === 'one-way' ? 'One-way (44 km)' : 'Round-trip (22 km)'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]"><div className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full" /><span>Your Location</span></div>
            {isMonitoring && <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]"><div className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full animate-pulse" /><span>Monitoring</span></div>}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {qasrStatus && (
            <div className={`bg-white border rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] p-5 ${qasrStatus.status === 'traveler' ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'}`}>
              <p className={`text-sm font-semibold mb-1 ${qasrStatus.status === 'traveler' ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                {qasrStatus.status === 'traveler' ? 'Traveler (Musafir)' : 'Resident (Hadir)'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mb-2">{qasrStatus.message}</p>
              <div className="text-xs text-[var(--text-tertiary)] space-y-0.5">
                {cityName && <div>City: <span className="text-[var(--text-secondary)]">{cityName}</span></div>}
                {qasrStatus.detail === 'inside-urf' && <div className="text-[var(--text-secondary)]">You are inside the city boundary ⟶ Resident</div>}
                {qasrStatus.detail === 'before-hadd' && <div className="text-[var(--text-secondary)]">Past city boundary but before Hadd ⟶ Resident</div>}
                {qasrStatus.detail === 'past-hadd-but-short-journey' && <div className="text-[var(--text-secondary)]">Past Hadd but journey under 8 farsakhs ⟶ Resident</div>}
                {qasrStatus.detail === 'traveler' && <div className="text-[var(--accent)]">Past Hadd + journey 8+ farsakhs ⟶ Traveler</div>}
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="text-[11px] bg-[var(--bg-secondary)] px-1.5 rounded-[var(--radius-sm)]">'Urf</span>
                  <span className="text-[11px]">→</span>
                  <span className="text-[11px] bg-[#8b5cf6]/20 text-[#8b5cf6] px-1.5 rounded-[var(--radius-sm)]">Hadd ({userHaddKm} km)</span>
                  <span className="text-[11px]">→</span>
                  <span className="text-[11px] bg-[var(--accent-light)] text-[var(--accent)] px-1.5 rounded-[var(--radius-sm)]">{journeyFarsakhs} farsakhs</span>
                </div>
              </div>
            </div>
          )}

          {showCityBoundaryInfo && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-md)] p-3.5 slide-up">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-[var(--text-primary)]">About the City Boundary</p>
              <button onClick={() => setShowCityBoundaryInfo(false)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">✕</button>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
              The <strong>City Boundary</strong> shows where the continuous built-up residential area ends — the
              <strong>outskirts of the town</strong> (per Ayatollah Sistani). This is the line from which the
              8-farsakh (22/44 km) journey distance is measured.
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mt-0.5">
              The boundary traces the outer edge of the <strong>actual built-up area</strong> from OpenStreetMap: all
              residential, commercial and industrial land is merged into one outline and runs along the real contours
              of streets and housing developments — not administrative city limits and not artificial straight lines.
            </p>
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
              <strong className="text-[var(--text-secondary)]">Important:</strong> Per Ayatollah Sistani, the Hadd al-Tarakhkhus is where <em>the city walls are no longer visible</em> or <em>the adhan can no longer be heard</em>. In modern cities the measure is subjective and must be determined by the mukallaf. The recommended value (~{userHaddKm} km for this city) is based on typical edge-building-height visibility. The 8-farsakh boundary (~22/44 km) measures the <em>intended journey</em> from the 'Urf outskirts — not the Hadd.
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