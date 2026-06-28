// ============================================================
// 차트 탭 — TradingView lightweight-charts + 4개 지표 동시 표시
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from "lightweight-charts";
import { Loader2, AlertTriangle, BarChart2, RefreshCw, Search, X } from "lucide-react";

import {
  fetchKlines,
  INTERVAL_OPTIONS,
  calcBollinger,
  calcHMA,
  calcADX,
  calcVWAP,
  signalsBollinger,
  signalsHMA,
  signalsADX,
  signalsVWAP,
} from "../utils/indicators.js";
import { fetchUpbitMarkets } from "../api/market.js";

// ── 기본 파라미터 ────────────────────────────────────────────
const DEFAULT_PARAMS = {
  bollinger: { period: 20, mult: 2 },
  hma:       { period: 20 },
  adx:       { period: 14, threshold: 25 },
};

// ── 신호 필터 옵션 ───────────────────────────────────────────
const SIGNAL_FILTER_OPTIONS = [
  { value: "all",    label: "전체 신호" },
  { value: "vp_buy", label: "▲ VP매수만" },
  { value: "bb_buy", label: "▲ BB매수만" },
  { value: "hma_buy",label: "▲ HMA매수만" },
  { value: "adx_buy",label: "▲ ADX매수만" },
  { value: "buy_all",label: "▲ 매수신호만" },
];

// ── 인터벌별 자동갱신 주기 (ms) ─────────────────────────────
function getRefreshMs(interval) {
  if (interval === "1m")   return 10_000;
  if (interval === "5m")   return 30_000;
  if (interval === "15m")  return 60_000;
  if (interval === "60m")  return 120_000;
  if (interval === "240m") return 300_000;
  return null;
}

