import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { RadioProvider } from './hooks/useRadio.tsx';
import { MusicProvider } from './hooks/useMusic.tsx';
import { initSpatialNavigation } from './tv/spatialNavigation.ts';
import { startErrorReporting } from './services/errorReporter';
import { applyGraphicsTier } from './services/graphicsTier.ts';

// Before anything else mounts, so a crash during boot is caught too — that is
// the failure least likely to be reported and hardest to reproduce.
startErrorReporting();

// Enable D-pad / arrow-key navigation for TV remotes & keyboards.
initSpatialNavigation();

// Before first paint, so a weak device never renders one frame of real glass
// and then visibly drops it.
applyGraphicsTier();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RadioProvider>
          <MusicProvider>
            <App />
          </MusicProvider>
        </RadioProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
