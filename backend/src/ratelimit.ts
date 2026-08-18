// Kirish urinishlarini cheklash — PIN va SMS kodni cheksiz terib ko'rishning oldini oladi.
// 4 xonali PIN atigi 10 000 variant: cheklovsiz bo'lsa daqiqalar ichida topiladi.
//
// Xotirada saqlanadi (bitta server uchun yetarli). PROD'da bir nechta nusxa
// bo'lsa — Redis'ga ko'chiriladi.

interface Bucket {
  count: number;
  first: number;      // birinchi urinish vaqti
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();

export interface LimitOptions {
  /** shu oraliqda (ms) nechta urinishga ruxsat */
  max: number;
  windowMs: number;
  /** limitdan oshsa qancha muddat bloklanadi (ms) */
  blockMs: number;
}

export interface LimitResult {
  ok: boolean;
  /** blok tugashiga qolgan soniya */
  retryAfter: number;
  /**
   * Shu chaqiruvda bloklandimi. Blok davomida har so'rov ok=false
   * qaytaradi, lekin ogohlantirish bir marta yuborilishi kerak —
   * shuning uchun blok BOSHLANGAN payt alohida belgilanadi.
   */
  justBlocked?: boolean;
  /** shu oynadagi urinishlar soni */
  attempts?: number;
}

/** Urinishni hisobga oladi. ok=false bo'lsa — so'rov rad etilishi kerak. */
export function hit(key: string, opts: LimitOptions): LimitResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (b && b.blockedUntil > now) {
    return { ok: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000) };
  }
  if (!b || now - b.first > opts.windowMs) {
    buckets.set(key, { count: 1, first: now, blockedUntil: 0 });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > opts.max) {
    b.blockedUntil = now + opts.blockMs;
    return { ok: false, retryAfter: Math.ceil(opts.blockMs / 1000), justBlocked: true, attempts: b.count };
  }
  return { ok: true, retryAfter: 0, attempts: b.count };
}

/** Muvaffaqiyatli kirishdan keyin hisob tozalanadi */
export function reset(key: string) {
  buckets.delete(key);
}

// Eskirgan yozuvlarni vaqti-vaqti bilan tozalab turamiz
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.blockedUntil < now && now - b.first > 3_600_000) buckets.delete(k);
  }
}, 600_000).unref?.();
