import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ConnectorScreen from './library-ui/ConnectorScreen.tsx';
import './styles.css';

/**
 * Standalone entry point.
 *
 * No router. ConnectorScreen already completes an OAuth redirect by reading
 * `?code=` off the current URL, and vercel.json rewrites every path to this
 * document — so /connect/callback loads the app, the screen sees the code, and
 * finishes the exchange. Adding a router would mean a second place that has to
 * agree about what the callback path is.
 *
 * StrictMode is on deliberately. It double-invokes effects and state updaters in
 * development, which is exactly the pressure that catches a token exchange fired
 * twice or a deep link launched twice — bugs this module is specifically shaped
 * to avoid.
 */
const el = document.getElementById('root');
if (!el) throw new Error('#root is missing from index.html');

createRoot(el).render(
  <StrictMode>
    <ConnectorScreen />
  </StrictMode>,
);
