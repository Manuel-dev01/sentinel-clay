'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SignerProvider } from '@/lib/signer';
import { MandateProvider } from '@/lib/mandateStore';

// React Query + the signer context. The signer is the local demo wallet today; when Enoki + Google
// creds are configured (ENOKI_ENABLED) the same SignerApi is backed by zkLogin + sponsored gas.
export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={qc}>
      <SignerProvider>
        <MandateProvider>{children}</MandateProvider>
      </SignerProvider>
    </QueryClientProvider>
  );
}
