import { useEffect, useRef, useState } from 'react';
import { api, fmt, Customer, Product, SaleRow, SaleDetail, ReturnsInfo, BASE } from '../api';
import { AppIcon, Glyph } from '../icons';
import Scanner from '../Scanner';
import { useHardwareScanner } from '../hardwareScanner';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import { formatAmount, amountValue, formatPhone, formatPhoneSoft, phoneDigits, phoneE164, isPhoneComplete, fmtDateTime, fmtWhen } from '../format';
import { toast, loadFailed } from '../toast';
import {
  Cart, MAX_CARTS, cartTotal, linePrice, loadCarts, newCart, nextNo, saveCarts,
} from '../carts';
import { PrintSheet, Receipt } from '../print';
import { HistoryMode } from './History';
import { ProductThumb, EmptyState, Summary, DateField } from '../ui';
import { TrustWarning } from '../trust';
import { GoalStrip } from '../goal';
import { VoiceCartSheet } from '../voiceCart';
import { priceAfter } from '../discount';
import { scanFail } from '../beep';
import { UNITS, isFractional, parseQty, qtyText, qtyWithUnit } from '../units';

export type KassaMode = 'sale' | 'intake' | 'history';

export default function Kassa({
  onDone,
  isEmployee = false,
  initialMode = 'sale',
  autoScan = 0,
}: {
  onDone: () => void;
  isEmployee?: boolean;
  initialMode?: KassaMode;
  /** "+" dan "Sotuv" tanlanganda o'sadi — skaner o'zi ochiladi */
  autoScan?: number;
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
      {mode === 'sale' && <SaleMode onDone={onDone} autoScan={autoScan} />}
      {mode === 'intake' && <IntakeMode onDone={onDone} />}
      {mode === 'history' && <HistoryMode />}
    </div>
  );
}


