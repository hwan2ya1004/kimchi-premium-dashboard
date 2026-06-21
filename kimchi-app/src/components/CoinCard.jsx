// ============================================================
// 코인 카드 컴포넌트
// ============================================================

import { COLORS, rgba } from "../constants/colors.js";
import { WarningBadge, CautionBadge, NewListingBadge } from "./Badges.jsx";
import ExchangeRow from "./ExchangeRow.jsx";

export default function CoinCard({ coin, name, snapshot, high, low, usdKrw, warning, caution, isNewListing, isHot }) {
  const binanceKrw   = snapshot?.binance != null && usdKrw != null ? snapshot.binance * usdKrw : null;
  const upbitAlert   = snapshot?.upbitPremium   != null && (snapshot.upbitPremium   >= high || snapshot.upbitPremium   <= low);
  const bithumbAlert = snapshot?.bithumbPremium != null && (snapshot.bithumbPremium >= high || snapshot.bithumbPremium <= low);
  const hasPremiumAlert = upbitAlert || bithumbAlert;

  const premiumValue  = snapshot?.upbitPremium ?? snapshot?.bithumbPremium ?? null;
  const isHighPremium = premiumValue !== null && premiumValue >= high;
  const isLowPremium  = premiumValue !== null && premiumValue <= low;

  // 카드 테두리 / 글로우
  let borderColor = "#1c2128";
  let cardGlow    = "none";
  if (warning)          { borderColor = "rgba(255,59,59,0.6)";  cardGlow = "0 0 12px rgba(255,59,59,0.15)"; }
  else if (isHighPremium) { borderColor = "rgba(255,93,93,0.6)";  cardGlow = "0 0 16px rgba(255,93,93,0.2)"; }
  else if (isLowPremium)  { borderColor = "rgba(93,155,255,0.6)"; cardGlow = "0 0 16px rgba(93,155,255,0.2)"; }
  else if (caution.length > 0) { borderColor = "rgba(255,180,0,0.4)"; }

  // 카드 배경
  const cardBg = warning
    ? "linear-gradient(135deg, #11151a 0%, #1a1010 100%)"
    : isHighPremium
    ? "linear-gradient(135deg, #11151a 0%, #1a1115 100%)"
    : isLowPremium
    ? "linear-gradient(135deg, #11151a 0%, #101520 100%)"
    : "#11151a";

  return (
    <div
      style={{
        background: cardBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        padding: "14px 16px",
        transition: "border-color 0.4s ease, box-shadow 0.4s ease",
        boxShadow: cardGlow,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 상단 프리미엄 인디케이터 바 */}
      {hasPremiumAlert && (
        <div
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0,
            height: 3,
            background: isHighPremium
              ? "linear-gradient(90deg, #ff5d5d, #ff8a8a)"
              : "linear-gradient(90deg, #5d9bff, #8ab8ff)",
            borderRadius: "12px 12px 0 0",
          }}
        />
      )}

      {/* 코인 헤더 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 심볼 + 이름 */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: "#e6edf3", fontWeight: 700, letterSpacing: 0.3 }}>
              {coin}
            </span>
            <span style={{ fontSize: 11.5, color: "#5c6370", fontWeight: 500 }}>{name}</span>
          </div>

          {/* 뱃지 목록 */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {isHot && (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  background: rgba(COLORS.hot, 0.18), border: `1px solid ${rgba(COLORS.hot, 0.55)}`,
                  color: COLORS.hot, fontSize: 10, fontWeight: 700,
                  padding: "2px 7px", borderRadius: 999, letterSpacing: 0.3, whiteSpace: "nowrap",
                }}
              >
                🔥 급등+역프리미엄
              </span>
            )}
            {warning && <WarningBadge />}
            {!warning && caution.length > 0 && <CautionBadge reasons={caution} />}
            {isNewListing && <NewListingBadge />}
            {hasPremiumAlert && (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  background: isHighPremium ? rgba(COLORS.danger, 0.15) : rgba(COLORS.info, 0.15),
                  border: `1px solid ${isHighPremium ? rgba(COLORS.danger, 0.50) : rgba(COLORS.info, 0.50)}`,
                  color: isHighPremium ? COLORS.danger : COLORS.info,
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.3,
                }}
              >
                {isHighPremium ? "📈 김치프리미엄" : "📉 역프리미엄"}
              </span>
            )}
          </div>
        </div>

        {/* 바이낸스 기준가 */}
        {binanceKrw != null && (
          <div
            style={{
              textAlign: "right", fontSize: 11, color: "#4a525c",
              fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.5,
              flexShrink: 0, marginLeft: 8,
            }}
          >
            <div>바이낸스</div>
            <div style={{ color: "#6a737d" }}>
              {binanceKrw.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원
            </div>
          </div>
        )}
      </div>

      {/* 거래소별 시세 */}
      {!snapshot ? (
        <div style={{ color: "#3a4048", fontSize: 12, padding: "8px 0" }}>불러오는 중…</div>
      ) : (
        <div>
          <ExchangeRow
            label="업비트"
            price={snapshot.upbit}
            premium={snapshot.upbitPremium}
            high={high} low={low}
            failed={snapshot.upbit == null}
          />
          <ExchangeRow
            label="빗썸"
            price={snapshot.bithumb}
            premium={snapshot.bithumbPremium}
            high={high} low={low}
            failed={snapshot.bithumb == null}
          />
        </div>
      )}
    </div>
  );
}
