// ============================================================
// 색상 상수 — 전체 앱에서 공통으로 사용
// ============================================================

export const COLORS = {
  danger:  "#ff5d5d",
  hot:     "#ff6b35",
  warning: "#ffb400",
  safe:    "#4caf6e",
  info:    "#5d9bff",
  neutral: "#9198a1",
  muted:   "#5c6370",
  text:    "#e6edf3",
  subtext: "#7d8590",
};

// rgba 헬퍼 — opacity 0~1
export function rgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

// 프리미엄 카운트에 따른 스타일 반환
export function getPremiumCountStyle(count) {
  if (count >= 10) return { color: COLORS.danger,  bg: rgba(COLORS.danger, 0.12),  border: rgba(COLORS.danger, 0.35),  subText: "과열 주의" };
  if (count >= 5)  return { color: COLORS.warning, bg: rgba(COLORS.warning, 0.12), border: rgba(COLORS.warning, 0.35), subText: "상승 중" };
  return              { color: COLORS.safe,    bg: rgba(COLORS.safe, 0.10),    border: rgba(COLORS.safe, 0.30),    subText: "정상" };
}

// 주의 카운트에 따른 스타일 반환
export function getCautionCountStyle(count) {
  if (count >= 10) return { color: COLORS.danger,  bg: rgba(COLORS.danger, 0.12),  border: rgba(COLORS.danger, 0.35),  subText: "급등 다수" };
  if (count >= 5)  return { color: COLORS.warning, bg: rgba(COLORS.warning, 0.12), border: rgba(COLORS.warning, 0.35), subText: "주의 필요" };
  return              { color: COLORS.neutral, bg: rgba(COLORS.neutral, 0.08), border: rgba(COLORS.neutral, 0.20), subText: "정상" };
}

// 국내전용 카운트에 따른 스타일 반환
export function getNewListingCountStyle(count) {
  if (count >= 3) return { color: COLORS.danger,  bg: rgba(COLORS.danger, 0.12),  border: rgba(COLORS.danger, 0.35),  subText: "차익불가 급등" };
  if (count >= 1) return { color: COLORS.warning, bg: rgba(COLORS.warning, 0.12), border: rgba(COLORS.warning, 0.35), subText: "일부 급등" };
  return             { color: COLORS.neutral, bg: rgba(COLORS.neutral, 0.08), border: rgba(COLORS.neutral, 0.20), subText: "정상" };
}
