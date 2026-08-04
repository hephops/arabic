import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, type Shop, type ShopDetail, fmtPhone } from '../api';

const PLAN_LABEL: Record<string, string> = { free: 'Bepul', premium: 'Premium', business: 'Biznes' };

export default function Shops() {
  const [rows, setRows] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('all');
  const [selected, setSelected] = useState<ShopDetail | null>(null);

  function load() {
    api.shops({ q, plan }).then((r) => {
      setRows(r.rows);
      setTotal(r.total);
    });
  }

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, plan]);

  return (
    <>
      <div className="page-title">Do'konlar</div>
      <div className="page-sub">Jami: {fmtNum(total)}</div>

      <div className="toolbar">
        <input
          placeholder="Nomi, telefoni yoki ega ismi bo'yicha qidirish..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="all">Barcha tariflar</option>
          <option value="free">Bepul</option>
          <option value="premium">Premium</option>
          <option value="business">Biznes</option>
        </select>
      </div>

      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Do'kon</th>
              <th>Telefon</th>
              <th>Tarif</th>
              <th className="num">Balans</th>
              <th className="num">Mijoz</th>
              <th className="num">Qarz</th>
              <th>Ro'yxatdan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="clickable" onClick={async () => setSelected(await api.shop(s.id))}>
                <td>
                  <b>{s.name}</b>
                  {s.owner_name && <span className="muted"> · {s.owner_name}</span>}
                  {!!s.is_blocked && <span className="badge blocked" style={{ marginLeft: 6 }}>bloklangan</span>}
                </td>
                <td className="muted">{fmtPhone(s.phone)}</td>
                <td>
                  <span className={`badge ${s.plan}`}>{PLAN_LABEL[s.plan] ?? s.plan}</span>
                  {s.plan_expires_at && <div className="muted" style={{ fontSize: 12 }}>{s.plan_expires_at}</div>}
                </td>
                <td className="num">{fmtNum(s.balance)}</td>
                <td className="num">{s.customers_count ?? 0}</td>
                <td className="num">{s.debts_count ?? 0}</td>
                <td className="muted">{s.created_at.slice(0, 10)}</td>
                <td className="num">›</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Do'kon topilmadi</div>}
      </div>

      {selected && <ShopModal shop={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </>
  );
}

function ShopModal({
  shop,
  onClose,
  onChanged,
}: {
  shop: ShopDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState(shop);
  const [msg, setMsg] = useState('');
  const [grantPlan, setGrantPlan] = useState('premium');
  const [grantDays, setGrantDays] = useState('30');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  async function reload() {
    setData(await api.shop(shop.id));
    onChanged();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{data.name}</h3>
        <div className="sub">
          {fmtPhone(data.phone)} {data.owner_name && `· ${data.owner_name}`}
          {data.telegram_user_id ? ' · Telegram ulangan' : ''}
        </div>

        <div className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
          <div className="stat">
            <div className="k">Mijozlar</div>
            <div className="v" style={{ fontSize: 18 }}>{data.stats.customers}</div>
          </div>
          <div className="stat">
            <div className="k">Ochiq qarz</div>
            <div className="v red" style={{ fontSize: 18 }}>{fmtNum(data.stats.open_debt)}</div>
          </div>
          <div className="stat">
            <div className="k">Sotuvlar</div>
            <div className="v" style={{ fontSize: 18 }}>{data.stats.sales}</div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 12 }}>
          <h3>Tarif va balans</h3>
          <div className="muted" style={{ marginBottom: 10 }}>
            Joriy: <b>{PLAN_LABEL[data.plan] ?? data.plan}</b>
            {data.plan_expires_at && ` (${data.plan_expires_at} gacha)`} · Balans: <b>{fmt(data.balance)}</b>
          </div>

          <div className="toolbar">
            <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)}>
              <option value="premium">Premium</option>
              <option value="business">Biznes</option>
            </select>
            <input
              style={{ width: 80 }}
              value={grantDays}
              onChange={(e) => setGrantDays(e.target.value)}
              placeholder="kun"
            />
            <button
              className="btn sm"
              onClick={async () => {
                await api.grantPlan(data.id, grantPlan, Number(grantDays) || 30);
                setMsg('Obuna berildi');
                reload();
              }}
            >
              Obuna berish
            </button>
          </div>

          <div className="toolbar">
            <input
              style={{ width: 140 }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Summa (± )"
            />
            <button
              className="btn sm ghost"
              disabled={!amount}
              onClick={async () => {
                await api.adjustBalance(data.id, parseInt(amount.replace(/[^\d-]/g, ''), 10) || 0, 'Admin tuzatishi');
                setAmount('');
                setMsg('Balans o‘zgartirildi');
                reload();
              }}
            >
              Balansga qo'shish
            </button>
          </div>
        </div>

        <div className="panel">
          <h3>Kirish huquqi</h3>
          {data.is_blocked ? (
            <>
              <div className="muted" style={{ marginBottom: 8 }}>
                Bloklangan{data.blocked_reason ? `: ${data.blocked_reason}` : ''}
              </div>
              <button
                className="btn sm"
                onClick={async () => {
                  await api.blockShop(data.id, false);
                  setMsg('Blokdan chiqarildi');
                  reload();
                }}
              >
                Blokdan chiqarish
              </button>
            </>
          ) : (
            <div className="toolbar">
              <input
                style={{ flex: 1 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Bloklash sababi"
              />
              <button
                className="btn sm danger"
                onClick={async () => {
                  await api.blockShop(data.id, true, reason || undefined);
                  setMsg('Bloklandi');
                  reload();
                }}
              >
                Bloklash
              </button>
            </div>
          )}
        </div>

        {data.transactions.length > 0 && (
          <div className="panel">
            <h3>Balans tarixi</h3>
            <table>
              <tbody>
                {data.transactions.slice(0, 10).map((t) => (
                  <tr key={t.id}>
                    <td>{t.note ?? t.type}</td>
                    <td className="muted">{t.created_at.slice(0, 16)}</td>
                    <td className="num" style={{ color: t.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {t.amount > 0 ? '+' : ''}
                      {fmtNum(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {msg && <p className="ok-msg">{msg}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
