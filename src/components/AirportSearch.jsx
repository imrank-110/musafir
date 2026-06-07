import { useState, useRef, useEffect, useCallback } from 'react';

export default function AirportSearch({ airports, value, onChange, placeholder, label, disabled }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (value) {
      const airport = airports.find(a => a.code === value);
      setSelectedLabel(airport ? `${airport.code} — ${airport.city}, ${airport.country}` : value);
      setQuery('');
    } else {
      setSelectedLabel('');
      setQuery('');
    }
  }, [value, airports]);

  const filtered = query.trim()
    ? airports.filter(a => {
        const q = query.toLowerCase();
        return a.code.toLowerCase().startsWith(q)
          || a.city.toLowerCase().includes(q)
          || a.country.toLowerCase().includes(q)
          || a.name.toLowerCase().includes(q);
      }).slice(0, 20)
    : [];

  const handleSelect = useCallback((airport) => {
    onChange(airport.code);
    setSelectedLabel(`${airport.code} — ${airport.city}, ${airport.country}`);
    setIsOpen(false);
    setQuery('');
  }, [onChange]);

  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    if (val && !airports.find(a => a.code === val.toUpperCase())) {
      onChange('');
    }
  }, [onChange, airports]);

  const handleFocus = useCallback(() => {
    if (query) setIsOpen(true);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === 'Enter' && filtered.length === 1) {
      handleSelect(filtered[0]);
    }
  }, [filtered, handleSelect]);

  return (
    <div className="relative">
      {label && <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query || selectedLabel}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Type airport code or city...'}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className="w-full h-11 px-3.5 bg-white border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-light)] disabled:bg-[var(--bg-secondary)] disabled:text-[var(--text-tertiary)] transition-all"
        />
        {value && !disabled && (
          <button
            onClick={() => { onChange(''); setQuery(''); setSelectedLabel(''); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-secondary)] transition-colors"
            tabIndex={-1}
            type="button"
          >
            ✕
          </button>
        )}
      </div>
      {isOpen && query && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-popup)] max-h-60 overflow-y-auto scale-in"
        >
          {filtered.map((airport) => (
            <button
              key={airport.code}
              onClick={() => handleSelect(airport)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-[var(--bg-secondary)] transition-colors flex items-center justify-between"
              type="button"
            >
              <div>
                <span className="font-semibold text-sm text-[var(--text-primary)]">{airport.code}</span>
                <span className="text-xs text-[var(--text-secondary)] ml-2">{airport.city}, {airport.country}</span>
              </div>
              <span className="text-[11px] text-[var(--text-tertiary)]">{airport.name}</span>
            </button>
          ))}
        </div>
      )}
      {isOpen && query && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-popup)] p-3 text-sm text-[var(--text-tertiary)] text-center scale-in">
          No airports found for "{query}"
        </div>
      )}
    </div>
  );
}