import type { ReactNode } from 'react';
import { AppIcon, Glyph } from './icons';
import { useT } from './i18n';

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
export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <NavBar title={title} onBack={onBack} />;
}

// Ustki xulosa kartasi: ikonka, izoh va katta raqam
export function Summary({
  icon,
  label,
  value,
  color,
  right,
}: {
  icon: string;
  label: string;
  value: string;
  color?: string;
  right?: ReactNode;
}) {
  return (
    <div className="summary">
      <AppIcon glyph={icon} size={44} />
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
