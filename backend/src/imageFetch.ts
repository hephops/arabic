// Rasmni internetdan olib kelish.
//
// Nega serverda: katalogni to'ldirayotgan admin yuzlab rasmni qo'lda
// yuklab, keyin qayta yuklab o'tira olmaydi. Havolani qo'yadi yoki
// shtrix-kodni yozadi — qolganini server qiladi.
//
// XAVFSIZLIK: bu yerda server IXTIYORIY manzilga so'rov yuboradi.
// Shuning uchun ichki tarmoq manzillari qat'iy to'siladi — aks holda
// admin panel orqali serverning o'z ichki xizmatlarini titib chiqish
// mumkin bo'lardi (SSRF).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Faylning o'z imzosidan turini aniqlaydi.
 *
 * Content-Type sarlavhasiga ishonib bo'lmaydi: sayt "image/png" deb
 * yozib, ichida HTML yoki boshqa narsa yuborishi mumkin. Hajm bo'yicha
 * tekshirish ham yaramaydi — kichik rasm ham haqiqiy rasm bo'ladi.
 */
function sniffExt(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // WEBP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Ichki (xususiy) manzilmi — bunday joyga so'rov yuborilmaydi */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * FAQAT SINOV UCHUN: ichki manzillarga ruxsat beradi (soxta rasm
 * serveri localhost'da turadi). Ishlab chiqarishda BO'SH qolishi shart —
 * aks holda admin panel orqali serverning ichki tarmog'ini titib
 * chiqish mumkin bo'ladi.
 */
const ALLOW_PRIVATE = process.env.IMAGE_FETCH_ALLOW_PRIVATE === '1';

async function assertPublicHost(urlStr: string): Promise<void> {
  const u = new URL(urlStr);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad_protocol');
  if (ALLOW_PRIVATE) return;
  const host = u.hostname;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('private_host');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) throw new Error('private_host');
  }
}

export interface FetchedImage {
  buffer: Buffer;
  ext: string;
  bytes: number;
}

/** Havoladan rasmni olib kelish. Xato bo'lsa sabab bilan tashlaydi. */
export async function fetchImage(url: string): Promise<FetchedImage> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        signal: ctrl.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'BuySale-Catalog/1.0' },
      });
    } finally {
      clearTimeout(timer);
    }

    // Har qayta yo'naltirishda manzil yana tekshiriladi — aks holda
    // ochiq sayt ichki manzilga yo'naltirib yuborishi mumkin edi
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) throw new Error('bad_redirect');
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`http_${res.status}`);

    // Sarlavha ham qaraladi, lekin yakuniy qaror faylning o'zidan
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (type && type.startsWith('text/')) throw new Error('not_an_image');

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) throw new Error('too_big');

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) throw new Error('too_big');

    const ext = sniffExt(buffer) ?? (EXT[type] && buffer.byteLength > 0 ? null : null);
    if (!ext) throw new Error('not_an_image');

    return { buffer, ext, bytes: buffer.byteLength };
  }
  throw new Error('too_many_redirects');
}

/** Olib kelingan rasmni saqlash va ilova ko'radigan manzilni qaytarish */
export function saveFetched(img: FetchedImage, id: number, uploadsDir: string): string {
  const filename = `catalog-${id}.${img.ext}`;
  writeFileSync(join(uploadsDir, filename), img.buffer);
  // Brauzer eski rasmni keshlab qolmasin
  return `/uploads/${filename}?v=${Date.now()}`;
}

/* ─────────── Open Food Facts ─────────── */

/** Sinov uchun manzilni almashtirish (TELEGRAM_API_BASE bilan bir xil usul) */
const OFF_BASE = process.env.OFF_API_BASE || 'https://world.openfoodfacts.org';

export interface OffProduct {
  name: string | null;
  brand: string | null;
  quantity: string | null;
  image: string | null;
  /** topilgan yozuvning shtrix-kodi — bizda bo'lmasa yozib qo'yamiz */
  code?: string | null;
}

