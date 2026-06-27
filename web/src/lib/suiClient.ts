import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

let _client: SuiJsonRpcClient | null = null;

/** Shared read/execute client (sui 2.x). Reused for dev-inspect, balances, and tx execution. */
export function suiClient(): SuiJsonRpcClient {
  if (!_client) {
    _client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('testnet'), network: 'testnet' });
  }
  return _client;
}
