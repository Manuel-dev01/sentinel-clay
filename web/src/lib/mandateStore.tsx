'use client';

import { createContext, useContext, useEffect, useState } from 'react';

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

export function MandateProvider({ children }: { children: React.ReactNode }) {
  const [mandate, set] = useState<ArmedMandate | null>(null);

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS) : null;
    if (raw) {
      try {
        set(JSON.parse(raw));
      } catch {
        localStorage.removeItem(LS);
      }
    }
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
