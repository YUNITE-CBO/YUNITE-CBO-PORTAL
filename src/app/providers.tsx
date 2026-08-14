'use client';

import { AuthProvider } from '@/lib/auth';
import { BackendAvailabilityProvider } from '@/lib/api-client/BackendAvailabilityProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BackendAvailabilityProvider>{children}</BackendAvailabilityProvider>
    </AuthProvider>
  );
}
