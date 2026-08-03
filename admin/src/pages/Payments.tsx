import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, type Payment } from '../api';

const TYPE_LABEL: Record<string, string> = { topup: "To'ldirish", subscription: 'Obuna' };

export default function Payments() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [type, setType] = useState('all');

  useEffect(() => {
    api.payments(type).then(setRows).catch(() => {});
  }, [type]);

  const topups = rows.filter((r) => r.amount > 0).reduce((a, b) => a + b.amount, 0);
  const spent = rows.filter((r) => r.amount < 0).reduce((a, b) => a - b.amount, 0);

  function exportCsv() {
    const head = ["Sana", "Do'kon", 'Telefon', 'Tur', 'Summa', 'Izoh'];
    const body = rows.map((r) => [
      r.created_at,
      r.shop_name ?? '',
      r.shop_phone ?? '',
      TYPE_LABEL[r.type] ?? r.type,
      String(r.amount),
      r.note ?? '',
    ]);
    const csv = [head, ...body].map((line) => line.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    // BOM — Excel kirill harflarini to'g'ri o'qishi uchun
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tolovlar.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-title">To'lovlar</div>
      <div className="page-sub">Balans to'ldirishlar va obuna yechimlari</div>

      <div className="cards">
        <div className="stat">
          <div className="k">Ko'rsatilgan to'ldirishlar</div>
          <div className="v green">{fmt(topups)}</div>
        </div>
        <div className="stat">
          <div className="k">Obunaga yechilgan</div>
          <div className="v accent">{fmt(spent)}</div>
        </div>
        <div className="stat">
          <div className="k">Yozuvlar soni</div>
          <div className="v">{fmtNum(rows.length)}</div>
        </div>
      </div>

      <div className="toolbar">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">Barchasi</option>
          <option value="topup">Faqat to'ldirish</option>
          <option value="subscription">Faqat obuna</option>
        </select>
        <button className="btn sm ghost" onClick={exportCsv} disabled={!rows.length}>
          CSV yuklab olish
        </button>
      </div>

      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Sana</th>
              <th>Do'kon</th>
              <th>Tur</th>
              <th>Izoh</th>
              <th className="num">Summa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted">{r.created_at.slice(0, 16).replace('T', ' ')}</td>
                <td>
                  <b>{r.shop_name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{r.shop_phone}</div>
                </td>
                <td>
                  <span className={`badge ${r.type === 'topup' ? 'ok' : 'premium'}`}>
                    {TYPE_LABEL[r.type] ?? r.type}
                  </span>
                </td>
                <td className="muted">{r.note}</td>
                <td className="num" style={{ color: r.amount >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {r.amount > 0 ? '+' : ''}
                  {fmtNum(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">To'lov yozuvlari yo'q</div>}
      </div>
    </>
  );
}
