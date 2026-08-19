// Tovarning ko'rinishi — chizilgan tasvir.
//
// Katalogda 200+ tovar bor va ularning hech birida zavod rasmi yo'q.
// Harf yozib qo'yish ("CC") ro'yxatni jonsiz qiladi: do'konchi ko'z
// bilan tovarni topa olmaydi.
//
// Shuning uchun har tovar o'z SHAKLI bilan chiziladi: ichimlik —
// shisha, energetik — banka, sut — paket, shokolad — plitka, atir —
// flakon. Shakl tovarning nomi, birligi va bo'limidan tanlanadi,
// rangi esa brenddan — shunda Coca-Cola'ning hamma hajmi bir xil
// rangdagi shisha bo'lib turadi.
//
// Zavod rasmi yuklangan bo'lsa u ustun turadi: chizma faqat rasm
// yo'q joyni to'ldiradi.

import type { ReactNode } from 'react';

export interface ArtProduct {
  name_uz: string;
  brand?: string | null;
  unit?: string | null;
  volume_unit?: string | null;
  volume_value?: number | null;
  category_uz?: string | null;
}

/* ─── Rang ─── */

const PAIRS: [string, string][] = [
  ['#5AA9FF', '#0A6BE8'],
  ['#4FD2F0', '#0E9BD6'],
  ['#5FDF77', '#1CB33F'],
  ['#57E0C4', '#12AE92'],
  ['#FFC15C', '#F58A0C'],
  ['#EDB07C', '#C4762C'],
  ['#FFDA55', '#F5AE06'],
  ['#C68BF7', '#8B3DDB'],
  ['#8F96F5', '#4149D1'],
  ['#FF93A8', '#EA3B5E'],
  ['#FF8577', '#E5372A'],
  ['#7FD3E8', '#2F87A8'],
];

export function artColors(p: ArtProduct): [string, string] {
  const key = (p.brand || p.name_uz.split(/[\s-]/)[0] || '?').toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PAIRS[h % PAIRS.length];
}

/* ─── Shakllar ─── */

const SHADE = 'rgba(0,0,0,0.16)';
const LABEL = 'rgba(255,255,255,0.92)';

type Shape = (c: [string, string]) => ReactNode;

