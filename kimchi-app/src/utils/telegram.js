// ============================================================
// 텔레그램 알림 유틸리티
// ============================================================

const TG_BOT_TOKEN = import.meta.env.VITE_TG_BOT_TOKEN || "";
const TG_CHAT_ID   = import.meta.env.VITE_TG_CHAT_ID   || "";

export const isTelegramEnabled = Boolean(TG_BOT_TOKEN && TG_CHAT_ID);

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramMessage(text) {
  if (!isTelegramEnabled) return;
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.description || `HTTP ${res.status}`);
  }
  return res.json();
}
