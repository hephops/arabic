import type { ReactNode } from 'react';
import { Glyph } from './icons';

// iOS navigatsiya paneli: 44px balandlik, markazda 17px sarlavha,
// chapda "‹ Orqaga", fon blur bilan yopishib turadi.

export function NavBar({
  title,
  onBack,
  backLabel = 'Orqaga',
  right,
}: {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <div className="navbar">
      <div className="nav-left">
        {onBack && (
          <button className="nav-btn" onClick={onBack}>
            <span style={{ display: 'inline-flex', transform: 'rotate(180deg)', marginRight: 1 }}>
              <Glyph name="chevron" size={19} />
            </span>
            {backLabel}
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
