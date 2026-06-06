import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './hooks/useAuth.tsx';
import { RadioProvider } from './hooks/useRadio.tsx';
import { initSpatialNavigation } from './tv/spatialNavigation.ts';

// Enable D-pad / arrow-key navigation for TV remotes & keyboards.
initSpatialNavigation();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RadioProvider>
          <App />
        </RadioProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
