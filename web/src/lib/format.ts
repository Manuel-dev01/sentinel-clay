export const MIST = 1_000_000_000n;

export function suiFromMist(mist: bigint | string | number): number {
  const v = typeof mist === 'bigint' ? mist : BigInt(Math.round(Number(mist)));
  return Number(v) / 1e9;
}

export function mistFromSui(sui: number): bigint {
  return BigInt(Math.round(sui * 1e9));
}

export function fmtSui(mist: bigint | string | number, dp = 2): string {
  return suiFromMist(mist).toFixed(dp);
}

export function shortAddr(a: string | null | undefined, lead = 6, tail = 4): string {
  if (!a) return '—';
  return a.length > lead + tail + 2 ? `${a.slice(0, lead)}…${a.slice(-tail)}` : a;
}

export function fmtUsd(sui: number, suiUsd = 3.4): string {
  return `$${(sui * suiUsd).toFixed(2)}`;
}
