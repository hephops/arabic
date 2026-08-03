import { useEffect, useState } from 'react';
import { api, fmt, Dashboard as DashboardData } from '../api';

export default function Dashboard({ onOpenAdd }: { onOpenAdd: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="screen error">Xatolik: {error}</div>;
  if (!data) return <div className="screen empty">Yuklanmoqda...</div>;

  return (
    <div className="screen">
      <div className="balance-row">
        <div className="card balance-card">
          <div className="label">Menga qarzdorlar</div>
          <div className="value green">{fmt(data.owed_to_me)}</div>
        </div>
        <div className="card balance-card">
          <div className="label">Men qarzdorman</div>
          <div className="value red">{fmt(data.i_owe)}</div>
        </div>
      </div>

      {data.overdue.length > 0 && (
        <>
          <div className="section-title">⚠️ Kechikkan qarzlar</div>
          {data.overdue.map((d) => (
            <div className="list-item" key={d.id}>
              <div>
                <div className="name">{d.customer_name}</div>
                <div className="sub">muddat: {d.due_date}</div>
              </div>
              <div className="amount" style={{ color: 'var(--red)' }}>
                {fmt(d.amount - d.paid_amount)}
              </div>
            </div>
          ))}
        </>
      )}

      {data.due_today.length > 0 && (
        <>
          <div className="section-title">📅 Bugun muddati keladi</div>
          {data.due_today.map((d) => (
            <div className="list-item" key={d.id}>
              <div className="name">{d.customer_name}</div>
              <div className="amount">{fmt(d.amount - d.paid_amount)}</div>
            </div>
          ))}
        </>
      )}

      {data.low_stock.length > 0 && (
        <>
          <div className="section-title">📦 Kam qolgan tovarlar</div>
          {data.low_stock.map((p) => (
            <div className="list-item" key={p.id}>
              <div className="name">{p.name}</div>
              <div className="amount" style={{ color: 'var(--yellow)' }}>
                {p.stock} {p.unit}
              </div>
            </div>
          ))}
        </>
      )}

      {data.expiring_soon.length > 0 && (
        <>
          <div className="section-title">⏳ Srogi yaqin</div>
          {data.expiring_soon.map((p) => (
            <div className="list-item" key={p.id}>
              <div className="name">{p.name}</div>
              <div className="sub">{p.expiry_date}</div>
            </div>
          ))}
        </>
      )}

      {data.overdue.length === 0 && data.due_today.length === 0 && (
        <div className="empty">Bugun muddati keladigan qarz yo'q 👍</div>
      )}

      <button className="fab-voice" onClick={onOpenAdd} title="Qarz qo'shish">
        🎤
      </button>
    </div>
  );
}
