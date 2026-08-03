import { useEffect, useState } from 'react';
import { api, type AdminLog } from '../api';

const ACTION_LABEL: Record<string, string> = {
  login: 'Panelga kirdi',
  block_shop: "Do'konni bloklandi",
  unblock_shop: "Do'kon blokdan chiqarildi",
  grant_plan: 'Obuna berildi',
  adjust_balance: "Balans o'zgartirildi",
  set_setting: "Sozlama o'zgartirildi",
  create_admin: 'Admin yaratildi',
  update_admin: "Admin o'zgartirildi",
};

export default function Logs() {
  const [rows, setRows] = useState<AdminLog[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.logs().then(setRows).catch(() => {});
  }, []);

  const filtered = q
    ? rows.filter((r) =>
        `${r.username ?? ''} ${r.action} ${r.target ?? ''} ${r.details ?? ''}`.toLowerCase().includes(q.toLowerCase())
      )
    : rows;

  return (
    <>
      <div className="page-title">Audit jurnali</div>
      <div className="page-sub">Adminlarning barcha harakatlari yozib boriladi</div>

      <div className="toolbar">
        <input
          placeholder="Amal, admin yoki obyekt bo'yicha qidirish..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
      </div>

      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Sana</th>
              <th>Admin</th>
              <th>Amal</th>
              <th>Obyekt</th>
              <th>Tafsilot</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="muted">{r.created_at.slice(0, 16).replace('T', ' ')}</td>
                <td>{r.username ?? `#${r.admin_id}`}</td>
                <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                <td className="muted">{r.target ?? '—'}</td>
                <td className="muted">{r.details ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty">Yozuv yo'q</div>}
      </div>
    </>
  );
}
