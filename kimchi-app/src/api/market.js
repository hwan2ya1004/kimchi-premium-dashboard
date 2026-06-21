// ============================================================
// 거래소 / 외부 API 호출 함수
// ============================================================

export async function fetchUpbitMarkets() {
  const res = await fetch("https://api.upbit.com/v1/market/all?isDetails=true");
  if (!res.ok) throw new Error(`업비트 마켓 목록 조회 실패 (HTTP ${res.status})`);
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

export async function fetchUpbitBatch(symbols) {
  // 업비트 API는 한 번에 최대 100개 처리 → 청크 분할
  const CHUNK_SIZE = 100;
  const map = {};
  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    const markets = chunk.map((s) => `KRW-${s}`).join(",");
    const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${markets}`);
    if (!res.ok) throw new Error(`업비트 시세 조회 실패 (HTTP ${res.status})`);
    const data = await res.json();
    data.forEach((d) => {
      const sym = d.market.replace("KRW-", "");
      map[sym] = d.trade_price;
    });
  }
  return map;
}

export async function fetchBithumbAll() {
  const res = await fetch("https://api.bithumb.com/public/ticker/ALL_KRW");
  if (!res.ok) throw new Error(`빗썸 시세 조회 실패 (HTTP ${res.status})`);
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

export async function fetchBinanceAll() {
  const res = await fetch("https://api.binance.com/api/v3/ticker/price");
  if (!res.ok) throw new Error(`바이낸스 시세 조회 실패 (HTTP ${res.status})`);
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

export async function fetchUsdKrw() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`환율 조회 실패 (HTTP ${res.status})`);
  const data = await res.json();
  return data.rates.KRW;
}

export async function fetchFearGreed() {
  const res = await fetch("https://api.alternative.me/fng/?limit=1");
  if (!res.ok) throw new Error(`공포탐욕지수 조회 실패 (HTTP ${res.status})`);
  const data = await res.json();
  const item = data.data?.[0];
  if (!item) throw new Error("공포탐욕지수 데이터 없음");
  return {
    value: parseInt(item.value, 10),
    classification: item.value_classification,
  };
}
