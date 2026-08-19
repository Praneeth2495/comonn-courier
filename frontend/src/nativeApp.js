import { Capacitor } from '@capacitor/core';

// This same web app is loaded both as the plain website and, unmodified,
// inside the Capacitor native shell (capacitor.config.json points server.url
// at the live site rather than bundling a copy — see that file's comment).
// isNativePlatform() is false in a normal browser tab, so all of this is a
// no-op there; it only does anything when actually running inside the app.
export async function initNativeApp() {
  if (!Capacitor.isNativePlatform()) return;

  const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);

  await StatusBar.setStyle({ style: Style.Dark }); // light icons/text on our navy header
  await StatusBar.setBackgroundColor({ color: '#0E1B3D' });
  await SplashScreen.hide();
}