const SHAPES: Record<string, Shape> = {
  // Plastik shisha — gazli ichimlik, suv
  bottle: ([a, b]) => (
    <>
      <path d="M40 20h20v9c0 5 2 7 5 11s6 9 6 16v30a8 8 0 0 1-8 8H37a8 8 0 0 1-8-8V56c0-7 3-12 6-16s5-6 5-11Z" fill={a} />
      <path d="M29 62h42v24a8 8 0 0 1-8 8H37a8 8 0 0 1-8-8Z" fill={LABEL} />
      <path d="M29 62h42v6H29Z" fill={SHADE} opacity="0.25" />
      <rect x="38" y="9" width="24" height="12" rx="4" fill={b} />
      <rect x="38" y="13" width="24" height="3" fill={SHADE} opacity="0.3" />
    </>
  ),
  // Metall banka — energetik, pivo
  can: ([a, b]) => (
    <>
      <rect x="31" y="16" width="38" height="70" rx="9" fill={a} />
      <rect x="31" y="38" width="38" height="30" fill={LABEL} />
      <rect x="31" y="16" width="38" height="8" rx="4" fill={b} />
      <rect x="31" y="78" width="38" height="8" rx="4" fill={b} />
      <circle cx="50" cy="20" r="3" fill={SHADE} opacity="0.35" />
    </>
  ),
  // Sut paketi
  carton: ([a, b]) => (
    <>
      <path d="M31 32h38v50a8 8 0 0 1-8 8H39a8 8 0 0 1-8-8Z" fill={a} />
      <path d="M31 32 50 14l19 18Z" fill={b} />
      <rect x="31" y="48" width="38" height="24" fill={LABEL} />
      <rect x="44" y="14" width="12" height="7" rx="2" fill={SHADE} opacity="0.3" />
    </>
  ),
  // Karton quti — yuvish kukuni, yorma
  box: ([a, b]) => (
    <>
      <path d="M26 30h48v52a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8Z" fill={a} />
      <path d="M26 30 36 18h28l10 12Z" fill={b} />
      <rect x="34" y="46" width="32" height="26" rx="3" fill={LABEL} />
    </>
  ),
  // Xalta / paket — pechenye, choy, semichka
  pouch: ([a, b]) => (
    <>
      <path d="M28 26h44v54a10 10 0 0 1-10 10H38a10 10 0 0 1-10-10Z" fill={a} />
      <path d="M28 26h44l-3-10H31Z" fill={b} />
      <path d="M31 16h38" stroke={SHADE} strokeWidth="4" strokeLinecap="round" opacity="0.4" />
      <ellipse cx="50" cy="58" rx="16" ry="13" fill={LABEL} />
    </>
  ),
  // Banka (shisha) — murabbo, asal, konserva
  jar: ([a, b]) => (
    <>
      <rect x="30" y="30" width="40" height="60" rx="10" fill={a} />
      <rect x="30" y="48" width="40" height="26" fill={LABEL} />
      <rect x="27" y="18" width="46" height="14" rx="5" fill={b} />
      <rect x="27" y="24" width="46" height="3" fill={SHADE} opacity="0.3" />
    </>
  ),
  // Tuba — tish pastasi, krem
  tube: ([a, b]) => (
    <>
      <path d="M34 30h32v50a10 10 0 0 1-10 10H44a10 10 0 0 1-10-10Z" fill={a} />
      <path d="M34 30 38 20h24l4 10Z" fill={SHADE} opacity="0.25" />
      <rect x="44" y="9" width="12" height="12" rx="3" fill={b} />
      <rect x="34" y="48" width="32" height="22" fill={LABEL} />
    </>
  ),
  // Purkagich — tozalash vositasi, dezodorant
  spray: ([a, b]) => (
    <>
      <rect x="34" y="34" width="32" height="56" rx="9" fill={a} />
      <rect x="34" y="52" width="32" height="24" fill={LABEL} />
      <path d="M42 34V22a6 6 0 0 1 6-6h11v8H50v10Z" fill={b} />
      <circle cx="72" cy="14" r="3" fill={b} opacity="0.75" />
      <circle cx="80" cy="21" r="2.3" fill={b} opacity="0.6" />
    </>
  ),
  // Atir flakoni
  flask: ([a, b]) => (
    <>
      <path d="M33 38h34v42a10 10 0 0 1-10 10H43a10 10 0 0 1-10-10Z" fill={a} />
      <rect x="42" y="24" width="16" height="15" fill={a} />
      <rect x="40" y="10" width="20" height="15" rx="4" fill={b} />
      <rect x="33" y="54" width="34" height="20" rx="2" fill={LABEL} />
    </>
  ),
  // Shokolad plitkasi
  bar: ([a, b]) => (
    <>
      <rect x="18" y="34" width="64" height="34" rx="7" fill={a} />
      <rect x="18" y="34" width="64" height="34" rx="7" fill={b} opacity="0.35" />
      <g fill={LABEL} opacity="0.85">
        <rect x="26" y="42" width="14" height="18" rx="2" />
        <rect x="43" y="42" width="14" height="18" rx="2" />
        <rect x="60" y="42" width="14" height="18" rx="2" />
      </g>
    </>
  ),
  // Non
  bread: ([a, b]) => (
    <>
      <path d="M18 52c0-14 13-24 32-24s32 10 32 24v18a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8Z" fill={a} />
      <g fill={b} opacity="0.5">
        <rect x="31" y="40" width="7" height="16" rx="3.5" transform="rotate(-16 34 48)" />
        <rect x="46" y="37" width="7" height="16" rx="3.5" />
        <rect x="62" y="40" width="7" height="16" rx="3.5" transform="rotate(16 65 48)" />
      </g>
    </>
  ),
  // Kolbasa / sosiska
  sausage: ([a, b]) => (
    <>
      <rect x="14" y="38" width="72" height="26" rx="13" fill={a} />
      <rect x="14" y="38" width="72" height="10" rx="5" fill={LABEL} opacity="0.35" />
      <g stroke={b} strokeWidth="4" strokeLinecap="round" opacity="0.6">
        <path d="M34 42v18M50 42v18M66 42v18" />
      </g>
    </>
  ),
  // Og'irlikda sotiladigan — qop
  sack: ([a, b]) => (
    <>
      <path d="M30 34c0-6 4-10 10-10h20c6 0 10 4 10 10l6 40a12 12 0 0 1-12 14H36a12 12 0 0 1-12-14Z" fill={a} />
      <path d="M30 34h40l2 12H28Z" fill={b} opacity="0.45" />
      <ellipse cx="50" cy="68" rx="15" ry="12" fill={LABEL} />
    </>
  ),
  // Futbolka — kiyim
  shirt: ([a, b]) => (
    <>
      <path d="M38 18h24c0 6 4 10 9 12l15 6-7 18-10-4v30a6 6 0 0 1-6 6H35a6 6 0 0 1-6-6V50l-10 4-7-18 15-6c5-2 9-6 9-12Z" fill={a} />
      <path d="M38 18c0 7 5 12 12 12s12-5 12-12Z" fill={b} opacity="0.5" />
    </>
  ),
  // Oyoq kiyim
  shoe: ([a, b]) => (
    <>
      <path d="M14 62c0-4 3-7 7-7h13l10-16c2-4 6-6 10-4l7 4c3 2 4 5 3 8l-3 8h18a11 11 0 0 1 11 11v6a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4Z" fill={a} />
      <path d="M14 68h76v8a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4Z" fill={b} />
    </>
  ),
  // Kabel / aksessuar
  cable: ([a, b]) => (
    <>
      <rect x="12" y="40" width="20" height="20" rx="5" fill={b} />
      <rect x="68" y="40" width="20" height="20" rx="5" fill={b} />
      <path d="M32 50c8 0 8 20 18 20s10-20 18-20" fill="none" stroke={a} strokeWidth="10" strokeLinecap="round" />
      <rect x="6" y="45" width="8" height="10" rx="2" fill={a} />
    </>
  ),
  // Batareyka
  battery: ([a, b]) => (
    <>
      <rect x="34" y="18" width="32" height="68" rx="7" fill={a} />
      <rect x="34" y="52" width="32" height="34" rx="7" fill={b} />
      <rect x="43" y="10" width="14" height="10" rx="3" fill={b} />
      <path d="M52 34l-10 18h8l-3 14 13-20h-8Z" fill={LABEL} />
    </>
  ),
  // Lampochka
  bulb: ([a, b]) => (
    <>
      <path d="M50 12a24 24 0 0 1 14 43c-3 2-4 5-4 8H40c0-3-1-6-4-8a24 24 0 0 1 14-43Z" fill={a} />
      <rect x="39" y="66" width="22" height="8" rx="3" fill={b} />
      <rect x="41" y="77" width="18" height="8" rx="4" fill={b} />
    </>
  ),
  // Daftar
  book: ([a, b]) => (
    <>
      <rect x="24" y="16" width="52" height="68" rx="7" fill={a} />
      <rect x="24" y="16" width="12" height="68" fill={b} />
      <g fill={LABEL} opacity="0.85">
        <rect x="44" y="34" width="24" height="5" rx="2.5" />
        <rect x="44" y="46" width="24" height="5" rx="2.5" />
        <rect x="44" y="58" width="16" height="5" rx="2.5" />
      </g>
    </>
  ),
  // Ruchka
  pen: ([a, b]) => (
    <>
      <path d="M62 8a9 9 0 0 1 12 12L34 78l-14 5 5-14Z" fill={a} />
      <path d="M62 8a9 9 0 0 1 12 12l-7 7-12-12Z" fill={b} />
      <path d="M20 83l5-14 9 9Z" fill={SHADE} opacity="0.6" />
    </>
  ),
  // Dori / vitamin
  pill: ([a, b]) => (
    <>
      <rect x="26" y="26" width="48" height="60" rx="10" fill={a} />
      <rect x="30" y="16" width="40" height="12" rx="4" fill={b} />
      <path d="M50 44v22M39 55h22" stroke={LABEL} strokeWidth="8" strokeLinecap="round" />
    </>
  ),
  // Kanistr — moy, antifriz
  canister: ([a, b]) => (
    <>
      <path d="M26 32h48v50a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8Z" fill={a} />
      <rect x="30" y="48" width="40" height="24" rx="3" fill={LABEL} />
      <rect x="56" y="18" width="16" height="15" rx="4" fill={b} />
      <path d="M26 42c-6 0-9 3-9 8v10c0 5 3 8 9 8Z" fill={b} opacity="0.7" />
    </>
  ),
  // Meva / sabzavot
  fruit: ([a, b]) => (
    <>
      <circle cx="50" cy="58" r="30" fill={a} />
      <path d="M50 28c0-10 6-16 14-18-1 10-6 16-14 18Z" fill={b} />
      <ellipse cx="39" cy="47" rx="8" ry="6" fill={LABEL} opacity="0.35" transform="rotate(-30 39 47)" />
    </>
  ),
  // Umumiy — yumaloq burchakli quti
  generic: ([a, b]) => (
    <>
      <rect x="22" y="26" width="56" height="56" rx="12" fill={a} />
      <rect x="22" y="46" width="56" height="16" fill={LABEL} opacity="0.8" />
      <rect x="22" y="26" width="56" height="10" rx="5" fill={b} opacity="0.6" />
    </>
  ),
};

