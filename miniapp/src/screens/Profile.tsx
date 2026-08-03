import { useEffect, useState } from 'react';
import { api, fmt, logout, Shop, BalanceInfo } from '../api';
import { AppIcon, Glyph } from '../icons';

export default function Profile({ onLogout }: { onLogout: () => void }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [showTopup, setShowTopup] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', owner_name: '', card_number: '', address: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [me, bal] = await Promise.all([api.me(), api.balance()]);
    setShop(me);
    setBalance(bal);
    setForm({
      name: me.name ?? '',
      owner_name: me.owner_name ?? '',
      card_number: me.card_number ?? '',
      address: me.address ?? '',
    });
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function doTopup() {
    const amount = parseInt(topupAmount.replace(/\D/g, ''), 10);
    if (!amount) return;
    setError('');
    try {
      // DEV: darhol o'tadi. PROD: Payme/Click to'lov sahifasiga yo'naltiriladi.
      await api.topup(amount);
      setMessage(`Balans to'ldirildi: +${fmt(amount)}`);
      setShowTopup(false);
      setTopupAmount('');
      load();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    }
  }

  async function doSubscribe(plan: 'premium' | 'business') {
    setError('');
    setMessage('');
    try {
      await api.subscribe(plan);
      setMessage('Obuna faollashtirildi!');
      load();
    } catch (e: any) {
      setError(e.message === 'insufficient_balance' ? "Balansda mablag' yetarli emas — avval to'ldiring" : 'Xatolik: ' + e.message);
    }
  }

  async function saveProfile() {
    setError('');
    try {
      await api.updateMe(form);
      setMessage('Profil saqlandi');
      setEditing(false);
      load();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    }
  }

  if (!shop || !balance) return <div className="screen empty">Yuklanmoqda...</div>;

  const planTitle = shop.plan === 'free' ? 'Bepul' : balance.plans[shop.plan]?.title ?? shop.plan;

  return (
    <div className="screen">
      {/* BALANS */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AppIcon glyph="banknote" color="green" size={38} />
          <div style={{ flex: 1 }}>
            <div className="hint" style={{ margin: 0 }}>Balans</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>{fmt(shop.balance)}</div>
          </div>
          <button className="chip selected" onClick={() => setShowTopup(!showTopup)}>
            <Glyph name="plus" size={15} color="#fff" strokeWidth={2.2} /> To'ldirish
          </button>
        </div>
        {showTopup && (
          <div style={{ marginTop: 12 }}>
            <input
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              inputMode="numeric"
              placeholder="Summa (so'm)"
            />
            <div className="chip-row">
              {[50000, 99000, 199000, 500000].map((a) => (
                <button key={a} className="chip" onClick={() => setTopupAmount(String(a))}>
                  {new Intl.NumberFormat('uz-UZ').format(a)}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={doTopup}>
              To'ldirish (Payme / Click / Uzum)
            </button>
          </div>
        )}
      </div>

      {/* OBUNA */}
      <div className="card">
        <div className="hint" style={{ margin: '0 0 8px' }}>
          Tarif: <b style={{ color: 'var(--text)' }}>{planTitle}</b>
          {shop.plan_expires_at && ` · ${shop.plan_expires_at} gacha`}
        </div>
        <div className="chip-row" style={{ marginBottom: 0 }}>
          {Object.entries(balance.plans).map(([id, p]) => (
            <button
              key={id}
              className={`chip ${shop.plan === id ? 'selected' : ''}`}
              onClick={() => doSubscribe(id as 'premium' | 'business')}
            >
              {p.title} — {new Intl.NumberFormat('uz-UZ').format(p.price)}/oy
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Obuna haqi balansdan yechiladi (30 kun).</p>
      </div>

      {/* DO'KON PROFILI */}
      <div className="section-title">
        <AppIcon glyph="person" color="blue" size={22} /> Do'kon kabineti
      </div>
      {editing ? (
        <div className="card">
          <label>Do'kon nomi</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label>Ega ismi</label>
          <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Akbar aka" />
          <label>Karta raqami (qarzdorlarga SMS'da ko'rsatiladi)</label>
          <input value={form.card_number} onChange={(e) => setForm({ ...form, card_number: e.target.value })} inputMode="numeric" placeholder="8600 0000 0000 0000" />
          <label>Manzil</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Chilonzor, 5-kvartal" />
          <button className="btn-primary" onClick={saveProfile}>
            <Glyph name="check" size={18} color="#fff" strokeWidth={2.4} /> Saqlash
          </button>
          <button className="btn-ghost" onClick={() => setEditing(false)}>Bekor qilish</button>
        </div>
      ) : (
        <div className="list-group">
          <div className="list-item"><div className="sub">Do'kon</div><div className="name">{shop.name}</div></div>
          <div className="list-item"><div className="sub">Ega</div><div className="name">{shop.owner_name ?? '—'}</div></div>
          <div className="list-item"><div className="sub">Telefon</div><div className="name">{shop.phone}</div></div>
          <div className="list-item"><div className="sub">Karta</div><div className="name">{shop.card_number ?? '—'}</div></div>
          <div className="list-item" onClick={() => setEditing(true)}>
            <div className="name" style={{ color: 'var(--accent)' }}>Tahrirlash</div>
            <Glyph name="pencil" size={18} color="var(--accent)" />
          </div>
        </div>
      )}

      {/* BALANS TARIXI */}
      {balance.transactions.length > 0 && (
        <>
          <div className="section-title">
            <AppIcon glyph="clock" color="gray" size={22} /> Balans tarixi
          </div>
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

      {message && <p className="hint center">{message}</p>}
      {error && <p className="error">{error}</p>}

      <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => { logout(); onLogout(); }}>
        Chiqish
      </button>
    </div>
  );
}
