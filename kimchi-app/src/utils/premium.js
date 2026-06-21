// ============================================================
// 프리미엄 계산 및 신호 분석 유틸리티
// ============================================================

import { COLORS, rgba } from "../constants/colors.js";

/** 김치프리미엄 계산 (%) */
export function calcPremium(domesticKrw, globalUsdt, usdKrw) {
  const globalKrw = globalUsdt * usdKrw;
  return ((domesticKrw - globalKrw) / globalKrw) * 100;
}

/** 공포탐욕지수 → 라벨 + 색상 */
export function fngLabel(value) {
  if (value <= 24) return { text: "극도 공포", color: COLORS.info,    bg: rgba(COLORS.info, 0.12),    border: rgba(COLORS.info, 0.35) };
  if (value <= 44) return { text: "공포",      color: "#8ab8ff",      bg: "rgba(138,184,255,0.10)",   border: "rgba(138,184,255,0.3)" };
  if (value <= 54) return { text: "중립",      color: COLORS.neutral, bg: rgba(COLORS.neutral, 0.10), border: rgba(COLORS.neutral, 0.25) };
  if (value <= 74) return { text: "탐욕",      color: COLORS.warning, bg: rgba(COLORS.warning, 0.12), border: rgba(COLORS.warning, 0.35) };
  return                   { text: "극도 탐욕", color: COLORS.danger,  bg: rgba(COLORS.danger, 0.12),  border: rgba(COLORS.danger, 0.35) };
}

/** USD/KRW 환율 → 신호 */
export function usdKrwSignal(rate) {
  if (rate === null) return { text: "—",        color: COLORS.muted,   bg: rgba(COLORS.muted, 0.08),   border: rgba(COLORS.muted, 0.20),   score: 0 };
  if (rate >= 1420)  return { text: "원화 급약세", color: COLORS.danger,  bg: rgba(COLORS.danger, 0.12),  border: rgba(COLORS.danger, 0.35),  score: 2 };
  if (rate >= 1380)  return { text: "원화 약세",  color: COLORS.warning, bg: rgba(COLORS.warning, 0.12), border: rgba(COLORS.warning, 0.35), score: 1 };
  return                    { text: "정상",      color: COLORS.safe,    bg: rgba(COLORS.safe, 0.10),    border: rgba(COLORS.safe, 0.30),    score: 0 };
}

/** 종합 시장 신호 계산 */
export function calcOverallSignal(fng, usdKrw, premiumAlertCount, cautionCount, newListingHighPremiumCount) {
  let score = 0;
  const reasons = [];

  if (fng !== null) {
    if (fng >= 75)      { score += 3; reasons.push("극도 탐욕 상태"); }
    else if (fng >= 55) { score += 2; reasons.push("탐욕 상태"); }
    else if (fng <= 24) { score -= 1; reasons.push("극도 공포 (역프리미엄 가능)"); }
  }

  if (usdKrw !== null) {
    if (usdKrw >= 1420)      { score += 2; reasons.push("원화 급약세"); }
    else if (usdKrw >= 1380) { score += 1; reasons.push("원화 약세"); }
  }

  if (premiumAlertCount >= 10)     { score += 3; reasons.push(`${premiumAlertCount}개 코인 프리미엄 급등`); }
  else if (premiumAlertCount >= 5) { score += 2; reasons.push(`${premiumAlertCount}개 코인 프리미엄 상승`); }
  else if (premiumAlertCount >= 2) { score += 1; reasons.push(`${premiumAlertCount}개 코인 프리미엄 감지`); }

  if (cautionCount >= 10)     { score += 2; reasons.push("다수 코인 거래량 급등"); }
  else if (cautionCount >= 5) { score += 1; reasons.push("일부 코인 거래량 급등"); }

  if (newListingHighPremiumCount >= 3)     { score += 2; reasons.push("국내전용 코인 프리미엄 급등"); }
  else if (newListingHighPremiumCount >= 1) { score += 1; reasons.push("국내전용 코인 프리미엄 발생"); }

  let level, levelColor, levelBg, levelBorder, emoji;
  if (score >= 7) {
    level = "매우 높음"; emoji = "🔴";
    levelColor = COLORS.danger;  levelBg = rgba(COLORS.danger, 0.10);  levelBorder = rgba(COLORS.danger, 0.40);
  } else if (score >= 4) {
    level = "높음"; emoji = "🟠";
    levelColor = COLORS.hot;     levelBg = rgba(COLORS.hot, 0.10);     levelBorder = rgba(COLORS.hot, 0.40);
  } else if (score >= 2) {
    level = "보통"; emoji = "🟡";
    levelColor = COLORS.warning; levelBg = rgba(COLORS.warning, 0.10); levelBorder = rgba(COLORS.warning, 0.35);
  } else if (score >= 0) {
    level = "낮음"; emoji = "🟢";
    levelColor = COLORS.safe;    levelBg = rgba(COLORS.safe, 0.08);    levelBorder = rgba(COLORS.safe, 0.30);
  } else {
    level = "역프리미엄 주의"; emoji = "🔵";
    levelColor = COLORS.info;    levelBg = rgba(COLORS.info, 0.08);    levelBorder = rgba(COLORS.info, 0.30);
  }

  return { score, level, emoji, levelColor, levelBg, levelBorder, reasons };
}
