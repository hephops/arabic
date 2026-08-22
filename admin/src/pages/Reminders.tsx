import { useEffect, useState } from 'react';
import { api, fmtNum, fmtPhone, type ReminderLog } from '../api';
import { AppIcon } from '../icons';
import { useEscape } from '../useEscape';

const CHANNEL_LABEL: Record<string, string> = {
  sms: 'SMS',
  call: "AI qo'ng'iroq",
  telegram: 'Telegram',
  push: 'Push',
};

const KIND_LABEL: Record<string, string> = {
  before: 'Muddatdan oldin',
  due: 'Bugun muddati',
  overdue: 'Kechikkan',
  call: "Qo'ng'iroq",
  after_call: "Qo'ng'iroqdan keyin (rekvizit)",
  receipt: 'Chek',
};

const CHANNEL_GLYPH: Record<string, string> = {
  sms: 'note', call: 'mic', telegram: 'send', push: 'calendar',
};

const STATUS_LABEL: Record<string, string> = {
  sent: 'Yuborildi', failed: 'Yuborilmadi', queued: 'Navbatda',
};

export default function Reminders() {
  const [rows, setRows] = useState<ReminderLog[]>([]);
  const [stats, setStats] = useState<{ channel: string; c: number }[]>([]);
  const [channel, setChannel] = useState('all');
  const [open, setOpen] = useState<ReminderLog | null>(null);
  useEscape(() => setOpen(null), !!open);

  useEffect(() => {
    api
      .reminders(channel)
      .then((r) => {
        setRows(r.rows);
        setStats(r.stats);
      })
      .catch(() => {});
  }, [channel]);

  return (
    <>

      <div className="cards">
        {stats.map((s) => (
          <div className="stat" key={s.channel}>
            <AppIcon glyph={CHANNEL_GLYPH[s.channel] ?? 'calendar'} size={38} />
            <div className="txt">
              <div className="k">{CHANNEL_LABEL[s.channel] ?? s.channel}</div>
              <div className="v">{fmtNum(s.c)}</div>
            </div>
          </div>
        ))}
        {stats.length === 0 && (
          <div className="stat">
            <AppIcon glyph="calendar" size={38} />
            <div className="txt">
              <div className="k">Yuborilgan</div>
              <div className="v">0</div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="filters">
          <div className="f">
            <label>Kanal</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">Barcha kanallar</option>
              <option value="sms">SMS</option>
              <option value="call">AI qo'ng'iroq</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sana</th>
              <th>Do'kon</th>
              <th>Qarzdor</th>
              <th>Kanal</th>
              <th>Turi</th>
              <th>Holat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                <td className="muted">{r.created_at.slice(0, 16).replace('T', ' ')}</td>
                <td>{r.shop_name}</td>
                <td>
                  {r.customer_name ?? '—'}
                  {r.customer_phone && <div className="cell-sub">{fmtPhone(r.customer_phone)}</div>}
                </td>
                <td>
                  <span className={`badge ${r.channel === 'call' ? 'business' : 'premium'}`}>
                    {CHANNEL_LABEL[r.channel] ?? r.channel}
                  </span>
                </td>
                <td className="muted">{r.kind ? KIND_LABEL[r.kind] ?? r.kind : '—'}</td>
                <td>
                  <span className={`badge ${r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'bad' : 'warn'}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Eslatma yuborilmagan</div>}
      </div>

      {open && (
        <div className="modal-wrap" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{CHANNEL_LABEL[open.channel] ?? open.channel}</h3>
            <div className="sub">
              {open.shop_name} → {open.customer_name ?? '—'} · {open.created_at.slice(0, 16).replace('T', ' ')}
            </div>
            <div className="panel" style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.5 }}>
              {open.payload || 'Matn saqlanmagan'}
            </div>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setOpen(null)}>
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
