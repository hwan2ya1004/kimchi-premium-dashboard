export default function SignalCard({ icon, title, value, subText, color, bg, border, description }) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: "14px 16px",
        flex: "1 1 150px",
        minWidth: 140,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* 제목 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 11, color: "#7d8590", fontWeight: 500 }}>{title}</span>
      </div>

      {/* 값 */}
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 20,
          fontWeight: 700,
          color,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>

      {/* 서브 텍스트 뱃지 */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          background: `${color}18`,
          border: `1px solid ${color}30`,
          borderRadius: 999,
          padding: "2px 8px",
          display: "inline-block",
          alignSelf: "flex-start",
        }}
      >
        {subText}
      </div>

      {/* 설명 */}
      {description && (
        <div style={{ fontSize: 10, color: "#5c6370", lineHeight: 1.5, marginTop: 2 }}>
          {description}
        </div>
      )}
    </div>
  );
}
