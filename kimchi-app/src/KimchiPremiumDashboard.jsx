// ============================================================
// 김치프리미엄 대시보드 — 메인 컴포넌트
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { RefreshCw, AlertTriangle, Wifi, WifiOff, Settings2, Bell, BarChart2 } from "lucide-react";

import { useMarketData }     from "./hooks/useMarketData.js";
import { useTelegramAlert }  from "./hooks/useTelegramAlert.js";
import { isTelegramEnabled } from "./utils/telegram.js";
import { COLORS }            from "./constants/colors.js";

import SignalPanel from "./components/SignalPanel.jsx";
import CoinCard    from "./components/CoinCard.jsx";
import ChartTab    from "./components/ChartTab.jsx";

// ── 알림 기준값 기본값 ──────────────────────────────────────
const DEFAULT_HIGH = 3.0;
const DEFAULT_LOW  = -1.0;

// ── 정렬 옵션 ───────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: "premium_desc", label: "📈 프리미엄 높은 순" },
  { value: "premium_asc",  label: "📉 역프리미엄 순" },
  { value: "abs_desc",     label: "⚡ 변동 큰 순" },
  { value: "alert_first",  label: "🚨 알림 우선" },
  { value: "symbol_az",    label: "🔤 심볼 A-Z" },
];

