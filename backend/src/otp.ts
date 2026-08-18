// Kirish kodi (OTP).
//
// Kod endi SMS emas, Telegram bot orqali boradi: do'konchi bir marta
// botga raqamini yuboradi, keyin har safar kod o'sha yerga keladi.
// SMS'dan farqi — pul ketmaydi, darhol yetadi va raqam allaqachon
// tasdiqlangan bo'ladi.
//
// Kod shu yerda saqlanadi, chunki uni ikki joy ishlatadi: ilova
// (/auth/request-otp) va bot (raqam ulangan zahoti kutayotgan kodni
// yuborish uchun).

export const OTP_TTL_MS = 5 * 60 * 1000;

type Entry = { code: string; expires: number };
const store = new Map<string, Entry>();

/**
 * Yangi kod yasab saqlaydi.
 *
 * Kod HAR DOIM tasodifiy. Ilgari u NODE_ENV ga bog'liq edi va serverda
 * o'sha o'zgaruvchi qo'yilmagani uchun hammaga bir xil "123456" ketardi —
 * ya'ni raqamini bilgan har kim begona hisobga kira olardi.
 *
 * Sinov uchun qotib qolgan kod kerak bo'lsa .env ga OTP_DEV_CODE
 * yoziladi. Bu ataylab qilinadigan ish: tasodifan yoqilib qolmaydi.
 */
export function issueCode(phone: string): string {
  const fixed = process.env.OTP_DEV_CODE;
  const code =
    fixed && /^\d{4,8}$/.test(fixed)
      ? fixed
      : String(Math.floor(100000 + Math.random() * 900000));
  store.set(phone, { code, expires: Date.now() + OTP_TTL_MS });
  return code;
}

/** Kutayotgan kod (muddati o'tmagan bo'lsa) */
export function pendingCode(phone: string): string | null {
  const e = store.get(phone);
  if (!e) return null;
  if (e.expires < Date.now()) {
    store.delete(phone);
    return null;
  }
  return e.code;
}

export function checkCode(phone: string, code: string): 'ok' | 'invalid' | 'expired' {
  const e = store.get(phone);
  if (!e || e.code !== code) return 'invalid';
  if (e.expires < Date.now()) {
    store.delete(phone);
    return 'expired';
  }
  return 'ok';
}

export function clearCode(phone: string) {
  store.delete(phone);
}
