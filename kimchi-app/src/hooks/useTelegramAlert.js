// ============================================================
// 텔레그램 알림 훅
// 개선:
//   1. 급등+역프리미엄: TRADING_VOLUME_SOARING 포함 + 역프리미엄 (기존보다 완화)
//   2. 프리미엄 알림: high/low 기준 초과 시 알림 추가
// ============================================================

import { useEffect, useRef } from "react";
import { isTelegramEnabled, sendTelegramMessage, escapeHtml } from "../utils/telegram.js";

/**
 * 텔레그램 알림 전송 훅
 * @param {object} params
 * @param {Array}  params.coinList   - 전체 코인 목록
 * @param {object} params.snapshots  - 코인별 시세 스냅샷
 * @param {number} params.high       - 프리미엄 상단 기준값
 * @param {number} params.low        - 프리미엄 하단 기준값
 * @param {Function} params.onSuccess - 전송 성공 콜백 (message: string) => void
 * @param {Function} params.onError   - 전송 실패 콜백 (message: string) => void
 */
export function useTelegramAlert({ coinList, snapshots, high, low, onSuccess, onError }) {
  // 이전 사이클의 심볼 Set을 ref로 보관 (stale closure 방지)
  const prevHotSymbolsRef     = useRef(null);
  const prevPremiumSymbolsRef = useRef(null);

  useEffect(() => {
    if (!isTelegramEnabled) return;
    if (coinList.length === 0) return;
    if (Object.keys(snapshots).length === 0) return;

    // ── 1. 거래량 급등 + 역프리미엄 코인 ──────────────────────
    const currentHotCoins = coinList.filter((c) => {
      if (c.warning) return false;
      // TRADING_VOLUME_SOARING이 포함되어 있으면 OK (다른 caution이 있어도 허용)
      const hasVolumeSurge = c.caution.includes("TRADING_VOLUME_SOARING");
      if (!hasVolumeSurge) return false;
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      const premium = snap.upbitPremium !== null ? snap.upbitPremium : snap.bithumbPremium;
      return premium !== null && premium < 0;
    });

    // ── 2. 프리미엄 기준 초과 코인 ────────────────────────────
    const currentPremiumCoins = coinList.filter((c) => {
      const snap = snapshots[c.symbol];
      if (!snap) return false;
      return (
        (snap.upbitPremium   !== null && (snap.upbitPremium   >= high || snap.upbitPremium   <= low)) ||
        (snap.bithumbPremium !== null && (snap.bithumbPremium >= high || snap.bithumbPremium <= low))
      );
    });

    const currentHotSymbols     = new Set(currentHotCoins.map((c) => c.symbol));
    const currentPremiumSymbols = new Set(currentPremiumCoins.map((c) => c.symbol));

    // 첫 실행 시에는 기준점만 저장하고 알림 미전송
    if (prevHotSymbolsRef.current === null || prevPremiumSymbolsRef.current === null) {
      prevHotSymbolsRef.current     = currentHotSymbols;
      prevPremiumSymbolsRef.current = currentPremiumSymbols;
      return;
    }

    // ── 새로 진입한 코인만 추출 ────────────────────────────────
    const newlyHotCoins = currentHotCoins.filter(
      (c) => !prevHotSymbolsRef.current.has(c.symbol)
    );
    const newlyPremiumCoins = currentPremiumCoins.filter(
      (c) => !prevPremiumSymbolsRef.current.has(c.symbol)
    );

    prevHotSymbolsRef.current     = currentHotSymbols;
    prevPremiumSymbolsRef.current = currentPremiumSymbols;

    const messages = [];

    // ── 급등+역프리미엄 알림 ──────────────────────────────────
    if (newlyHotCoins.length > 0) {
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const coinLines = newlyHotCoins
        .map((c) => {
          const snap    = snapshots[c.symbol];
          const premium = snap?.upbitPremium !== null ? snap?.upbitPremium : snap?.bithumbPremium;
          const premiumStr = premium !== null ? `${premium.toFixed(2)}%` : "—";
          return `• <b>${escapeHtml(c.symbol)}</b> ${escapeHtml(c.name)} | 역프리미엄 ${premiumStr}`;
        })
        .join("\n");

      messages.push(
        `🔥 <b>급등+역프리미엄 코인 감지!</b>\n\n` +
        `${coinLines}\n\n` +
        `⏰ ${now}\n` +
        `💡 거래량 급등 + 국내가 해외보다 싼 코인 (매수 후보)\n` +
        `📊 현재 총 ${currentHotCoins.length}개 감지 중`
      );
    }

    // ── 프리미엄 기준 초과 알림 ───────────────────────────────
    if (newlyPremiumCoins.length > 0) {
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const coinLines = newlyPremiumCoins
        .map((c) => {
          const snap = snapshots[c.symbol];
          const up   = snap?.upbitPremium   !== null ? `업비트 ${snap.upbitPremium.toFixed(2)}%`   : null;
          const bi   = snap?.bithumbPremium !== null ? `빗썸 ${snap.bithumbPremium.toFixed(2)}%`   : null;
          const premStr = [up, bi].filter(Boolean).join(" / ") || "—";
          return `• <b>${escapeHtml(c.symbol)}</b> ${escapeHtml(c.name)} | ${premStr}`;
        })
        .join("\n");

      messages.push(
        `📈 <b>프리미엄 기준 초과 감지!</b>\n\n` +
        `${coinLines}\n\n` +
        `⏰ ${now}\n` +
        `⚙️ 기준: +${high}% 이상 또는 ${low}% 이하\n` +
        `📊 현재 총 ${currentPremiumCoins.length}개 감지 중`
      );
    }

    // ── 메시지 전송 ───────────────────────────────────────────
    if (messages.length === 0) return;

    const totalNew = newlyHotCoins.length + newlyPremiumCoins.length;
    Promise.all(messages.map((msg) => sendTelegramMessage(msg)))
      .then(() => onSuccess?.(`✅ ${totalNew}개 코인 알림 전송 완료`))
      .catch((err) => onError?.(`❌ 전송 실패: ${err.message}`));

  }, [coinList, snapshots, high, low, onSuccess, onError]);
}
