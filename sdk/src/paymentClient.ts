import { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Signer } from '@mysten/sui/cryptography';
import { CLOCK_ID, DEEPBOOK, SENTINEL_PACKAGE_ID } from './config';
import type { PaymentIntentFields, WitnessMaterial } from './provider';

export interface PayRealArgs {
  packageId?: string;
  registryId: string;
  intent: PaymentIntentFields; // poolId must be the real DeepBook pool; amount == quote coin value
  witness: WitnessMaterial;
  baseType?: string; // default DEEP
  quoteType?: string; // default SUI
  minBaseOut?: bigint;
}

export interface PayMockArgs {
  packageId?: string;
  registryId: string;
  poolObjectId: string; // the MockPool<B,Q>
  baseType: string;
  quoteType: string;
  intent: PaymentIntentFields;
  witness: WitnessMaterial;
  quoteCoinId: string; // an owned Coin<Q> object of exactly intent.amount
  minBaseOut?: bigint;
}

/** Builds + signs the venue PTBs from TS — the same `authorize → execute` path the manual
 *  `sui client ptb` smoke used, now driven by an AuthorizationProvider's witness material. */
export class PaymentClient {
  constructor(
    private readonly client: SuiJsonRpcClient,
    private readonly signer: Signer,
  ) {}

  private intentCall(tx: Transaction, pkg: string, i: PaymentIntentFields) {
    return tx.moveCall({
      target: `${pkg}::policy::new_intent`,
      arguments: [
        tx.pure.id(i.mandateId),
        tx.pure.id(i.poolId),
        tx.pure.u8(i.category),
        tx.pure.u64(i.amount),
        tx.pure.address(i.recipient),
        tx.pure.u64(i.nonce),
        tx.pure.u64(i.expiryMs),
      ],
    });
  }

  private witnessCall(tx: Transaction, pkg: string, w: WitnessMaterial) {
    return tx.moveCall({
      target: `${pkg}::payment::mint_witness`,
      arguments: [tx.pure.vector('u8', Array.from(w.preimage)), tx.pure.u64(w.nonce)],
    });
  }

  /** Compliant real fill on DeepBook: spend SUI (quote) -> receive DEEP (base) at the recipient. */
  buildPayReal(a: PayRealArgs): Transaction {
    const pkg = a.packageId ?? SENTINEL_PACKAGE_ID;
    const baseType = a.baseType ?? DEEPBOOK.deepType;
    const quoteType = a.quoteType ?? DEEPBOOK.suiType;
    const tx = new Transaction();
    const intent = this.intentCall(tx, pkg, a.intent);
    const witness = this.witnessCall(tx, pkg, a.witness);
    const deepCoin = tx.moveCall({ target: '0x2::coin::zero', typeArguments: [DEEPBOOK.deepType] });
    const [quoteCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(a.intent.amount)]);
    tx.moveCall({
      target: `${pkg}::payment::pay_real`,
      typeArguments: [baseType, quoteType],
      arguments: [
        tx.object(a.intent.mandateId),
        tx.object(a.registryId),
        tx.object(a.intent.poolId),
        intent,
        witness,
        tx.pure.vector('u8', Array.from(a.witness.nextCommitment)),
        quoteCoin,
        deepCoin,
        tx.pure.u64(a.minBaseOut ?? 0n),
        tx.object(CLOCK_ID),
      ],
    });
    return tx;
  }

  /** Deterministic MockPool fill (the guaranteed beat); quote coin must already be owned. */
  buildPayMock(a: PayMockArgs): Transaction {
    const pkg = a.packageId ?? SENTINEL_PACKAGE_ID;
    const tx = new Transaction();
    const intent = this.intentCall(tx, pkg, a.intent);
    const witness = this.witnessCall(tx, pkg, a.witness);
    tx.moveCall({
      target: `${pkg}::payment::pay_mock`,
      typeArguments: [a.baseType, a.quoteType],
      arguments: [
        tx.object(a.intent.mandateId),
        tx.object(a.registryId),
        tx.object(a.poolObjectId),
        intent,
        witness,
        tx.pure.vector('u8', Array.from(a.witness.nextCommitment)),
        tx.object(a.quoteCoinId),
        tx.pure.u64(a.minBaseOut ?? 0n),
        tx.object(CLOCK_ID),
      ],
    });
    return tx;
  }

  async execute(tx: Transaction) {
    return this.client.signAndExecuteTransaction({
      signer: this.signer,
      transaction: tx,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });
  }
}
