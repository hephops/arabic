import { useEffect, useRef, useState } from 'react';
import { api, fmt, Product, SaleRow, SaleDetail, BASE } from '../api';
import { AppIcon, Glyph } from '../icons';
import Scanner from '../Scanner';
import { useHardwareScanner } from '../hardwareScanner';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import { formatAmount, amountValue, formatPhone, formatPhoneSoft, phoneDigits, phoneE164, isPhoneComplete } from '../format';
import { toast } from '../toast';
import {
  Cart, MAX_CARTS, cartQty, cartTotal, loadCarts, newCart, nextNo, saveCarts,
} from '../carts';
import { PrintSheet, Receipt } from '../print';

function ProductThumb({ product, size = 44 }: { product: Product; size?: number }) {
  if (product.image_url) {
    return (
      <img
        src={`${BASE}${product.image_url}`}
        alt={product.name}
        style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return <AppIcon glyph="box" color="gray" size={size} />;
}

export type KassaMode = 'sale' | 'intake' | 'history';

export default function Kassa({
  onDone,
  isEmployee = false,
  initialMode = 'sale',
}: {
  onDone: () => void;
  isEmployee?: boolean;
  initialMode?: KassaMode;
}) {
  const [mode, setMode] = useState<KassaMode>(initialMode);
  const { t } = useT();

  // Tezkor amallardan "Tovar kirimi" tanlansa — o'sha bo'lim ochiladi
  useEffect(() => {
    setMode(isEmployee && initialMode === 'intake' ? 'sale' : initialMode);
  }, [initialMode, isEmployee]);

  return (
    <div className="screen">
      <div className="segmented">
        <button className={mode === 'sale' ? 'on' : ''} onClick={() => { setMode('sale'); haptic.select(); }}>
          <Glyph name="cart" size={16} /> {t('modeSale')}
        </button>
        {!isEmployee && (
          <button className={mode === 'intake' ? 'on' : ''} onClick={() => { setMode('intake'); haptic.select(); }}>
            <Glyph name="box" size={16} /> {t('modeIntake')}
          </button>
        )}
        <button className={mode === 'history' ? 'on' : ''} onClick={() => { setMode('history'); haptic.select(); }}>
          <Glyph name="clock" size={16} /> {t('modeHistory')}
        </button>
      </div>
      {mode === 'sale' && <SaleMode onDone={onDone} />}
      {mode === 'intake' && <IntakeMode onDone={onDone} />}
      {mode === 'history' && <HistoryMode />}
    </div>
  );
}

/* ───────── Sotuvlar tarixi va cheklar ───────── */

function HistoryMode() {
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

  const loadSales = () => api.sales(50).then(setSales).catch(() => {});
  useEffect(() => {
    loadSales();
  }, []);

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
            {t('receipt')} #{detail.id} · {detail.created_at.slice(0, 16)}
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
                    <div className="name">{r.created_at.slice(0, 16)}</div>
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
                  {s.created_at.slice(5, 16)} ·{' '}
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
      {sales.length === 0 && <div className="empty">{t('noSalesYet')}</div>}
    </>
  );
}

function SaleMode({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  // Bir nechta savat: har bir oluvchiga alohida. Yozuv localStorage'da —
  // boshqa bo'limga o'tib qaytilsa ham savat joyida qoladi.
  const [state, setState] = useState(loadCarts);
  const { carts, activeId } = state;
  const [renaming, setRenaming] = useState(false);
  const [payment, setPaymentRaw] = useState<'cash' | 'card' | 'debt'>('cash');
  const [scanning, setScanning] = useState(false);
  // Skanerda topilmagan kod: mahsulot tanlansa, kod o'shanga biriktiriladi
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  const active = carts.find((c) => c.id === activeId) ?? carts[0];
  const cart = active.lines;

  // Skaner uzluksiz ishlaganda eski qiymatni o'qib qolmasligi uchun
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    saveCarts(state);
  }, [state]);

  const cartName = (c: Cart) => c.name.trim() || `${t('cartNo')} ${c.no}`;

  /** Faol savatni o'zgartirish (har doim eng so'nggi holatdan) */
  function patchActive(fn: (c: Cart) => Cart) {
    setState((s) => ({ ...s, carts: s.carts.map((c) => (c.id === s.activeId ? fn(c) : c)) }));
  }

  function addCart() {
    if (carts.length >= MAX_CARTS) {
      toast.error(t('cartsLimit'));
      return;
    }
    haptic.tap();
    const c = newCart(nextNo(carts));
    setState((s) => ({ carts: [...s.carts, c], activeId: c.id }));
    setQuery(''); setResults([]); setPendingCode(null); setRenaming(false);
    toast.success(t('cartAdded'), `${t('cartNo')} ${c.no}`);
  }

  function selectCart(id: number) {
    if (id === activeId) {
      setRenaming((v) => !v);
      return;
    }
    haptic.select();
    setState((s) => ({ ...s, activeId: id }));
    setQuery(''); setResults([]); setPendingCode(null); setRenaming(false);
  }

  function removeCart(id: number) {
    const c = carts.find((x) => x.id === id);
    if (!c) return;
    if (c.lines.length > 0 && !confirm(t('cartDeleteAsk'))) return;
    setRenaming(false);
    setState((s) => {
      const rest = s.carts.filter((x) => x.id !== id);
      if (rest.length === 0) {
        const fresh = newCart(1);
        return { carts: [fresh], activeId: fresh.id };
      }
      return { carts: rest, activeId: s.activeId === id ? rest[0].id : s.activeId };
    });
    toast.info(t('cartDeleted'), cartName(c));
  }

  const setPayment = (p: 'cash' | 'card' | 'debt') => {
    setPaymentRaw(p);
    patchActive((c) => ({ ...c, payment: p }));
  };
  // Savat almashsa — to'lov turi ham o'sha savatniki bo'ladi
  useEffect(() => {
    setPaymentRaw(active.payment);
  }, [activeId]);

  const barcodeTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(barcodeTimer.current), []);

  async function search(q: string) {
    setQuery(q);
    window.clearTimeout(barcodeTimer.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    if (/^\d{6,}$/.test(trimmed)) {
      // Shtrix-kodga o'xshaydi — lekin har bir bosilgan tugmada emas,
      // faqat terish bir zum to'xtagach tekshiramiz. Aks holda uzun
      // kodning hali tugallanmagan qismi (masalan 13 xonalining
      // birinchi 8 tasi) qidirilib, "topilmadi" chiqib ketaveradi.
      barcodeTimer.current = window.setTimeout(() => handleCode(trimmed), 200);
      return;
    }
    const found = await api.products({ q });
    setResults(found.filter((p) => p.id !== null));
  }

  /** Skaner (kamera, Honeywell kabi USB skaner) yoki qo'lda kiritilgan kod:
   *  topilsa savatga, topilmasa biriktirishga taklif */
  async function handleCode(code: string) {
    try {
      const res = await api.lookupBarcode(code);
      if (res.product) {
        setPendingCode(null);
        addToCart(res.product);
        return;
      }
      // Topilmadi — kodni eslab qolamiz va tanlash uchun ro'yxatni ochamiz.
      // Katalogda nomi bo'lsa shu nom bo'yicha, aks holda ombordagi barcha
      // mahsulot chiqadi: do'konchi tovarni topib bossa, kod o'shanga bog'lanadi.
      toast.error(t('toastNotFound'), res.code);
      setPendingCode(res.code);
      setQuery('');
      const list = res.catalog ? await api.products({ q: res.catalog.name }) : await api.products();
      const found = list.filter((p) => p.id !== null);
      setResults(found.length ? found : (await api.products()).filter((p) => p.id !== null));
    } catch (e: any) {
      toast.error(t('error'), e.message);
    }
  }

  // Kompyuterga ulangan USB skaner (masalan Honeywell): kodni klaviaturadek
  // tez "teradi". Fokus qaysi maydonda bo'lishidan qat'i nazar ushlab olinadi.
  useHardwareScanner(handleCode);

  async function addToCart(p: Product) {
    // Kod topilmay, foydalanuvchi mahsulotni o'zi tanlagan bo'lsa — kodni biriktiramiz
    if (pendingCode && p.id) {
      try {
        await api.attachBarcode(p.id, pendingCode);
        toast.success(t('barcodeAttached').replace('{name}', p.name), pendingCode);
      } catch (e: any) {
        if (e.message === 'barcode_taken') toast.error(t('barcodeTaken'));
      }
      setPendingCode(null);
    }
    // Eng so'nggi holat (skaner uzluksiz otganda ham to'g'ri sanaladi)
    const cur = ref.current.carts.find((c) => c.id === ref.current.activeId)!;
    const inCart = cur.lines.find((l) => l.product.id === p.id);
    const want = (inCart?.qty ?? 0) + 1;

    // Qoldiqdan oshib ketmaydi: savatdagi son omborda borichadan ko'p bo'lmaydi
    if (want > p.stock) {
      toast.error(p.name, `${t('stockShort')}: ${p.stock} ${p.unit}`);
      return;
    }

    patchActive((c) => ({
      ...c,
      lines: c.lines.find((l) => l.product.id === p.id)
        ? c.lines.map((l) => (l.product.id === p.id ? { ...l, qty: want } : l))
        : [...c.lines, { product: p, qty: 1 }],
    }));
    toast.success(p.name, `${want} ${t('pcs')} · ${fmt(p.sell_price * want)} · ${cartName(cur)}`);
    setQuery('');
    setResults([]);
  }

  function changeQty(id: number, delta: number) {
    haptic.tap();
    const line = cart.find((l) => l.product.id === id);
    if (!line) return;
    const qty = line.qty + delta;
    // Qoldiqdan oshirib bo'lmaydi
    if (delta > 0 && qty > line.product.stock) {
      toast.error(line.product.name, `${t('stockShort')}: ${line.product.stock} ${line.product.unit}`);
      return;
    }
    if (qty <= 0) toast.info(line.product.name, t('toastRemoved'));
    patchActive((c) => ({
      ...c,
      lines: c.lines.map((l) => (l.product.id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0),
    }));
  }

  const total = cartTotal(active);
  const qtyTotal = cartQty(active);

  async function checkout(allowNegative = false) {
    if (busy) return;
    if (payment === 'debt' && !active.customerName.trim()) {
      toast.error(t('debtNeedsCustomer'));
      return;
    }
    if (payment === 'debt' && !isPhoneComplete(active.customerPhone)) {
      toast.error(t('phoneRequired'));
      return;
    }
    setBusy(true);
    try {
      await api.createSale({
        items: cart.map((l) => ({ product_id: l.product.id!, qty: l.qty })),
        payment_type: payment,
        customer_name: payment === 'debt' ? active.customerName.trim() : undefined,
        customer_phone: payment === 'debt' ? phoneE164(active.customerPhone) : undefined,
        allow_negative: allowNegative || undefined,
      });
      toast.success(t('saleSaved'), `${fmt(total)}${payment === 'debt' ? ` · ${t('writtenToDebts')}` : ''}`);
      // Yakunlangan savat yopiladi, qolganlari joyida turadi
      const closedId = active.id;
      setState((s) => {
        const rest = s.carts.filter((c) => c.id !== closedId);
        if (rest.length === 0) {
          const fresh = newCart(1);
          return { carts: [fresh], activeId: fresh.id };
        }
        return { carts: rest, activeId: rest[0].id };
      });
      setPaymentRaw('cash');
      onDone();
    } catch (e: any) {
      // Omborda yetarli emas — do'konchidan so'raymiz
      if (e.message === 'customer_blocked') {
        toast.error(t('blockedCustomer'));
        return;
      }
      if (e.message === 'credit_limit_exceeded') {
        const d = e.details?.details ?? {};
        toast.error(
          t('limitExceeded'),
          t('limitDetail').replace('{limit}', fmt(d.limit ?? 0)).replace('{current}', fmt(d.current ?? 0))
        );
        return;
      }
      if (e.message === 'customer_phone_required') {
        toast.error(t('phoneRequired'));
        return;
      }
      if (e.message === 'insufficient_stock') {
        const rows: { name: string; stock: number; qty: number }[] = e.details?.items ?? [];
        const text = rows.map((r) => `${r.name}: ${t('stock')} ${r.stock}, ${t('cart')} ${r.qty}`).join('\n');
        setBusy(false);
        if (confirm(`${t('stockNotEnough')}\n\n${text}\n\n${t('sellAnyway')}`)) {
          await checkout(true);
        } else {
          toast.error(t('stockNotEnough'), rows.map((r) => r.name).join(', '));
        }
        return;
      }
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kassa-cols">
      <div className="kassa-main">
        {/* Ochiq savatlar — har bir oluvchiga alohida.
            Har birida nomi, dona soni va summasi ko'rinib turadi. */}
        <div className="cart-cards">
          {carts.map((c) => (
            <button
              key={c.id}
              className={`cart-card ${c.id === activeId ? 'on' : ''}`}
              onClick={() => selectCart(c.id)}
            >
              <div className="cc-top">
                <span className="cc-no">{c.no}</span>
                <span className="cc-name">{cartName(c)}</span>
                {c.id === activeId && <Glyph name="pencil" size={13} color="currentColor" />}
              </div>
              <div className="cc-total">{fmt(cartTotal(c))}</div>
              <div className="cc-sub">
                {c.lines.length > 0 ? `${cartQty(c)} ${t('pcs')}` : t('cartEmptyShort')}
              </div>
            </button>
          ))}
          {carts.length < MAX_CARTS && (
            <button className="cart-add" onClick={addCart} title={t('newCart')}>
              <Glyph name="plus" size={20} color="var(--accent)" />
              <span>{t('newCartShort')}</span>
            </button>
          )}
        </div>

        {/* Savat nomi — pastdan chiqadigan oyna (kompyuterda o'rtada) */}
        {renaming && (
          <div className="sheet-wrap" onClick={() => setRenaming(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <div className="sheet-title">{t('renameCart')}</div>
              <div className="sheet-sub">{t('cartNameWhy')}</div>
              <input
                autoFocus
                value={active.name}
                onChange={(e) => patchActive((c) => ({ ...c, name: e.target.value }))}
                placeholder={t('cartNamePlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)}
              />
              <button className="btn-primary btn-lg" onClick={() => setRenaming(false)}>
                <Glyph name="check" size={18} color="#fff" /> {t('save')}
              </button>
              {carts.length > 1 && (
                <button className="btn-ghost sheet-danger" onClick={() => removeCart(active.id)}>
                  <Glyph name="trash" size={16} color="var(--red)" /> {t('deleteCart')}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="search-row">
          <div className="search-field">
            <Glyph name="search" size={17} color="#8a8a8e" />
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              onKeyDown={(e) => {
                const trimmed = query.trim();
                if (e.key === 'Enter' && /^\d{6,}$/.test(trimmed)) {
                  window.clearTimeout(barcodeTimer.current);
                  handleCode(trimmed);
                }
              }}
              placeholder={t('searchProduct')}
            />
            {query && (
              <button className="search-clear" onClick={() => search('')} aria-label={t('close')}>
                <Glyph name="close" size={15} color="#8a8a8e" />
              </button>
            )}
          </div>
          <button className="scan-round" onClick={() => setScanning(true)} aria-label={t('scanner')}>
            <Glyph name="scan" size={21} color="#fff" />
          </button>
        </div>

        {scanning && (
          <Scanner
            continuous
            status={
              cart.length > 0 ? `${cartName(active)} · ${qtyTotal} ${t('pcs')} · ${fmt(total)}` : cartName(active)
            }
            onScan={async (code) => {
              // topilgan mahsulot darhol savatga tushadi — skaner ochiq qoladi
              const res = await api.lookupBarcode(code).catch(() => null);
              if (res?.product) {
                addToCart(res.product);
              } else {
                // topilmadi: skanerni yopib, kodni biriktirishga taklif qilamiz
                setScanning(false);
                handleCode(code);
              }
            }}
            onClose={() => setScanning(false)}
          />
        )}

        {pendingCode && (
          <div className="attach-banner">
            <div className="attach-head">
              <Glyph name="scan" size={17} color="var(--yellow)" />
              <span>{t('codeNotFound')}</span>
              <button className="attach-close" onClick={() => setPendingCode(null)}>
                <Glyph name="close" size={15} color="var(--muted)" />
              </button>
            </div>
            <div className="attach-code">{pendingCode}</div>
            <div className="attach-hint">{t('codeAttachHint')}</div>
          </div>
        )}

        {results.length > 0 && (
          <div className="list-group">
            {results.map((p) => (
              <div className="list-item" key={p.id} onClick={() => addToCart(p)}>
                <div className="lead">
                  <ProductThumb product={p} />
                  <div>
                    <div className="name">{p.name}</div>
                    <div className="sub" style={p.stock <= 0 ? { color: 'var(--red)' } : undefined}>
                      {t('stock')}: {p.stock} {p.unit}
                    </div>
                  </div>
                </div>
                <div className="amount">{fmt(p.sell_price)}</div>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <>
            <div className="section-title">
              {cartName(active)} · {qtyTotal} {t('pcs')}
            </div>
            <div className="list-group">
              {cart.map((l) => (
                <div className="list-item" key={l.product.id}>
                  <div className="lead">
                    <ProductThumb product={l.product} size={38} />
                    <div style={{ minWidth: 0 }}>
                      <div className="name">{l.product.name}</div>
                      <div className="sub">
                        {fmt(l.product.sell_price * l.qty)}
                        {l.qty > l.product.stock && (
                          <span style={{ color: 'var(--red)' }}>
                            {' '}· {t('stockShort')}: {l.product.stock} {l.product.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="stepper">
                    <button onClick={() => changeQty(l.product.id!, -1)}>−</button>
                    <span>{l.qty}</span>
                    <button onClick={() => changeQty(l.product.id!, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {cart.length === 0 && !results.length && (
          <div className="empty-state">
            <AppIcon glyph="cart" size={54} />
            <div className="t">{t('cartEmptyTitle')}</div>
            <div className="s">{t('cartEmptySub')}</div>
            <button
              className="btn-primary btn-lg"
              style={{ maxWidth: 280, margin: '18px auto 0' }}
              onClick={() => setScanning(true)}
            >
              <Glyph name="scan" size={20} color="#fff" /> {t('scanToSell')}
            </button>
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="checkout">
          <div className="checkout-cart">{cartName(active)}</div>
          <div className="checkout-total">
            <span>{t('total')}</span>
            <b>{fmt(total)}</b>
          </div>
          <div className="segmented sm">
            {(
              [
                ['cash', 'banknote', 'payCash'],
                ['card', 'card', 'payCard'],
                ['debt', 'book', 'payDebt'],
              ] as const
            ).map(([id, glyph, key]) => (
              <button key={id} className={payment === id ? 'on' : ''} onClick={() => { setPayment(id); haptic.select(); }}>
                <Glyph name={glyph} size={15} /> {t(key)}
              </button>
            ))}
          </div>
          {payment === 'debt' && (
            <div className="debt-fields">
              <input
                value={active.customerName}
                onChange={(e) => patchActive((c) => ({ ...c, customerName: e.target.value }))}
                placeholder={t('debtCustomerPlaceholder')}
              />
              <div className="phone-field inline">
                <span className="cc">+998</span>
                <input
                  className="phone-input"
                  value={formatPhone(active.customerPhone).replace('+998', '').trim()}
                  onChange={(e) => patchActive((c) => ({ ...c, customerPhone: phoneDigits(e.target.value) }))}
                  inputMode="tel"
                  placeholder="90 123 45 67"
                />
              </div>
              <p className="field-note">{t('phoneWhy')}</p>
            </div>
          )}
          <button className="btn-primary btn-lg" onClick={() => checkout()} disabled={busy || cart.length === 0}>
            <Glyph name="check" size={19} color="#fff" /> {t('finishSale')}
          </button>
        </div>
      )}
    </div>
  );
}

function IntakeMode({ onDone }: { onDone: () => void }) {
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [qty, setQty] = useState('');
  const [expiry, setExpiry] = useState('');
  const [category, setCategory] = useState('');
  const [cats, setCats] = useState<{ name: string }[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [codeWarning, setCodeWarning] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useT();

  useEffect(() => {
    api.categories().then(setCats).catch(() => {});
  }, []);

  async function lookupBarcode(code: string) {
    setBarcode(code);
    setCodeWarning('');
    if (code.trim().length < 6) return;
    const res = await api.lookupBarcode(code.trim()).catch(() => null);
    if (!res) return;
    // Qo'lda terilgan kodda xato bo'lsa — nazorat raqami buni ushlaydi
    if (res.valid === false) setCodeWarning(t('barcodeInvalid'));
    const known = res.product ?? res.catalog;
    if (known) setName(known.name);
    if (res.product) {
      setCostPrice(String(res.product.cost_price || ''));
      setSellPrice(String(res.product.sell_price || ''));
    }
  }

  // Kompyuterga ulangan USB skaner (masalan Honeywell): fokus qaysi
  // maydonda bo'lishidan qat'i nazar kod ushlab olinib, maydonga qo'yiladi.
  useHardwareScanner(lookupBarcode);

  function pickImage(file: File | undefined) {
    if (!file) return;
    // rasmni kichraytirib base64 qilamiz (max 800px)
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setImage(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = URL.createObjectURL(file);
  }

  async function save() {
    if (!name.trim()) {
      toast.error(t('productNameRequired'));
      return;
    }
    if (!(parseFloat(qty) > 0)) {
      toast.error(t('qtyRequired'));
      return;
    }
    setBusy(true);
    try {
      const product = await api.intake({
        barcode: barcode.trim() || undefined,
        name: name.trim(),
        cost_price: parseInt(costPrice.replace(/\D/g, ''), 10) || 0,
        sell_price: parseInt(sellPrice.replace(/\D/g, ''), 10) || 0,
        qty: parseFloat(qty) || 0,
        expiry_date: expiry || undefined,
        category: category.trim() || undefined,
        image: image ?? undefined,
      });
      toast.success(t('toastIntakeSaved'), `${product.name} · ${t('toastStockLeft')}: ${product.stock} ${product.unit}`);
      // forma yopilmaydi — keyingi tovarga tayyor turadi
      setBarcode(''); setName(''); setCostPrice(''); setSellPrice(''); setQty(''); setExpiry(''); setImage(null);
      api.categories().then(setCats).catch(() => {});
      onDone();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  const margin =
    amountValue(sellPrice) && amountValue(costPrice)
      ? amountValue(sellPrice) - amountValue(costPrice)
      : 0;

  return (
    <>
      {scanning && (
        <Scanner
          onScan={(code) => {
            setScanning(false);
            lookupBarcode(code);
          }}
          onClose={() => setScanning(false)}
          status={t('scanHint')}
        />
      )}

      {/* Mahsulot: rasm, shtrix-kod, nom */}
      <div className="form-group">
        <div className="intake-head">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => pickImage(e.target.files?.[0])}
          />
          <button className="photo-tile" onClick={() => fileRef.current?.click()}>
            {image ? <img src={image} alt="" /> : <Glyph name="camera" size={24} color="#8a8a8e" />}
            {!image && <span>{t('takePhoto')}</span>}
          </button>
          <div className="intake-head-fields">
            <div className="form-row">
              <label>{t('productName')}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coca-Cola 1.5L" />
            </div>
            <div className="form-row">
              <label>
                {t('barcodeLabel')} <span className="tag">{t('optional')}</span>
              </label>
              <div className="inline-scan">
                <input
                  className="mono"
                  value={barcode}
                  onChange={(e) => lookupBarcode(e.target.value)}
                  inputMode="numeric"
                  placeholder="4780000123456"
                />
                <button onClick={() => setScanning(true)} aria-label={t('scanner')}>
                  <Glyph name="scan" size={19} color="var(--accent)" />
                </button>
              </div>
            </div>
            <div className="form-row">
              <label>
                {t('category')} <span className="tag">{t('optional')}</span>
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="cat-list"
                placeholder={t('categoryPlaceholder')}
              />
              <datalist id="cat-list">
                {cats.map((c) => <option key={c.name} value={c.name} />)}
              </datalist>
            </div>
            {codeWarning && <p className="form-note" style={{ color: 'var(--yellow)' }}>{codeWarning}</p>}
          </div>
        </div>
      </div>

      {/* Narx va miqdor */}
      <div className="form-group">
        <div className="row-2">
          <div className="form-row">
            <label>{t('costPrice')}</label>
            <input value={formatAmount(costPrice)} onChange={(e) => setCostPrice(e.target.value)} inputMode="numeric" placeholder="10 000" />
          </div>
          <div className="form-row">
            <label>{t('sellPrice')}</label>
            <input value={formatAmount(sellPrice)} onChange={(e) => setSellPrice(e.target.value)} inputMode="numeric" placeholder="13 000" />
          </div>
        </div>
        <div className="row-2">
          <div className="form-row">
            <label>{t('qty')}</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="24" />
          </div>
          <div className="form-row">
            <label>
              {t('expiry')} <span className="tag">{t('optional')}</span>
            </label>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
        </div>
        {margin > 0 && (
          <p className="form-note">
            {t('profit')}: <b style={{ color: 'var(--green)' }}>{fmt(margin)}</b>
            {qty && ` · ${t('qty')} ${qty} → ${fmt(margin * (parseFloat(qty) || 0))}`}
          </p>
        )}
      </div>

      <button className="btn-primary btn-lg" onClick={save} disabled={busy || !name.trim()}>
        <Glyph name="check" size={19} color="#fff" /> {t('saveIntake')}
      </button>
    </>
  );
}
