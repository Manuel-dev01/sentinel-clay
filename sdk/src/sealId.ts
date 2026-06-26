import { bcs } from '@mysten/sui/bcs';
import { fromHex, toHex } from '@mysten/sui/utils';

/**
 * Seal identity codec — the exact mirror of the Move `sentinel::seal_id` module.
 *
 *   inner id = id_to_bytes(mandateId)  (32 bytes)  ||  bcs(nonce: u64)  (8 bytes, little-endian)
 *
 * Because both sides agree on these bytes, a preimage encrypted under `encodeSealId(m, n)` can only
 * be released by a `seal_approve` that decodes the same (mandate, nonce). `decode` reads from the
 * tail, so a package-id prefix Seal may prepend is transparent.
 */
export function encodeSealId(mandateId: string, nonce: bigint | number): Uint8Array {
  const idBytes = fromHex(mandateId.replace(/^0x/, '')); // 32 bytes
  const nonceBytes = bcs.u64().serialize(BigInt(nonce)).toBytes(); // 8 LE
  const out = new Uint8Array(idBytes.length + nonceBytes.length);
  out.set(idBytes, 0);
  out.set(nonceBytes, idBytes.length);
  return out;
}

/** Hex string (no `0x`) of the inner id — what `@mysten/seal` expects for `encrypt`/`fetchKeys`. */
export function encodeSealIdHex(mandateId: string, nonce: bigint | number): string {
  return toHex(encodeSealId(mandateId, nonce));
}

export function decodeSealId(id: Uint8Array): { mandateId: string; nonce: bigint } {
  const n = id.length;
  if (n < 40) throw new Error(`seal id too short: ${n} bytes`);
  const nonce = BigInt(bcs.u64().parse(id.slice(n - 8, n)));
  const mandateId = '0x' + toHex(id.slice(n - 40, n - 8));
  return { mandateId, nonce };
}
