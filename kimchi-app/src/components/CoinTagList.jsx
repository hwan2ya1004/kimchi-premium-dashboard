export default function CoinTagList({ coins, color, max = 8 }) {
  if (!coins || coins.length === 0) return null;
  const shown = coins.slice(0, max);
  const rest  = coins.length - max;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
      {shown.map((c) => (
        <span
          key={c.symbol}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            color,
            background: `${color}15`,
            border: `1px solid ${color}30`,
            borderRadius: 6,
            padding: "2px 6px",
            whiteSpace: "nowrap",
          }}
          title={`${c.name} | 업비트 ${
            c.upbitPremium != null
              ? (c.upbitPremium > 0 ? "+" : "") + c.upbitPremium.toFixed(2) + "%"
              : "—"
          }`}
        >
          {c.symbol}
          {c.upbitPremium != null && (
            <span style={{ opacity: 0.75, marginLeft: 3 }}>
              {c.upbitPremium > 0 ? "+" : ""}{c.upbitPremium.toFixed(1)}%
            </span>
          )}
        </span>
      ))}
      {rest > 0 && (
        <span style={{ fontSize: 10, color: "#5c6370", padding: "2px 4px" }}>
          +{rest}개
        </span>
      )}
    </div>
  );
}
