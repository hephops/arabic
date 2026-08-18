// BuySale ikonkalar to'plami
// AppIcon — qo'lda chizilgan iOS/macOS uslubidagi ilova ikonkalari:
//   squircle (uzluksiz burchak), chuqurlikli gradient, yuqoridan yorug'lik,
//   har biri o'z ma'nosini bildiradigan puxta tasvir.
// Glyph — ro'yxatlar va tugmalar uchun nozik chiziqli ikonkalar (Ionicons).

import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import {
  IoHomeOutline, IoHome, IoPeopleOutline, IoPeople, IoAdd, IoAddCircleOutline,
  IoAddCircle, IoCartOutline, IoCart, IoPersonOutline, IoPerson, IoMicOutline,
  IoCashOutline, IoCardOutline, IoBookOutline, IoWarningOutline, IoCalendarOutline,
  IoCubeOutline, IoTimeOutline, IoArrowDownOutline, IoArrowUpOutline, IoCheckmark,
  IoSearchOutline, IoScanOutline, IoPencil, IoSettingsOutline, IoChevronForward,
  IoStarOutline, IoGlobeOutline, IoLogOutOutline, IoCameraOutline, IoCloseOutline,
  IoBarChartOutline, IoTrendingUpOutline, IoTrendingDownOutline, IoTrashOutline,
  IoMenuOutline, IoCallOutline, IoPaperPlaneOutline, IoHelpBuoyOutline,
  IoCopyOutline, IoFlashOutline, IoTrophyOutline, IoRibbonOutline,
} from 'react-icons/io5';

/* ─────────── Chiziqli ikonkalar (ro'yxat, tugma, chevron) ─────────── */

const GLYPHS: Record<string, IconType> = {
  house: IoHomeOutline, houseFill: IoHome,
  people: IoPeopleOutline, peopleFill: IoPeople,
  plus: IoAdd, plusCircle: IoAddCircleOutline, plusCircleFill: IoAddCircle,
  cart: IoCartOutline, cartFill: IoCart,
  person: IoPersonOutline, personFill: IoPerson,
  mic: IoMicOutline, banknote: IoCashOutline, card: IoCardOutline, book: IoBookOutline,
  warning: IoWarningOutline, calendar: IoCalendarOutline, box: IoCubeOutline,
  clock: IoTimeOutline, arrowDown: IoArrowDownOutline, arrowUp: IoArrowUpOutline,
  check: IoCheckmark, search: IoSearchOutline, scan: IoScanOutline, pencil: IoPencil,
  gear: IoSettingsOutline, chevron: IoChevronForward, star: IoStarOutline,
  globe: IoGlobeOutline, logout: IoLogOutOutline, camera: IoCameraOutline, close: IoCloseOutline,
  chart: IoBarChartOutline, trendUp: IoTrendingUpOutline, trendDown: IoTrendingDownOutline,
  trash: IoTrashOutline, menu: IoMenuOutline, call: IoCallOutline, send: IoPaperPlaneOutline,
  help: IoHelpBuoyOutline, copy: IoCopyOutline, flash: IoFlashOutline,
  trophy: IoTrophyOutline, ribbon: IoRibbonOutline,
};

export function Glyph({
  name, size = 22, color = 'currentColor',
}: {
  name: string; size?: number; color?: string; strokeWidth?: number;
}) {
  const Icon = GLYPHS[name] ?? IoCubeOutline;
  return <Icon size={size} color={color} style={{ flexShrink: 0 }} />;
}

/* ─────────── Ilova ikonkalari ─────────── */

// Uzluksiz burchakli kvadrat (Apple squircle)
const SQUIRCLE =
  'M50,0 C77.6,0 88.9,0 94.4,5.6 C100,11.1 100,22.4 100,50 C100,77.6 100,88.9 94.4,94.4 ' +
  'C88.9,100 77.6,100 50,100 C22.4,100 11.1,100 5.6,94.4 C0,88.9 0,77.6 0,50 ' +
  'C0,22.4 0,11.1 5.6,5.6 C11.1,0 22.4,0 50,0 Z';

