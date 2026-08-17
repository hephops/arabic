import { useEffect, useState } from 'react';
import { AppIcon, Glyph } from './icons';
import { haptic } from './telegram';
import type { Tab, SubScreen } from './App';
import { useT } from './i18n';
import { onCartsChanged, openCartCount } from './carts';
import { toggleSide } from './sidebar';
import { api } from './api';
import { formatPhoneSoft } from './format';

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

const LAUNCHER_ITEMS: { key: string; glyph: string; color?: string; target: NavTarget }[] = [
  { key: 'tabHome', glyph: 'house', target: { tab: 'home' } },
  { key: 'tabCustomers', glyph: 'people', target: { tab: 'customers' } },
  { key: 'tabAdd', glyph: 'note', target: { tab: 'add' } },
  { key: 'tabKassa', glyph: 'cart', target: { tab: 'kassa' } },
  { key: 'navScanner', glyph: 'scan', target: { tab: 'kassa' } },
  { key: 'navSuppliers', glyph: 'truck', target: { sub: 'suppliers' } },
  { key: 'navOrders', glyph: 'boxes', target: { sub: 'orders' } },
  { key: 'navReturns', glyph: 'arrowDown', color: 'red', target: { sub: 'returns' } },
  { key: 'navReminders', glyph: 'calendar', target: { sub: 'reminders' } },
  { key: 'navReports', glyph: 'chart', target: { sub: 'reports' } },
  { key: 'navExpenses', glyph: 'wallet', target: { sub: 'expenses' } },
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
const SIDE_GROUPS: { key: string; glyph: string; color?: string; target: NavTarget }[][] = [
  [
    { key: 'tabHome', glyph: 'house', target: { tab: 'home' } },
    { key: 'tabCustomers', glyph: 'people', target: { tab: 'customers' } },
    { key: 'tabAdd', glyph: 'note', target: { tab: 'add' } },
    { key: 'tabKassa', glyph: 'cart', target: { tab: 'kassa' } },
  ],
  [
    { key: 'navInventory', glyph: 'boxes', target: { sub: 'inventory' } },
    { key: 'navSuppliers', glyph: 'truck', target: { sub: 'suppliers' } },
    { key: 'navOrders', glyph: 'boxes', target: { sub: 'orders' } },
    { key: 'navReturns', glyph: 'arrowDown', color: 'red', target: { sub: 'returns' } },
    { key: 'navReminders', glyph: 'calendar', target: { sub: 'reminders' } },
    { key: 'navReports', glyph: 'chart', target: { sub: 'reports' } },
    { key: 'navExpenses', glyph: 'wallet', target: { sub: 'expenses' } },
  ],
  [
    { key: 'navBalance', glyph: 'banknote', target: { tab: 'profile', profileView: 'balance' } },
    { key: 'navPlan', glyph: 'crown', target: { tab: 'profile', profileView: 'plan' } },
    { key: 'navEmployees', glyph: 'employee', target: { tab: 'profile', profileView: 'employees' } },
    { key: 'navSettings', glyph: 'gear', target: { tab: 'profile' } },
  ],
];

/** "Barcha bo'limlar" menyusi ilgari ochilganmi.
 *  Yozuvni saqlaymiz, chunki ishorat faqat o'rganguncha kerak —
 *  keyin u bezovta qiladi. */
const MENU_SEEN_KEY = 'arabic.menuSeen.v1';
const wasMenuSeen = () => {
  try {
    return localStorage.getItem(MENU_SEEN_KEY) === '1';
  } catch {
    return false; // maxfiy rejimda localStorage yopiq bo'lishi mumkin
  }
};
const markMenuSeen = () => {
  try {
    localStorage.setItem(MENU_SEEN_KEY, '1');
  } catch {
    /* saqlanmasa ham ishorat shu seansda to'xtaydi */
  }
};

export default function Dock({
  tab,
  sub,
  profileView = 'main',
  active,
  onNavigate,
}: {
  tab: Tab;
  sub?: SubScreen;
  profileView?: string;
  active: boolean;
  onNavigate: (t: NavTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  // Menyu bir marta ochilganmi — ochilmagan bo'lsa strelka sakrab turadi
  const [menuSeen, setMenuSeen] = useState(wasMenuSeen);
  const [deck, setDeck] = useState(false);   // kompyuterdagi pastki panel
  const { t } = useT();
  // Ochiq savatlar soni — qaysi bo'limda bo'lsa ham ko'rinib turadi
  const [openCarts, setOpenCarts] = useState(openCartCount);
  useEffect(() => onCartsChanged(() => setOpenCarts(openCartCount())), []);
  // Yordam kontaktlari admin panel sozlamalaridan keladi
  const [support, setSupport] = useState<{ phone: string; telegram: string }>({ phone: '', telegram: '' });
  useEffect(() => {
    api.support().then(setSupport).catch(() => {});
  }, []);

  const isActive = (target: NavTarget) =>
    target.sub
      ? sub === target.sub
      : !!target.tab && tab === target.tab && active && (target.profileView ?? 'main') === profileView;

  return (
    <>
      {/* Kompyuter uchun yon menyu — yig'ilganda faqat ikonkalar qoladi */}
      <nav className="side">
        <button className="side-brand" onClick={toggleSide} title="Menyu">
          <div className="side-logo">A</div>
          <div className="side-brand-text">
            <div className="side-name">Arabic.One</div>
            <div className="side-sub">{t('loginSubtitle')}</div>
          </div>
        </button>
        <div className="side-scroll">
          {SIDE_GROUPS.map((group, i) => (
            <div className="side-group" key={i}>
              {group.map((item) => (
                <button
                  key={item.key}
                  className={`side-item ${isActive(item.target) ? 'active' : ''}`}
                  onClick={() => onNavigate(item.target)}
                  title={t(item.key)}
                >
                  <AppIcon glyph={item.glyph} color={item.color} size={26} />
                  <span className="side-label">{t(item.key)}</span>
                  {item.target.tab === 'kassa' && openCarts > 0 && (
                    <span className="side-badge">{openCarts}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
        {(support.phone || support.telegram) && (
          <div className="side-foot">
            <div className="side-foot-title">
              <Glyph name="help" size={15} color="var(--muted)" />
              <span className="side-label">{t('techSupport')}</span>
            </div>
            {support.phone && (
              <a className="side-foot-row" href={`tel:${support.phone}`} title={support.phone}>
                <Glyph name="call" size={14} color="var(--muted)" />
                <span className="side-label">{formatPhoneSoft(support.phone) || support.phone}</span>
              </a>
            )}
            {support.telegram && (
              <a
                className="side-foot-row"
                href={`https://t.me/${support.telegram.replace(/^@/, '')}`}
                target="_blank"
                rel="noreferrer"
                title={support.telegram}
              >
                <Glyph name="send" size={14} color="var(--muted)" />
                <span className="side-label">{support.telegram}</span>
              </a>
            )}
          </div>
        )}
      </nav>

      {/* Kompyuterda pastdagi yashirin panel: chiziqcha bosilsa
          barcha bo'lim ikonkalari ko'tarilib chiqadi (macOS dock kabi) */}
      {deck && <div className="deck-backdrop" onClick={() => setDeck(false)} />}
      <div className={`deck ${deck ? 'open' : ''}`}>
        <div className="deck-items">
          {LAUNCHER_ITEMS.map((item) => (
            <button
              key={item.key}
              className="deck-item"
              title={t(item.key)}
              onClick={() => {
                setDeck(false);
                onNavigate(item.target);
              }}
            >
              <AppIcon glyph={item.glyph} color={item.color} size={44} />
              <span className="deck-tip">{t(item.key)}</span>
            </button>
          ))}
        </div>
        <button
          className="deck-handle"
          aria-label="Menyu"
          aria-expanded={deck}
          onClick={() => setDeck((v) => !v)}
        />
      </div>

      <div className="dock">
        {/* Barcha bo'limlarni ochadigan tutqich.
            Ilgari bu shunchaki kulrang chiziq edi — do'konchi uni bosish
            mumkinligini bilmasdi. Endi yonida yuqoriga qaragan strelka
            turadi va menyu hali bir marta ham ochilmagan bo'lsa sekin
            sakrab, "meni bos" deb turadi. Bir marta ochilgach tinchiydi. */}
        <button
          className={`dock-handle ${open ? 'open' : ''} ${menuSeen ? '' : 'hint'}`}
          aria-label={t('allSections')}
          aria-expanded={open}
          onClick={() => {
            haptic.tap();
            setOpen(true);
            markMenuSeen();
            setMenuSeen(true);
          }}
        >
          <span className="dh-line" />
          <span className="dh-arrow">
            <Glyph name="chevron" size={13} color="var(--accent)" strokeWidth={2.4} />
          </span>
        </button>
        {DOCK_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`dock-item ${tab === item.id && active ? 'active' : ''}`}
            onClick={() => onNavigate({ tab: item.id })}
          >
            <AppIcon glyph={item.glyph} size={46} />
            {item.id === 'kassa' && openCarts > 0 && <span className="nav-badge">{openCarts}</span>}
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
                <AppIcon glyph={item.glyph} color={item.color} size={58} />
                {t(item.key)}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
