import { db } from './db.js';
import { isValidPhone, normalizePhone } from './phone.js';
import { uzToday } from './tz.js';

// Eslatma dvigateli: muddatga qarab qaysi qarzga qanday eslatma kerakligini
// aniqlaydi va jurnalga navbatga qo'yadi.
//
// Rejimlar (mijoz kartochkasida tanlanadi):
//   off    — eslatma yuborilmaydi
//   soft   — muddatdan 1 kun oldin bitta xabar
//   medium — soft + muddat kuni + kechikkanda har 3 kunda
//   call   — medium + kechikkanda AI qo'ng'iroq va ortidan rekvizitli SMS
//
// PROD: yuborish Eskiz.uz (SMS), Telegram Bot API va telefoniya orqali bo'ladi.
// Hozircha provayder ulanmagan — yozuv 'sent' deb belgilanadi va matni saqlanadi.

export type ReminderMode = 'off' | 'soft' | 'medium' | 'call';

interface DueDebt {
  id: number;
  shop_id: number;
  customer_id: number;
  amount: number;
  paid_amount: number;
  due_date: string;
  customer_name: string;
  phone: string | null;
  language: string;
  reminder_mode: ReminderMode;
  shop_name: string;
  card_number: string | null;
  shop_phone: string;
}

function daysUntil(date: string): number {
  // Toshkent bugungi sanasidan — server qaysi mintaqada turgani muhim emas
  const today = new Date(uzToday()).getTime();
  const target = new Date(date).getTime();
  return Math.round((target - today) / 86_400_000);
}

function money(n: number, lang: string): string {
  const formatted = new Intl.NumberFormat('uz-UZ').format(n);
  return lang === 'ru' ? `${formatted} сум` : `${formatted} so'm`;
}

// Xabar matnlari — o'zbek va rus tilida
function buildMessage(d: DueDebt, kind: string): string {
  const left = d.amount - d.paid_amount;
  const ru = d.language === 'ru';
  const sum = money(left, d.language);

  if (kind === 'before') {
    return ru
      ? `Напоминание от «${d.shop_name}»: завтра срок оплаты долга ${sum}.`
      : `«${d.shop_name}» do'konidan eslatma: ertaga ${sum} qarzingizning muddati keladi.`;
  }
  if (kind === 'due') {
    return ru
      ? `«${d.shop_name}»: сегодня срок оплаты долга ${sum}. Спасибо!`
      : `«${d.shop_name}»: bugun ${sum} qarzingizning muddati. Rahmat!`;
  }
  if (kind === 'overdue') {
    return ru
      ? `«${d.shop_name}»: срок долга ${sum} истёк. Просим оплатить.`
      : `«${d.shop_name}»: ${sum} qarzingiz muddati o'tdi. Iltimos, to'lab qo'ying.`;
  }
  if (kind === 'call') {
    return ru
      ? `Звонок: «Здравствуйте! Напоминание от магазина «${d.shop_name}»: срок долга ${sum} истёк, просим оплатить.»`
      : `Qo'ng'iroq: «Assalomu alaykum! ${d.shop_name} do'konidan eslatma: ${sum} qarzingiz muddati o'tdi, iltimos to'lab qo'ying.»`;
  }
  // qo'ng'iroqdan keyingi rekvizitli SMS
  const card = d.card_number ? d.card_number : '—';
  return ru
    ? `Долг магазину «${d.shop_name}»: ${sum}. Карта для оплаты: ${card}. Вопросы: ${d.shop_phone}`
    : `«${d.shop_name}» do'koniga qarzingiz: ${sum}. To'lash uchun karta: ${card}. Savollar: ${d.shop_phone}`;
}

// Bugun shu qarz uchun shu turdagi eslatma allaqachon YUBORILGANMI?
// Yuborilmagan ("failed") yozuv qayta urinishga to'sqinlik qilmaydi —
// do'konchi raqamni to'g'rilashi bilan eslatma keyingi tekshiruvda ketadi.
function alreadyLogged(debtId: number, kind: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM reminder_logs
       WHERE debt_id = ? AND kind = ? AND status <> 'failed'
         AND date(created_at, '+5 hours') = date('now', '+5 hours') LIMIT 1`
    )
    .get(debtId, kind);
  return !!row;
}

function enqueue(d: DueDebt, kind: string, channel: 'sms' | 'telegram' | 'call') {
  if (alreadyLogged(d.id, kind)) return null;
  const text = buildMessage(d, kind);
  // Provayder ulanmaganda ham jurnal to'ladi — do'konchi nima yuborilishini ko'radi
  const status = isValidPhone(d.phone) ? 'sent' : 'failed';
  db.prepare(
    `INSERT INTO reminder_logs (shop_id, debt_id, customer_id, channel, kind, status, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(d.shop_id, d.id, d.customer_id, channel, kind, status, text);
  return { kind, channel, status, text };
}

// Bitta do'kon uchun (yoki hammasi uchun) eslatmalarni tayyorlaydi
export function runReminders(shopId?: number): { created: number } {
  const rows = db
    .prepare(
      `SELECT d.id, d.shop_id, d.customer_id, d.amount, d.paid_amount, d.due_date,
              c.name AS customer_name, c.phone, c.language, c.reminder_mode,
              s.name AS shop_name, s.card_number, s.phone AS shop_phone
       FROM debts d
       JOIN customers c ON c.id = d.customer_id
       JOIN shops s ON s.id = d.shop_id
       WHERE d.status != 'paid' AND d.due_date IS NOT NULL
         AND c.reminder_mode != 'off'
         ${shopId ? 'AND d.shop_id = ?' : ''}`
    )
    .all(...(shopId ? [shopId] : [])) as DueDebt[];

  let created = 0;
  for (const d of rows) {
    const left = daysUntil(d.due_date);
    const mode = d.reminder_mode;

    // muddatdan 1 kun oldin
    if (left === 1 && enqueue(d, 'before', 'sms')) created++;

    // muddat kuni
    if (left === 0 && (mode === 'medium' || mode === 'call') && enqueue(d, 'due', 'sms')) created++;

    // kechikkan: har 3 kunda
    if (left < 0 && (mode === 'medium' || mode === 'call')) {
      const overdueDays = -left;
      if (overdueDays % 3 === 0) {
        if (mode === 'call' && overdueDays >= 3) {
          if (enqueue(d, 'call', 'call')) created++;
          if (enqueue(d, 'after_call', 'sms')) created++;
        } else if (enqueue(d, 'overdue', 'sms')) {
          created++;
        }
      }
    }
  }
  return { created };
}

// Har soatda avtomatik ishlaydi (PROD'da alohida cron/worker bo'ladi)
export function startReminderScheduler() {
  const HOUR = 60 * 60 * 1000;
  setInterval(() => {
    try {
      const { created } = runReminders();
      if (created > 0) console.log(`[reminders] ${created} ta eslatma navbatga qo'yildi`);
    } catch (e) {
      console.error('[reminders]', e);
    }
  }, HOUR).unref?.();
}
