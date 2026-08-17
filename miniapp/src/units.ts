// O'lchov birliklari.
//
// Do'konda hamma tovar donalab sotilmaydi: sabzi, semichka, go'sht,
// yog' — kilogramm yoki litrda. Birlik faqat yozuv emas, ish qoidasi:
// donada 1,5 ta bo'lmaydi, kilogrammda esa bo'ladi va bu kassada ham,
// omborda ham hisobga olinishi kerak.
//
// Ro'yxat qat'iy: erkin matn bo'lsa bir do'konda "kg", boshqasida
// "килограмм", uchinchisida "kilo" paydo bo'lardi va hisobot buzilardi.

import { translate, fmt } from './i18n';

export const UNITS = ['dona', 'kg', 'gramm', 'litr', 'ml', 'metr'] as const;
export type Unit = (typeof UNITS)[number];

/**
 * Ombor birliklari — tovar QANDAY kelib, qanday hisobga olinadi.
 * Gramm va millilitr bu ro'yxatda yo'q: hech kim omborni "10 000 gramm
 * semichka" deb yuritmaydi. Ular narx birligi sifatida ishlatiladi
 * (pastdagi priceBases). Eski tovarlarda gramm uchrasa — ishlayveradi.
 */
export const STOCK_UNITS = ['dona', 'kg', 'litr', 'metr'] as const;

/** Birlik nomi tanlangan tilda: 'kg' -> "кг" */
export const unitName = (unit: string | null | undefined) => translate(`unit_${normalizeUnit(unit)}`);

/** Kasrli miqdor mumkinmi. Donada yo'q — yarim dona non bo'lmaydi. */
export const isFractional = (unit: string | null | undefined) => (unit ?? 'dona') !== 'dona';

/** Notanish yoki bo'sh birlikni xavfsiz qiymatga keltiradi */
export function normalizeUnit(value: string | null | undefined): Unit {
  const v = (value ?? '').trim().toLowerCase();
  if ((UNITS as readonly string[]).includes(v)) return v as Unit;
  // Eski yozuvlar va ovozli kiritishdan keladigan ko'rinishlar
  if (['kilo', 'kilogramm', 'kilogram', 'кг', 'килограмм'].includes(v)) return 'kg';
  if (['g', 'gr', 'gram', 'г', 'гр', 'грамм'].includes(v)) return 'gramm';
  if (['l', 'litre', 'liter', 'л', 'литр'].includes(v)) return 'litr';
  if (['mililitr', 'мл', 'миллилитр'].includes(v)) return 'ml';
  if (['m', 'м', 'метр'].includes(v)) return 'metr';
  return 'dona';
}

/**
 * Miqdorni ko'rsatish: butun bo'lsa kasrsiz.
 * 2 → "2", 1.5 → "1.5", 1.250 → "1.25"
 */
