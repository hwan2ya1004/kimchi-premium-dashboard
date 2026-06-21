import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertTriangle, Wifi, WifiOff, Settings2, TrendingUp, TrendingDown, Zap, Bell } from "lucide-react";

// ============================================================
// 설정 기본값
// ============================================================
const DEFAULT_HIGH = 3.0;
const DEFAULT_LOW = -1.0;
const REFRESH_MS = 30000;

// 텔레그램 설정 (.env에서 읽기)
const TG_BOT_TOKEN = import.meta.env.VITE_TG_BOT_TOKEN || "";
const TG_CHAT_ID = import.meta.env.VITE_TG_CHAT_ID || "";

// 주의 사유 한글 매핑
const CAUTION_LABELS = {
  PRICE_FLUCTUATIONS: "가격 급변",
  TRADING_VOLUME_SOARING: "거래량 급등",
  DEPOSIT_AMOUNT_SOARING: "입금량 급등",
  GLOBAL_PRICE_DIFFERENCES: "글로벌 가격 차이",
  CONCENTRATION_OF_SMALL_ACCOUNTS: "소액 계좌 집중",
};

// ============================================================
// 거래소별 시세 조회
// ============================================================

async function fetchUpbitMarkets() {
  const res = await fetch("https://api.upbit.com/v1/market/all?isDetails=true");
  if (!res.ok) throw new Error("upbit markets");
  const data = await res.json();
  return data
    .filter((m) => m.market.startsWith("KRW-"))
    .map((m) => {
      const event = m.market_event || {};
      const cautionKeys = Object.entries(event.caution || {})
        .filter(([, v]) => v)
        .map(([k]) => k);
      return {
        symbol: m.market.replace("KRW-", ""),
        name: m.korean_name,
        warning: event.warning === true,
        caution: cautionKeys,
      };
    });
}

