// ============================================================
// 뱃지 컴포넌트 모음 — WarningBadge, CautionBadge, NewListingBadge
// ============================================================

const CAUTION_LABELS = {
  PRICE_FLUCTUATIONS:              "가격 급변",
  TRADING_VOLUME_SOARING:          "거래량 급등",
  DEPOSIT_AMOUNT_SOARING:          "입금량 급등",
  GLOBAL_PRICE_DIFFERENCES:        "글로벌 가격 차이",
  CONCENTRATION_OF_SMALL_ACCOUNTS: "소액 계좌 집중",
};

const badgeBase = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 999,
  letterSpacing: 0.3,
  whiteSpace: "nowrap",
};

export function WarningBadge() {
  return (
    <span
      style={{
        ...badgeBase,
        background: "rgba(255,59,59,0.15)",
        border: "1px solid rgba(255,59,59,0.5)",
        color: "#ff5d5d",
      }}
    >
      🚨 상장폐지위험
    </span>
  );
}

export function CautionBadge({ reasons }) {
  const label =
    reasons.length === 1
      ? CAUTION_LABELS[reasons[0]] || reasons[0]
      : `주의 ${reasons.length}건`;
  return (
    <span
      style={{
        ...badgeBase,
        background: "rgba(255,180,0,0.12)",
        border: "1px solid rgba(255,180,0,0.4)",
        color: "#ffb400",
      }}
    >
      ⚠️ {label}
    </span>
  );
}

export function NewListingBadge() {
  return (
    <span
      style={{
        ...badgeBase,
        background: "rgba(76,175,110,0.12)",
        border: "1px solid rgba(76,175,110,0.4)",
        color: "#4caf6e",
      }}
    >
      🆕 국내전용
    </span>
  );
}