/* ─── Shaklni tanlash ─── */

/** Nomdagi kalit so'zlar — bo'limdan oldin tekshiriladi */
const BY_WORD: [RegExp, string][] = [
  // Ichimlik nomi meva nomini o'z ichiga oladi ("Sharbat olma") —
  // shuning uchun u meva qoidasidan OLDIN tekshiriladi
  [/^sharbat|^sok |^сок|nektar/i, 'carton'],
  [/muzqaymoq|мороже/i, 'pouch'],
  [/shokolad|snickers|twix|mars|alpen/i, 'bar'],
  [/non|bulochka|хлеб/i, 'bread'],
  [/kolbasa|sosiska|колбас/i, 'sausage'],
  [/tush[oy]nka|konserva|murabbo|консерв/i, 'jar'],
  [/tish pasta|krem|colgate|zubn/i, 'tube'],
  [/atir|parfy?um|dezodorant|парфюм/i, 'flask'],
  [/shampun|balzam|suyuq sovun|gel/i, 'spray'],
  [/spray|xushbo|osvej|oyna tozala|chivin/i, 'spray'],
  [/kukun|poroshok|порошок/i, 'box'],
  [/batareyka|батарей|quvvat bank/i, 'battery'],
  [/lampochka|fonar|лампа/i, 'bulb'],
  [/kabel|zaryadlagich|uzaytirgich|quloqchin|kolonka|adapter/i, 'cable'],
  [/daftar|qog|тетрад|бумаг/i, 'book'],
  [/ruchka|qalam|marker|chizg|o.chirg/i, 'pen'],
  [/vitamin|bint|plastir|termometr|antiseptik|niqob|витамин/i, 'pill'],
  [/moy|antifriz|oyna suyuq|масло мотор/i, 'canister'],
  [/futbolka|ko.ylagi|shim|bluzka|kiyim|paypoq|kepka|sharf/i, 'shirt'],
  [/krossovka|tufli|shippak|etik|oyoq kiyim|обув/i, 'shoe'],
  [/olma|banan|apelsin|kartoshka|piyoz|sabzi|pomidor|meva/i, 'fruit'],
  [/sut |qaymoq|kefir|qatiq|ayron|молок/i, 'carton'],
  [/yog.i|kungaboqar|paxta yog/i, 'canister'],
];

