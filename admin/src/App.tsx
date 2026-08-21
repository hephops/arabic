import { useEffect, useState } from 'react';
import { api, getToken, logout, type Admin } from './api';
import { AppIcon, Glyph, Logo, Wordmark } from './icons';
import { toggleSide } from './sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Shops from './pages/Shops';
import Payments from './pages/Payments';
import Reminders from './pages/Reminders';
import Referrals from './pages/Referrals';
import Settings from './pages/Settings';
import Admins from './pages/Admins';
import Logs from './pages/Logs';
import Catalog from './pages/Catalog';

export type Page =
  | 'dashboard' | 'shops' | 'payments' | 'catalog' | 'reminders'
  | 'referrals' | 'settings' | 'admins' | 'logs';

interface NavItem {
  id: Page;
  label: string;
  glyph: string;
  sub: string;
  superOnly?: boolean;
}

// Bo'limlar guruhlab beriladi — do'kon ilovasidagi yon menyu kabi
const GROUPS: NavItem[][] = [
  [
    { id: 'dashboard', label: 'Panel', glyph: 'chart', sub: 'Tizimning umumiy holati' },
    { id: 'shops', label: "Do'konlar", glyph: 'house', sub: "Ro'yxatdan o'tgan do'konlar" },
    { id: 'payments', label: 'Balans', glyph: 'banknote', sub: "To'lovlar, kirim va chiqim" },
  ],
  [
    { id: 'catalog', label: 'Katalog', glyph: 'boxes', sub: "Markaziy tovarlar bazasi" },
    { id: 'reminders', label: 'Eslatmalar', glyph: 'calendar', sub: "SMS va qo'ng'iroqlar jurnali" },
    { id: 'referrals', label: 'Referallar', glyph: 'gift', sub: 'Taklif qilish natijalari' },
  ],
  [
    { id: 'settings', label: 'Sozlamalar', glyph: 'gear', sub: 'Narxlar va tizim parametrlari' },
    { id: 'admins', label: 'Adminlar', glyph: 'employee', sub: 'Panelga kirish huquqlari', superOnly: true },
    { id: 'logs', label: 'Audit jurnali', glyph: 'note', sub: 'Adminlar qilgan amallar' },
  ],
];

const ALL = GROUPS.flat();

export default function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [page, setPage] = useState<Page>('dashboard');
  const [deck, setDeck] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(setAdmin)
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="login-page" />;
  if (!admin) return <Login onLogin={setAdmin} />;

  const visible = (n: NavItem) => !n.superOnly || admin.role === 'super';
  const current = ALL.find((n) => n.id === page) ?? ALL[0];

  return (
    <div className="layout">
      {/* Chapdagi menyu — logoni bosib yig'iladi */}
      <nav className="side">
        <button className="side-brand" onClick={toggleSide} title="Menyu">
          <div className="side-logo"><Logo size={30} /></div>
          <div className="side-brand-text">
            <div className="side-name"><Wordmark /></div>
            <div className="side-sub">Admin panel</div>
          </div>
        </button>

        <div className="side-scroll">
          {GROUPS.map((group, i) => (
            <div className="side-group" key={i}>
              {group.filter(visible).map((n) => (
                <button
                  key={n.id}
                  className={`side-item ${page === n.id ? 'active' : ''}`}
                  onClick={() => setPage(n.id)}
                  title={n.label}
                >
                  <AppIcon glyph={n.glyph} size={26} />
                  <span className="side-label">{n.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="side-foot">
          <button
            className="side-out"
            title="Chiqish"
            onClick={() => {
              logout();
              setAdmin(null);
            }}
          >
            <Glyph name="logout" size={17} color="var(--red)" />
            <span className="side-label">Chiqish</span>
          </button>
        </div>
      </nav>

      {/* Pastdagi yashirin panel: chiziqcha bosilsa ikonkalar chiqadi */}
      {deck && <div className="deck-backdrop" onClick={() => setDeck(false)} />}
      <div className={`deck ${deck ? 'open' : ''}`}>
        <div className="deck-items">
          {ALL.filter(visible).map((n) => (
            <button
              key={n.id}
              className="deck-item"
              title={n.label}
              onClick={() => {
                setDeck(false);
                setPage(n.id);
              }}
            >
              <AppIcon glyph={n.glyph} size={44} />
              <span className="deck-tip">{n.label}</span>
            </button>
          ))}
        </div>
        <button className="deck-handle" aria-label="Menyu" onClick={() => setDeck((v) => !v)} />
      </div>

      <main className="main">
        <div className="topbar">
          <button className="side-toggle" onClick={toggleSide} aria-label="Menyu" title="Menyu">
            <Glyph name="menu" size={20} />
          </button>
          <div>
            <div className="topbar-title">{current.label}</div>
            <div className="topbar-sub">{current.sub}</div>
          </div>
          <div className="topbar-right">
            <div className="who-chip">
              <AppIcon glyph="person" size={30} />
              <div>
                <div className="nm">@{admin.username}</div>
                <div className="rl">{admin.role === 'super' ? 'Super admin' : 'Admin'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="page">
          {page === 'dashboard' && <Dashboard onOpenShops={() => setPage('shops')} />}
          {page === 'shops' && <Shops />}
          {page === 'payments' && <Payments />}
          {page === 'catalog' && <Catalog />}
          {page === 'reminders' && <Reminders />}
          {page === 'referrals' && <Referrals />}
          {page === 'settings' && <Settings />}
          {page === 'admins' && <Admins me={admin} />}
          {page === 'logs' && <Logs />}
        </div>
      </main>
    </div>
  );
}
