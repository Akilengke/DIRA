import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { initTouchZoomPrevention } from './utils/touchZoomPrevention';

// Lock viewport zoom to keep all touch areas stable and prevent touch issues
initTouchZoomPrevention();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
