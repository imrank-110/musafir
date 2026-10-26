import { useState } from 'react';
import FlightTracker from './components/FlightTracker';
import QasrMap from './components/QasrMap';
import CrescentMoon from './components/CrescentMoon';

function App() {
  const [activeTab, setActiveTab] = useState('flight');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-sand)', color: 'var(--color-ink)' }}>
      {/* ── Navigation Bar ── */}
      <nav className="glass-nav" style={{
        position: 'sticky', top: 0, zIndex: 50,
        padding: '0 1.25rem', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CrescentMoon size={28} />
          <span className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-ink)' }}>Musafir</span>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--color-sand-dark)', borderRadius: '100px', padding: 3 }}>
          <button
            onClick={() => setActiveTab('flight')}
            style={{
              padding: '0.35rem 1rem', borderRadius: '100px', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 500, fontFamily: 'var(--font-body)',
              background: activeTab === 'flight' ? '#fff' : 'transparent',
              color: activeTab === 'flight' ? 'var(--color-ink)' : 'var(--color-muted)',
              boxShadow: activeTab === 'flight' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            Flight
          </button>
          <button
            onClick={() => setActiveTab('qasr')}
            style={{
              padding: '0.35rem 1rem', borderRadius: '100px', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 500, fontFamily: 'var(--font-body)',
              background: activeTab === 'qasr' ? '#fff' : 'transparent',
              color: activeTab === 'qasr' ? 'var(--color-ink)' : 'var(--color-muted)',
              boxShadow: activeTab === 'qasr' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            Qasr
          </button>
        </div>
      </nav>

      {/* ── Content ── */}
      <main style={{ maxWidth: '1120px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div className="fade-in">
          {activeTab === 'flight' ? <FlightTracker /> : <QasrMap />}
        </div>
      </main>

      {/* ── Bottom Tab Bar (Mobile) ── */}
      <div className="bottom-nav" style={{ display: 'flex', md: { display: 'none' } }}>
        <button
          onClick={() => setActiveTab('flight')}
          className={`bottom-nav-item${activeTab === 'flight' ? ' active' : ''}`}
          style={{ background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          <span>Flight</span>
        </button>
        <button
          onClick={() => setActiveTab('qasr')}
          className={`bottom-nav-item${activeTab === 'qasr' ? ' active' : ''}`}
          style={{ background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
          <span>Qasr</span>
        </button>
      </div>

      {/* ── Footer ── */}
      <footer className="safe-bottom" style={{ marginTop: '3rem', paddingBottom: '5rem' }}>
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '1.5rem 1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--color-muted)' }}>
            <p style={{ fontWeight: 500 }}>
              Calculations based on the edicts (Fatwas) of Ayatollah Syed Ali al-Sistani
            </p>
            <p>Prayer time angles: University of Tehran (Fajr: 17.7°, Maghrib: 4.5°, Isha: 14.0°)</p>
            <p>This app is for educational and guidance purposes only.</p>
            <p>Map data &copy; <a href="https://www.openstreetmap.org/copyright" style={{ color: 'var(--color-emerald)' }} target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;