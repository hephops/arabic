import { useEffect, useState } from 'react';
import { api, fmt, Customer, CustomerDetail } from '../api';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState('');

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
          ← Orqaga
        </button>
        <h2 style={{ margin: '14px 0 2px' }}>{selected.name}</h2>
        {selected.phone && <p className="hint">{selected.phone}</p>}
        <div className="card balance-card" style={{ margin: '12px 0' }}>
          <div className="label">Umumiy qarz</div>
          <div className="value red">{fmt(selected.balance)}</div>
        </div>
        <div className="section-title">Qarzlar tarixi</div>
        {selected.debts.map((d) => (
          <div key={d.id}>
            <div className="list-item" onClick={() => setPayFor(payFor === d.id ? null : d.id)}>
              <div>
                <div className="name">
                  {fmt(d.amount)}
                  <span className={`badge ${d.status}`}>
                    {d.status === 'paid' ? "to'langan" : d.status === 'overdue' ? 'kechikkan' : 'faol'}
                  </span>
                </div>
                <div className="sub">
                  {d.note ?? ''} {d.due_date ? `· muddat: ${d.due_date}` : ''}
                  {d.paid_amount > 0 && d.status !== 'paid' ? ` · to'landi: ${fmt(d.paid_amount)}` : ''}
                </div>
              </div>
            </div>
            {payFor === d.id && d.status !== 'paid' && (
              <div className="card">
                <label>To'lov summasi</label>
                <input
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  inputMode="numeric"
                  placeholder={String(d.amount - d.paid_amount)}
                />
                <button className="btn-primary" onClick={() => submitPayment(d.id)}>
                  To'lov qabul qilish
                </button>
              </div>
            )}
          </div>
        ))}
        {selected.debts.length === 0 && <div className="empty">Qarzlar yo'q</div>}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="section-title">Mijozlar</div>
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
      {customers.length === 0 && <div className="empty">Hozircha mijozlar yo'q</div>}
    </div>
  );
}