/**
 * Shtrix-kod bo'yicha zavod ma'lumotini olish.
 *
 * Open Food Facts — ochiq baza, ma'lumoti ODbL, rasmlari CC BY-SA
 * litsenziyasida. Ya'ni ishlatish mumkin, LEKIN manba ko'rsatilishi
 * kerak. Shuning uchun rasm qayerdan olingani yozib qo'yiladi.
 */
export async function offLookup(barcode: string): Promise<OffProduct | null> {
  const code = barcode.replace(/\D/g, '');
  if (code.length < 8) return null;
  const url =
    `${OFF_BASE}/api/v2/product/${code}.json` +
    `?fields=code,product_name,product_name_ru,brands,quantity,image_front_url`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'BuySale-Catalog/1.0 (uz)' },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data?.status !== 1 || !data.product) return null;
    const p = data.product;
    return {
      name: p.product_name_ru || p.product_name || null,
      brand: (p.brands ?? '').split(',')[0]?.trim() || null,
      quantity: p.quantity || null,
      image: p.image_front_url || null,
      code: p.code || code,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "1.5 l", "500 г", "330ml" kabi matnni raqam va o'lchovga ajratadi.
 * Open Food Facts hajmni erkin matn sifatida saqlaydi.
 */
export function parseQuantity(text: string | null): { value: number; unit: string } | null {
  if (!text) return null;
  const m = text
    .toLowerCase()
    .replace(',', '.')
    .match(/(\d+(?:\.\d+)?)\s*(ml|мл|cl|l|л|litr|литр|g|г|gr|kg|кг)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const raw = m[2];
  if (raw === 'cl') return { value: n * 10, unit: 'ml' };
  if (['ml', 'мл'].includes(raw)) return { value: n, unit: 'ml' };
  if (['l', 'л', 'litr', 'литр'].includes(raw)) return { value: n, unit: 'l' };
  if (['g', 'г', 'gr'].includes(raw)) return { value: n, unit: 'g' };
  if (['kg', 'кг'].includes(raw)) return { value: n, unit: 'kg' };
  return null;
}

/* ─────────── Nom bo'yicha izlash ─────────── */

/** Hajmni bitta o'lchovga keltirish: 1.5 l -> 1500 ml, 1 kg -> 1000 g */
function toBase(value: number, unit: string): { n: number; kind: 'volume' | 'mass' } | null {
  if (unit === 'l') return { n: value * 1000, kind: 'volume' };
  if (unit === 'ml') return { n: value, kind: 'volume' };
  if (unit === 'kg') return { n: value * 1000, kind: 'mass' };
  if (unit === 'g') return { n: value, kind: 'mass' };
  return null;
}

/** Matnni solishtirish uchun so'zlarga ajratish */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s.]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^\d+(\.\d+)?$/.test(w));
}

export interface WantedProduct {
  name_uz: string;
  name_ru?: string | null;
  brand?: string | null;
  volume_value?: number | null;
  volume_unit?: string | null;
}

/**
 * Nom bo'yicha zavod rasmini izlash.
 *
 * ENG MUHIMI — HAJM. "Coca-Cola" so'rovi 0.5, 1, 1.5 va 2 litrlikni
 * birdek qaytaradi. Agar hajmni tekshirmasak, 0.5 litrlik yozuvga
 * 1.5 litrlikning rasmi tushib qoladi va do'konchi ishonchni yo'qotadi.
 *
 * Shuning uchun: bizda hajm bo'lsa, topilgan tovarning hajmi ham
 * O'SHA bo'lishi shart. Mos kelmasa — rasm olinmaydi.
 */
export async function offSearch(want: WantedProduct): Promise<OffProduct | null> {
  // Avval o'zbekcha nom bilan, topilmasa ruscha nom bilan izlaymiz.
  // Ochiq bazada MDH tovarlari ko'proq ruscha nom bilan yozilgan:
  // "Смeтана 200 г" topiladi, "Smetana 200 g" esa topilmaydi.
  const tries = [
    [want.brand, want.name_uz].filter(Boolean).join(' '),
    want.name_ru ? [want.brand, want.name_ru].filter(Boolean).join(' ') : '',
  ].filter((t) => t.trim());

  for (const terms of tries) {
    const hit = await searchOnce(terms, want);
    if (hit) return hit;
  }
  return null;
}

