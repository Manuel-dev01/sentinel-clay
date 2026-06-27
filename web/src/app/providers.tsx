'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import { LocalSignerProvider, EnokiSignerProvider } from '@/lib/signer';
import { MandateProvider } from '@/lib/mandateStore';
import { ENOKI_ENABLED, FULLNODE } from '@/lib/env';

const { networkConfig } = createNetworkConfig({ testnet: { url: FULLNODE, network: 'testnet' } });

// Enoki path (zkLogin + sponsored gas) when creds are set; otherwise the local demo signer. Both expose
// the same SignerApi to every screen, so consumers don't change.
export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));

  if (ENOKI_ENABLED) {
    return (
      <QueryClientProvider client={qc}>
        <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
          <WalletProvider autoConnect>
            <EnokiSignerProvider>
              <MandateProvider>{children}</MandateProvider>
            </EnokiSignerProvider>
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={qc}>
      <LocalSignerProvider>
        <MandateProvider>{children}</MandateProvider>
      </LocalSignerProvider>
    </QueryClientProvider>
  );
}
