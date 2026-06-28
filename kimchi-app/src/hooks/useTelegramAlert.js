// ============================================================
// 텔레그램 알림 훅
// 알림 조건:
//   - 거래량 급등(TRADING_VOLUME_SOARING) + 역프리미엄(premium < 0) 코인만 알림
//   - high 기준 초과(프리미엄 급등) 코인은 알림 보내지 않음
//   - 새로 조건에 진입한 코인만 알림 (기존 코인 반복 알림 없음)
//   - VP 스캔 결과가 있으면 VP 신호 여부도 메시지에 포함
// ============================================================

import { useEffect, useRef } from "react";
import { isTelegramEnabled, sendTelegramMessage, escapeHtml } from "../utils/telegram.js";

/**
 * 텔레그램 알림 전송 훅
 * @param {object} params
 * @param {Array}    params.coinList   - 전체 코인 목록
 * @param {object}   params.snapshots  - 코인별 시세 스냅샷
 * @param {Set|null} params.vpSymbols  - VP 스캔 결과 심볼 Set (null=미스캔)
 * @param {Function} params.onSuccess  - 전송 성공 콜백 (message: string) => void
 * @param {Function} params.onError    - 전송 실패 콜백 (message: string) => void
 */
export function useTelegramAlert({ coinList, snapshots, vpSymbols, onSuccess, onError }) {
  // 최신값을 ref로 유지 (effect 의존성에서 제외하기 위함)
  const snapshotsRef  = useRef(snapshots);
  const coinListRef   = useRef(coinList);
  const vpSymbolsRef  = useRef(vpSymbols);

  // 이전 사이클의 심볼 Set을 ref로 보관
  const prevHotSymbolsRef = useRef(null);

  // 최신값 동기화 (렌더마다 ref 업데이트, effect 재실행 없음)
  useEffect(() => { snapshotsRef.current  = snapshots;  }, [snapshots]);
  useEffect(() => { coinListRef.current   = coinList;   }, [coinList]);
  useEffect(() => { vpSymbolsRef.current  = vpSymbols;  }, [vpSymbols]);

  // ── 알림 체크 함수 ────────────────────────────────────────
  const checkAndSend = useRef(null);
  checkAndSend.current = () => {
    if (!isTelegramEnabled) return;
    const currentCoinList  = coinListRef.current;
    const currentSnapshots = snapshotsRef.current;
    const currentVpSymbols = vpSymbolsRef.current;

    if (currentCoinList.length === 0) return;
    if (Object.keys(currentSnapshots).length === 0) return;

    // ── 거래량 급등 + 역프리미엄 코인만 필터 ──────────────
    // ※ high 기준 초과(프리미엄 급등) 코인은 포함하지 않음
    const currentHotCoins = currentCoinList.filter((c) => {
      if (c.warning) return false;
      const hasVolumeSurge = c.caution.includes("TRADING_VOLUME_SOARING");
      if (!hasVolumeSurge) return false;
      const snap = currentSnapshots[c.symbol];
      if (!snap) return false;
      // 역프리미엄(국내가 해외보다 싼 경우)만 알림
      const premium = snap.upbitPremium !== null ? snap.upbitPremium : snap.bithumbPremium;
      return premium !== null && premium < 0;
    });

    const currentHotSymbols = new Set(currentHotCoins.map((c) => c.symbol));

    // 첫 실행 시에는 기준점만 저장하고 알림 미전송
    if (prevHotSymbolsRef.current === null) {
      prevHotSymbolsRef.current = currentHotSymbols;
      return;
    }

    // ── 새로 진입한 코인만 추출 (기존 코인 반복 알림 없음) ──
    const newlyHotCoins = currentHotCoins.filter(
      (c) => !prevHotSymbolsRef.current.has(c.symbol)
    );

    prevHotSymbolsRef.current = currentHotSymbols;

    if (newlyHotCoins.length === 0) return;

    // ── 알림 메시지 생성 ──────────────────────────────────
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const coinLines = newlyHotCoins
      .map((c) => {
        const snap    = currentSnapshots[c.symbol];
        const premium = snap?.upbitPremium !== null ? snap?.upbitPremium : snap?.bithumbPremium;
        const premiumStr = premium !== null ? `${premium.toFixed(2)}%` : "—";
        const vpTag = currentVpSymbols !== null && currentVpSymbols.has(c.symbol)
          ? " | 💜 VP▲ VWAP상향돌파"
          : "";
        return `• <b>${escapeHtml(c.symbol)}</b> ${escapeHtml(c.name)} | 역프리미엄 ${premiumStr}${vpTag}`;
      })
      .join("\n");

    const msg =
      `🔥 <b>급등+역프리미엄 코인 감지!</b>\n\n` +
      `${coinLines}\n\n` +
      `⏰ ${now}\n` +
      `💡 거래량 급등 + 국내가 해외보다 싼 코인 (매수 후보)\n` +
      `📊 현재 총 ${currentHotCoins.length}개 감지 중`;

    sendTelegramMessage(msg)
      .then(() => onSuccess?.(`✅ ${newlyHotCoins.length}개 코인 알림 전송 완료`))
      .catch((err) => onError?.(`❌ 전송 실패: ${err.message}`));
  };

  // ── 30초마다 알림 체크 (snapshots 의존성 없음) ────────────
  useEffect(() => {
    if (!isTelegramEnabled) return;

    const CHECK_INTERVAL_MS = 30_000; // 30초

    // 첫 실행 시 기준점 초기화 (알림 미전송)
    prevHotSymbolsRef.current = null;

    // 즉시 1회 실행 (기준점 설정)
    checkAndSend.current();

    const id = setInterval(() => {
      checkAndSend.current();
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // snapshots, coinList, vpSymbols 제외 → ref로 최신값 참조
}
