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

const DOCK_ITEMS: { id: Tab; glyph: string; color: any }[] = [
  { id: 'home', glyph: 'house', color: 'blue' },
  { id: 'customers', glyph: 'people', color: 'teal' },
  { id: 'add', glyph: 'plus', color: 'green' },
  { id: 'kassa', glyph: 'cart', color: 'orange' },
  { id: 'profile', glyph: 'person', color: 'gray' },
];

const LAUNCHER_ITEMS: { label: string; glyph: string; color: any; target: NavTarget }[] = [
  { label: 'Asosiy', glyph: 'house', color: 'blue', target: { tab: 'home' } },
  { label: 'Mijozlar', glyph: 'people', color: 'teal', target: { tab: 'customers' } },
  { label: 'Qarz yozish', glyph: 'plus', color: 'green', target: { tab: 'add' } },
  { label: 'Kassa', glyph: 'cart', color: 'orange', target: { tab: 'kassa' } },
  { label: 'Postavshiklar', glyph: 'box', color: 'orange', target: { sub: 'suppliers' } },
  { label: 'Hisobotlar', glyph: 'star', color: 'purple', target: { sub: 'reports' } },
  { label: 'Ombor', glyph: 'search', color: 'teal', target: { sub: 'inventory' } },
  { label: 'Balans', glyph: 'banknote', color: 'green', target: { tab: 'profile', profileView: 'balance' } },
  { label: 'Obuna', glyph: 'star', color: 'yellow', target: { tab: 'profile', profileView: 'plan' } },
  { label: 'Xodimlar', glyph: 'people', color: 'gray', target: { tab: 'profile', profileView: 'employees' } },
  { label: 'Taklif qilish', glyph: 'star', color: 'red', target: { tab: 'profile', profileView: 'referral' } },
  { label: 'Sozlamalar', glyph: 'gear', color: 'gray', target: { tab: 'profile' } },
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
            <AppIcon glyph={item.glyph} color={item.color} size={44} />
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
                <AppIcon glyph={item.glyph} color={item.color} size={58} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