// ── 날짜/시간 포맷 (KST) ────────────────────────────────────
function formatKST(unixSec, interval) {
  const d = new Date(unixSec * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const yy = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  if (interval === "1d" || interval === "1w") {
    return `${yy}-${mo}-${dd}`;
  }
  return `${yy}-${mo}-${dd} ${hh}:${mm}`;
}

// ── 색상 ────────────────────────────────────────────────────
const C = {
  candle_up:   "#4caf6e",
  candle_down: "#ff5d5d",
  wick_up:     "#4caf6e",
  wick_down:   "#ff5d5d",
  boll_upper:  "#ff5d5d",
  boll_mid:    "#7d8590",
  boll_lower:  "#5d9bff",
  hma:         "#ffd700",
  vwap:        "#c084fc",
  adx:         "#e6edf3",
  plus_di:     "#4caf6e",
  minus_di:    "#ff5d5d",
  vol_up:      "#4caf6e55",
  vol_down:    "#ff5d5d55",
  bg:          "#0a0d11",
  grid:        "#1c2128",
  text:        "#7d8590",
  border:      "#2a313c",
};

// ── 공통 차트 옵션 ───────────────────────────────────────────
function baseChartOptions(height, interval) {
  return {
    height,
    layout:     { background: { color: C.bg }, textColor: C.text },
    grid:       { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    crosshair:  { mode: 1 },
    rightPriceScale: { borderColor: C.border },
    timeScale:  {
      borderColor: C.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 0,
      fixLeftEdge: true,
      tickMarkFormatter: (unixSec) => formatKST(unixSec, interval),
    },
    localization: {
      timeFormatter: (unixSec) => formatKST(unixSec, interval),
    },
  };
}

// ── 신호 마커 생성 헬퍼 ─────────────────────────────────────
function buildMarkers(candles, toUnix, {
  showBoll, showHMA, showADX, showVWAP,
  bollPeriod, bollMult, hmaPeriod, adxPeriod, adxThresh,
  signalFilter,
}) {
  const allMarkers = [];

  const shouldInclude = (type, action) => {
    if (signalFilter === "all")     return true;
    if (signalFilter === "buy_all") return action === "buy";
    if (signalFilter === "vp_buy")  return type === "vp"  && action === "buy";
    if (signalFilter === "bb_buy")  return type === "bb"  && action === "buy";
    if (signalFilter === "hma_buy") return type === "hma" && action === "buy";
    if (signalFilter === "adx_buy") return type === "adx" && action === "buy";
    return true;
  };

  if (showBoll) {
    signalsBollinger(candles, bollPeriod, bollMult).forEach((s) => {
      if (!shouldInclude("bb", s.action)) return;
      allMarkers.push({
        time:     toUnix(candles[s.index]),
        position: s.action === "buy" ? "belowBar" : "aboveBar",
        color:    s.action === "buy" ? "#5d9bff" : "#ff5d5d",
        shape:    s.action === "buy" ? "arrowUp" : "arrowDown",
        text:     s.action === "buy" ? "BB▲" : "BB▼",
        size:     1,
      });
    });
  }
  if (showHMA) {
    signalsHMA(candles, hmaPeriod).forEach((s) => {
      if (!shouldInclude("hma", s.action)) return;
      allMarkers.push({
        time:     toUnix(candles[s.index]),
        position: s.action === "buy" ? "belowBar" : "aboveBar",
        color:    s.action === "buy" ? "#ffd700" : "#ff9900",
        shape:    s.action === "buy" ? "arrowUp" : "arrowDown",
        text:     s.action === "buy" ? "HMA▲" : "HMA▼",
        size:     1,
      });
    });
  }
  if (showADX) {
    signalsADX(candles, adxPeriod, adxThresh).forEach((s) => {
      if (!shouldInclude("adx", s.action)) return;
      allMarkers.push({
        time:     toUnix(candles[s.index]),
        position: s.action === "buy" ? "belowBar" : "aboveBar",
        color:    s.action === "buy" ? "#4caf6e" : "#ff5d5d",
        shape:    s.action === "buy" ? "arrowUp" : "arrowDown",
        text:     s.action === "buy" ? "ADX▲" : "ADX▼",
        size:     1,
      });
    });
  }
  if (showVWAP) {
    signalsVWAP(candles).forEach((s) => {
      if (!shouldInclude("vp", s.action)) return;
      allMarkers.push({
        time:     toUnix(candles[s.index]),
        position: s.action === "buy" ? "belowBar" : "aboveBar",
        color:    s.action === "buy" ? "#c084fc" : "#a855f7",
        shape:    s.action === "buy" ? "arrowUp" : "arrowDown",
        text:     s.action === "buy" ? "VP▲" : "VP▼",
        size:     1,
      });
    });
  }

  allMarkers.sort((a, b) => a.time - b.time);
  return allMarkers;
}

// ── VP 매수 신호 스캔 패널 ───────────────────────────────────
function VpScanPanel({ allCoins, onSelectCoin }) {
  const [scanning,    setScanning]    = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [total,       setTotal]       = useState(0);
  const [results,     setResults]     = useState(null); // null = 미스캔, [] = 스캔완료
  const [scanInterval, setScanInterval] = useState("1d");
  const [scanPeriod,  setScanPeriod]  = useState(90);
  const [showPanel,   setShowPanel]   = useState(false);
  const abortRef = useRef(false);

  const SCAN_INTERVAL_OPTIONS = [
    { value: "1d",   label: "일봉",    period: 90  },
    { value: "240m", label: "4시간봉", period: 90  },
    { value: "60m",  label: "1시간봉", period: 168 },
    { value: "15m",  label: "15분봉",  period: 96  },
    { value: "5m",   label: "5분봉",   period: 288 },
    { value: "1m",   label: "1분봉",   period: 240 },
  ];

  const handleIntervalChange = (val) => {
    setScanInterval(val);
    const opt = SCAN_INTERVAL_OPTIONS.find((o) => o.value === val);
    if (opt) setScanPeriod(opt.period);
  };

  const startScan = async () => {
    if (allCoins.length === 0) return;
    abortRef.current = false;
    setScanning(true);
    setResults(null);
    setProgress(0);
    setTotal(allCoins.length);

    const found = [];
    // 동시 요청 수 제한 (업비트 rate limit 방지)
    const BATCH = 3;
    const DELAY_MS = 300;

    for (let i = 0; i < allCoins.length; i += BATCH) {
      if (abortRef.current) break;
      const batch = allCoins.slice(i, i + BATCH);

      await Promise.all(
        batch.map(async (coin) => {
          try {
            const candles = await fetchKlines(coin.symbol, scanPeriod, scanInterval);
            if (!candles || candles.length < 20) return;
            const sigs = signalsVWAP(candles);
            // 최근 3개 캔들 내에 VP 매수 신호가 있으면 포함
            const recentBuy = sigs.filter(
              (s) => s.action === "buy" && s.index >= candles.length - 3
            );
            if (recentBuy.length > 0) {
              const lastCandle = candles[candles.length - 1];
              const vwapArr = [];
              let cumPV = 0, cumVol = 0, lastDay = null;
              for (let j = 0; j < candles.length; j++) {
                const day = new Date(candles[j].time).toISOString().slice(0, 10);
                if (day !== lastDay) { cumPV = 0; cumVol = 0; lastDay = day; }
                const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
                cumPV += tp * candles[j].volume;
                cumVol += candles[j].volume;
                vwapArr.push(cumVol === 0 ? null : cumPV / cumVol);
              }
              const lastVwap = vwapArr[vwapArr.length - 1];
              found.push({
                symbol: coin.symbol,
                name:   coin.name,
                close:  lastCandle.close,
                vwap:   lastVwap,
                signalIdx: recentBuy[recentBuy.length - 1].index,
                totalCandles: candles.length,
              });
            }
          } catch {
            // 개별 코인 실패는 무시
          }
        })
      );

      setProgress(Math.min(i + BATCH, allCoins.length));
      if (i + BATCH < allCoins.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    setResults(found);
    setScanning(false);
  };

  const stopScan = () => {
    abortRef.current = true;
    setScanning(false);
  };

  const progressPct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 스캔 토글 버튼 */}
      <button
        onClick={() => setShowPanel((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: showPanel ? "rgba(192,132,252,0.15)" : "#11151a",
          border: `1px solid ${showPanel ? "#c084fc" : "#2a313c"}`,
          borderRadius: 8, padding: "6px 14px",
          color: showPanel ? "#c084fc" : "#7d8590",
          fontSize: 12, fontWeight: 700, cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        <Search size={13} />
        ▲ VP매수 신호 코인 스캔
        {results !== null && !scanning && (
          <span style={{
            background: results.length > 0 ? "rgba(192,132,252,0.25)" : "rgba(92,99,112,0.25)",
            color: results.length > 0 ? "#c084fc" : "#5c6370",
            fontSize: 10, fontWeight: 700, padding: "1px 6px",
            borderRadius: 999, marginLeft: 2,
          }}>
            {results.length}개
          </span>
        )}
      </button>

      {/* 스캔 패널 */}
      {showPanel && (
        <div style={{
          marginTop: 8,
          background: "#11151a",
          border: "1px solid rgba(192,132,252,0.3)",
          borderRadius: 12, padding: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#c084fc", fontWeight: 700 }}>
              🔍 VP(VWAP) 매수 신호 코인 스캔
            </span>
            <span style={{ fontSize: 11, color: "#5c6370" }}>
              — 최근 3개 캔들 내 VWAP 상향돌파 코인 탐색
            </span>
          </div>

          {/* 스캔 설정 */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 11, color: "#7d8590", marginBottom: 4 }}>인터벌</div>
              <select
                value={scanInterval}
                onChange={(e) => handleIntervalChange(e.target.value)}
                disabled={scanning}
                style={{
                  background: "#0a0d11", border: "1px solid #2a313c", borderRadius: 7,
                  padding: "5px 10px", color: "#e6edf3", fontSize: 12, cursor: "pointer", outline: "none",
                }}
              >
                {SCAN_INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#7d8590", marginBottom: 4 }}>
                스캔 대상: <span style={{ color: "#9198a1", fontWeight: 700 }}>{allCoins.length}개 코인</span>
              </div>
              <div style={{ fontSize: 11, color: "#5c6370" }}>
                기간: {scanPeriod}개 캔들
              </div>
            </div>

            {!scanning ? (
              <button
                onClick={startScan}
                disabled={allCoins.length === 0}
                style={{
                  background: "rgba(192,132,252,0.15)",
                  border: "1px solid #c084fc",
                  borderRadius: 8, padding: "7px 18px",
                  color: "#c084fc", fontSize: 12, fontWeight: 700,
                  cursor: allCoins.length === 0 ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <Search size={13} />
                스캔 시작
              </button>
            ) : (
              <button
                onClick={stopScan}
                style={{
                  background: "rgba(255,93,93,0.12)",
                  border: "1px solid #ff5d5d",
                  borderRadius: 8, padding: "7px 18px",
                  color: "#ff5d5d", fontSize: 12, fontWeight: 700,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <X size={13} />
                중단
              </button>
            )}
          </div>

          {/* 진행 바 */}
          {scanning && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7d8590", marginBottom: 4 }}>
                <span>스캔 중… {progress} / {total}</span>
                <span>{progressPct}%</span>
              </div>
              <div style={{ background: "#1c2128", borderRadius: 999, height: 6, overflow: "hidden" }}>
                <div style={{
                  background: "linear-gradient(90deg, #c084fc, #a855f7)",
                  height: "100%", borderRadius: 999,
                  width: `${progressPct}%`,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}

          {/* 결과 목록 */}
          {results !== null && !scanning && (
            <div>
              {results.length === 0 ? (
                <div style={{ fontSize: 13, color: "#5c6370", padding: "12px 0", textAlign: "center" }}>
                  VP 매수 신호 코인이 없습니다.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#c084fc", fontWeight: 700, marginBottom: 8 }}>
                    ✦ VP 매수 신호 코인 {results.length}개 발견
                    <span style={{ fontSize: 11, color: "#5c6370", fontWeight: 400, marginLeft: 8 }}>
                      (클릭 시 해당 코인 차트로 이동)
                    </span>
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 8,
                    maxHeight: 280,
                    overflowY: "auto",
                  }}>
                    {results.map((r) => {
                      const diffPct = r.vwap ? ((r.close - r.vwap) / r.vwap * 100) : null;
                      return (
                        <button
                          key={r.symbol}
                          onClick={() => onSelectCoin(r.symbol)}
                          style={{
                            background: "rgba(192,132,252,0.08)",
                            border: "1px solid rgba(192,132,252,0.3)",
                            borderRadius: 9, padding: "10px 12px",
                            cursor: "pointer", textAlign: "left",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(192,132,252,0.18)";
                            e.currentTarget.style.borderColor = "#c084fc";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(192,132,252,0.08)";
                            e.currentTarget.style.borderColor = "rgba(192,132,252,0.3)";
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                            <span style={{ color: "#c084fc", fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
                              {r.symbol}
                            </span>
                            <span style={{ fontSize: 10, color: "#4caf6e", fontWeight: 700 }}>▲VP</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#7d8590", marginBottom: 4 }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: "#9198a1", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {r.close.toLocaleString()}원
                          </div>
                          {diffPct !== null && (
                            <div style={{ fontSize: 10, color: diffPct >= 0 ? "#4caf6e" : "#ff5d5d", marginTop: 2 }}>
                              VWAP 대비 {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(2)}%
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChartTab() {
  // ── 코인 목록: { symbol, name } 형태로 저장 ──────────────
  const [allCoins,      setAllCoins]      = useState([]); // [{ symbol, name }]
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [coinQuery,     setCoinQuery]     = useState("");
  const [selectedCoin,  setSelectedCoin]  = useState("BTC");
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [interval,      setIntervalVal]   = useState("1d");
  const [period,        setPeriod]        = useState(365);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [candles,       setCandles]       = useState(null);
  const [lastRefresh,   setLastRefresh]   = useState(null);

  // 파라미터 상태
  const [bollPeriod, setBollPeriod] = useState(DEFAULT_PARAMS.bollinger.period);
  const [bollMult,   setBollMult]   = useState(DEFAULT_PARAMS.bollinger.mult);
  const [hmaPeriod,  setHmaPeriod]  = useState(DEFAULT_PARAMS.hma.period);
  const [adxPeriod,  setAdxPeriod]  = useState(DEFAULT_PARAMS.adx.period);
  const [adxThresh,  setAdxThresh]  = useState(DEFAULT_PARAMS.adx.threshold);

  // 지표 표시 토글
  const [showBoll,    setShowBoll]    = useState(true);
  const [showHMA,     setShowHMA]     = useState(true);
  const [showVWAP,    setShowVWAP]    = useState(true);
  const [showADX,     setShowADX]     = useState(true);
  const [showVolume,  setShowVolume]  = useState(true);
  const [showSignals, setShowSignals] = useState(true);

  // ── 신호 필터 ────────────────────────────────────────────
  const [signalFilter, setSignalFilter] = useState("all");

  // 차트 DOM refs
  const mainRef   = useRef(null);
  const volRef    = useRef(null);
  const adxRef    = useRef(null);

  // 차트 인스턴스 refs
  const mainChartRef = useRef(null);
  const volChartRef  = useRef(null);
  const adxChartRef  = useRef(null);
  const seriesRefs   = useRef({});

  const isSilentUpdate = useRef(false);
  const savedZoomRange = useRef(null);
  const isUserZoomed   = useRef(false);

  const prevIntervalRef = useRef(interval);
  const prevCoinRef     = useRef(selectedCoin);
  const prevPeriodRef   = useRef(period);

  const currentIntervalOpt = INTERVAL_OPTIONS.find((o) => o.value === interval) || INTERVAL_OPTIONS[5];

  // ── 코인 목록 로드 (한글명 포함) ─────────────────────────
  useEffect(() => {
    fetchUpbitMarkets()
      .then((list) => setAllCoins(list)) // [{ symbol, name, warning, caution }]
      .catch(() => {})
      .finally(() => setSymbolsLoading(false));
  }, []);

  // ── 검색 필터: 심볼 또는 한글명으로 검색 ─────────────────
  const filteredCoins = useMemo(() => {
    if (!coinQuery) return allCoins.slice(0, 100);
    const q = coinQuery.trim().toUpperCase();
    const qKo = coinQuery.trim();
    return allCoins
      .filter((c) => c.symbol.includes(q) || c.name.includes(qKo))
      .slice(0, 100);
  }, [allCoins, coinQuery]);

  // 현재 선택된 코인의 한글명
  const selectedCoinName = useMemo(() => {
    const found = allCoins.find((c) => c.symbol === selectedCoin);
    return found ? found.name : "";
  }, [allCoins, selectedCoin]);

  // ── VP 스캔에서 코인 선택 시 처리 ────────────────────────
  const handleVpSelectCoin = useCallback((symbol) => {
    setSelectedCoin(symbol);
    // 일봉으로 전환
    setIntervalVal("1d");
    setPeriod(365);
  }, []);

  // ── 캔들 데이터 로드 ─────────────────────────────────────
  const loadCandles = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); setCandles(null); }
    isSilentUpdate.current = silent;
    try {
      const data = await fetchKlines(selectedCoin, period, interval);
      if (!data || data.length < 30) throw new Error("캔들 데이터가 너무 적습니다");
      setCandles(data);
      setLastRefresh(new Date());
    } catch (e) {
      if (!silent) setError(e.message || "데이터 로드 실패");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedCoin, period, interval]);

  useEffect(() => { loadCandles(false); }, [loadCandles]);

  useEffect(() => {
    const ms = getRefreshMs(interval);
    if (!ms) return;
    const id = setInterval(() => loadCandles(true), ms);
    return () => clearInterval(id);
  }, [interval, loadCandles]);

  // ── 차트 생성 / 업데이트 ─────────────────────────────────
  useEffect(() => {
    if (!candles || !mainRef.current) return;

    const toUnix = (c) => Math.floor(c.time / 1000);

    const intervalChanged = prevIntervalRef.current !== interval;
    const coinChanged     = prevCoinRef.current !== selectedCoin;
    const periodChanged   = prevPeriodRef.current !== period;
    if (intervalChanged || coinChanged || periodChanged) {
      savedZoomRange.current = null;
      isUserZoomed.current   = false;
      prevIntervalRef.current = interval;
      prevCoinRef.current     = selectedCoin;
      prevPeriodRef.current   = period;
    }

    const markerParams = {
      showBoll, showHMA, showADX, showVWAP,
      bollPeriod, bollMult, hmaPeriod, adxPeriod, adxThresh,
      signalFilter,
    };

    // ── silent 업데이트 ──
    if (isSilentUpdate.current && mainChartRef.current) {
      const scrollY = window.scrollY; // 페이지 스크롤 위치 저장
      const mainTimeScale = mainChartRef.current.timeScale();
      const currentRange = savedZoomRange.current || mainTimeScale.getVisibleLogicalRange();

      const candleData = candles.map((c) => ({
        time: toUnix(c), open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      if (seriesRefs.current.candle) seriesRefs.current.candle.setData(candleData);

      if (seriesRefs.current.bollUpper && seriesRefs.current.bollMid && seriesRefs.current.bollLower) {
        const { upper, mid, lower } = calcBollinger(candles, bollPeriod, bollMult);
        const toLineData = (arr) => arr.map((v, i) => v == null ? null : { time: toUnix(candles[i]), value: v }).filter(Boolean);
        seriesRefs.current.bollUpper.setData(toLineData(upper));
        seriesRefs.current.bollMid.setData(toLineData(mid));
        seriesRefs.current.bollLower.setData(toLineData(lower));
      }
      if (seriesRefs.current.hma) {
        const hmaArr = calcHMA(candles, hmaPeriod);
        seriesRefs.current.hma.setData(hmaArr.map((v, i) => v == null ? null : { time: toUnix(candles[i]), value: v }).filter(Boolean));
      }
      if (seriesRefs.current.vwap) {
        const vwapArr = calcVWAP(candles);
        seriesRefs.current.vwap.setData(vwapArr.map((v, i) => v == null ? null : { time: toUnix(candles[i]), value: v }).filter(Boolean));
      }
      if (seriesRefs.current.candle && showSignals) {
        createSeriesMarkers(seriesRefs.current.candle, buildMarkers(candles, toUnix, markerParams));
      }
      if (seriesRefs.current.vol) {
        seriesRefs.current.vol.setData(candles.map((c) => ({
          time: toUnix(c), value: c.volume, color: c.close >= c.open ? C.vol_up : C.vol_down,
        })));
      }
      if (seriesRefs.current.adx && seriesRefs.current.plusDI && seriesRefs.current.minusDI) {
        const { adx, plusDI, minusDI } = calcADX(candles, adxPeriod);
        const toLineData = (arr) => arr.map((v, i) => v == null ? null : { time: toUnix(candles[i]), value: v }).filter(Boolean);
        seriesRefs.current.adx.setData(toLineData(adx));
        seriesRefs.current.plusDI.setData(toLineData(plusDI));
        seriesRefs.current.minusDI.setData(toLineData(minusDI));
        if (seriesRefs.current.thresh) {
          seriesRefs.current.thresh.setData(candles.map((c) => ({ time: toUnix(c), value: adxThresh })));
        }
      }
      if (currentRange) {
        mainTimeScale.setVisibleLogicalRange(currentRange);
        if (volChartRef.current) volChartRef.current.timeScale().setVisibleLogicalRange(currentRange);
        if (adxChartRef.current) adxChartRef.current.timeScale().setVisibleLogicalRange(currentRange);
      }
      // 페이지 스크롤 위치 복원
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "instant" });
      });
      isSilentUpdate.current = false;
      return;
    }

    // ── 일반 업데이트: 차트 완전 재생성 ──
    isSilentUpdate.current = false;
    if (mainChartRef.current) { mainChartRef.current.remove(); mainChartRef.current = null; }
    if (volChartRef.current)  { volChartRef.current.remove();  volChartRef.current  = null; }
    if (adxChartRef.current)  { adxChartRef.current.remove();  adxChartRef.current  = null; }
    seriesRefs.current = {};

    const mainChart = createChart(mainRef.current, baseChartOptions(400, interval));
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: C.candle_up, downColor: C.candle_down,
      borderUpColor: C.candle_up, borderDownColor: C.candle_down,
      wickUpColor: C.wick_up, wickDownColor: C.wick_down,
    });
    candleSeries.setData(candles.map((c) => ({
      time: toUnix(c), open: c.open, high: c.high, low: c.low, close: c.close,
    })));
    seriesRefs.current.candle = candleSeries;

    if (showBoll) {
      const { upper, mid, lower } = calcBollinger(candles, bollPeriod, bollMult);
      const toLineData = (arr) => arr.map((v, i) => v == null ? null : { time: toUnix(candles[i]), value: v }).filter(Boolean);
      const bollUpperSeries = mainChart.addSeries(LineSeries, { color: C.boll_upper, lineWidth: 1, lineStyle: 2, title: `BB상단(${bollPeriod},${bollMult})` });
      const bollMidSeries   = mainChart.addSeries(LineSeries, { color: C.boll_mid,   lineWidth: 1, lineStyle: 1, title: "BB중간" });
      const bollLowerSeries = mainChart.addSeries(LineSeries, { color: C.boll_lower, lineWidth: 1, lineStyle: 2, title: "BB하단" });
      bollUpperSeries.setData(toLineData(upper));
      bollMidSeries.setData(toLineData(mid));
      bollLowerSeries.setData(toLineData(lower));
      seriesRefs.current.bollUpper = bollUpperSeries;
      seriesRefs.current.bollMid   = bollMidSeries;
      seriesRefs.current.bollLower = bollLowerSeries;
    }

    if (showHMA) {
      const hmaArr = calcHMA(candles, hmaPeriod);
      const hmaSeries = mainChart.addSeries(LineSeries, { color: C.hma, lineWidth: 2, title: `HMA(${hmaPeriod})` });
      hmaSeries.setData(hmaArr.map((v, i) => v == null ? null : { time: toUnix(candles[i]), value: v }).filter(Boolean));
      seriesRefs.current.hma = hmaSeries;
    }

    if (showVWAP) {
      const vwapArr = calcVWAP(candles);
      const vwapSeries = mainChart.addSeries(LineSeries, { color: C.vwap, lineWidth: 1, lineStyle: 3, title: "VWAP" });
      vwapSeries.setData(vwapArr.map((v, i) => v == null ? null : { time: toUnix(candles[i]), value: v }).filter(Boolean));
      seriesRefs.current.vwap = vwapSeries;
    }

    if (showSignals) {
      createSeriesMarkers(candleSeries, buildMarkers(candles, toUnix, markerParams));
    }

    if (showVolume && volRef.current) {
      const volChart = createChart(volRef.current, {
        ...baseChartOptions(120, interval),
        rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.1, bottom: 0 } },
      });
      volChartRef.current = volChart;
      const volSeries = volChart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "right" });
      volSeries.setData(candles.map((c) => ({
        time: toUnix(c), value: c.volume, color: c.close >= c.open ? C.vol_up : C.vol_down,
      })));
      seriesRefs.current.vol = volSeries;
      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => { if (range) volChart.timeScale().setVisibleLogicalRange(range); });
      volChart.timeScale().subscribeVisibleLogicalRangeChange((range) => { if (range) mainChart.timeScale().setVisibleLogicalRange(range); });
    }

    if (showADX && adxRef.current) {
      const adxChart = createChart(adxRef.current, {
        ...baseChartOptions(160, interval),
        timeScale: { borderColor: C.border, timeVisible: true, visible: true, rightOffset: 0, fixLeftEdge: true, tickMarkFormatter: (unixSec) => formatKST(unixSec, interval) },
        localization: { timeFormatter: (unixSec) => formatKST(unixSec, interval) },
      });
      adxChartRef.current = adxChart;
      const { adx, plusDI, minusDI } = calcADX(candles, adxPeriod);
      const toLineData = (arr) => arr.map((v, i) => v == null ? null : { time: toUnix(candles[i]), value: v }).filter(Boolean);
      const adxSeries     = adxChart.addSeries(LineSeries, { color: C.adx,      lineWidth: 2, title: `ADX(${adxPeriod})` });
      const plusDISeries  = adxChart.addSeries(LineSeries, { color: C.plus_di,  lineWidth: 1, title: "+DI" });
      const minusDISeries = adxChart.addSeries(LineSeries, { color: C.minus_di, lineWidth: 1, title: "-DI" });
      adxSeries.setData(toLineData(adx));
      plusDISeries.setData(toLineData(plusDI));
      minusDISeries.setData(toLineData(minusDI));
      seriesRefs.current.adx     = adxSeries;
      seriesRefs.current.plusDI  = plusDISeries;
      seriesRefs.current.minusDI = minusDISeries;
      const threshSeries = adxChart.addSeries(LineSeries, { color: "#3a4048", lineWidth: 1, lineStyle: 2, title: `임계(${adxThresh})` });
      threshSeries.setData(candles.map((c) => ({ time: toUnix(c), value: adxThresh })));
      seriesRefs.current.thresh = threshSeries;
      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => { if (range) adxChart.timeScale().setVisibleLogicalRange(range); });
      adxChart.timeScale().subscribeVisibleLogicalRangeChange((range) => { if (range) mainChart.timeScale().setVisibleLogicalRange(range); });
    }

    let isRestoringZoom = false;
    const handleZoomChange = (range) => {
      if (!isRestoringZoom && range) { savedZoomRange.current = range; isUserZoomed.current = true; }
    };
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleZoomChange);

    if (savedZoomRange.current && isUserZoomed.current) {
      isRestoringZoom = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (mainChartRef.current && savedZoomRange.current) {
            mainChartRef.current.timeScale().setVisibleLogicalRange(savedZoomRange.current);
            if (volChartRef.current) volChartRef.current.timeScale().setVisibleLogicalRange(savedZoomRange.current);
            if (adxChartRef.current) adxChartRef.current.timeScale().setVisibleLogicalRange(savedZoomRange.current);
          }
          isRestoringZoom = false;
        });
      });
    }

    const ro = new ResizeObserver(() => {
      if (mainChartRef.current && mainRef.current) mainChartRef.current.applyOptions({ width: mainRef.current.clientWidth });
      if (volChartRef.current  && volRef.current)  volChartRef.current.applyOptions({ width: volRef.current.clientWidth });
      if (adxChartRef.current  && adxRef.current)  adxChartRef.current.applyOptions({ width: adxRef.current.clientWidth });
    });
    if (mainRef.current) ro.observe(mainRef.current);

    return () => {
      ro.disconnect();
      if (mainChartRef.current) { mainChartRef.current.remove(); mainChartRef.current = null; }
      if (volChartRef.current)  { volChartRef.current.remove();  volChartRef.current  = null; }
      if (adxChartRef.current)  { adxChartRef.current.remove();  adxChartRef.current  = null; }
    };
  }, [candles, showBoll, showHMA, showVWAP, showADX, showVolume, showSignals,
      bollPeriod, bollMult, hmaPeriod, adxPeriod, adxThresh, interval, signalFilter]);

  // ── 스타일 ───────────────────────────────────────────────
  const inputStyle = {
    background: "#0a0d11", border: "1px solid #2a313c", borderRadius: 8,
    padding: "8px 10px", color: "#e6edf3", fontSize: 13,
    fontFamily: "'IBM Plex Mono', monospace", outline: "none", width: "100%",
    boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 11, color: "#7d8590", display: "block", marginBottom: 5 };
  const toggleBtn = (active, color, label, onClick) => (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}22` : "#11151a",
        border: `1px solid ${active ? color : "#2a313c"}`,
        borderRadius: 7, padding: "4px 10px",
        color: active ? color : "#5c6370",
        fontSize: 11, fontWeight: 700, cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      {label}
    </button>
  );

  const refreshMs = getRefreshMs(interval);
  const isVpBuyFilter = signalFilter === "vp_buy";

  return (
    <div>
      {/* ── VP 매수 신호 스캔 패널 ── */}
      <VpScanPanel allCoins={allCoins} onSelectCoin={handleVpSelectCoin} />

      {/* ── 설정 패널 ── */}
      <div style={{
        background: "#11151a", border: "1px solid #1c2128", borderRadius: 14,
        padding: 18, marginBottom: 16,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14,
      }}>
        {/* 코인 선택 — 한글명 포함 드롭다운 */}
        <div style={{ position: "relative" }}>
          <label style={labelStyle}>코인 (업비트 KRW)</label>
          <input
            value={showDropdown ? coinQuery : selectedCoin}
            onChange={(e) => { setCoinQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => { setCoinQuery(""); setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder={symbolsLoading ? "로딩 중…" : "심볼 또는 한글명 검색"}
            style={inputStyle}
            disabled={symbolsLoading}
          />
          {/* 선택된 코인 한글명 표시 */}
          {!showDropdown && selectedCoinName && (
            <div style={{ fontSize: 11, color: "#7d8590", marginTop: 4, paddingLeft: 2 }}>
              {selectedCoinName}
            </div>
          )}
          {showDropdown && filteredCoins.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
              background: "#161b22", border: "1px solid #2a313c", borderRadius: 8,
              maxHeight: 220, overflowY: "auto", zIndex: 20,
            }}>
              {filteredCoins.map((c) => (
                <div key={c.symbol}
                  onClick={() => { setSelectedCoin(c.symbol); setShowDropdown(false); setCoinQuery(""); }}
                  onMouseDown={(e) => e.preventDefault()}
                  style={{
                    padding: "7px 11px", fontSize: 12,
                    color: c.symbol === selectedCoin ? "#1f6feb" : "#e6edf3",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                    borderBottom: "1px solid #1c2128",
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, minWidth: 50 }}>
                    {c.symbol}
                  </span>
                  <span style={{ color: c.symbol === selectedCoin ? "#1f6feb" : "#7d8590", fontSize: 11 }}>
                    {c.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 인터벌 */}
        <div>
          <label style={labelStyle}>인터벌</label>
          <select value={interval} onChange={(e) => {
            const newInterval = e.target.value;
            setIntervalVal(newInterval);
            const opt = INTERVAL_OPTIONS.find((o) => o.value === newInterval);
            if (opt) setPeriod(opt.periods[0].v);
          }} style={inputStyle}>
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* 기간 */}
        <div>
          <label style={labelStyle}>기간</label>
          <select value={period} onChange={(e) => setPeriod(parseInt(e.target.value))} style={inputStyle}>
            {currentIntervalOpt.periods.map((p) => (
              <option key={p.v} value={p.v}>{p.l}</option>
            ))}
          </select>
        </div>

        {/* 볼린저 파라미터 */}
        <div>
          <label style={labelStyle}>볼린저 기간 / 배수</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" min={5} max={50} value={bollPeriod}
              onChange={(e) => setBollPeriod(parseInt(e.target.value) || 20)}
              style={{ ...inputStyle, width: "50%" }} />
            <input type="number" min={0.5} max={5} step={0.5} value={bollMult}
              onChange={(e) => setBollMult(parseFloat(e.target.value) || 2)}
              style={{ ...inputStyle, width: "50%" }} />
          </div>
        </div>

        {/* HMA 파라미터 */}
        <div>
          <label style={labelStyle}>HMA 기간</label>
          <input type="number" min={3} max={100} value={hmaPeriod}
            onChange={(e) => setHmaPeriod(parseInt(e.target.value) || 20)}
            style={inputStyle} />
        </div>

        {/* ADX 파라미터 */}
        <div>
          <label style={labelStyle}>ADX 기간 / 임계값</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" min={5} max={30} value={adxPeriod}
              onChange={(e) => setAdxPeriod(parseInt(e.target.value) || 14)}
              style={{ ...inputStyle, width: "50%" }} />
            <input type="number" min={10} max={50} value={adxThresh}
              onChange={(e) => setAdxThresh(parseInt(e.target.value) || 25)}
              style={{ ...inputStyle, width: "50%" }} />
          </div>
        </div>
      </div>

      {/* ── 지표 토글 버튼 ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#5c6370" }}>표시:</span>
        {toggleBtn(showBoll,    C.boll_upper, `볼린저(${bollPeriod},${bollMult})`, () => setShowBoll(v => !v))}
        {toggleBtn(showHMA,     C.hma,        `HMA(${hmaPeriod})`,                () => setShowHMA(v => !v))}
        {toggleBtn(showVWAP,    C.vwap,       "VWAP",                             () => setShowVWAP(v => !v))}
        {toggleBtn(showADX,     C.adx,        `ADX(${adxPeriod})`,                () => setShowADX(v => !v))}
        {toggleBtn(showVolume,  "#4caf6e",    "거래량",                            () => setShowVolume(v => !v))}
        {toggleBtn(showSignals, "#9198a1",    "신호마커",                          () => setShowSignals(v => !v))}

        <button
          onClick={() => loadCandles(false)}
          disabled={loading}
          style={{
            marginLeft: "auto",
            background: "#11151a", border: "1px solid #2a313c", borderRadius: 7,
            padding: "4px 10px", color: "#9198a1", fontSize: 11, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <RefreshCw size={11} className={loading ? "spin" : ""} />
          새로고침
        </button>
      </div>

      {/* ── 신호 필터 ── */}
      {showSignals && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
          background: "#11151a", border: `1px solid ${isVpBuyFilter ? "#c084fc50" : "#1c2128"}`,
          borderRadius: 10, padding: "8px 14px", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: "#7d8590", fontWeight: 600, whiteSpace: "nowrap" }}>
            🔍 신호 필터:
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SIGNAL_FILTER_OPTIONS.map((opt) => {
              const isActive = signalFilter === opt.value;
              const isVp = opt.value === "vp_buy";
              const activeColor = isVp ? "#c084fc" : "#4caf6e";
              return (
                <button
                  key={opt.value}
                  onClick={() => setSignalFilter(opt.value)}
                  style={{
                    background: isActive ? (isVp ? "rgba(192,132,252,0.18)" : "rgba(76,175,110,0.15)") : "transparent",
                    border: `1px solid ${isActive ? (isVp ? "#c084fc" : "#4caf6e") : "#2a313c"}`,
                    borderRadius: 7, padding: "3px 10px",
                    color: isActive ? activeColor : "#5c6370",
                    fontSize: 11, fontWeight: isActive ? 700 : 500, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {isVpBuyFilter && (
            <span style={{ fontSize: 11, color: "#c084fc", fontWeight: 600, marginLeft: 4 }}>
              ✦ VWAP 매수 신호만 표시 중
            </span>
          )}
        </div>
      )}

      {/* ── 범례 + 갱신 시각 ── */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12,
        fontSize: 11, color: "#5c6370", alignItems: "center",
      }}>
        {showBoll && <>
          <span style={{ color: C.boll_upper }}>── BB상단</span>
          <span style={{ color: C.boll_mid   }}>── BB중간</span>
          <span style={{ color: C.boll_lower }}>── BB하단</span>
        </>}
        {showHMA  && <span style={{ color: C.hma   }}>── HMA</span>}
        {showVWAP && <span style={{ color: C.vwap  }}>── VWAP</span>}
        {showADX  && <>
          <span style={{ color: C.adx      }}>── ADX</span>
          <span style={{ color: C.plus_di  }}>── +DI</span>
          <span style={{ color: C.minus_di }}>── -DI</span>
        </>}
        {showSignals && <>
          {(signalFilter === "all" || signalFilter === "buy_all" || signalFilter === "bb_buy")  && <span style={{ color: "#5d9bff" }}>▲ BB매수</span>}
          {signalFilter === "all" && <span style={{ color: "#ff5d5d" }}>▼ BB매도</span>}
          {(signalFilter === "all" || signalFilter === "buy_all" || signalFilter === "hma_buy") && <span style={{ color: "#ffd700" }}>▲ HMA매수</span>}
          {signalFilter === "all" && <span style={{ color: "#ff9900" }}>▼ HMA매도</span>}
          {(signalFilter === "all" || signalFilter === "buy_all" || signalFilter === "adx_buy") && <span style={{ color: "#4caf6e" }}>▲ ADX매수</span>}
          {signalFilter === "all" && <span style={{ color: "#ff5d5d" }}>▼ ADX매도</span>}
          {(signalFilter === "all" || signalFilter === "buy_all" || signalFilter === "vp_buy")  && <span style={{ color: "#c084fc", fontWeight: signalFilter === "vp_buy" ? 700 : 400 }}>▲ VP매수</span>}
          {signalFilter === "all" && <span style={{ color: "#a855f7" }}>▼ VP매도</span>}
        </>}
        {lastRefresh && (
          <span style={{ marginLeft: "auto", color: "#3a4048" }}>
            갱신: {lastRefresh.toLocaleTimeString("ko-KR")}
            {refreshMs && <span style={{ color: "#1f6feb" }}> · {refreshMs / 1000}초마다 자동갱신</span>}
          </span>
        )}
      </div>

      {/* ── 로딩 / 에러 ── */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7d8590", padding: "40px 0", justifyContent: "center" }}>
          <Loader2 size={18} className="spin" />
          <span>캔들 데이터 불러오는 중…</span>
        </div>
      )}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,93,93,0.08)", border: "1px solid rgba(255,93,93,0.25)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#ff8a8a",
        }}>
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {/* ── 차트 영역 ── */}
      {!loading && !error && (
        <>
          <div style={{ fontSize: 12, color: "#5c6370", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart2 size={13} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#9198a1", fontWeight: 700 }}>KRW-{selectedCoin}</span>
            {selectedCoinName && (
              <span style={{ color: "#7d8590", fontSize: 12 }}>{selectedCoinName}</span>
            )}
            <span>{currentIntervalOpt.label} 캔들차트 (업비트)</span>
          </div>

          <div ref={mainRef} style={{ width: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid #1c2128" }} />

          {showVolume && (
            <>
              <div style={{ fontSize: 11, color: "#5c6370", margin: "8px 0 4px", paddingLeft: 2 }}>
                거래량 — <span style={{ color: C.candle_up }}>▌상승</span> / <span style={{ color: C.candle_down }}>▌하락</span>
              </div>
              <div ref={volRef} style={{ width: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid #1c2128" }} />
            </>
          )}

          {showADX && (
            <>
              <div style={{ fontSize: 11, color: "#5c6370", margin: "8px 0 4px", paddingLeft: 2 }}>
                ADX 패널 — <span style={{ color: C.adx }}>ADX</span> / <span style={{ color: C.plus_di }}>+DI</span> / <span style={{ color: C.minus_di }}>-DI</span>
              </div>
              <div ref={adxRef} style={{ width: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid #1c2128" }} />
            </>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
