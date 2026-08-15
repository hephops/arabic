import { db } from './db.js';
import { sendMessage, telegramEnabled } from './telegram.js';

// Kechki avtomatik hisobot.
//
// Do'konchi kun oxirida ilovani ochib "Hisobotlar" bo'limiga kirib
// o'tirmaydi. Shuning uchun hisobot o'zi kelsin: belgilangan soatda
// Telegram'ga qisqa xulosa tushadi. Ilovani ochmasdan ham "nazorat
// menda" degan tuyg'u — bu yerdagi asosiy qiymat.
//
// SHART: do'kon egasi botni bir marta ochgan bo'lishi kerak
// (shops.telegram_user_id shunda to'ladi), aks holda yuboriladigan
// manzil bo'lmaydi. Server ham o'sha soatda ishlab turishi kerak.

// Vaqt hisobi bitta joyda — tz.ts. Bu yerdan ham eksport qilinadi,
// chunki hisobot jadvali uni shu modul nomi bilan ishlatib kelgan.
import { uzNow } from './tz.js';
export { uzNow };

export interface DailyFigures {
  revenue: number;
  count: number;
  /** to'lov turlari bo'yicha (qaytarishlarsiz, sof savdo) */
  cash: number;
  card: number;
  debt: number;
  profit: number;
  expenses: number;
  net_profit: number;
  debt_added: number;
  debt_count: number;
  paid_in: number;
  low_stock: number;
  expiring: number;
  goal: number;
}

/** Do'konning shu kungi ko'rsatkichlari (hisobot matni uchun) */
export function dailyFigures(shopId: number): DailyFigures {
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total END), 0) AS cash,
              COALESCE(SUM(CASE WHEN payment_type = 'card' THEN total END), 0) AS card,
              COALESCE(SUM(CASE WHEN payment_type = 'debt' THEN total END), 0) AS debt
       FROM sales WHERE shop_id = ? AND date(created_at, '+5 hours') = date('now', '+5 hours')`
    )
    .get(shopId) as any;
  const profit = db
    .prepare(
      `SELECT COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE s.shop_id = ? AND date(s.created_at, '+5 hours') = date('now', '+5 hours')`
    )
    .get(shopId) as any;
  const ret = db
    .prepare(
      `SELECT COALESCE(SUM(ri.price * ri.qty), 0) AS total,
              COALESCE(SUM(p.cost_price * ri.qty), 0) AS cost
       FROM return_items ri JOIN returns r ON r.id = ri.return_id
       JOIN products p ON p.id = ri.product_id
       WHERE r.shop_id = ? AND date(r.created_at, '+5 hours') = date('now', '+5 hours')`
    )
    .get(shopId) as any;
  const expenses = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE shop_id = ? AND spent_at = date('now', '+5 hours')`)
    .get(shopId) as any;
  const debts = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM debts
       WHERE shop_id = ? AND date(created_at, '+5 hours') = date('now', '+5 hours')`
    )
    .get(shopId) as any;
  const paid = db
    .prepare(
      `SELECT COALESCE(SUM(dp.amount), 0) AS s FROM debt_payments dp
       JOIN debts d ON d.id = dp.debt_id
       WHERE d.shop_id = ? AND date(dp.created_at, '+5 hours') = date('now', '+5 hours')`
    )
    .get(shopId) as any;
  const low = db
    .prepare('SELECT COUNT(*) AS c FROM products WHERE shop_id = ? AND stock <= low_stock_threshold')
    .get(shopId) as any;
  const expiring = db
    .prepare(
      `SELECT COUNT(*) AS c FROM products WHERE shop_id = ? AND expiry_date IS NOT NULL
       AND expiry_date <= date('now', '+5 hours', '+7 days')`
    )
    .get(shopId) as any;
  const shop = db.prepare('SELECT daily_goal FROM shops WHERE id = ?').get(shopId) as any;

  const revenue = Number(sales.revenue) - Number(ret.total);
  const grossProfit = Number(profit.profit) - (Number(ret.total) - Number(ret.cost));
  return {
    revenue,
    count: Number(sales.count),
    cash: Number(sales.cash),
    card: Number(sales.card),
    debt: Number(sales.debt),
    profit: grossProfit,
    expenses: Number(expenses.s),
    net_profit: grossProfit - Number(expenses.s),
    debt_added: Number(debts.s),
    debt_count: Number(debts.c),
    paid_in: Number(paid.s),
    low_stock: Number(low.c),
    expiring: Number(expiring.c),
    goal: Number(shop?.daily_goal ?? 0),
  };
}

const money = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ');

/** Telegram'ga yuboriladigan matn. Uzun jadval emas — bir qarashda o'qiladigan xulosa. */
export function reportText(shopName: string, f: DailyFigures): string {
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(shopName)}</b> — bugungi yakun`);
  lines.push('');
  lines.push(`💰 Savdo: <b>${money(f.revenue)} so'm</b>${f.count ? ` (${f.count} ta chek)` : ''}`);

  // To'lov turlari — do'konchi kassada qancha naqd pul turishi kerakligini
  // va qanchasi qarzga ketganini shu yerdan ko'radi
  const pay: string[] = [];
  if (f.cash > 0) pay.push(`naqd ${money(f.cash)}`);
  if (f.card > 0) pay.push(`karta ${money(f.card)}`);
  if (f.debt > 0) pay.push(`qarzga ${money(f.debt)}`);
  if (pay.length) lines.push(`   ${pay.join(' · ')}`);

  if (f.expenses > 0) {
    lines.push(`📈 Yalpi foyda: ${money(f.profit)} so'm`);
    lines.push(`🧾 Xarajat: −${money(f.expenses)} so'm`);
    lines.push(`✅ Sof foyda: <b>${money(f.net_profit)} so'm</b>`);
  } else {
    lines.push(`✅ Foyda: <b>${money(f.profit)} so'm</b>`);
  }

  if (f.goal > 0) {
    const pct = Math.min(100, Math.round((f.revenue / f.goal) * 100));
    lines.push(
      pct >= 100
        ? `🏆 Kunlik maqsad bajarildi (${money(f.goal)} so'm)`
        : `🎯 Maqsad: ${pct}% (${money(Math.max(0, f.goal - f.revenue))} so'm yetmadi)`
    );
  }

  if (f.debt_count > 0) lines.push(`📒 Qarzga yozildi: ${money(f.debt_added)} so'm (${f.debt_count} ta)`);
  if (f.paid_in > 0) lines.push(`💵 Qarzdorlardan tushdi: ${money(f.paid_in)} so'm`);

  const warn: string[] = [];
  if (f.low_stock > 0) warn.push(`${f.low_stock} ta tovar tugayapti`);
  if (f.expiring > 0) warn.push(`${f.expiring} ta tovarning srogi yaqin`);
  if (warn.length) {
    lines.push('');
    lines.push(`⚠️ ${warn.join(', ')}`);
  }

  if (f.count === 0) {
    lines.push('');
    lines.push('Bugun sotuv qayd etilmadi.');
  }
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Bitta do'konga hisobot yuborish. Yuborilgan bo'lsa true. */
export async function sendDailyReport(shopId: number): Promise<{ ok: boolean; reason?: string }> {
  const shop = db.prepare('SELECT id, name, telegram_user_id FROM shops WHERE id = ?').get(shopId) as any;
  if (!shop) return { ok: false, reason: 'shop_not_found' };
  if (!telegramEnabled()) return { ok: false, reason: 'telegram_disabled' };
  if (!shop.telegram_user_id) return { ok: false, reason: 'no_telegram' };
  const res: any = await sendMessage(shop.telegram_user_id, reportText(shop.name, dailyFigures(shopId)));
  if (!res?.ok) return { ok: false, reason: 'send_failed' };
  db.prepare("UPDATE shops SET last_report_date = date('now', '+5 hours') WHERE id = ?").run(shopId);
  return { ok: true };
}

