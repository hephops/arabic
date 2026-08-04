import { useEffect, useState } from 'react';
import { api, getToken, type Shop } from './api';
import Dock, { NavTarget } from './Dock';
import { NavBar } from './ui';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Customers from './screens/Customers';
import AddDebt from './screens/AddDebt';
import Kassa, { type KassaMode } from './screens/Kassa';
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
  // Menyudan Profilning ichki bo'limiga o'tilganda ekran qaytadan ochiladi;
  // ichkarida yurilganda esa qayta yuklanmaydi (shu sababli alohida hisoblagich)
  const [profileNav, setProfileNav] = useState(0);
  const [shop, setShop] = useState<Shop | null>(null);
  const [kassaMode, setKassaMode] = useState<KassaMode>('sale');
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
    <div className="app-shell">
      {/* Ichki ekranlar o'z navigatsiya panelini chizadi — bu yerda
          ikkinchi panel chiqib qolmasligi uchun ularni chetlab o'tamiz */}
      {!sub && !(tab === 'profile' && profileView !== 'main') && <NavBar title={TITLES[tab]} />}
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
      {!sub && tab === 'kassa' && <Kassa onDone={refresh} isEmployee={isEmployee} initialMode={kassaMode} />}
      {!sub && tab === 'profile' && (
        <Profile
          key={`${profileNav}-${refreshKey}`}
          initialView={profileView}
          isEmployee={isEmployee}
          onViewChange={setProfileView}
          onLogout={() => {
            setShop(null);
            setAuthed(false);
          }}
        />
      )}

      {!sub && (
        <QuickActions
          onPick={(target, mode) => {
            setSub(null);
            if (mode) setKassaMode(mode);
            setTab(target);
          }}
        />
      )}

      <Dock
        tab={tab}
        sub={sub}
        profileView={profileView}
        active={!sub}
        onNavigate={(target: NavTarget) => {
          setSub(target.sub ?? null);
          if (target.tab === 'kassa') setKassaMode('sale');
          if (target.tab) setTab(target.tab);
          setProfileView(target.profileView ?? 'main');
          setProfileNav((n) => n + 1);
        }}
      />
    </div>
  );
}
