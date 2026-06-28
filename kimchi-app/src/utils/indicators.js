// ============================================================
// 지표 계산 / 백테스트 / 그리드서치 유틸리티
// ============================================================

// ── 바이낸스 API ─────────────────────────────────────────────
export async function fetchAllUsdtSymbols() {
  const res = await fetch("https://api.binance.com/api/v3/exchangeInfo");
  if (!res.ok) throw new Error("exchangeInfo");
  const data = await res.json();
  return data.symbols
    .filter(
      (s) =>
        s.quoteAsset === "USDT" &&
        s.status === "TRADING" &&
        s.isSpotTradingAllowed
    )
    .map((s) => s.baseAsset)
    .sort();
}

export async function fetchKlines(symbolBase, days) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbolBase}USDT&interval=1d&limit=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("klines");
  const data = await res.json();
  return data.map((row) => ({
    time: row[0],
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[5]),
  }));
}

// ── 지표 계산 함수 ───────────────────────────────────────────
function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function wma(values, period) {
  const out = new Array(values.length).fill(null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += values[i - j] * (period - j);
    out[i] = acc / denom;
  }
  return out;
}

function stddev(values, period, meanArr) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    const m = meanArr[i];
    for (let j = 0; j < period; j++) {
      const d = values[i - j] - m;
      acc += d * d;
    }
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

export function calcBollinger(candles, period, mult) {
  const closes = candles.map((c) => c.close);
  const mid = sma(closes, period);
  const sd = stddev(closes, period, mid);
  const upper = mid.map((m, i) => (m == null ? null : m + mult * sd[i]));
  const lower = mid.map((m, i) => (m == null ? null : m - mult * sd[i]));
  return { mid, upper, lower };
}

export function calcHMA(candles, period) {
  const closes = candles.map((c) => c.close);
  const halfPeriod = Math.max(1, Math.round(period / 2));
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)));
  const wmaHalf = wma(closes, halfPeriod);
  const wmaFull = wma(closes, period);
  const diff = closes.map((_, i) =>
    wmaHalf[i] == null || wmaFull[i] == null
      ? null
      : 2 * wmaHalf[i] - wmaFull[i]
  );
  const validStart = diff.findIndex((v) => v != null);
  if (validStart === -1) return new Array(closes.length).fill(null);
  const compact = diff.slice(validStart).map((v) => (v == null ? 0 : v));
  const hmaCompact = wma(compact, sqrtPeriod);
  const out = new Array(closes.length).fill(null);
  for (let i = 0; i < hmaCompact.length; i++) {
    if (hmaCompact[i] != null) out[i + validStart] = hmaCompact[i];
  }
  return out;
}

export function calcADX(candles, period) {
  const n = candles.length;
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    const highLow = candles[i].high - candles[i].low;
    const highClose = Math.abs(candles[i].high - candles[i - 1].close);
    const lowClose = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(highLow, highClose, lowClose);
  }

  function wilderSmooth(arr, p) {
    const out = new Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 1; i <= p; i++) sum += arr[i] || 0;
    out[p] = sum;
    for (let i = p + 1; i < arr.length; i++) {
      sum = out[i - 1] - out[i - 1] / p + arr[i];
      out[i] = sum;
    }
    return out;
  }

  const smTR = wilderSmooth(tr, period);
  const smPlusDM = wilderSmooth(plusDM, period);
  const smMinusDM = wilderSmooth(minusDM, period);

  const plusDI = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  const dx = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (smTR[i] == null || smTR[i] === 0) continue;
    plusDI[i] = (100 * smPlusDM[i]) / smTR[i];
    minusDI[i] = (100 * smMinusDM[i]) / smTR[i];
    const diSum = plusDI[i] + minusDI[i];
    dx[i] =
      diSum === 0 ? 0 : (100 * Math.abs(plusDI[i] - minusDI[i])) / diSum;
  }

  const adx = new Array(n).fill(null);
  const validDxStart = dx.findIndex((v) => v != null);
  if (validDxStart !== -1 && validDxStart + period <= n) {
    let sum = 0;
    for (let i = validDxStart; i < validDxStart + period; i++) sum += dx[i];
    adx[validDxStart + period - 1] = sum / period;
    for (let i = validDxStart + period; i < n; i++) {
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }

  return { adx, plusDI, minusDI };
}

