import { useState } from 'react';
import { getToken } from './api';
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

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <>
      <div className="header">
        <div className="logo">A</div>
        <div>
          <div className="title">Arabic.One</div>
          <div className="subtitle">Do'kon Daftari</div>
        </div>
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
            ['home', 'house', 'Bosh'],
            ['customers', 'people', 'Mijozlar'],
            ['add', 'plus', 'Qarz'],
            ['kassa', 'cart', 'Kassa'],
            ['profile', 'person', 'Profil'],
          ] as [Tab, string, string][]
        ).map(([id, glyph, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <Glyph name={glyph} size={24} strokeWidth={tab === id ? 2.1 : 1.7} />
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
