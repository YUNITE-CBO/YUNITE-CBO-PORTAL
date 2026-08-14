'use client';

/**
 * BackendAvailabilityProvider — a global React context that tracks whether
 * the YUNITE backend is reachable, independent of authentication state.
 *
 * Listens to the `yunite:backend-available` / `yunite:backend-unavailable`
 * custom events dispatched by `apiFetch`. When the backend goes unavailable
 * (Render cold start), it shows a non-alarming banner. When it comes back,
 * the banner disappears automatically.
 *
 * This does NOT block rendering — children render normally. It only provides
 * the connection state and an optional banner overlay.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  type BackendConnectionState,
  BACKEND_AVAILABLE_EVENT,
  BACKEND_UNAVAILABLE_EVENT,
} from '@/lib/api-client/connection-events';

interface BackendAvailabilityContextValue {
  connectionState: BackendConnectionState;
  isAvailable: boolean;
  retry: () => void;
}

const BackendAvailabilityContext = createContext<BackendAvailabilityContextValue | undefined>(undefined);

export function BackendAvailabilityProvider({ children }: { children: ReactNode }) {
  const [connectionState, setConnectionState] = useState<BackendConnectionState>('connected');

  useEffect(() => {
    const handleUnavailable = () => setConnectionState('reconnecting');
    const handleAvailable = () => setConnectionState('connected');

    window.addEventListener(BACKEND_UNAVAILABLE_EVENT, handleUnavailable);
    window.addEventListener(BACKEND_AVAILABLE_EVENT, handleAvailable);

    return () => {
      window.removeEventListener(BACKEND_UNAVAILABLE_EVENT, handleUnavailable);
      window.removeEventListener(BACKEND_AVAILABLE_EVENT, handleAvailable);
    };
  }, []);

  const retry = useCallback(() => {
    setConnectionState('connecting');
    // A gentle ping to /health to check availability.
    fetch('/health')
      .then(() => setConnectionState('connected'))
      .catch(() => setConnectionState('offline'));
  }, []);

  return (
    <BackendAvailabilityContext.Provider value={{ connectionState, isAvailable: connectionState === 'connected', retry }}>
      {connectionState === 'reconnecting' || connectionState === 'connecting' ? (
        <BackendBanner state={connectionState} />
      ) : null}
      {children}
    </BackendAvailabilityContext.Provider>
  );
}

function BackendBanner({ state }: { state: BackendConnectionState }) {
  const message = state === 'connecting'
    ? 'Connecting to YUNITE...'
    : 'YUNITE backend is waking up. Reconnecting...';
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-0 z-50 -translate-x-1/2 rounded-b-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-md"
    >
      <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-white"></span>
      {message}
    </div>
  );
}

export function useBackendAvailability() {
  const context = useContext(BackendAvailabilityContext);
  if (context === undefined) {
    throw new Error('useBackendAvailability must be used within a BackendAvailabilityProvider');
  }
  return context;
}
