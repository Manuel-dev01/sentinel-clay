/**
 * Live Stage 4 smoke (testnet). Drives the on-chain Sentinel package from TypeScript via the
 * AuthorizationProvider layer. The LocalWitnessProvider real fill is the GUARANTEED beat; the Seal
 * parts are best-effort (key-server uptime) and degrade without failing the run.
 *
 * Env: SENTINEL_PKG (Stage 4 package id), SUI_PRIVATE_KEY (bech32 suiprivkey1...).
 * Run:  pnpm smoke   (from sdk/)
 */
import { Transaction } from '@mysten/sui/transactions';
import {
  makeClient,
  keypairFromEnv,
  SENTINEL_PACKAGE_ID,
  DEEPBOOK,
  LocalWitnessProvider,
  SealMpcProvider,
  SealAuditLog,
  PaymentClient,
  PolicyDeniedError,
  type PaymentIntentFields,
} from '../src/index.js';

const FAR_FUTURE = 1_900_000_000_000n;
const CAT_STABLE = 0;

function createdId(res: any, typeSuffix: string): string {
  const c = (res.objectChanges ?? []).find(
    (x: any) => x.type === 'created' && String(x.objectType).includes(typeSuffix),
  );
  if (!c) throw new Error(`no created object matching ${typeSuffix}`);
  return c.objectId;
}

async function main() {
  const pkg = SENTINEL_PACKAGE_ID;
  if (pkg.startsWith('0x0000')) throw new Error('set SENTINEL_PKG to the Stage 4 package id');
  const client = makeClient();
  const signer = keypairFromEnv();
  const me = signer.toSuiAddress();
  const local = new LocalWitnessProvider();
  const pay = new PaymentClient(client, signer);
  console.log('package:', pkg, '\nsigner :', me);

  // --- 1. setup: registry + allowlist DEEP_SUI + mandate (initial commitment from LocalWitness) ---
  const reg = new Transaction();
  reg.moveCall({ target: `${pkg}::market_registry::new_registry` });
  const regRes = await pay.execute(reg);
  const registryId = createdId(regRes, '::market_registry::MarketRegistry');

  const addm = new Transaction();
  addm.moveCall({
    target: `${pkg}::market_registry::add_market`,
    arguments: [addm.object(registryId), addm.pure.id(DEEPBOOK.deepSuiPool)],
  });
  await pay.execute(addm);

  const initialCommitment = await local.initialCommitment();
  const mk = new Transaction();
  mk.moveCall({
    target: `${pkg}::mandate::new_mandate`,
    arguments: [
      mk.pure.id(registryId),
      mk.pure.u64(1_000_000_000n), // cap 1 SUI
      mk.pure.vector('u8', [CAT_STABLE]),
      mk.pure.u64(FAR_FUTURE),
      mk.pure.vector('u8', Array.from(initialCommitment)),
    ],
  });
  const mkRes = await pay.execute(mk);
  const mandateId = createdId(mkRes, '::mandate::Mandate');
  console.log('registry:', registryId, '\nmandate :', mandateId);

  const intentAt = (nonce: bigint, amount: bigint): PaymentIntentFields => ({
    mandateId,
    poolId: DEEPBOOK.deepSuiPool,
    category: CAT_STABLE,
    amount,
    recipient: me,
    nonce,
    expiryMs: FAR_FUTURE,
  });

  // --- 2. GUARANTEED: LocalWitnessProvider drives a compliant real DeepBook fill (nonce 0) ---
  {
    const intent = intentAt(0n, 500_000_000n); // 0.5 SUI -> DEEP
    const witness = await local.authorize(intent);
    const tx = pay.buildPayReal({ registryId, intent, witness });
    const res = await pay.execute(tx);
    const settled = (res.events ?? []).find((e: any) => String(e.type).includes('PaymentSettled'));
    console.log(
      `\n[LOCAL] compliant pay_real: ${res.effects?.status?.status}  digest=${res.digest}`,
      `\n        PaymentSettled=${JSON.stringify(settled?.parsedJson)}`,
    );
  }

  // --- 3. BEST-EFFORT: Seal gates the witness secret (compliant releases; over-cap denied) ---
  const seal = new SealMpcProvider({ client, signer, packageId: pkg, mandateId, registryId, local, window: 4 });
  try {
    await seal.setup();
    console.log('\n[SEAL] setup: encrypted preimages for nonces 0..3');

    // compliant at the current nonce (1) -> Seal releases the secret -> real fill
    const okIntent = intentAt(1n, 50_000_000n);
    const okWitness = await seal.authorize(okIntent);
    const okTx = pay.buildPayReal({ registryId, intent: okIntent, witness: okWitness });
    const okRes = await pay.execute(okTx);
    console.log(`[SEAL] compliant authorize+pay: ${okRes.effects?.status?.status}  digest=${okRes.digest}`);

    // over-cap at nonce 2 -> seal_approve dry-run ABORTS -> key servers deny -> PolicyDeniedError
    try {
      await seal.authorize(intentAt(2n, 5_000_000_000n)); // 5 SUI > 1 SUI cap
      console.log('[SEAL] over-cap authorize: UNEXPECTEDLY allowed (key servers may be down -> fell back to local)');
    } catch (e) {
      if (e instanceof PolicyDeniedError) console.log('[SEAL] over-cap authorize: DENIED off-chain ✅', e.message);
      else throw e;
    }
  } catch (e) {
    console.warn('[SEAL] best-effort path unavailable (key servers / SDK):', (e as Error).message);
  }

  // --- 4. BEST-EFFORT: encrypted audit log, owner-only decrypt roundtrip ---
  try {
    const audit = new SealAuditLog({ client, signer, packageId: pkg, mandateId });
    const record = {
      seq: 0,
      intent: intentAt(0n, 500_000_000n),
      verdict: 'APPROVED' as const,
      txDigest: 'demo',
      ts: 1_782_500_000_000,
    };
    const ct = await audit.encrypt(record);
    const back = await audit.decrypt(ct, 0);
    console.log(`\n[AUDIT] encrypt->owner-decrypt roundtrip: verdict=${back.verdict} amount=${back.intent.amount}`);
  } catch (e) {
    console.warn('[AUDIT] best-effort roundtrip unavailable:', (e as Error).message);
  }

  console.log('\nsmoke done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
