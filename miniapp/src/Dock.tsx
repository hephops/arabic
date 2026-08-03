import { useState } from 'react';
import { AppIcon, Glyph } from './icons';
import type { Tab, SubScreen } from './App';

// Suzuvchi dock + to'liq ekran menyu (launcher).
// Dock'dagi chiziqcha bosilsa — barcha bo'limlar grid bo'lib ochiladi.

export interface NavTarget {
  tab?: Tab;
  sub?: SubScreen;
  profileView?: string;
}

const DOCK_ITEMS: { id: Tab; glyph: string }[] = [
  { id: 'home', glyph: 'house' },
  { id: 'customers', glyph: 'people' },
  { id: 'add', glyph: 'note' },
  { id: 'kassa', glyph: 'cart' },
  { id: 'profile', glyph: 'gear' },
];

const LAUNCHER_ITEMS: { label: string; glyph: string; target: NavTarget }[] = [
  { label: 'Asosiy', glyph: 'house', target: { tab: 'home' } },
  { label: 'Mijozlar', glyph: 'people', target: { tab: 'customers' } },
  { label: 'Qarz yozish', glyph: 'note', target: { tab: 'add' } },
  { label: 'Kassa', glyph: 'cart', target: { tab: 'kassa' } },
  { label: 'Skaner', glyph: 'scan', target: { tab: 'kassa' } },
  { label: 'Postavshiklar', glyph: 'truck', target: { sub: 'suppliers' } },
  { label: 'Eslatmalar', glyph: 'calendar', target: { sub: 'reminders' } },
  { label: 'Hisobotlar', glyph: 'chart', target: { sub: 'reports' } },
  { label: 'Ombor', glyph: 'boxes', target: { sub: 'inventory' } },
  { label: 'Balans', glyph: 'banknote', target: { tab: 'profile', profileView: 'balance' } },
  { label: 'Obuna', glyph: 'crown', target: { tab: 'profile', profileView: 'plan' } },
  { label: 'Xodimlar', glyph: 'employee', target: { tab: 'profile', profileView: 'employees' } },
  { label: 'Taklif qilish', glyph: 'gift', target: { tab: 'profile', profileView: 'referral' } },
  { label: 'Do\'kon', glyph: 'card', target: { tab: 'profile', profileView: 'shop' } },
  { label: 'Til', glyph: 'globe', target: { tab: 'profile', profileView: 'language' } },
  { label: 'Sozlamalar', glyph: 'gear', target: { tab: 'profile' } },
];

export default function Dock({
  tab,
  active,
  onNavigate,
}: {
  tab: Tab;
  active: boolean;
  onNavigate: (t: NavTarget) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="dock">
        <button className="dock-handle" aria-label="Menyu" onClick={() => setOpen(true)} />
        {DOCK_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`dock-item ${tab === item.id && active ? 'active' : ''}`}
            onClick={() => onNavigate({ tab: item.id })}
          >
            <AppIcon glyph={item.glyph} size={46} />
            <span className="dot" />
          </button>
        ))}
      </div>

      {open && (
        <div className="launcher">
          <button className="launcher-close" onClick={() => setOpen(false)}>
            <Glyph name="close" size={20} color="#fff" />
          </button>
          <div className="launcher-grid">
            {LAUNCHER_ITEMS.map((item) => (
              <button
                key={item.label}
                className="launcher-item"
                onClick={() => {
                  setOpen(false);
                  onNavigate(item.target);
                }}
              >
                <AppIcon glyph={item.glyph} size={58} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