export default function KimchiPremiumDashboard() {
  const [mainTab, setMainTab]           = useState("monitor"); // 'monitor' | 'chart'
  const [high, setHigh]                 = useState(DEFAULT_HIGH);
  const [low, setLow]                   = useState(DEFAULT_LOW);
  const [showSettings, setShowSettings] = useState(false);
  const [filterText, setFilterText]     = useState("");
  const [activeTab, setActiveTab]       = useState("all");
  const [sortBy, setSortBy]             = useState("premium_desc");
  const [tgStatus, setTgStatus]         = useState(null);
  const [tgStatusMsg, setTgStatusMsg]   = useState("");

  // 시장 데이터 훅
  const {
    coinList, snapshots, usdKrw, fng,
    lastUpdated, online, loading,
    refresh, binanceSymbolsRef,
  } = useMarketData(high, low);

  // 텔레그램 알림 훅
  const handleTgSuccess = useCallback((msg) => {
    setTgStatus("ok");
    setTgStatusMsg(msg);
    setTimeout(() => setTgStatus(null), 5000);
  }, []);
  const handleTgError = useCallback((msg) => {
    setTgStatus("error");
    setTgStatusMsg(msg);
    setTimeout(() => setTgStatus(null), 8000);
  }, []);

  useTelegramAlert({
    coinList, snapshots,
    onSuccess: handleTgSuccess,
    onError:   handleTgError,
  });

  // ── 코인 프리미엄 조회 헬퍼 ─────────────────────────────
  const getCoinPremium = useCallback((symbol) => {
    const snap = snapshots[symbol];
    if (!snap) return null;
    return snap.upbitPremium ?? snap.bithumbPremium ?? null;
  }, [snapshots]);

  // ── 카운트 계산 ─────────────────────────────────────────
  const warningCount = useMemo(
    () => coinList.filter((c) => c.warning).length,
    [coinList]
  );
  const cautionCount = useMemo(
    () => coinList.filter((c) => !c.warning && c.caution.length > 0).length,
    [coinList]
  );
  const newListingCount = useMemo(
    () => coinList.filter((c) => !binanceSymbolsRef.current.has(c.symbol)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coinList, snapshots]
  );
  const premiumAlertCount = useMemo(
    () => coinList.filter((c) => {
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      return (
        (snap.upbitPremium   !== null && (snap.upbitPremium   >= high || snap.upbitPremium   <= low)) ||
        (snap.bithumbPremium !== null && (snap.bithumbPremium >= high || snap.bithumbPremium <= low))
      );
    }).length,
    [coinList, snapshots, high, low]
  );
  const hotCount = useMemo(
    () => coinList.filter((c) => {
      if (c.warning) return false;
      const onlyVolumeSurge = c.caution.length === 1 && c.caution[0] === "TRADING_VOLUME_SOARING";
      const premium = getCoinPremium(c.symbol);
      return onlyVolumeSurge && premium !== null && premium < 0;
    }).length,
    [coinList, getCoinPremium]
  );

  // ── 코인 탭 정의 ─────────────────────────────────────────
  const tabs = useMemo(() => [
    { id: "all",     label: "전체",              count: coinList.length,   color: COLORS.neutral },
    { id: "hot",     label: "🔥 급등+역프리미엄", count: hotCount,          color: COLORS.hot },
    { id: "premium", label: "📈 프리미엄",        count: premiumAlertCount, color: COLORS.danger },
    { id: "warning", label: "🚨 폐지위험",        count: warningCount,      color: COLORS.danger },
    { id: "caution", label: "⚠️ 주의",            count: cautionCount,      color: COLORS.warning },
    { id: "new",     label: "🆕 국내전용",         count: newListingCount,   color: COLORS.safe },
  ], [coinList.length, hotCount, premiumAlertCount, warningCount, cautionCount, newListingCount]);

  // ── 필터 + 정렬 ──────────────────────────────────────────
  const filteredCoins = useMemo(() => {
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
          (snap.upbitPremium   !== null && (snap.upbitPremium   >= high || snap.upbitPremium   <= low)) ||
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

    const q = filterText.trim().toUpperCase();
    if (q) {
      list = list.filter(({ symbol, name }) =>
        symbol.toUpperCase().includes(q) || name.includes(filterText.trim())
      );
    }

    return [...list].sort((a, b) => {
      const pa = getCoinPremium(a.symbol);
      const pb = getCoinPremium(b.symbol);
      const nullLast = (pa, pb, fn) => {
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return fn(pa, pb);
      };
      switch (sortBy) {
        case "premium_desc": return nullLast(pa, pb, (a, b) => b - a);
        case "premium_asc":  return nullLast(pa, pb, (a, b) => a - b);
        case "abs_desc":     return nullLast(pa, pb, (a, b) => Math.abs(b) - Math.abs(a));
        case "alert_first": {
          const sA = a.warning ? 3 : a.caution.length > 0 ? 2 : (pa !== null && (pa >= high || pa <= low)) ? 1 : 0;
          const sB = b.warning ? 3 : b.caution.length > 0 ? 2 : (pb !== null && (pb >= high || pb <= low)) ? 1 : 0;
          if (sB !== sA) return sB - sA;
          return nullLast(pa, pb, (a, b) => Math.abs(b) - Math.abs(a));
        }
        case "symbol_az": return a.symbol.localeCompare(b.symbol);
        default: return 0;
      }
    });
  }, [coinList, snapshots, activeTab, filterText, sortBy, high, low, getCoinPremium, binanceSymbolsRef]);

  // ── 렌더 ────────────────────────────────────────────────
  return (
    <div style={{
      background: "#0a0d11",
      color: "#e6edf3",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: "24px 20px",
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      {/* ── 헤더 ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.2 }}>
              김치프리미엄 모니터
            </h1>
            {mainTab === "monitor" && (
              online ? <Wifi size={14} color={COLORS.safe} /> : <WifiOff size={14} color={COLORS.danger} />
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7d8590" }}>
            {mainTab === "monitor" ? (
              <>
                업비트 전체{" "}
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#9198a1", fontWeight: 600 }}>
                  {coinList.length}
                </span>
                개 코인 · USD/KRW{" "}
                {usdKrw
                  ? <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{usdKrw.toFixed(1)}</span>
                  : "—"}
                {lastUpdated && (
                  <> · 갱신 <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{lastUpdated.toLocaleTimeString("ko-KR")}</span></>
                )}
              </>
            ) : (
              "업비트 KRW 마켓 캔들차트 · 지표 분석"
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {mainTab === "monitor" && isTelegramEnabled && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(76,175,110,0.12)", border: "1px solid rgba(76,175,110,0.4)", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: COLORS.safe, fontWeight: 700 }}>
              <Bell size={11} />
              텔레그램 ON
            </div>
          )}
          {mainTab === "monitor" && tgStatus && (
            <div style={{ fontSize: 11, color: tgStatus === "ok" ? COLORS.safe : COLORS.danger, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tgStatusMsg}
            </div>
          )}
          {mainTab === "monitor" && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* ── 메인 탭 전환 ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1px solid #1c2128", paddingBottom: 10 }}>
        <button
          onClick={() => setMainTab("monitor")}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: mainTab === "monitor" ? "#161b22" : "transparent",
            border: mainTab === "monitor" ? "1px solid #2a313c" : "1px solid transparent",
            borderRadius: 9, padding: "7px 14px",
            color: mainTab === "monitor" ? "#e6edf3" : "#7d8590",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Wifi size={13} />
          모니터
        </button>
        <button
          onClick={() => setMainTab("chart")}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: mainTab === "chart" ? "#161b22" : "transparent",
            border: mainTab === "chart" ? "1px solid #2a313c" : "1px solid transparent",
            borderRadius: 9, padding: "7px 14px",
            color: mainTab === "chart" ? "#e6edf3" : "#7d8590",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <BarChart2 size={13} />
          차트
        </button>
      </div>

      {/* ── 차트 탭 ── */}
      {mainTab === "chart" && <ChartTab />}

      {/* ── 모니터 탭 ── */}
      {mainTab === "monitor" && (
        <>
          {/* 설정 패널 */}
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
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#7d8590", display: "block", marginBottom: 5 }}>
                    상단 알림 기준(%)
                  </label>
                  <input
                    type="number" step="0.1" value={high}
                    onChange={(e) => setHigh(parseFloat(e.target.value))}
                    style={{ ...inputStyle, width: 85 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#7d8590", display: "block", marginBottom: 5 }}>
                    하단 알림 기준(%)
                  </label>
                  <input
                    type="number" step="0.1" value={low}
                    onChange={(e) => setLow(parseFloat(e.target.value))}
                    style={{ ...inputStyle, width: 85 }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 검색창 */}
          {!showSettings && (
            <div style={{ marginBottom: 14 }}>
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="🔍  코인 검색 (심볼 또는 한글명)"
                style={{ ...inputStyle, maxWidth: 360, background: "#11151a", borderRadius: 9, padding: "8px 12px", fontFamily: "'Inter', sans-serif" }}
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

          {/* 코인 탭 + 정렬 */}
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
                  <span style={{
                    background: activeTab === tab.id ? `${tab.color}20` : "#1c2128",
                    color: activeTab === tab.id ? tab.color : "#3a4048",
                    fontSize: 10, fontWeight: 700, padding: "1px 5px",
                    borderRadius: 999, fontFamily: "'IBM Plex Mono', monospace",
                  }}>
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
                style={{
                  background: "#11151a", border: "1px solid #2a313c", borderRadius: 8,
                  padding: "5px 28px 5px 10px", color: "#9198a1", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6370'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 🔥 급등+역프리미엄 배너 */}
          {activeTab === "hot" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.35)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#ff9a6c" }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <span>
                <strong>거래량 급등</strong> 주의 지정 코인 중 <strong>역프리미엄(국내가 해외보다 싼)</strong> 코인입니다.
                해외에서 먼저 오르고 있어 국내도 곧 따라 오를 가능성이 있습니다. 소액 분할 매수를 권장합니다.
              </span>
            </div>
          )}

          {/* 상장폐지 경고 배너 */}
          {warningCount > 0 && activeTab === "all" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,59,59,0.08)", border: "1px solid rgba(255,59,59,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#ff8a8a" }}>
              <AlertTriangle size={14} />
              <span><strong>{warningCount}개</strong> 코인이 상장폐지 위험 경고 상태입니다.</span>
            </div>
          )}

          {/* 오프라인 배너 */}
          {!online && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,93,93,0.08)", border: "1px solid rgba(255,93,93,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#ff8a8a" }}>
              <AlertTriangle size={14} />
              환율 또는 거래소 응답을 가져오지 못했습니다. 30초 후 다시 시도합니다.
            </div>
          )}

          {/* 코인 목록 */}
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
                  const isHot =
                    !warning &&
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
            <span style={{ color: COLORS.hot }}>🔥 급등+역프리미엄 — 거래량 급등 AND 역프리미엄 동시 감지 (매수 후보)</span>
            <span style={{ color: COLORS.danger }}>🚨 상장폐지위험 — 업비트 경고 지정 코인</span>
            <span style={{ color: COLORS.warning }}>⚠️ 주의 — 가격급변·거래량급등 등 주의 지정</span>
            <span style={{ color: COLORS.safe }}>🆕 국내전용 — 바이낸스 미상장 (국내 거래소만 거래)</span>
            <span style={{ color: COLORS.danger }}>📈 김치프리미엄 — 국내가 해외보다 높음</span>
            <span style={{ color: COLORS.info }}>📉 역프리미엄 — 국내가 해외보다 낮음</span>
          </div>

          <p style={{ marginTop: 12, fontSize: 11, color: "#3a4048", lineHeight: 1.6 }}>
            업비트 공개 API에서 KRW 마켓 전체 코인을 자동으로 불러옵니다. 빗썸·바이낸스에 없는 코인은 해당 항목이 "—"로 표시됩니다.
          </p>
        </>
      )}
    </div>
  );
}

// ── 공통 input 스타일 ────────────────────────────────────────
const inputStyle = {
  width: "100%",
  background: "#0a0d11",
  border: "1px solid #2a313c",
  borderRadius: 8,
  padding: "7px 10px",
  color: "#e6edf3",
  fontSize: 13,
  fontFamily: "'IBM Plex Mono', monospace",
  boxSizing: "border-box",
  outline: "none",
};
