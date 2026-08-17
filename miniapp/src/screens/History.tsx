import { useEffect, useState } from 'react';
import { api, fmt, SaleRow, SaleDetail, ReturnsInfo } from '../api';
import { AppIcon, Glyph } from '../icons';
import Scanner from '../Scanner';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import { fmtDateTime, fmtWhen, formatPhoneSoft } from '../format';
import { toast, loadFailed } from '../toast';
import { PrintSheet, Receipt } from '../print';
import { EmptyState, Summary } from '../ui';

// Sotuvlar tarixi, cheklar va qaytarish.
//
// Ikki joydan ochiladi: Kassa → Tarix va menyudagi "Qaytarish".
// Ikkinchisida skaner darhol ochiladi — mijoz tovarni ko'tarib kelganda
// do'konchi bir bosishda ishga kirishadi, chek raqami esida bo'lishi
// shart emas.

/* ───────── Sotuvlar tarixi va cheklar ───────── */

export function HistoryMode({ autoScan = false }: { autoScan?: boolean }) {
  const { t } = useT();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [returning, setReturning] = useState(false);
  // Qaytariladigan miqdorlar: sale_item_id → matn (do'konchi tahrirlaydi)
  const [retQty, setRetQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<'cash' | 'card' | 'debt'>('cash');
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Chekni qidirish: mijoz tovarni ko'tarib kelganda chek raqami
  // esida bo'lmaydi — shtrix-kodni skanerlab topish eng tez yo'l
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(autoScan);
  const [view, setView] = useState<'sales' | 'returns'>('sales');
  const [returns, setReturns] = useState<ReturnsInfo | null>(null);

  const loadSales = (query = q) => api.sales(50, query).then(setSales).catch(loadFailed);
  const loadReturns = () => api.returns('month').then(setReturns).catch(loadFailed);
  useEffect(() => {
    // Yozayotganda har harfga so'rov ketmasin
    const id = setTimeout(() => loadSales(), q ? 300 : 0);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    if (view === 'returns' && !returns) loadReturns();
  }, [view]);

  async function sendReceipt(id: number) {
    try {
      await api.sendReceipt(id);
      toast.success(t('receiptSent'));
    } catch (e: any) {
      toast.error(
        e.message === 'no_customer' ? t('receiptNoCustomer') : e.message === 'no_phone' ? t('receiptNoPhone') : t('error')
      );
    }
  }

  /** Qaytarish oynasini ochish — miqdorlar bo'sh boshlanadi */
  function openReturn() {
    setRetQty({});
    setReason('');
    setRefund(detail?.payment_type === 'debt' ? 'debt' : 'cash');
    setReturning(true);
  }

  async function submitReturn() {
    if (!detail) return;
    const items = detail.items
      .map((i) => ({ sale_item_id: i.id, qty: Number((retQty[i.id] ?? '').replace(',', '.')) || 0 }))
      .filter((i) => i.qty > 0);
    if (!items.length) return toast.error(t('returnNothing'));
    setBusy(true);
    try {
      await api.createReturn(detail.id, { items, reason: reason.trim() || undefined, refund_type: refund });
      haptic.success();
      toast.success(t('returnDone'));
      setReturning(false);
      setDetail(await api.sale(detail.id));
      loadSales();
      if (returns) loadReturns();
    } catch (e: any) {
      toast.error(e.message === 'too_many' ? t('returnTooMany') : t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  if (detail) {
    const returnedTotal = detail.returns.reduce((s, r) => s + r.total, 0);
    const canReturn = detail.items.some((i) => i.qty - (i.returned_qty ?? 0) > 0);
    return (
      <>
        {/* Chek printerga chiqadi — ekranda ko'rinmaydi */}
        {printing && (
          <PrintSheet onDone={() => setPrinting(false)}>
            <Receipt
              t={t}
              data={{
                id: detail.id,
                created_at: detail.created_at,
                total: detail.total,
                payment_type: detail.payment_type,
                items: detail.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, unit: i.unit })),
                shop: detail.shop,
                customer: detail.customer,
                seller: detail.seller,
                returned: returnedTotal,
              }}
            />
          </PrintSheet>
        )}

        <button className="btn-ghost" style={{ textAlign: 'left' }} onClick={() => setDetail(null)}>
          ‹ {t('back')}
        </button>
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 8px' }}>
            {t('receipt')} #{detail.id} · {fmtDateTime(detail.created_at)}
          </div>
          <div className="list-group" style={{ marginBottom: 8 }}>
            {detail.items.map((i) => {
              const back = i.returned_qty ?? 0;
              return (
                <div className="list-item" key={i.id}>
                  <div>
                    <div className="name">{i.name}</div>
                    <div className="sub">
                      {i.qty} {i.unit} × {fmt(i.price)}
                      {back > 0 && (
                        <span style={{ color: 'var(--red)' }}>
                          {' · '}
                          {t('returned')} {back}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="amount">{fmt(i.qty * i.price)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 17 }}>
            <span>{t('total')}</span>
            <span>{fmt(detail.total)}</span>
          </div>
          {returnedTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--red)', marginTop: 4 }}>
              <span>{t('returned')}</span>
              <span>−{fmt(returnedTotal)}</span>
            </div>
          )}
          {detail.customer && <p className="hint">{detail.customer.name} · {detail.customer.phone ? formatPhoneSoft(detail.customer.phone) : t('noPhone')}</p>}

          <button className="btn-primary" onClick={() => setPrinting(true)}>
            <Glyph name="note" size={17} color="#fff" /> {t('printReceipt')}
          </button>
          <button className="btn-ghost" onClick={() => sendReceipt(detail.id)}>
            <Glyph name="send" size={16} color="var(--accent)" /> {t('sendReceipt')}
          </button>
          {canReturn && (
            <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={openReturn}>
              <Glyph name="arrowDown" size={16} color="var(--red)" /> {t('returnDo')}
            </button>
          )}
        </div>

        {/* Qaytarishlar tarixi */}
        {detail.returns.length > 0 && (
          <>
            <div className="section-title">{t('returnHistory')}</div>
            <div className="list-group">
              {detail.returns.map((r) => (
                <div className="list-item" key={r.id}>
                  <div>
                    <div className="name">{fmtDateTime(r.created_at)}</div>
                    {r.reason && <div className="sub">{r.reason}</div>}
                  </div>
                  <div className="amount" style={{ color: 'var(--red)' }}>−{fmt(r.total)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Qaytarish oynasi */}
        {returning && (
          <div className="sheet-wrap" onClick={() => setReturning(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <div className="sheet-title">{t('returnTitle')}</div>
              <div className="sheet-sub">{t('returnHint')}</div>

              <div className="list-group">
                {detail.items.map((i) => {
                  const left = i.qty - (i.returned_qty ?? 0);
                  if (left <= 0) return null;
                  return (
                    <div className="list-item" key={i.id}>
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{i.name}</div>
                        <div className="sub">
                          {left} {i.unit} {t('returnLeft')} · {fmt(i.price)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          className="ret-qty"
                          inputMode="decimal"
                          placeholder="0"
                          value={retQty[i.id] ?? ''}
                          onChange={(e) => setRetQty({ ...retQty, [i.id]: e.target.value.replace(/[^\d.,]/g, '') })}
                        />
                        <button className="chip" onClick={() => setRetQty({ ...retQty, [i.id]: String(left) })}>
                          {t('returnAll')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <label className="sheet-label">{t('returnRefund')}</label>
              <div className="segmented sm">
                {(
                  [
                    ['cash', 'returnRefundCash'],
                    ['card', 'returnRefundCard'],
                    ...(detail.payment_type === 'debt' ? [['debt', 'returnRefundDebt']] : []),
                  ] as [typeof refund, string][]
                ).map(([id, key]) => (
                  <button key={id} className={refund === id ? 'on' : ''} onClick={() => setRefund(id)}>
                    {t(key)}
                  </button>
                ))}
              </div>

              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('returnReasonPlaceholder')}
              />

              <button className="btn-primary btn-lg" disabled={busy} onClick={submitReturn}>
                <Glyph name="check" size={18} color="#fff" /> {t('returnConfirm')}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Chekni topish: kod, tovar nomi, mijoz yoki chek raqami bo'yicha.
          Qaytarishlar ro'yxatiga tegishli emas — o'sha bo'limda yashiriladi,
          aks holda yozilgan matn ta'sir qilmayotgandek tuyulardi. */}
      {view === 'sales' && (
      <div className="search-row">
        <div className="search-field">
          <Glyph name="search" size={17} color="#8a8a8e" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('historySearch')}
            inputMode="search"
          />
          {q && (
            <button className="search-clear" onClick={() => setQ('')} aria-label={t('close')}>
              <Glyph name="close" size={17} color="#8a8a8e" />
            </button>
          )}
        </div>
        <button className="scan-round" onClick={() => setScanning(true)} aria-label={t('scanTitle')}>
          <Glyph name="scan" size={20} color="#fff" />
        </button>
      </div>
      )}

      {scanning && (
        <Scanner
          status={t('historyScanHint')}
          onScan={(code) => {
            setScanning(false);
            setView('sales');
            setQ(code);
          }}
          onClose={() => setScanning(false)}
        />
      )}

      <div className="segmented sm">
        <button className={view === 'sales' ? 'on' : ''} onClick={() => { setView('sales'); haptic.select(); }}>
          {t('historySales')}
        </button>
        <button className={view === 'returns' ? 'on' : ''} onClick={() => { setView('returns'); haptic.select(); }}>
          {t('historyReturns')}
          {returns && returns.count > 0 ? ` · ${returns.count}` : ''}
        </button>
      </div>

      {view === 'returns' ? (
        <ReturnsList data={returns} />
      ) : (
      <>
      <div className="list-group">
        {sales.map((s) => (
          <div className="list-item" key={s.id} onClick={async () => setDetail(await api.sale(s.id))}>
            <div className="lead">
              <AppIcon
                glyph={s.payment_type === 'debt' ? 'note' : s.payment_type === 'card' ? 'card' : 'banknote'}
                color={s.payment_type === 'debt' ? 'yellow' : s.payment_type === 'card' ? 'indigo' : 'green'}
                size={29}
              />
              <div style={{ minWidth: 0 }}>
                <div className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.items ?? '—'}
                </div>
                <div className="sub">
                  {fmtWhen(s.created_at)} ·{' '}
                  {s.payment_type === 'cash' ? t('payCash') : s.payment_type === 'card' ? t('payCard') : t('payDebt')}
                  {s.customer_name ? ` · ${s.customer_name}` : ''}
                  {s.returned > 0 && (
                    <span style={{ color: 'var(--red)' }}>
                      {' · '}
                      {t('returned')} {fmt(s.returned)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="amount">{fmt(s.total)}</span>
              <Glyph name="chevron" size={15} color="#c7c7cc" />
            </div>
          </div>
        ))}
      </div>
      {sales.length === 0 && <div className="empty">{q ? t('historyNoMatch') : t('noSalesYet')}</div>}
      </>
      )}
    </>
  );
}

/* ───────── Qaytarilgan tovarlar ─────────
   Do'konchi "shu oyda nima qaytdi va qancha pul chiqdi" degan savolga
   javob topadigan joy. Ilgari bu ma'lumot faqat har bir chekning
   ichida turardi — umumiy manzara ko'rinmasdi. */

export function ReturnsList({ data }: { data: ReturnsInfo | null }) {
  const { t } = useT();
  if (!data) return <div className="empty">{t('loading')}</div>;
  if (data.items.length === 0) return <EmptyState icon="arrowDown" title={t('returnsNone')} sub={t('returnsNoneSub')} />;
  const label = (rt: string) => (rt === 'card' ? t('payCard') : rt === 'debt' ? t('returnToDebt') : t('payCash'));
  return (
    <>
      <Summary
        icon="arrowDown"
        iconColor="red"
        label={t('returnsMonth')}
        value={`−${fmt(data.total)}`}
        color="var(--red)"
        right={<span className="badge">{data.count}</span>}
      />
      <div className="list-group">
        {data.items.map((r) => (
          <div className="list-item" key={r.id}>
            <div style={{ minWidth: 0 }}>
              <div className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.items ?? '—'}
              </div>
              <div className="sub">
                {fmtWhen(r.created_at)} · {label(r.refund_type)}
                {r.customer_name ? ` · ${r.customer_name}` : ''}
                {r.reason ? ` · ${r.reason}` : ''}
              </div>
            </div>
            <span className="amount" style={{ color: 'var(--red)' }}>−{fmt(r.total)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
