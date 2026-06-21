import { COLORS, rgba } from "../constants/colors.js";

export default function PremiumPill({ value, high, low }) {
  const isHigh = value >= high;
  const isLow  = value <= low;
  const color  = isHigh ? COLORS.danger : isLow ? COLORS.info : "#7d8590";
  const bg     = isHigh ? rgba(COLORS.danger, 0.15) : isLow ? rgba(COLORS.info, 0.15) : "rgba(125,133,144,0.10)";

  return (
    <span
      style={{
        color,
        background: bg,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
        border: (isHigh || isLow) ? `1px solid ${color}40` : "1px solid transparent",
      }}
    >
      {value > 0 ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}
