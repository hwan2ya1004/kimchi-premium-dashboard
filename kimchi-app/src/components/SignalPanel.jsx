// ============================================================
// 시장 신호 패널 컴포넌트
// ============================================================

import { useState } from "react";
import { Zap } from "lucide-react";
import SignalCard from "./SignalCard.jsx";
import CoinTagList from "./CoinTagList.jsx";
import { fngLabel, usdKrwSignal, calcOverallSignal } from "../utils/premium.js";
import {
  getPremiumCountStyle,
  getCautionCountStyle,
  getNewListingCountStyle,
  COLORS,
  rgba,
} from "../constants/colors.js";

export default function SignalPanel({
  fng,
  usdKrw,
  premiumAlertCount,
  cautionCount,
  coinList,
  snapshots,
  binanceSymbols,
  high,
  low,
}) {
  const [openCard, setOpenCard] = useState(null);
  const toggle = (key) => setOpenCard((prev) => (prev === key ? null : key));

  // 국내전용 고프리미엄 코인
  const newListingHighPremiumCoins = coinList
    .filter((c) => {
      if (binanceSymbols.has(c.symbol)) return false;
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      return (
        (snap.upbitPremium !== null && snap.upbitPremium >= high) ||
        (snap.bithumbPremium !== null && snap.bithumbPremium >= high)
      );
    })
    .map((c) => ({
      symbol: c.symbol,
      name: c.name,
      upbitPremium: snapshots[c.symbol]?.upbitPremium ?? snapshots[c.symbol]?.bithumbPremium ?? null,
    }))
    .sort((a, b) => (b.upbitPremium ?? -999) - (a.upbitPremium ?? -999));

  // 프리미엄 알림 코인
  const premiumAlertCoins = coinList
    .filter((c) => {
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      return (
        (snap.upbitPremium !== null && (snap.upbitPremium >= high || snap.upbitPremium <= low)) ||
        (snap.bithumbPremium !== null && (snap.bithumbPremium >= high || snap.bithumbPremium <= low))
      );
    })
    .map((c) => ({
      symbol: c.symbol,
      name: c.name,
      upbitPremium: snapshots[c.symbol]?.upbitPremium ?? snapshots[c.symbol]?.bithumbPremium ?? null,
    }))
    .sort((a, b) => (b.upbitPremium ?? -999) - (a.upbitPremium ?? -999));

  // 주의 코인
  const cautionCoins = coinList
    .filter((c) => !c.warning && c.caution.length > 0)
    .map((c) => ({ symbol: c.symbol, name: c.name, upbitPremium: snapshots[c.symbol]?.upbitPremium ?? null }));

  const newListingHighPremiumCount = newListingHighPremiumCoins.length;
  const overall = calcOverallSignal(fng?.value ?? null, usdKrw, premiumAlertCount, cautionCount, newListingHighPremiumCount);

  const fngInfo = fng !== null
    ? fngLabel(fng.value)
    : { text: "로딩 중", color: COLORS.muted, bg: rgba(COLORS.muted, 0.08), border: rgba(COLORS.muted, 0.20) };

  const krwInfo       = usdKrwSignal(usdKrw);
  const premiumStyle  = getPremiumCountStyle(premiumAlertCount);
  const cautionStyle  = getCautionCountStyle(cautionCount);
  const newListStyle  = getNewListingCountStyle(newListingHighPremiumCount);

  return (
    <div
      style={{
        background: "#0d1117",
        border: `1px solid ${overall.levelBorder}`,
        borderRadius: 14,
        padding: "16px",
        marginBottom: 18,
        boxShadow: `0 0 20px ${overall.levelColor}10`,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={14} color={overall.levelColor} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>시장 신호 패널</span>
          <span style={{ fontSize: 11, color: "#5c6370" }}>김치프리미엄 급등 가능성 분석</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: overall.levelBg,
            border: `1px solid ${overall.levelBorder}`,
            borderRadius: 10,
            padding: "6px 14px",
          }}
        >
          <span style={{ fontSize: 14 }}>{overall.emoji}</span>
          <div>
            <div style={{ fontSize: 10, color: "#7d8590", fontWeight: 500 }}>급등 가능성</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: overall.levelColor }}>{overall.level}</div>
          </div>
        </div>
      </div>

      {/* 카드 목록 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* 공포탐욕지수 */}
        <SignalCard
          icon="😱" title="공포탐욕지수"
          value={fng !== null ? fng.value : "—"}
          subText={fngInfo.text}
          color={fngInfo.color} bg={fngInfo.bg} border={fngInfo.border}
          description={
            fng !== null
              ? fng.value >= 55 ? "탐욕 → 한국 투자자 FOMO 증가"
              : fng.value <= 44 ? "공포 → 역프리미엄 가능성"
              : "중립 상태"
              : "데이터 로딩 중"
          }
        />

        {/* USD/KRW 환율 */}
        <SignalCard
          icon="💱" title="USD/KRW 환율"
          value={usdKrw !== null ? usdKrw.toFixed(0) + "원" : "—"}
          subText={krwInfo.text}
          color={krwInfo.color} bg={krwInfo.bg} border={krwInfo.border}
          description={
            usdKrw !== null
              ? usdKrw >= 1380 ? "원화 약세 → 코인 매수 증가 요인" : "환율 안정 상태"
              : "데이터 로딩 중"
          }
        />

        {/* 프리미엄 감지 */}
        <ExpandableCard
          isOpen={openCard === "premium"}
          canOpen={premiumAlertCount > 0}
          onToggle={() => toggle("premium")}
        >
          <SignalCard
            icon="📈"
            title={`프리미엄 감지${premiumAlertCount > 0 ? " (클릭)" : ""}`}
            value={`${premiumAlertCount}개`}
            subText={premiumStyle.subText}
            color={premiumStyle.color} bg={premiumStyle.bg}
            border={openCard === "premium" ? premiumStyle.color : premiumStyle.border}
            description={premiumAlertCount > 0 ? `${high}% 이상 프리미엄 코인 ${premiumAlertCount}개` : "프리미엄 알림 없음"}
          />
          {openCard === "premium" && (
            <ExpandedList color={premiumStyle.color} label="프리미엄 감지 코인 (높은 순)">
              <CoinTagList coins={premiumAlertCoins} color={premiumStyle.color} max={12} />
            </ExpandedList>
          )}
        </ExpandableCard>

        {/* 거래량 급등 */}
        <ExpandableCard
          isOpen={openCard === "caution"}
          canOpen={cautionCount > 0}
          onToggle={() => toggle("caution")}
        >
          <SignalCard
            icon="⚠️"
            title={`거래량 급등${cautionCount > 0 ? " (클릭)" : ""}`}
            value={`${cautionCount}개`}
            subText={cautionStyle.subText}
            color={cautionStyle.color} bg={cautionStyle.bg}
            border={openCard === "caution" ? cautionStyle.color : cautionStyle.border}
            description={cautionCount > 0 ? `가격급변·거래량급등 주의 코인 ${cautionCount}개` : "주의 코인 없음"}
          />
          {openCard === "caution" && (
            <ExpandedList color={cautionStyle.color} label="거래량 급등 주의 코인">
              <CoinTagList coins={cautionCoins} color={cautionStyle.color} max={12} />
            </ExpandedList>
          )}
        </ExpandableCard>

        {/* 국내전용 급등 */}
        <ExpandableCard
          isOpen={openCard === "new"}
          canOpen={newListingHighPremiumCount > 0}
          onToggle={() => toggle("new")}
        >
          <SignalCard
            icon="🆕"
            title={`국내전용 급등${newListingHighPremiumCount > 0 ? " (클릭)" : ""}`}
            value={`${newListingHighPremiumCount}개`}
            subText={newListStyle.subText}
            color={newListStyle.color} bg={newListStyle.bg}
            border={openCard === "new" ? newListStyle.color : newListStyle.border}
            description="바이낸스 미상장 → 차익거래 불가 → 프리미엄 극대화"
          />
          {openCard === "new" && (
            <ExpandedList color={COLORS.danger} label="국내전용 프리미엄 코인 (높은 순)">
              <CoinTagList coins={newListingHighPremiumCoins} color={COLORS.danger} max={12} />
            </ExpandedList>
          )}
        </ExpandableCard>
      </div>

      {/* 감지된 신호 목록 */}
      {overall.reasons.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: `${overall.levelColor}08`,
            border: `1px solid ${overall.levelColor}20`,
            borderRadius: 8,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, color: "#7d8590", fontWeight: 600, whiteSpace: "nowrap" }}>
            감지된 신호:
          </span>
          {overall.reasons.map((r, i) => (
            <span
              key={i}
              style={{
                fontSize: 11,
                color: overall.levelColor,
                background: `${overall.levelColor}15`,
                border: `1px solid ${overall.levelColor}30`,
                borderRadius: 999,
                padding: "2px 8px",
                fontWeight: 600,
              }}
            >
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 내부 헬퍼 컴포넌트 ──────────────────────────────────────

function ExpandableCard({ isOpen, canOpen, onToggle, children }) {
  return (
    <div
      onClick={() => canOpen && onToggle()}
      style={{ cursor: canOpen ? "pointer" : "default", flex: "1 1 150px", minWidth: 140 }}
    >
      {children}
    </div>
  );
}

function ExpandedList({ color, label, children }) {
  return (
    <div
      style={{
        marginTop: 6,
        padding: "10px 12px",
        background: `${color}08`,
        border: `1px solid ${color}25`,
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 10, color: "#7d8590", marginBottom: 6, fontWeight: 600 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
