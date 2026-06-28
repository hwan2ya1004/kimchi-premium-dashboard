// ============================================================
// 지표 최적화 탭 컴포넌트
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, Search, Play, Loader2 } from "lucide-react";

import {
  fetchAllUsdtSymbols,
  fetchKlines,
  gridSearch,
  INDICATOR_LABEL,
  formatParams,
} from "../utils/indicators.js";

export default function OptimizerTab() {
  const [allSymbols, setAllSymbols] = useState([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [symbolsError, setSymbolsError] = useState(false);
  const [coinQuery, setCoinQuery] = useState("");
  const [selectedCoin, setSelectedCoin] = useState("BTC");
  const [showDropdown, setShowDropdown] = useState(false);
  const [days, setDays] = useState(365);
  const [indicator, setIndicator] = useState("bollinger");
  const [minTrades, setMinTrades] = useState(5);
  const [useTpSl, setUseTpSl] = useState(true);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [candleCount, setCandleCount] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const symbols = await fetchAllUsdtSymbols();
        setAllSymbols(symbols);
      } catch (e) {
        setSymbolsError(true);
      } finally {
        setSymbolsLoading(false);
      }
    })();
  }, []);

  const filteredSymbols = useMemo(() => {
    if (!coinQuery) return allSymbols.slice(0, 30);
    const q = coinQuery.toUpperCase();
    return allSymbols.filter((s) => s.includes(q)).slice(0, 30);
  }, [allSymbols, coinQuery]);

  const runOptimization = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const candles = await fetchKlines(selectedCoin, days);
      if (!candles || candles.length < 30) {
        throw new Error("캔들 데이터가 너무 적습니다");
      }
      setCandleCount(candles.length);
      const gridResults = gridSearch(candles, indicator, minTrades, useTpSl);
      setResults(gridResults);
    } catch (e) {
      setError(e.message || "최적화 실행 중 오류가 발생했습니다");
    } finally {
      setRunning(false);
    }
  }, [selectedCoin, days, indicator, minTrades, useTpSl]);

  const inputStyle = {
    width: "100%",
    background: "#0a0d11",
    border: "1px solid #2a313c",
    borderRadius: 8,
    padding: "9px 11px",
    color: "#e6edf3",
    fontSize: 13.5,
    fontFamily: "'IBM Plex Mono', monospace",
    boxSizing: "border-box",
    outline: "none",
  };

  const labelStyle = {
    fontSize: 11.5,
    color: "#7d8590",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div>
      {/* 설정 패널 */}
      <div
        style={{
          background: "#11151a",
          border: "1px solid #1c2128",
          borderRadius: 14,
          padding: 20,
          marginBottom: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        {/* 코인 선택 */}
        <div style={{ position: "relative" }}>
          <label style={labelStyle}>코인 (바이낸스 USDT 마켓)</label>
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              color="#5c6370"
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
              }}
            />
            <input
              value={showDropdown ? coinQuery : selectedCoin}
              onChange={(e) => {
                setCoinQuery(e.target.value.toUpperCase());
                setShowDropdown(true);
              }}
              onFocus={() => {
                setCoinQuery("");
                setShowDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder={
                symbolsLoading
                  ? "코인 목록 불러오는 중…"
                  : "코인 검색 (예: BTC)"
              }
              style={{ ...inputStyle, paddingLeft: 30 }}
              disabled={symbolsLoading}
            />
          </div>
          {showDropdown && filteredSymbols.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: 4,
                background: "#161b22",
                border: "1px solid #2a313c",
                borderRadius: 8,
                maxHeight: 220,
                overflowY: "auto",
                zIndex: 10,
              }}
            >
              {filteredSymbols.map((s) => (
                <div
                  key={s}
                  onClick={() => {
                    setSelectedCoin(s);
                    setShowDropdown(false);
                    setCoinQuery("");
                  }}
                  style={{
                    padding: "8px 11px",
                    fontSize: 13,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: s === selectedCoin ? "#1f6feb" : "#e6edf3",
                    cursor: "pointer",
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
          {symbolsError && (
            <p style={{ fontSize: 11.5, color: "#ff8a8a", marginTop: 6 }}>
              코인 목록을 불러오지 못했습니다. 직접 심볼을 입력해 사용하세요.
            </p>
          )}
        </div>

        {/* 기간 선택 */}
        <div>
          <label style={labelStyle}>분석 기간 (일봉 개수)</label>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            style={inputStyle}
          >
            <option value={90}>최근 90일</option>
            <option value={180}>최근 180일</option>
            <option value={365}>최근 1년</option>
            <option value={730}>최근 2년</option>
          </select>
        </div>

        {/* 지표 선택 */}
        <div>
          <label style={labelStyle}>최적화할 지표</label>
          <select
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            style={inputStyle}
          >
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
            type="number"
            min={1}
            value={minTrades}
            onChange={(e) => setMinTrades(parseInt(e.target.value) || 1)}
            style={inputStyle}
          />
        </div>

        {/* 롱/숏 + TP/SL 사용 여부 */}
        <div>
          <label style={labelStyle}>진입/청산 방식</label>
          <button
            onClick={() => setUseTpSl((v) => !v)}
            style={{
              ...inputStyle,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              textAlign: "left",
              border: "1px solid #2a313c",
            }}
          >
            <span>{useTpSl ? "롱/숏 + TP·SL" : "롱/숏 (반대신호 청산만)"}</span>
            <span
              style={{
                color: useTpSl ? "#4caf6e" : "#5c6370",
                fontSize: 11,
              }}
            >
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
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: running ? "#1c2128" : "#1f6feb",
          border: "none",
          borderRadius: 10,
          padding: "11px 20px",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: running ? "default" : "pointer",
          marginBottom: 22,
        }}
      >
        {running ? (
          <Loader2 size={16} className="spin" />
        ) : (
          <Play size={16} />
        )}
        {running ? "최적화 실행 중…" : "최적화 실행"}
      </button>

      {/* 안내 문구 */}
      <p
        style={{
          fontSize: 12,
          color: "#5c6370",
          marginTop: -10,
          marginBottom: 22,
          lineHeight: 1.6,
        }}
      >
        승률(winRate) 기준으로 파라미터 조합을 정렬합니다.{" "}
        {useTpSl && "TP(익절)·SL(손절) 퍼센트도 함께 최적화하며, "}
        손익비(profit factor)가 1 미만이면 승률이 높아도 평균손실이 평균수익보다
        커서 전체적으로는 손실 구조일 수 있으니 함께 확인하세요. 매수 신호는 롱
        진입, 매도 신호는 숏 진입으로 처리하고{" "}
        {useTpSl
          ? "TP·SL 또는 반대신호 중 먼저 오는 조건으로 청산합니다."
          : "반대신호가 나오면 청산합니다."}
      </p>

      {/* 에러 */}
      {error && (
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
          {error}
        </div>
      )}

      {/* 결과 테이블 */}
      {results && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                color: "#e6edf3",
                fontWeight: 600,
              }}
            >
              {selectedCoin} · {INDICATOR_LABEL[indicator]} 최적화 결과
            </h3>
            <span
              style={{
                fontSize: 12,
                color: "#5c6370",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              캔들 {candleCount}개 · 조합 {results.length}개 통과
            </span>
          </div>

          {results.length === 0 ? (
            <div
              style={{ color: "#5c6370", fontSize: 13, padding: "20px 0" }}
            >
              조건을 만족하는 파라미터 조합이 없습니다. 최소 거래횟수를
              낮춰보세요.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid #2a313c" }}>
                    {[
                      "순위",
                      "파라미터",
                      ...(useTpSl ? ["TP/SL"] : []),
                      "승률",
                      "거래(롱/숏)",
                      "손익비",
                      "총수익률",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          color: "#7d8590",
                          fontWeight: 500,
                          fontSize: 11.5,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 15).map((r, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: "1px solid #1c2128",
                        background:
                          i === 0
                            ? "rgba(31,111,235,0.08)"
                            : "transparent",
                      }}
                    >
                      <td
                        style={{
                          padding: "9px 10px",
                          color: i === 0 ? "#1f6feb" : "#9198a1",
                          fontWeight: 600,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td
                        style={{
                          padding: "9px 10px",
                          color: "#e6edf3",
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 12.5,
                        }}
                      >
                        {formatParams(indicator, r.params)}
                      </td>
                      {useTpSl && (
                        <td
                          style={{
                            padding: "9px 10px",
                            color: "#9198a1",
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 12.5,
                          }}
                        >
                          +{r.tp}% / -{r.sl}%
                        </td>
                      )}
                      <td
                        style={{
                          padding: "9px 10px",
                          fontFamily: "'IBM Plex Mono', monospace",
                          color: r.winRate >= 50 ? "#4caf6e" : "#ff8a8a",
                          fontWeight: 600,
                        }}
                      >
                        {r.winRate.toFixed(1)}%
                      </td>
                      <td
                        style={{
                          padding: "9px 10px",
                          color: "#9198a1",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        {r.totalTrades} ({r.longTrades}/{r.shortTrades})
                      </td>
                      <td
                        style={{
                          padding: "9px 10px",
                          fontFamily: "'IBM Plex Mono', monospace",
                          color:
                            r.profitFactor >= 1 ? "#4caf6e" : "#ff8a8a",
                        }}
                      >
                        {r.profitFactor === Infinity
                          ? "∞"
                          : r.profitFactor.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: "9px 10px",
                          fontFamily: "'IBM Plex Mono', monospace",
                          color:
                            r.totalReturnPct >= 0 ? "#4caf6e" : "#ff8a8a",
                        }}
                      >
                        {r.totalReturnPct >= 0 ? "+" : ""}
                        {r.totalReturnPct.toFixed(1)}%
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
  );
}
