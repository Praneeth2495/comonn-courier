import { useEffect, useState } from 'react';

// iOS Safari never fires beforeinstallprompt and has no programmatic install
// API at all — the only path there is the manual Share > Add to Home Screen
// flow, so we can only detect eligibility (iOS + not already installed) and
// point the customer at those steps ourselves.
function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/**
 * canInstall  - true on Android/desktop Chrome/Edge once the browser decides
 *               the site is installable; call promptInstall() to trigger it.
 * showIosHelp - true on an iPhone/iPad that hasn't installed yet; there's no
 *               button to trigger here, just show the manual steps.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onInstalled() {
      setDeferredPrompt(null);
      setInstalled(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return {
    canInstall: !installed && !!deferredPrompt,
    showIosHelp: !installed && isIos() && !deferredPrompt,
    promptInstall,
  };
}
