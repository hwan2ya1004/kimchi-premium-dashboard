// ============================================================
// 차트 탭 — TradingView lightweight-charts + 4개 지표 동시 표시
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { Loader2, AlertTriangle, BarChart2 } from "lucide-react";

import {
  fetchAllUsdtSymbols,
  fetchKlines,
  calcBollinger,
  calcHMA,
  calcADX,
  calcVWAP,
  signalsBollinger,
  signalsHMA,
  signalsADX,
  signalsVWAP,
} from "../utils/indicators.js";

// ── 기본 파라미터 ────────────────────────────────────────────
const DEFAULT_PARAMS = {
  bollinger: { period: 20, mult: 2 },
  hma:       { period: 20 },
  adx:       { period: 14, threshold: 25 },
};

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
  bg:          "#0a0d11",
  grid:        "#1c2128",
  text:        "#7d8590",
  border:      "#2a313c",
};

// ── 공통 차트 옵션 ───────────────────────────────────────────
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

export default function ChartTab() {
  const [allSymbols,    setAllSymbols]    = useState([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [coinQuery,     setCoinQuery]     = useState("");
  const [selectedCoin,  setSelectedCoin]  = useState("BTC");
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [days,          setDays]          = useState(365);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [candles,       setCandles]       = useState(null);

  // 파라미터 상태
  const [bollPeriod, setBollPeriod] = useState(DEFAULT_PARAMS.bollinger.period);
  const [bollMult,   setBollMult]   = useState(DEFAULT_PARAMS.bollinger.mult);
  const [hmaPeriod,  setHmaPeriod]  = useState(DEFAULT_PARAMS.hma.period);
  const [adxPeriod,  setAdxPeriod]  = useState(DEFAULT_PARAMS.adx.period);
  const [adxThresh,  setAdxThresh]  = useState(DEFAULT_PARAMS.adx.threshold);

  // 지표 표시 토글
  const [showBoll,  setShowBoll]  = useState(true);
  const [showHMA,   setShowHMA]   = useState(true);
  const [showVWAP,  setShowVWAP]  = useState(true);
  const [showADX,   setShowADX]   = useState(true);
  const [showSignals, setShowSignals] = useState(true);

  // 차트 DOM refs
  const mainRef = useRef(null);
  const adxRef  = useRef(null);

  // 차트 인스턴스 refs
  const mainChartRef = useRef(null);
  const adxChartRef  = useRef(null);
  const seriesRefs   = useRef({});

  // ── 코인 목록 로드 ───────────────────────────────────────
  useEffect(() => {
    fetchAllUsdtSymbols()
      .then(setAllSymbols)
      .catch(() => {})
      .finally(() => setSymbolsLoading(false));
  }, []);

  const filteredSymbols = useMemo(() => {
    if (!coinQuery) return allSymbols.slice(0, 30);
    const q = coinQuery.toUpperCase();
    return allSymbols.filter((s) => s.includes(q)).slice(0, 30);
  }, [allSymbols, coinQuery]);

  // ── 캔들 데이터 로드 ─────────────────────────────────────
  const loadCandles = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCandles(null);
    try {
      const data = await fetchKlines(selectedCoin, days);
      if (!data || data.length < 30) throw new Error("캔들 데이터가 너무 적습니다");
      setCandles(data);
    } catch (e) {
      setError(e.message || "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [selectedCoin, days]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  // ── 차트 생성 / 업데이트 ─────────────────────────────────
  useEffect(() => {
    if (!candles || !mainRef.current || !adxRef.current) return;

    // ── 기존 차트 제거 ──
    if (mainChartRef.current) { mainChartRef.current.remove(); mainChartRef.current = null; }
    if (adxChartRef.current)  { adxChartRef.current.remove();  adxChartRef.current  = null; }
    seriesRefs.current = {};

    // ── 메인 차트 생성 ──
    const mainChart = createChart(mainRef.current, baseChartOptions(420));
    mainChartRef.current = mainChart;

    // 캔들스틱
    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor:          C.candle_up,
      downColor:        C.candle_down,
      borderUpColor:    C.candle_up,
      borderDownColor:  C.candle_down,
      wickUpColor:      C.wick_up,
      wickDownColor:    C.wick_down,
    });
    const candleData = candles.map((c) => ({
      time:  Math.floor(c.time / 1000),
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);
    seriesRefs.current.candle = candleSeries;

    // ── 볼린저밴드 ──
    if (showBoll) {
      const { upper, mid, lower } = calcBollinger(candles, bollPeriod, bollMult);
      const toLineData = (arr) =>
        arr.map((v, i) => v == null ? null : { time: Math.floor(candles[i].time / 1000), value: v })
           .filter(Boolean);

      const bollUpperSeries = mainChart.addSeries(LineSeries, { color: C.boll_upper, lineWidth: 1, lineStyle: 2, title: `BB상단(${bollPeriod},${bollMult})` });
      const bollMidSeries   = mainChart.addSeries(LineSeries, { color: C.boll_mid,   lineWidth: 1, lineStyle: 1, title: "BB중간" });
      const bollLowerSeries = mainChart.addSeries(LineSeries, { color: C.boll_lower, lineWidth: 1, lineStyle: 2, title: "BB하단" });
      bollUpperSeries.setData(toLineData(upper));
      bollMidSeries.setData(toLineData(mid));
      bollLowerSeries.setData(toLineData(lower));
    }

    // ── HMA ──
    if (showHMA) {
      const hmaArr = calcHMA(candles, hmaPeriod);
      const hmaData = hmaArr.map((v, i) => v == null ? null : { time: Math.floor(candles[i].time / 1000), value: v }).filter(Boolean);
      const hmaSeries = mainChart.addSeries(LineSeries, { color: C.hma, lineWidth: 2, title: `HMA(${hmaPeriod})` });
      hmaSeries.setData(hmaData);
    }

    // ── VWAP ──
    if (showVWAP) {
      const vwapArr = calcVWAP(candles);
      const vwapData = vwapArr.map((v, i) => v == null ? null : { time: Math.floor(candles[i].time / 1000), value: v }).filter(Boolean);
      const vwapSeries = mainChart.addSeries(LineSeries, { color: C.vwap, lineWidth: 1, lineStyle: 3, title: "VWAP" });
      vwapSeries.setData(vwapData);
    }

    // ── 신호 마커 ──
    if (showSignals) {
      const allMarkers = [];

      // 볼린저 신호
      if (showBoll) {
        const sigs = signalsBollinger(candles, bollPeriod, bollMult);
        sigs.forEach((s) => {
          allMarkers.push({
            time:     Math.floor(candles[s.index].time / 1000),
            position: s.action === "buy" ? "belowBar" : "aboveBar",
            color:    s.action === "buy" ? "#5d9bff" : "#ff5d5d",
            shape:    s.action === "buy" ? "arrowUp" : "arrowDown",
            text:     s.action === "buy" ? "BB▲" : "BB▼",
            size:     1,
          });
        });
      }

      // HMA 신호
      if (showHMA) {
        const sigs = signalsHMA(candles, hmaPeriod);
        sigs.forEach((s) => {
          allMarkers.push({
            time:     Math.floor(candles[s.index].time / 1000),
            position: s.action === "buy" ? "belowBar" : "aboveBar",
            color:    s.action === "buy" ? "#ffd700" : "#ff9900",
            shape:    s.action === "buy" ? "arrowUp" : "arrowDown",
            text:     s.action === "buy" ? "HMA▲" : "HMA▼",
            size:     1,
          });
        });
      }

      // ADX 신호
      if (showADX) {
        const sigs = signalsADX(candles, adxPeriod, adxThresh);
        sigs.forEach((s) => {
          allMarkers.push({
            time:     Math.floor(candles[s.index].time / 1000),
            position: s.action === "buy" ? "belowBar" : "aboveBar",
            color:    s.action === "buy" ? "#4caf6e" : "#ff5d5d",
            shape:    s.action === "buy" ? "arrowUp" : "arrowDown",
            text:     s.action === "buy" ? "ADX▲" : "ADX▼",
            size:     1,
          });
        });
      }

      // VWAP 신호
      if (showVWAP) {
        const sigs = signalsVWAP(candles);
        sigs.forEach((s) => {
          allMarkers.push({
            time:     Math.floor(candles[s.index].time / 1000),
            position: s.action === "buy" ? "belowBar" : "aboveBar",
            color:    s.action === "buy" ? "#c084fc" : "#a855f7",
            shape:    s.action === "buy" ? "arrowUp" : "arrowDown",
            text:     s.action === "buy" ? "VP▲" : "VP▼",
            size:     1,
          });
        });
      }

      // 시간순 정렬 후 적용
      allMarkers.sort((a, b) => a.time - b.time);
      createSeriesMarkers(candleSeries, allMarkers);
    }

    // ── ADX 패널 차트 ──
    if (showADX) {
      const adxChart = createChart(adxRef.current, {
        ...baseChartOptions(180),
        timeScale: { borderColor: C.border, timeVisible: true, visible: true },
      });
      adxChartRef.current = adxChart;

      const { adx, plusDI, minusDI } = calcADX(candles, adxPeriod);
      const toLineData = (arr) =>
        arr.map((v, i) => v == null ? null : { time: Math.floor(candles[i].time / 1000), value: v })
           .filter(Boolean);

      const adxSeries      = adxChart.addSeries(LineSeries, { color: C.adx,      lineWidth: 2, title: `ADX(${adxPeriod})` });
      const plusDISeries   = adxChart.addSeries(LineSeries, { color: C.plus_di,  lineWidth: 1, title: "+DI" });
      const minusDISeries  = adxChart.addSeries(LineSeries, { color: C.minus_di, lineWidth: 1, title: "-DI" });

      adxSeries.setData(toLineData(adx));
      plusDISeries.setData(toLineData(plusDI));
      minusDISeries.setData(toLineData(minusDI));

      // 임계값 기준선
      const threshData = candles
        .map((c) => ({ time: Math.floor(c.time / 1000), value: adxThresh }));
      const threshSeries = adxChart.addSeries(LineSeries, { color: "#3a4048", lineWidth: 1, lineStyle: 2, title: `임계(${adxThresh})` });
      threshSeries.setData(threshData);

      // 메인 차트와 시간축 동기화
      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) adxChart.timeScale().setVisibleLogicalRange(range);
      });
      adxChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) mainChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // 차트 크기 자동 조정
    const ro = new ResizeObserver(() => {
      if (mainChartRef.current && mainRef.current) {
        mainChartRef.current.applyOptions({ width: mainRef.current.clientWidth });
      }
      if (adxChartRef.current && adxRef.current) {
        adxChartRef.current.applyOptions({ width: adxRef.current.clientWidth });
      }
    });
    if (mainRef.current) ro.observe(mainRef.current);

    return () => {
      ro.disconnect();
      if (mainChartRef.current) { mainChartRef.current.remove(); mainChartRef.current = null; }
      if (adxChartRef.current)  { adxChartRef.current.remove();  adxChartRef.current  = null; }
    };
  }, [candles, showBoll, showHMA, showVWAP, showADX, showSignals,
      bollPeriod, bollMult, hmaPeriod, adxPeriod, adxThresh]);

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

  return (
    <div>
      {/* ── 설정 패널 ── */}
      <div style={{
        background: "#11151a", border: "1px solid #1c2128", borderRadius: 14,
        padding: 18, marginBottom: 16,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14,
      }}>
        {/* 코인 선택 */}
        <div style={{ position: "relative" }}>
          <label style={labelStyle}>코인 (바이낸스 USDT)</label>
          <input
            value={showDropdown ? coinQuery : selectedCoin}
            onChange={(e) => { setCoinQuery(e.target.value.toUpperCase()); setShowDropdown(true); }}
            onFocus={() => { setCoinQuery(""); setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder={symbolsLoading ? "로딩 중…" : "코인 검색"}
            style={inputStyle}
            disabled={symbolsLoading}
          />
          {showDropdown && filteredSymbols.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
              background: "#161b22", border: "1px solid #2a313c", borderRadius: 8,
              maxHeight: 200, overflowY: "auto", zIndex: 20,
            }}>
              {filteredSymbols.map((s) => (
                <div key={s}
                  onClick={() => { setSelectedCoin(s); setShowDropdown(false); setCoinQuery(""); }}
                  onMouseDown={(e) => e.preventDefault()}
                  style={{
                    padding: "7px 11px", fontSize: 13,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: s === selectedCoin ? "#1f6feb" : "#e6edf3", cursor: "pointer",
                  }}
                >{s}</div>
              ))}
            </div>
          )}
        </div>

        {/* 기간 */}
        <div>
          <label style={labelStyle}>기간</label>
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} style={inputStyle}>
            <option value={90}>최근 90일</option>
            <option value={180}>최근 180일</option>
            <option value={365}>최근 1년</option>
            <option value={730}>최근 2년</option>
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#5c6370" }}>표시:</span>
        {toggleBtn(showBoll,    C.boll_upper, `볼린저(${bollPeriod},${bollMult})`, () => setShowBoll(v => !v))}
        {toggleBtn(showHMA,     C.hma,        `HMA(${hmaPeriod})`,                () => setShowHMA(v => !v))}
        {toggleBtn(showVWAP,    C.vwap,       "VWAP",                             () => setShowVWAP(v => !v))}
        {toggleBtn(showADX,     C.adx,        `ADX(${adxPeriod})`,                () => setShowADX(v => !v))}
        {toggleBtn(showSignals, "#9198a1",    "신호마커",                          () => setShowSignals(v => !v))}
      </div>

      {/* ── 범례 ── */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12,
        fontSize: 11, color: "#5c6370",
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

      {/* ── 메인 차트 ── */}
      {!loading && !error && (
        <>
          <div style={{ fontSize: 12, color: "#5c6370", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <BarChart2 size={13} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#9198a1", fontWeight: 700 }}>{selectedCoin}USDT</span>
            <span>일봉 캔들차트</span>
          </div>
          <div
            ref={mainRef}
            style={{
              width: "100%", borderRadius: 10, overflow: "hidden",
              border: "1px solid #1c2128",
            }}
          />
          {showADX && (
            <>
              <div style={{ fontSize: 11, color: "#5c6370", margin: "10px 0 6px", paddingLeft: 2 }}>
                ADX 패널 — <span style={{ color: C.adx }}>ADX</span> / <span style={{ color: C.plus_di }}>+DI</span> / <span style={{ color: C.minus_di }}>-DI</span>
              </div>
              <div
                ref={adxRef}
                style={{
                  width: "100%", borderRadius: 10, overflow: "hidden",
                  border: "1px solid #1c2128",
                }}
              />
            </>
          )}
        </>
      )}

      {/* 스핀 애니메이션 (OptimizerTab과 공유) */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
