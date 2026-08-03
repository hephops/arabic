import { useEffect, useState } from 'react';
import { api, fmt, logout, Shop, BalanceInfo, Employee } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader, EmptyState } from '../ui';
import { useT, LANG_NAMES, group, type Lang } from '../i18n';
import { formatCard, cardDigits, formatPhone, maskCard, formatAmount, amountValue } from '../format';

// iOS Sozlamalar uslubidagi kabinet: asosiy ekranda qatorlar,
// har biri o'z ichki ekraniga ochiladi.

type View = 'main' | 'balance' | 'plan' | 'shop' | 'language' | 'employees' | 'referral';



function Row({
  icon,
  color,
  label,
  value,
  danger,
  onClick,
}: {
  icon: string;
  color?: any;
  label: string;
  value?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="list-item" onClick={onClick}>
      <div className="lead">
        <AppIcon glyph={icon} color={color} size={29} />
        <div className="name" style={danger ? { color: 'var(--red)' } : undefined}>{label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {value && <span className="sub" style={{ marginTop: 0 }}>{value}</span>}
        <Glyph name="chevron" size={16} color="#c7c7cc" strokeWidth={2.2} />
      </div>
    </div>
  );
}

export default function Profile({
  onLogout,
  initialView = 'main',
  isEmployee = false,
}: {
  onLogout: () => void;
  initialView?: string;
  isEmployee?: boolean;
}) {
  const [view, setView] = useState<View>(initialView as View);
  const [shop, setShop] = useState<Shop | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const { t } = useT();

  async function load() {
    const me = await api.me();
    setShop(me);
    // Balans va tarif — faqat do'kon egasida
    if (!me.employee) setBalance(await api.balance());
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  if (!shop || (!isEmployee && !balance)) return <div className="screen empty">{t('loading')}</div>;
  const bal = balance!;

  // ── Sotuvchi ko'rinishi: faqat o'zi, til va chiqish ──
  if (isEmployee) {
    if (view === 'language') return <LanguageView shop={shop} onBack={() => setView('main')} reload={load} />;
    return (
      <div className="screen">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AppIcon glyph="employee" color="teal" size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{shop.employee?.name}</div>
            <div className="sub">{t('employeeMode')} · {shop.name}</div>
          </div>
        </div>

        <div className="list-group" style={{ marginTop: 14 }}>
          <Row
            icon="globe"
            label={t('navLanguage')}
            value={LANG_NAMES[shop.language as Lang] ?? shop.language}
            onClick={() => setView('language')}
          />
        </div>

        <p className="hint center">{t('employeeLimited')}</p>

        <div className="list-group">
          <Row icon="logout" label={t('logoutBtn')} danger onClick={() => { logout(); onLogout(); }} />
        </div>
      </div>
    );
  }

  const planTitle = shop.plan === 'free' ? t('planFree') : bal.plans[shop.plan]?.title ?? shop.plan;

  if (view === 'balance') return <BalanceView shop={shop} balance={bal} onBack={() => setView('main')} reload={load} />;
  if (view === 'plan') return <PlanView shop={shop} balance={bal} onBack={() => setView('main')} reload={load} />;
  if (view === 'shop') return <ShopView shop={shop} onBack={() => setView('main')} reload={load} />;
  if (view === 'language') return <LanguageView shop={shop} onBack={() => setView('main')} reload={load} />;
  if (view === 'employees') return <EmployeesView shopPhone={shop.phone} onBack={() => setView('main')} />;
  if (view === 'referral') return <ReferralView onBack={() => setView('main')} />;

  return (
    <div className="screen">
      {/* PROFIL SARLAVHASI — iOS'dagi Apple ID kartasi kabi */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => setView('shop')}>
        <div
          style={{
            width: 58, height: 58, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(180deg, #4da2ff, #0a66f0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 26, fontWeight: 800,
          }}
        >
          {shop.name.trim().charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{shop.name}</div>
          <div className="sub">{shop.owner_name ? `${shop.owner_name} · ` : ''}{formatPhone(shop.phone)}</div>
        </div>
        <Glyph name="chevron" size={16} color="#c7c7cc" strokeWidth={2.2} />
      </div>

      <div className="list-group" style={{ marginTop: 14 }}>
        <Row icon="banknote" label={t('navBalance')} value={fmt(shop.balance)} onClick={() => setView('balance')} />
        <Row icon="crown" label={t('navPlan')} value={planTitle} onClick={() => setView('plan')} />
      </div>

      <div className="list-group">
        <Row icon="house" label={t('shopInfo')} onClick={() => setView('shop')} />
        <Row icon="globe" label={t('navLanguage')} value={LANG_NAMES[shop.language as Lang] ?? shop.language} onClick={() => setView('language')} />
        <Row icon="card" label={t('cardNumber')} value={maskCard(shop.card_number) || t('notSet')} onClick={() => setView('shop')} />
      </div>

      <div className="list-group">
        <Row icon="employee" label={t('employees')} onClick={() => setView('employees')} />
        <Row icon="gift" label={t('inviteFriend')} onClick={() => setView('referral')} />
      </div>

      <div className="list-group">
        <Row icon="logout" label={t('logoutBtn')} danger onClick={() => { logout(); onLogout(); }} />
      </div>
    </div>
  );
}

function BalanceView({ shop, balance, onBack, reload }: { shop: Shop; balance: BalanceInfo; onBack: () => void; reload: () => void }) {
  const [amount, setAmount] = useState('');
  const { t } = useT();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function doTopup() {
    const value = amountValue(amount);
    if (!value) return;
    setError('');
    if (value < balance.min_topup) {
      setError(`${t('minAmount')}: ${fmt(balance.min_topup)}`);
      return;
    }
    try {
      await api.topup(value);
      setMessage(`${t('topup')}: +${fmt(value)}`);
      setAmount('');
      reload();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    }
  }

  return (
    <div className="screen">
      <SubHeader title={t('navBalance')} onBack={onBack} />
      <div className="card center" style={{ padding: '22px 16px' }}>
        <AppIcon glyph="banknote" size={52} />
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, margin: '10px 0 2px' }}>{fmt(shop.balance)}</div>
        <div className="hint">{t('balanceFrom')}</div>
      </div>

      <div className="section-title">{t('topup')}</div>
      <div className="card">
        <input value={formatAmount(amount)} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder={t('topupAmount')} />
        <p className="hint" style={{ marginTop: 0 }}>{t('minAmount')}: {fmt(balance.min_topup)}</p>
        <button className="btn-primary" onClick={doTopup} disabled={!amount}>
          {t('topupVia')}
        </button>
        {message && <p className="hint center">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {balance.transactions.length > 0 && (
        <>
          <div className="section-title">{t('history')}</div>
          <div className="list-group">
            {balance.transactions.map((t) => (
              <div className="list-item" key={t.id}>
                <div>
                  <div className="name">{t.note ?? t.type}</div>
                  <div className="sub">{t.created_at}</div>
                </div>
                <div className="amount" style={{ color: t.amount > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {t.amount > 0 ? '+' : ''}{fmt(t.amount)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PlanView({ shop, balance, onBack, reload }: { shop: Shop; balance: BalanceInfo; onBack: () => void; reload: () => void }) {
  const [message, setMessage] = useState('');
  const { t } = useT();
  const [error, setError] = useState('');

  async function doSubscribe(plan: 'premium' | 'business') {
    setError('');
    setMessage('');
    try {
      await api.subscribe(plan);
      setMessage(t('planActivated'));
      reload();
    } catch (e: any) {
      setError(e.message === 'insufficient_balance' ? t('insufficientBalance') : t('error') + ': ' + e.message);
    }
  }

  const FEATURES: Record<string, string[]> = {
    premium: ['planPremiumF1', 'planPremiumF2', 'planPremiumF3', 'planPremiumF4'],
    business: ['planBusinessF1', 'planBusinessF2', 'planBusinessF3', 'planBusinessF4', 'planBusinessF5'],
  };

  return (
    <div className="screen">
      <SubHeader title={t('navPlan')} onBack={onBack} />
      <div className="card center">
        <div className="hint">{t('currentPlan')}</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {shop.plan === 'free' ? t('planFree') : balance.plans[shop.plan]?.title}
        </div>
        {shop.plan_expires_at && <div className="hint">{shop.plan_expires_at}</div>}
      </div>

      {Object.entries(balance.plans).map(([id, p]) => (
        <div className="card" key={id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{p.title}</div>
            <div style={{ fontWeight: 700 }}>{group(p.price)} {t('currency')}/{t('monthly')}</div>
          </div>
          <ul style={{ margin: '8px 0 4px', paddingLeft: 4, listStyle: 'none' }}>
            {FEATURES[id]?.map((f) => (
              <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 14 }}>
                <Glyph name="check" size={15} color="var(--green)" strokeWidth={2.6} /> {t(f)}
              </li>
            ))}
          </ul>
          <button
            className={shop.plan === id ? 'btn-ghost' : 'btn-primary'}
            onClick={() => doSubscribe(id as 'premium' | 'business')}
          >
            {shop.plan === id ? t('planExtend') : t('planActivate')}
          </button>
        </div>
      ))}
      {message && <p className="hint center">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function ShopView({ shop, onBack, reload }: { shop: Shop; onBack: () => void; reload: () => void }) {
  const [form, setForm] = useState({
    name: shop.name ?? '',
    owner_name: shop.owner_name ?? '',
    card_number: shop.card_number ?? '',
    address: shop.address ?? '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { t } = useT();

  async function save() {
    setError('');
    try {
      await api.updateMe(form);
      setMessage(t('saved'));
      reload();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    }
  }

  const cardLen = cardDigits(form.card_number).length;
  const cardBad = cardLen > 0 && cardLen < 16;

  return (
    <div className="screen">
      <SubHeader title={t('shopInfo')} onBack={onBack} />

      <div className="form-group">
        <div className="form-row">
          <label>{t('shopName')}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-row">
          <label>{t('ownerName')}</label>
          <input
            value={form.owner_name}
            onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
            placeholder="Akbar aka"
          />
        </div>
        <div className="form-row">
          <label>{t('address')}</label>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Chilonzor, 5-kvartal"
          />
        </div>
      </div>

      <div className="form-group">
        <div className="form-row">
          <label>{t('setupCardShort')}</label>
          <input
            className={`mono ${cardBad ? 'bad' : ''}`}
            value={formatCard(form.card_number)}
            onChange={(e) => setForm({ ...form, card_number: formatCard(e.target.value) })}
            inputMode="numeric"
            placeholder="8600 0000 0000 0000"
          />
        </div>
        <p className="form-note">{t('setupCardHint')}</p>
      </div>

      <div className="form-group">
        <div className="form-row">
          <label>{t('phone')}</label>
          <input value={formatPhone(shop.phone)} disabled style={{ opacity: 0.5 }} />
        </div>
      </div>

      <button className="btn-primary btn-lg" onClick={save} disabled={cardBad || !form.name.trim()}>
        <Glyph name="check" size={19} color="#fff" /> {t('save')}
      </button>
      {cardBad && <p className="error center">{t('cardInvalid')}</p>}
      {message && <p className="hint center">{message}</p>}
      {error && <p className="error center">{error}</p>}
    </div>
  );
}

function LanguageView({ shop, onBack, reload }: { shop: Shop; onBack: () => void; reload: () => void }) {
  const { t, setLang } = useT();

  async function pick(lang: string) {
    setLang(lang as Lang);
    await api.updateMe({ language: lang } as any);
    reload();
    onBack();
  }

  return (
    <div className="screen">
      <SubHeader title={t('navLanguage')} onBack={onBack} />
      <div className="list-group">
        {Object.entries(LANG_NAMES).map(([id, label]) => (
          <div className="list-item" key={id} onClick={() => pick(id)}>
            <div className="name">{label}</div>
            {shop.language === id && <Glyph name="check" size={18} color="var(--accent)" strokeWidth={2.4} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmployeesView({ shopPhone, onBack }: { shopPhone: string; onBack: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const { t } = useT();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<Employee | null>(null);
  const [error, setError] = useState('');

  const load = () => api.employees().then(setEmployees).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setError('');
    if (!name.trim() || !/^\d{4}$/.test(pin)) {
      setError(t('pinRequired'));
      return;
    }
    await api.createEmployee({ name: name.trim(), pin });
    setName('');
    setPin('');
    setAdding(false);
    load();
  }

  // Xodim kartochkasi: PIN va kirish yo'riqnomasi shu yerda turadi,
  // ro'yxatda esa faqat ism va holat ko'rinadi.
  if (opened) {
    return (
      <EmployeeCard
        employee={opened}
        shopPhone={shopPhone}
        onBack={() => setOpened(null)}
        onChanged={async () => {
          await load();
          setOpened(null);
        }}
      />
    );
  }

  return (
    <div className="screen">
      <SubHeader title={t('navEmployees')} onBack={onBack} />
      <p className="hint">{t('employeesHint')}</p>

      {!adding ? (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Glyph name="plus" size={18} color="#fff" /> {t('addEmployee')}
        </button>
      ) : (
        <>
          <div className="form-group">
            <div className="form-row">
              <label>{t('name')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jasur" autoFocus />
            </div>
            <div className="form-row">
              <label>{t('pinCode')}</label>
              <input
                className="mono"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
              />
            </div>
          </div>
          <button className="btn-primary btn-lg" onClick={add}>
            <Glyph name="check" size={19} color="#fff" /> {t('save')}
          </button>
          <button className="btn-ghost" onClick={() => setAdding(false)}>{t('cancel')}</button>
          {error && <p className="error center">{error}</p>}
        </>
      )}
      {employees.length > 0 && (
        <div className="list-group" style={{ marginTop: 12 }}>
          {employees.map((e) => (
            <div className="list-item" key={e.id} onClick={() => setOpened(e)}>
              <div className="lead">
                <AppIcon glyph="employee" color={e.is_active ? 'teal' : 'gray'} size={30} />
                <div className="name">{e.name}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge ${e.is_active ? 'paid' : 'overdue'}`}>
                  {e.is_active ? t('employeeActive') : t('employeeBlocked')}
                </span>
                <Glyph name="chevron" size={15} color="#c7c7cc" />
              </div>
            </div>
          ))}
        </div>
      )}
      {employees.length === 0 && !adding && (
        <EmptyState icon="employee" title={t('noEmployees')} sub={t('noEmployeesSub')} />
      )}
    </div>
  );
}

/* ───────── Xodim kartochkasi: PIN va kirish yo'riqnomasi ───────── */

function EmployeeCard({
  employee,
  shopPhone,
  onBack,
  onChanged,
}: {
  employee: Employee;
  shopPhone: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useT();

  return (
    <div className="screen">
      <SubHeader title={employee.name} onBack={onBack} />

      <div className="card center" style={{ padding: '20px 16px' }}>
        <AppIcon glyph="employee" color={employee.is_active ? 'teal' : 'gray'} size={54} />
        <div style={{ fontSize: 19, fontWeight: 700, marginTop: 10 }}>{employee.name}</div>
        <div className="sub">
          {t('roleSeller')} · {employee.is_active ? t('employeeActive') : t('employeeBlocked')}
        </div>
      </div>

      {employee.pin && (
        <>
          <div className="section-title">{t('employeePin')}</div>
          <div className="pin-card">
            <div className="pin-value">{shown ? employee.pin : '••••'}</div>
            <div className="pin-actions">
              <button className="chip" onClick={() => setShown(!shown)}>
                {shown ? t('hidePin') : t('showPin')}
              </button>
              <button
                className="chip"
                onClick={() => {
                  navigator.clipboard?.writeText(employee.pin!);
                  setCopied(true);
                }}
              >
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="section-title">{t('employeeHowTo')}</div>
      <div className="card">
        <p className="hint" style={{ margin: 0 }}>
          {t('employeeHowToText').replace('{phone}', formatPhone(shopPhone))}
        </p>
      </div>

      <button
        className={`btn-primary btn-lg ${employee.is_active ? 'danger' : ''}`}
        onClick={() => api.updateEmployee(employee.id, { is_active: employee.is_active ? 0 : 1 }).then(onChanged)}
      >
        {employee.is_active ? t('block') : t('unblock')}
      </button>
    </div>
  );
}

function ReferralView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<{ code: string; invited_count: number; reward_text: string } | null>(null);
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referral().then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="screen empty">{t('loading')}</div>;

  const shareText = `Arabic.One — Do'kon Daftari ilovasiga qo'shiling! Promo-kodim: ${data.code}. ${data.reward_text}.`;

  return (
    <div className="screen">
      <SubHeader title={t('inviteFriend')} onBack={onBack} />
      <div className="card center" style={{ padding: '24px 16px' }}>
        <AppIcon glyph="gift" size={52} />
        <div className="hint" style={{ marginTop: 10 }}>{t('yourPromoCode')}</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 2 }}>{data.code}</div>
        <p className="hint">{data.reward_text}</p>
        <button
          className="btn-primary"
          onClick={() => {
            navigator.clipboard?.writeText(shareText);
            setCopied(true);
            const tg = (window as any).Telegram?.WebApp;
            tg?.openTelegramLink?.(
              `https://t.me/share/url?url=${encodeURIComponent('https://t.me/ArabicOneBot')}&text=${encodeURIComponent(shareText)}`
            );
          }}
        >
          {copied ? t('copied') : t('share')}
        </button>
      </div>
      <div className="card center">
        <div className="hint">{t('invitedCount')}</div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{data.invited_count} {t('shops')}</div>
      </div>
    </div>
  );
}
