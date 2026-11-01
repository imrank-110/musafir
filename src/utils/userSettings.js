/**
 * userSettings.js — Watan (hometown) & frequent-traveller settings persistence
 *
 * Settings live ONLY on the user's device (localStorage), on web and in the
 * Capacitor apps alike. The version lives in the key: bump SETTINGS_VERSION
 * whenever the stored shape changes.
 */

export const SETTINGS_VERSION = 1;
export const SETTINGS_STORAGE_KEY = 'musafir:settings:v1';

export const DEFAULT_SETTINGS = { watans: [], frequentTraveler: 'no' };

export function loadUserSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SETTINGS_VERSION || !data.settings) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveUserSettings(settings) {
  try {
    const data = { version: SETTINGS_VERSION, savedAt: Date.now(), settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function clearUserSettings() {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // localStorage unavailable — ignore
  }
}

// ─── "i" explainer copy (Ayatollah Sistani) ────────────────────────────────

export const WATAN_EXPLAINER = {
  title: 'What is a Watan (hometown)?',
  points: [
    "Your Watan is the place you have made — or intend to make — your permanent home.",
    "Your place of birth is only your Watan as long as you still consider it your home and intend to return and live there; once you leave it behind permanently, it is no longer your Watan.",
    "You can genuinely have more than one Watan — for example, the town you were born in (if you still treat it as home) and the city you now live in.",
    "While you are inside your Watan you are a resident: prayers in full (Tamam) — even if you have just returned from a journey.",
  ],
};

export const FREQUENT_TRAVELER_EXPLAINER = {
  title: 'What is Katheer al-Safar (frequent traveller)?',
  points: [
    "A frequent traveller is someone who travels so regularly that travel is part of their routine, not an exception — for example truck, taxi and delivery drivers, pilots and flight crew, train conductors and sailors, or those who go back and forth over 8 farsakhs almost daily.",
    "Per Ayatollah Sistani, a frequent traveller prays the full prayers (Tamam) on their routine journeys — the Qasr concession does not apply.",
    "If such a person takes a journey outside that routine (for example a pure leisure trip), they are judged as a normal traveller again and Qasr can apply.",
    "These are general guidelines. For your exact situation, please confirm with the authority you follow.",
  ],
};
