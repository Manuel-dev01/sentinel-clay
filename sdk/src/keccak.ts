import jsSha3 from 'js-sha3';

/**
 * Ethereum Keccak-256 - byte-identical to Move's `sui::hash::keccak256`. This is NOT NIST SHA3-256
 * (different padding); using node's `crypto` sha3-256 here would silently diverge from the chain.
 */
export function keccak256(data: Uint8Array): Uint8Array {
  return new Uint8Array(jsSha3.keccak256.arrayBuffer(data));
}