/** Ildiz bo'lim -> shakl */
const BY_CATEGORY: [RegExp, string][] = [
  [/gazli|suvlar|sharbat/i, 'bottle'],
  [/energetik|pivo/i, 'can'],
  [/choy va kofe/i, 'pouch'],
  [/sut va qaymoq|qatiq/i, 'carton'],
  [/yogurt|pishloq|sariyog/i, 'box'],
  [/pechenye|saqich|konfet/i, 'pouch'],
  [/meva|sabzavot|ko.kat|quruq meva/i, 'fruit'],
  [/kir yuvish|idish yuvish|tozalash/i, 'spray'],
  [/kosmetika|yuz parvarish|soch|tirnoq/i, 'flask'],
  [/gigiena|ustara|bir martalik|ayollar gigiena/i, 'tube'],
  [/telefon|maishiy|xotira/i, 'cable'],
  [/kiyim|paypoq|bosh kiyim|sumka/i, 'shirt'],
  [/oyoq kiyim/i, 'shoe'],
  [/o.yinchoq|bolalar/i, 'box'],
  [/kanselyariya|maktab|ofis/i, 'book'],
  [/vitamin|tibbiy|niqob/i, 'pill'],
  [/avto|moy/i, 'canister'],
  [/asbob|bo.yoq|urug|elektr moll/i, 'generic'],
  [/hayvon|mushuk/i, 'pouch'],
  [/baqqollik|un va yorma|shakar|makaron|ziravor/i, 'sack'],
];

export function shapeFor(p: ArtProduct): string {
  const name = p.name_uz ?? '';
  for (const [re, shape] of BY_WORD) if (re.test(name)) return shape;

  const cat = p.category_uz ?? '';
  for (const [re, shape] of BY_CATEGORY) if (re.test(cat)) return shape;

  // Bo'lim ham, nom ham aytmasa — birlikka qaraymiz
  if (p.volume_unit === 'l' || p.volume_unit === 'ml') return 'bottle';
  if (p.unit === 'kg') return 'sack';
  return 'generic';
}

/* ─── Komponent ─── */

let uid = 0;

export function ProductArt({ p, size = 52 }: { p: ArtProduct; size?: number }) {
  const colors = artColors(p);
  const shape = SHAPES[shapeFor(p)] ?? SHAPES.generic;
  const id = `pa${uid++}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="cat-art" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="22" fill={colors[0]} opacity="0.16" />
      {shape(colors)}
      <rect x="0" y="0" width="100" height="100" rx="22" fill={`url(#${id})`} opacity="0.18" />
    </svg>
  );
}
