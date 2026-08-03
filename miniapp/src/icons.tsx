// Apple (iOS) uslubidagi ikonkalar: Ionicons — SF Symbols'ga eng yaqin
// professional to'plam. Glyph — chiziqli ikonka; AppIcon — iOS ilovalari
// kabi gradientli kvadrat (squircle) fonda oq ikonka.

import type { IconType } from 'react-icons';
import {
  IoHomeOutline,
  IoHome,
  IoPeopleOutline,
  IoPeople,
  IoAdd,
  IoAddCircleOutline,
  IoAddCircle,
  IoCartOutline,
  IoCart,
  IoPersonOutline,
  IoPerson,
  IoMicOutline,
  IoCashOutline,
  IoCardOutline,
  IoBookOutline,
  IoWarningOutline,
  IoCalendarOutline,
  IoCubeOutline,
  IoTimeOutline,
  IoArrowDownOutline,
  IoArrowUpOutline,
  IoCheckmark,
  IoSearchOutline,
  IoScanOutline,
  IoPencil,
  IoSettingsOutline,
  IoChevronForward,
  IoStarOutline,
  IoGlobeOutline,
  IoLogOutOutline,
  IoCameraOutline,
  IoCloseOutline,
} from 'react-icons/io5';

const GLYPHS: Record<string, IconType> = {
  house: IoHomeOutline,
  houseFill: IoHome,
  people: IoPeopleOutline,
  peopleFill: IoPeople,
  plus: IoAdd,
  plusCircle: IoAddCircleOutline,
  plusCircleFill: IoAddCircle,
  cart: IoCartOutline,
  cartFill: IoCart,
  person: IoPersonOutline,
  personFill: IoPerson,
  mic: IoMicOutline,
  banknote: IoCashOutline,
  card: IoCardOutline,
  book: IoBookOutline,
  warning: IoWarningOutline,
  calendar: IoCalendarOutline,
  box: IoCubeOutline,
  clock: IoTimeOutline,
  arrowDown: IoArrowDownOutline,
  arrowUp: IoArrowUpOutline,
  check: IoCheckmark,
  search: IoSearchOutline,
  scan: IoScanOutline,
  pencil: IoPencil,
  gear: IoSettingsOutline,
  chevron: IoChevronForward,
  star: IoStarOutline,
  globe: IoGlobeOutline,
  logout: IoLogOutOutline,
  camera: IoCameraOutline,
  close: IoCloseOutline,
};

export function Glyph({
  name,
  size = 22,
  color = 'currentColor',
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number; // eski API bilan moslik uchun, Ionicons'da kerak emas
}) {
  const Icon = GLYPHS[name] ?? IoCubeOutline;
  return <Icon size={size} color={color} style={{ flexShrink: 0 }} />;
}

// iOS ilova ikonkasi uslubidagi gradientli kvadrat
const GRADIENTS: Record<string, [string, string]> = {
  blue: ['#4DA2FF', '#0A66F0'],
  green: ['#4CD964', '#1FA83C'],
  red: ['#FF6B5E', '#E0362A'],
  orange: ['#FFB340', '#F07800'],
  yellow: ['#FFD60A', '#E8A800'],
  purple: ['#C084FC', '#8B2FD6'],
  gray: ['#8E8E93', '#5A5A5E'],
  teal: ['#5AC8FA', '#0E9CC9'],
};

export function AppIcon({
  glyph,
  color,
  size = 30,
}: {
  glyph: string;
  color: keyof typeof GRADIENTS;
  size?: number;
}) {
  const [from, to] = GRADIENTS[color];
  const Icon = GLYPHS[glyph] ?? IoCubeOutline;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: `linear-gradient(180deg, ${from}, ${to})`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.6} color="#fff" />
    </span>
  );
}
