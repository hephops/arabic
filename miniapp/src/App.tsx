import { useEffect, useState } from 'react';
import { api, fmt, getToken } from './api';
import { Glyph } from './icons';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Customers from './screens/Customers';
import AddDebt from './screens/AddDebt';
import Kassa from './screens/Kassa';
import Profile from './screens/Profile';

export type Tab = 'home' | 'customers' | 'add' | 'kassa' | 'profile';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
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

      {tab === 'home' && <Dashboard key={refreshKey} onOpenAdd={() => setTab('add')} />}
      {tab === 'customers' && <Customers key={refreshKey} />}
      {tab === 'add' && (
        <AddDebt
          onDone={() => {
            refresh();
            setTab('home');
          }}
        />
      )}
      {tab === 'kassa' && <Kassa onDone={refresh} />}
      {tab === 'profile' && <Profile onLogout={() => setAuthed(false)} />}

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
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <Glyph name={tab === id ? glyphActive : glyph} size={25} />
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
