import { useState } from 'react';
import { AppIcon, Glyph } from './icons';
import { haptic } from './telegram';
import type { Tab, SubScreen } from './App';
import { useT } from './i18n';

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

const LAUNCHER_ITEMS: { key: string; glyph: string; target: NavTarget }[] = [
  { key: 'tabHome', glyph: 'house', target: { tab: 'home' } },
  { key: 'tabCustomers', glyph: 'people', target: { tab: 'customers' } },
  { key: 'tabAdd', glyph: 'note', target: { tab: 'add' } },
  { key: 'tabKassa', glyph: 'cart', target: { tab: 'kassa' } },
  { key: 'navScanner', glyph: 'scan', target: { tab: 'kassa' } },
  { key: 'navSuppliers', glyph: 'truck', target: { sub: 'suppliers' } },
  { key: 'navReminders', glyph: 'calendar', target: { sub: 'reminders' } },
  { key: 'navReports', glyph: 'chart', target: { sub: 'reports' } },
  { key: 'navInventory', glyph: 'boxes', target: { sub: 'inventory' } },
  { key: 'navBalance', glyph: 'banknote', target: { tab: 'profile', profileView: 'balance' } },
  { key: 'navPlan', glyph: 'crown', target: { tab: 'profile', profileView: 'plan' } },
  { key: 'navEmployees', glyph: 'employee', target: { tab: 'profile', profileView: 'employees' } },
  { key: 'navReferral', glyph: 'gift', target: { tab: 'profile', profileView: 'referral' } },
  { key: 'navShop', glyph: 'card', target: { tab: 'profile', profileView: 'shop' } },
  { key: 'navLanguage', glyph: 'globe', target: { tab: 'profile', profileView: 'language' } },
  { key: 'navSettings', glyph: 'gear', target: { tab: 'profile' } },
];

// Kompyuterda dock o'rniga chapda doimiy menyu turadi — sichqoncha bilan
// bir bosishda hamma bo'limga o'tish uchun. Qaysi biri ko'rinishini CSS hal qiladi.
const SIDE_GROUPS: { key: string; glyph: string; target: NavTarget }[][] = [
  [
    { key: 'tabHome', glyph: 'house', target: { tab: 'home' } },
    { key: 'tabCustomers', glyph: 'people', target: { tab: 'customers' } },
    { key: 'tabAdd', glyph: 'note', target: { tab: 'add' } },
    { key: 'tabKassa', glyph: 'cart', target: { tab: 'kassa' } },
  ],
  [
    { key: 'navInventory', glyph: 'boxes', target: { sub: 'inventory' } },
    { key: 'navSuppliers', glyph: 'truck', target: { sub: 'suppliers' } },
    { key: 'navReminders', glyph: 'calendar', target: { sub: 'reminders' } },
    { key: 'navReports', glyph: 'chart', target: { sub: 'reports' } },
  ],
  [
    { key: 'navBalance', glyph: 'banknote', target: { tab: 'profile', profileView: 'balance' } },
    { key: 'navPlan', glyph: 'crown', target: { tab: 'profile', profileView: 'plan' } },
    { key: 'navEmployees', glyph: 'employee', target: { tab: 'profile', profileView: 'employees' } },
    { key: 'navSettings', glyph: 'gear', target: { tab: 'profile' } },
  ],
];

export default function Dock({
  tab,
  sub,
  active,
  onNavigate,
}: {
  tab: Tab;
  sub?: SubScreen;
  active: boolean;
  onNavigate: (t: NavTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useT();

  const isActive = (target: NavTarget) =>
    target.sub ? sub === target.sub : !!target.tab && tab === target.tab && active && !target.profileView;

  return (
    <>
      {/* Kompyuter uchun yon menyu */}
      <nav className="side">
        <div className="side-brand">
          <div className="side-logo">A</div>
          <div>
            <div className="side-name">Arabic.One</div>
            <div className="side-sub">{t('loginSubtitle')}</div>
          </div>
        </div>
        {SIDE_GROUPS.map((group, i) => (
          <div className="side-group" key={i}>
            {group.map((item) => (
              <button
                key={item.key}
                className={`side-item ${isActive(item.target) ? 'active' : ''}`}
                onClick={() => onNavigate(item.target)}
              >
                <AppIcon glyph={item.glyph} size={26} />
                <span>{t(item.key)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="dock">
        <button className="dock-handle" aria-label="Menyu" onClick={() => { haptic.tap(); setOpen(true); }} />
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
                key={item.key}
                className="launcher-item"
                onClick={() => {
                  haptic.tap();
                  setOpen(false);
                  onNavigate(item.target);
                }}
              >
                <AppIcon glyph={item.glyph} size={58} />
                {t(item.key)}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
