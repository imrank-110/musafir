import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Searchable airport input with autocomplete dropdown.
 * Filters airports by code, city, or country as you type.
 */
export default function AirportSearch({ airports, value, onChange, placeholder, label, disabled }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Update the displayed label when value changes externally
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

  // Filter airports based on query
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
    // Clear selection if user is typing something new
    if (val && !airports.find(a => a.code === val.toUpperCase())) {
      onChange('');
    }
  }, [onChange, airports]);

  const handleFocus = useCallback(() => {
    if (query) setIsOpen(true);
  }, [query]);

  // Close dropdown on outside click
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

  // Keyboard navigation
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
      <label className="block text-sm text-[#8a7a6a] mb-1">{label}</label>
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
          className="w-full px-3 py-2.5 bg-white border border-[#e0d5c8] rounded-lg text-[#3d352e] placeholder-[#a09080] focus:outline-none focus:border-[#c4a882] focus:ring-2 focus:ring-[#c4a882]/20 transition-all disabled:bg-[#f5f0eb] disabled:text-[#a09080]"
        />
        {/* Clear button */}
        {value && !disabled && (
          <button
            onClick={() => { onChange(''); setQuery(''); setSelectedLabel(''); inputRef.current?.focus(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[#a09080] hover:text-[#8a7a6a] rounded-full hover:bg-[#ede6dc] transition-colors"
            tabIndex={-1}
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && query && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-[#e0d5c8] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] max-h-60 overflow-y-auto"
        >
          {filtered.map((airport) => (
            <button
              key={airport.code}
              onClick={() => handleSelect(airport)}
              className="w-full text-left px-3 py-2.5 hover:bg-[#f5f0eb] transition-colors border-b border-[#e0d5c8]/50 last:border-b-0 flex items-center justify-between"
              type="button"
            >
              <div>
                <span className="font-bold text-[#3d352e]">{airport.code}</span>
                <span className="text-[#8a7a6a] text-sm ml-2">{airport.city}, {airport.country}</span>
              </div>
              <span className="text-xs text-[#a09080]">{airport.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && query && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#e0d5c8] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] p-3 text-sm text-[#a09080] text-center">
          No airports found for "{query}"
        </div>
      )}
    </div>
  );
}