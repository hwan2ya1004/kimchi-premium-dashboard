// ============================================================
// 시장 데이터 훅 — 시세 조회 및 상태 관리
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchUpbitMarkets,
  fetchUpbitBatch,
  fetchBithumbAll,
  fetchBinanceAll,
  fetchUsdKrw,
  fetchFearGreed,
} from "../api/market.js";
import { calcPremium } from "../utils/premium.js";

const REFRESH_MS = 30000;

export function useMarketData(high, low) {
  const [coinList, setCoinList]       = useState([]);
  const [snapshots, setSnapshots]     = useState({});
  const [usdKrw, setUsdKrw]           = useState(null);
  const [fng, setFng]                 = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [online, setOnline]           = useState(true);
  const [loading, setLoading]         = useState(true);

  const prevPremiums      = useRef({});
  const binanceSymbolsRef = useRef(new Set());

  // 업비트 코인 목록 초기 로드
  useEffect(() => {
    fetchUpbitMarkets()
      .then((list) => { setCoinList(list); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // 공포탐욕지수 — 5분마다 갱신
  useEffect(() => {
    fetchFearGreed().then(setFng).catch(() => {});
    const id = setInterval(() => {
      fetchFearGreed().then(setFng).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // 시세 갱신
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
        const upbit   = upbitMap[symbol]   ?? null;
        const bithumb = bithumbMap[symbol] ?? null;
        const binance = binanceMap[symbol] ?? null;

        const upbitPremium   = upbit   != null && binance != null ? calcPremium(upbit,   binance, rate) : null;
        const bithumbPremium = bithumb != null && binance != null ? calcPremium(bithumb, binance, rate) : null;

        const prevAlertZone = prevPremiums.current[symbol]?.alertZone || false;
        const nowAlert =
          (upbitPremium   !== null && (upbitPremium   >= high || upbitPremium   <= low)) ||
          (bithumbPremium !== null && (bithumbPremium >= high || bithumbPremium <= low));
        const flash = nowAlert && !prevAlertZone;

        prevPremiums.current[symbol] = { alertZone: nowAlert };
        return [symbol, { upbit, bithumb, binance, upbitPremium, bithumbPremium, flash }];
      });

      setSnapshots(Object.fromEntries(results));
      setLastUpdated(new Date());
    } catch {
      setOnline(false);
    }
  }, [coinList, high, low]);

  // 자동 갱신 인터벌
  useEffect(() => {
    if (coinList.length === 0) return;
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh, coinList]);

  return {
    coinList,
    snapshots,
    usdKrw,
    fng,
    lastUpdated,
    online,
    loading,
    refresh,
    binanceSymbolsRef,
  };
}
