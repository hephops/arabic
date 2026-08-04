import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, fmtPhone, type Shop, type ShopDetail, type ShopsSummary } from '../api';
import { AppIcon, Glyph } from '../icons';

const PLAN_LABEL: Record<string, string> = { free: 'Bepul', premium: 'Premium', business: 'Biznes' };
const PAGE_SIZES = [10, 25, 50, 100];

export default function Shops() {
  const [rows, setRows] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState<ShopsSummary | null>(null);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('all');
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ShopDetail | null>(null);

  function load() {
    api.shops({ q, plan, limit, offset }).then((r) => {
      setRows(r.rows);
      setTotal(r.total);
    });
    api.shopsSummary().then(setSum).catch(() => {});
  }

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, plan, limit, offset]);
  useEffect(() => setOffset(0), [q, plan, status, limit]);

  // Holat bo'yicha filtr ro'yxat ichida qo'llanadi
  const shown = rows.filter((s) =>
    status === 'all' ? true : status === 'blocked' ? !!s.is_blocked : !s.is_blocked
  );
  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + limit, total);
  const filtered = !!q || plan !== 'all' || status !== 'all';

  return (
    <>
      <div className="cards">
        <Stat glyph="house" color="accent" k="Jami do'konlar" v={fmtNum(sum?.jami ?? 0)} />
        <Stat glyph="people" color="green" k="Faol" v={fmtNum(sum?.faol ?? 0)} />
        <Stat glyph="warning" color="red" k="Bloklangan" v={fmtNum(sum?.bloklangan ?? 0)} />
        <Stat glyph="box" color="" k="Bepul" v={fmtNum(sum?.bepul ?? 0)} />
        <Stat glyph="crown" color="accent" k="Premium" v={fmtNum(sum?.premium ?? 0)} />
        <Stat glyph="banknote" color="indigo" k="Biznes" v={fmtNum(sum?.biznes ?? 0)} />
      </div>

      <div className="panel">
        <div className="filters">
          <div className="f wide">
            <label>Qidiruv</label>
            <input
              placeholder="Nomi, telefoni yoki ega ismi bo'yicha qidirish..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="f">
            <label>Tarif</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="all">Barcha tariflar</option>
              <option value="free">Bepul</option>
              <option value="premium">Premium</option>
              <option value="business">Biznes</option>
            </select>
          </div>
          <div className="f">
            <label>Holat</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Barcha holat</option>
              <option value="active">Faol</option>
              <option value="blocked">Bloklangan</option>
            </select>
          </div>
          <div className="f clear">
            <button
              className="btn ghost"
              onClick={() => { setQ(''); setPlan('all'); setStatus('all'); }}
              disabled={!filtered}
            >
              <Glyph name="close" size={15} /> Tozalash
            </button>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="panel-title" style={{ margin: 0 }}>Do'konlar ro'yxati</div>
        <div className="spacer" />
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 90 }}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn ghost sm" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>
          Oldingi
        </button>
        <button className="btn ghost sm" onClick={() => setOffset(offset + limit)} disabled={pageTo >= total}>
          Keyingi
        </button>
        <span className="muted" style={{ fontSize: 13 }}>{pageFrom}–{pageTo} / {fmtNum(total)}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Do'kon</th>
              <th>Telefon</th>
              <th>Tarif</th>
              <th className="num">Balans</th>
              <th className="num">Mijoz</th>
              <th className="num">Qarz</th>
              <th>Holat</th>
              <th>Ro'yxatdan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="clickable" onClick={async () => setSelected(await api.shop(s.id))}>
                <td>
                  <div className="cell-main">{s.name}</div>
                  <div className="cell-sub">{s.owner_name ?? '—'}</div>
                </td>
                <td className="muted">{fmtPhone(s.phone)}</td>
                <td>
                  <span className={`badge ${s.plan}`}>{PLAN_LABEL[s.plan] ?? s.plan}</span>
                  {s.plan_expires_at && <div className="cell-sub">{s.plan_expires_at}</div>}
                </td>
                <td className="num" style={{ fontWeight: 600, color: s.balance < 0 ? 'var(--red)' : undefined }}>
                  {fmtNum(s.balance)} so'm
                </td>
                <td className="num">{s.customers_count ?? 0}</td>
                <td className="num">{s.debts_count ?? 0}</td>
                <td>
                  <span className={`badge ${s.is_blocked ? 'bad' : 'ok'}`}>
                    {s.is_blocked ? 'Bloklangan' : 'Faol'}
                  </span>
                </td>
                <td className="muted">{s.created_at.slice(0, 10)}</td>
                <td className="num"><Glyph name="chevron" size={15} color="#c7c7cc" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">Do'kon topilmadi</div>}
      </div>

      {selected && <ShopModal shop={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </>
  );
}

function Stat({ glyph, color, k, v }: { glyph: string; color: string; k: string; v: string }) {
  return (
    <div className="stat">
      <AppIcon glyph={glyph} size={38} />
      <div className="txt">
        <div className="k">{k}</div>
        <div className={`v ${color}`}>{v}</div>
      </div>
    </div>
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
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="house" size={34} />
          <div className="modal-title">{data.name}</div>
        </div>
        <div className="modal-sub">
          {fmtPhone(data.phone)} {data.owner_name && `· ${data.owner_name}`}
          {data.telegram_user_id ? ' · Telegram ulangan' : ''}
        </div>

        <div className="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
          <div className="stat">
            <div className="txt">
              <div className="k">Mijozlar</div>
              <div className="v" style={{ fontSize: 18 }}>{data.stats.customers}</div>
            </div>
          </div>
          <div className="stat">
            <div className="txt">
              <div className="k">Ochiq qarz</div>
              <div className="v red" style={{ fontSize: 18 }}>{fmt(data.stats.open_debt)}</div>
            </div>
          </div>
          <div className="stat">
            <div className="txt">
              <div className="k">Sotuvlar</div>
              <div className="v" style={{ fontSize: 18 }}>{data.stats.sales}</div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-title">Tarif va balans</div>
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
          <div className="panel-title">Kirish huquqi</div>
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
            <div className="panel-title">Balans tarixi</div>
            <table>
              <tbody>
                {data.transactions.slice(0, 10).map((t) => (
                  <tr key={t.id}>
                    <td>{t.note ?? t.type}</td>
                    <td className="muted">{t.created_at.slice(0, 16)}</td>
                    <td
                      className="num"
                      style={{
                        color:
                          t.amount === 0 ? 'var(--muted)' : t.amount > 0 ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {t.amount > 0 ? '+' : ''}
                      {fmtNum(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {msg && <p className="hint" style={{ color: 'var(--green)' }}>{msg}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
