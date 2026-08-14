/**
 * Backend availability state — kept separate from auth state.
 *
 * A user can be authenticated while the backend is temporarily unavailable,
 * or unauthenticated while the backend is available. These are orthogonal.
 */
export type BackendConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'offline';

export const BACKEND_AVAILABLE_EVENT = 'yunite:backend-available';
export const BACKEND_UNAVAILABLE_EVENT = 'yunite:backend-unavailable';

export function dispatchBackendAvailable(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BACKEND_AVAILABLE_EVENT));
  }
}

export function dispatchBackendUnavailable(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BACKEND_UNAVAILABLE_EVENT));
  }
}
