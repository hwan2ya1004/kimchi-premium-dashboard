// ============================================================
// 텔레그램 알림 훅
// 버그 수정:
//   1. eslint-disable 제거 — coinList, snapshots, high, low 모두 의존성에 포함
//   2. useRef로 이전 상태 추적하여 stale closure 방지
//   3. 탭 이름과 일치하도록 메시지 텍스트 수정 ("급등+역프리미엄")
// ============================================================

import { useEffect, useRef } from "react";
import { isTelegramEnabled, sendTelegramMessage, escapeHtml } from "../utils/telegram.js";

/**
 * 거래량 급등 + 역프리미엄 코인이 새로 감지될 때 텔레그램 알림 전송
 * @param {object} params
 * @param {Array}  params.coinList   - 전체 코인 목록
 * @param {object} params.snapshots  - 코인별 시세 스냅샷
 * @param {Function} params.onSuccess - 전송 성공 콜백 (message: string) => void
 * @param {Function} params.onError   - 전송 실패 콜백 (message: string) => void
 */
export function useTelegramAlert({ coinList, snapshots, onSuccess, onError }) {
  // 이전 사이클의 "급등+역프리미엄" 심볼 Set을 ref로 보관 (stale closure 방지)
  const prevHotSymbolsRef = useRef(null);

  useEffect(() => {
    if (!isTelegramEnabled) return;
    if (coinList.length === 0) return;
    if (Object.keys(snapshots).length === 0) return;

    // 거래량 급등 주의 + 역프리미엄(국내가 해외보다 싼) 코인 필터
    const currentHotCoins = coinList.filter((c) => {
      if (c.warning) return false;
      const onlyVolumeSurge = c.caution.length === 1 && c.caution[0] === "TRADING_VOLUME_SOARING";
      if (!onlyVolumeSurge) return false;
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      // 역프리미엄: 국내가 해외보다 낮음 (premium < 0)
      const premium = snap.upbitPremium !== null ? snap.upbitPremium : snap.bithumbPremium;
      return premium !== null && premium < 0;
    });

    const currentHotSymbols = new Set(currentHotCoins.map((c) => c.symbol));

    // 첫 실행 시에는 기준점만 저장하고 알림 미전송
    if (prevHotSymbolsRef.current === null) {
      prevHotSymbolsRef.current = currentHotSymbols;
      return;
    }

    // 이번 사이클에 새로 진입한 코인만 추출
    const newlyHotCoins = currentHotCoins.filter(
      (c) => !prevHotSymbolsRef.current.has(c.symbol)
    );
    prevHotSymbolsRef.current = currentHotSymbols;

    if (newlyHotCoins.length === 0) return;

    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const coinLines = newlyHotCoins
      .map((c) => {
        const snap    = snapshots[c.symbol];
        const premium = snap?.upbitPremium !== null ? snap?.upbitPremium : snap?.bithumbPremium;
        const premiumStr = premium !== null ? `${premium.toFixed(2)}%` : "—";
        return `• <b>${escapeHtml(c.symbol)}</b> ${escapeHtml(c.name)} | 역프리미엄 ${premiumStr}`;
      })
      .join("\n");

    // 탭 이름("🔥 급등+역프리미엄")과 일치하는 메시지
    const message =
      `🔥 <b>급등+역프리미엄 코인 감지!</b>\n\n` +
      `${coinLines}\n\n` +
      `⏰ ${now}\n` +
      `💡 거래량 급등 + 국내가 해외보다 싼 코인 (매수 후보)\n` +
      `📊 현재 총 ${currentHotCoins.length}개 감지 중`;

    sendTelegramMessage(message)
      .then(() => onSuccess?.(`✅ ${newlyHotCoins.length}개 코인 알림 전송 완료`))
      .catch((err) => onError?.(`❌ 전송 실패: ${err.message}`));

  // coinList와 snapshots가 바뀔 때마다 실행 (stale closure 없음)
  }, [coinList, snapshots, onSuccess, onError]);
}
