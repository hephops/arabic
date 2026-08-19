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

export interface OffProduct {
  name: string | null;
  brand: string | null;
  quantity: string | null;
  image: string | null;
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
    `https://world.openfoodfacts.org/api/v2/product/${code}.json` +
    `?fields=product_name,product_name_ru,brands,quantity,image_front_url`;

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
