import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, fmtPhone, type Shop, type ShopDetail, type ShopsSummary } from '../api';
import { AppIcon, Glyph } from '../icons';

const PAGE_SIZES = [10, 25, 50, 100];

/** Do'kon holati — kunlik to'lov bo'yicha */
function shopState(s: { is_blocked: number; charged_through: string | null }, today: string) {
  if (s.is_blocked) return { cls: 'bad', text: 'Bloklangan' };
  if (!s.charged_through || s.charged_through < today) return { cls: 'bad', text: "To'xtagan" };
  return { cls: 'ok', text: 'Ishlayapti' };
}

/** Balans yana necha kunga yetadi — serverdagi hisob bilan bir xil:
 *  bugun ham hisobga kiradi, xizmat to'xtagan bo'lsa nol */
function daysLeft(s: { balance: number; charged_through: string | null }, today: string, price: number) {
  if (!s.charged_through || s.charged_through < today) return 0;
  const ahead = Math.round(
    (Date.parse(`${s.charged_through}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  );
  return ahead + 1 + (price > 0 ? Math.floor(Math.max(0, s.balance) / price) : 0);
}

export default function Shops() {
  const [rows, setRows] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState<ShopsSummary | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [price, setPrice] = useState(0);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ShopDetail | null>(null);
  // Tahrirlash va o'chirish oynalari — ro'yxatdagi tugmalardan ochiladi
  const [editing, setEditing] = useState<Shop | null>(null);
  const [removing, setRemoving] = useState<Shop | null>(null);

  function load() {
    api.shops({ q, status, limit, offset }).then((r) => {
      setRows(r.rows);
      setTotal(r.total);
    });
    api.shopsSummary().then(setSum).catch(() => {});
    api.stats().then((st) => setPrice(st.daily_price)).catch(() => {});
  }

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, status, limit, offset]);
  useEffect(() => setOffset(0), [q, status, limit]);

  // Holat filtri serverda qo'llanadi — sahifalash to'g'ri ishlashi uchun
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const shown = rows;
  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + limit, total);
  const filtered = !!q || status !== 'all';

  return (
    <>
      <div className="cards">
        <Stat glyph="house" color="accent" k="Jami do'konlar" v={fmtNum(sum?.jami ?? 0)} />
        <Stat glyph="check" color="green" k="Ishlayapti" v={fmtNum(sum?.ishlayapti ?? 0)} />
        <Stat glyph="clock" color="red" k="To'xtagan" v={fmtNum(sum?.toxtagan ?? 0)} />
        <Stat glyph="warning" color="red" k="Bloklangan" v={fmtNum(sum?.bloklangan ?? 0)} />
        <Stat glyph="banknote" color="indigo" k="Balanslarda" v={fmt(sum?.balans ?? 0)} />
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
            <label>Holat</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Barcha holat</option>
              <option value="active">Ishlayapti</option>
              <option value="stopped">To'xtagan (balans tugagan)</option>
              <option value="blocked">Bloklangan</option>
            </select>
          </div>
          <div className="f clear">
            <button
              className="btn ghost"
              onClick={() => { setQ(''); setStatus('all'); }}
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
              <th className="num">Balans</th>
              <th className="num">Qolgan kun</th>
              <th className="num">Mijoz</th>
              <th className="num">Qarz</th>
              <th>Holat</th>
              <th>Ro'yxatdan</th>
              <th className="num">Amallar</th>
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
                <td className="num" style={{ fontWeight: 600, color: s.balance < 0 ? 'var(--red)' : undefined }}>
                  {fmtNum(s.balance)} so'm
                </td>
                <td className="num">
                  {(() => {
                    const d = daysLeft(s, today, price);
                    return <b style={{ color: d <= 0 ? 'var(--red)' : d <= 5 ? 'var(--yellow)' : undefined }}>{d}</b>;
                  })()}
                </td>
                <td className="num">{s.customers_count ?? 0}</td>
                <td className="num">{s.debts_count ?? 0}</td>
                <td>
                  {(() => {
                    const st = shopState(s, today);
                    return <span className={`badge ${st.cls}`}>{st.text}</span>;
                  })()}
                </td>
                <td className="muted">{s.created_at.slice(0, 10)}</td>
                {/* Amallar. Qatorning o'zi ham bosiladi, lekin tugmalar
                    aniqroq: o'chirish tasodifan bosilib ketmasin deb u
                    alohida turadi va qatorni ochib yubormaydi. */}
                <td className="num row-acts" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    title="Ko'rish"
                    onClick={async () => setSelected(await api.shop(s.id))}
                  >
                    <Glyph name="eye" size={16} />
                  </button>
                  <button className="icon-btn" title="Tahrirlash" onClick={() => setEditing(s)}>
                    <Glyph name="pencil" size={16} />
                  </button>
                  <button className="icon-btn danger" title="O'chirish" onClick={() => setRemoving(s)}>
                    <Glyph name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">Do'kon topilmadi</div>}
      </div>

      {editing && (
        <EditShop shop={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {removing && (
        <DeleteShop shop={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); load(); }} />
      )}
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
  // Oyna ichidagi bo'limlar. Hammasi bir ustunga tizilsa modal juda
  // uzayib ketadi va kerakli joyni topish qiyin — shuning uchun tab.
  const [tab, setTab] = useState<'info' | 'balance'>('info');
  const [data, setData] = useState(shop);
  const [msg, setMsg] = useState('');
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

        {/* Bo'limlar — do'kon kartochkasi uzun bo'lgani uchun ajratilgan */}
        <div className="tabs">
          <button className={`tab ${tab === 'info' ? 'on' : ''}`} onClick={() => setTab('info')}>
            <Glyph name="book" size={14} /> Ma'lumotlar
          </button>
          <button className={`tab ${tab === 'balance' ? 'on' : ''}`} onClick={() => setTab('balance')}>
            <Glyph name="banknote" size={14} /> Balans tarixi
            <span className="tab-count">{data.transactions.length}</span>
          </button>
        </div>

        {tab === 'info' && (<>
        {/* Balans va kunlik to'lov. Tarif yo'q — bepul kun sovg'a
            qilinadi yoki balans to'g'rilanadi. */}
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-title">Balans va kunlik to'lov</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            Balans: <b>{fmt(data.balance)}</b> · Kunlik: <b>{fmt(data.service.daily_price)}</b> ·{' '}
            {data.service.active ? (
              <>
                yana <b>{data.service.days_left}</b> kun (<b>{data.service.runs_out_on}</b> gacha)
              </>
            ) : (
              <b style={{ color: 'var(--red)' }}>balans tugagan — xizmat to'xtagan</b>
            )}
            {data.service.on_trial && ' · sinov muddatida'}
          </div>

          <div className="toolbar">
            <input
              style={{ width: 80 }}
              value={grantDays}
              onChange={(e) => setGrantDays(e.target.value)}
              placeholder="kun"
            />
            <button
              className="btn sm"
              onClick={async () => {
                await api.grantDays(data.id, Number(grantDays) || 30);
                setMsg("Bepul kun qo'shildi");
                reload();
              }}
            >
              Bepul kun berish
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

        </>)}

        {tab === 'balance' && (
          <div className="panel">
            <div className="panel-title">Balans tarixi</div>
            <table>
              <tbody>
                {data.transactions.map((t) => (
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
            {data.transactions.length === 0 && <div className="empty">Hali harakat bo'lmagan</div>}
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


/** Do'kon ma'lumotini tahrirlash oynasi */
function EditShop({ shop, onClose, onSaved }: { shop: Shop; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(shop.name ?? '');
  const [owner, setOwner] = useState(shop.owner_name ?? '');
  const [phone, setPhone] = useState(shop.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true);
    setErr('');
    try {
      await api.shopEdit(shop.id, { name, owner_name: owner, phone });
      onSaved();
    } catch (e: any) {
      // Server sababni kod bilan qaytaradi — o'zbekchaga o'giramiz
      const c = e?.details?.error ?? e?.message ?? '';
      setErr(
        c === 'phone_taken'
          ? "Bu raqam boshqa do'konda ishlatilyapti"
          : c === 'phone_invalid'
            ? "Telefon raqami noto'g'ri"
            : c === 'name_required'
              ? "Nomi bo'sh bo'lmasin"
              : String(c)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="house" size={30} />
          <div className="modal-title">Do'konni tahrirlash</div>
        </div>
        <div className="set-field">
          <label>Do'kon nomi</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="set-field">
          <label>Egasi</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="set-field">
          <label>Telefon</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="set-hint">Bu raqam bilan ilovaga kiriladi — o'zgartirsangiz eski raqam ishlamaydi</div>
        </div>
        {err && <div className="err-msg">{err}</div>}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saqlanyapti…' : 'Saqlash'}
          </button>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Bekor qilish</button>
        </div>
      </div>
    </div>
  );
}

/**
 * O'chirish oynasi.
 *
 * O'chirish qaytarib bo'lmaydi va butun do'konni — mijozlari, qarzlari,
 * tovarlari bilan — yo'q qiladi. Shuning uchun tugma emas, NOMNI QO'LDA
 * yozish talab qilinadi: chalg'ib bosilgan tugma bir do'konning butun
 * ishini o'chirib yubormasin.
 */
function DeleteShop({ shop, onClose, onDone }: { shop: Shop; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mos = text.trim() === (shop.name ?? '').trim();

  async function go() {
    setBusy(true);
    setErr('');
    try {
      await api.shopDelete(shop.id, text.trim());
      onDone();
    } catch (e: any) {
      setErr(e?.details?.error ?? e?.message ?? "O'chirib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="warning" size={30} color="red" />
          <div className="modal-title">Do'konni o'chirish</div>
        </div>
        <p className="muted" style={{ lineHeight: 1.5 }}>
          <b>{shop.name}</b> ({fmtPhone(shop.phone)}) butunlay o'chiriladi: mijozlari, qarzlari,
          tovarlari, savdolari va to'lovlari bilan birga. <b>Qaytarib bo'lmaydi.</b>
        </p>
        <div className="set-field">
          <label>Tasdiqlash uchun do'kon nomini yozing</label>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={shop.name ?? ''} />
        </div>
        {err && <div className="err-msg">{err}</div>}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn danger" onClick={go} disabled={busy || !mos}>
            {busy ? "O'chirilyapti…" : "Butunlay o'chirish"}
          </button>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Bekor qilish</button>
        </div>
      </div>
    </div>
  );
}
