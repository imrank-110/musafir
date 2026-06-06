import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  calculateQasrStatus,
  getSupportedCities,
  getUrfBoundary,
  generateUrfPolygon,
  generateHaddBoundary,
  haversineDistance,
  HADD_AL_TARAKHKHUS_KM,
} from '../utils/geoUtils';

// ─── Custom Icons ────────────────────────────────────────────────────────────

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div style="
    width: 20px; height: 20px;
    background: #3b82f6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const cityCenterIcon = L.divIcon({
  className: 'city-center-marker',
  html: `<div style="
    width: 16px; height: 16px;
    background: #f59e0b;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
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

// ─── Verdict Questionnaire ───────────────────────────────────────────────────

function VerdictQuestionnaire({ qasrStatus, onReset }) {
  const [step, setStep] = useState(1);
  const [stayDuration, setStayDuration] = useState('');
  const [hasWatan, setHasWatan] = useState(null);
  const [passingThroughWatan, setPassingThroughWatan] = useState(null);
  const [verdict, setVerdict] = useState(null);

  const handleSubmit = useCallback(() => {
    if (!qasrStatus) return;

    // Determine base status from location
    const isTraveler = qasrStatus.status === 'traveler';
    const stayDays = parseInt(stayDuration, 10);

    let finalStatus = isTraveler ? 'traveler' : 'resident';
    let prayers = isTraveler ? 'Qasr (Shortened to 2 Rak\'ahs)' : 'Tamam (Full 4 Rak\'ahs)';
    let fasting = isTraveler ? 'Invalid (Must make up via Qada)' : 'Valid';
    let details = [];

    // Rule 1: If staying 10 days or more in one place, you become a resident
    if (isTraveler && stayDays >= 10) {
      finalStatus = 'resident';
      prayers = 'Tamam (Full 4 Rak\'ahs)';
      fasting = 'Valid';
      details.push('You intend to stay 10 days or more → You are considered a Resident at your destination.');
    }

    // Rule 2: Passing through Watan (hometown) resets travel
    if (passingThroughWatan === 'yes') {
      finalStatus = 'resident';
      prayers = 'Tamam (Full 4 Rak\'ahs)';
      fasting = 'Valid';
      details.push('You are passing through your Watan (hometown) → Travel status is reset. You are a Resident here.');
    }

    // Rule 3: If not a traveler at all
    if (!isTraveler) {
      details.push('You are within the city limits (\'Urf boundary) → You are a Resident.');
    }

    if (isTraveler && stayDays < 10 && passingThroughWatan !== 'yes') {
      details.push('You are beyond Hadd al-Tarakhkhus (22 km from city limits) → You are a Traveler.');
      if (stayDays > 0) {
        details.push(`You intend to stay ${stayDays} days (less than 10) → Traveler status maintained.`);
      }
    }

    setVerdict({ finalStatus, prayers, fasting, details });
  }, [qasrStatus, stayDuration, hasWatan, passingThroughWatan]);

  if (verdict) {
    return (
      <div className="bg-gray-800/80 backdrop-blur rounded-xl p-6 border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span>⚖️</span> Your Ruling (Hukm)
        </h3>

        <div className={`p-4 rounded-xl mb-4 ${
          verdict.finalStatus === 'traveler'
            ? 'bg-emerald-900/30 border border-emerald-600/50'
            : 'bg-blue-900/30 border border-blue-600/50'
        }`}>
          <div className="text-center">
            <div className="text-4xl mb-2">
              {verdict.finalStatus === 'traveler' ? '🛤️' : '🏠'}
            </div>
            <div className={`text-2xl font-bold mb-2 ${
              verdict.finalStatus === 'traveler' ? 'text-emerald-300' : 'text-blue-300'
            }`}>
              {verdict.finalStatus === 'traveler' ? 'Traveler (Musafir)' : 'Resident (Hadir)'}
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
              <span className="text-gray-300">🕌 Prayers</span>
              <span className={`font-bold ${verdict.prayers.includes('Qasr') ? 'text-emerald-300' : 'text-blue-300'}`}>
                {verdict.prayers}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
              <span className="text-gray-300">🌙 Fasting</span>
              <span className={`font-bold ${verdict.fasting.includes('Invalid') ? 'text-red-300' : 'text-emerald-300'}`}>
                {verdict.fasting}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {verdict.details.map((d, i) => (
              <div key={i} className="text-sm text-gray-400 flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">•</span>
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
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          🔄 Start Over
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/80 backdrop-blur rounded-xl p-4 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span>⚖️</span> Step {step} of 3
      </h3>

      {step === 1 && (
        <div>
          <p className="text-gray-300 mb-3">
            How many days do you intend to stay at your destination?
          </p>
          <input
            type="number"
            min="0"
            max="365"
            value={stayDuration}
            onChange={(e) => setStayDuration(e.target.value)}
            placeholder="Enter number of days..."
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              disabled={!stayDuration}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-lg transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="text-gray-300 mb-3">
            Do you have a Watan (hometown) that you are passing through on this journey?
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => { setHasWatan('yes'); setPassingThroughWatan('yes'); setStep(3); }}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors ${
                hasWatan === 'yes' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => { setHasWatan('no'); setPassingThroughWatan('no'); setStep(3); }}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors ${
                hasWatan === 'no' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              No
            </button>
          </div>
          <button
            onClick={() => setStep(1)}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="text-gray-300 mb-3">
            Are you passing through your Watan during this trip (even if not your final destination)?
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setPassingThroughWatan('yes')}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors ${
                passingThroughWatan === 'yes' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => setPassingThroughWatan('no')}
              className={`flex-1 px-4 py-3 rounded-lg font-bold transition-colors ${
                passingThroughWatan === 'no' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              No
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!passingThroughWatan}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-lg transition-colors"
            >
              Get Verdict ⚖️
            </button>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex justify-center gap-2 mt-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`w-3 h-3 rounded-full ${
              s === step ? 'bg-emerald-500' : s < step ? 'bg-emerald-800' : 'bg-gray-600'
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
  const [manualAddress, setManualAddress] = useState('');
  const [qasrStatus, setQasrStatus] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const supportedCities = getSupportedCities();

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
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setIsLoading(false);
        // Try to find the nearest city
        findNearestCity(latitude, longitude);
      },
      (err) => {
        setError(`Could not get location: ${err.message}. Please enter a city manually.`);
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Find the nearest supported city
  const findNearestCity = useCallback((lat, lng) => {
    let nearest = null;
    let minDist = Infinity;

    for (const city of supportedCities) {
      const boundary = getUrfBoundary(city);
      if (boundary && boundary.center) {
        const center = boundary.center;
        const dist = haversineDistance(lat, lng, center[0], center[1]);
        if (dist < minDist) {
          minDist = dist;
          nearest = city;
        }
      }
    }

    if (nearest) {
      setCityName(nearest);
      const status = calculateQasrStatus(lat, lng, nearest);
      setQasrStatus(status);
    } else {
      setError('No supported city found near your location. Please select a city manually.');
    }
  }, [supportedCities]);

  // Handle manual city selection
  const handleCitySelect = useCallback((city) => {
    setCityName(city);
    const cityData = getUrfBoundary(city);
    if (cityData) {
      setLocation({ lat: cityData.center[0], lng: cityData.center[1] });
      const status = calculateQasrStatus(cityData.center[0], cityData.center[1], city);
      setQasrStatus(status);
      setError('');
    }
  }, []);

  // Handle manual address entry (simplified - just uses city center)
  const handleManualSubmit = useCallback(() => {
    if (!manualAddress.trim()) {
      setError('Please enter a city name.');
      return;
    }

    const input = manualAddress.trim();
    // Check if it matches a supported city
    const match = supportedCities.find(
      (c) => c.toLowerCase() === input.toLowerCase()
    );

    if (match) {
      handleCitySelect(match);
    } else {
      setError(`City "${input}" not found in our database. Supported cities: ${supportedCities.join(', ')}`);
    }
  }, [manualAddress, supportedCities, handleCitySelect]);

  // Generate map overlays
  const urfPolygon = cityName ? generateUrfPolygon(cityName) : null;
  const haddBoundary = cityName ? generateHaddBoundary(cityName) : null;

  // Determine colors based on status
  const getStatusColors = () => {
    if (!qasrStatus) return { urfColor: '#f59e0b', haddColor: '#6b7280' };
    if (qasrStatus.status === 'traveler') return { urfColor: '#ef4444', haddColor: '#10b981' };
    if (qasrStatus.status === 'transition') return { urfColor: '#ef4444', haddColor: '#f59e0b' };
    return { urfColor: '#ef4444', haddColor: '#6b7280' };
  };

  const { urfColor, haddColor } = getStatusColors();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span>🗺️</span> Qasr Status Checker
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Determine your traveler status based on Ayatollah Sistani's rulings
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4">
        {/* Input Controls */}
        <div className="bg-gray-800/80 backdrop-blur rounded-xl p-4 border border-gray-700 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Your Location</label>
              <button
                onClick={getCurrentLocation}
                disabled={isLoading}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin">⏳</span> Locating...
                  </>
                ) : (
                  <>
                    📍 Use Current Location
                  </>
                )}
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Or Select a City</label>
              <select
                onChange={(e) => {
                  if (e.target.value) handleCitySelect(e.target.value);
                }}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                value={cityName}
              >
                <option value="">Select a city...</option>
                {supportedCities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Or Type a City</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  placeholder="City name..."
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                />
                <button
                  onClick={handleManualSubmit}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Go
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-3 p-3 bg-red-900/50 border border-red-600/50 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Map and Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Map */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/80 backdrop-blur rounded-xl overflow-hidden border border-gray-700" style={{ height: '500px' }}>
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

                {/* 'Urf Boundary (Red - Resident Zone) */}
                {urfPolygon && (
                  <Polygon
                    positions={urfPolygon}
                    pathOptions={{
                      color: '#ef4444',
                      weight: 3,
                      fillColor: '#ef4444',
                      fillOpacity: 0.15,
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>Estimated 'Urf Boundary</strong>
                        <br />
                        <span className="text-red-500">Resident Zone (Tamam)</span>
                        <br />
                        <span className="text-gray-500">Inside city limits</span>
                      </div>
                    </Popup>
                  </Polygon>
                )}

                {/* Hadd al-Tarakhkhus Boundary (22 km) */}
                {haddBoundary && (
                  <Polygon
                    positions={haddBoundary}
                    pathOptions={{
                      color: haddColor,
                      weight: 2,
                      fillColor: haddColor,
                      fillOpacity: 0.08,
                      dashArray: '8, 8',
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>Hadd al-Tarakhkhus</strong>
                        <br />
                        <span className="text-emerald-500">22 km (13.7 mi) from 'Urf boundary</span>
                        <br />
                        <span className="text-gray-500">Beyond this = Traveler (Qasr)</span>
                      </div>
                    </Popup>
                  </Polygon>
                )}

                {/* City center marker */}
                {location && (
                  <Marker position={[location.lat, location.lng]} icon={userLocationIcon}>
                    <Popup>
                      <div className="text-sm">
                        <strong>Your Location</strong>
                        <br />
                        {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                        {qasrStatus && (
                          <>
                            <br />
                            <span className={qasrStatus.status === 'traveler' ? 'text-emerald-400' : 'text-blue-400'}>
                              Status: {qasrStatus.status === 'traveler' ? 'Traveler' : qasrStatus.status === 'resident' ? 'Resident' : 'Transition'}
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
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ background: '#ef4444', opacity: 0.5 }} />
                <span>'Urf Boundary (Resident Zone)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ background: haddColor, opacity: 0.5 }} />
                <span>Hadd al-Tarakhkhus (22 km)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                <span>Your Location</span>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status Card */}
            {qasrStatus && (
              <div className={`rounded-xl p-4 border ${
                qasrStatus.status === 'traveler'
                  ? 'bg-emerald-900/30 border-emerald-600/50'
                  : qasrStatus.status === 'resident'
                  ? 'bg-blue-900/30 border-blue-600/50'
                  : 'bg-yellow-900/30 border-yellow-600/50'
              }`}>
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <span>📍</span> Location Status
                </h3>
                <div className="text-center mb-3">
                  <div className="text-3xl mb-1">
                    {qasrStatus.status === 'traveler' ? '🛤️' : qasrStatus.status === 'resident' ? '🏠' : '🚶'}
                  </div>
                  <div className={`text-xl font-bold ${
                    qasrStatus.status === 'traveler' ? 'text-emerald-300' :
                    qasrStatus.status === 'resident' ? 'text-blue-300' : 'text-yellow-300'
                  }`}>
                    {qasrStatus.status === 'traveler' ? 'Traveler' :
                     qasrStatus.status === 'resident' ? 'Resident' : 'Transition Zone'}
                  </div>
                </div>
                <p className="text-sm text-gray-300 mb-3">{qasrStatus.message}</p>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>City: <span className="text-gray-300">{qasrStatus.cityName}</span></div>
                  <div>Distance from boundary: <span className="text-gray-300">{Math.abs(qasrStatus.distanceKm).toFixed(1)} km</span></div>
                  <div>Hadd al-Tarakhkhus: <span className="text-gray-300">{qasrStatus.haddDistance} km</span></div>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-4">
              <h4 className="text-sm font-bold text-yellow-300 mb-2 flex items-center gap-1">
                <span>⚠️</span> Important Disclaimer
              </h4>
              <p className="text-xs text-yellow-200/70 leading-relaxed">
                The 'Urf boundary shown is an <strong>estimation</strong> based on structural density and 
                census data approximations. Per Ayatollah Sistani, the traveler boundary begins when a 
                person leaves the city's common understanding or sprawling continuity ('Urf), rather than 
                official municipal signs. This digital approximation is intended to guide your conscience 
                but <strong>does not replace</strong> your own determination of where the continuous urban 
                area ends. Please use your own judgment and consult a qualified Islamic authority if in doubt.
              </p>
            </div>

            {/* Questionnaire */}
            {qasrStatus && !showQuestionnaire && (
              <button
                onClick={() => setShowQuestionnaire(true)}
                className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                ⚖️ Get Complete Verdict
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
            <div className="text-6xl mb-4">🗺️</div>
            <h2 className="text-xl font-bold text-white mb-2">Check Your Traveler Status</h2>
            <p className="text-gray-400">
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