export function calcVWAP(candles) {
  const out = new Array(candles.length).fill(null);
  let cumPV = 0;
  let cumVol = 0;
  let lastDay = null;
  for (let i = 0; i < candles.length; i++) {
    const day = new Date(candles[i].time).toISOString().slice(0, 10);
    if (day !== lastDay) {
      cumPV = 0;
      cumVol = 0;
      lastDay = day;
    }
    const typicalPrice =
      (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPV += typicalPrice * candles[i].volume;
    cumVol += candles[i].volume;
    out[i] = cumVol === 0 ? null : cumPV / cumVol;
  }
  return out;
}

// ── 백테스트 엔진 ────────────────────────────────────────────
export function runBacktest(candles, signals, tpPct = null, slPct = null) {
  let position = null;
  const trades = [];

  function closePosition(exitPrice, exitIndex, reason) {
    const raw =
      position.side === "long"
        ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;
    trades.push({
      side: position.side,
      entryIndex: position.entryIndex,
      exitIndex,
      entryPrice: position.entryPrice,
      exitPrice,
      pnlPct: raw,
      reason,
    });
    position = null;
  }

  const signalByIndex = new Map();
  for (const sig of signals) signalByIndex.set(sig.index, sig.action);

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    if (position && tpPct != null && slPct != null) {
      const tpPrice =
        position.side === "long"
          ? position.entryPrice * (1 + tpPct / 100)
          : position.entryPrice * (1 - tpPct / 100);
      const slPrice =
        position.side === "long"
          ? position.entryPrice * (1 - slPct / 100)
          : position.entryPrice * (1 + slPct / 100);

      const hitTP =
        position.side === "long" ? c.high >= tpPrice : c.low <= tpPrice;
      const hitSL =
        position.side === "long" ? c.low <= slPrice : c.high >= slPrice;

      if (hitSL) {
        closePosition(slPrice, i, "SL");
      } else if (hitTP) {
        closePosition(tpPrice, i, "TP");
      }
    }

    const action = signalByIndex.get(i);
    if (!action) continue;

    if (!position) {
      if (action === "buy")
        position = { side: "long", entryPrice: c.close, entryIndex: i };
      else if (action === "sell")
        position = { side: "short", entryPrice: c.close, entryIndex: i };
    } else {
      const isOpposite =
        (position.side === "long" && action === "sell") ||
        (position.side === "short" && action === "buy");
      if (isOpposite) closePosition(c.close, i, "SIGNAL");
    }
  }

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);
  const winRate = totalTrades === 0 ? 0 : (wins.length / totalTrades) * 100;
  const avgWin = wins.length
    ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? Math.abs(losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length)
    : 0;
  const profitFactor =
    avgLoss === 0 ? (avgWin > 0 ? Infinity : 0) : avgWin / avgLoss;
  const totalReturnPct = trades.reduce((a, t) => a + t.pnlPct, 0);
  const longTrades = trades.filter((t) => t.side === "long").length;
  const shortTrades = trades.filter((t) => t.side === "short").length;
  return {
    trades,
    totalTrades,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    totalReturnPct,
    longTrades,
    shortTrades,
  };
}

// ── 신호 생성 함수 ───────────────────────────────────────────
export function signalsBollinger(candles, period, mult) {
  const { upper, lower } = calcBollinger(candles, period, mult);
  const signals = [];
  for (let i = 1; i < candles.length; i++) {
    if (lower[i] == null || upper[i] == null) continue;
    if (
      candles[i].close <= lower[i] &&
      candles[i - 1].close > lower[i - 1]
    ) {
      signals.push({ index: i, action: "buy" });
    } else if (
      candles[i].close >= upper[i] &&
      candles[i - 1].close < upper[i - 1]
    ) {
      signals.push({ index: i, action: "sell" });
    }
  }
  return signals;
}

export function signalsHMA(candles, period) {
  const hmaArr = calcHMA(candles, period);
  const signals = [];
  for (let i = 1; i < candles.length; i++) {
    if (hmaArr[i] == null || hmaArr[i - 1] == null) continue;
    const prevAbove = candles[i - 1].close > hmaArr[i - 1];
    const nowAbove = candles[i].close > hmaArr[i];
    if (!prevAbove && nowAbove) signals.push({ index: i, action: "buy" });
    else if (prevAbove && !nowAbove)
      signals.push({ index: i, action: "sell" });
  }
  return signals;
}

