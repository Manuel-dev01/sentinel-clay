'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import {
  useCurrentAccount,
  useConnectWallet,
  useDisconnectWallet,
  useSignPersonalMessage,
  useSignTransaction,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { registerEnokiWallets, type EnokiWallet } from '@mysten/enoki';
import { suiClient } from './suiClient';
import { ENOKI_ENABLED, ENOKI_API_KEY, GOOGLE_CLIENT_ID } from './env';

export interface ExecResult {
  digest: string;
  status: string;
  effects?: any;
  events?: any[];
  objectChanges?: any[];
}

export interface SignerApi {
  address: string | null;
  mode: 'enoki' | 'local' | null;
  label: string;
  ready: boolean;
  busy: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  faucet: () => Promise<void>;
  signExecute: (tx: Transaction) => Promise<ExecResult>;
  signMessage: (msg: Uint8Array) => Promise<{ signature: string; bytes: string }>;
}

const Ctx = createContext<SignerApi | null>(null);
export function useSigner(): SignerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSigner must be used within a signer provider');
  return v;
}

async function faucetTo(addr: string) {
  const { requestSuiFromFaucetV2, getFaucetHost } = await import('@mysten/sui/faucet');
  await requestSuiFromFaucetV2({ host: getFaucetHost('testnet'), recipient: addr });
}

// ───────────────────────────── Local demo signer (browser keypair) ─────────────────────────────
const LS_KEY = 'sentinel.demo.sk';

export function LocalSignerProvider({ children }: { children: React.ReactNode }) {
  const [kp, setKp] = useState<Ed25519Keypair | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sk = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (sk) {
      try {
        setKp(Ed25519Keypair.fromSecretKey(sk));
      } catch {
        localStorage.removeItem(LS_KEY);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const next = new Ed25519Keypair();
    localStorage.setItem(LS_KEY, next.getSecretKey());
    setKp(next);
  }, []);
  const disconnect = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setKp(null);
  }, []);
  const faucet = useCallback(async () => {
    if (!kp) return;
    setBusy(true);
    try {
      await faucetTo(kp.toSuiAddress());
    } finally {
      setBusy(false);
    }
  }, [kp]);
  const signExecute = useCallback(
    async (tx: Transaction): Promise<ExecResult> => {
      if (!kp) throw new Error('not connected');
      setBusy(true);
      try {
        const res = await suiClient().signAndExecuteTransaction({
          signer: kp,
          transaction: tx,
          options: { showEffects: true, showEvents: true, showObjectChanges: true },
        });
        return {
          digest: res.digest,
          status: (res.effects as any)?.status?.status ?? 'unknown',
          effects: res.effects,
          events: (res as any).events,
          objectChanges: (res as any).objectChanges,
        };
      } finally {
        setBusy(false);
      }
    },
    [kp],
  );
  const signMessage = useCallback(
    async (msg: Uint8Array) => {
      if (!kp) throw new Error('not connected');
      const { signature, bytes } = await kp.signPersonalMessage(msg);
      return { signature, bytes };
    },
    [kp],
  );

  const api = useMemo<SignerApi>(
    () => ({
      address: kp?.toSuiAddress() ?? null,
      mode: kp ? 'local' : null,
      label: 'Demo wallet',
      ready: !!kp,
      busy,
      connect,
      disconnect,
      faucet,
      signExecute,
      signMessage,
    }),
    [kp, busy, connect, disconnect, faucet, signExecute, signMessage],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// ─────────────────────────── Enoki zkLogin signer (Google + sponsored gas) ───────────────────────────
export function EnokiSignerProvider({ children }: { children: React.ReactNode }) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: connectWallet } = useConnectWallet();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutateAsync: signTransaction } = useSignTransaction();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [googleWallet, setGoogleWallet] = useState<EnokiWallet | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Pin the OAuth redirect to the app ORIGIN (not the current page) so there is exactly ONE
    // redirect_uri to whitelist in Google Cloud Console · avoids redirect_uri_mismatch per-page.
    const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { wallets, unregister } = registerEnokiWallets({
      apiKey: ENOKI_API_KEY,
      providers: { google: { clientId: GOOGLE_CLIENT_ID, redirectUrl } },
      client: client as any,
      network: 'testnet',
    });
    setGoogleWallet((wallets.google as EnokiWallet) ?? null);
    return () => unregister();
  }, [client]);

  const connect = useCallback(async () => {
    if (!googleWallet) throw new Error('Google sign-in not ready');
    await connectWallet({ wallet: googleWallet });
  }, [googleWallet, connectWallet]);

  const disconnect = useCallback(() => disconnectWallet(), [disconnectWallet]);

  const faucet = useCallback(async () => {
    if (!account) return;
    setBusy(true);
    try {
      await faucetTo(account.address);
    } finally {
      setBusy(false);
    }
  }, [account]);

  const signMessage = useCallback(
    async (msg: Uint8Array) => {
      const r = await signPersonalMessage({ message: msg });
      return { signature: r.signature, bytes: r.bytes };
    },
    [signPersonalMessage],
  );

  const fetchResult = useCallback(
    async (digest: string): Promise<ExecResult> => {
      await client.waitForTransaction({ digest });
      const full = await client.getTransactionBlock({
        digest,
        options: { showEffects: true, showEvents: true, showObjectChanges: true },
      });
      return {
        digest,
        status: (full.effects as any)?.status?.status ?? 'unknown',
        effects: full.effects,
        events: (full as any).events,
        objectChanges: (full as any).objectChanges,
      };
    },
    [client],
  );

  // Gas-free: server creates a sponsored tx (Enoki secret key), the wallet signs, server executes.
  // If the sponsored seam fails, fall back to a user-paid signAndExecute so the flow never dead-ends.
  const signExecute = useCallback(
    async (tx: Transaction): Promise<ExecResult> => {
      if (!account) throw new Error('not connected');
      setBusy(true);
      try {
        try {
          const kind = await tx.build({ client: client as any, onlyTransactionKind: true });
          const sp = await fetch('/api/sponsor', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ transactionKindBytes: toBase64(kind), sender: account.address }),
          }).then((r) => r.json());
          if (sp.error) throw new Error(sp.error);
          const { signature } = await signTransaction({ transaction: Transaction.from(sp.bytes), chain: 'sui:testnet' });
          const ex = await fetch('/api/sponsor/execute', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ digest: sp.digest, signature }),
          }).then((r) => r.json());
          if (ex.error) throw new Error(ex.error);
          return await fetchResult(ex.digest);
        } catch (sponsorErr) {
          console.warn('[enoki] sponsored path failed; falling back to user-paid gas:', sponsorErr);
          const r = await signAndExecute({ transaction: tx });
          return await fetchResult(r.digest);
        }
      } finally {
        setBusy(false);
      }
    },
    [account, client, signTransaction, signAndExecute, fetchResult],
  );

  const api = useMemo<SignerApi>(
    () => ({
      address: account?.address ?? null,
      mode: account ? 'enoki' : null,
      label: 'Google (zkLogin)',
      ready: !!account,
      busy,
      connect,
      disconnect,
      faucet,
      signExecute,
      signMessage,
    }),
    [account, busy, connect, disconnect, faucet, signExecute, signMessage],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const SIGNER_MODE_ENOKI = ENOKI_ENABLED;
