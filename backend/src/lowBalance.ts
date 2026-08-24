// Balans tugayapti — Telegram ogohlantirishi.
//
// Admin panelda "Balans ogohlantirishi (Telegram)" degan tugma bor edi,
// lekin uni HECH KIM o'qimasdi: sozlama bor, xabar yo'q. Do'konchi
// balansi tugayotganini faqat ilovani ochsa ko'rardi — ochmasa esa
// xizmat kutilmaganda to'xtardi va "nega ishlamayapti" degan
// qo'ng'iroq bizga kelardi.
//
// Endi ogohlantirish o'zi boradi: kuniga bir marta, faqat kerak
// bo'lganda va faqat bir marta (shops.low_notified_on).
//
// SHART: do'kon egasi botni bir marta ochgan bo'lishi kerak
// (shops.telegram_user_id shunda to'ladi).

import { db } from './db.js';
import { sendMessage, telegramEnabled, langFor } from './telegram.js';
import { serviceState, shopSetting, getSetting } from './billing.js';
import { uzNow } from './tz.js';

/** Ogohlantirish shu soatda yuboriladi (O'zbekiston vaqti).
 *  Ertalab: do'konchi kun boshida ko'rib, ulgurib to'laydi. */
const HOUR = 10;

const money = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

const TEXT = {
  uz: (name: string, days: number, price: number, card: string, blocked: boolean) =>
    days <= 0
      ? [
          `<b>${name}</b> — xizmat to'xtadi`,
          '',
          blocked
            ? "Balansingiz tugadi. Savdo ham, kirim ham TO'XTATILDI —"
            : 'Balansingiz tugadi. Ilova ishlashda davom etadi, lekin balansni',
          blocked
            ? "balansni to'ldirmaguningizcha ishlamaydi."
            : "to'ldirmaguningizcha ba'zi amallar cheklanishi mumkin.",
          card ? `\nKarta: <b>${card}</b>` : '',
        ]
      : [
          `<b>${name}</b> — balans tugayapti`,
          '',
          `Xizmat yana <b>${days} kun</b> ishlaydi (kuniga ${money(price)} so'm).`,
          "Uzilish bo'lmasligi uchun balansni to'ldirib qo'ying.",
          card ? `\nKarta: <b>${card}</b>` : '',
        ],
  ru: (name: string, days: number, price: number, card: string, blocked: boolean) =>
    days <= 0
      ? [
          `<b>${name}</b> — обслуживание остановлено`,
          '',
          blocked
            ? 'Баланс закончился. Продажа и приход ОСТАНОВЛЕНЫ —'
            : 'Баланс закончился. Приложение продолжает работать, но часть',
          blocked ? 'не будут работать до пополнения.' : 'действий может быть ограничена до пополнения.',
          card ? `\nКарта: <b>${card}</b>` : '',
        ]
      : [
          `<b>${name}</b> — баланс заканчивается`,
          '',
          `Сервис проработает ещё <b>${days} дн.</b> (${money(price)} сум в день).`,
          'Пополните баланс, чтобы не было перерыва.',
          card ? `\nКарта: <b>${card}</b>` : '',
        ],
};

const escapeHtml = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bitta do'konga ogohlantirish. Yuborilgan bo'lsa true. */
export async function sendLowBalanceWarning(shopId: number): Promise<boolean> {
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId) as any;
  if (!shop || !telegramEnabled() || !shop.telegram_user_id) return false;
  const st = serviceState(shop);
  // Karta raqami xabarga qo'shiladi: do'konchi ilovani ochmasdan ham
  // qayerga pul tashlashni bilsin
  const card = getSetting('topup_card', '').trim();
  const lang = langFor(shop.telegram_user_id, shop.language) === 'ru' ? 'ru' : 'uz';
  const blocked = shopSetting(shop, 'block_on_empty', '1') === '1';
  const text = TEXT[lang](escapeHtml(shop.name ?? ''), st.days_left, st.daily_price, card, blocked)
    .filter(Boolean)
    .join('\n');
  const res: any = await sendMessage(shop.telegram_user_id, text);
  if (!res?.ok) return false;
  db.prepare("UPDATE shops SET low_notified_on = date('now', '+5 hours') WHERE id = ?").run(shopId);
  return true;
}

/**
 * Ogohlantirish kerak bo'lgan do'konlarni topib, xabar yuboradi.
 *
 * Kim oladi:
 *   - botga ulangan (telegram_user_id bor)
 *   - bugun hali ogohlantirilmagan
 *   - balansi chegaraga yaqin (serviceState.low) yoki tugagan
 *   - sinov davrida emas (unda pul yechilmaydi, ogohlantirish ortiqcha)
 *   - sozlama yoqilgan (umumiy yoki shu do'kon turi uchun)
 */
export async function runLowBalanceWarnings(at: Date = new Date()): Promise<{ sent: number }> {
  if (!telegramEnabled()) return { sent: 0 };
  const { date } = uzNow(at);
  const rows = db
    .prepare(
      `SELECT * FROM shops
       WHERE telegram_user_id IS NOT NULL
         AND is_blocked = 0
         AND (low_notified_on IS NULL OR low_notified_on <> ?)`
    )
    .all(date) as any[];
  let sent = 0;
  for (const shop of rows) {
    // Sozlama do'kon TURI uchun ham o'chirilishi mumkin
    if (shopSetting(shop, 'low_balance_notify', '1') !== '1') continue;
    const st = serviceState(shop, at);
    if (st.on_trial) continue;
    if (!st.low && st.active) continue;
    try {
      if (await sendLowBalanceWarning(shop.id)) sent++;
    } catch (e) {
      console.warn(`[balans] do'kon ${shop.id} ogohlantirilmadi:`, e);
    }
  }
  return { sent };
}

/**
 * Har 30 daqiqada tekshiradi.
 *
 * Xabar kuniga bir marta ketadi (low_notified_on), shuning uchun tez-tez
 * tekshirish xavfsiz — server soat 10 da o'chiq bo'lsa ham do'konchi
 * kun ichida xabarni oladi.
 */
export function startLowBalanceScheduler() {
  const HALF_HOUR = 30 * 60 * 1000;
  const tick = async () => {
    try {
      const { hour } = uzNow();
      // Kechasi bezovta qilmaymiz
      if (hour < HOUR) return;
      const { sent } = await runLowBalanceWarnings();
      if (sent > 0) console.log(`[balans] ${sent} ta do'kon ogohlantirildi`);
    } catch (e) {
      console.error('[balans]', e);
    }
  };
  setInterval(tick, HALF_HOUR).unref?.();
  tick();
}
