import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import { initNativeApp } from './nativeApp';
import './styles/theme.css';

// Lightweight error-only monitoring — no performance/session-replay
// tracing, to stay within the free tier. DSNs are meant to be public
// (Sentry's own convention), safe to embed directly in client code —
// same project as the backend's SENTRY_DSN, distinguished by platform.
Sentry.init({ dsn: 'https://f45abf4e9ccf74a568aca3504a36852e@o4512314698825728.ingest.us.sentry.io/4512314757087232' });

initNativeApp();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
