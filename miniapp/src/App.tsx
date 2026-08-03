import { useEffect, useState } from 'react';
import { api, getToken, type Shop } from './api';
import Dock, { NavTarget } from './Dock';
import { NavBar } from './ui';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Customers from './screens/Customers';
import AddDebt from './screens/AddDebt';
import Kassa from './screens/Kassa';
import Profile from './screens/Profile';
import Suppliers from './screens/Suppliers';
import Reports from './screens/Reports';
import Inventory from './screens/Inventory';
import Reminders from './screens/Reminders';
import QuickActions from './QuickActions';
import InstallPrompt from './InstallPrompt';
import { ToastHost } from './toast';
import { useT } from './i18n';
import { setBackButton, haptic } from './telegram';

export type Tab = 'home' | 'customers' | 'add' | 'kassa' | 'profile';
export type SubScreen = 'suppliers' | 'reports' | 'inventory' | 'reminders' | null;

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [sub, setSub] = useState<SubScreen>(null);
  const [profileView, setProfileView] = useState<string>('main');
  const [shop, setShop] = useState<Shop | null>(null);
  const { t, lang, setLang } = useT();

  // Telegram'ning o'z "orqaga" tugmasi ichki ekranlarda ko'rinadi
  useEffect(() => {
    setBackButton(sub ? () => setSub(null) : null);
    return () => setBackButton(null);
  }, [sub]);

  // Do'kon profilidagi til ilovaga qo'llanadi
  useEffect(() => {
    if (authed) {
      api
        .me()
        .then((s) => {
          setShop(s);
          if (s.language && s.language !== lang) setLang(s.language as any);
        })
        .catch(() => {});
    }
  }, [authed]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  // Xodim sessiyasida narx, hisobot va sozlamalar bo'limlari ko'rinmaydi
  const isEmployee = !!shop?.employee;

  const refresh = () => setRefreshKey((k) => k + 1);

  const TITLES: Record<Tab, string> = {
    home: t('tabHome'),
    customers: t('tabCustomers'),
    add: t('tabAdd'),
    kassa: t('tabKassa'),
    profile: t('tabProfile'),
  };

  return (
    <>
      {/* Ichki ekranlar o'z navigatsiya panelini chizadi */}
      {!sub && <NavBar title={TITLES[tab]} />}
      <ToastHost />
      <InstallPrompt />

      {sub === 'suppliers' && <Suppliers onBack={() => setSub(null)} />}
      {sub === 'reports' && <Reports onBack={() => setSub(null)} />}
      {sub === 'inventory' && <Inventory onBack={() => setSub(null)} />}
      {sub === 'reminders' && <Reminders onBack={() => setSub(null)} />}

      {!sub && tab === 'home' && (
        <Dashboard key={refreshKey} onNavigate={setSub} isEmployee={isEmployee} employeeName={shop?.employee?.name} />
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
      {!sub && tab === 'kassa' && <Kassa onDone={refresh} isEmployee={isEmployee} />}
      {!sub && tab === 'profile' && (
        <Profile
          key={profileView + refreshKey}
          initialView={profileView}
          isEmployee={isEmployee}
          onLogout={() => {
            setShop(null);
            setAuthed(false);
          }}
        />
      )}

      {!sub && (
        <QuickActions
          onPick={(target) => {
            setSub(null);
            setTab(target);
          }}
        />
      )}

      <Dock
        tab={tab}
        active={!sub}
        onNavigate={(target: NavTarget) => {
          setSub(target.sub ?? null);
          if (target.tab) setTab(target.tab);
          setProfileView(target.profileView ?? 'main');
        }}
      />
    </>
  );
}
