import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHex } from '@mysten/sui/utils';
import { keccak256 } from '../src/keccak.js';
import { LocalWitnessProvider } from '../src/localWitness.js';

// Ground truth: keccak256 of single bytes, computed ON-CHAIN via `payment::commitment_of` dev-inspect
// during the Stage 3.1 smoke. If the TS keccak ever diverges from Move's, these break.
const C0 = 'bc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a';
const C1 = '5fe7f977e71dba2ea1a68e21057beebb9be2ac30c6410aa38d4f3fbe41dcffd2';

test('keccak256 matches on-chain sui::hash::keccak256 (NOT NIST sha3)', () => {
  assert.equal(toHex(keccak256(new Uint8Array([0]))), C0);
  assert.equal(toHex(keccak256(new Uint8Array([1]))), C1);
});

test('LocalWitnessProvider: deterministic, commitment = keccak256(preimage)', async () => {
  const p = new LocalWitnessProvider();
  // deterministic
  assert.equal(toHex(p.preimage(3n)), toHex(p.preimage(3n)));
  // the on-chain relationship payment::commitment_of(preimage) == keccak256(preimage)
  assert.equal(toHex(p.commitment(7n)), toHex(keccak256(p.preimage(7n))));
  // authorize returns the witness for `nonce` and rotates to commitment(nonce+1)
  const m = await p.authorize({
    mandateId: '0x' + '00'.repeat(32),
    poolId: '0x' + '00'.repeat(32),
    category: 0,
    amount: 1n,
    recipient: '0x' + '00'.repeat(32),
    nonce: 2n,
    expiryMs: 1n,
  });
  assert.equal(toHex(m.preimage), toHex(p.preimage(2n)));
  assert.equal(toHex(m.nextCommitment), toHex(p.commitment(3n)));
});
