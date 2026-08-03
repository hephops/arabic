import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, type Stats } from '../api';

export default function Dashboard({ onOpenShops }: { onOpenShops: () => void }) {
  const [s, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);

  if (!s) return <div className="empty">Yuklanmoqda...</div>;
  const max = Math.max(...s.signups.map((x) => x.count), 1);

  return (
    <>
      <div className="page-title">Panel</div>
      <div className="page-sub">Tizimning umumiy holati</div>

      <div className="cards">
        <div className="stat" onClick={onOpenShops} style={{ cursor: 'pointer' }}>
          <div className="k">Jami do'konlar</div>
          <div className="v">{fmtNum(s.shops)}</div>
        </div>
        <div className="stat">
          <div className="k">Faol obunalar</div>
          <div className="v green">{fmtNum(s.active_subs)}</div>
        </div>
        <div className="stat">
          <div className="k">Bugun ro'yxatdan o'tdi</div>
          <div className="v accent">{fmtNum(s.today_new)}</div>
        </div>
        <div className="stat">
          <div className="k">Bloklangan</div>
          <div className="v red">{fmtNum(s.blocked)}</div>
        </div>
      </div>

      <div className="cards">
        <div className="stat">
          <div className="k">Oylik tushum (MRR)</div>
          <div className="v green">{fmt(s.mrr)}</div>
        </div>
        <div className="stat">
          <div className="k">Oxirgi 30 kun to'ldirish</div>
          <div className="v">{fmt(s.month_topups)}</div>
        </div>
        <div className="stat">
          <div className="k">Jami to'ldirish</div>
          <div className="v">{fmt(s.total_topups)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Ro'yxatdan o'tishlar — oxirgi 14 kun</h3>
        <div className="chart">
          {s.signups.map((d) => (
            <div className="col" key={d.day} title={`${d.day}: ${d.count}`}>
              <div className="bar" style={{ height: `${Math.max(2, (d.count / max) * 88)}px` }} />
              <div className="lbl">{d.day.slice(8)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="cards">
        <div className="stat">
          <div className="k">Qarz yozuvlari</div>
          <div className="v">{fmtNum(s.debts)}</div>
        </div>
        <div className="stat">
          <div className="k">Yuborilgan eslatmalar</div>
          <div className="v">{fmtNum(s.reminders)}</div>
        </div>
        <div className="stat">
          <div className="k">AI qo'ng'iroqlar</div>
          <div className="v accent">{fmtNum(s.calls)}</div>
        </div>
      </div>
    </>
  );
}
