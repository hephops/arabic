// Xavfli sozlamalar haqida ishga tushishda ogohlantirish.
//
// Ba'zi kalitlar sinov uchun qulay, lekin ishlab turgan serverda
// ochiq qolsa jiddiy teshik bo'ladi. Ular .env faylida jimgina
// turaveradi va hech kim eslatmaydi — server esa har kuni shu holda
// ishlab yuraveradi.
//
// Shuning uchun server har ko'tarilganda tekshiradi va konsolga
// ko'zga tashlanadigan ogohlantirish chiqaradi. Hech narsani
// to'xtatmaydi: do'kon egasining o'zi sinov qilayotgan bo'lishi
// mumkin, ilovani to'xtatib qo'yish undan ham yomon.

interface Xavf {
  kalit: string;
  nima: string;
}

/** Standart (almashtirilmagan) AUTH_SECRET — kodda ham shu turadi */
const DEFAULT_SECRET = 'dev-secret-change-in-prod';

export function xavflarniTekshir(): Xavf[] {
  const out: Xavf[] = [];
  const env = process.env;

  if (env.OTP_DEV_CODE) {
    out.push({
      kalit: 'OTP_DEV_CODE',
      nima:
        "HAMMA do'konga BIR XIL kirish kodi ketadi va kod so'rov javobida ham qaytariladi. " +
        "Telefon raqamini bilgan har kim begona hisobga kira oladi. Ishlab turgan serverda BO'SH bo'lishi shart.",
    });
  }

  if (env.IMAGE_FETCH_ALLOW_PRIVATE === '1') {
    out.push({
      kalit: 'IMAGE_FETCH_ALLOW_PRIVATE',
      nima:
        "Rasm yuklashda ichki tarmoq manzillari ham ochiq qoladi (SSRF himoyasi o'chgan). " +
        'Faqat sinov muhitida yoqilsin.',
    });
  }

  if (env.ALLOW_SELF_TOPUP === '1') {
    out.push({
      kalit: 'ALLOW_SELF_TOPUP',
      nima:
        "Do'konchi o'z balansiga hech qanday to'lovsiz pul yozib olishi mumkin. " +
        'Faqat sinov uchun.',
    });
  }

  const secret = env.AUTH_SECRET ?? '';
  if (!secret || secret === DEFAULT_SECRET) {
    out.push({
      kalit: 'AUTH_SECRET',
      nima:
        secret === DEFAULT_SECRET
          ? "Standart qiymat turibdi — u ochiq kodda ham bor, ya'ni istalgan odam o'ziga kirish " +
            'belgisi yasab, xohlagan hisobga kira oladi.'
          : "Qo'yilmagan — kodda standart qiymat ishlatiladi va u ochiq kodda ham bor.",
    });
  } else if (secret.length < 24) {
    out.push({
      kalit: 'AUTH_SECRET',
      nima: `Juda qisqa (${secret.length} belgi). Kamida 32 ta tasodifiy belgi bo'lsin.`,
    });
  }

  if (!env.TELEGRAM_WEBHOOK_SECRET && env.TELEGRAM_BOT_TOKEN) {
    out.push({
      kalit: 'TELEGRAM_WEBHOOK_SECRET',
      nima:
        "Qo'yilmagan: /telegram/webhook manziliga istalgan odam soxta xabar yuborishi mumkin. " +
        'Tasodifiy so\'z qo\'ying.',
    });
  }

  return out;
}

/** Konsolga chiqaradi. Qiymatlarning O'ZI hech qachon yozilmaydi. */
export function xavflarniKorsat(): void {
  const xavflar = xavflarniTekshir();
  if (!xavflar.length) return;
  const chiziq = '═'.repeat(66);
  console.warn(`\n${chiziq}`);
  console.warn('  ⚠  DIQQAT — XAVFLI SOZLAMALAR OCHIQ');
  console.warn(chiziq);
  for (const x of xavflar) {
    console.warn(`\n  ${x.kalit}`);
    for (const satr of x.nima.match(/.{1,60}(\s|$)/g) ?? [x.nima]) {
      console.warn(`    ${satr.trim()}`);
    }
  }
  console.warn(`\n${chiziq}\n`);
}
