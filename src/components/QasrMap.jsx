import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  calculateQasrStatus,
  getSupportedCities,
  getUrfBoundary,
  generateUrfPolygon,
  generateHaddBoundary,
  haversineDistance,
  HADD_AL_TARAKHKHUS_KM,
  reverseGeocode,
  fetchCityBoundary,
  findCityForLocation,
  saveUserCity,
  calculateDistanceToHadd,
} from '../utils/geoUtils';

// ─── Custom Icons ────────────────────────────────────────────────────────────

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div style="
    width: 20px; height: 20px;
    background: #c4a882;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(196,168,130,0.3), 0 2px 8px rgba(0,0,0,0.15);
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const monitoringIcon = L.divIcon({
  className: 'monitoring-marker',
  html: `<div style="
    width: 24px; height: 24px;
    background: #b89978;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(184,153,120,0.4), 0 0 20px rgba(184,153,120,0.3);
    animation: pulse 1.5s infinite;
  "></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const cityCenterIcon = L.divIcon({
  className: 'city-center-marker',
  html: `<div style="
    width: 16px; height: 16px;
    background: #b89978;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
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

// ─── Audio Alert ─────────────────────────────────────────────────────────────

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // Audio not available
  }
}

// ─── Send Browser Notification ───────────────────────────────────────────────

