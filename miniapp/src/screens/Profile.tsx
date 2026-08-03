import { useEffect, useState } from 'react';
import { api, fmt, logout, Shop, BalanceInfo } from '../api';
import { AppIcon, Glyph } from '../icons';

// iOS Sozlamalar uslubidagi kabinet: asosiy ekranda qatorlar,
// har biri o'z ichki ekraniga ochiladi.

type View = 'main' | 'balance' | 'plan' | 'shop' | 'language';

const LANGS: Record<string, string> = { uz: "O'zbekcha (lotin)", uz_cyrl: 'Ўзбекча (кирилл)', ru: 'Русский' };

function Row({
  icon,
  color,
  label,
  value,
  danger,
  onClick,
}: {
  icon: string;
  color: any;
  label: string;
  value?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="list-item" onClick={onClick}>
      <div className="lead">
        <AppIcon glyph={icon} color={color} size={30} />
        <div className="name" style={danger ? { color: 'var(--red)' } : undefined}>{label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {value && <span className="sub" style={{ marginTop: 0 }}>{value}</span>}
        <Glyph name="chevron" size={16} color="#c7c7cc" strokeWidth={2.2} />
      </div>
    </div>
  );
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '2px 0 12px' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', color: 'var(--accent)', display: 'flex', alignItems: 'center', fontSize: 16, padding: '4px 8px 4px 0' }}
      >
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
          <Glyph name="chevron" size={20} strokeWidth={2.2} />
        </span>
        Orqaga
      </button>
      <div style={{ fontSize: 17, fontWeight: 700, flex: 1, textAlign: 'center', marginRight: 70 }}>{title}</div>
    </div>
  );
}

export default function Profile({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<View>('main');
  const [shop, setShop] = useState<Shop | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);

  async function load() {
    const [me, bal] = await Promise.all([api.me(), api.balance()]);
    setShop(me);
    setBalance(bal);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  if (!shop || !balance) return <div className="screen empty">Yuklanmoqda...</div>;

  const planTitle = shop.plan === 'free' ? 'Bepul' : balance.plans[shop.plan]?.title ?? shop.plan;

  if (view === 'balance') return <BalanceView shop={shop} balance={balance} onBack={() => setView('main')} reload={load} />;
  if (view === 'plan') return <PlanView shop={shop} balance={balance} onBack={() => setView('main')} reload={load} />;
  if (view === 'shop') return <ShopView shop={shop} onBack={() => setView('main')} reload={load} />;
  if (view === 'language') return <LanguageView shop={shop} onBack={() => setView('main')} reload={load} />;

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
          <div className="sub">{shop.owner_name ? `${shop.owner_name} · ` : ''}{shop.phone}</div>
        </div>
        <Glyph name="chevron" size={16} color="#c7c7cc" strokeWidth={2.2} />
      </div>

      <div className="list-group" style={{ marginTop: 14 }}>
        <Row icon="banknote" color="green" label="Balans" value={fmt(shop.balance)} onClick={() => setView('balance')} />
        <Row icon="star" color="orange" label="Obuna" value={planTitle} onClick={() => setView('plan')} />
      </div>

      <div className="list-group">
        <Row icon="person" color="blue" label="Do'kon ma'lumotlari" onClick={() => setView('shop')} />
        <Row icon="globe" color="teal" label="Til" value={LANGS[shop.language] ?? shop.language} onClick={() => setView('language')} />
        <Row icon="card" color="purple" label="Karta raqami" value={shop.card_number ? '•• ' + shop.card_number.replace(/\s/g, '').slice(-4) : 'kiritilmagan'} onClick={() => setView('shop')} />
      </div>

      <div className="list-group">
        <Row icon="logout" color="red" label="Chiqish" danger onClick={() => { logout(); onLogout(); }} />
      </div>
    </div>
  );
}