async function searchOnce(terms: string, want: WantedProduct): Promise<OffProduct | null> {
  const url =
    `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(terms)}` +
    `&search_simple=1&action=process&json=1&page_size=24` +
    `&fields=code,product_name,product_name_ru,brands,quantity,image_front_url`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let list: any[] = [];
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'BuySale-Catalog/1.0 (uz)' } });
    if (!res.ok) return null;
    const data: any = await res.json();
    list = Array.isArray(data?.products) ? data.products : [];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const wantVol =
    want.volume_value != null && want.volume_unit ? toBase(want.volume_value, want.volume_unit) : null;
  // O'zbekcha va ruscha nom AYRIM to'plam: "Smetana" va "Сметана" bir
  // xil tovar, lekin bitta yozuvda ikkalasi ham bo'lmaydi. Shuning
  // uchun "hamma so'z topildimi" degan shart har biriga alohida qo'yiladi.
  const wantSets = [words(want.name_uz), words(want.name_ru ?? '')]
    .map((w) => [...new Set(w)])
    .filter((w) => w.length);
  const wantBrand = (want.brand ?? '').toLowerCase().trim();

  let best: { score: number; p: OffProduct } | null = null;

  for (const c of list) {
    if (!c.image_front_url) continue;

    // 1) Hajm — qat'iy shart. "Coca-Cola" so'rovi 0.5, 1, 1.5 va 2
    // litrlikni birdek qaytaradi; hajmni tekshirmasak 0.5 litrlik
    // yozuvga 1.5 litrlikning rasmi tushib qoladi.
    if (wantVol) {
      const q = parseQuantity(c.quantity ?? null);
      const got = q ? toBase(q.value, q.unit) : null;
      if (!got || got.kind !== wantVol.kind) continue;
      // 2% chetlanish: 500 ml va 0.5 l bir xil, 500 va 510 emas
      if (Math.abs(got.n - wantVol.n) > wantVol.n * 0.02) continue;
    }

    const gotWords = new Set([
      ...words(String(c.product_name ?? '')),
      ...words(String(c.product_name_ru ?? '')),
    ]);
    let hits = 0;
    let full = false;      // biror tildagi nom to'liq mos keldimi
    let strong = false;    // o'sha nomda uzunroq (tasodifiy bo'lmagan) so'z bormi
    for (const set of wantSets) {
      const h = set.filter((w) => gotWords.has(w)).length;
      if (h > hits) hits = h;
      if (h === set.length) {
        full = true;
        if (set.some((w) => w.length >= 4)) strong = true;
      }
    }

    let score = 0;
    // 2) Brend — aytilgan bo'lsa mos kelishi shart
    const gotBrand = String(c.brands ?? '').toLowerCase();
    if (wantBrand) {
      if (!gotBrand.includes(wantBrand)) continue;
      score += 3;
      if (!hits && !wantVol) continue;   // faqat brend — hali yetarli emas
    } else {
      // Brendsiz tovarda faqat nom bor. Tasodifiy moslik bo'lmasligi uchun
      // qoida qattiqroq: hajm ham, nomning to'liq mosligi ham shart.
      // Aks holda "Non 500 g" ochiq bazadagi "Non-alcoholic ... 500 g" ga
      // yopishib qolardi.
      if (!wantVol || !full || !strong) continue;
    }
    score += hits;
    if (wantVol) score += 2;

    if (!best || score > best.score) {
      best = {
        score,
        p: {
          name: c.product_name_ru || c.product_name || null,
          brand: String(c.brands ?? '').split(',')[0]?.trim() || null,
          quantity: c.quantity || null,
          image: c.image_front_url,
          code: c.code || null,
        },
      };
    }
  }

  // Juda zaif moslikni olmaymiz — noto'g'ri rasm rasmsizdan yomon
  return best && best.score >= 2 ? best.p : null;
}
