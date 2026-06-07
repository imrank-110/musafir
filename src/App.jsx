import { useState, useEffect, useRef } from "react";
import "./index.css";

/* ─────────────────────────────────────────
   Musafir — Redesigned App Shell
   Stack: React 19, Tailwind CSS v4, Vite
───────────────────────────────────────── */

// ── Icons (inline SVG helpers) ────────────
const Icon = ({ d, size = 22, stroke = "currentColor", fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
    stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  home:     "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  prayer:   "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z M12 6v6l4 2",
  map:      "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16",
  qibla:    "M12 2a10 10 0 100 20A10 10 0 0012 2z M12 8v4l3 3",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
};

// ── Prayer times data ────────────────────
const PRAYERS = [
  { id: "fajr",    name: "Fajr",    time: "4:58", hour: 5  },
  { id: "dhuhr",   name: "Dhuhr",   time: "1:18", hour: 13 },
  { id: "asr",     name: "Asr",     time: "4:52", hour: 16 },
  { id: "maghrib", name: "Maghrib", time: "8:19", hour: 20 },
  { id: "isha",    name: "Isha",    time: "9:45", hour: 21 },
  { id: "jumuah",  name: "Jumuʿah", time: "1:30", hour: 13 },
];

function getActivePrayer() {
  const h = new Date().getHours();
  if (h >= 21) return "isha";
  if (h >= 20) return "maghrib";
  if (h >= 16) return "asr";
  if (h >= 13) return "dhuhr";
  if (h >= 5)  return "fajr";
  return "fajr";
}

// ── Feature data ────────────────────────
const FEATURES = [
  { icon: "🕌", title: "Prayer Times",    color: "emerald", desc: "Accurate Salah schedules worldwide. Supports ISNA, MWL, Egyptian and all major calculation methods." },
  { icon: "🧭", title: "Qibla Finder",    color: "gold",    desc: "Precise Qibla direction using your device compass and GPS — works fully offline." },
  { icon: "🗺️", title: "Halal Map",       color: "emerald", desc: "Discover halal restaurants, mosques, and Islamic centres near you, wherever you travel." },
  { icon: "📋", title: "Smart Itinerary", color: "gold",    desc: "AI-assisted trip planning that factors in prayer times, Jumu'ah, Ramadan, and Hajj/Umrah rituals." },
  { icon: "📖", title: "Qurʾān & Duʿā",  color: "emerald", desc: "Offline access to the full Qurʾān, travel supplications, and daily adhkār." },
  { icon: "🌙", title: "Hijri Calendar",  color: "gold",    desc: "Integrated Islamic calendar with important dates, fasting schedules, and Ramadan countdowns." },
];

// ── Itinerary data ───────────────────────
const ITINERARY = [
  { dot: "gold",    title: "Day 1–2 · Arrival in Madinah",    desc: "Visit Masjid an-Nabawi, Rawdah ziyarah, settle near the Prophet's mosque." },
  { dot: "emerald", title: "Day 3–4 · Journey to Makkah",     desc: "Enter in Ihrām, perform Tawaf al-Qudum, Saʿi between Ṣafā and Marwah, and Ḥalq." },
  { dot: "gold",    title: "Day 5–7 · Makkah Immersion",      desc: "Daily Tawaf, Tahajjud in the Ḥaram, visit Jabal al-Nour and Cave of Ḥirāʾ." },
  { dot: "muted",   title: "Day 8–10 · Return & Reflection",  desc: "Final Tawaf al-Widāʿ, journaling your spiritual reflections, and departure." },
];

// ─────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 34, height: 34, background: "var(--color-emerald)", borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
      }}>🕌</div>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 600, lineHeight: 1.1, color: "var(--color-ink)" }}>
          Musafir
        </div>
        <div style={{ fontSize: "0.6rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-muted)" }}>
          Islamic Travel
        </div>
      </div>
    </div>
  );
}

function NavBar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "home",     label: "Home",    icon: ICONS.home },
    { id: "prayer",   label: "Prayer",  icon: ICONS.prayer },
    { id: "map",      label: "Map",     icon: ICONS.map },
    { id: "qibla",    label: "Qibla",   icon: ICONS.qibla },
    { id: "settings", label: "More",    icon: ICONS.settings },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button key={t.id}
          className={`bottom-nav-item${activeTab === t.id ? " active" : ""}`}
          onClick={() => setActiveTab(t.id)}
          style={{ background: "none", border: "none", fontFamily: "var(--font-body)" }}
        >
          <Icon d={t.icon} size={22} stroke="currentColor" />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ── HOME SCREEN ──────────────────────────
