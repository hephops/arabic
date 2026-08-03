import { useEffect, useState } from 'react';
import { api, fmtNum } from '../api';

type Row = { code: string; invited: number; inviter: string | null };

export default function Referrals() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    api.referrals().then(setRows).catch(() => {});
  }, []);

  const total = rows.reduce((a, b) => a + b.invited, 0);
  const max = Math.max(...rows.map((r) => r.invited), 1);

  return (
    <>
      <div className="page-title">Referallar</div>
      <div className="page-sub">Kim orqali qancha do'kon qo'shildi</div>

      <div className="cards">
        <div className="stat">
          <div className="k">Taklif orqali kelgan</div>
          <div className="v accent">{fmtNum(total)}</div>
        </div>
        <div className="stat">
          <div className="k">Faol taklifchilar</div>
          <div className="v">{fmtNum(rows.length)}</div>
        </div>
      </div>

      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Taklif qilgan</th>
              <th style={{ width: '45%' }}>Ulush</th>
              <th className="num">Do'kon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td><b>{r.code}</b></td>
                <td className="muted">{r.inviter ?? "noma'lum"}</td>
                <td>
                  <div style={{ background: '#eef0f3', borderRadius: 5, height: 8 }}>
                    <div
                      style={{
                        width: `${(r.invited / max) * 100}%`,
                        background: 'var(--accent)',
                        height: 8,
                        borderRadius: 5,
                      }}
                    />
                  </div>
                </td>
                <td className="num">{fmtNum(r.invited)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Hozircha referal yo'q</div>}
      </div>
    </>
  );
}
