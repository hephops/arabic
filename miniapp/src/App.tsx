import { useEffect, useState } from 'react';
import { api, fmt, getToken } from './api';
import { Glyph } from './icons';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Customers from './screens/Customers';
import AddDebt from './screens/AddDebt';
import Kassa from './screens/Kassa';
import Profile from './screens/Profile';
import Suppliers from './screens/Suppliers';
import Reports from './screens/Reports';
import Inventory from './screens/Inventory';

export type Tab = 'home' | 'customers' | 'add' | 'kassa' | 'profile';
export type SubScreen = 'suppliers' | 'reports' | 'inventory' | null;

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [sub, setSub] = useState<SubScreen>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (authed) api.me().then((s) => setBalance(s.balance)).catch(() => {});
  }, [authed, refreshKey, tab]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <>
      <div className="header">
        <div className="logo">A</div>
        <div style={{ flex: 1 }}>
          <div className="title">Arabic.One</div>
          <div className="subtitle">Do'kon Daftari</div>
        </div>
        {balance !== null && (
          <button className="chip" onClick={() => setTab('profile')} style={{ fontWeight: 700 }}>
            <Glyph name="banknote" size={15} color="var(--green)" strokeWidth={2} /> {fmt(balance)}
          </button>
        )}
      </div>

      {sub === 'suppliers' && <Suppliers onBack={() => setSub(null)} />}
      {sub === 'reports' && <Reports onBack={() => setSub(null)} />}
      {sub === 'inventory' && <Inventory onBack={() => setSub(null)} />}

      {!sub && tab === 'home' && (
        <Dashboard key={refreshKey} onOpenAdd={() => setTab('add')} onNavigate={setSub} />
      )}
      {!sub && tab === 'customers' && <Customers key={refreshKey} />}
      {!sub && tab === 'add' && (
        <AddDebt
          onDone={() => {
            refresh();
            setTab('home');
          }}
        />
      )}
      {!sub && tab === 'kassa' && <Kassa onDone={refresh} />}
      {!sub && tab === 'profile' && <Profile onLogout={() => setAuthed(false)} />}

      <nav className="tabbar">
        {(
          [
            ['home', 'house', 'houseFill', 'Bosh'],
            ['customers', 'people', 'peopleFill', 'Mijozlar'],
            ['add', 'plusCircle', 'plusCircleFill', 'Qarz'],
            ['kassa', 'cart', 'cartFill', 'Kassa'],
            ['profile', 'person', 'personFill', 'Profil'],
          ] as [Tab, string, string, string][]
        ).map(([id, glyph, glyphActive, label]) => (
          <button key={id} className={tab === id && !sub ? 'active' : ''} onClick={() => { setSub(null); setTab(id); }}>
            <Glyph name={tab === id ? glyphActive : glyph} size={25} />
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