function BalanceView({ shop, balance, onBack, reload }: { shop: Shop; balance: BalanceInfo; onBack: () => void; reload: () => void }) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function doTopup() {
    const value = parseInt(amount.replace(/\D/g, ''), 10);
    if (!value) return;
    setError('');
    try {
      await api.topup(value);
      setMessage(`Balans to'ldirildi: +${fmt(value)}`);
      setAmount('');
      reload();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    }
  }

  return (
    <div className="screen">
      <SubHeader title="Balans" onBack={onBack} />
      <div className="card center" style={{ padding: '22px 16px' }}>
        <AppIcon glyph="banknote" color="green" size={44} />
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, margin: '10px 0 2px' }}>{fmt(shop.balance)}</div>
        <div className="hint">Obuna haqi shu balansdan yechiladi</div>
      </div>

      <div className="section-title">To'ldirish</div>
      <div className="card">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Summa (so'm)" />
        <div className="chip-row">
          {[50000, 99000, 199000, 500000].map((a) => (
            <button key={a} className={`chip ${amount === String(a) ? 'selected' : ''}`} onClick={() => setAmount(String(a))}>
              {new Intl.NumberFormat('uz-UZ').format(a)}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={doTopup} disabled={!amount}>
          To'ldirish — Payme / Click / Uzum
        </button>
        {message && <p className="hint center">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {balance.transactions.length > 0 && (
        <>
          <div className="section-title">Tarix</div>
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
  const [error, setError] = useState('');

  async function doSubscribe(plan: 'premium' | 'business') {
    setError('');
    setMessage('');
    try {
      await api.subscribe(plan);
      setMessage('Obuna faollashtirildi!');
      reload();
    } catch (e: any) {
      setError(e.message === 'insufficient_balance' ? "Balansda mablag' yetarli emas — avval balansni to'ldiring" : 'Xatolik: ' + e.message);
    }
  }

  const FEATURES: Record<string, string[]> = {
    premium: ['Cheksiz qarz yozuvlari', 'Ovozli kiritish', 'SMS va Telegram eslatmalar', "AI qo'ng'iroq"],
    business: ['Premium hammasi', 'Ombor va kassa (POS)', 'Shtrix-kod skaneri', 'Xodimlar rejimi', 'AI biznes-maslahatchi'],
  };

  return (
    <div className="screen">
      <SubHeader title="Obuna" onBack={onBack} />
      <div className="card center">
        <div className="hint">Joriy tarif</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {shop.plan === 'free' ? 'Bepul' : balance.plans[shop.plan]?.title}
        </div>
        {shop.plan_expires_at && <div className="hint">{shop.plan_expires_at} gacha</div>}
      </div>

      {Object.entries(balance.plans).map(([id, p]) => (
        <div className="card" key={id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{p.title}</div>
            <div style={{ fontWeight: 700 }}>{new Intl.NumberFormat('uz-UZ').format(p.price)} so'm/oy</div>
          </div>
          <ul style={{ margin: '8px 0 4px', paddingLeft: 4, listStyle: 'none' }}>
            {FEATURES[id]?.map((f) => (
              <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 14 }}>
                <Glyph name="check" size={15} color="var(--green)" strokeWidth={2.6} /> {f}
              </li>
            ))}
          </ul>
          <button
            className={shop.plan === id ? 'btn-ghost' : 'btn-primary'}
            onClick={() => doSubscribe(id as 'premium' | 'business')}
          >
            {shop.plan === id ? 'Uzaytirish (30 kun)' : 'Faollashtirish'}
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

  async function save() {
    setError('');
    try {
      await api.updateMe(form);
      setMessage('Saqlandi');
      reload();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    }
  }

  return (
    <div className="screen">
      <SubHeader title="Do'kon ma'lumotlari" onBack={onBack} />
      <label>Do'kon nomi</label>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label>Ega ismi</label>
      <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Akbar aka" />
      <label>Karta raqami (qarzdorlarga SMS'da ko'rsatiladi)</label>
      <input value={form.card_number} onChange={(e) => setForm({ ...form, card_number: e.target.value })} inputMode="numeric" placeholder="8600 0000 0000 0000" />
      <label>Manzil</label>
      <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Chilonzor, 5-kvartal" />
      <label>Telefon</label>
      <input value={shop.phone} disabled style={{ opacity: 0.6 }} />
      <button className="btn-primary" onClick={save}>
        <Glyph name="check" size={18} color="#fff" strokeWidth={2.4} /> Saqlash
      </button>
      {message && <p className="hint center">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function LanguageView({ shop, onBack, reload }: { shop: Shop; onBack: () => void; reload: () => void }) {
  async function pick(lang: string) {
    await api.updateMe({ language: lang } as any);
    reload();
    onBack();
  }

  return (
    <div className="screen">
      <SubHeader title="Til" onBack={onBack} />
      <div className="list-group">
        {Object.entries(LANGS).map(([id, label]) => (
          <div className="list-item" key={id} onClick={() => pick(id)}>
            <div className="name">{label}</div>
            {shop.language === id && <Glyph name="check" size={18} color="var(--accent)" strokeWidth={2.4} />}
          </div>
        ))}
      </div>
    </div>
  );
}
