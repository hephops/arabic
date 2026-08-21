import { useEffect, useState } from 'react';
import { api, getToken, type CatalogProduct, type Shop, type Announce } from './api';
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
import Expenses from './screens/Expenses';
import Orders from './screens/Orders';
import Returns from './screens/Returns';
import Catalog from './screens/Catalog';
import Ai from './screens/Ai';
import QuickActions from './QuickActions';
import InstallPrompt from './InstallPrompt';
import { ToastHost } from './toast';
import { Glyph } from './icons';
import { translate } from './i18n';
import { useT } from './i18n';
import { setBackButton, haptic } from './telegram';
import { setPerms, can, isOwner } from './perms';

export type Tab = 'home' | 'customers' | 'add' | 'kassa' | 'profile';
export type SubScreen = 'suppliers' | 'reports' | 'inventory' | 'reminders' | 'expenses' | 'orders' | 'returns' | 'catalog' | 'ai' | null;

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
  // Har bosishda o'sadi — bir xil ekranda turgan bo'lsa ham skaner
  // qaytadan ochilishi uchun oddiy bayroq yetmaydi
  const [scanNonce, setScanNonce] = useState(0);
  // Qaytarish ekraniga "+" dan kelindimi (skaner o'zi ochiladi) yoki
  // menyudan (oddiy ochiladi)
  const [returnsAutoScan, setReturnsAutoScan] = useState(false);
  // Katalogdan tanlangan tovar — kirim ekrani shu bilan ochiladi
  const [catalogPick, setCatalogPick] = useState<CatalogProduct | null>(null);
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
          // Ruxsatlar har ochilishda serverdan olinadi — ega ularni
          // o'zgartirsa xodim ilovani qayta ochishi bilan kuchga kiradi
          setPerms(s.employee ? s.employee.permissions : null);
          if (s.language && s.language !== lang) setLang(s.language as any);
        })
        .catch(() => {});
    }
  }, [authed]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  // Xodim sessiyasida narx, hisobot va sozlamalar bo'limlari ko'rinmaydi
  const isEmployee = !!shop?.employee;

  const refresh = () => setRefreshKey((k) => k + 1);

  // Yuguruvchi e'lon. Kimga ko'rinishi serverda emas, shu yerda hal
  // qilinadi: "faqat balansi tugaganlarga" degani do'konning holatiga
  // bog'liq, u esa /me dan keladi.
  const [announce, setAnnounce] = useState<Announce | null>(null);
  useEffect(() => {
    api.announce().then(setAnnounce).catch(() => {});
  }, []);
  const showAnnounce =
    announce?.enabled &&
    (announce.audience === 'all' ||
      (announce.audience === 'stopped' && shop?.service && !shop.service.active) ||
      (announce.audience === 'active' && shop?.service?.active));

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
      {/* E'lon menyu nomining TAGIDAN o'tadi — ekranni bosib qolmasin,
          lekin ko'zga tashlansin. Ichki ekranlarda ham ko'rinadi:
          do'konchi qayerda turganidan qat'i nazar xabarni olishi kerak. */}
      {showAnnounce && announce && (
        <div
          className="announce"
          style={{
            background: `linear-gradient(90deg, ${announce.bg1}, ${announce.bg2})`,
            color: announce.color,
            fontSize: `${announce.size}px`,
            fontWeight: announce.weight === 'bold' ? 700 : announce.weight === 'medium' ? 500 : 400,
          }}
        >
          <div className="announce-run" style={{ animationDuration: `${announce.speed}s` }}>
            {/* Matn ikki marta: birinchisi chetdan chiqib ketayotganda
                ikkinchisi kirib keladi, ya'ni uzilish ko'rinmaydi */}
            <span>{announce.text}</span>
            <span aria-hidden="true">{announce.text}</span>
          </div>
        </div>
      )}
      <ToastHost />
      <InstallPrompt />

      {/* Balans ogohlantirishi — har qanday ekranda ko'rinadi.
          Do'konchi to'satdan to'xtab qolmasligi uchun oldindan aytamiz;
          bosilsa to'g'ridan-to'g'ri to'ldirish ekraniga olib boradi. */}
      {shop?.service && (!shop.service.active || shop.service.low) && (
        <button
          className={`bal-warn ${shop.service.active ? '' : 'stop'}`}
          onClick={() => {
            setSub(null);
            setProfileView('balance');
            setProfileNav((n) => n + 1);
            setTab('profile');
          }}
        >
          <Glyph name="warning" size={16} color="#fff" />
          <span>
            {shop.service.active
              ? translate('balanceLowWarn').replace('{days}', String(shop.service.days_left))
              : translate('balanceStopWarn')}
          </span>
        </button>
      )}

      {sub === 'suppliers' && <Suppliers onBack={() => setSub(null)} />}
      {sub === 'reports' && <Reports onBack={() => setSub(null)} onOpenExpenses={() => setSub('expenses')} />}
      {sub === 'inventory' && <Inventory onBack={() => setSub(null)} />}
      {sub === 'reminders' && <Reminders onBack={() => setSub(null)} />}
      {sub === 'expenses' && <Expenses onBack={() => setSub(null)} />}
      {sub === 'orders' && <Orders onBack={() => setSub(null)} />}
      {sub === 'returns' && <Returns onBack={() => setSub(null)} autoScan={returnsAutoScan} />}
      {sub === 'ai' && <Ai onBack={() => setSub(null)} />}
      {sub === 'catalog' && (
        <Catalog
          onBack={() => setSub(null)}
          onPick={(p) => {
            // Katalogdan tanlangan tovar kirim ekranini to'ldiradi
            setCatalogPick(p);
            setKassaMode('intake');
            setSub(null);
            setTab('kassa');
          }}
        />
      )}

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
      {!sub && tab === 'kassa' && (
        <Kassa
          onDone={refresh}
          isEmployee={isEmployee}
          initialMode={kassaMode}
          autoScan={scanNonce}
          fromCatalog={catalogPick}
          onCatalogUsed={() => setCatalogPick(null)}
        />
      )}
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
            if (mode) setKassaMode(mode);
            if (target.sub) {
              // "+" dan kelingan — skaner o'zi ochilsin
              setReturnsAutoScan(!!target.scan);
              setSub(target.sub);
            } else {
              if (target.scan) setScanNonce((n) => n + 1);
              setSub(null);
              if (target.tab) setTab(target.tab);
            }
          }}
        />
      )}

      <Dock
        tab={tab}
        sub={sub}
        profileView={profileView}
        active={!sub}
        onNavigate={(target: NavTarget) => {
          // Menyudan kirilganda skaner ochilmaydi
          setReturnsAutoScan(false);
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
