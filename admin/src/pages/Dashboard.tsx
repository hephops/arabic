import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, type Stats } from '../api';
import { AppIcon } from '../icons';

export default function Dashboard({ onOpenShops }: { onOpenShops: () => void }) {
  const [s, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);

  if (!s) return <div className="empty">Yuklanmoqda...</div>;
  const max = Math.max(...s.signups.map((x) => x.count), 1);

  return (
    <>

      <div className="cards">
        <div className="stat" onClick={onOpenShops} style={{ cursor: 'pointer' }}>
          <AppIcon glyph="house" size={38} />
          <div className="txt">
            <div className="k">Jami do'konlar</div>
            <div className="v">{fmtNum(s.shops)}</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="crown" size={38} />
          <div className="txt">
            <div className="k">Faol obunalar</div>
            <div className="v green">{fmtNum(s.active_subs)}</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="people" size={38} />
          <div className="txt">
            <div className="k">Bugun ro'yxatdan o'tdi</div>
            <div className="v accent">{fmtNum(s.today_new)}</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="warning" size={38} />
          <div className="txt">
            <div className="k">Bloklangan</div>
            <div className="v red">{fmtNum(s.blocked)}</div>
          </div>
        </div>
      </div>

      <div className="cards">
        <div className="stat">
          <AppIcon glyph="banknote" size={38} />
          <div className="txt">
            <div className="k">Oylik tushum (MRR)</div>
            <div className="v green">{fmt(s.mrr)}</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="card" size={38} />
          <div className="txt">
            <div className="k">Oxirgi 30 kun to'ldirish</div>
            <div className="v">{fmt(s.month_topups)}</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="chart" size={38} />
          <div className="txt">
            <div className="k">Jami to'ldirish</div>
            <div className="v">{fmt(s.total_topups)}</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Ro'yxatdan o'tishlar — oxirgi 14 kun</div>
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
          <AppIcon glyph="note" size={38} />
          <div className="txt">
            <div className="k">Qarz yozuvlari</div>
            <div className="v">{fmtNum(s.debts)}</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="calendar" size={38} />
          <div className="txt">
            <div className="k">Yuborilgan eslatmalar</div>
            <div className="v">{fmtNum(s.reminders)}</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="mic" size={38} />
          <div className="txt">
            <div className="k">AI qo'ng'iroqlar</div>
            <div className="v accent">{fmtNum(s.calls)}</div>
          </div>
        </div>
      </div>
    </>
  );
}