export function qtyText(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const r = Math.round(qty * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
}

/** Miqdor va birlik birga: "1.5 kg" */
export const qtyWithUnit = (qty: number, unit: string | null | undefined) =>
  `${qtyText(qty)} ${normalizeUnit(unit)}`;

// ---------- NARX QAYSI MIQDORGA ----------
//
// Ombor birligi va narx birligi — ikki xil narsa. Do'konchi "semichka
// 10 kg keldi, 100 grami 15 ming" deydi: ombor kilogrammda, narx esa
// grammda. Ilgari bittasini tanlasa ikkinchisi ham o'zgarib ketardi.
//
// Bazada narx HAR DOIM 1 ombor birligi uchun turadi (sotuv, qaytarish,
// hisobot — hammasi shunga tayanadi). price_qty faqat "narx qaysi
// miqdorga aytilgan" ni eslab qoladi: 0.1 bo'lsa "100 gramm uchun".

export type PriceBasis = {
  /** Ombor birligining ulushi: 100 g = 0.1 kg */
  qty: number;
  /** Ko'rsatiladigan son: 100 */
  n: number;
  /** Ko'rsatiladigan birlik: 'gramm' */
  unit: Unit;
};

const ONE = (u: Unit): PriceBasis[] => [{ qty: 1, n: 1, unit: u }];

/** Shu ombor birligi uchun narx qaysi miqdorlarda aytilishi mumkin */
export function priceBases(unit: string | null | undefined): PriceBasis[] {
  const u = normalizeUnit(unit);
  if (u === 'kg')
    return [
      { qty: 1, n: 1, unit: 'kg' },
      { qty: 0.5, n: 500, unit: 'gramm' },
      { qty: 0.25, n: 250, unit: 'gramm' },
      { qty: 0.1, n: 100, unit: 'gramm' },
    ];
  if (u === 'litr')
    return [
      { qty: 1, n: 1, unit: 'litr' },
      { qty: 0.5, n: 500, unit: 'ml' },
      { qty: 0.25, n: 250, unit: 'ml' },
      { qty: 0.1, n: 100, unit: 'ml' },
    ];
  // Omborning o'zi grammda yuritilsa — narx 1 g yoki 100 g uchun
  if (u === 'gramm')
    return [
      { qty: 1, n: 1, unit: 'gramm' },
      { qty: 100, n: 100, unit: 'gramm' },
      { qty: 500, n: 500, unit: 'gramm' },
    ];
  if (u === 'ml')
    return [
      { qty: 1, n: 1, unit: 'ml' },
      { qty: 100, n: 100, unit: 'ml' },
      { qty: 500, n: 500, unit: 'ml' },
    ];
  return ONE(u);
}

/** price_qty ga mos asos; topilmasa erkin qiymat sifatida yasab beriladi */
export function basisOf(unit: string | null | undefined, priceQty: number | null | undefined): PriceBasis {
  const u = normalizeUnit(unit);
  const list = priceBases(u);
  const q = Number(priceQty);
  if (!Number.isFinite(q) || q <= 0) return list[0];
  return (
    list.find((b) => Math.abs(b.qty - q) < 1e-9) ?? { qty: q, n: q, unit: u }
  );
}

/** Asosning yozuvi: "100 g", "1 kg" */
export const basisText = (b: PriceBasis) => `${qtyText(b.n)} ${unitName(b.unit)}`;

/** Narx shu asosga qanday ko'rinadi: 150 000/kg + 0.1 -> 15 000 */
export const priceForBasis = (unitPrice: number, priceQty: number | null | undefined) => {
  const q = Number(priceQty);
  if (!Number.isFinite(q) || q <= 0) return unitPrice;
  return Math.round(unitPrice * q);
};

/**
 * Narxni asosi bilan birga ko'rsatish uchun tayyor bo'laklar.
 * dona bo'lsa qo'shimcha yozuv kerak emas — "3 000 so'm" o'zi tushunarli.
 */
export function priceParts(
  unitPrice: number,
  unit: string | null | undefined,
  priceQty: number | null | undefined
): { value: number; per: string | null } {
  const b = basisOf(unit, priceQty);
  const plain = normalizeUnit(unit) === 'dona' && b.qty === 1;
  return { value: priceForBasis(unitPrice, b.qty), per: plain ? null : basisText(b) };
}

/** Tayyor yozuv: "15 000 so'm / 100 g" yoki donada shunchaki "3 000 so'm" */
export function priceLabel(
  unitPrice: number,
  unit: string | null | undefined,
  priceQty: number | null | undefined
): string {
  const { value, per } = priceParts(unitPrice, unit, priceQty);
  return per ? `${fmt(value)} / ${per}` : fmt(value);
}

/** Kiritilgan matndan miqdor: vergul ham nuqta sifatida qabul qilinadi */
export function parseQty(text: string, unit: string | null | undefined): number {
  const n = Number((text ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  // Donada kasr bo'lmaydi — pastga yaxlitlanadi
  return isFractional(unit) ? Math.round(n * 1000) / 1000 : Math.floor(n);
}
