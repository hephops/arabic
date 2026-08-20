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
        <div className="stat" onClick={onOpenShops} style={{ cursor: 'pointer' }}>
          <AppIcon glyph="check" size={38} />
          <div className="txt">
            <div className="k">Ishlayapti</div>
            <div className="v green">{fmtNum(s.active_shops)}</div>
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

      {/* Diqqat talab qiladiganlar: balansi tugayotgan va to'xtagan
          do'konlar. Bu ikkisi qo'ng'iroq qilish uchun ro'yxat. */}
      {(s.low_balance > 0 || s.stopped > 0) && (
        <div className="cards">
          <div className="stat" onClick={onOpenShops} style={{ cursor: 'pointer' }}>
            <AppIcon glyph="clock" size={38} />
            <div className="txt">
              <div className="k">Balansi tugayapti</div>
              <div className="v yellow">{fmtNum(s.low_balance)}</div>
            </div>
          </div>
          <div className="stat" onClick={onOpenShops} style={{ cursor: 'pointer' }}>
            <AppIcon glyph="warning" size={38} />
            <div className="txt">
              <div className="k">To'xtagan (balans tugagan)</div>
              <div className="v red">{fmtNum(s.stopped)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="cards">
        <div className="stat">
          <AppIcon glyph="banknote" size={38} />
          <div className="txt">
            <div className="k">Kunlik tushum</div>
            <div className="v green">{fmt(s.daily_income)}</div>
            <div className="sub">{fmt(s.daily_price)} x {fmtNum(s.active_shops)} do'kon</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="chart" size={38} />
          <div className="txt">
            <div className="k">30 kunda yechilgan</div>
            <div className="v">{fmt(s.month_earned)}</div>
            <div className="sub">haqiqiy tushum</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="card" size={38} />
          <div className="txt">
            <div className="k">30 kunda to'ldirildi</div>
            <div className="v">{fmt(s.month_topups)}</div>
            <div className="sub">jami {fmt(s.total_topups)}</div>
          </div>
        </div>
        <div className="stat">
          <AppIcon glyph="box" size={38} />
          <div className="txt">
            <div className="k">Balanslarda turibdi</div>
            <div className="v accent">{fmt(s.held_balance)}</div>
            <div className="sub">hali ishlatilmagan</div>
          </div>
        </div>
        {/* AI — bizning xarajatimiz. Tushumdan qancha ulush olayotgani
            ko'rinib tursin: kesh buzilsa raqam jimgina ikki barobar oshadi. */}
        <div className="stat">
          <AppIcon glyph="sparkle" size={38} />
          <div className="txt">
            <div className="k">AI xarajati (30 kun)</div>
            <div className="v red">{fmt(s.ai_cost_month)}</div>
            <div className="sub">
              bugun {fmt(s.ai_cost_today)} · {s.ai_shops} do'kon · keshdan {s.ai_cache_hit}%
              {s.ai_cache_hit > 0 && s.ai_cache_hit < 50 ? ' ⚠️' : ''}
            </div>
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
