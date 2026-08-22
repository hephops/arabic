import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, fmtPhone, BASE, type Receipt, type ReceiptsPage, type Shop } from '../api';
import { AppIcon, Glyph } from '../icons';
import { PaymentModal, type PaymentPreset } from './Payments';

// Cheklar: do'konchi kartaga pul o'tkazgach chekning suratini yuboradi.
//
// Payme/Click ulanmagunicha pulni balansga QO'LDA odam qo'shadi —
// shuning uchun bu bo'lim ishning asosiy joyi. Chekni bosgan zahoti
// to'lov oynasi TO'LDIRILGAN holda ochiladi: do'kon, summa, sana va
// to'lovchi allaqachon yozilgan bo'ladi.

const TABS = [
  { id: 'new', label: 'Yangi' },
  { id: 'approved', label: 'Tasdiqlangan' },
  { id: 'rejected', label: 'Rad etilgan' },
  { id: 'all', label: 'Hammasi' },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'Kutilyapti', cls: 'warn' },
  approved: { label: 'Tasdiqlangan', cls: 'ok' },
  rejected: { label: 'Rad etilgan', cls: 'bad' },
};

const when = (s?: string | null) => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');

export default function Receipts() {
  const [tab, setTab] = useState('new');
  const [data, setData] = useState<ReceiptsPage | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [preset, setPreset] = useState<PaymentPreset | null>(null);
  const [reject, setReject] = useState<Receipt | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  function load() {
    api.receipts(tab).then(setData).catch(() => {});
  }
  useEffect(load, [tab]);
  useEffect(() => {
    api.shops({ limit: 200 }).then((r) => setShops(r.rows)).catch(() => {});
  }, []);

  const counts = data?.counts;

  return (
    <>
      <div className="cards">
        <Stat glyph="banknote" color="yellow" k="Kutilyapti" v={fmtNum(counts?.yangi ?? 0)} />
        <Stat glyph="card" color="accent" k="Kutilayotgan summa" v={fmt(counts?.yangi_summa ?? 0)} />
        <Stat glyph="check" color="green" k="Tasdiqlangan" v={fmtNum(counts?.tasdiqlangan ?? 0)} />
        <Stat glyph="close" color="red" k="Rad etilgan" v={fmtNum(counts?.rad ?? 0)} />
      </div>

      <div className="tabs">
        {TABS.map((x) => (
          <button key={x.id} className={`tab ${tab === x.id ? 'on' : ''}`} onClick={() => setTab(x.id)}>
            {x.label}
            {x.id === 'new' && counts?.yangi ? <span className="tab-count">{counts.yangi}</span> : null}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 64 }}>Chek</th>
              <th>Do'kon</th>
              <th className="num">Summa</th>
              <th>Xodim</th>
              <th>Izoh</th>
              <th>Sana</th>
              <th>Holat</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>
                  {r.image_url ? (
                    <button className="chek-cell" onClick={() => setZoom(`${BASE}${r.image_url}`)} title="Kattalashtirish">
                      <img src={`${BASE}${r.image_url}`} alt="" />
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <div className="cell-main">{r.shop_name}</div>
                  <div className="cell-sub">
                    {fmtPhone(r.shop_phone)} · balans {fmt(r.shop_balance ?? 0)}
                  </div>
                </td>
                <td className="num"><b>{fmt(r.amount)}</b></td>
                <td>
                  {/* Chekda yozilgan raqam kimniki — tasdiqlashdan OLDIN
                      ko'rinib tursin: do'kon shu xodimga biriktiriladi */}
                  {r.agent_phone ? (
                    <>
                      <div className="cell-main">{r.agent_match?.name ?? <span className="muted">topilmadi</span>}</div>
                      <div className="cell-sub">{fmtPhone(r.agent_phone)}</div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                  {r.shop_agent_name && (
                    <div className="cell-sub">biriktirilgan: {r.shop_agent_name}</div>
                  )}
                </td>
                <td className="muted">
                  {r.note ?? '—'}
                  {r.review_note && <div className="cell-sub" style={{ color: 'var(--red)' }}>{r.review_note}</div>}
                </td>
                <td className="muted">{when(r.created_at)}</td>
                <td>
                  <span className={`badge ${STATUS[r.status]?.cls ?? ''}`}>{STATUS[r.status]?.label ?? r.status}</span>
                  {r.reviewed_username && <div className="cell-sub">@{r.reviewed_username}</div>}
                </td>
                <td className="row-acts">
                  {r.status === 'new' ? (
                    <>
                      <button
                        className="btn sm"
                        onClick={() =>
                          setPreset({
                            shop_id: r.shop_id,
                            shop_name: r.shop_name,
                            amount: r.amount,
                            payer: r.owner_name ?? '',
                            note: `Chek #${r.id}`,
                            method: 'karta',
                            paid_at: String(r.created_at).slice(0, 10),
                            receipt_id: r.id,
                          })
                        }
                      >
                        <Glyph name="check" size={15} color="#fff" /> Balansga qo'shish
                      </button>
                      <button className="icon-btn danger" title="Rad etish" onClick={() => setReject(r)}>
                        <Glyph name="close" size={15} />
                      </button>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && <div className="empty">Chek yo'q</div>}
      </div>

      {preset && (
        <PaymentModal
          shops={shops}
          preset={preset}
          onClose={() => setPreset(null)}
          onSaved={() => {
            setPreset(null);
            load();
          }}
        />
      )}

      {reject && <RejectModal receipt={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); load(); }} />}

      {/* Chekni to'liq ko'rish */}
      {zoom && (
        <div className="modal-wrap" onClick={() => setZoom(null)}>
          <img className="chek-full" src={zoom} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function RejectModal({ receipt, onClose, onDone }: { receipt: Receipt; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    setBusy(true);
    setError('');
    try {
      await api.rejectReceipt(receipt.id, reason.trim() || undefined);
      onDone();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AppIcon glyph="close" size={34} />
          <div className="modal-title">Chekni rad etish</div>
        </div>
        <div className="modal-sub">
          {receipt.shop_name} · {fmt(receipt.amount)}. Sabab do'konchining ekranida ko'rinadi.
        </div>
        <label>Sabab</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Masalan: chek o'qilmadi, summa mos kelmadi"
          autoFocus
        />
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Bekor qilish</button>
          <button className="btn danger" onClick={go} disabled={busy}>Rad etish</button>
        </div>
      </div>
    </div>
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