const PALETTE = {
  blue: ['#3E97F7', '#0A6BE8'],
  teal: ['#41C6EC', '#0E9BD6'],
  green: ['#4CD766', '#1CB33F'],
  mint: ['#4FD9BC', '#12AE92'],
  orange: ['#FFB33D', '#F58A0C'],
  amber: ['#E8A063', '#C4762C'],
  yellow: ['#FFD02E', '#F5AE06'],
  purple: ['#B672F5', '#8B3DDB'],
  indigo: ['#7A82F0', '#4149D1'],
  pink: ['#FF7B93', '#EA3B5E'],
  red: ['#FF6A5C', '#E5372A'],
  gray: ['#B4B9C2', '#6B717C'],
} as const;

export type IconColor = keyof typeof PALETTE;

const INK = 'rgba(0,0,0,0.24)';   // ichki detallar uchun soyali rang
const INK_SOFT = 'rgba(0,0,0,0.16)';

// Har bir ikonkaning tasviri 100×100 maydonda chizilgan
const ART: Record<string, (bg: string) => ReactNode> = {
  // Uy — bosh sahifa
  house: () => (
    <path
      fillRule="evenodd"
      fill="#fff"
      d="M50 14 L89 48 H79 V81 a4 4 0 0 1-4 4 H25 a4 4 0 0 1-4-4 V48 H11 Z
         M43 85 V67 a7 7 0 0 1 14 0 V85 Z"
    />
  ),
  // Ikki kishi — mijozlar
  people: () => (
    <>
      <circle cx="67" cy="36" r="11" fill="#fff" opacity="0.6" />
      <path
        d="M67 50c11.3 0 20.5 8.4 20.5 18.8 0 2.1-1.7 3.7-3.7 3.7H50.2c-2.1 0-3.7-1.6-3.7-3.7C46.5 58.4 55.7 50 67 50Z"
        fill="#fff"
        opacity="0.6"
      />
      <circle cx="40" cy="40" r="14.5" fill="#fff" />
      <path
        d="M40 59c14 0 25.5 10.4 25.5 23.2 0 2.3-1.9 4.1-4.2 4.1H18.7c-2.3 0-4.2-1.8-4.2-4.1C14.5 69.4 26 59 40 59Z"
        fill="#fff"
      />
    </>
  ),
  // Daftar va qalam — qarz yozish
  note: (bg) => (
    <>
      <rect x="17" y="19" width="41" height="58" rx="7" fill="#fff" />
      <rect x="25" y="31" width="25" height="4.6" rx="2.3" fill={INK_SOFT} />
      <rect x="25" y="43" width="25" height="4.6" rx="2.3" fill={INK_SOFT} />
      <rect x="25" y="55" width="16" height="4.6" rx="2.3" fill={INK_SOFT} />
      <g transform="rotate(38 71 54)">
        <path d="M61.5 38a9.5 9.5 0 0 1 19 0v31l-9.5 15.5L61.5 69Z" fill={`url(#${bg})`} />
        <path d="M64 40a7 7 0 0 1 14 0v28l-7 12-7-12Z" fill="#fff" />
        <path d="M64 64h14v4l-7 12-7-12Z" fill={INK} />
      </g>
    </>
  ),
  // Savat — kassa
  cart: () => (
    <>
      <g fill="none" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 23h9l4.4 16" />
        <path d="M27.4 39h56l-7.6 27h-40.8Z" />
      </g>
      <circle cx="42" cy="79" r="6.5" fill="#fff" />
      <circle cx="70" cy="79" r="6.5" fill="#fff" />
    </>
  ),
  // Yuk mashinasi — postavshiklar
  truck: (bg) => (
    <>
      <path d="M10 30a7 7 0 0 1 7-7h29a7 7 0 0 1 7 7v33H10Z" fill="#fff" />
      <path d="M53 38h14.4a7 7 0 0 1 5.5 2.7l7.6 9.8a7 7 0 0 1 1.5 4.3V63H53Z" fill="#fff" opacity="0.78" />
      <rect x="10" y="60" width="80" height="6" rx="3" fill="#fff" opacity="0.5" />
      <circle cx="29" cy="72" r="10.5" fill={`url(#${bg})`} />
      <circle cx="29" cy="72" r="8" fill="#fff" />
      <circle cx="29" cy="72" r="3.4" fill={`url(#${bg})`} />
      <circle cx="70" cy="72" r="10.5" fill={`url(#${bg})`} />
      <circle cx="70" cy="72" r="8" fill="#fff" />
      <circle cx="70" cy="72" r="3.4" fill={`url(#${bg})`} />
    </>
  ),
  // Ustunli diagramma — hisobotlar
  chart: () => (
    <>
      <rect x="21" y="53" width="14" height="29" rx="6" fill="#fff" opacity="0.72" />
      <rect x="43" y="38" width="14" height="44" rx="6" fill="#fff" opacity="0.86" />
      <rect x="65" y="22" width="14" height="60" rx="6" fill="#fff" />
    </>
  ),
  // Izometrik quti — ombor
  boxes: () => (
    <>
      <path d="M50 15 86 33 50 51 14 33Z" fill="#fff" />
      <path d="M14 33 50 51v34L14 67Z" fill="#fff" opacity="0.62" />
      <path d="M86 33 50 51v34l36-18Z" fill="#fff" opacity="0.82" />
    </>
  ),
  // Pul — balans
  banknote: (bg) => (
    <>
      <rect x="11" y="27" width="78" height="46" rx="9" fill="#fff" />
      <circle cx="50" cy="50" r="12" fill={`url(#${bg})`} />
      <circle cx="50" cy="50" r="7.5" fill="#fff" />
      <circle cx="23" cy="50" r="3.6" fill={INK_SOFT} />
      <circle cx="77" cy="50" r="3.6" fill={INK_SOFT} />
    </>
  ),
  // Toj — obuna
  crown: () => (
    <>
      <path
        d="M14 33 32 46 50 20 68 46 86 33 79.5 73a4.5 4.5 0 0 1-4.4 3.7H24.9A4.5 4.5 0 0 1 20.5 73Z"
        fill="#fff"
      />
      <rect x="24" y="79" width="52" height="7" rx="3.5" fill="#fff" opacity="0.75" />
      <circle cx="50" cy="56" r="4.5" fill={INK_SOFT} />
    </>
  ),
  // Xodim — bitta kishi va tasdiq belgisi
  employee: (bg) => (
    <>
      <circle cx="44" cy="33" r="14" fill="#fff" />
      <path
        d="M44 51c14.6 0 26.5 10.5 26.5 23.4 0 2.3-1.9 4.1-4.2 4.1H21.7c-2.3 0-4.2-1.8-4.2-4.1C17.5 61.5 29.4 51 44 51Z"
        fill="#fff"
      />
      <circle cx="74" cy="69" r="16.5" fill={`url(#${bg})`} />
      <circle cx="74" cy="69" r="13" fill="#fff" />
      <path
        d="M67.5 69.5 72.5 74.5 81 64.5"
        fill="none"
        stroke="rgba(0,0,0,0.36)"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  // Sovg'a — referal
  gift: () => (
    <>
      <rect x="15" y="42" width="70" height="43" rx="8" fill="#fff" />
      <rect x="10" y="30" width="80" height="17" rx="7" fill="#fff" />
      <rect x="43" y="30" width="14" height="55" fill={INK_SOFT} />
      <path d="M50 31c-5.5-13-24-11.5-24-1.5 0 6.5 14 6 24 1.5Z" fill="#fff" />
      <path d="M50 31c5.5-13 24-11.5 24-1.5 0 6.5-14 6-24 1.5Z" fill="#fff" />
    </>
  ),
  // Tishli g'ildirak — sozlamalar
  gear: (bg) => (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x="45.5" y="10" width="9" height="17" rx="3" fill="#fff" transform={`rotate(${i * 45} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="26" fill="#fff" />
      <circle cx="50" cy="50" r="11" fill={`url(#${bg})`} />
    </>
  ),
  // Skaner — shtrix-kod
  scan: () => (
    <>
      <g fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round">
        <path d="M17 33V25a8 8 0 0 1 8-8h8" />
        <path d="M67 17h8a8 8 0 0 1 8 8v8" />
        <path d="M83 67v8a8 8 0 0 1-8 8h-8" />
        <path d="M33 83h-8a8 8 0 0 1-8-8v-8" />
      </g>
      <g fill="#fff">
        <rect x="31" y="35" width="5" height="30" rx="2.5" />
        <rect x="40" y="35" width="3" height="30" rx="1.5" />
        <rect x="47" y="35" width="6" height="30" rx="3" />
        <rect x="57" y="35" width="3" height="30" rx="1.5" />
        <rect x="64" y="35" width="5" height="30" rx="2.5" />
      </g>
    </>
  ),
  // Mikrofon — ovozli kiritish
  mic: () => (
    <>
      <rect x="38" y="14" width="24" height="45" rx="12" fill="#fff" />
      <path d="M26 47a24 24 0 0 0 48 0" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
      <path d="M50 71v13" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
    </>
  ),
  // Karta
  card: (bg) => (
    <>
      <rect x="10" y="26" width="80" height="49" rx="10" fill="#fff" />
      <rect x="10" y="37" width="80" height="12" fill={`url(#${bg})`} />
      <rect x="20" y="57" width="26" height="7" rx="3.5" fill={INK_SOFT} />
      <rect x="52" y="57" width="14" height="7" rx="3.5" fill={INK_SOFT} />
      <rect x="70" y="57" width="10" height="7" rx="3.5" fill={INK_SOFT} />
    </>
  ),
  // Globus — til
  globe: (bg) => (
    <>
      <circle cx="50" cy="50" r="35" fill="#fff" />
      <g fill="none" stroke={`url(#${bg})`} strokeWidth="4.2" strokeLinecap="round">
        <path d="M15.5 50h69" />
        <ellipse cx="50" cy="50" rx="15.5" ry="34.8" />
        <path d="M22.5 29.5c7.5 4.6 17 7 27.5 7s20-2.4 27.5-7" />
        <path d="M22.5 70.5c7.5-4.6 17-7 27.5-7s20 2.4 27.5 7" />
      </g>
    </>
  ),
  // Chiqish
  logout: () => (
    <g fill="none" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M45 17H26a8 8 0 0 0-8 8v50a8 8 0 0 0 8 8h19" />
      <path d="M63 33 80 50 63 67" />
      <path d="M80 50H42" />
    </g>
  ),
  // Pastga strelka — menga qarzdorlar
  arrowDown: () => (
    <g fill="none" stroke="#fff" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 20v50" />
      <path d="M31 52 50 71l19-19" />
    </g>
  ),
  // Yuqoriga strelka — men qarzdorman
  arrowUp: () => (
    <g fill="none" stroke="#fff" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 80V30" />
      <path d="M31 48 50 29l19 19" />
    </g>
  ),
  // Yulduz
  star: () => (
    <path
      d="M50 15 61 37.5 86 41.2 68 58.7 72.2 83.5 50 71.8 27.8 83.5 32 58.7 14 41.2 39 37.5Z"
      fill="#fff"
    />
  ),
  // Kitob — qarz daftari
  book: () => (
    <>
      <path d="M13 24c11-4.5 24-4 34 2.5v54c-10-6.5-23-7-34-2.5Z" fill="#fff" opacity="0.78" />
      <path d="M87 24c-11-4.5-24-4-34 2.5v54c10-6.5 23-7 34-2.5Z" fill="#fff" />
    </>
  ),
  // Lupa — qidiruv
  search: () => (
    <>
      <circle cx="45" cy="44" r="22" fill="none" stroke="#fff" strokeWidth="8" />
      <path d="M61 61 80 80" stroke="#fff" strokeWidth="9.5" strokeLinecap="round" />
    </>
  ),
  // Ogohlantirish
  warning: () => (
    <>
      <path d="M44.2 17.6a6.7 6.7 0 0 1 11.6 0l30 52.4a6.7 6.7 0 0 1-5.8 10H20a6.7 6.7 0 0 1-5.8-10Z" fill="#fff" />
      <rect x="46" y="36" width="8" height="24" rx="4" fill={INK} />
      <circle cx="50" cy="68" r="4.6" fill={INK} />
    </>
  ),
  // Soat
  clock: () => (
    <>
      <circle cx="50" cy="50" r="35" fill="#fff" />
      <g stroke={INK} strokeWidth="5.5" strokeLinecap="round">
        <path d="M50 28v23" />
        <path d="M50 51 66 60" />
      </g>
    </>
  ),
  // Kalendar
  calendar: () => (
    <>
      <rect x="13" y="20" width="74" height="67" rx="10" fill="#fff" />
      <rect x="13" y="20" width="74" height="19" rx="10" fill={INK} />
      <rect x="13" y="32" width="74" height="7" fill={INK} />
      <g fill={INK_SOFT}>
        <circle cx="32" cy="56" r="5" />
        <circle cx="50" cy="56" r="5" />
        <circle cx="68" cy="56" r="5" />
        <circle cx="32" cy="72" r="5" />
        <circle cx="50" cy="72" r="5" />
      </g>
    </>
  ),
  // Qo'shish
  plus: () => (
    <g stroke="#fff" strokeWidth="10" strokeLinecap="round">
      <path d="M50 26v48" />
      <path d="M26 50h48" />
    </g>
  ),
  // Hamyon — xarajatlar (ijara, svet, ish haqi)
  wallet: () => (
    <>
      <rect x="14" y="27" width="72" height="49" rx="11" fill="#fff" />
      <path d="M14 38h72v11H60a6.5 6.5 0 0 0 0 13h26v11H25a11 11 0 0 1-11-11Z" fill={INK_SOFT} opacity="0.45" />
      <rect x="57" y="43" width="33" height="17" rx="8.5" fill={INK} />
      <circle cx="70" cy="51.5" r="4.2" fill="#fff" />
    </>
  ),
};

// Har bir ikonkaning "tug'ma" rangi — color berilmasa shu ishlatiladi
const DEFAULT_COLOR: Record<string, IconColor> = {
  house: 'blue', people: 'teal', note: 'green', cart: 'orange', truck: 'amber',
  chart: 'purple', boxes: 'indigo', banknote: 'green', crown: 'yellow',
  employee: 'gray', gift: 'pink', gear: 'gray', scan: 'indigo', mic: 'red',
  card: 'indigo', globe: 'teal', logout: 'red', arrowDown: 'green', arrowUp: 'red',
  star: 'yellow', book: 'amber', search: 'teal', warning: 'orange', clock: 'orange',
  calendar: 'red', plus: 'green', wallet: 'pink',
};

// Eski nomlar bilan moslik
const ALIASES: Record<string, string> = {
  person: 'employee',
  personFill: 'employee',
  peopleFill: 'people',
  houseFill: 'house',
  cartFill: 'cart',
  box: 'boxes',
  cube: 'boxes',
  pencil: 'note',
  plusCircle: 'plus',
  camera: 'scan',
  check: 'star',
};

let uid = 0;

export function AppIcon({
  glyph,
  color,
  size = 30,
}: {
  glyph: string;
  color?: IconColor | string;
  size?: number;
}) {
  const name = ART[glyph] ? glyph : ALIASES[glyph] ?? 'boxes';
  const key = (color as IconColor) in PALETTE ? (color as IconColor) : DEFAULT_COLOR[name] ?? 'blue';
  const [from, to] = PALETTE[key];
  const id = `ic${uid++}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        flexShrink: 0,
        filter: `drop-shadow(0 ${size > 40 ? 1.5 : 0.8}px ${size > 40 ? 3 : 1.6}px rgba(0,0,0,0.13))`,
      }}
    >
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.17" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={SQUIRCLE} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <path d={SQUIRCLE} fill={`url(#${id}b)`} />
        <path d={SQUIRCLE} fill={`url(#${id}g)`} />
        <g transform="translate(50 50) scale(0.66) translate(-50 -50)">{ART[name](`${id}b`)}</g>
      </g>
      <path d={SQUIRCLE} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
    </svg>
  );
}

// Brend belgisi va nomi avtomatik yig'iladi (brand/build.mjs).
// Eski chaqiruvlar buzilmasin deb shu yerdan ham chiqariladi.
export { Logo, Wordmark } from './brand';
