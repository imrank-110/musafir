/**
 * SettingsTab.jsx — Watan (hometown) + frequent traveller (Katheer al-Safar).
 *
 * Both are persisted on-device and feed into the Qasr tab's verdict
 * (Traveller / Not a traveller). "i" buttons explain the fiqh meaning of each
 * according to Ayatollah Sistani.
 */
import { useEffect, useRef, useState } from 'react';
import {
  loadUserSettings,
  saveUserSettings,
  clearUserSettings,
  WATAN_EXPLAINER,
  FREQUENT_TRAVELER_EXPLAINER,
} from '../utils/userSettings';
import { getBundledCities, getUrfBoundary, fetchUrfBoundary, saveUserCity } from '../utils/geoUtils';

function InfoPanel({ data }) {
  return (
    <div data-testid="explainer-panel" className="mt-3 text-xs text-[var(--text-tertiary)] leading-relaxed space-y-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-[var(--radius-sm)] p-3">
      <p className="font-semibold text-[var(--text-secondary)]">{data.title}</p>
      {data.points.map((point, i) => <p key={i}>• {point}</p>)}
    </div>
  );
}

function SectionCard({ children }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-5">{children}</div>
  );
}

export default function SettingsTab() {
  const [settings, setSettings] = useState(() => loadUserSettings()?.settings || { watans: [], frequentTraveler: 'no' });
  const [watanInput, setWatanInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showWatanInfo, setShowWatanInfo] = useState(false);
  const [showFrequentInfo, setShowFrequentInfo] = useState(false);
  const [boundaryStatus, setBoundaryStatus] = useState({}); // city -> 'pending' | 'ready' | 'unavailable'
  const dropdownRef = useRef(null);
  const cities = getBundledCities();
  const q = watanInput.trim().toLowerCase();
  const suggestions = q ? cities.filter(c => c.toLowerCase().includes(q)) : [];

  // Close the add-hometown dropdown on outside clicks.
  useEffect(() => {
    const onDocClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // On mount, try to resolve/cache boundaries for saved hometowns that aren't
  // in the bundled city list (non-bundled watans fall back to Overpass).
  useEffect(() => {
    let cancelled = false;
    const saved = loadUserSettings();
    const watans = saved?.settings?.watans || [];
    watans.forEach(w => {
      if (getUrfBoundary(w)) return;
      setBoundaryStatus(prev => ({ ...prev, [w]: 'pending' }));
      fetchUrfBoundary(w)
        .then(boundary => {
          if (cancelled) return;
          if (boundary) {
            try { saveUserCity(w, boundary); } catch { /* cache unavailable */ }
            setBoundaryStatus(prev => ({ ...prev, [w]: 'ready' }));
          } else {
            setBoundaryStatus(prev => ({ ...prev, [w]: 'unavailable' }));
          }
        })
        .catch(() => { if (!cancelled) setBoundaryStatus(prev => ({ ...prev, [w]: 'unavailable' })); });
    });
    return () => { cancelled = true; };
  }, []);

  const persist = (next) => { setSettings(next); saveUserSettings(next); };

  const addWatan = async (raw) => {
    const clean = raw?.trim();
    if (!clean) return;
    setWatanInput('');
    setDropdownOpen(false);
    if (settings.watans.some(w => w.toLowerCase() === clean.toLowerCase())) return;
    persist({ ...settings, watans: [...settings.watans, clean] });
    if (getUrfBoundary(clean)) { setBoundaryStatus(prev => ({ ...prev, [clean]: 'ready' })); return; }
    setBoundaryStatus(prev => ({ ...prev, [clean]: 'pending' }));
    try {
      const boundary = await fetchUrfBoundary(clean);
      if (boundary) {
        try { saveUserCity(clean, boundary); } catch { /* cache unavailable */ }
        setBoundaryStatus(prev => ({ ...prev, [clean]: 'ready' }));
      } else {
        setBoundaryStatus(prev => ({ ...prev, [clean]: 'unavailable' }));
      }
    } catch {
      setBoundaryStatus(prev => ({ ...prev, [clean]: 'unavailable' }));
    }
  };

  const removeWatan = (name) => persist({ ...settings, watans: settings.watans.filter(w => w !== name) });
  const setFrequent = (val) => persist({ ...settings, frequentTraveler: val });
  const resetAll = () => { clearUserSettings(); setSettings({ watans: [], frequentTraveler: 'no' }); setBoundaryStatus({}); };

  const statusLabel = (s) => (s === 'pending' ? 'loading boundary…' : s === 'unavailable' ? '(no data)' : '');

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Your hometowns (Watan) and travel routine — used to determine your verdict in the Qasr tab.</p>
      </div>

      {/* Hometowns (Watan) */}
      <SectionCard>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Your Hometowns (Watan)</h2>
          <button
            type="button"
            onClick={() => setShowWatanInfo(!showWatanInfo)}
            title="What counts as a Watan?"
            data-testid="watan-info"
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold leading-none transition-colors ${showWatanInfo ? 'bg-[var(--accent)] text-white' : 'bg-transparent hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
          >ℹ</button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">A Watan is a place you have made your permanent home — you can add more than one (for example, where you were born and where you now live). While you are inside a Watan, you are not a traveller.</p>
        {showWatanInfo && <InfoPanel data={WATAN_EXPLAINER} />}

        {settings.watans.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-3">
            {settings.watans.map(w => (
              <span key={w} className="flex items-center gap-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-medium rounded-full px-3 py-1.5">
                {w}
                <span className="text-[10px] text-[var(--text-tertiary)]">{statusLabel(boundaryStatus[w])}</span>
                <button
                  type="button"
                  onClick={() => removeWatan(w)}
                  aria-label={`Remove ${w}`}
                  className="w-4 h-4 rounded-full bg-transparent hover:bg-[var(--border-light)] text-[var(--text-tertiary)] hover:text-[var(--danger)] leading-none"
                >×</button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)] mt-3">No hometowns added yet.</p>
        )}

        <div ref={dropdownRef} className="relative mt-3">
          <div className="flex gap-2">
            <input
              role="combobox"
              data-testid="watan-city-search"
              value={watanInput}
              onChange={e => { setWatanInput(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={e => {
                if (e.key === 'Enter') { addWatan(suggestions[0] || watanInput); }
                if (e.key === 'Escape') setDropdownOpen(false);
              }}
              placeholder="Add a hometown — e.g. Houston"
              className="flex-1 h-11 px-3 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)]"
            />
            <button
              type="button"
              onClick={() => addWatan(suggestions[0] || watanInput)}
              className="h-11 px-4 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded-[var(--radius-sm)] transition-colors shrink-0"
            >Add</button>
          </div>
          {dropdownOpen && q && (
            <ul role="listbox" className="absolute z-[1000] w-full mt-1 max-h-52 overflow-auto bg-white border border-[var(--border)] rounded-[var(--radius-sm)] shadow-lg">
              {suggestions.length === 0 && (
                <li className="px-3 py-2.5 text-xs text-[var(--text-tertiary)]">No matching city — you can still add it and we'll try to load its boundary.</li>
              )}
              {suggestions.slice(0, 8).map(city => (
                <li key={city} role="option" onClick={() => addWatan(city)} className="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]">{city}</li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>


      {/* Frequent traveller */}
      <SectionCard>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Frequent traveller</h2>
          <button
            type="button"
            onClick={() => setShowFrequentInfo(!showFrequentInfo)}
            title="What is Katheer al-Safar?"
            data-testid="frequent-info"
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold leading-none transition-colors ${showFrequentInfo ? 'bg-[var(--accent)] text-white' : 'bg-transparent hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
          >ℹ</button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">Katheer al-Safar — someone who travels so regularly that travel is part of their routine (drivers, pilots, crews, daily commuters over 8 farsakhs). They pray in full (Tamam) on routine journeys.</p>
        {showFrequentInfo && <InfoPanel data={FREQUENT_TRAVELER_EXPLAINER} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            onClick={() => setFrequent('yes')}
            className={`text-left px-3.5 py-2.5 rounded-[var(--radius-sm)] text-sm transition-colors border ${settings.frequentTraveler === 'yes' ? 'bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]/40 font-medium' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-transparent'}`}
          >Yes — travel is a regular part of my routine</button>
          <button
            type="button"
            onClick={() => setFrequent('no')}
            className={`text-left px-3.5 py-2.5 rounded-[var(--radius-sm)] text-sm transition-colors border ${settings.frequentTraveler === 'no' ? 'bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]/40 font-medium' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-transparent'}`}
          >No</button>
        </div>
      </SectionCard>

      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-[var(--text-tertiary)]">Saved on this device — your answers never leave it.</p>
        <button type="button" onClick={resetAll} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors">Reset settings</button>
      </div>
    </div>
  );
}

