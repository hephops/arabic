import { useEffect, useMemo, useState } from 'react';
import { api, fmt, fmtNum, fmtPhone, type Payment, type PaymentsPage, type Shop } from '../api';
import { AppIcon, Glyph } from '../icons';

// Balans bo'limi: kirim/chiqim ko'rsatkichlari, filtrlar, jadval va
// qo'lda to'lov kiritish oynasi (bank o'tkazmasi, naqd va h.k.).

const TYPE_LABEL: Record<string, string> = {
  topup: "To'ldirish",
  subscription: 'Obuna',
  withdraw: 'Yechim',
  refund: 'Qaytarilgan',
  grant: "Sovg'a",
};

const METHODS = [
  { id: 'naqd', label: 'Naqd' },
  { id: 'karta', label: 'Karta' },
  { id: 'bank', label: "Bank o'tkazmasi" },
  { id: 'payme', label: 'Payme' },
  { id: 'click', label: 'Click' },
  { id: 'uzum', label: 'Uzum' },
];
const methodLabel = (m?: string | null) => METHODS.find((x) => x.id === m)?.label ?? (m || '—');

const PAGE_SIZES = [10, 25, 50, 100];
const today = () => new Date().toISOString().slice(0, 10);

export default function Payments() {
  const [data, setData] = useState<PaymentsPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  // filtrlar
  const [type, setType] = useState('all');
  const [shopId, setShopId] = useState<number | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    api.shops({ limit: 200 }).then((r) => setShops(r.rows)).catch(() => {});
  }, []);

  function load() {
    setBusy(true);
    api
      .payments({ type, shop_id: shopId || undefined, from, to, q, limit, offset })
      .then(setData)
      .catch(() => {})
      .finally(() => setBusy(false));
  }

  useEffect(load, [type, shopId, from, to, q, limit, offset]);
  useEffect(() => setOffset(0), [type, shopId, from, to, q, limit]);

  const s = data?.summary;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + limit, total);
  const filtered = type !== 'all' || !!shopId || !!from || !!to || !!q;

  function clearFilters() {
    setType('all'); setShopId(''); setFrom(''); setTo(''); setQ('');
  }

  async function remove(p: Payment) {
    if (!confirm(`${fmt(Math.abs(p.amount))} — bu yozuv o'chirilsin va balans qaytarilsinmi?`)) return;
    try {
      await api.deletePayment(p.id);
      load();
    } catch (e: any) {
      alert('Xatolik: ' + e.message);
    }
  }

  function exportCsv() {
    const head = ['Sana', "Do'kon", 'Telefon', 'Turi', 'Summa', "To'lov usuli", 'Hujjat', "To'lovchi", 'Izoh'];
    const body = rows.map((r) => [
      (r.paid_at ?? r.created_at).slice(0, 10),
      r.shop_name ?? '',
      r.shop_phone ?? '',
      TYPE_LABEL[r.type] ?? r.type,
      String(r.amount),
      methodLabel(r.method),
      r.doc_no ?? '',
      r.payer ?? '',
      r.note ?? '',
    ]);
    const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'balans.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="cards">
        <Stat glyph="banknote" color="green" k="Jami kirim" v={fmt(s?.kirim ?? 0)} />
        <Stat glyph="card" color="red" k="Jami chiqim" v={fmt(s?.chiqim ?? 0)} />
        <Stat glyph="gift" color="yellow" k="Qaytarilgan" v={fmt(s?.qaytarilgan ?? 0)} />
        <Stat glyph="boxes" color="accent" k="Qoldiq" v={fmt(s?.qoldiq ?? 0)} />
        <Stat glyph="note" color="red" k="Qarz" v={fmt(s?.qarz ?? 0)} />
        <Stat glyph="chart" color="indigo" k="Tranzaksiyalar" v={fmtNum(s?.count ?? 0)} />
      </div>

      <div className="panel">
        <div className="filters">
          <div className="f">
            <label>Turi</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">Hammasi</option>
              <option value="in">Kirim</option>
              <option value="out">Chiqim</option>
              <option value="topup">To'ldirish</option>
              <option value="subscription">Obuna</option>
              <option value="refund">Qaytarilgan</option>
              <option value="grant">Sovg'a</option>
            </select>
          </div>
          <div className="f">
            <label>Do'kon</label>
            <select value={shopId} onChange={(e) => setShopId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Barcha do'konlar</option>
              {shops.map((sh) => (
                <option key={sh.id} value={sh.id}>{sh.name}</option>
              ))}
            </select>
          </div>
          <div className="f">
            <label>Sana (dan)</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="f">
            <label>Sana (gacha)</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="f wide">
            <label>Qidiruv</label>
            <div className="clear">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Do'kon, hujjat raqami, to'lovchi, izoh..."
              />
              <button className="btn ghost" onClick={clearFilters} disabled={!filtered}>
                <Glyph name="close" size={15} /> Tozalash
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn" onClick={() => setAdding(true)}>
          <Glyph name="plus" size={17} color="#fff" /> Yangi to'lov
        </button>
        <button className="btn ghost" onClick={exportCsv} disabled={!rows.length}>
          <Glyph name="arrowDown" size={15} /> Export
        </button>
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
              <th>Sana</th>
              <th>Turi</th>
              <th>Do'kon</th>
              <th className="num">Summa</th>
              <th>To'lov usuli</th>
              <th>Hujjat raqami</th>
              <th>To'lovchi</th>
              <th>Izoh</th>
              <th>Kiritdi</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted">{(r.paid_at ?? r.created_at).slice(0, 10)}</td>
                <td>
                  {/* Summasi nol bo'lgan yozuv (masalan admin sovg'asi) kirim ham,
                      chiqim ham emas — o'z turi bilan ko'rsatiladi */}
                  <span className={`badge ${r.amount === 0 ? 'free' : r.amount > 0 ? 'ok' : 'bad'}`}>
                    {r.amount === 0 ? TYPE_LABEL[r.type] ?? 'Yozuv' : r.amount > 0 ? 'Kirim' : 'Chiqim'}
                  </span>
                </td>
                <td>
                  <div className="cell-main">{r.shop_name}</div>
                  <div className="cell-sub">{fmtPhone(r.shop_phone)}</div>
                </td>
                <td
                  className="num"
                  style={{
                    color: r.amount === 0 ? 'var(--muted)' : r.amount > 0 ? 'var(--green)' : 'var(--red)',
                    fontWeight: 700,
                  }}
                >
                  {r.amount > 0 ? '+' : r.amount < 0 ? '−' : ''}
                  {fmtNum(Math.abs(r.amount))} so'm
                </td>
                <td>{methodLabel(r.method)}</td>
                <td className="mono">{r.doc_no || '—'}</td>
                <td>{r.payer || '—'}</td>
                <td className="muted">{r.note || TYPE_LABEL[r.type] || '—'}</td>
                <td className="muted">{r.admin_username ? `@${r.admin_username}` : 'tizim'}</td>
                <td>
                  <button className="icon-btn danger" title="O'chirish" onClick={() => remove(r)}>
                    <Glyph name="trash" size={15} color="var(--red)" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!busy && rows.length === 0 && <div className="empty">Bu shart bo'yicha to'lov topilmadi</div>}
      </div>

      {adding && (
        <PaymentModal
          shops={shops}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
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

/* ───────── Qo'lda to'lov kiritish oynasi ───────── */

function PaymentModal({
  shops,
  onClose,
  onSaved,
}: {
  shops: Shop[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState('');
  const [shopId, setShopId] = useState<number | null>(null);
  const [shopQuery, setShopQuery] = useState('');
  const [payer, setPayer] = useState('');
  const [docNo, setDocNo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listOpen, setListOpen] = useState(false);

  const picked = shops.find((s) => s.id === shopId);
  // Maydon bosilganda ham ro'yxat chiqadi — yozish shart emas
  const matches = useMemo(() => {
    if (picked) return [];
    const t = shopQuery.trim().toLowerCase();
    const list = t
      ? shops.filter(
          (s) =>
            s.name.toLowerCase().includes(t) ||
            (s.phone ?? '').includes(t) ||
            (s.owner_name ?? '').toLowerCase().includes(t)
        )
      : shops;
    return list.slice(0, 8);
  }, [shopQuery, shops, picked]);

  const value = Number(amount.replace(/\D/g, '') || 0);

  async function save() {
    if (!shopId) return setError("Do'konni tanlang");
    if (!value) return setError('Summani kiriting');
    setBusy(true);
    setError('');
    try {
      await api.addPayment({
        shop_id: shopId,
        direction,
        amount: value,
        paid_at: paidAt || undefined,
        method: method || undefined,
        doc_no: docNo.trim() || undefined,
        payer: payer.trim() || undefined,
        note: note.trim() || undefined,
      });
      onSaved();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="banknote" size={34} />
          <div className="modal-title">Yangi to'lov</div>
        </div>
        <div className="modal-sub">Bank o'tkazmasi, naqd yoki boshqa to'lovni qo'lda kiritish</div>

        <div className="modal-grid">
          <div>
            <label>To'lov turi *</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
              <option value="in">Kirim (balansga qo'shiladi)</option>
              <option value="out">Chiqim (balansdan yechiladi)</option>
            </select>
          </div>
          <div>
            <label>Summa *</label>
            <input
              value={amount ? fmtNum(value) : ''}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder="100 000"
            />
          </div>

          <div>
            <label>To'lov sanasi *</label>
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div>
            <label>To'lov usuli</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">— Tanlang —</option>
              {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div className="full picker">
            <label>Do'kon *</label>
            {picked ? (
              <div className="row">
                <div className="panel" style={{ flex: 1, margin: 0, padding: '9px 12px' }}>
                  <div className="cell-main">{picked.name}</div>
                  <div className="cell-sub">
                    {fmtPhone(picked.phone)} · balans {fmt(picked.balance ?? 0)}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => { setShopId(null); setShopQuery(''); }}>
                  O'zgartirish
                </button>
              </div>
            ) : (
              <>
                <input
                  value={shopQuery}
                  onChange={(e) => { setShopQuery(e.target.value); setListOpen(true); }}
                  onFocus={() => setListOpen(true)}
                  // ro'yxatdagi tugma bosilishi ulgurishi uchun kechikish bilan yopamiz
                  onBlur={() => setTimeout(() => setListOpen(false), 150)}
                  placeholder="Do'konni tanlash yoki qidirish..."
                  autoComplete="off"
                />
                {listOpen && (
                  <div className="picker-list">
                    {matches.map((s) => (
                      <button
                        key={s.id}
                        className="picker-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setShopId(s.id);
                          setShopQuery(s.name);
                          setListOpen(false);
                          setError('');
                        }}
                      >
                        <div className="nm">{s.name}</div>
                        <div className="sb">
                          {fmtPhone(s.phone)} · {s.owner_name ?? '—'} · balans {fmt(s.balance ?? 0)}
                        </div>
                      </button>
                    ))}
                    {matches.length === 0 && <div className="picker-empty">Do'kon topilmadi</div>}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label>To'lovchi ismi</label>
            <input value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Ism familiya" />
          </div>
          <div>
            <label>Hujjat raqami</label>
            <input value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="12345" />
          </div>

          <div className="full">
            <label>Izoh</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Izoh kiriting..." />
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Bekor qilish</button>
          <button className="btn" onClick={save} disabled={busy || !shopId || !value}>
            <Glyph name="check" size={16} color="#fff" /> Saqlash
          </button>
        </div>
      </div>
    </div>
  );
}
