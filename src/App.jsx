import { useState } from 'react';
import FlightTracker from './components/FlightTracker';
import QasrMap from './components/QasrMap';

function App() {
  const [activeTab, setActiveTab] = useState('flight');

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Navigation Bar */}
      <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">🕋</span>
              <div>
                <h1 className="text-xl font-bold text-white">Musafir</h1>
                <p className="text-xs text-gray-400">Islamic Travel Companion</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('flight')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'flight'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                ✈️ Flight Tracker
              </button>
              <button
                onClick={() => setActiveTab('qasr')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'qasr'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                🗺️ Qasr Map
              </button>
            </div>

            {/* Status Indicator */}
            <div className="hidden md:flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
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
      <footer className="bg-gray-800/50 border-t border-gray-700/50 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <h3 className="text-sm font-bold text-white">Musafir — Islamic Travel Companion</h3>
              <p className="text-xs text-gray-500 mt-1">
                Calculations based on the edicts (Fatwas) of Ayatollah Syed Ali al-Sistani
                <br />
                Prayer time angles: University of Tehran (Fajr: 17.7°, Maghrib: 4.5°, Isha: 14.0°)
              </p>
            </div>
            <div className="text-xs text-gray-600 text-center">
              <p>This app is for educational and guidance purposes only.</p>
              <p>Always verify with a qualified Islamic authority.</p>
              <p className="mt-1">Map data © <a href="https://www.openstreetmap.org/copyright" className="text-emerald-500 hover:underline" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;