/**
 * Soati kelgan do'konlarga hisobot yuborish.
 *
 * Bir kunda ikki marta ketmasligi uchun shops.last_report_date tekshiriladi:
 * server qayta ishga tushsa yoki jadval bir necha marta ishlasa ham
 * do'konchi bitta xabar oladi.
 */
export async function runDailyReports(at: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  const { date, hour } = uzNow(at);
  const shops = db
    .prepare(
      `SELECT id FROM shops
       WHERE report_enabled = 1 AND telegram_user_id IS NOT NULL
         AND report_hour = ?
         AND (last_report_date IS NULL OR last_report_date <> ?)`
    )
    .all(hour, date) as any[];
  let sent = 0;
  let skipped = 0;
  for (const s of shops) {
    const res = await sendDailyReport(s.id);
    if (res.ok) sent++;
    else skipped++;
  }
  return { sent, skipped };
}

/**
 * Har 10 daqiqada tekshiradi.
 *
 * Nega soatiga bir marta emas: server istalgan daqiqada qayta ishga
 * tushishi mumkin, soat boshiga tushib qolgan bitta tekshiruv esa
 * o'tkazib yuborilardi. 10 daqiqalik qadam bilan soat ichida albatta
 * bir necha marta tekshiriladi, takror yuborishdan esa last_report_date
 * saqlaydi.
 */
export function startDailyReportScheduler() {
  const TEN_MIN = 10 * 60 * 1000;
  const tick = async () => {
    try {
      const { sent } = await runDailyReports();
      if (sent > 0) console.log(`[hisobot] ${sent} ta do'konga kechki hisobot yuborildi`);
    } catch (e) {
      console.error('[hisobot]', e);
    }
  };
  setInterval(tick, TEN_MIN).unref?.();
  // Server ko'tarilganda ham bir marta — soat allaqachon kelib bo'lgan
  // bo'lsa xabar bugungi kun ichida baribir yetib boradi
  tick();
}