export function signalsADX(candles, period, threshold) {
  const { adx, plusDI, minusDI } = calcADX(candles, period);
  const signals = [];
  for (let i = 1; i < candles.length; i++) {
    if (adx[i] == null || plusDI[i] == null || minusDI[i] == null) continue;
    if (plusDI[i - 1] == null || minusDI[i - 1] == null) continue;
    const prevDiff = plusDI[i - 1] - minusDI[i - 1];
    const nowDiff = plusDI[i] - minusDI[i];
    const strongTrend = adx[i] >= threshold;
    if (strongTrend && prevDiff <= 0 && nowDiff > 0)
      signals.push({ index: i, action: "buy" });
    else if (prevDiff >= 0 && nowDiff < 0)
      signals.push({ index: i, action: "sell" });
  }
  return signals;
}

export function signalsVWAP(candles) {
  const vwapArr = calcVWAP(candles);
  const signals = [];
  for (let i = 1; i < candles.length; i++) {
    if (vwapArr[i] == null || vwapArr[i - 1] == null) continue;
    const prevAbove = candles[i - 1].close > vwapArr[i - 1];
    const nowAbove = candles[i].close > vwapArr[i];
    if (!prevAbove && nowAbove) signals.push({ index: i, action: "buy" });
    else if (prevAbove && !nowAbove)
      signals.push({ index: i, action: "sell" });
  }
  return signals;
}

// ── 그리드서치 ───────────────────────────────────────────────
export function buildParamGrid(indicatorKey) {
  const grid = [];
  if (indicatorKey === "bollinger") {
    for (let period = 10; period <= 30; period += 10) {
      for (let mult = 1.5; mult <= 3; mult += 0.5) {
        grid.push({ period, mult: Math.round(mult * 10) / 10 });
      }
    }
  } else if (indicatorKey === "hma") {
    for (let period = 5; period <= 50; period += 10) grid.push({ period });
  } else if (indicatorKey === "adx") {
    for (let period = 10; period <= 20; period += 4) {
      for (let threshold = 15; threshold <= 35; threshold += 10)
        grid.push({ period, threshold });
    }
  } else if (indicatorKey === "vwap") {
    grid.push({});
  }
  return grid;
}

const TP_GRID = [1.5, 2, 3, 4, 5, 7];
const SL_GRID = [1, 1.5, 2, 3];

export function buildTpSlGrid() {
  const grid = [];
  for (const tp of TP_GRID) {
    for (const sl of SL_GRID) {
      grid.push({ tp, sl });
    }
  }
  return grid;
}

export function gridSearch(candles, indicatorKey, minTrades, useTpSl) {
  const paramGrid = buildParamGrid(indicatorKey);
  const tpSlGrid = useTpSl ? buildTpSlGrid() : [{ tp: null, sl: null }];
  const results = [];

  for (const params of paramGrid) {
    let signals;
    if (indicatorKey === "bollinger")
      signals = signalsBollinger(candles, params.period, params.mult);
    else if (indicatorKey === "hma")
      signals = signalsHMA(candles, params.period);
    else if (indicatorKey === "adx")
      signals = signalsADX(candles, params.period, params.threshold);
    else if (indicatorKey === "vwap") signals = signalsVWAP(candles);
    else continue;

    for (const { tp, sl } of tpSlGrid) {
      const result = runBacktest(candles, signals, tp, sl);
      if (result.totalTrades < minTrades) continue;
      results.push({ params, tp, sl, ...result });
    }
  }
  results.sort((a, b) =>
    b.winRate !== a.winRate
      ? b.winRate - a.winRate
      : b.totalTrades - a.totalTrades
  );
  return results;
}

// ── 헬퍼 ────────────────────────────────────────────────────
export const INDICATOR_LABEL = {
  bollinger: "볼린저밴드",
  hma: "HMA",
  adx: "ADX",
  vwap: "VWAP",
};

export function formatParams(indicatorKey, params) {
  if (indicatorKey === "bollinger")
    return `기간 ${params.period} · 배수 ${params.mult}`;
  if (indicatorKey === "hma") return `기간 ${params.period}`;
  if (indicatorKey === "adx")
    return `기간 ${params.period} · 임계값 ${params.threshold}`;
  if (indicatorKey === "vwap") return "파라미터 없음 (일별 리셋)";
  return "";
}
