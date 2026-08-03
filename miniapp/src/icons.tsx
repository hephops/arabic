// Apple uslubidagi ikonkalar: SF Symbols'ga o'xshash chiziqli glyph'lar
// va iOS ilovalari kabi gradientli kvadrat (squircle) fonlar. Hammasi qo'lda chizilgan SVG.

import type { ReactNode } from 'react';

const GLYPHS: Record<string, ReactNode> = {
  house: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20a.8.8 0 0 0 .8.8H10v-5.5a2 2 0 0 1 4 0v5.5h3.7a.8.8 0 0 0 .8-.8V9.5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.6a2.6 2.6 0 1 1 .8 5" />
      <path d="M17.5 14.3c2.1.4 3.5 2 3.5 4.2" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5.5v13M5.5 12h13" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4.5h2.2l2.4 11.3a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20.5 8H6" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20.5c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" />
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M5.8 12h.01M18.2 12h.01" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.5h19M6 15h4" />
    </>
  ),
  book: (
    <>
      <path d="M12 6c-1.8-1.6-4.5-2-8-2v14c3.5 0 6.2.4 8 2 1.8-1.6 4.5-2 8-2V4c-3.5 0-6.2.4-8 2Z" />
      <path d="M12 6v14" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 21 19.5H3L12 4Z" />
      <path d="M12 10v4M12 16.8v.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.8h17M8 3v3.5M16 3v3.5" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 8 12 3.8 20.5 8v8L12 20.2 3.5 16V8Z" />
      <path d="M3.5 8 12 12l8.5-4M12 12v8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2.5" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M12 4.5v13M6.5 12.5 12 18l5.5-5.5" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 19.5v-13M6.5 11.5 12 6l5.5 5.5" />
    </>
  ),
  check: (
    <>
      <path d="M5 12.5 10 17.5 19 7" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  pencil: (
    <>
      <path d="m14.5 5 4.5 4.5L8.5 20H4v-4.5L14.5 5Z" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
    </>
  ),
};

export function Glyph({ name, size = 22, color = 'currentColor', strokeWidth = 1.8 }: { name: string; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </svg>
  );
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

let gradientCounter = 0;

export function AppIcon({ glyph, color, size = 30 }: { glyph: string; color: keyof typeof GRADIENTS; size?: number }) {
  const [from, to] = GRADIENTS[color];
  const id = `grad-${color}-${glyph}-${gradientCounter++}`;
  const glyphSize = size * 0.62;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width={size} height={size} rx={size * 0.24} fill={`url(#${id})`} />
      <svg
        x={(size - glyphSize) / 2}
        y={(size - glyphSize) / 2}
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[glyph]}
      </svg>
    </svg>
  );
}
