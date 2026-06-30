'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { AGENT_MANDATE_ID, AGENT_OWNER, APP_REGISTRY_ID, DEEPBOOK } from './env';

export interface ArmedMandate {
  registryId: string;
  mandateId: string;
  owner: string;
  capMist: string; // u64 as string (SUI mist)
  categories: number[];
  markets: string[]; // pool ids
  expiryMs: string;
  agentName: string;
  armedAt: number;
}

interface MandateCtx {
  mandate: ArmedMandate | null;
  setMandate: (m: ArmedMandate | null) => void;
}

const Ctx = createContext<MandateCtx | null>(null);
const LS = 'sentinel.mandate';

// The shared demo mandate, used as the default armed mandate when AGENT_MANDATE_ID is configured so every
// visitor lands on a working agent (same stream + approvable). Kept in memory (not persisted) so it always
// reflects the current env. A user arming their own mandate overrides + persists it.
function demoMandate(): ArmedMandate | null {
  if (!AGENT_MANDATE_ID) return null;
  return {
    registryId: APP_REGISTRY_ID,
    mandateId: AGENT_MANDATE_ID,
    owner: AGENT_OWNER,
    capMist: '500000000',
    categories: [0],
    markets: [DEEPBOOK.deepSuiPool],
    expiryMs: '4102444800000',
    agentName: 'Yield Hunter v2 (shared demo)',
    armedAt: 0,
  };
}

export function MandateProvider({ children }: { children: React.ReactNode }) {
  const [mandate, set] = useState<ArmedMandate | null>(null);

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS) : null;
    if (raw) {
      try {
        set(JSON.parse(raw));
        return;
      } catch {
        localStorage.removeItem(LS);
      }
    }
    set(demoMandate()); // default to the shared demo mandate when configured (in-memory only)
  }, []);

  const setMandate = (m: ArmedMandate | null) => {
    set(m);
    if (m) localStorage.setItem(LS, JSON.stringify(m));
    else localStorage.removeItem(LS);
  };

  return <Ctx.Provider value={{ mandate, setMandate }}>{children}</Ctx.Provider>;
}

export function useMandate(): MandateCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMandate must be used within MandateProvider');
  return v;
}
