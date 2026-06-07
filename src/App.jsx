import { useState } from 'react';
import FlightTracker from './components/FlightTracker';
import QasrMap from './components/QasrMap';
import CrescentMoon, { MiniCrescent } from './components/CrescentMoon';

function App() {
  const [activeTab, setActiveTab] = useState('flight');

  return (
    <div className="min-h-screen bg-[#f5f0eb] relative overflow-hidden">
      {/* ─── Fluid Background ──────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#f5f0eb] via-[#ede6dc] to-[#f5f0eb]" />
        
        {/* Blob 1 — Warm beige */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[#e8dccc]/40 rounded-full blur-[120px] animate-blob" />
        
        {/* Blob 2 — Cream */}
        <div className="absolute top-[30%] right-[-15%] w-[50%] h-[50%] bg-[#f0e8dd]/40 rounded-full blur-[100px] animate-blob-delayed" />
        
        {/* Blob 3 — Taupe */}
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-[#dcd0c4]/30 rounded-full blur-[80px] animate-blob-slow" />
        
        {/* Blob 4 — Light sand */}
        <div className="absolute top-[60%] left-[-5%] w-[30%] h-[30%] bg-[#f2ebe3]/30 rounded-full blur-[90px] animate-blob" style={{ animationDelay: '-10s' }} />
        
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(200,180,160,0.05)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(180,160,140,0.05)_0%,transparent_50%)]" />
      </div>

      {/* ─── Content Layer ──────────────────────────────────────────────────── */}
      <div className="relative z-10 pb-16 md:pb-0">
        {/* Navigation Bar */}
        <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-[#e0d5c8]">
          <div className="max-w-7xl mx-auto px-3 md:px-4">
            <div className="flex items-center justify-between h-14 md:h-16">
              {/* Logo — compact on mobile */}
              <div className="flex items-center gap-2 md:gap-3">
                <CrescentMoon size={32} />
                <div className="hidden sm:block">
                  <h1 className="text-lg md:text-xl font-bold text-[#3d352e]">Musafir</h1>
                  <p className="text-[10px] md:text-xs text-[#8a7a6a]">Islamic Travel Companion</p>
                </div>
                <div className="sm:hidden">
                  <h1 className="text-base font-bold text-[#3d352e]">Musafir</h1>
                </div>
              </div>

              {/* Tab Navigation — compact on mobile */}
              <div className="flex gap-1 bg-[#ede6dc]/50 backdrop-blur-sm rounded-lg md:rounded-xl p-0.5 md:p-1 border border-[#e0d5c8]">
                <button
                  onClick={() => setActiveTab('flight')}
                  className={`px-2.5 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg text-[11px] md:text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                    activeTab === 'flight'
                      ? 'bg-gradient-to-r from-[#c4a882] to-[#b89978] text-white shadow-lg shadow-[#c4a882]/30'
                      : 'text-[#8a7a6a] hover:text-[#3d352e] hover:bg-white/50'
                  }`}
                >
                  Flight
                </button>
                <button
                  onClick={() => setActiveTab('qasr')}
                  className={`px-2.5 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg text-[11px] md:text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                    activeTab === 'qasr'
                      ? 'bg-gradient-to-r from-[#c4a882] to-[#b89978] text-white shadow-lg shadow-[#c4a882]/30'
                      : 'text-[#8a7a6a] hover:text-[#3d352e] hover:bg-white/50'
                  }`}
                >
                  Qasr Map
                </button>
              </div>

              {/* Status Indicator — hidden on mobile */}
              <div className="hidden md:flex items-center gap-2 text-xs text-[#8a7a6a]">
                <span className="w-2 h-2 bg-[#c4a882] rounded-full animate-pulse shadow-lg shadow-[#c4a882]/50"></span>
                Ayatollah Sistani
              </div>
            </div>
          </div>
        </nav>

        {/* Tab Content */}
        <div>
          {activeTab === 'flight' ? <FlightTracker /> : <QasrMap />}
        </div>

        {/* Bottom Tab Bar — mobile only */}
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/80 backdrop-blur-xl border-t border-[#e0d5c8] safe-area-bottom">
          <div className="flex items-center justify-around h-14 px-2">
            <button
              onClick={() => setActiveTab('flight')}
              className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-lg transition-all ${
                activeTab === 'flight' ? 'text-[#c4a882]' : 'text-[#a09080]'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              <span className="text-[10px] font-medium">Flight</span>
            </button>
            <button
              onClick={() => setActiveTab('qasr')}
              className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-lg transition-all ${
                activeTab === 'qasr' ? 'text-[#c4a882]' : 'text-[#a09080]'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <span className="text-[10px] font-medium">Qasr</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-white/40 backdrop-blur-xl border-t border-[#e0d5c8] mt-8">
          <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
              <div className="text-center md:text-left">
                <div className="flex items-center gap-2 mb-2 justify-center md:justify-start">
                  <MiniCrescent size={24} />
                  <h3 className="text-xs md:text-sm font-bold text-[#3d352e]">Musafir — Islamic Travel Companion</h3>
                </div>
                <p className="text-[10px] md:text-xs text-[#8a7a6a] mt-1">
                  Calculations based on the edicts (Fatwas) of Ayatollah Syed Ali al-Sistani
                  <br />
                  Prayer time angles: University of Tehran (Fajr: 17.7°, Maghrib: 4.5°, Isha: 14.0°)
                </p>
              </div>
              <div className="text-[10px] md:text-xs text-[#a09080] text-center md:text-right">
                <p>This app is for educational and guidance purposes only.</p>
                <p>Always verify with a qualified Islamic authority.</p>
                <p className="mt-1">Map data &copy; <a href="https://www.openstreetmap.org/copyright" className="text-[#c4a882] hover:underline transition-colors" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
