import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHex } from '@mysten/sui/utils';
import { encodeSealId, encodeSealIdHex, decodeSealId } from '../src/sealId.js';

const MANDATE = '0x' + '11'.repeat(32);

test('encode = mandate_id(32) || bcs(nonce u64 LE)(8) — mirrors Move seal_id::encode', () => {
  const bytes = encodeSealId(MANDATE, 5);
  assert.equal(bytes.length, 40);
  assert.equal(encodeSealIdHex(MANDATE, 5), '11'.repeat(32) + '0500000000000000');
});

test('decode round-trips (mandate, nonce)', () => {
  const { mandateId, nonce } = decodeSealId(encodeSealId(MANDATE, 42));
  assert.equal(mandateId, MANDATE);
  assert.equal(nonce, 42n);
});

test('decode reads from the tail — a package-id prefix is transparent', () => {
  const prefix = new Uint8Array(32).fill(0xab); // simulate Seal prepending a 32-byte package id
  const inner = encodeSealId(MANDATE, 7);
  const full = new Uint8Array(prefix.length + inner.length);
  full.set(prefix, 0);
  full.set(inner, prefix.length);
  const { mandateId, nonce } = decodeSealId(full);
  assert.equal(mandateId, MANDATE);
  assert.equal(nonce, 7n);
});

test('decode rejects too-short ids', () => {
  assert.throws(() => decodeSealId(new Uint8Array(39)));
});