async function sendNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.svg' });
  } else if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.svg' });
    }
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

    if (isTraveler && stayDays >= 10) {
      finalStatus = 'resident';
      prayers = 'Tamam (Full 4 Rak\'ahs)';
      fasting = 'Valid';
      details.push('You intend to stay 10 days or more. You are considered a Resident at your destination.');
    }

    if (passingThroughWatan === 'yes') {
      finalStatus = 'resident';
      prayers = 'Tamam (Full 4 Rak\'ahs)';
      fasting = 'Valid';
      details.push('You are passing through your Watan (hometown). Travel status is reset. You are a Resident here.');
    }

    if (!isTraveler) {
      details.push("You are within the city limits ('Urf boundary). You are a Resident.");
    }

    if (isTraveler && stayDays < 10 && passingThroughWatan !== 'yes') {
      details.push('You are beyond Hadd al-Tarakhkhus (22 km from city limits). You are a Traveler.');
      if (stayDays > 0) {
        details.push(`You intend to stay ${stayDays} days (less than 10). Traveler status maintained.`);
      }
    }

    setVerdict({ finalStatus, prayers, fasting, details });
  }, [qasrStatus, stayDuration, hasWatan, passingThroughWatan]);

  if (verdict) {
    return (
      <div className="bg-white/80 backdrop-blur-2xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(196,168,130,0.04) 60deg, transparent 120deg, rgba(160,128,96,0.04) 180deg, transparent 240deg, rgba(196,168,130,0.04) 300deg, transparent 360deg)',
          animation: 'glass-shimmer 8s linear infinite',
          backgroundSize: '200% 200%',
        }} />
        <h3 className="text-xl font-bold text-[#3d352e] mb-4">
          Your Ruling (Hukm)
        </h3>

        <div className={`bg-white/60 backdrop-blur-2xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 relative overflow-hidden ${
          verdict.finalStatus === 'traveler'
            ? 'border-[#c4a882]'
            : 'border-[#a08060]'
        }`}>
          <div className="text-center">
            <div className={`text-2xl font-bold mb-2 ${
              verdict.finalStatus === 'traveler' ? 'text-[#c4a882]' : 'text-[#a08060]'
            }`}>
              {verdict.finalStatus === 'traveler' ? 'Traveler (Musafir)' : 'Resident (Hadir)'}
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between p-3 bg-white/50 rounded-xl border border-[#e0d5c8]">
              <span className="text-[#8a7a6a]">Prayers</span>
              <span className={`font-bold ${verdict.prayers.includes('Qasr') ? 'text-[#c4a882]' : 'text-[#a08060]'}`}>
                {verdict.prayers}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white/50 rounded-xl border border-[#e0d5c8]">
              <span className="text-[#8a7a6a]">Fasting</span>
              <span className={`font-bold ${verdict.fasting.includes('Invalid') ? 'text-[#c0392b]' : 'text-[#a08060]'}`}>
                {verdict.fasting}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {verdict.details.map((d, i) => (
              <div key={i} className="text-sm text-[#8a7a6a] flex items-start gap-2">
                <span className="text-[#c4a882] mt-0.5">-</span>
                {d}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            setVerdict(null);
            setStep(1);
            setStayDuration('');
            setHasWatan(null);
            setPassingThroughWatan(null);
            onReset && onReset();
          }}
          className="w-full px-4 py-2 bg-[#ede6dc] hover:bg-[#e0d5c8] text-[#3d352e] rounded-xl border border-[#e0d5c8] transition-all duration-300 mt-4"
        >
          Start Over
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0]">
      <h3 className="text-lg font-semibold text-[#3d352e] mb-4">
        Step {step} of 3
      </h3>

      {step === 1 && (
        <div>
          <p className="text-[#8a7a6a] mb-3">
            How many days do you intend to stay at your destination?
          </p>
          <input
            type="number"
            min="0"
            max="365"
            value={stayDuration}
            onChange={(e) => setStayDuration(e.target.value)}
            placeholder="Enter number of days..."
            className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] placeholder-[#a09080] focus:outline-none focus:border-[#c4a882] mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              disabled={!stayDuration}
              className="flex-1 px-4 py-2 bg-[#c4a882] hover:bg-[#b89978] disabled:bg-[#e0d5c8] disabled:text-[#a09080] text-white font-bold rounded-lg transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="text-[#8a7a6a] mb-3">
            Do you have a Watan (hometown) that you are passing through on this journey?
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => { setHasWatan('yes'); setPassingThroughWatan('yes'); setStep(3); }}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors ${
                hasWatan === 'yes' ? 'bg-[#c4a882] text-white' : 'bg-[#ede6dc] text-[#8a7a6a] hover:bg-[#e0d5c8]'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => { setHasWatan('no'); setPassingThroughWatan('no'); setStep(3); }}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors ${
                hasWatan === 'no' ? 'bg-[#c4a882] text-white' : 'bg-[#ede6dc] text-[#8a7a6a] hover:bg-[#e0d5c8]'
              }`}
            >
              No
            </button>
          </div>
          <button
            onClick={() => setStep(1)}
            className="text-sm text-[#a09080] hover:text-[#8a7a6a] transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="text-[#8a7a6a] mb-3">
            Are you passing through your Watan during this trip (even if not your final destination)?
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setPassingThroughWatan('yes')}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors ${
                passingThroughWatan === 'yes' ? 'bg-[#c4a882] text-white' : 'bg-[#ede6dc] text-[#8a7a6a] hover:bg-[#e0d5c8]'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => setPassingThroughWatan('no')}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors ${
                passingThroughWatan === 'no' ? 'bg-[#c4a882] text-white' : 'bg-[#ede6dc] text-[#8a7a6a] hover:bg-[#e0d5c8]'
              }`}
            >
              No
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 bg-[#ede6dc] hover:bg-[#e0d5c8] text-[#3d352e] rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!passingThroughWatan}
              className="flex-1 px-4 py-2 bg-[#c4a882] hover:bg-[#b89978] disabled:bg-[#e0d5c8] disabled:text-[#a09080] text-white font-bold rounded-lg transition-colors"
            >
              Get Verdict
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-2 mt-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`w-3 h-3 rounded-full ${
              s === step ? 'bg-[#c4a882]' : s < step ? 'bg-[#e0d5c8]' : 'bg-[#ede6dc]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main QasrMap Component ──────────────────────────────────────────────────

export default function QasrMap() {
  const [location, setLocation] = useState(null);
  const [cityName, setCityName] = useState('');
  const [qasrStatus, setQasrStatus] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [detectedCityName, setDetectedCityName] = useState('');

  // Driving monitor state
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [haddAlerted, setHaddAlerted] = useState(false);
  const [distanceToHadd, setDistanceToHadd] = useState(null);
  const [monitorPath, setMonitorPath] = useState([]);
  const [simulating, setSimulating] = useState(false);
  const watchIdRef = useRef(null);
  const simIntervalRef = useRef(null);
  const simPosRef = useRef(null);
  const prevStatusRef = useRef(null);

  const supportedCities = getSupportedCities();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (simIntervalRef.current !== null) {
        clearInterval(simIntervalRef.current);
      }
    };
  }, []);

  // ─── Driving Monitor Logic ───────────────────────────────────────────────

  const handlePositionUpdate = useCallback((lat, lng) => {
    setLocation({ lat, lng });
    setMonitorPath(prev => [...prev, [lat, lng]]);

    if (cityName) {
      const status = calculateQasrStatus(lat, lng, cityName);
      setQasrStatus(status);

      const dist = calculateDistanceToHadd(lat, lng, cityName);
      setDistanceToHadd(dist);

      // Check for Hadd crossing
      if (status.status === 'traveler' && !haddAlerted) {
        setHaddAlerted(true);
        playAlertSound();
        sendNotification(
          'Hadd al-Tarakhkhus Crossed!',
          "You are now a Traveler (Musafir). Prayers: Qasr (2 Rak'ahs). Fasting: Invalid (Qada required)."
        );
      }

      // Re-alert if they were inside and cross again
      if (prevStatusRef.current === 'resident' && status.status === 'traveler') {
        setHaddAlerted(false);
      }
      prevStatusRef.current = status.status;
    }
  }, [cityName, haddAlerted]);

  const startMonitoring = useCallback(() => {
    if (!cityName) {
      setError('Please select a city or use your current location first.');
      return;
    }

    setIsMonitoring(true);
    setHaddAlerted(false);
    setMonitorPath([]);
    setDistanceToHadd(null);
    prevStatusRef.current = null;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Start watching position
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          handlePositionUpdate(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          console.warn('Watch position error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    }
  }, [cityName, handlePositionUpdate]);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (simIntervalRef.current !== null) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    setSimulating(false);
  }, []);

  // ─── Simulation Mode ────────────────────────────────────────────────────

  const startSimulation = useCallback(() => {
    if (!cityName) {
      setError('Please select a city first.');
      return;
    }

    const cityData = getUrfBoundary(cityName);
    if (!cityData) return;

    // Start from city center and drive outward in a straight line
    const centerLat = cityData.center[0];
    const centerLng = cityData.center[1];
    simPosRef.current = { lat: centerLat, lng: centerLng };

    setIsMonitoring(true);
    setHaddAlerted(false);
    setMonitorPath([[centerLat, centerLng]]);
    setDistanceToHadd(null);
    setSimulating(true);
    prevStatusRef.current = null;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Move outward at ~1 km per tick (every 500ms = ~120 km/h simulated)
    const bearing = 270; // West direction
    let tickCount = 0;

    simIntervalRef.current = setInterval(() => {
      tickCount++;
      const speedKmPerTick = 1.0; // 1 km per 500ms = 120 km/h
      const [newLat, newLng] = [
        simPosRef.current.lat + (speedKmPerTick / 111.32) * Math.cos(bearing * Math.PI / 180),
        simPosRef.current.lng - (speedKmPerTick / (111.32 * Math.cos(simPosRef.current.lat * Math.PI / 180))) * Math.sin(bearing * Math.PI / 180),
      ];
      simPosRef.current = { lat: newLat, lng: newLng };
      handlePositionUpdate(newLat, newLng);

      // Stop after 60 ticks (60 km simulated)
      if (tickCount >= 60) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
        setSimulating(false);
      }
    }, 500);
  }, [cityName, handlePositionUpdate]);

  // Get user's current location
  const getCurrentLocation = useCallback(() => {
    setIsLoading(true);
    setError('');

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setIsLoading(false);

        // Step 1: Check if location falls inside any known city boundary
        const matchedCity = findCityForLocation(latitude, longitude);
        if (matchedCity) {
          setCityName(matchedCity);
          const status = calculateQasrStatus(latitude, longitude, matchedCity);
          setQasrStatus(status);
          setError('');
          setDetectedCityName(`Snapped to ${matchedCity}`);
          return;
        }

        // Step 2: Reverse geocode to get city name
        try {
          const geoResult = await reverseGeocode(latitude, longitude);
          const reverseCity = geoResult.city;

          if (!reverseCity) {
            setError('Could not determine your city. Please select one from the dropdown.');
            return;
          }

          // Step 3: Check the reverse-geocoded city in our database
          const cityData = getUrfBoundary(reverseCity);
          if (cityData) {
            setCityName(reverseCity);
            const status = calculateQasrStatus(latitude, longitude, reverseCity);
            setQasrStatus(status);
            setError('');
            setDetectedCityName(`Located: ${reverseCity}, ${geoResult.state || ''}`);
            return;
          }

          // Step 4: Fetch the city boundary from Nominatim
          setDetectedCityName(`Discovering: ${reverseCity}...`);
          const boundaryData = await fetchCityBoundary(reverseCity, geoResult.state || '');

          if (boundaryData && boundaryData.boundary) {
            const newCityData = {
              center: boundaryData.center,
              boundary: boundaryData.boundary,
            };
            saveUserCity(reverseCity, newCityData);

            setCityName(reverseCity);
            const status = calculateQasrStatus(latitude, longitude, reverseCity);
            setQasrStatus(status);
            setError('');
            setDetectedCityName(`New city discovered: ${reverseCity}`);
          } else {
            setCityName('');
            setQasrStatus({
              isInsideUrf: null,
              distanceFromBoundary: null,
              isOutsideHadd: true,
              status: 'unknown',
              message: `No boundary data available for "${reverseCity}". Based on your distance from known cities, you are likely a Traveler (Musafir). Please consult a qualified Islamic authority.`,
              cityName: reverseCity,
              cityCenter: geoResult ? [geoResult.lat, geoResult.lng] : [latitude, longitude],
            });
            setDetectedCityName(`Unknown city: ${reverseCity}`);
          }
        } catch (e) {
          setError(`Could not determine location: ${e.message}. Please select a city from the dropdown.`);
        }
      },
      (err) => {
        setError(`Could not get location: ${err.message}. Please select a city from the dropdown.`);
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  // Handle manual city selection
  const handleCitySelect = useCallback((city) => {
    setCityName(city);
    const cityData = getUrfBoundary(city);
    if (cityData) {
      setLocation({ lat: cityData.center[0], lng: cityData.center[1] });
      const status = calculateQasrStatus(cityData.center[0], cityData.center[1], city);
      setQasrStatus(status);
      setError('');
      setDetectedCityName('');
    }
  }, []);

  // Generate map overlays
  const urfPolygon = cityName ? generateUrfPolygon(cityName) : null;
  const haddBoundary = cityName ? generateHaddBoundary(cityName) : null;

  return (
    <div className="min-h-screen">
      {/* Hadd Crossing Alert Banner */}
      {haddAlerted && (
        <div className="bg-gradient-to-r from-[#c4a882] via-[#b89978] to-[#c4a882] p-4 shadow-lg animate-pulse">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">!</div>
              <div>
                <h2 className="text-lg font-bold text-white">Hadd al-Tarakhkhus Crossed</h2>
                <p className="text-sm text-white/80">
                  You are now a Traveler (Musafir). Prayers: Qasr (2 Rak'ahs). Fasting: Invalid (Qada required).
                </p>
              </div>
            </div>
            <button
              onClick={() => setHaddAlerted(false)}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-[#e0d5c8] p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-[#3d352e]">
            Qasr Status Checker
          </h1>
          <p className="text-[#8a7a6a] text-sm mt-1">
            Determine your traveler status based on Ayatollah Sistani's rulings
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4">
        {/* Input Controls */}
        <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 mb-4 transition-all duration-500 hover:border-[#d0c0b0]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Your Location</label>
              <button
                onClick={getCurrentLocation}
                disabled={isLoading || isMonitoring}
                className="w-full px-4 py-2 bg-[#c4a882] hover:bg-[#b89978] disabled:bg-[#e0d5c8] disabled:text-[#a09080] text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span> Locating...
                  </>
                ) : (
                  'Use Current Location'
                )}
              </button>
              {detectedCityName && (
                <p className="text-xs text-[#c4a882] mt-1">{detectedCityName}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-[#8a7a6a] mb-1">Or Select a City</label>
              <select
                onChange={(e) => {
                  if (e.target.value) handleCitySelect(e.target.value);
                }}
                className="w-full px-3 py-2 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] focus:outline-none focus:border-[#c4a882]"
                value={cityName}
                disabled={isMonitoring}
              >
                <option value="">Select a city...</option>
                {supportedCities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="mt-3 p-3 bg-[#f0e0d0] border border-[#d0b0a0] rounded-lg text-[#8a5a4a] text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Map and Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Map */}
          <div className="lg:col-span-2">
            <div className="bg-white/70 backdrop-blur rounded-xl overflow-hidden border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)]" style={{ height: '500px' }}>
              <MapContainer
                center={location ? [location.lat, location.lng] : [29.7604, -95.3698]}
                zoom={10}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController center={location ? [location.lat, location.lng] : null} zoom={10} />

                {/* 'Urf Boundary (Green - Resident Zone) */}
                {urfPolygon && (
                  <Polygon
                    positions={urfPolygon}
                    pathOptions={{
                      color: '#22c55e',
                      weight: 3,
                      fillColor: '#22c55e',
                      fillOpacity: 0.15,
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>Estimated 'Urf Boundary</strong>
                        <br />
                        <span className="text-green-500">Resident Zone (Tamam)</span>
                        <br />
                        <span className="text-gray-400">Inside city limits</span>
                      </div>
                    </Popup>
                  </Polygon>
                )}

                {/* Hadd al-Tarakhkhus Boundary (22 km) — Gray dashed polygon */}
                {haddBoundary && (
                  <Polygon
                    positions={haddBoundary}
                    pathOptions={{
                      color: '#6b7280',
                      weight: 4,
                      fillColor: '#6b7280',
                      fillOpacity: 0.08,
                      dashArray: '12, 8',
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>Hadd al-Tarakhkhus</strong>
                        <br />
                        <span className="text-gray-400">22 km (13.7 mi) from 'Urf boundary</span>
                        <br />
                        <span className="text-gray-500">Beyond this = Traveler (Qasr)</span>
                      </div>
                    </Popup>
                  </Polygon>
                )}

                {/* Monitor path trail */}
                {monitorPath.length > 1 && (
                  <Polygon
                    positions={monitorPath}
                    pathOptions={{
                      color: '#c4a882',
                      weight: 3,
                      fillOpacity: 0,
                      dashArray: '6, 4',
                    }}
                  />
                )}

                {/* User location marker */}
                {location && (
                  <Marker position={[location.lat, location.lng]} icon={isMonitoring ? monitoringIcon : userLocationIcon}>
                    <Popup>
                      <div className="text-sm">
                        <strong>Your Location</strong>
                        <br />
                        {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                        {qasrStatus && (
                          <>
                            <br />
                            <span className={qasrStatus.status === 'traveler' ? 'text-[#c4a882]' : 'text-[#a08060]'}>
                              Status: {qasrStatus.status === 'traveler' ? 'Traveler' : qasrStatus.status === 'resident' ? 'Resident' : 'Transition'}
                            </span>
                          </>
                        )}
                        {distanceToHadd != null && (
                          <>
                            <br />
                            <span className="text-[#b89978]">
                              {distanceToHadd < 0
                                ? `${Math.abs(distanceToHadd).toFixed(1)} km to Hadd`
                                : `${distanceToHadd.toFixed(1)} km past Hadd`}
                            </span>
                          </>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* City center */}
                {cityName && !location && (
                  <Marker position={[29.7604, -95.3698]} icon={cityCenterIcon}>
                    <Popup>{cityName} Center</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>

            {/* Legend */}
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#8a7a6a]">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ background: '#22c55e', opacity: 0.5 }} />
                <span>'Urf Boundary (Resident Zone)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ background: '#6b7280', opacity: 0.5 }} />
                <span>Hadd al-Tarakhkhus (22 km)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-[#c4a882] rounded-full" />
                <span>Your Location</span>
              </div>
              {isMonitoring && (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-[#b89978] rounded-full animate-pulse" />
                  <span>Monitoring</span>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status Card */}
            {qasrStatus && (
              <div className={`bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0] ${
                qasrStatus.status === 'traveler'
                  ? 'border-[#c4a882]'
                  : qasrStatus.status === 'resident'
                  ? 'border-[#a08060]'
                  : 'border-[#d0c0b0]'
              }`}>
                <h3 className="text-lg font-semibold text-[#3d352e] mb-2">
                  Location Status
                </h3>
                <div className="text-center mb-3">
                  <div className={`text-xl font-bold ${
                    qasrStatus.status === 'traveler' ? 'text-[#c4a882]' :
                    qasrStatus.status === 'resident' ? 'text-[#a08060]' : 'text-[#b89978]'
                  }`}>
                    {qasrStatus.status === 'traveler' ? 'Traveler' :
                     qasrStatus.status === 'resident' ? 'Resident' : 'Transition Zone'}
                  </div>
                </div>
                <p className="text-sm text-[#8a7a6a] mb-3">{qasrStatus.message}</p>
                <div className="text-xs text-[#a09080] space-y-1">
                  {qasrStatus.cityName && <div>City: <span className="text-[#3d352e]">{qasrStatus.cityName}</span></div>}
                  {qasrStatus.distanceKm != null && <div>Distance from boundary: <span className="text-[#3d352e]">{Math.abs(qasrStatus.distanceKm).toFixed(1)} km</span></div>}
                  <div>Hadd al-Tarakhkhus: <span className="text-[#3d352e]">{qasrStatus.haddDistance || HADD_AL_TARAKHKHUS_KM} km</span></div>
                  {distanceToHadd != null && (
                    <div>
                      Distance to Hadd: <span className={distanceToHadd < 0 ? 'text-[#b89978]' : 'text-[#c4a882]'}>
                        {distanceToHadd < 0
                          ? `${Math.abs(distanceToHadd).toFixed(1)} km remaining`
                          : `${distanceToHadd.toFixed(1)} km past (Traveler)`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Driving Monitor Controls */}
            <div className="bg-white/70 backdrop-blur-xl border border-[#e0d5c8] shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] rounded-3xl p-4 transition-all duration-500 hover:border-[#d0c0b0]">
              <h3 className="text-lg font-semibold text-[#3d352e] mb-3">
                Driving Monitor
              </h3>

              {!isMonitoring ? (
                <div className="space-y-2">
                  <button
                    onClick={startMonitoring}
                    disabled={!cityName}
                    className="w-full px-4 py-3 bg-[#c4a882] hover:bg-[#b89978] disabled:bg-[#e0d5c8] disabled:text-[#a09080] text-white font-bold rounded-lg transition-colors"
                  >
                    Start Monitoring
                  </button>
                  <button
                    onClick={startSimulation}
                    disabled={!cityName}
                    className="w-full px-4 py-2 bg-[#ede6dc] hover:bg-[#e0d5c8] disabled:bg-[#f5f0eb] disabled:text-[#a09080] text-[#3d352e] font-bold rounded-lg transition-colors"
                  >
                    Simulate Drive (Desktop Test)
                  </button>
                  <p className="text-xs text-[#a09080] mt-2">
                    {cityName
                      ? 'Start monitoring to get notified when you cross the Hadd al-Tarakhkhus boundary. Use "Simulate Drive" to test on desktop.'
                      : 'Select a city or use your current location first.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 bg-[#c4a882] rounded-full animate-pulse"></span>
                    <span className="text-[#c4a882] font-bold">Monitoring Active</span>
                  </div>
                  {simulating && (
                    <div className="text-xs text-[#b89978]">
                      Simulation running - driving west at ~120 km/h
                    </div>
                  )}
                  {distanceToHadd != null && (
                    <div className={`p-2 rounded-lg text-center text-sm font-bold ${
                      distanceToHadd < 0
                        ? 'bg-[#f5f0eb] text-[#b89978] border border-[#e0d5c8]'
                        : 'bg-[#f5f0eb] text-[#c4a882] border border-[#e0d5c8]'
                    }`}>
                      {distanceToHadd < 0
                        ? `${Math.abs(distanceToHadd).toFixed(1)} km until Hadd`
                        : `${distanceToHadd.toFixed(1)} km past Hadd`}
                    </div>
                  )}
                  <button
                    onClick={stopMonitoring}
                    className="w-full px-4 py-2 bg-[#d0b0a0] hover:bg-[#c0a090] text-white font-bold rounded-lg transition-colors"
                  >
                    Stop Monitoring
                  </button>
                </div>
              )}
            </div>

            {/* Disclaimer */}
            <div className="bg-[#f5f0eb] border border-[#e0d5c8] rounded-xl p-4">
              <h4 className="text-sm font-bold text-[#b89978] mb-2">
                Important Disclaimer
              </h4>
              <p className="text-xs text-[#a09080] leading-relaxed">
                The 'Urf boundary shown is an <strong>estimation</strong> based on structural density and 
                census data approximations, or sourced from OpenStreetMap administrative boundaries. 
                Per Ayatollah Sistani (Islamic Laws, Ruling 1266): <em>"The start of the eight farsakhs 
                must be calculated from the point beyond which a person is deemed to be a traveller; 
                this is usually the outskirts of a town."</em> This digital approximation is intended to 
                guide your conscience but <strong>does not replace</strong> your own determination of 
                where the continuous urban area ends. Please use your own judgment and consult a 
                qualified Islamic authority if in doubt.
              </p>
            </div>

            {/* Questionnaire */}
            {qasrStatus && !showQuestionnaire && (
              <button
                onClick={() => setShowQuestionnaire(true)}
                className="w-full px-4 py-3 bg-[#c4a882] hover:bg-[#b89978] text-white font-bold rounded-xl transition-colors"
              >
                Get Complete Verdict
              </button>
            )}

            {showQuestionnaire && (
              <VerdictQuestionnaire
                qasrStatus={qasrStatus}
                onReset={() => setShowQuestionnaire(false)}
              />
            )}
          </div>
        </div>

        {/* Empty state */}
        {!qasrStatus && !error && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4 text-[#c4a882] font-serif">M</div>
            <h2 className="text-xl font-bold text-[#3d352e] mb-2">Check Your Traveler Status</h2>
            <p className="text-[#8a7a6a]">
              Use your current location or select a city to see the 'Urf boundary
              <br />
              and determine if you are a Traveler (Qasr) or Resident (Tamam).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}