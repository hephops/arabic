import { useEffect, useState } from 'react';
import { api, fmt, Customer, CustomerDetail } from '../api';
import { AppIcon, Glyph } from '../icons';
import { useT } from '../i18n';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const { t } = useT();

  const load = () => api.customers().then(setCustomers).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function openCustomer(id: number) {
    setSelected(await api.customer(id));
  }

  async function submitPayment(debtId: number) {
    const amount = parseInt(payAmount.replace(/\D/g, ''), 10);
    if (!amount) return;
    await api.payDebt(debtId, amount);
    setPayFor(null);
    setPayAmount('');
    if (selected) openCustomer(selected.id);
    load();
  }

  if (selected) {
    return (
      <div className="screen">
        <button className="btn-ghost" onClick={() => setSelected(null)}>
          ← {t('back')}
        </button>
        <h2 style={{ margin: '14px 0 2px' }}>{selected.name}</h2>
        {selected.phone && <p className="hint">{selected.phone}</p>}
        <div className="card balance-card" style={{ margin: '12px 0' }}>
          <div className="label">{t('totalDebt')}</div>
          <div className="value red">{fmt(selected.balance)}</div>
        </div>
        <div className="section-title">{t('debtHistory')}</div>
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
                <button className="btn-primary" onClick={() => submitPayment(d.id)}>
                  {t('acceptPayment')}
                </button>
              </div>
            )}
          </div>
        ))}
        {selected.debts.length === 0 && <div className="empty">{t('noDebts')}</div>}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="section-title">{t('tabCustomers')}</div>
      {!adding ? (
        <button className="btn-primary" style={{ marginBottom: 12 }} onClick={() => setAdding(true)}>
          <Glyph name="plus" size={18} color="#fff" /> {t('addCustomer')}
        </button>
      ) : (
        <div className="card">
          <label>{t('name')}</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Karim aka" />
          <label>{t('phoneForReminders')}</label>
          <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" />
          <button
            className="btn-primary"
            onClick={async () => {
              if (!newName.trim()) return;
              await api.createCustomer({ name: newName.trim(), phone: newPhone.trim() || undefined });
              setNewName('');
              setNewPhone('');
              setAdding(false);
              load();
            }}
          >
            <Glyph name="check" size={18} color="#fff" /> {t('save')}
          </button>
          <button className="btn-ghost" onClick={() => setAdding(false)}>{t('cancel')}</button>
        </div>
      )}
      <div className="list-group">
      {customers.map((c) => (
        <div className="list-item" key={c.id} onClick={() => openCustomer(c.id)}>
          <div>
            <div className="name">{c.name}</div>
            {c.phone && <div className="sub">{c.phone}</div>}
          </div>
          <div className="amount" style={{ color: c.balance > 0 ? 'var(--red)' : 'var(--green)' }}>
            {fmt(c.balance)}
          </div>
        </div>
      ))}
      </div>
      {customers.length === 0 && <div className="empty">{t('noCustomers')}</div>}
    </div>
  );
}
