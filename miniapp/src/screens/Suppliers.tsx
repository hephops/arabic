import { useEffect, useState } from 'react';
import { api, fmt, Supplier, SupplierDetail } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader } from '../ui';
import { useT } from '../i18n';

// "Men qarzdorman" — postavshiklar (ta'minotchilar) daftari

export default function Suppliers({ onBack }: { onBack: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<SupplierDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const [form, setForm] = useState({ name: '', amount: '', note: '', due: '' });
  const [error, setError] = useState('');
  const { t } = useT();

  const load = () => api.suppliers().then(setSuppliers).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const total = suppliers.reduce((s, x) => s + x.balance, 0);

  async function addDebt() {
    const amount = parseInt(form.amount.replace(/\D/g, ''), 10);
    if (!form.name.trim() || !amount) {
      setError(t('nameAmountRequiredShort'));
      return;
    }
    setError('');
    await api.createSupplierDebt({
      supplier_name: form.name.trim(),
      amount,
      note: form.note || undefined,
      due_date: form.due || undefined,
    });
    setForm({ name: '', amount: '', note: '', due: '' });
    setAdding(false);
    load();
  }

  async function pay(debtId: number) {
    const amount = parseInt(payAmount.replace(/\D/g, ''), 10);
    if (!amount) return;
    await api.paySupplierDebt(debtId, amount);
    setPayFor(null);
    setPayAmount('');
    if (selected) setSelected(await api.supplier(selected.id));
    load();
  }

  if (selected) {
    return (
      <div className="screen">
        <SubHeader title={selected.name} onBack={() => setSelected(null)} />
        <div className="card center">
          <div className="hint">{t('myDebt')}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>{fmt(selected.balance)}</div>
        </div>
        <div className="section-title">{t('debtHistory')}</div>
        <div className="list-group">
          {selected.debts.map((d) => (
            <div key={d.id}>
              <div className="list-item" onClick={() => setPayFor(payFor === d.id ? null : d.id)}>
                <div>
                  <div className="name">
                    {fmt(d.amount)}
                    <span className={`badge ${d.status}`}>
                      {d.status === 'paid' ? t('statusPaid') : d.status === 'overdue' ? t('statusOverdue') : t('statusActive')}
                    </span>
                  </div>
                  <div className="sub">
                    {d.note ?? ''} {d.due_date ? `· ${t('dueDate')}: ${d.due_date}` : ''}
                    {d.paid_amount > 0 && d.status !== 'paid' ? ` · ${t('paidLabel')}: ${fmt(d.paid_amount)}` : ''}
                  </div>
                </div>
              </div>
              {payFor === d.id && d.status !== 'paid' && (
                <div className="card">
                  <label>{t('paymentAmount')}</label>
                  <input
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    inputMode="numeric"
                    placeholder={String(d.amount - d.paid_amount)}
                  />
                  <button className="btn-primary" onClick={() => pay(d.id)}>
                    {t('markPaid')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {selected.debts.length === 0 && <div className="empty">{t('noDebts')}</div>}
      </div>
    );
  }

  return (
    <div className="screen">
      <SubHeader title={t('navSuppliers')} onBack={onBack} />
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AppIcon glyph="truck" size={44} />
        <div style={{ flex: 1 }}>
          <div className="hint" style={{ margin: 0 }}>{t('myTotalDebt')}</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(total)}</div>
        </div>
      </div>

      {!adding ? (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Glyph name="plus" size={18} color="#fff" /> {t('addSupplierDebt')}
        </button>
      ) : (
        <div className="card">
          <label>{t('supplierName')}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Anvar aka (ulgurji)" />
          <label>{t('amount')}</label>
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" placeholder="2 500 000" />
          <label>{t('whatGoods')}</label>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ichimliklar, shirinliklar..." />
          <label>{t('payDeadline')}</label>
          <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          <button className="btn-primary" onClick={addDebt}>
            <Glyph name="check" size={18} color="#fff" /> {t('save')}
          </button>
          <button className="btn-ghost" onClick={() => setAdding(false)}>{t('cancel')}</button>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      <div className="section-title">{t('navSuppliers')}</div>
      <div className="list-group">
        {suppliers.map((s) => (
          <div className="list-item" key={s.id} onClick={async () => setSelected(await api.supplier(s.id))}>
            <div className="lead">
              <AppIcon glyph="truck" size={30} />
              <div>
                <div className="name">{s.name}</div>
                {s.phone && <div className="sub">{s.phone}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="amount" style={{ color: s.balance > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(s.balance)}</span>
              <Glyph name="chevron" size={15} color="#c7c7cc" />
            </div>
          </div>
        ))}
      </div>
      {suppliers.length === 0 && <div className="empty">{t('noSuppliers')}</div>}
    </div>
  );
}
