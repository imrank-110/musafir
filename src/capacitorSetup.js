import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Initialize Capacitor-specific features for the mobile app.
 * This runs once at app startup.
 */
export async function setupCapacitor() {
  // Only run in Capacitor (native) environment
  const capacitor = window.Capacitor;
  const isCapacitor = typeof capacitor !== 'undefined'
    && typeof capacitor.isNative === 'function'
    && capacitor.isNative();

  if (!isCapacitor) return;

  try {
    // Style the status bar to match the app's warm beige theme
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#f5f0eb' });

    // Make the status bar overlay transparent so content flows behind it
    // (safe-area-inset-top CSS env variable handles the padding)
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    // StatusBar plugin might not be available
    console.warn('StatusBar plugin not available');
  }
}