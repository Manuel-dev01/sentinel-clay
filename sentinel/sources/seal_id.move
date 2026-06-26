/// Identity codec for Seal: the inner `id` a one-shot witness preimage (or an audit-log
/// record) is encrypted under, binding a key-release to exactly one (mandate, nonce). Used
/// IDENTICALLY on-chain (in `seal_policy`) and in the off-chain TS provider, so the two can
/// never disagree about which secret a given identity unlocks.
///
///   inner id = id_to_bytes(mandate_id)  (32 bytes)  ||  bcs(nonce: u64)  (8 bytes, LE)
///
/// `decode` reads from the TAIL, so it is robust whether or not the Seal SDK prepends the
/// package id to form the full identity passed to `seal_approve` (the trailing 40 bytes are
/// always our (mandate, nonce)).
module sentinel::seal_id;

use std::bcs;
use sui::address;
use sentinel::errors;

/// Encode (mandate_id, nonce) -> inner id bytes.
public fun encode(mandate_id: ID, nonce: u64): vector<u8> {
    let mut out = object::id_to_bytes(&mandate_id); // 32 bytes, big-endian object id
    out.append(bcs::to_bytes(&nonce)); // 8 bytes, little-endian (matches BCS u64)
    out
}

/// Decode the trailing 40 bytes of `id` into (mandate_id, nonce). Any leading bytes (e.g. a
/// package-id prefix Seal prepends) are ignored. Aborts `E_BAD_ID` if shorter than 40 bytes.
public fun decode(id: vector<u8>): (ID, u64) {
    let n = id.length();
    assert!(n >= 40, errors::bad_id());
    // nonce = last 8 bytes, little-endian (mirror of bcs::to_bytes(&u64))
    let mut nonce: u64 = 0;
    let mut i = 0;
    while (i < 8) {
        nonce = nonce + ((id[n - 8 + i] as u64) << (((8 * i) as u8)));
        i = i + 1;
    };
    // mandate id = the 32 bytes immediately preceding the nonce
    let mut addr_bytes = vector<u8>[];
    let mut j = 0;
    while (j < 32) {
        addr_bytes.push_back(id[n - 40 + j]);
        j = j + 1;
    };
    (object::id_from_address(address::from_bytes(addr_bytes)), nonce)
}
