'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { Transaction } from '@mysten/sui/transactions';
import { suiClient } from './suiClient';
import { ENOKI_ENABLED } from './env';

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
const LS_KEY = 'sentinel.demo.sk';

// Local demo signer: a self-custodial testnet keypair held only in this browser, fundable from the
// testnet faucet. Stands in for zkLogin + Enoki until those credentials are configured (ENOKI_ENABLED).
// The agent NEVER has access to this — only the user's browser holds it (custody stays with the user).
export function SignerProvider({ children }: { children: React.ReactNode }) {
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
      const { requestSuiFromFaucetV2, getFaucetHost } = await import('@mysten/sui/faucet');
      await requestSuiFromFaucetV2({ host: getFaucetHost('testnet'), recipient: kp.toSuiAddress() });
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
      label: ENOKI_ENABLED ? 'Google (zkLogin)' : 'Demo wallet',
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

export function useSigner(): SignerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSigner must be used within SignerProvider');
  return v;
}
