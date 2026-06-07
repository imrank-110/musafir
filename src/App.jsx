import { useState } from 'react';
import FlightTracker from './components/FlightTracker';
import QasrMap from './components/QasrMap';
import CrescentMoon from './components/CrescentMoon';

function App() {
  const [activeTab, setActiveTab] = useState('flight');

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* ─── Navigation Bar ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-[var(--border)] safe-area-bottom">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CrescentMoon size={28} />
            <span className="text-base font-semibold text-[var(--text-primary)]">Musafir</span>
          </div>
          <div className="flex items-center gap-1 bg-[var(--bg-secondary)] rounded-[var(--radius-md)] p-0.5">
            <button
              onClick={() => setActiveTab('flight')}
              className={`px-3.5 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200 ${
                activeTab === 'flight'
                  ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Flight
            </button>
            <button
              onClick={() => setActiveTab('qasr')}
              className={`px-3.5 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200 ${
                activeTab === 'qasr'
                  ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Qasr
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Content ─────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="fade-in">
          {activeTab === 'flight' ? <FlightTracker /> : <QasrMap />}
        </div>
      </main>

      {/* ─── Bottom Tab Bar (Mobile) ──────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-[var(--border)] safe-area-bottom">
        <div className="flex items-center justify-around h-14 px-3">
          <button
            onClick={() => setActiveTab('flight')}
            className={`flex flex-col items-center justify-center gap-0.5 px-6 py-1.5 rounded-[var(--radius-md)] transition-all duration-200 ${
              activeTab === 'flight'
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            <span className="text-[10px] font-medium">Flight</span>
          </button>
          <button
            onClick={() => setActiveTab('qasr')}
            className={`flex flex-col items-center justify-center gap-0.5 px-6 py-1.5 rounded-[var(--radius-md)] transition-all duration-200 ${
              activeTab === 'qasr'
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
            <span className="text-[10px] font-medium">Qasr</span>
          </button>
        </div>
      </div>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mt-12 md:mt-16 pb-20 md:pb-8">
        <div className="border-t border-[var(--border-light)] pt-8 pb-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <p className="text-xs font-medium text-[var(--text-tertiary)]">
                Calculations based on the edicts (Fatwas) of Ayatollah Syed Ali al-Sistani
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                Prayer time angles: University of Tehran (Fajr: 17.7°, Maghrib: 4.5°, Isha: 14.0°)
              </p>
            </div>
            <div className="text-xs text-[var(--text-tertiary)] text-center md:text-right">
              <p>This app is for educational and guidance purposes only.</p>
              <p>Map data &copy; <a href="https://www.openstreetmap.org/copyright" className="text-[var(--accent)] hover:underline transition-colors" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;