function SaleMode({ onDone, autoScan = 0 }: { onDone: () => void; autoScan?: number }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  // Bir nechta savat: har bir oluvchiga alohida. Yozuv localStorage'da —
  // boshqa bo'limga o'tib qaytilsa ham savat joyida qoladi.
  const [state, setState] = useState(loadCarts);
  const { carts, activeId } = state;
  const [renaming, setRenaming] = useState(false);
  const [payment, setPaymentRaw] = useState<'cash' | 'card' | 'debt'>('cash');
  // Raqam to'liq kiritilganda mijozni tanib olamiz: ismi o'zi to'ladi,
  // to'lov odati esa sotuvchiga darhol ko'rinadi
  const [known, setKnown] = useState<Customer | null>(null);
  const [scanning, setScanning] = useState(false);
  // "+" → Sotuv: qo'lda tovar turganda qidiruv maydoni emas, skaner kerak
  useEffect(() => {
    if (autoScan > 0) setScanning(true);
  }, [autoScan]);
  const [voice, setVoice] = useState(false);
  // Skanerda topilmagan kod: mahsulot tanlansa, kod o'shanga biriktiriladi
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Endigina yakunlangan sotuv — "chek chiqaraymi?" deb so'raymiz
  const [justSold, setJustSold] = useState<SaleDetail | null>(null);
  const [printing, setPrinting] = useState(false);
  // Bugungi savdo va maqsad — har sotuvdan keyin yangilanadi
  const [today, setToday] = useState({ revenue: 0, goal: 0 });
  const { t } = useT();

  const loadToday = () =>
    api
      .dashboard()
      .then((d) => setToday({ revenue: d.today.revenue, goal: d.daily_goal }))
      .catch(() => {});
  useEffect(() => {
    loadToday();
  }, []);

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

  // Qarzga sotishda raqam to'liq bo'lishi bilan mijozni bazadan qidiramiz.
  // Topilsa: ismi bo'sh bo'lsa to'ldiriladi va to'lov odati ko'rsatiladi —
  // sotuvchi qarz yozishdan OLDIN "buni kutish mumkinmi" ni ko'radi.
  const phoneDigitsNow = active.customerPhone;
  useEffect(() => {
    if (payment !== 'debt' || !isPhoneComplete(phoneDigitsNow)) {
      setKnown(null);
      return;
    }
    let cancelled = false;
    api
      .lookupCustomer(phoneE164(phoneDigitsNow))
      .then(({ customer }) => {
        if (cancelled) return;
        setKnown(customer);
        if (customer && !active.customerName.trim()) {
          patchActive((c) => ({ ...c, customerName: customer.name }));
        }
      })
      .catch(() => {
        if (!cancelled) setKnown(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payment, phoneDigitsNow]);

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

      // Tarozi bosgan yorliq: og'irlik kodning ichida turadi.
      // Bu yo'l apparat (USB) skaner uchun ham muhim — u kodni
      // qidiruv maydoniga "terib" yuboradi.
      if (res.scale) {
        setPendingCode(null);
        if (res.product && res.scale.qty > 0) {
          addToCart(res.product, res.scale.qty);
        } else {
          scanFail();
          toast.error(t('scalePluUnknown'), `PLU ${res.scale.plu}`);
        }
        setQuery('');
        setResults([]);
        return;
      }

      if (res.product) {
        setPendingCode(null);
        addToCart(res.product);
        return;
      }
      // Topilmadi — kodni eslab qolamiz va tanlash uchun ro'yxatni ochamiz.
      // Katalogda nomi bo'lsa shu nom bo'yicha, aks holda ombordagi barcha
      // mahsulot chiqadi: do'konchi tovarni topib bossa, kod o'shanga bog'lanadi.
      scanFail();
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

  async function addToCart(p: Product, addQty = 1) {
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
    // Tarozi yorlig'idan kelgan og'irlik butun son bo'lmasligi mumkin
    const want = Math.round(((inCart?.qty ?? 0) + addQty) * 1000) / 1000;

    // Qoldiqdan oshib ketmaydi: savatdagi son omborda borichadan ko'p bo'lmaydi
    if (want > p.stock) {
      toast.error(p.name, `${t('stockShort')}: ${p.stock} ${p.unit}`);
      return;
    }

    patchActive((c) => ({
      ...c,
      lines: c.lines.find((l) => l.product.id === p.id)
        ? c.lines.map((l) => (l.product.id === p.id ? { ...l, qty: want } : l))
        : [...c.lines, { product: p, qty: want }],
    }));
    toast.success(p.name, `${qtyWithUnit(want, p.unit)} · ${fmt(p.sell_price * want)} · ${cartName(cur)}`);
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

  /** Miqdorni to'g'ridan-to'g'ri qo'yish — kilogramm/litr uchun */
  function setQty(id: number, qty: number) {
    const line = cart.find((l) => l.product.id === id);
    if (!line) return;
    if (qty > line.product.stock) {
      toast.error(line.product.name, `${t('stockShort')}: ${line.product.stock} ${line.product.unit}`);
    }
    // Nolga tushsa satr o'chmaydi: do'konchi raqamni tozalab qayta
    // yozayotgan bo'lishi mumkin. O'chirish "−" orqali qoladi.
    patchActive((c) => ({
      ...c,
      lines: c.lines.map((l) => (l.product.id === id ? { ...l, qty: Math.min(qty, l.product.stock) } : l)),
    }));
  }

  const total = cartTotal(active);

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
      const sale = await api.createSale({
        items: cart.map((l) => ({ product_id: l.product.id!, qty: l.qty })),
        payment_type: payment,
        customer_name: payment === 'debt' ? active.customerName.trim() : undefined,
        customer_phone: payment === 'debt' ? phoneE164(active.customerPhone) : undefined,
        allow_negative: allowNegative || undefined,
      });
      toast.success(t('saleSaved'), `${fmt(total)}${payment === 'debt' ? ` · ${t('writtenToDebts')}` : ''}`);
      // Chek chiqaramizmi? Do'konchi har safar o'zi hal qiladi —
      // ba'zi xaridor chek so'raydi, ba'zisi yo'q
      api
        .sale(sale.id)
        .then(setJustSold)
        .catch(() => {});
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
      loadToday(); // maqsad chizig'i shu zahoti oldinga siljisin
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
      // Sozlamada ruxsat berilmagan — minusga tushirmaymiz
      if (e.message === 'stock_blocked') {
        const rows: { name: string; stock: number; qty: number }[] = e.details?.items ?? [];
        toast.error(
          t('stockBlocked'),
          rows.map((r) => `${r.name}: ${t('stock')} ${r.stock}`).join(', ')
        );
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
        {/* Bugungi maqsad — kassada turgan sotuvchi kun davomida
            "yana qancha qoldi" ni ko'rib turadi */}
        <GoalStrip revenue={today.revenue} goal={today.goal} />

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
                {c.lines.length > 0 ? `${c.lines.length} ${t('itemsShort')}` : t('cartEmptyShort')}
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

        {/* Sotuv yakunlandi — chek chiqaraymizmi? */}
        {justSold && (
          <div className="sheet-wrap" onClick={() => setJustSold(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <div className="sold-mark">
                <Glyph name="check" size={30} color="#fff" strokeWidth={3} />
              </div>
              <div className="sheet-title center">{t('saleSaved')}</div>
              <div className="sold-total">{fmt(justSold.total)}</div>
              <div className="sheet-sub center">{t('printAsk')}</div>
              <button className="btn-primary btn-lg" onClick={() => setPrinting(true)}>
                <Glyph name="note" size={18} color="#fff" /> {t('printReceipt')}
              </button>
              <button className="btn-ghost" onClick={() => setJustSold(null)}>
                {t('printSkip')}
              </button>
            </div>
          </div>
        )}

        {printing && justSold && (
          <PrintSheet
            onDone={() => {
              setPrinting(false);
              setJustSold(null);
            }}
          >
            <Receipt
              t={t}
              data={{
                id: justSold.id,
                created_at: justSold.created_at,
                total: justSold.total,
                payment_type: justSold.payment_type,
                items: justSold.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, unit: i.unit })),
                shop: justSold.shop,
                customer: justSold.customer,
                seller: justSold.seller,
              }}
            />
          </PrintSheet>
        )}

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
          {/* Ovoz bilan: "uch dona non, bitta sut" deb aytish bilan savat to'ladi */}
          <button className="mic-round" onClick={() => setVoice(true)} aria-label={t('voiceCartTitle')}>
            <Glyph name="mic" size={20} color="#fff" />
          </button>
          <button className="scan-round" onClick={() => setScanning(true)} aria-label={t('scanner')}>
            <Glyph name="scan" size={21} color="#fff" />
          </button>
        </div>

        {voice && (
          <VoiceCartSheet
            onClose={() => setVoice(false)}
            onAdd={(items) => {
              // Bir necha satr birdan qo'shiladi: qoldiqdan oshsa
              // borichasi olinadi, do'konchi keyin o'zi to'g'rilaydi
              patchActive((c) => {
                let lines = c.lines;
                for (const { product, qty } of items) {
                  const have = lines.find((l) => l.product.id === product.id);
                  // Qoldiq noma'lum bo'lsa cheklamaymiz — Math.min(x, undefined)
                  // butun summani NaN qilib yuborardi
                  const limit = Number.isFinite(product.stock) ? product.stock : Infinity;
                  const want = Math.min((have?.qty ?? 0) + qty, limit);
                  if (!(want > 0)) continue;
                  lines = have
                    ? lines.map((l) => (l.product.id === product.id ? { ...l, qty: want } : l))
                    : [...lines, { product, qty: want }];
                }
                return { ...c, lines };
              });
            }}
          />
        )}

        {scanning && (
          <Scanner
            continuous
            status={
              cart.length > 0 ? `${cartName(active)} · ${cart.length} ${t('itemsShort')} · ${fmt(total)}` : cartName(active)
            }
            onScan={async (code) => {
              // topilgan mahsulot darhol savatga tushadi — skaner ochiq qoladi
              const res = await api.lookupBarcode(code).catch(() => null);
              // Tarozi bosgan yorliq: og'irlik kodning ichida — sotuvchi
              // hech narsa yozmaydi, miqdor o'zi qo'yiladi
              if (res?.scale && res.product && res.scale.qty > 0) {
                addToCart(res.product, res.scale.qty);
              } else if (res?.scale && !res.product) {
                setScanning(false);
                scanFail();
                toast.error(t('scalePluUnknown'), `PLU ${res.scale.plu}`);
              } else if (res?.product) {
                addToCart(res.product);
              } else {
                // topilmadi: skanerni yopib, kodni biriktirishga taklif qilamiz
                setScanning(false);
                scanFail();
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
                {/* Chegirma bo'lsa eski narx chizilgan holda qoladi —
                    sotuvchi ham, xaridor ham farqni ko'radi */}
                {(p.discount_percent ?? 0) > 0 ? (
                  <div style={{ textAlign: 'right' }}>
                    <div className="amount" style={{ color: 'var(--green)' }}>
                      {fmt(priceAfter(p.sell_price, p.discount_percent!))}
                    </div>
                    <div className="sub old-price">{fmt(p.sell_price)}</div>
                  </div>
                ) : (
                  <div className="amount">{fmt(p.sell_price)}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <>
            <div className="section-title">
              {cartName(active)} · {cart.length} {t('itemsShort')}
            </div>
            <div className="list-group">
              {cart.map((l) => (
                <div className="list-item" key={l.product.id}>
                  <div className="lead">
                    <ProductThumb product={l.product} size={38} />
                    <div style={{ minWidth: 0 }}>
                      <div className="name">{l.product.name}</div>
                      <div className="sub">
                        {fmt(linePrice(l.product) * l.qty)}
                        {(l.product.discount_percent ?? 0) > 0 && (
                          <span className="badge sale">−{l.product.discount_percent}%</span>
                        )}
                        {l.qty > l.product.stock && (
                          <span style={{ color: 'var(--red)' }}>
                            {' '}· {t('stockShort')}: {l.product.stock} {l.product.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Kilogramm/litrda miqdor yoziladi: tarozidagi 1.35 kg ni
                      "+" bilan terib bo'lmaydi */}
                  <div className="stepper">
                    <button onClick={() => changeQty(l.product.id!, -1)}>−</button>
                    {isFractional(l.product.unit) ? (
                      <input
                        className="st-qty"
                        value={qtyText(l.qty)}
                        inputMode="decimal"
                        onChange={(e) => setQty(l.product.id!, parseQty(e.target.value.replace(/[^\d.,]/g, ''), l.product.unit))}
                        aria-label={l.product.name}
                      />
                    ) : (
                      <span>{l.qty}</span>
                    )}
                    {isFractional(l.product.unit) && <span className="st-unit">{l.product.unit}</span>}
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
              {known && <TrustWarning trust={known.trust} name={known.name} />}
              {known && known.balance > 0 && (
                <p className="field-note">
                  {t('knownCustomerDebt')}: <b style={{ color: 'var(--red)' }}>{fmt(known.balance)}</b>
                </p>
              )}
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
  // Sabzi, semichka, go'sht — kilogrammda. Ilgari hammasi "dona" bo'lib
  // qolardi va omborda "1.5 dona sabzi" kabi ma'nosiz yozuv paydo bo'lardi.
  const [unit, setUnit] = useState<string>('dona');
  // Narx qanday kiritiladi. Do'konchi qop semichkani "25 kg olдim,
  // 200 ming to'ladim" deb biladi — 1 kg qancha turishini o'zi
  // hisoblab o'tirmasligi kerak.
  const [priceMode, setPriceMode] = useState<'unit' | 'total'>('unit');
  const [totalCost, setTotalCost] = useState('');
  const [expiry, setExpiry] = useState('');
  const [category, setCategory] = useState('');
  const [cats, setCats] = useState<{ name: string }[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [voice, setVoice] = useState(false);
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
    if (!(parseQty(qty, unit) > 0)) {
      toast.error(t('qtyRequired'));
      return;
    }
    setBusy(true);
    try {
      const product = await api.intake({
        barcode: barcode.trim() || undefined,
        name: name.trim(),
        cost_price: unitCost,
        sell_price: unitSell,
        unit,
        qty: parseQty(qty, unit),
        expiry_date: expiry || undefined,
        category: category.trim() || undefined,
        image: image ?? undefined,
      });
      toast.success(t('toastIntakeSaved'), `${product.name} · ${t('toastStockLeft')}: ${product.stock} ${product.unit}`);
      // forma yopilmaydi — keyingi tovarga tayyor turadi
      // Birlik saqlanib qoladi: do'konchi odatda bir turdagi tovarni
      // ketma-ket kiritadi (bir necha xil sabzavot, keyin ichimliklar)
      setBarcode(''); setName(''); setCostPrice(''); setSellPrice(''); setTotalCost(''); setQty(''); setExpiry(''); setImage(null);
      api.categories().then(setCats).catch(() => {});
      onDone();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  // Bazada narx HAR DOIM bitta birlik uchun saqlanadi. "Jami summa"
  // usuli tanlansa uni miqdorga bo'lib olamiz — do'konchiga qulay,
  // hisob esa o'zgarmaydi.
  const qtyNum = parseQty(qty, unit);
  const unitCost =
    priceMode === 'total'
      ? qtyNum > 0
        ? Math.round(amountValue(totalCost) / qtyNum)
        : 0
      : amountValue(costPrice);
  const unitSell = amountValue(sellPrice);
  const margin = unitSell && unitCost ? unitSell - unitCost : 0;

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

      {/* Miqdor va narx.
          Tartib ataylab shunday: avval birlik, keyin qancha kelgani,
          oxirida narx. Narx qaysi birlik uchun ekani shundagina
          aniq bo'ladi — ilgari "Kirim narxi" deb yozilgan-u, u bir
          qopning narximi yoki bir kilonikimi ko'rinmasdi. */}
      <div className="form-group">
        <div className="form-row">
          <label>{t('unitLabel')}</label>
          <div className="chip-row">
            {UNITS.map((u) => (
              <button key={u} className={`chip ${unit === u ? 'on' : ''}`} onClick={() => setUnit(u)}>
                {t(`unit_${u}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="row-2">
          <div className="form-row">
            <label>{t('qtyArrived')} ({t(`unit_${unit}`)})</label>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))}
              inputMode="decimal"
              placeholder={isFractional(unit) ? '25' : '24'}
            />
          </div>
          <div className="form-row">
            <label>
              {t('expiry')} <span className="tag">{t('optional')}</span>
            </label>
            <DateField value={expiry} onChange={setExpiry} ariaLabel={t('expiry')} />
          </div>
        </div>

        {/* Narxni ikki xil kiritish mumkin. Qop, quti yoki meshda
            olinganda do'konchi jami to'lagan pulini biladi, bir
            kilosini emas — bo'lishni ilova o'zi qiladi. */}
        <div className="form-row">
          <label>{t('priceHow')}</label>
          <div className="chip-row">
            <button className={`chip ${priceMode === 'unit' ? 'on' : ''}`} onClick={() => setPriceMode('unit')}>
              1 {t(`unit_${unit}`)} {t('perUnitSuffix')}
            </button>
            <button className={`chip ${priceMode === 'total' ? 'on' : ''}`} onClick={() => setPriceMode('total')}>
              {t('totalPaid')}
            </button>
          </div>
        </div>

        <div className="row-2">
          <div className="form-row">
            <label>
              {priceMode === 'total'
                ? t('totalPaid')
                : `${t('costPrice')} (1 ${t(`unit_${unit}`)})`}
            </label>
            {priceMode === 'total' ? (
              <input
                value={formatAmount(totalCost)}
                onChange={(e) => setTotalCost(e.target.value)}
                inputMode="numeric"
                placeholder="200 000"
              />
            ) : (
              <input
                value={formatAmount(costPrice)}
                onChange={(e) => setCostPrice(e.target.value)}
                inputMode="numeric"
                placeholder="10 000"
              />
            )}
          </div>
          <div className="form-row">
            <label>{t('sellPrice')} (1 {t(`unit_${unit}`)})</label>
            <input value={formatAmount(sellPrice)} onChange={(e) => setSellPrice(e.target.value)} inputMode="numeric" placeholder="13 000" />
          </div>
        </div>

        {/* Xulosa — kiritilgan raqamlar qanday tushunilganini ochiq
            ko'rsatadi. Xato shu yerda darrov ko'zga tashlanadi. */}
        {(qtyNum > 0 || unitCost > 0) && (
          <div className="intake-sum">
            {qtyNum > 0 && (
              <div className="is-row">
                <span>{t('intakeToStock')}</span>
                <b>{qtyText(qtyNum)} {t(`unit_${unit}`)}</b>
              </div>
            )}
            {unitCost > 0 && (
              <div className="is-row">
                <span>1 {t(`unit_${unit}`)} {t('costsWord')}</span>
                <b>{fmt(unitCost)}</b>
              </div>
            )}
            {priceMode === 'unit' && qtyNum > 0 && unitCost > 0 && (
              <div className="is-row">
                <span>{t('totalPaid')}</span>
                <b>{fmt(unitCost * qtyNum)}</b>
              </div>
            )}
            {margin > 0 && (
              <div className="is-row total">
                <span>{t('profit')}</span>
                <b style={{ color: 'var(--green)' }}>
                  {fmt(margin)} / {t(`unit_${unit}`)}
                  {qtyNum > 0 ? ` · ${t('allOf')} ${fmt(margin * qtyNum)}` : ''}
                </b>
              </div>
            )}
            {margin < 0 && unitCost > 0 && unitSell > 0 && (
              <div className="is-row total">
                <span style={{ color: 'var(--red)' }}>{t('sellBelowCost')}</span>
                <b style={{ color: 'var(--red)' }}>{fmt(margin)}</b>
              </div>
            )}
          </div>
        )}
      </div>

      <button className="btn-primary btn-lg" onClick={save} disabled={busy || !name.trim()}>
        <Glyph name="check" size={19} color="#fff" /> {t('saveIntake')}
      </button>
    </>
  );
}
