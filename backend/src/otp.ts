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

/** Yangi kod yasab saqlaydi */
export function issueCode(phone: string): string {
  // DEV: kod doim 123456 — sinovda haqiqiy bot kerak bo'lmasin
  const code =
    process.env.NODE_ENV === 'production'
      ? String(Math.floor(100000 + Math.random() * 900000))
      : '123456';
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
