import { useEffect, useState } from 'react';
import { api, getToken, logout, type Admin } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Shops from './pages/Shops';
import Payments from './pages/Payments';
import Reminders from './pages/Reminders';
import Referrals from './pages/Referrals';
import Settings from './pages/Settings';
import Admins from './pages/Admins';
import Logs from './pages/Logs';

type Page = 'dashboard' | 'shops' | 'payments' | 'reminders' | 'referrals' | 'settings' | 'admins' | 'logs';

const NAV: { id: Page; label: string; ico: string; superOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Panel', ico: '▦' },
  { id: 'shops', label: "Do'konlar", ico: '☗' },
  { id: 'payments', label: "To'lovlar", ico: '₴' },
  { id: 'reminders', label: 'Eslatmalar', ico: '✉' },
  { id: 'referrals', label: 'Referallar', ico: '★' },
  { id: 'settings', label: 'Sozlamalar', ico: '⚙' },
  { id: 'admins', label: 'Adminlar', ico: '☺', superOnly: true },
  { id: 'logs', label: 'Audit jurnali', ico: '≡' },
];

export default function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [page, setPage] = useState<Page>('dashboard');

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

  const nav = NAV.filter((n) => !n.superOnly || admin.role === 'super');

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">A</div>
          <div>
            <div className="brand-name">ARABIC.ONE</div>
            <div className="brand-sub">Admin panel</div>
          </div>
        </div>

        <nav className="nav">
          {nav.map((n) => (
            <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => setPage(n.id)}>
              <span className="ico">{n.ico}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="who">
            <b>@{admin.username}</b>
            <br />
            {admin.role === 'super' ? 'Super admin' : 'Admin'}
          </div>
          <button
            onClick={() => {
              logout();
              setAdmin(null);
            }}
          >
            Chiqish
          </button>
        </div>
      </aside>

      <main className="main">
        {page === 'dashboard' && <Dashboard onOpenShops={() => setPage('shops')} />}
        {page === 'shops' && <Shops />}
        {page === 'payments' && <Payments />}
        {page === 'reminders' && <Reminders />}
        {page === 'referrals' && <Referrals />}
        {page === 'settings' && <Settings />}
        {page === 'admins' && <Admins me={admin} />}
        {page === 'logs' && <Logs />}
      </main>
    </div>
  );
}
