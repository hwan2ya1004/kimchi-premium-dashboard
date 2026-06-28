// ============================================================
// 지표 최적화 탭 컴포넌트 (차트 + 최적화 통합)
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AlertTriangle, Search, Play, Loader2, BarChart2 } from "lucide-react";
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";

import {
  fetchAllKrwSymbols,
  fetchKlines,
  INTERVAL_OPTIONS,
  gridSearch,
  INDICATOR_LABEL,
  formatParams,
  calcBollinger,
  calcHMA,
  calcADX,
  calcVWAP,
  signalsBollinger,
  signalsHMA,
  signalsADX,
  signalsVWAP,
} from "../utils/indicators.js";

// ── 차트 색상 ────────────────────────────────────────────────
const C = {
  candle_up:   "#4caf6e",
  candle_down: "#ff5d5d",
  boll_upper:  "#ff5d5d",
  boll_mid:    "#7d8590",
  boll_lower:  "#5d9bff",
  hma:         "#ffd700",
  vwap:        "#c084fc",
  adx:         "#e6edf3",
  plus_di:     "#4caf6e",
  minus_di:    "#ff5d5d",
  bg:          "#0a0d11",
  grid:        "#1c2128",
  text:        "#7d8590",
  border:      "#2a313c",
};

function baseChartOptions(height) {
  return {
    height,
    layout:     { background: { color: C.bg }, textColor: C.text },
    grid:       { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    crosshair:  { mode: 1 },
    rightPriceScale: { borderColor: C.border },
    timeScale:  { borderColor: C.border, timeVisible: true },
  };
}

export default function OptimizerTab() {
  // ── 공통 상태 ────────────────────────────────────────────
  const [allSymbols,     setAllSymbols]     = useState([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [symbolsError,   setSymbolsError]   = useState(false);
  const [coinQuery,      setCoinQuery]      = useState("");
  const [selectedCoin,   setSelectedCoin]   = useState("BTC");
  const [showDropdown,   setShowDropdown]   = useState(false);
  const [interval,       setInterval]       = useState("1d");
  const [period,         setPeriod]         = useState(365);

  // ── 차트 상태 ────────────────────────────────────────────
  const [chartLoading,  setChartLoading]  = useState(false);
  const [chartError,    setChartError]    = useState(null);
  const [candles,       setCandles]       = useState(null);

  const [bollPeriod, setBollPeriod] = useState(20);
  const [bollMult,   setBollMult]   = useState(2);
  const [hmaPeriod,  setHmaPeriod]  = useState(20);
  const [adxPeriod,  setAdxPeriod]  = useState(14);
  const [adxThresh,  setAdxThresh]  = useState(25);

  const [showBoll,    setShowBoll]    = useState(true);
  const [showHMA,     setShowHMA]     = useState(true);
  const [showVWAP,    setShowVWAP]    = useState(true);
  const [showADX,     setShowADX]     = useState(true);
  const [showSignals, setShowSignals] = useState(true);

  const mainRef      = useRef(null);
  const adxRef       = useRef(null);
  const mainChartRef = useRef(null);
  const adxChartRef  = useRef(null);

  // ── 최적화 상태 ──────────────────────────────────────────
  const [indicator,   setIndicator]   = useState("bollinger");
  const [minTrades,   setMinTrades]   = useState(5);
  const [useTpSl,     setUseTpSl]     = useState(true);
  const [running,     setRunning]     = useState(false);
  const [optError,    setOptError]    = useState(null);
  const [results,     setResults]     = useState(null);
  const [candleCount, setCandleCount] = useState(null);

  const currentIntervalOpt = INTERVAL_OPTIONS.find((o) => o.value === interval) || INTERVAL_OPTIONS[5];

  // ── 코인 목록 로드 ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const symbols = await fetchAllKrwSymbols();
        setAllSymbols(symbols);
      } catch {
        setSymbolsError(true);
      } finally {
        setSymbolsLoading(false);
      }
    })();
  }, []);

  const filteredSymbols = useMemo(() => {
    if (!coinQuery) return allSymbols.slice(0, 100);
    const q = coinQuery.toUpperCase();
    return allSymbols.filter((s) => s.includes(q)).slice(0, 100);
  }, [allSymbols, coinQuery]);

  // ── 캔들 데이터 로드 ─────────────────────────────────────
  const loadCandles = useCallback(async () => {
    setChartLoading(true);
    setChartError(null);
    setCandles(null);
    try {
      const data = await fetchKlines(selectedCoin, period, interval);
      if (!data || data.length < 10) throw new Error("캔들 데이터가 너무 적습니다");
      setCandles(data);
    } catch (e) {
      setChartError(e.message || "데이터 로드 실패");
    } finally {
      setChartLoading(false);
    }
  }, [selectedCoin, period, interval]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  // ── 차트 생성 / 업데이트 ─────────────────────────────────
  useEffect(() => {
    if (!candles || !mainRef.current || !adxRef.current) return;

    if (mainChartRef.current) { mainChartRef.current.remove(); mainChartRef.current = null; }
    if (adxChartRef.current)  { adxChartRef.current.remove();  adxChartRef.current  = null; }

    // 메인 차트
    const mainChart = createChart(mainRef.current, baseChartOptions(420));
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: C.candle_up, downColor: C.candle_down,
      borderUpColor: C.candle_up, borderDownColor: C.candle_down,
      wickUpColor: C.candle_up, wickDownColor: C.candle_down,
    });
    const candleData = candles.map((c) => ({
      time: Math.floor(c.time / 1000),
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleSeries.setData(candleData);

    const toLineData = (arr) =>
      arr.map((v, i) => v == null ? null : { time: Math.floor(candles[i].time / 1000), value: v })
         .filter(Boolean);

    // 볼린저밴드
    if (showBoll) {
      const { upper, mid, lower } = calcBollinger(candles, bollPeriod, bollMult);
      mainChart.addSeries(LineSeries, { color: C.boll_upper, lineWidth: 1, lineStyle: 2, title: `BB상단(${bollPeriod},${bollMult})` }).setData(toLineData(upper));
      mainChart.addSeries(LineSeries, { color: C.boll_mid,   lineWidth: 1, lineStyle: 1, title: "BB중간" }).setData(toLineData(mid));
      mainChart.addSeries(LineSeries, { color: C.boll_lower, lineWidth: 1, lineStyle: 2, title: "BB하단" }).setData(toLineData(lower));
    }

    // HMA
    if (showHMA) {
      const hmaArr = calcHMA(candles, hmaPeriod);
      mainChart.addSeries(LineSeries, { color: C.hma, lineWidth: 2, title: `HMA(${hmaPeriod})` })
        .setData(hmaArr.map((v, i) => v == null ? null : { time: Math.floor(candles[i].time / 1000), value: v }).filter(Boolean));
    }

    // VWAP
    if (showVWAP) {
      const vwapArr = calcVWAP(candles);
      mainChart.addSeries(LineSeries, { color: C.vwap, lineWidth: 1, lineStyle: 3, title: "VWAP" })
        .setData(vwapArr.map((v, i) => v == null ? null : { time: Math.floor(candles[i].time / 1000), value: v }).filter(Boolean));
    }

    // 신호 마커
    if (showSignals) {
      const allMarkers = [];
      if (showBoll) {
        signalsBollinger(candles, bollPeriod, bollMult).forEach((s) => allMarkers.push({
          time: Math.floor(candles[s.index].time / 1000),
          position: s.action === "buy" ? "belowBar" : "aboveBar",
          color: s.action === "buy" ? "#5d9bff" : "#ff5d5d",
          shape: s.action === "buy" ? "arrowUp" : "arrowDown",
          text: s.action === "buy" ? "BB▲" : "BB▼", size: 1,
        }));
      }
      if (showHMA) {
        signalsHMA(candles, hmaPeriod).forEach((s) => allMarkers.push({
          time: Math.floor(candles[s.index].time / 1000),
          position: s.action === "buy" ? "belowBar" : "aboveBar",
          color: s.action === "buy" ? "#ffd700" : "#ff9900",
          shape: s.action === "buy" ? "arrowUp" : "arrowDown",
          text: s.action === "buy" ? "HMA▲" : "HMA▼", size: 1,
        }));
      }
      if (showADX) {
        signalsADX(candles, adxPeriod, adxThresh).forEach((s) => allMarkers.push({
          time: Math.floor(candles[s.index].time / 1000),
          position: s.action === "buy" ? "belowBar" : "aboveBar",
          color: s.action === "buy" ? "#4caf6e" : "#ff5d5d",
          shape: s.action === "buy" ? "arrowUp" : "arrowDown",
          text: s.action === "buy" ? "ADX▲" : "ADX▼", size: 1,
        }));
      }
      if (showVWAP) {
        signalsVWAP(candles).forEach((s) => allMarkers.push({
          time: Math.floor(candles[s.index].time / 1000),
          position: s.action === "buy" ? "belowBar" : "aboveBar",
          color: s.action === "buy" ? "#c084fc" : "#a855f7",
          shape: s.action === "buy" ? "arrowUp" : "arrowDown",
          text: s.action === "buy" ? "VP▲" : "VP▼", size: 1,
        }));
      }
      allMarkers.sort((a, b) => a.time - b.time);
      createSeriesMarkers(candleSeries, allMarkers);
    }

    // ADX 패널
    if (showADX) {
      const adxChart = createChart(adxRef.current, {
        ...baseChartOptions(180),
        timeScale: { borderColor: C.border, timeVisible: true, visible: true },
      });
      adxChartRef.current = adxChart;

      const { adx, plusDI, minusDI } = calcADX(candles, adxPeriod);
      adxChart.addSeries(LineSeries, { color: C.adx,      lineWidth: 2, title: `ADX(${adxPeriod})` }).setData(toLineData(adx));
      adxChart.addSeries(LineSeries, { color: C.plus_di,  lineWidth: 1, title: "+DI" }).setData(toLineData(plusDI));
      adxChart.addSeries(LineSeries, { color: C.minus_di, lineWidth: 1, title: "-DI" }).setData(toLineData(minusDI));
      adxChart.addSeries(LineSeries, { color: "#3a4048",  lineWidth: 1, lineStyle: 2, title: `임계(${adxThresh})` })
        .setData(candles.map((c) => ({ time: Math.floor(c.time / 1000), value: adxThresh })));

      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) adxChart.timeScale().setVisibleLogicalRange(range);
      });
      adxChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) mainChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // 크기 자동 조정
    const ro = new ResizeObserver(() => {
      if (mainChartRef.current && mainRef.current)
        mainChartRef.current.applyOptions({ width: mainRef.current.clientWidth });
      if (adxChartRef.current && adxRef.current)
        adxChartRef.current.applyOptions({ width: adxRef.current.clientWidth });
    });
    if (mainRef.current) ro.observe(mainRef.current);

    return () => {
      ro.disconnect();
      if (mainChartRef.current) { mainChartRef.current.remove(); mainChartRef.current = null; }
      if (adxChartRef.current)  { adxChartRef.current.remove();  adxChartRef.current  = null; }
    };
  }, [candles, showBoll, showHMA, showVWAP, showADX, showSignals,
      bollPeriod, bollMult, hmaPeriod, adxPeriod, adxThresh]);

  // ── 최적화 실행 ──────────────────────────────────────────
  const runOptimization = useCallback(async () => {
    setRunning(true);
    setOptError(null);
    setResults(null);
    try {
      const optCandles = await fetchKlines(selectedCoin, period, interval);
      if (!optCandles || optCandles.length < 10) throw new Error("캔들 데이터가 너무 적습니다");
      setCandleCount(optCandles.length);
      const gridResults = gridSearch(optCandles, indicator, minTrades, useTpSl);
      setResults(gridResults);

      // ── 1위 파라미터를 차트에 자동 적용 ──
      if (gridResults.length > 0) {
        const best = gridResults[0];
        if (indicator === "bollinger") {
          setBollPeriod(best.params.period);
          setBollMult(best.params.mult);
          setShowBoll(true);
        } else if (indicator === "hma") {
          setHmaPeriod(best.params.period);
          setShowHMA(true);
        } else if (indicator === "adx") {
          setAdxPeriod(best.params.period);
          setAdxThresh(best.params.threshold);
          setShowADX(true);
        } else if (indicator === "vwap") {
          setShowVWAP(true);
        }
      }
    } catch (e) {
      setOptError(e.message || "최적화 실행 중 오류가 발생했습니다");
    } finally {
      setRunning(false);
    }
  }, [selectedCoin, period, interval, indicator, minTrades, useTpSl]);

  // ── 스타일 ───────────────────────────────────────────────
  const inputStyle = {
    width: "100%",
    background: "#0a0d11", border: "1px solid #2a313c", borderRadius: 8,
    padding: "9px 11px", color: "#e6edf3", fontSize: 13.5,
    fontFamily: "'IBM Plex Mono', monospace", boxSizing: "border-box", outline: "none",
  };
  const labelStyle = { fontSize: 11.5, color: "#7d8590", display: "block", marginBottom: 6 };

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

  const sectionTitle = (text) => (
    <div style={{
      fontSize: 13, fontWeight: 700, color: "#9198a1",
      borderBottom: "1px solid #1c2128", paddingBottom: 10, marginBottom: 16,
      display: "flex", alignItems: "center", gap: 7,
    }}>
      {text}
    </div>
  );

  return (
    <div>
      {/* ── 공통 설정 패널 (코인 + 인터벌 + 기간) ── */}
      <div style={{
        background: "#11151a", border: "1px solid #1c2128", borderRadius: 14,
        padding: 20, marginBottom: 20,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16,
      }}>
        {/* 코인 선택 */}
        <div style={{ position: "relative" }}>
          <label style={labelStyle}>코인 (업비트 KRW 마켓)</label>
          <div style={{ position: "relative" }}>
            <Search size={14} color="#5c6370" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={showDropdown ? coinQuery : selectedCoin}
              onChange={(e) => { setCoinQuery(e.target.value.toUpperCase()); setShowDropdown(true); }}
              onFocus={() => { setCoinQuery(""); setShowDropdown(true); }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder={symbolsLoading ? "코인 목록 불러오는 중…" : "코인 검색 (예: BTC)"}
              style={{ ...inputStyle, paddingLeft: 30 }}
              disabled={symbolsLoading}
            />
          </div>
          {showDropdown && filteredSymbols.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
              background: "#161b22", border: "1px solid #2a313c", borderRadius: 8,
              maxHeight: 220, overflowY: "auto", zIndex: 10,
            }}>
              {filteredSymbols.map((s) => (
                <div key={s}
                  onClick={() => { setSelectedCoin(s); setShowDropdown(false); setCoinQuery(""); }}
                  onMouseDown={(e) => e.preventDefault()}
                  style={{
                    padding: "8px 11px", fontSize: 13,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: s === selectedCoin ? "#1f6feb" : "#e6edf3", cursor: "pointer",
                  }}
                >{s}</div>
              ))}
            </div>
          )}
          {symbolsError && (
            <p style={{ fontSize: 11.5, color: "#ff8a8a", marginTop: 6 }}>
              코인 목록을 불러오지 못했습니다. 직접 심볼을 입력해 사용하세요.
            </p>
          )}
        </div>

        {/* 인터벌 선택 */}
        <div>
          <label style={labelStyle}>인터벌</label>
          <select value={interval} onChange={(e) => {
            const newInterval = e.target.value;
            setInterval(newInterval);
            const opt = INTERVAL_OPTIONS.find((o) => o.value === newInterval);
            if (opt) setPeriod(opt.periods[0].v);
          }} style={inputStyle}>
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* 기간 선택 */}
        <div>
          <label style={labelStyle}>기간</label>
          <select value={period} onChange={(e) => setPeriod(parseInt(e.target.value))} style={inputStyle}>
            {currentIntervalOpt.periods.map((p) => (
              <option key={p.v} value={p.v}>{p.l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════ */}
      {/* ── 차트 섹션 ── */}
      {/* ════════════════════════════════════════════════════ */}
      {sectionTitle(<><BarChart2 size={14} /> 캔들차트 &amp; 지표</>)}

      {/* 차트 파라미터 패널 */}
      <div style={{
        background: "#11151a", border: "1px solid #1c2128", borderRadius: 14,
        padding: 18, marginBottom: 14,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14,
      }}>
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

      {/* 지표 토글 버튼 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#5c6370" }}>표시:</span>
        {toggleBtn(showBoll,    C.boll_upper, `볼린저(${bollPeriod},${bollMult})`, () => setShowBoll(v => !v))}
        {toggleBtn(showHMA,     C.hma,        `HMA(${hmaPeriod})`,                () => setShowHMA(v => !v))}
        {toggleBtn(showVWAP,    C.vwap,       "VWAP",                             () => setShowVWAP(v => !v))}
        {toggleBtn(showADX,     C.adx,        `ADX(${adxPeriod})`,                () => setShowADX(v => !v))}
        {toggleBtn(showSignals, "#9198a1",    "신호마커",                          () => setShowSignals(v => !v))}
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12, fontSize: 11, color: "#5c6370" }}>
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
          <span style={{ color: "#5d9bff" }}>▲ BB매수</span>
          <span style={{ color: "#ff5d5d" }}>▼ BB매도</span>
          <span style={{ color: "#ffd700" }}>▲ HMA매수</span>
          <span style={{ color: "#ff9900" }}>▼ HMA매도</span>
          <span style={{ color: "#4caf6e" }}>▲ ADX매수</span>
          <span style={{ color: "#ff5d5d" }}>▼ ADX매도</span>
          <span style={{ color: "#c084fc" }}>▲ VP매수</span>
          <span style={{ color: "#a855f7" }}>▼ VP매도</span>
        </>}
      </div>

      {/* 로딩 / 에러 */}
      {chartLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7d8590", padding: "40px 0", justifyContent: "center" }}>
          <Loader2 size={18} className="spin" />
          <span>캔들 데이터 불러오는 중…</span>
        </div>
      )}
      {chartError && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,93,93,0.08)", border: "1px solid rgba(255,93,93,0.25)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#ff8a8a",
        }}>
          <AlertTriangle size={15} />
          {chartError}
        </div>
      )}

      {/* 메인 차트 */}
      {!chartLoading && !chartError && (
        <>
          <div style={{ fontSize: 12, color: "#5c6370", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart2 size={13} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#9198a1", fontWeight: 700 }}>KRW-{selectedCoin}</span>
            <span>{currentIntervalOpt.label} 캔들차트 (업비트)</span>
          </div>
          <div ref={mainRef} style={{ width: "100%", height: 420, borderRadius: 10, overflow: "hidden", border: "1px solid #1c2128" }} />
          {showADX && (
            <>
              <div style={{ fontSize: 11, color: "#5c6370", margin: "10px 0 6px", paddingLeft: 2 }}>
                ADX 패널 — <span style={{ color: C.adx }}>ADX</span> / <span style={{ color: C.plus_di }}>+DI</span> / <span style={{ color: C.minus_di }}>-DI</span>
              </div>
              <div ref={adxRef} style={{ width: "100%", height: 180, borderRadius: 10, overflow: "hidden", border: "1px solid #1c2128" }} />
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════ */}
      {/* ── 최적화 섹션 ── */}
      {/* ════════════════════════════════════════════════════ */}
      <div style={{ marginTop: 32 }}>
        {sectionTitle(<><span style={{ fontSize: 15 }}>⚙️</span> 파라미터 최적화</>)}

        {/* 최적화 전용 설정 */}
        <div style={{
          background: "#11151a", border: "1px solid #1c2128", borderRadius: 14,
          padding: 20, marginBottom: 20,
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16,
        }}>
          {/* 지표 선택 */}
          <div>
            <label style={labelStyle}>최적화할 지표</label>
            <select value={indicator} onChange={(e) => setIndicator(e.target.value)} style={inputStyle}>
              <option value="bollinger">볼린저밴드</option>
              <option value="hma">HMA</option>
              <option value="adx">ADX</option>
              <option value="vwap">VWAP</option>
            </select>
          </div>

          {/* 최소 거래횟수 */}
          <div>
            <label style={labelStyle}>최소 거래횟수 (필터)</label>
            <input
              type="number" min={1} value={minTrades}
              onChange={(e) => setMinTrades(parseInt(e.target.value) || 1)}
              style={inputStyle}
            />
          </div>

          {/* 진입/청산 방식 */}
          <div>
            <label style={labelStyle}>진입/청산 방식</label>
            <button
              onClick={() => setUseTpSl((v) => !v)}
              style={{
                ...inputStyle,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", textAlign: "left", border: "1px solid #2a313c",
              }}
            >
              <span>{useTpSl ? "롱/숏 + TP·SL" : "롱/숏 (반대신호 청산만)"}</span>
              <span style={{ color: useTpSl ? "#4caf6e" : "#5c6370", fontSize: 11 }}>
                {useTpSl ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </div>

        {/* 실행 버튼 */}
        <button
          onClick={runOptimization}
          disabled={running}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: running ? "#1c2128" : "#1f6feb",
            border: "none", borderRadius: 10, padding: "11px 20px",
            color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: running ? "default" : "pointer", marginBottom: 22,
          }}
        >
          {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          {running ? "최적화 실행 중…" : "최적화 실행"}
        </button>

        {/* 안내 문구 */}
        <p style={{ fontSize: 12, color: "#5c6370", marginTop: -10, marginBottom: 22, lineHeight: 1.6 }}>
          승률(winRate) 기준으로 파라미터 조합을 정렬합니다.{" "}
          {useTpSl && "TP(익절)·SL(손절) 퍼센트도 함께 최적화하며, "}
          손익비(profit factor)가 1 미만이면 승률이 높아도 평균손실이 평균수익보다
          커서 전체적으로는 손실 구조일 수 있으니 함께 확인하세요. 매수 신호는 롱
          진입, 매도 신호는 숏 진입으로 처리하고{" "}
          {useTpSl ? "TP·SL 또는 반대신호 중 먼저 오는 조건으로 청산합니다." : "반대신호가 나오면 청산합니다."}
        </p>

        {/* 에러 */}
        {optError && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,93,93,0.08)", border: "1px solid rgba(255,93,93,0.25)",
            borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#ff8a8a",
          }}>
            <AlertTriangle size={15} />
            {optError}
          </div>
        )}

        {/* 결과 테이블 */}
        {results && (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: "#e6edf3", fontWeight: 600 }}>
                KRW-{selectedCoin} · {INDICATOR_LABEL[indicator]} 최적화 결과
              </h3>
              <span style={{ fontSize: 12, color: "#5c6370", fontFamily: "'IBM Plex Mono', monospace" }}>
                캔들 {candleCount}개 · 조합 {results.length}개 통과
              </span>
            </div>

            {results.length === 0 ? (
              <div style={{ color: "#5c6370", fontSize: 13, padding: "20px 0" }}>
                조건을 만족하는 파라미터 조합이 없습니다. 최소 거래횟수를 낮춰보세요.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2a313c" }}>
                      {["순위", "파라미터", ...(useTpSl ? ["TP/SL"] : []), "승률", "거래(롱/숏)", "손익비", "총수익률"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "#7d8590", fontWeight: 500, fontSize: 11.5 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 15).map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1c2128", background: i === 0 ? "rgba(31,111,235,0.08)" : "transparent" }}>
                        <td style={{ padding: "9px 10px", color: i === 0 ? "#1f6feb" : "#9198a1", fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: "9px 10px", color: "#e6edf3", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
                          {formatParams(indicator, r.params)}
                        </td>
                        {useTpSl && (
                          <td style={{ padding: "9px 10px", color: "#9198a1", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
                            +{r.tp}% / -{r.sl}%
                          </td>
                        )}
                        <td style={{ padding: "9px 10px", fontFamily: "'IBM Plex Mono', monospace", color: r.winRate >= 50 ? "#4caf6e" : "#ff8a8a", fontWeight: 600 }}>
                          {r.winRate.toFixed(1)}%
                        </td>
                        <td style={{ padding: "9px 10px", color: "#9198a1", fontFamily: "'IBM Plex Mono', monospace" }}>
                          {r.totalTrades} ({r.longTrades}/{r.shortTrades})
                        </td>
                        <td style={{ padding: "9px 10px", fontFamily: "'IBM Plex Mono', monospace", color: r.profitFactor >= 1 ? "#4caf6e" : "#ff8a8a" }}>
                          {r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2)}
                        </td>
                        <td style={{ padding: "9px 10px", fontFamily: "'IBM Plex Mono', monospace", color: r.totalReturnPct >= 0 ? "#4caf6e" : "#ff8a8a" }}>
                          {r.totalReturnPct >= 0 ? "+" : ""}{r.totalReturnPct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 스핀 애니메이션 */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
