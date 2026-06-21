import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertTriangle, Wifi, WifiOff, Settings2 } from "lucide-react";

// ============================================================
// 설정 기본값
// ============================================================
const DEFAULT_COINS = ["BTC", "ETH", "XRP"];
const DEFAULT_HIGH = 3.0;
const DEFAULT_LOW = -1.0;
const REFRESH_MS = 30000;

// ============================================================
// 거래소별 시세 조회 (전부 공개 API, 키 불필요)
// ============================================================
async function fetchUpbit(coin) {
  const res = await fetch(`https://api.upbit.com/v1/ticker?markets=KRW-${coin}`);
  if (!res.ok) throw new Error("upbit");
  const data = await res.json();
  return data[0].trade_price;
}

async function fetchBithumb(coin) {
  const res = await fetch(`https://api.bithumb.com/public/ticker/${coin}_KRW`);
  if (!res.ok) throw new Error("bithumb");
  const data = await res.json();
  return parseFloat(data.data.closing_price);
}

async function fetchBinance(coin) {
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${coin}USDT`);
  if (!res.ok) throw new Error("binance");
  const data = await res.json();
  return parseFloat(data.price);
}

async function fetchUsdKrw() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error("fx");
  const data = await res.json();
  return data.rates.KRW;
}

function calcPremium(domesticKrw, globalUsdt, usdKrw) {
  const globalKrw = globalUsdt * usdKrw;
  return ((domesticKrw - globalKrw) / globalKrw) * 100;
}

// ============================================================
// 작은 단위 컴포넌트
// ============================================================
function PremiumPill({ value, high, low }) {
  const isHigh = value >= high;
  const isLow = value <= low;
  const color = isHigh ? "#ff5d5d" : isLow ? "#5d9bff" : "#7d8590";
  const bg = isHigh ? "rgba(255,93,93,0.12)" : isLow ? "rgba(93,155,255,0.12)" : "rgba(125,133,144,0.10)";
  return (
    <span
      style={{
        color,
        background: bg,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 13,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 999,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function ExchangeRow({ label, price, premium, high, low, failed }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "72px 1fr auto",
        alignItems: "center",
        padding: "9px 0",
        borderBottom: "1px solid #1c2128",
        gap: 12,
      }}
    >
      <span style={{ color: "#9198a1", fontSize: 12.5, fontWeight: 500 }}>{label}</span>
      {failed ? (
        <span style={{ color: "#5c6370", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
          조회 실패
        </span>
      ) : (
        <span
          style={{
            color: "#e6edf3",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 14.5,
            fontWeight: 500,
          }}
        >
          {price.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원
        </span>
      )}
      {!failed && premium !== null && <PremiumPill value={premium} high={high} low={low} />}
    </div>
  );
}

function CoinCard({ coin, snapshot, high, low }) {
  const flash = snapshot?.flash;
  return (
    <div
      style={{
        background: "#11151a",
        border: `1px solid ${flash ? "#3a2a2a" : "#1c2128"}`,
        borderRadius: 14,
        padding: "18px 20px",
        transition: "border-color 0.6s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 17,
            color: "#e6edf3",
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          {coin}
        </h3>
        {snapshot?.binance && (
          <span style={{ fontSize: 12, color: "#5c6370", fontFamily: "'IBM Plex Mono', monospace" }}>
            바이낸스 {snapshot.binance.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT
          </span>
        )}
      </div>

      {!snapshot ? (
        <div style={{ color: "#5c6370", fontSize: 13, padding: "12px 0" }}>불러오는 중…</div>
      ) : (
        <div>
          <ExchangeRow
            label="업비트"
            price={snapshot.upbit}
            premium={snapshot.upbitPremium}
            high={high}
            low={low}
            failed={snapshot.upbit == null}
          />
          <ExchangeRow
            label="빗썸"
            price={snapshot.bithumb}
            premium={snapshot.bithumbPremium}
            high={high}
            low={low}
            failed={snapshot.bithumb == null}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// 메인 대시보드
// ============================================================
export default function KimchiPremiumDashboard() {
  const [coins, setCoins] = useState(DEFAULT_COINS);
  const [high, setHigh] = useState(DEFAULT_HIGH);
  const [low, setLow] = useState(DEFAULT_LOW);
  const [snapshots, setSnapshots] = useState({});
  const [usdKrw, setUsdKrw] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [online, setOnline] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [coinInput, setCoinInput] = useState(DEFAULT_COINS.join(", "));
  const prevPremiums = useRef({});

  const refresh = useCallback(async () => {
    try {
      const rate = await fetchUsdKrw();
      setUsdKrw(rate);
      setOnline(true);

      const results = await Promise.all(
        coins.map(async (coin) => {
          let upbit = null,
            bithumb = null,
            binance = null;
          try {
            binance = await fetchBinance(coin);
          } catch (e) {
            /* ignore */
          }
          try {
            upbit = await fetchUpbit(coin);
          } catch (e) {
            /* ignore */
          }
          try {
            bithumb = await fetchBithumb(coin);
          } catch (e) {
            /* ignore */
          }

          const upbitPremium = upbit != null && binance != null ? calcPremium(upbit, binance, rate) : null;
          const bithumbPremium = bithumb != null && binance != null ? calcPremium(bithumb, binance, rate) : null;

          const prevHigh = prevPremiums.current[coin]?.alertZone || false;
          const nowAlert =
            (upbitPremium !== null && (upbitPremium >= high || upbitPremium <= low)) ||
            (bithumbPremium !== null && (bithumbPremium >= high || bithumbPremium <= low));
          const flash = nowAlert && !prevHigh;
          prevPremiums.current[coin] = { alertZone: nowAlert };

          return [coin, { upbit, bithumb, binance, upbitPremium, bithumbPremium, flash }];
        })
      );

      setSnapshots(Object.fromEntries(results));
      setLastUpdated(new Date());
    } catch (e) {
      setOnline(false);
    }
  }, [coins, high, low]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const applyCoinInput = () => {
    const parsed = coinInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (parsed.length) setCoins(parsed);
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: "#0a0d11",
        color: "#e6edf3",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "28px 22px",
        boxSizing: "border-box",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: -0.2 }}>김치프리미엄 모니터</h1>
            {online ? (
              <Wifi size={15} color="#4caf6e" />
            ) : (
              <WifiOff size={15} color="#ff5d5d" />
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#7d8590" }}>
            업비트 · 빗썸 vs 바이낸스 · USD/KRW{" "}
            {usdKrw ? <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{usdKrw.toFixed(1)}</span> : "—"}
            {lastUpdated && (
              <>
                {" · 마지막 갱신 "}
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                  {lastUpdated.toLocaleTimeString("ko-KR")}
                </span>
              </>
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowSettings((s) => !s)}
            style={{
              background: "#161b22",
              border: "1px solid #2a313c",
              borderRadius: 9,
              padding: "8px 11px",
              color: "#9198a1",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="설정"
          >
            <Settings2 size={15} />
          </button>
          <button
            onClick={refresh}
            style={{
              background: "#161b22",
              border: "1px solid #2a313c",
              borderRadius: 9,
              padding: "8px 11px",
              color: "#9198a1",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="새로고침"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* 설정 패널 */}
      {showSettings && (
        <div
          style={{
            background: "#11151a",
            border: "1px solid #1c2128",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            display: "flex",
            flexWrap: "wrap",
            gap: 18,
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 220px" }}>
            <label style={{ fontSize: 11.5, color: "#7d8590", display: "block", marginBottom: 6 }}>
              감시 코인 (쉼표로 구분)
            </label>
            <input
              value={coinInput}
              onChange={(e) => setCoinInput(e.target.value)}
              style={{
                width: "100%",
                background: "#0a0d11",
                border: "1px solid #2a313c",
                borderRadius: 8,
                padding: "8px 10px",
                color: "#e6edf3",
                fontSize: 13,
                fontFamily: "'IBM Plex Mono', monospace",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: "#7d8590", display: "block", marginBottom: 6 }}>
              상단 알림 기준(%)
            </label>
            <input
              type="number"
              step="0.1"
              value={high}
              onChange={(e) => setHigh(parseFloat(e.target.value))}
              style={{
                width: 90,
                background: "#0a0d11",
                border: "1px solid #2a313c",
                borderRadius: 8,
                padding: "8px 10px",
                color: "#e6edf3",
                fontSize: 13,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11.5, color: "#7d8590", display: "block", marginBottom: 6 }}>
              하단 알림 기준(%)
            </label>
            <input
              type="number"
              step="0.1"
              value={low}
              onChange={(e) => setLow(parseFloat(e.target.value))}
              style={{
                width: 90,
                background: "#0a0d11",
                border: "1px solid #2a313c",
                borderRadius: 8,
                padding: "8px 10px",
                color: "#e6edf3",
                fontSize: 13,
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
          </div>
          <button
            onClick={applyCoinInput}
            style={{
              background: "#1f6feb",
              border: "none",
              borderRadius: 8,
              padding: "9px 16px",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            적용
          </button>
        </div>
      )}

      {!online && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,93,93,0.08)",
            border: "1px solid rgba(255,93,93,0.25)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 18,
            fontSize: 13,
            color: "#ff8a8a",
          }}
        >
          <AlertTriangle size={15} />
          환율 또는 거래소 응답을 가져오지 못했습니다. 30초 후 다시 시도합니다.
        </div>
      )}

      {/* 코인 카드 그리드 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {coins.map((coin) => (
          <CoinCard key={coin} coin={coin} snapshot={snapshots[coin]} high={high} low={low} />
        ))}
      </div>

      <p style={{ marginTop: 22, fontSize: 11.5, color: "#4a525c", lineHeight: 1.6 }}>
        모든 시세는 각 거래소의 공개(Public) API에서 직접 조회하며 계좌 인증 정보를 사용하지 않습니다. 거래소 정책에
        따라 일부 응답이 브라우저 CORS 정책에 막힐 수 있으며, 이 경우 해당 항목은 "조회 실패"로 표시됩니다.
      </p>
    </div>
  );
}