async function fetchUpbitBatch(symbols) {
  const markets = symbols.map((s) => `KRW-${s}`).join(",");
  const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${markets}`);
  if (!res.ok) throw new Error("upbit batch");
  const data = await res.json();
  const map = {};
  data.forEach((d) => {
    const sym = d.market.replace("KRW-", "");
    map[sym] = d.trade_price;
  });
  return map;
}

async function fetchBithumbAll() {
  const res = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW");
  if (!res.ok) throw new Error("bithumb all");
  const data = await res.json();
  const map = {};
  if (data.status === "0000") {
    Object.entries(data.data).forEach(([key, val]) => {
      if (key !== "date" && val?.closing_price) {
        map[key] = parseFloat(val.closing_price);
      }
    });
  }
  return map;
}

async function fetchBinanceAll() {
  const res = await fetch("https://api.binance.com/api/v3/ticker/price");
  if (!res.ok) throw new Error("binance all");
  const data = await res.json();
  const map = {};
  data.forEach((d) => {
    if (d.symbol.endsWith("USDT")) {
      const sym = d.symbol.replace("USDT", "");
      map[sym] = parseFloat(d.price);
    }
  });
  return map;
}

async function fetchUsdKrw() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error("fx");
  const data = await res.json();
  return data.rates.KRW;
}

async function fetchFearGreed() {
  const res = await fetch("https://api.alternative.me/fng/?limit=1");
  if (!res.ok) throw new Error("fng");
  const data = await res.json();
  const item = data.data?.[0];
  if (!item) throw new Error("fng empty");
  return {
    value: parseInt(item.value, 10),
    classification: item.value_classification,
  };
}

function calcPremium(domesticKrw, globalUsdt, usdKrw) {
  const globalKrw = globalUsdt * usdKrw;
  return ((domesticKrw - globalKrw) / globalKrw) * 100;
}

// ============================================================
// 텔레그램 알림 전송 함수
// ============================================================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegramMessage(text) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.description || `HTTP ${res.status}`);
  }
  return res.json();
}

// ============================================================
// 신호 패널 컴포넌트
// ============================================================

function fngLabel(value) {
  if (value <= 24) return { text: "극도 공포", color: "#5d9bff", bg: "rgba(93,155,255,0.12)", border: "rgba(93,155,255,0.35)" };
  if (value <= 44) return { text: "공포", color: "#8ab8ff", bg: "rgba(138,184,255,0.10)", border: "rgba(138,184,255,0.3)" };
  if (value <= 54) return { text: "중립", color: "#9198a1", bg: "rgba(145,152,161,0.10)", border: "rgba(145,152,161,0.25)" };
  if (value <= 74) return { text: "탐욕", color: "#ffb400", bg: "rgba(255,180,0,0.12)", border: "rgba(255,180,0,0.35)" };
  return { text: "극도 탐욕", color: "#ff5d5d", bg: "rgba(255,93,93,0.12)", border: "rgba(255,93,93,0.35)" };
}

function usdKrwSignal(rate) {
  if (rate === null) return { text: "—", color: "#5c6370", bg: "rgba(92,99,112,0.08)", border: "rgba(92,99,112,0.2)", score: 0 };
  if (rate >= 1420) return { text: "원화 급약세", color: "#ff5d5d", bg: "rgba(255,93,93,0.12)", border: "rgba(255,93,93,0.35)", score: 2 };
  if (rate >= 1380) return { text: "원화 약세", color: "#ffb400", bg: "rgba(255,180,0,0.12)", border: "rgba(255,180,0,0.35)", score: 1 };
  return { text: "정상", color: "#4caf6e", bg: "rgba(76,175,110,0.10)", border: "rgba(76,175,110,0.3)", score: 0 };
}

function SignalCard({ icon, title, value, subText, color, bg, border, description }) {
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
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 11, color: "#7d8590", fontWeight: 500 }}>{title}</span>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 11, fontWeight: 700, color,
          background: `${color}18`, border: `1px solid ${color}30`,
          borderRadius: 999, padding: "2px 8px",
          display: "inline-block", alignSelf: "flex-start",
        }}
      >
        {subText}
      </div>
      {description && (
        <div style={{ fontSize: 10, color: "#5c6370", lineHeight: 1.5, marginTop: 2 }}>
          {description}
        </div>
      )}
    </div>
  );
}

function calcOverallSignal(fng, usdKrw, premiumAlertCount, cautionCount, newListingHighPremiumCount) {
  let score = 0;
  const reasons = [];

  if (fng !== null) {
    if (fng >= 75) { score += 3; reasons.push("극도 탐욕 상태"); }
    else if (fng >= 55) { score += 2; reasons.push("탐욕 상태"); }
    else if (fng <= 24) { score -= 1; reasons.push("극도 공포 (역프리미엄 가능)"); }
  }

  if (usdKrw !== null) {
    if (usdKrw >= 1420) { score += 2; reasons.push("원화 급약세"); }
    else if (usdKrw >= 1380) { score += 1; reasons.push("원화 약세"); }
  }

  if (premiumAlertCount >= 10) { score += 3; reasons.push(`${premiumAlertCount}개 코인 프리미엄 급등`); }
  else if (premiumAlertCount >= 5) { score += 2; reasons.push(`${premiumAlertCount}개 코인 프리미엄 상승`); }
  else if (premiumAlertCount >= 2) { score += 1; reasons.push(`${premiumAlertCount}개 코인 프리미엄 감지`); }

  if (cautionCount >= 10) { score += 2; reasons.push("다수 코인 거래량 급등"); }
  else if (cautionCount >= 5) { score += 1; reasons.push("일부 코인 거래량 급등"); }

  if (newListingHighPremiumCount >= 3) { score += 2; reasons.push("국내전용 코인 프리미엄 급등"); }
  else if (newListingHighPremiumCount >= 1) { score += 1; reasons.push("국내전용 코인 프리미엄 발생"); }

  let level, levelColor, levelBg, levelBorder, emoji;
  if (score >= 7) {
    level = "매우 높음"; emoji = "🔴";
    levelColor = "#ff5d5d"; levelBg = "rgba(255,93,93,0.10)"; levelBorder = "rgba(255,93,93,0.4)";
  } else if (score >= 4) {
    level = "높음"; emoji = "🟠";
    levelColor = "#ff8c42"; levelBg = "rgba(255,140,66,0.10)"; levelBorder = "rgba(255,140,66,0.4)";
  } else if (score >= 2) {
    level = "보통"; emoji = "🟡";
    levelColor = "#ffb400"; levelBg = "rgba(255,180,0,0.10)"; levelBorder = "rgba(255,180,0,0.35)";
  } else if (score >= 0) {
    level = "낮음"; emoji = "🟢";
    levelColor = "#4caf6e"; levelBg = "rgba(76,175,110,0.08)"; levelBorder = "rgba(76,175,110,0.3)";
  } else {
    level = "역프리미엄 주의"; emoji = "🔵";
    levelColor = "#5d9bff"; levelBg = "rgba(93,155,255,0.08)"; levelBorder = "rgba(93,155,255,0.3)";
  }

  return { score, level, emoji, levelColor, levelBg, levelBorder, reasons };
}

function CoinTagList({ coins, color, max = 8 }) {
  if (!coins || coins.length === 0) return null;
  const shown = coins.slice(0, max);
  const rest = coins.length - max;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
      {shown.map((c) => (
        <span
          key={c.symbol}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10, fontWeight: 700, color,
            background: `${color}15`, border: `1px solid ${color}30`,
            borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap",
          }}
          title={`${c.name} | 업비트 ${c.upbitPremium != null ? (c.upbitPremium > 0 ? "+" : "") + c.upbitPremium.toFixed(2) + "%" : "—"}`}
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
        <span style={{ fontSize: 10, color: "#5c6370", padding: "2px 4px" }}>+{rest}개</span>
      )}
    </div>
  );
}

function SignalPanel({ fng, usdKrw, premiumAlertCount, cautionCount, coinList, snapshots, binanceSymbols, high, low }) {
  const [openCard, setOpenCard] = React.useState(null);

  const newListingHighPremiumCoins = coinList
    .filter((c) => {
      if (binanceSymbols.has(c.symbol)) return false;
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      return (snap.upbitPremium !== null && snap.upbitPremium >= high) ||
             (snap.bithumbPremium !== null && snap.bithumbPremium >= high);
    })
    .map((c) => ({
      symbol: c.symbol, name: c.name,
      upbitPremium: snapshots[c.symbol]?.upbitPremium ?? snapshots[c.symbol]?.bithumbPremium ?? null,
    }))
    .sort((a, b) => (b.upbitPremium ?? -999) - (a.upbitPremium ?? -999));

  const premiumAlertCoins = coinList
    .filter((c) => {
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      return (snap.upbitPremium !== null && (snap.upbitPremium >= high || snap.upbitPremium <= low)) ||
             (snap.bithumbPremium !== null && (snap.bithumbPremium >= high || snap.bithumbPremium <= low));
    })
    .map((c) => ({
      symbol: c.symbol, name: c.name,
      upbitPremium: snapshots[c.symbol]?.upbitPremium ?? snapshots[c.symbol]?.bithumbPremium ?? null,
    }))
    .sort((a, b) => (b.upbitPremium ?? -999) - (a.upbitPremium ?? -999));

  const cautionCoins = coinList
    .filter((c) => !c.warning && c.caution.length > 0)
    .map((c) => ({ symbol: c.symbol, name: c.name, upbitPremium: snapshots[c.symbol]?.upbitPremium ?? null }));

  const newListingHighPremiumCount = newListingHighPremiumCoins.length;
  const overall = calcOverallSignal(fng?.value ?? null, usdKrw, premiumAlertCount, cautionCount, newListingHighPremiumCount);

  const fngInfo = fng !== null
    ? fngLabel(fng.value)
    : { text: "로딩 중", color: "#5c6370", bg: "rgba(92,99,112,0.08)", border: "rgba(92,99,112,0.2)" };

  const krwInfo = usdKrwSignal(usdKrw);

  const premiumColor = premiumAlertCount >= 10 ? "#ff5d5d" : premiumAlertCount >= 5 ? "#ffb400" : "#4caf6e";
  const premiumBg = premiumAlertCount >= 10 ? "rgba(255,93,93,0.12)" : premiumAlertCount >= 5 ? "rgba(255,180,0,0.12)" : "rgba(76,175,110,0.10)";
  const premiumBorder = premiumAlertCount >= 10 ? "rgba(255,93,93,0.35)" : premiumAlertCount >= 5 ? "rgba(255,180,0,0.35)" : "rgba(76,175,110,0.3)";
  const premiumSubText = premiumAlertCount >= 10 ? "과열 주의" : premiumAlertCount >= 5 ? "상승 중" : "정상";

  const cautionColor = cautionCount >= 10 ? "#ff5d5d" : cautionCount >= 5 ? "#ffb400" : "#9198a1";
  const cautionBg = cautionCount >= 10 ? "rgba(255,93,93,0.12)" : cautionCount >= 5 ? "rgba(255,180,0,0.12)" : "rgba(145,152,161,0.08)";
  const cautionBorder = cautionCount >= 10 ? "rgba(255,93,93,0.35)" : cautionCount >= 5 ? "rgba(255,180,0,0.35)" : "rgba(145,152,161,0.2)";
  const cautionSubText = cautionCount >= 10 ? "급등 다수" : cautionCount >= 5 ? "주의 필요" : "정상";

  const toggle = (key) => setOpenCard((prev) => (prev === key ? null : key));

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={14} color={overall.levelColor} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>시장 신호 패널</span>
          <span style={{ fontSize: 11, color: "#5c6370" }}>김치프리미엄 급등 가능성 분석</span>
        </div>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: overall.levelBg, border: `1px solid ${overall.levelBorder}`,
            borderRadius: 10, padding: "6px 14px",
          }}
        >
          <span style={{ fontSize: 14 }}>{overall.emoji}</span>
          <div>
            <div style={{ fontSize: 10, color: "#7d8590", fontWeight: 500 }}>급등 가능성</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: overall.levelColor }}>{overall.level}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <SignalCard
          icon="😱" title="공포탐욕지수"
          value={fng !== null ? fng.value : "—"}
          subText={fngInfo.text} color={fngInfo.color} bg={fngInfo.bg} border={fngInfo.border}
          description={fng !== null ? (fng.value >= 55 ? "탐욕 → 한국 투자자 FOMO 증가" : fng.value <= 44 ? "공포 → 역프리미엄 가능성" : "중립 상태") : "데이터 로딩 중"}
        />
        <SignalCard
          icon="💱" title="USD/KRW 환율"
          value={usdKrw !== null ? usdKrw.toFixed(0) + "원" : "—"}
          subText={krwInfo.text} color={krwInfo.color} bg={krwInfo.bg} border={krwInfo.border}
          description={usdKrw !== null ? (usdKrw >= 1380 ? "원화 약세 → 코인 매수 증가 요인" : "환율 안정 상태") : "데이터 로딩 중"}
        />

        <div
          onClick={() => premiumAlertCount > 0 && toggle("premium")}
          style={{ cursor: premiumAlertCount > 0 ? "pointer" : "default", flex: "1 1 150px", minWidth: 140 }}
        >
          <SignalCard
            icon="📈" title={`프리미엄 감지${premiumAlertCount > 0 ? " (클릭)" : ""}`}
            value={`${premiumAlertCount}개`} subText={premiumSubText}
            color={premiumColor} bg={premiumBg}
            border={openCard === "premium" ? premiumColor : premiumBorder}
            description={premiumAlertCount > 0 ? `${high}% 이상 프리미엄 코인 ${premiumAlertCount}개` : "프리미엄 알림 없음"}
          />
          {openCard === "premium" && (
            <div style={{ marginTop: 6, padding: "10px 12px", background: `${premiumColor}08`, border: `1px solid ${premiumColor}25`, borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: "#7d8590", marginBottom: 6, fontWeight: 600 }}>프리미엄 감지 코인 (높은 순)</div>
              <CoinTagList coins={premiumAlertCoins} color={premiumColor} max={12} />
            </div>
          )}
        </div>

        <div
          onClick={() => cautionCount > 0 && toggle("caution")}
          style={{ cursor: cautionCount > 0 ? "pointer" : "default", flex: "1 1 150px", minWidth: 140 }}
        >
          <SignalCard
            icon="⚠️" title={`거래량 급등${cautionCount > 0 ? " (클릭)" : ""}`}
            value={`${cautionCount}개`} subText={cautionSubText}
            color={cautionColor} bg={cautionBg}
            border={openCard === "caution" ? cautionColor : cautionBorder}
            description={cautionCount > 0 ? `가격급변·거래량급등 주의 코인 ${cautionCount}개` : "주의 코인 없음"}
          />
          {openCard === "caution" && (
            <div style={{ marginTop: 6, padding: "10px 12px", background: `${cautionColor}08`, border: `1px solid ${cautionColor}25`, borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: "#7d8590", marginBottom: 6, fontWeight: 600 }}>거래량 급등 주의 코인</div>
              <CoinTagList coins={cautionCoins} color={cautionColor} max={12} />
            </div>
          )}
        </div>

        <div
          onClick={() => newListingHighPremiumCount > 0 && toggle("new")}
          style={{ cursor: newListingHighPremiumCount > 0 ? "pointer" : "default", flex: "1 1 150px", minWidth: 140 }}
        >
          <SignalCard
            icon="🆕" title={`국내전용 급등${newListingHighPremiumCount > 0 ? " (클릭)" : ""}`}
            value={`${newListingHighPremiumCount}개`}
            subText={newListingHighPremiumCount >= 3 ? "차익불가 급등" : newListingHighPremiumCount >= 1 ? "일부 급등" : "정상"}
            color={newListingHighPremiumCount >= 3 ? "#ff5d5d" : newListingHighPremiumCount >= 1 ? "#ffb400" : "#9198a1"}
            bg={newListingHighPremiumCount >= 3 ? "rgba(255,93,93,0.12)" : newListingHighPremiumCount >= 1 ? "rgba(255,180,0,0.12)" : "rgba(145,152,161,0.08)"}
            border={openCard === "new"
              ? (newListingHighPremiumCount >= 3 ? "#ff5d5d" : "#ffb400")
              : (newListingHighPremiumCount >= 3 ? "rgba(255,93,93,0.35)" : newListingHighPremiumCount >= 1 ? "rgba(255,180,0,0.35)" : "rgba(145,152,161,0.2)")}
            description="바이낸스 미상장 → 차익거래 불가 → 프리미엄 극대화"
          />
          {openCard === "new" && (
            <div style={{ marginTop: 6, padding: "10px 12px", background: "rgba(255,93,93,0.06)", border: "1px solid rgba(255,93,93,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: "#7d8590", marginBottom: 6, fontWeight: 600 }}>국내전용 프리미엄 코인 (높은 순)</div>
              <CoinTagList coins={newListingHighPremiumCoins} color="#ff5d5d" max={12} />
            </div>
          )}
        </div>
      </div>

      {overall.reasons.length > 0 && (
        <div
          style={{
            marginTop: 12, padding: "10px 14px",
            background: `${overall.levelColor}08`, border: `1px solid ${overall.levelColor}20`,
            borderRadius: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
          }}
        >
          <span style={{ fontSize: 11, color: "#7d8590", fontWeight: 600, whiteSpace: "nowrap" }}>감지된 신호:</span>
          {overall.reasons.map((r, i) => (
            <span
              key={i}
              style={{
                fontSize: 11, color: overall.levelColor,
                background: `${overall.levelColor}15`, border: `1px solid ${overall.levelColor}30`,
                borderRadius: 999, padding: "2px 8px", fontWeight: 600,
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

// ============================================================
// 작은 단위 컴포넌트
// ============================================================
function PremiumPill({ value, high, low }) {
  const isHigh = value >= high;
  const isLow = value <= low;
  const color = isHigh ? "#ff5d5d" : isLow ? "#5d9bff" : "#7d8590";
  const bg = isHigh ? "rgba(255,93,93,0.15)" : isLow ? "rgba(93,155,255,0.15)" : "rgba(125,133,144,0.10)";
  return (
    <span
      style={{
        color, background: bg,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12, fontWeight: 700,
        padding: "2px 8px", borderRadius: 999,
        letterSpacing: 0.2, whiteSpace: "nowrap",
        border: (isHigh || isLow) ? `1px solid ${color}40` : "1px solid transparent",
      }}
    >
      {value > 0 ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function WarningBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255, 59, 59, 0.15)", border: "1px solid rgba(255, 59, 59, 0.5)", color: "#ff5d5d", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      🚨 상장폐지위험
    </span>
  );
}

function CautionBadge({ reasons }) {
  const label = reasons.length === 1 ? CAUTION_LABELS[reasons[0]] || reasons[0] : `주의 ${reasons.length}건`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255, 180, 0, 0.12)", border: "1px solid rgba(255, 180, 0, 0.4)", color: "#ffb400", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      ⚠️ {label}
    </span>
  );
}

function NewListingBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(76, 175, 110, 0.12)", border: "1px solid rgba(76, 175, 110, 0.4)", color: "#4caf6e", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      🆕 국내전용
    </span>
  );
}

function ExchangeRow({ label, price, premium, high, low, failed }) {
  const isAlert = premium !== null && (premium >= high || premium <= low);
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "60px 1fr auto",
        alignItems: "center", padding: "7px 0",
        borderBottom: "1px solid #1c2128", gap: 8,
        background: isAlert ? "rgba(255,93,93,0.03)" : "transparent",
        borderRadius: 4,
      }}
    >
      <span style={{ color: "#9198a1", fontSize: 12, fontWeight: 500 }}>{label}</span>
      {failed ? (
        <span style={{ color: "#3a4048", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>—</span>
      ) : (
        <span style={{ color: "#e6edf3", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: isAlert ? 700 : 500 }}>
          {price != null ? price.toLocaleString("ko-KR", { maximumFractionDigits: 0 }) + "원" : "—"}
        </span>
      )}
      {!failed && premium !== null && <PremiumPill value={premium} high={high} low={low} />}
    </div>
  );
}

function CoinCard({ coin, name, snapshot, high, low, usdKrw, warning, caution, isNewListing, isHot }) {
  const binanceKrw = snapshot?.binance != null && usdKrw != null ? snapshot.binance * usdKrw : null;
  const upbitAlert = snapshot?.upbitPremium != null && (snapshot.upbitPremium >= high || snapshot.upbitPremium <= low);
  const bithumbAlert = snapshot?.bithumbPremium != null && (snapshot.bithumbPremium >= high || snapshot.bithumbPremium <= low);
  const hasPremiumAlert = upbitAlert || bithumbAlert;
  const premiumValue = snapshot?.upbitPremium ?? snapshot?.bithumbPremium ?? null;
  const isHighPremium = premiumValue !== null && premiumValue >= high;
  const isLowPremium = premiumValue !== null && premiumValue <= low;

  let borderColor = "#1c2128";
  let cardGlow = "none";
  if (warning) { borderColor = "rgba(255, 59, 59, 0.6)"; cardGlow = "0 0 12px rgba(255, 59, 59, 0.15)"; }
  else if (isHighPremium) { borderColor = "rgba(255, 93, 93, 0.6)"; cardGlow = "0 0 16px rgba(255, 93, 93, 0.2)"; }
  else if (isLowPremium) { borderColor = "rgba(93, 155, 255, 0.6)"; cardGlow = "0 0 16px rgba(93, 155, 255, 0.2)"; }
  else if (caution.length > 0) { borderColor = "rgba(255, 180, 0, 0.4)"; }

  return (
    <div
      style={{
        background: warning ? "linear-gradient(135deg, #11151a 0%, #1a1010 100%)"
          : isHighPremium ? "linear-gradient(135deg, #11151a 0%, #1a1115 100%)"
          : isLowPremium ? "linear-gradient(135deg, #11151a 0%, #101520 100%)"
          : "#11151a",
        border: `1px solid ${borderColor}`,
        borderRadius: 12, padding: "14px 16px",
        transition: "border-color 0.4s ease, box-shadow 0.4s ease",
        boxShadow: cardGlow, position: "relative", overflow: "hidden",
      }}
    >
      {hasPremiumAlert && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: isHighPremium ? "linear-gradient(90deg, #ff5d5d, #ff8a8a)" : "linear-gradient(90deg, #5d9bff, #8ab8ff)", borderRadius: "12px 12px 0 0" }} />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: "#e6edf3", fontWeight: 700, letterSpacing: 0.3 }}>
              {coin}
            </span>
            <span style={{ fontSize: 11.5, color: "#5c6370", fontWeight: 500 }}>{name}</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {isHot && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255, 107, 53, 0.18)", border: "1px solid rgba(255, 107, 53, 0.55)", color: "#ff6b35", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                🔥 급등+프리미엄
              </span>
            )}
            {warning && <WarningBadge />}
            {!warning && caution.length > 0 && <CautionBadge reasons={caution} />}
            {isNewListing && <NewListingBadge />}
            {hasPremiumAlert && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: isHighPremium ? "rgba(255, 93, 93, 0.15)" : "rgba(93, 155, 255, 0.15)", border: `1px solid ${isHighPremium ? "rgba(255,93,93,0.5)" : "rgba(93,155,255,0.5)"}`, color: isHighPremium ? "#ff5d5d" : "#5d9bff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.3 }}>
                {isHighPremium ? "📈 김치프리미엄" : "📉 역프리미엄"}
              </span>
            )}
          </div>
        </div>
        {binanceKrw != null && (
          <div style={{ textAlign: "right", fontSize: 11, color: "#4a525c", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.5, flexShrink: 0, marginLeft: 8 }}>
            <div>바이낸스</div>
            <div style={{ color: "#6a737d" }}>{binanceKrw.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원</div>
          </div>
        )}
      </div>

      {!snapshot ? (
        <div style={{ color: "#3a4048", fontSize: 12, padding: "8px 0" }}>불러오는 중…</div>
      ) : (
        <div>
          <ExchangeRow label="업비트" price={snapshot.upbit} premium={snapshot.upbitPremium} high={high} low={low} failed={snapshot.upbit == null} />
          <ExchangeRow label="빗썸" price={snapshot.bithumb} premium={snapshot.bithumbPremium} high={high} low={low} failed={snapshot.bithumb == null} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// 메인 대시보드
// ============================================================
export default function KimchiPremiumDashboard() {
  const [coinList, setCoinList] = useState([]);
  const [high, setHigh] = useState(DEFAULT_HIGH);
  const [low, setLow] = useState(DEFAULT_LOW);
  const [snapshots, setSnapshots] = useState({});
  const [usdKrw, setUsdKrw] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [online, setOnline] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState("premium_desc");
  const [fng, setFng] = useState(null);
  const [tgStatus, setTgStatus] = useState(null); // null | "ok" | "error"
  const [tgStatusMsg, setTgStatusMsg] = useState("");
  const prevPremiums = useRef({});
  const binanceSymbolsRef = useRef(new Set());
  const prevHotSymbolsRef = useRef(null);

  useEffect(() => {
    fetchUpbitMarkets()
      .then((list) => { setCoinList(list); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFearGreed().then(setFng).catch(() => {});
    const id = setInterval(() => { fetchFearGreed().then(setFng).catch(() => {}); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    if (coinList.length === 0) return;
    try {
      const [rate, upbitMap, bithumbMap, binanceMap] = await Promise.all([
        fetchUsdKrw(),
        fetchUpbitBatch(coinList.map((c) => c.symbol)),
        fetchBithumbAll(),
        fetchBinanceAll(),
      ]);

      setUsdKrw(rate);
      setOnline(true);
      binanceSymbolsRef.current = new Set(Object.keys(binanceMap));

      const results = coinList.map(({ symbol }) => {
        const upbit = upbitMap[symbol] ?? null;
        const bithumb = bithumbMap[symbol] ?? null;
        const binance = binanceMap[symbol] ?? null;
        const upbitPremium = upbit != null && binance != null ? calcPremium(upbit, binance, rate) : null;
        const bithumbPremium = bithumb != null && binance != null ? calcPremium(bithumb, binance, rate) : null;
        const prevHigh = prevPremiums.current[symbol]?.alertZone || false;
        const nowAlert =
          (upbitPremium !== null && (upbitPremium >= high || upbitPremium <= low)) ||
          (bithumbPremium !== null && (bithumbPremium >= high || bithumbPremium <= low));
        const flash = nowAlert && !prevHigh;
        prevPremiums.current[symbol] = { alertZone: nowAlert };
        return [symbol, { upbit, bithumb, binance, upbitPremium, bithumbPremium, flash }];
      });

      setSnapshots(Object.fromEntries(results));
      setLastUpdated(new Date());
    } catch (e) {
      setOnline(false);
    }
  }, [coinList, high, low]);

  useEffect(() => {
    if (coinList.length === 0) return;
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh, coinList]);

  // ============================================================
  // 텔레그램 알림: 급등+프리미엄 코인이 새로 감지될 때만 전송
  // ============================================================
  useEffect(() => {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
    if (Object.keys(snapshots).length === 0) return;

    const currentHotCoins = coinList.filter((c) => {
      if (c.warning) return false;
      const onlyVolumeSurge = c.caution.length === 1 && c.caution[0] === "TRADING_VOLUME_SOARING";
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      const premium = snap.upbitPremium !== null ? snap.upbitPremium : snap.bithumbPremium;
      return onlyVolumeSurge && premium !== null && premium < 0;
    });

    const currentHotSymbols = new Set(currentHotCoins.map((c) => c.symbol));

    if (prevHotSymbolsRef.current === null) {
      prevHotSymbolsRef.current = currentHotSymbols;
      return;
    }

    const newlyHotCoins = currentHotCoins.filter((c) => !prevHotSymbolsRef.current.has(c.symbol));
    prevHotSymbolsRef.current = currentHotSymbols;

    if (newlyHotCoins.length === 0) return;

    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const coinLines = newlyHotCoins
      .map((c) => {
        const snap = snapshots[c.symbol];
        const premium = snap?.upbitPremium !== null ? snap?.upbitPremium : snap?.bithumbPremium;
        const premiumStr = premium !== null ? `${premium.toFixed(2)}%` : "—";
        return `• <b>${escapeHtml(c.symbol)}</b> ${escapeHtml(c.name)} | 역프리미엄 ${premiumStr}`;
      })
      .join("\n");

    const message =
      `🔥 <b>급등+프리미엄 코인 감지!</b>\n\n` +
      `${coinLines}\n\n` +
      `⏰ ${now}\n` +
      `💡 거래량 급등 + 국내가 해외보다 싼 코인\n` +
      `📊 총 ${currentHotCoins.length}개 감지 중`;

    sendTelegramMessage(message)
      .then(() => {
        setTgStatus("ok");
        setTgStatusMsg(`✅ ${newlyHotCoins.length}개 코인 알림 전송 완료`);
        setTimeout(() => setTgStatus(null), 5000);
      })
      .catch((err) => {
        setTgStatus("error");
        setTgStatusMsg(`❌ 전송 실패: ${err.message}`);
        setTimeout(() => setTgStatus(null), 8000);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots]);

  const getCoinPremium = (symbol) => {
    const snap = snapshots[symbol];
    if (!snap) return null;
    if (snap.upbitPremium !== null) return snap.upbitPremium;
    if (snap.bithumbPremium !== null) return snap.bithumbPremium;
    return null;
  };

  const getFilteredCoins = () => {
    let list = coinList;

    if (activeTab === "warning") {
      list = list.filter((c) => c.warning);
    } else if (activeTab === "caution") {
      list = list.filter((c) => !c.warning && c.caution.length > 0);
    } else if (activeTab === "new") {
      list = list.filter((c) => !binanceSymbolsRef.current.has(c.symbol));
    } else if (activeTab === "premium") {
      list = list.filter((c) => {
        const snap = snapshots[c.symbol];
        if (!snap) return false;
        return (
          (snap.upbitPremium !== null && (snap.upbitPremium >= high || snap.upbitPremium <= low)) ||
          (snap.bithumbPremium !== null && (snap.bithumbPremium >= high || snap.bithumbPremium <= low))
        );
      });
    } else if (activeTab === "hot") {
      list = list.filter((c) => {
        if (c.warning) return false;
        const onlyVolumeSurge = c.caution.length === 1 && c.caution[0] === "TRADING_VOLUME_SOARING";
        const premium = getCoinPremium(c.symbol);
        return onlyVolumeSurge && premium !== null && premium < 0;
      });
    }

    const q = filterText.trim();
    if (q) {
      list = list.filter(({ symbol, name }) =>
        symbol.toUpperCase().includes(q.toUpperCase()) || name.includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      const pa = getCoinPremium(a.symbol);
      const pb = getCoinPremium(b.symbol);

      if (sortBy === "premium_desc") {
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pb - pa;
      } else if (sortBy === "premium_asc") {
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb;
      } else if (sortBy === "abs_desc") {
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return Math.abs(pb) - Math.abs(pa);
      } else if (sortBy === "alert_first") {
        const scoreA = a.warning ? 3 : a.caution.length > 0 ? 2 : (pa !== null && (pa >= high || pa <= low)) ? 1 : 0;
        const scoreB = b.warning ? 3 : b.caution.length > 0 ? 2 : (pb !== null && (pb >= high || pb <= low)) ? 1 : 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return Math.abs(pb) - Math.abs(pa);
      } else if (sortBy === "symbol_az") {
        return a.symbol.localeCompare(b.symbol);
      }
      return 0;
    });

    return list;
  };

  const filteredCoins = getFilteredCoins();

  const warningCount = coinList.filter((c) => c.warning).length;
  const cautionCount = coinList.filter((c) => !c.warning && c.caution.length > 0).length;
  const newListingCount = coinList.filter((c) => !binanceSymbolsRef.current.has(c.symbol)).length;
  const premiumAlertCount = coinList.filter((c) => {
    const snap = snapshots[c.symbol];
    if (!snap) return false;
    return (
      (snap.upbitPremium !== null && (snap.upbitPremium >= high || snap.upbitPremium <= low)) ||
      (snap.bithumbPremium !== null && (snap.bithumbPremium >= high || snap.bithumbPremium <= low))
    );
  }).length;

  const hotCount = coinList.filter((c) => {
    if (c.warning) return false;
    const onlyVolumeSurge = c.caution.length === 1 && c.caution[0] === "TRADING_VOLUME_SOARING";
    const premium = getCoinPremium(c.symbol);
    return onlyVolumeSurge && premium !== null && premium < 0;
  }).length;

  const tabs = [
    { id: "all", label: "전체", count: coinList.length, color: "#9198a1" },
    { id: "hot", label: "🔥 급등+프리미엄", count: hotCount, color: "#ff6b35" },
    { id: "premium", label: "📈 프리미엄", count: premiumAlertCount, color: "#ff5d5d" },
    { id: "warning", label: "🚨 폐지위험", count: warningCount, color: "#ff5d5d" },
    { id: "caution", label: "⚠️ 주의", count: cautionCount, color: "#ffb400" },
    { id: "new", label: "🆕 국내전용", count: newListingCount, color: "#4caf6e" },
  ];

  return (
    <div
      style={{
        minHeight: "100%",
        background: "#0a0d11",
        color: "#e6edf3",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "24px 20px",
        boxSizing: "border-box",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.2 }}>
              김치프리미엄 모니터
            </h1>
            {online ? <Wifi size={14} color="#4caf6e" /> : <WifiOff size={14} color="#ff5d5d" />}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7d8590" }}>
            업비트 전체{" "}
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#9198a1", fontWeight: 600 }}>
              {coinList.length}
            </span>
            개 코인 · USD/KRW{" "}
            {usdKrw ? (
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{usdKrw.toFixed(1)}</span>
            ) : "—"}
            {lastUpdated && (
              <> · 갱신 <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{lastUpdated.toLocaleTimeString("ko-KR")}</span></>
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* 텔레그램 연결 상태 배지 */}
          {TG_BOT_TOKEN && TG_CHAT_ID && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(76,175,110,0.12)", border: "1px solid rgba(76,175,110,0.4)", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: "#4caf6e", fontWeight: 700 }}>
              <Bell size={11} />
              텔레그램 ON
            </div>
          )}
          {/* 알림 전송 상태 */}
          {tgStatus && (
            <div style={{ fontSize: 11, color: tgStatus === "ok" ? "#4caf6e" : "#ff5d5d", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tgStatusMsg}
            </div>
          )}
          <button
            onClick={() => setShowSettings((s) => !s)}
            style={{ background: showSettings ? "#1f2937" : "#161b22", border: "1px solid #2a313c", borderRadius: 9, padding: "7px 10px", color: "#9198a1", cursor: "pointer", display: "flex", alignItems: "center" }}
            aria-label="설정"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={refresh}
            style={{ background: "#161b22", border: "1px solid #2a313c", borderRadius: 9, padding: "7px 10px", color: "#9198a1", cursor: "pointer", display: "flex", alignItems: "center" }}
            aria-label="새로고침"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 설정 패널 (알림 기준값만) */}
      {showSettings && (
        <div style={{ background: "#11151a", border: "1px solid #1c2128", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={{ fontSize: 11, color: "#7d8590", display: "block", marginBottom: 5 }}>
                코인 검색 (심볼 또는 한글명)
              </label>
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="예: BTC, 비트코인"
                style={{ width: "100%", background: "#0a0d11", border: "1px solid #2a313c", borderRadius: 8, padding: "7px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#7d8590", display: "block", marginBottom: 5 }}>
                상단 알림 기준(%)
              </label>
              <input
                type="number" step="0.1" value={high}
                onChange={(e) => setHigh(parseFloat(e.target.value))}
                style={{ width: 85, background: "#0a0d11", border: "1px solid #2a313c", borderRadius: 8, padding: "7px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#7d8590", display: "block", marginBottom: 5 }}>
                하단 알림 기준(%)
              </label>
              <input
                type="number" step="0.1" value={low}
                onChange={(e) => setLow(parseFloat(e.target.value))}
                style={{ width: 85, background: "#0a0d11", border: "1px solid #2a313c", borderRadius: 8, padding: "7px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 검색창 (항상 표시) */}
      {!showSettings && (
        <div style={{ marginBottom: 14 }}>
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="🔍  코인 검색 (심볼 또는 한글명)"
            style={{ width: "100%", maxWidth: 360, background: "#11151a", border: "1px solid #2a313c", borderRadius: 9, padding: "8px 12px", color: "#e6edf3", fontSize: 13, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", outline: "none" }}
          />
        </div>
      )}

      {/* 시장 신호 패널 */}
      <SignalPanel
        fng={fng} usdKrw={usdKrw}
        premiumAlertCount={premiumAlertCount} cautionCount={cautionCount}
        coinList={coinList} snapshots={snapshots}
        binanceSymbols={binanceSymbolsRef.current}
        high={high} low={low}
      />

      {/* 탭 필터 + 정렬 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? "#1c2128" : "transparent",
                border: activeTab === tab.id ? `1px solid ${tab.color}50` : "1px solid #1c2128",
                borderRadius: 8, padding: "5px 12px",
                color: activeTab === tab.id ? tab.color : "#5c6370",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.2s ease",
              }}
            >
              {tab.label}
              <span style={{ background: activeTab === tab.id ? `${tab.color}20` : "#1c2128", color: activeTab === tab.id ? tab.color : "#3a4048", fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 999, fontFamily: "'IBM Plex Mono', monospace" }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#5c6370", whiteSpace: "nowrap" }}>정렬</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ background: "#11151a", border: "1px solid #2a313c", borderRadius: 8, padding: "5px 28px 5px 10px", color: "#9198a1", fontSize: 12, fontWeight: 600, cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6370'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
          >
            <option value="premium_desc">📈 프리미엄 높은 순</option>
            <option value="premium_asc">📉 역프리미엄 순</option>
            <option value="abs_desc">⚡ 변동 큰 순</option>
            <option value="alert_first">🚨 알림 우선</option>
            <option value="symbol_az">🔤 심볼 A-Z</option>
          </select>
        </div>
      </div>

      {/* 🔥 급등+프리미엄 탭 안내 배너 */}
      {activeTab === "hot" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.35)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#ff9a6c" }}>
          <span style={{ fontSize: 16 }}>🔥</span>
          <span>
            <strong>거래량 급등</strong> 주의 지정 코인 중 <strong>역프리미엄(국내가 해외보다 싼)</strong> 코인입니다.
            해외에서 먼저 오르고 있어 국내도 곧 따라 오를 가능성이 있습니다. 소액 분할 매수를 권장합니다.
          </span>
        </div>
      )}

      {warningCount > 0 && activeTab === "all" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,59,59,0.08)", border: "1px solid rgba(255,59,59,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#ff8a8a" }}>
          <AlertTriangle size={14} />
          <span><strong>{warningCount}개</strong> 코인이 상장폐지 위험 경고 상태입니다.</span>
        </div>
      )}

      {!online && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,93,93,0.08)", border: "1px solid rgba(255,93,93,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#ff8a8a" }}>
          <AlertTriangle size={14} />
          환율 또는 거래소 응답을 가져오지 못했습니다. 30초 후 다시 시도합니다.
        </div>
      )}

      {loading ? (
        <div style={{ color: "#5c6370", fontSize: 14, padding: "40px 0", textAlign: "center" }}>
          업비트 코인 목록 불러오는 중…
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "#5c6370", marginBottom: 12 }}>
            {filterText ? (
              <>검색 결과: <span style={{ color: "#9198a1", fontWeight: 600 }}>{filteredCoins.length}</span>개</>
            ) : (
              <>표시 중: <span style={{ color: "#9198a1", fontWeight: 600 }}>{filteredCoins.length}</span>개</>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 12 }}>
            {filteredCoins.map(({ symbol, name, warning, caution }) => {
              const isHot = !warning &&
                caution.includes("TRADING_VOLUME_SOARING") &&
                (() => { const p = getCoinPremium(symbol); return p !== null && p < 0; })();
              return (
                <CoinCard
                  key={symbol}
                  coin={symbol} name={name}
                  snapshot={snapshots[symbol]}
                  high={high} low={low} usdKrw={usdKrw}
                  warning={warning} caution={caution}
                  isNewListing={!binanceSymbolsRef.current.has(symbol)}
                  isHot={isHot}
                />
              );
            })}
          </div>

          {filteredCoins.length === 0 && (
            <div style={{ color: "#3a4048", fontSize: 14, padding: "40px 0", textAlign: "center" }}>
              해당하는 코인이 없습니다.
            </div>
          )}
        </>
      )}

      {/* 범례 */}
      <div style={{ marginTop: 24, padding: "12px 16px", background: "#11151a", border: "1px solid #1c2128", borderRadius: 10, display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: "#5c6370" }}>
        <span>범례:</span>
        <span style={{ color: "#ff6b35" }}>🔥 급등+프리미엄 — 거래량 급등 AND 프리미엄 동시 감지 (매수 후보)</span>
        <span style={{ color: "#ff5d5d" }}>🚨 상장폐지위험 — 업비트 경고 지정 코인</span>
        <span style={{ color: "#ffb400" }}>⚠️ 주의 — 가격급변·거래량급등 등 주의 지정</span>
        <span style={{ color: "#4caf6e" }}>🆕 국내전용 — 바이낸스 미상장 (국내 거래소만 거래)</span>
        <span style={{ color: "#ff5d5d" }}>📈 김치프리미엄 — 국내가 해외보다 높음</span>
        <span style={{ color: "#5d9bff" }}>📉 역프리미엄 — 국내가 해외보다 낮음</span>
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: "#3a4048", lineHeight: 1.6 }}>
        업비트 공개 API에서 KRW 마켓 전체 코인을 자동으로 불러옵니다. 빗썸·바이낸스에 없는 코인은 해당 항목이 "—"로 표시됩니다.
      </p>
    </div>
  );
}
