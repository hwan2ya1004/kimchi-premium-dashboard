import PremiumPill from "./PremiumPill.jsx";

export default function ExchangeRow({ label, price, premium, high, low, failed }) {
  const isAlert = premium !== null && (premium >= high || premium <= low);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 1fr auto",
        alignItems: "center",
        padding: "7px 0",
        borderBottom: "1px solid #1c2128",
        gap: 8,
        background: isAlert ? "rgba(255,93,93,0.03)" : "transparent",
        borderRadius: 4,
      }}
    >
      <span style={{ color: "#9198a1", fontSize: 12, fontWeight: 500 }}>{label}</span>

      {failed ? (
        <span style={{ color: "#3a4048", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>—</span>
      ) : (
        <span
          style={{
            color: "#e6edf3",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 13,
            fontWeight: isAlert ? 700 : 500,
          }}
        >
          {price != null
            ? price.toLocaleString("ko-KR", { maximumFractionDigits: 0 }) + "원"
            : "—"}
        </span>
      )}

      {!failed && premium !== null && (
        <PremiumPill value={premium} high={high} low={low} />
      )}
    </div>
  );
}
