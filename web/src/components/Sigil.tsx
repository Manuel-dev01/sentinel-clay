// The Sentinel mark: a cream octagon, a forest octagon, a gold diamond core.
const OCT = 'polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)';

export function Sigil({ size = 26, bg = '#0e3a2c' }: { size?: number; bg?: string }) {
  const inner = Math.round(size * 0.65);
  const core = Math.round(size * 0.27);
  return (
    <div
      style={{ width: size, height: size, clipPath: OCT }}
      className="relative flex flex-none items-center justify-center bg-cream"
    >
      <div
        style={{ width: inner, height: inner, clipPath: OCT, background: bg }}
        className="flex items-center justify-center"
      >
        <div style={{ width: core, height: core }} className="rotate-45 bg-gold" />
      </div>
    </div>
  );
}
