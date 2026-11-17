// First, before anything saves: a full storage bucket gives way instead of crashing the app.
import { installStorageGuard } from './services/storageGuard.ts';
installStorageGuard();
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { RadioProvider } from './hooks/useRadio.tsx';
import { MusicProvider } from './hooks/useMusic.tsx';
import { initSpatialNavigation } from './tv/spatialNavigation.ts';
import { initTilt } from './services/tilt';
import { applyTheme, storedTheme } from './hooks/useTheme';
import { applyTvViewport } from './tv/tvViewport.ts';
import { startErrorReporting } from './services/errorReporter';
import { applyGraphicsTier } from './services/graphicsTier.ts';
import { applyDeviceTier } from './services/deviceTier.ts';
import { crumb, startHeartbeat } from './services/bootCrumbs.ts';

crumb('boot');
startHeartbeat();

// Before anything else mounts, so a crash during boot is caught too — that is
// the failure least likely to be reported and hardest to reproduce.
startErrorReporting();

// Sahrae TV: a wider page fitted to the screen, not a phone-sized one blown up.
applyTvViewport();

// The viewer's theme before the first frame, so the opening is drawn in it.
try { applyTheme(storedTheme()); } catch { /* the app applies it when it mounts */ }

// Enable D-pad / arrow-key navigation for TV remotes & keyboards.
initSpatialNavigation();
initTilt();

// Before first paint, so a weak device never renders one frame of real glass
// and then visibly drops it.
applyGraphicsTier();
// Lite mode first: it also implies low graphics, and image sizes are chosen
// the moment the first screen renders.
applyDeviceTier();

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
