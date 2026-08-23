import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, fmtPhone, type AgentDetail, fmtWhen } from '../api';
import { AppIcon } from '../icons';

// Targ'ovchi xodimning O'Z sahifasi.
//
// Panelning qolgan bo'limlari unga yopiq (serverda ham: requireAdmin
// agent rolini kiritmaydi). Bu yerda faqat o'zi ulagan do'konlar,
// ishlab topgani va olgan puli ko'rinadi.

// Vaqt O'zbekiston mintaqasida ko'rsatiladi (api.ts: fmtWhen)
const when = fmtWhen;

export default function My() {
  const [data, setData] = useState<(AgentDetail & { bonus: number }) | null>(null);

  useEffect(() => {
    api.myAgent().then(setData).catch(() => {});
  }, []);

  const st = data?.stats;

  return (
    <>
      <div className="cards ai-cards">
        <Stat glyph="house" color="accent" k="Ulagan do'konlarim" v={fmtNum(st?.shops ?? 0)} sub={data ? `har biri uchun ${fmt(data.bonus)}` : ''} />
        <Stat glyph="banknote" color="green" k="Ishlab topganim" v={fmt(st?.earned ?? 0)} />
        <Stat glyph="card" color="indigo" k="Olganim" v={fmt(st?.paid ?? 0)} />
        <Stat glyph="wallet" color="yellow" k="Olishim kerak" v={fmt(st?.left ?? 0)} />
      </div>

      <div className="section-title">Ulagan do'konlarim</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Do'kon</th>
              <th>Egasi</th>
              <th>Telefon</th>
              <th className="num">Mukofot</th>
              <th>Ulangan sana</th>
            </tr>
          </thead>
          <tbody>
            {(data?.shops ?? []).map((s) => (
              <tr key={s.id}>
                <td className="cell-main">{s.name}</td>
                <td className="muted">{s.owner_name ?? '—'}</td>
                <td className="muted">{fmtPhone(s.phone)}</td>
                <td className="num">{fmt(s.agent_bonus ?? 0)}</td>
                <td className="muted">{when(s.agent_linked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.shops.length === 0 && (
          <div className="empty">
            Hali do'kon ulanmagan. Do'konchi chek yuborganda sizning raqamingizni yozsa,
            do'kon shu yerda paydo bo'ladi.
          </div>
        )}
      </div>

      <div className="section-title">Olgan pulim</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sana</th>
              <th className="num">Summa</th>
              <th>Izoh</th>
            </tr>
          </thead>
          <tbody>
            {(data?.payouts ?? []).map((p) => (
              <tr key={p.id}>
                <td className="muted">{p.paid_at ?? when(p.created_at)}</td>
                <td className="num"><b>{fmt(p.amount)}</b></td>
                <td className="muted">{p.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.payouts.length === 0 && <div className="empty">Hali to'lov bo'lmagan</div>}
      </div>
    </>
  );
}

function Stat({ glyph, color, k, v, sub }: { glyph: string; color: string; k: string; v: string; sub?: string }) {
  return (
    <div className="stat">
      <AppIcon glyph={glyph} size={38} />
      <div className="txt">
        <div className="k">{k}</div>
        <div className={`v ${color}`}>{v}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}
