import { useState } from 'react';
import FlightTracker from './components/FlightTracker';
import QasrMap from './components/QasrMap';

function App() {
  const [activeTab, setActiveTab] = useState('flight');

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      {/* ─── Fluid Liquid Glass Background ─────────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Deep base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950" />
        
        {/* Blob 1 — Indigo, large, slow */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-900/30 rounded-full blur-[120px] animate-blob" />
        
        {/* Blob 2 — Teal, medium, delayed */}
        <div className="absolute top-[30%] right-[-15%] w-[50%] h-[50%] bg-teal-950/30 rounded-full blur-[100px] animate-blob-delayed" />
        
        {/* Blob 3 — Midnight blue, small, slow */}
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-blue-950/25 rounded-full blur-[80px] animate-blob-slow" />
        
        {/* Blob 4 — Emerald accent, small */}
        <div className="absolute top-[60%] left-[-5%] w-[30%] h-[30%] bg-emerald-950/20 rounded-full blur-[90px] animate-blob" style={{ animationDelay: '-10s' }} />
        
        {/* Subtle radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.03)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(99,102,241,0.03)_0%,transparent_50%)]" />
      </div>

      {/* ─── Content Layer ──────────────────────────────────────────────────── */}
      <div className="relative z-10">
        {/* Navigation Bar */}
        <nav className="sticky top-0 z-50 bg-slate-900/60 backdrop-blur-xl border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-lg shadow-lg shadow-emerald-500/20">
                  🕋
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">Musafir</h1>
                  <p className="text-xs text-gray-400">Islamic Travel Companion</p>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex gap-1 bg-slate-800/50 backdrop-blur-sm rounded-xl p-1 border border-white/5">
                <button
                  onClick={() => setActiveTab('flight')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${
                    activeTab === 'flight'
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  ✈️ Flight Tracker
                </button>
                <button
                  onClick={() => setActiveTab('qasr')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${
                    activeTab === 'qasr'
                      ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  🗺️ Qasr Map
                </button>
              </div>

              {/* Status Indicator */}
              <div className="hidden md:flex items-center gap-2 text-xs text-gray-500">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></span>
                Ayatollah Sistani
              </div>
            </div>
          </div>
        </nav>

        {/* Tab Content */}
        <div>
          {activeTab === 'flight' ? <FlightTracker /> : <QasrMap />}
        </div>

        {/* Footer */}
        <footer className="bg-slate-900/40 backdrop-blur-xl border-t border-white/5 mt-8">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-sm shadow-lg shadow-emerald-500/20">
                    🕋
                  </div>
                  <h3 className="text-sm font-bold text-white">Musafir — Islamic Travel Companion</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Calculations based on the edicts (Fatwas) of Ayatollah Syed Ali al-Sistani
                  <br />
                  Prayer time angles: University of Tehran (Fajr: 17.7°, Maghrib: 4.5°, Isha: 14.0°)
                </p>
              </div>
              <div className="text-xs text-gray-600 text-center md:text-right">
                <p>This app is for educational and guidance purposes only.</p>
                <p>Always verify with a qualified Islamic authority.</p>
                <p className="mt-1">Map data © <a href="https://www.openstreetmap.org/copyright" className="text-emerald-500 hover:underline transition-colors" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;