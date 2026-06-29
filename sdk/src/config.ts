// Testnet constants + client factory for Sentinel's off-chain layer. The Sentinel package id is set
// after the Stage 4 publish (override via SENTINEL_PKG); everything else is fixed on testnet.

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export const DEEPBOOK = {
  /** Currently-enabled testnet DeepBook core package (lineage 0xfb28c4, what our linkage targets). */
  core: '0xa3886aaa8aa831572dd39549242ca004a438c3a55967af9f0387ad2b01595068',
  deepType: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  suiType: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  /** DEEP_SUI pool = Pool<DEEP, SUI>, whitelisted (zero-DEEP fee). Spend SUI (quote) -> receive DEEP. */
  deepSuiPool: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
} as const;

/** Stage 4 Sentinel package id. Set SENTINEL_PKG env after publish; the smoke reads it. */
export const SENTINEL_PACKAGE_ID =
  process.env.SENTINEL_PKG ??
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Seed for the deterministic LocalWitnessProvider (preimage_n = keccak256(seed || bcs(n))). */
export const DEFAULT_SEED = new TextEncoder().encode('sentinel-local-witness-seed');

export const CLOCK_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

/**
 * Seal testnet key-server object ids. `getAllowlistedKeyServers` was removed from `@mysten/seal`
 * (≥1.2), so these are supplied directly (override with SEAL_KEY_SERVERS=comma,separated). If they
 * are wrong/unreachable the SealMpcProvider degrades to LocalWitnessProvider - on-chain enforcement
 * never depends on the committee (locked Decision #1).
 */
export const SEAL_TESTNET_KEY_SERVERS: string[] = (process.env.SEAL_KEY_SERVERS
  ? process.env.SEAL_KEY_SERVERS.split(',')
  : ['0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98']
).map((s) => s.trim()).filter(Boolean);

export function makeClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    url: process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('testnet'),
    network: 'testnet',
  });
}

/** Load the signer from SUI_PRIVATE_KEY (bech32 `suiprivkey1...`). Throws if unset. */
export function keypairFromEnv(): Ed25519Keypair {
  const sk = process.env.SUI_PRIVATE_KEY;
  if (!sk) throw new Error('SUI_PRIVATE_KEY not set (bech32 suiprivkey1...)');
  return Ed25519Keypair.fromSecretKey(sk);
}
