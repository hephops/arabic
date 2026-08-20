import type { ReactNode } from 'react';
import { AppIcon, Glyph } from './icons';
import { BASE } from './api';
import { useT, translate } from './i18n';
import { toggleSide } from './sidebar';

// iOS navigatsiya paneli: 44px balandlik, markazda 17px sarlavha,
// chapda "‹ Orqaga", fon blur bilan yopishib turadi.

export function NavBar({
  title,
  onBack,
  backLabel,
  right,
}: {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  const { t } = useT();
  const label = backLabel ?? t('back');
  return (
    <div className="navbar">
      <div className="nav-left">
        {/* Menyuni yig'ish/yoyish — faqat kompyuterda ko'rinadi */}
        <button className="side-toggle" onClick={toggleSide} aria-label="Menyu" title="Menyu">
          <Glyph name="menu" size={20} />
        </button>
        {onBack && (
          <button className="nav-btn" onClick={onBack}>
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)', marginRight: 1 }}>
              <Glyph name="chevron" size={19} />
            </span>
            {label}
          </button>
        )}
      </div>
      <div className="nav-title">{title}</div>
      <div className="nav-right">{right}</div>
    </div>
  );
}

// Eski nom bilan moslik
export function SubHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  /** o'ng tomondagi qo'shimcha tugma (masalan "tozalash") */
  right?: ReactNode;
}) {
  return <NavBar title={title} onBack={onBack} right={right} />;
}

// Ustki xulosa kartasi: ikonka, izoh va katta raqam
export function Summary({
  icon,
  iconColor,
  label,
  value,
  color,
  right,
}: {
  icon: string;
  /** ikonka rangi — qiymat rangiga mos kelishi uchun */
  iconColor?: string;
  label: string;
  value: string;
  color?: string;
  right?: ReactNode;
}) {
  return (
    <div className="summary">
      <AppIcon glyph={icon} color={iconColor} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="k">{label}</div>
        <div className="v" style={color ? { color } : undefined}>{value}</div>
      </div>
      {right}
    </div>
  );
}

// Bo'sh holat: quruq matn o'rniga ikonka, sarlavha va izoh
export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon: string;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <AppIcon glyph={icon} size={54} />
      <div className="t">{title}</div>
      {sub && <div className="s">{sub}</div>}
      {action}
    </div>
  );
}

// Bo'limlar orasida almashish (iOS segment boshqaruvi)
export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; icon?: string }[];
}) {
  return (
    <div className="segmented">
      {items.map((i) => (
        <button key={i.id} className={value === i.id ? 'on' : ''} onClick={() => onChange(i.id)}>
          {i.icon && <Glyph name={i.icon} size={15} />} {i.label}
        </button>
      ))}
    </div>
  );
}


/** Mahsulot rasmi — rasm bo'lmasa quti ikonkasi.
 *  Kassa, Ombor va bosh sahifadagi ro'yxatlar shu bittasidan foydalanadi,
 *  shunda ro'yxatlar bir xil ko'rinadi. */
export function ProductThumb({
  product,
  size = 44,
}: {
  product: { name: string; image_url?: string | null };
  size?: number;
}) {
  if (product.image_url) {
    return (
      <img
        src={`${BASE}${product.image_url}`}
        alt={product.name}
        style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return <AppIcon glyph="box" color="gray" size={size} />;
}

/**
 * Sana maydoni.
 *
 * Nega alohida komponent: iPhone'dagi sana tanlagichida "Сброс"
 * (tozalash) tugmasi bor va u bosilganda Safari React tinglayotgan
 * hodisani har doim ham yubormaydi. Natijada maydon ko'zga bo'shdek
 * ko'rinadi, holbuki dasturdagi qiymat eskiligicha qoladi va saqlashda
 * o'sha eski sana ketadi — sezish qiyin, oqibati esa jiddiy.
 *
 * Ikki himoya:
 *   1. onChange bilan birga onInput ham tinglanadi (brauzerlar ikkalasini
 *      har xil yuboradi);
 *   2. yonida o'zimizning "×" tugmasi — u hech qanday tizim tanlagichiga
 *      bog'liq emas va hamma joyda bir xil ishlaydi.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="date-field">
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
      {value && (
        <button className="date-clear" onClick={() => onChange('')} aria-label={translate('clear')}>
          <Glyph name="close" size={16} color="#8a8a8e" />
        </button>
      )}
    </div>
  );
}
