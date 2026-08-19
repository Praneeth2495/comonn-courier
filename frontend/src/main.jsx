import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initNativeApp } from './nativeApp';
import './styles/theme.css';

initNativeApp();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
