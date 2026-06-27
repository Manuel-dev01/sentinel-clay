// Public, browser-safe config. All external integrations are env-gated with graceful fallbacks so the
// app runs end-to-end even before every credential is in place (see the Stage 5 plan).

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_SENTINEL_PKG ??
  '0x7a7ee7186ccb69b2b250e7b08fc31b8ccfadae9a7596a352112f7aa3e72a77f9';

export const NETWORK = 'testnet';
export const FULLNODE = 'https://fullnode.testnet.sui.io:443';
export const FAUCET = 'https://faucet.testnet.sui.io/v2/gas';
export const EXPLORER = (digest: string) => `https://suiscan.xyz/testnet/tx/${digest}`;
export const EXPLORER_OBJ = (id: string) => `https://suiscan.xyz/testnet/object/${id}`;

export const ENOKI_API_KEY = process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? '';
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
/** True once Enoki + Google are configured; otherwise the app uses the local demo signer. */
export const ENOKI_ENABLED = Boolean(ENOKI_API_KEY && GOOGLE_CLIENT_ID);

export const DEEPBOOK = {
  core: '0xa3886aaa8aa831572dd39549242ca004a438c3a55967af9f0387ad2b01595068',
  deepType: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  suiType: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  deepSuiPool: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
};

export const CLOCK_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

// One app-wide shared registry (admin-curated markets) → arming is a single `new_mandate` tx ("sign once").
export const APP_REGISTRY_ID =
  process.env.NEXT_PUBLIC_APP_REGISTRY ?? '0x8b49d0d7afde529a8784f3f255b1fa2168519988aae242f5bf3a881b6a7f7c1f';

export const CATEGORIES = [
  { id: 0, label: 'Stablecoins', key: 'stable' },
  { id: 1, label: 'Blue-chips', key: 'bluechip' },
] as const;

export interface Market {
  id: string;
  label: string;
  base: string;
  quote: string;
  category: number;
  venue: 'real' | 'mock';
}

// DEEP_SUI is the proven real-DeepBook venue (spend SUI → receive DEEP). MockPool (deterministic
// on-camera fill) is registered in Phase E once its object id is set.
export const MARKETS: Market[] = [
  { id: DEEPBOOK.deepSuiPool, label: 'SUI / DEEP', base: DEEPBOOK.deepType, quote: DEEPBOOK.suiType, category: 0, venue: 'real' },
];

export const EXPIRIES = [
  { label: '24h', ms: 24 * 3600_000 },
  { label: '7d', ms: 7 * 24 * 3600_000 },
  { label: '30d', ms: 30 * 24 * 3600_000 },
] as const;
