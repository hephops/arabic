import { useEffect, useState } from 'react';
import { api, fmt, Report } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader } from '../ui';

type Period = 'day' | 'week' | 'month';
const PERIODS: [Period, string][] = [
  ['day', 'Bugun'],
  ['week', 'Hafta'],
  ['month', 'Oy'],
];

export default function Reports({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState<Period>('day');
  const [data, setData] = useState<Report | null>(null);

  useEffect(() => {
    api.reports(period).then(setData).catch(() => {});
  }, [period]);

  return (
    <div className="screen">
      <SubHeader title="Hisobotlar" onBack={onBack} />
      <div className="chip-row">
        {PERIODS.map(([id, label]) => (
          <button key={id} className={`chip ${period === id ? 'selected' : ''}`} onClick={() => setPeriod(id)}>
            {label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="empty">Yuklanmoqda...</div>
      ) : (
        <>
          <div className="balance-row">
            <div className="card balance-card">
              <AppIcon glyph="banknote" color="blue" />
              <div className="label">Savdo ({data.count} ta)</div>
              <div className="value">{fmt(data.revenue)}</div>
            </div>
            <div className="card balance-card">
              <AppIcon glyph="arrowUp" color="green" />
              <div className="label">Foyda</div>
              <div className="value green">{fmt(data.profit)}</div>
            </div>
          </div>

          <div className="section-title">
            <AppIcon glyph="card" color="purple" size={22} /> To'lov turlari
          </div>
          <div className="list-group">
            <div className="list-item">
              <div className="lead"><Glyph name="banknote" size={20} color="var(--green)" /><div className="name">Naqd</div></div>
              <div className="amount">{fmt(data.cash)}</div>
            </div>
            <div className="list-item">
              <div className="lead"><Glyph name="card" size={20} color="var(--accent)" /><div className="name">Karta</div></div>
              <div className="amount">{fmt(data.card)}</div>
            </div>
            <div className="list-item">
              <div className="lead"><Glyph name="book" size={20} color="var(--yellow)" /><div className="name">Qarzga</div></div>
              <div className="amount">{fmt(data.debt)}</div>
            </div>
          </div>

          {data.top_products.length > 0 && (
            <>
              <div className="section-title">
                <AppIcon glyph="star" color="orange" size={22} /> Eng ko'p sotilganlar
              </div>
              <div className="list-group">
                {data.top_products.map((p, i) => (
                  <div className="list-item" key={p.name}>
                    <div className="lead">
                      <span style={{ width: 22, fontWeight: 700, color: 'var(--muted)' }}>{i + 1}</span>
                      <div className="name">{p.name}</div>
                    </div>
                    <div>
                      <div className="amount">{p.sold} dona</div>
                      <div className="sub" style={{ textAlign: 'right' }}>{fmt(p.revenue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {data.count === 0 && <div className="empty">Bu davrda savdo bo'lmagan</div>}
        </>
      )}
    </div>
  );
}