function HomeScreen() {
  const activePrayer = getActivePrayer();
  const revealRefs = useRef([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("revealed"); }),
      { threshold: 0.1 }
    );
    revealRefs.current.forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const addRef = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };

  return (
    <div style={{ paddingBottom: 100 }}>

      {/* ── Sticky Header ── */}
      <header className="glass-nav" style={{
        position: "sticky", top: 0, zIndex: 40,
        padding: "0 1.25rem", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Logo />
        <button className="btn-primary" style={{ padding: "0.45rem 1.1rem", fontSize: "0.78rem" }}>
          Sign In
        </button>
      </header>

      {/* ── Hero ── */}
      <section style={{ padding: "3rem 1.5rem 2rem", position: "relative", overflow: "hidden" }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", top: -60, right: -60,
          width: 340, height: 340,
          background: "radial-gradient(ellipse, rgba(45,90,78,0.1) 0%, transparent 70%)",
          borderRadius: "50%", pointerEvents: "none",
        }} />

        <div className="animate-fade-up" style={{
          fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase",
          color: "var(--color-gold)", fontWeight: 500,
          display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem",
        }}>
          <span style={{ width: 22, height: 1, background: "var(--color-gold)", display: "block" }} />
          Your Sacred Journey
        </div>

        <h1 className="animate-fade-up-1 font-display" style={{
          fontSize: "clamp(2.4rem, 9vw, 3.4rem)", fontWeight: 300,
          lineHeight: 1.08, marginBottom: "1rem", letterSpacing: "-0.01em",
        }}>
          Travel with{" "}
          <em style={{ fontStyle: "italic", color: "var(--color-gold)" }}>purpose,</em>
          <br />arrive with peace
        </h1>

        <p className="animate-fade-up-2" style={{
          fontSize: "0.95rem", lineHeight: 1.72, color: "var(--color-muted)",
          marginBottom: "1.8rem", fontWeight: 300,
        }}>
          Your intelligent companion for Islamic travel — prayer times, Qibla,
          halal maps and personalised itineraries, all in one place.
        </p>

        <div className="animate-fade-up-3" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-primary">Plan My Trip ↗</button>
          <button className="btn-ghost">Explore Features</button>
        </div>
      </section>

      {/* ── Today's Prayer Card ── */}
      <section style={{ padding: "0 1.25rem 2rem" }}>
        <div className="surface animate-fade-up-3" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.1rem" }}>
            <div>
              <div style={{ fontSize: "0.66rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: 2 }}>
                Today's Prayer Times
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--color-ink-soft)" }}>Houston, TX</div>
            </div>
            <div className="float-badge" style={{ fontSize: "0.72rem" }}>
              <span className="animate-pulse-dot" style={{ width: 7, height: 7, background: "#4caf8a", borderRadius: "50%", display: "block" }} />
              Live
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginBottom: "1.1rem" }}>
            {PRAYERS.map(p => (
              <div key={p.id} className={`prayer-item${activePrayer === p.id ? " active" : ""}`}>
                <div className="prayer-name">{p.name}</div>
                <div className="prayer-time">{p.time}</div>
              </div>
            ))}
          </div>

          {/* Qibla strip */}
          <div className="qibla-strip">
            <div style={{
              width: 38, height: 38, background: "var(--color-gold)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, flexShrink: 0,
            }}>🧭</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-ink)" }}>Qibla Direction</div>
              <div style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>Toward the Kaʿbah · Makkah</div>
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", fontWeight: 600, color: "var(--color-gold)" }}>48°</div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: "1rem 1.25rem 2rem", background: "var(--color-card)", borderTop: "1px solid var(--color-border)", borderBottom: "1px solid var(--color-border)" }}>
        <div ref={addRef} className="reveal" style={{ marginBottom: "1.8rem" }}>
          <div className="section-label">What We Offer</div>
          <h2 className="font-display" style={{ fontSize: "clamp(1.8rem, 7vw, 2.4rem)", fontWeight: 300, lineHeight: 1.15 }}>
            Every tool a <em style={{ fontStyle: "italic", color: "var(--color-gold)" }}>Muslim traveller</em> needs
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem" }}>
          {FEATURES.map((f, i) => (
            <div key={f.title} ref={addRef} className="reveal feature-card" style={{ transitionDelay: `${i * 0.06}s` }}>
              <div style={{
                width: 40, height: 40, borderRadius: "var(--radius-icon)",
                background: f.color === "gold" ? "rgba(184,147,58,0.12)" : "rgba(45,90,78,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, marginBottom: "0.9rem",
              }}>
                {f.icon}
              </div>
              <div className="font-display" style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-ink)", marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "var(--color-muted)" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Quote ── */}
      <section ref={addRef} className="quote-emerald reveal" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
        <div style={{ fontSize: "1.3rem", color: "rgba(255,255,255,0.3)", marginBottom: "0.5rem", direction: "rtl", letterSpacing: "0.05em" }}>
          سَافِرُوا تَصِحُّوا وَتَغْنَمُوا
        </div>
        <blockquote className="font-display" style={{
          fontSize: "clamp(1.2rem, 5vw, 1.7rem)", fontStyle: "italic", fontWeight: 300,
          color: "rgba(255,255,255,0.92)", lineHeight: 1.4, marginBottom: "0.8rem",
        }}>
          "Travel, for it brings health and provides wealth."
        </blockquote>
        <cite style={{ fontSize: "0.7rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
          — A saying attributed to the Prophet Muhammad ﷺ
        </cite>
      </section>

      {/* ── Trip Planner ── */}
      <section style={{ padding: "2rem 1.25rem" }}>
        <div ref={addRef} className="reveal" style={{ marginBottom: "1.5rem" }}>
          <div className="section-label">Plan Ahead</div>
          <h2 className="font-display" style={{ fontSize: "clamp(1.7rem, 6vw, 2.2rem)", fontWeight: 300, lineHeight: 1.15 }}>
            Build your <em style={{ fontStyle: "italic", color: "var(--color-gold)" }}>ideal trip</em>
          </h2>
        </div>

        <div ref={addRef} className="reveal surface" style={{ padding: "1.5rem", marginBottom: "1.2rem" }}>
          <div className="font-display" style={{ fontSize: "1.15rem", marginBottom: "1.2rem", color: "var(--color-ink)" }}>Trip Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", marginBottom: "0.8rem" }}>
            <div>
              <label className="input-label">From</label>
              <input type="text" className="input-field" placeholder="Houston, TX" />
            </div>
            <div>
              <label className="input-label">Destination</label>
              <input type="text" className="input-field" placeholder="Makkah" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", marginBottom: "0.8rem" }}>
            <div>
              <label className="input-label">Departure</label>
              <input type="date" className="input-field" />
            </div>
            <div>
              <label className="input-label">Return</label>
              <input type="date" className="input-field" />
            </div>
          </div>
          <div style={{ marginBottom: "0.8rem" }}>
            <label className="input-label">Trip Type</label>
            <select className="input-field">
              <option>Umrah</option>
              <option>Hajj</option>
              <option>Leisure (Halal)</option>
              <option>Business</option>
            </select>
          </div>
          <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            Generate Itinerary →
          </button>
        </div>

        {/* Sample itinerary */}
        <div style={{ marginBottom: "0.5rem" }}>
          <div className="section-label" style={{ marginBottom: "0.6rem" }}>Sample Umrah Journey</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {ITINERARY.map((item, i) => (
            <div key={i} ref={addRef} className="reveal surface" style={{
              padding: "1.1rem 1.3rem", display: "flex", gap: "0.9rem", alignItems: "flex-start",
              transitionDelay: `${i * 0.07}s`,
            }}>
              <span style={{
                width: 9, height: 9, borderRadius: "50%", marginTop: 6, flexShrink: 0,
                background: item.dot === "gold" ? "var(--color-gold)" : item.dot === "emerald" ? "var(--color-emerald)" : "var(--color-muted)",
              }} />
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 500, color: "var(--color-ink)", marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: "0.79rem", color: "var(--color-muted)", lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}

// ── PRAYER SCREEN ────────────────────────
function PrayerScreen() {
  const activePrayer = getActivePrayer();
  const fullPrayers = [
    { name: "Fajr",    time: "4:58 AM",  status: "past" },
    { name: "Sunrise", time: "6:24 AM",  status: "past" },
    { name: "Dhuhr",   time: "1:18 PM",  status: "past" },
    { name: "Asr",     time: "4:52 PM",  status: "current" },
    { name: "Maghrib", time: "8:19 PM",  status: "upcoming" },
    { name: "Isha",    time: "9:45 PM",  status: "upcoming" },
  ];

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div className="glass-nav" style={{ padding: "1rem 1.25rem 0.8rem" }}>
        <div className="section-label" style={{ marginBottom: 2 }}>Ṣalāh Times</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 300 }}>Today's Schedule</div>
        <div style={{ fontSize: "0.82rem", color: "var(--color-muted)", marginTop: 4 }}>Houston, TX · Sunday, 7 June 2026</div>
      </div>

      <div style={{ padding: "1.5rem 1.25rem" }}>
        {fullPrayers.map((p, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "1rem 1.2rem", marginBottom: "0.6rem",
            borderRadius: 14,
            background: p.status === "current" ? "var(--color-emerald)" : "var(--color-card)",
            border: `1px solid ${p.status === "current" ? "var(--color-emerald)" : "var(--color-border)"}`,
            boxShadow: p.status === "current" ? "0 8px 24px rgba(45,90,78,0.25)" : "none",
          }}>
            <div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 600,
                color: p.status === "current" ? "#fff" : "var(--color-ink)",
              }}>{p.name}</div>
              {p.status === "current" && (
                <div style={{ fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
                  Current
                </div>
              )}
            </div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 400,
              color: p.status === "current" ? "#fff" : p.status === "past" ? "var(--color-muted)" : "var(--color-ink)",
            }}>{p.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAP SCREEN ───────────────────────────
function MapScreen() {
  return (
    <div style={{ padding: "0 0 100px" }}>
      <div className="glass-nav" style={{ padding: "1rem 1.25rem 0.8rem" }}>
        <div className="section-label" style={{ marginBottom: 2 }}>Halal Map</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 300 }}>Near You</div>
      </div>

      <div style={{ padding: "1rem 1.25rem" }}>
        <div style={{ position: "relative", marginBottom: "1rem" }}>
          <input type="text" className="input-field" placeholder="Search mosques, halal food, prayer rooms…" style={{ paddingLeft: "2.6rem" }} />
          <span style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", pointerEvents: "none" }}>🔍</span>
        </div>

        <div style={{
          height: 260, borderRadius: 16,
          background: "linear-gradient(135deg, var(--color-emerald-pale) 0%, var(--color-gold-pale) 100%)",
          border: "1px solid var(--color-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: "1rem",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ textAlign: "center", color: "var(--color-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🗺️</div>
            <div style={{ fontSize: "0.85rem" }}>Map loads with your location</div>
            <div style={{ fontSize: "0.75rem", marginTop: 4 }}>Enable location for nearby results</div>
          </div>
        </div>

        {/* Nearby cards */}
        {[
          { icon: "🕌", name: "Islamic Society of Greater Houston", dist: "0.3 mi", tag: "Mosque" },
          { icon: "🍽️", name: "Kasra Persian Restaurant",          dist: "0.6 mi", tag: "Halal Food" },
          { icon: "🕌", name: "Masjid Al-Salam",                    dist: "1.1 mi", tag: "Mosque" },
        ].map((place, i) => (
          <div key={i} className="surface" style={{ padding: "1rem 1.1rem", marginBottom: "0.7rem", display: "flex", alignItems: "center", gap: "0.9rem" }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--color-sand)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
              {place.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 500, color: "var(--color-ink)" }}>{place.name}</div>
              <div style={{ fontSize: "0.74rem", color: "var(--color-muted)" }}>{place.tag}</div>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--color-gold)", fontWeight: 500 }}>{place.dist}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── QIBLA SCREEN ─────────────────────────
function QiblaScreen() {
  const [angle, setAngle] = useState(48);

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div className="glass-nav" style={{ padding: "1rem 1.25rem 0.8rem" }}>
        <div className="section-label" style={{ marginBottom: 2 }}>Direction</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 300 }}>Qibla Finder</div>
      </div>

      <div style={{ padding: "2rem 1.25rem", textAlign: "center" }}>
        {/* Compass */}
        <div style={{ position: "relative", width: 220, height: 220, margin: "0 auto 2rem" }}>
          <div style={{
            position: "absolute", inset: 0,
            border: "2px solid var(--color-border)",
            borderRadius: "50%",
          }} />
          <div style={{
            position: "absolute", inset: 14,
            border: "1px solid var(--color-border)",
            borderRadius: "50%",
            background: "var(--color-card)",
            boxShadow: "var(--shadow-card)",
          }} />
          {/* Needle */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            transform: `rotate(${angle}deg)`,
            transition: "transform 0.5s ease",
          }}>
            <div style={{
              width: 4, height: 80, background: "linear-gradient(to bottom, var(--color-emerald) 50%, var(--color-gold) 50%)",
              borderRadius: 2, position: "absolute", top: "50%", left: "50%",
              transformOrigin: "bottom center", transform: "translateX(-50%)",
            }} />
          </div>
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%", background: "var(--color-emerald)",
              border: "2px solid white", zIndex: 2,
            }} />
          </div>
          {/* Cardinal labels */}
          {[["N","top","50%"], ["S","bottom","50%"], ["E","50%","right"], ["W","50%","left"]].map(([l, t, r]) => (
            <div key={l} style={{
              position: "absolute",
              top: t === "top" ? 6 : t === "bottom" ? "auto" : "50%",
              bottom: t === "bottom" ? 6 : "auto",
              left: r === "left" ? 6 : r === "50%" ? "50%" : "auto",
              right: r === "right" ? 6 : "auto",
              transform: r === "50%" ? "translateX(-50%)" : t === "50%" ? "translateY(-50%)" : "none",
              fontSize: "0.7rem", fontWeight: 600, color: l === "N" ? "var(--color-emerald)" : "var(--color-muted)",
              letterSpacing: "0.05em",
            }}>{l}</div>
          ))}
        </div>

        <div style={{ fontFamily: "var(--font-display)", fontSize: "3.5rem", fontWeight: 300, color: "var(--color-gold)", marginBottom: "0.2rem" }}>
          {angle}°
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--color-muted)", marginBottom: "0.3rem" }}>Northeast of Houston</div>
        <div style={{ fontSize: "0.78rem", color: "var(--color-emerald)", letterSpacing: "0.1em" }}>Toward the Kaʿbah · Makkah al-Mukarramah</div>

        <div className="surface" style={{ padding: "1rem 1.2rem", marginTop: "2rem", textAlign: "left" }}>
          <div style={{ fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.5rem" }}>Location</div>
          <div style={{ fontSize: "0.9rem", color: "var(--color-ink)" }}>Houston, Texas</div>
          <div style={{ fontSize: "0.78rem", color: "var(--color-muted)", marginTop: 2 }}>29.7604° N, 95.3698° W</div>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS SCREEN ──────────────────────
function SettingsScreen() {
  const rows = [
    { icon: "🌙", label: "Calculation Method", value: "ISNA" },
    { icon: "⏰", label: "Adhan Notifications", value: "On" },
    { icon: "🗣️", label: "Language",            value: "English" },
    { icon: "📅", label: "Calendar",             value: "Hijri + Gregorian" },
    { icon: "🌐", label: "Offline Mode",         value: "Enabled" },
  ];

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div className="glass-nav" style={{ padding: "1rem 1.25rem 0.8rem" }}>
        <div className="section-label" style={{ marginBottom: 2 }}>Preferences</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 300 }}>Settings</div>
      </div>

      <div style={{ padding: "1.5rem 1.25rem" }}>
        {rows.map((r, i) => (
          <div key={i} className="surface" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.95rem 1.1rem", marginBottom: "0.6rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
              <span style={{ fontSize: 18 }}>{r.icon}</span>
              <span style={{ fontSize: "0.88rem", color: "var(--color-ink)" }}>{r.label}</span>
            </div>
            <span style={{ fontSize: "0.82rem", color: "var(--color-muted)" }}>{r.value} ›</span>
          </div>
        ))}

        <div style={{ marginTop: "2rem", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--color-ink)", marginBottom: 4 }}>Musafir ☽</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>Version 1.0.0 · Islamic Travel Companion</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("home");

  const screens = {
    home:     <HomeScreen />,
    prayer:   <PrayerScreen />,
    map:      <MapScreen />,
    qibla:    <QiblaScreen />,
    settings: <SettingsScreen />,
  };

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", position: "relative" }}>
      {screens[activeTab]}
      <NavBar activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
