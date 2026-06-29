import { NextRequest, NextResponse } from 'next/server';
import { requestSuiFromFaucetV2, getFaucetHost } from '@mysten/sui/faucet';

// Server-side faucet proxy. The browser cannot call the Sui testnet faucet directly (CORS), and a
// client-side failure is invisible to the user. Proxying here makes "Get testnet SUI" actually work
// and lets us return a clear error (e.g. rate-limited) the wallet screen can show.
export async function POST(req: NextRequest) {
  let address: string | undefined;
  try {
    address = (await req.json())?.address;
  } catch {
    /* ignore */
  }
  if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'A valid Sui address is required.' }, { status: 400 });
  }

  try {
    await requestSuiFromFaucetV2({ host: getFaucetHost('testnet'), recipient: address });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const rateLimited = /429|rate.?limit|too many/i.test(msg);
    return NextResponse.json(
      {
        error: rateLimited
          ? 'Testnet faucet is rate-limited for now. Wait a minute and retry, or fund this address from faucet.sui.io.'
          : `Faucet request failed: ${msg}`,
      },
      { status: rateLimited ? 429 : 502 },
    );
  }
}
