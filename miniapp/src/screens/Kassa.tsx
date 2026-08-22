import { useEffect, useRef, useState } from 'react';
import { api, fmt, CatalogProduct, Customer, Product, SaleRow, SaleDetail, ReturnsInfo, BASE } from '../api';
import { AppIcon, Glyph } from '../icons';
import Scanner from '../Scanner';
import { useHardwareScanner } from '../hardwareScanner';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import { can } from '../perms';
import { formatAmount, amountValue, formatPhone, formatPhoneSoft, phoneDigits, phoneE164, isPhoneComplete, fmtDateTime, fmtWhen } from '../format';
import { toast, loadFailed } from '../toast';
import {
  Cart, MAX_CARTS, cartTotal, linePrice, loadCarts, newCart, nextNo, saveCarts,
} from '../carts';
import { PrintSheet, Receipt, Labels } from '../print';
import { ean13Svg } from '../ean13';
import { qrSvg } from '../qr';
import { HistoryMode } from './History';
import { ProductThumb, EmptyState, Summary, DateField } from '../ui';
import { TrustWarning } from '../trust';
import { GoalStrip } from '../goal';
import { VoiceCartSheet } from '../voiceCart';
import { priceAfter } from '../discount';
import { goldShop, goldPrice, goldFieldPrice, goldPrices, goldLine, shopInfo, profile, examples, exampleText, PROBAS } from '../shopTypes';
import { scanFail } from '../beep';
import {
  STOCK_UNITS, isFractional, parseQty, qtyText, qtyWithUnit,
  priceBases, basisOf, basisText, priceForBasis, priceLabel, PriceBasis,
} from '../units';
import { useEscape } from '../useEscape';

export type KassaMode = 'sale' | 'intake' | 'history';

export default function Kassa({
  onDone,
  isEmployee = false,
  initialMode = 'sale',
  autoScan = 0,
  fromCatalog = null,
  onCatalogUsed,
}: {
  onDone: () => void;
  isEmployee?: boolean;
  initialMode?: KassaMode;
  /** "+" dan "Sotuv" tanlanganda o'sadi — skaner o'zi ochiladi */
  autoScan?: number;
  /** Markaziy katalogdan tanlangan tovar — kirim maydonlarini to'ldiradi */
  fromCatalog?: CatalogProduct | null;
  onCatalogUsed?: () => void;
}) {
  const [mode, setMode] = useState<KassaMode>(initialMode);
  const { t } = useT();

  // Tezkor amallardan "Tovar kirimi" tanlansa — o'sha bo'lim ochiladi.
  // Ruxsati bo'lmasa oddiy sotuvga qaytariladi.
  const mayIntake = can('intake');
  useEffect(() => {
    setMode(!mayIntake && initialMode === 'intake' ? 'sale' : initialMode);
  }, [initialMode, mayIntake]);

  return (
    <div className="screen">
      <div className="segmented">
        <button className={mode === 'sale' ? 'on' : ''} onClick={() => { setMode('sale'); haptic.select(); }}>
          <Glyph name="cart" size={16} /> {t('modeSale')}
        </button>
        {mayIntake && (
          <button className={mode === 'intake' ? 'on' : ''} onClick={() => { setMode('intake'); haptic.select(); }}>
            <Glyph name="box" size={16} /> {t('modeIntake')}
          </button>
        )}
        <button className={mode === 'history' ? 'on' : ''} onClick={() => { setMode('history'); haptic.select(); }}>
          <Glyph name="clock" size={16} /> {t('modeHistory')}
        </button>
      </div>
      {mode === 'sale' && <SaleMode onDone={onDone} autoScan={autoScan} />}
      {mode === 'intake' && <IntakeMode onDone={onDone} fromCatalog={fromCatalog} onCatalogUsed={onCatalogUsed} />}
      {mode === 'history' && <HistoryMode />}
    </div>
  );
}


function SaleMode({ onDone, autoScan = 0 }: { onDone: () => void; autoScan?: number }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  // Savatda qo'lda yozilayotgan miqdor matni (tovar id -> matn).
  // Songa aylantirilmagan holda turadi, aks holda "1," ni yozib
  // bo'lmasdi. Maydondan chiqilganda tozalanadi.
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({});
  // Bir nechta savat: har bir oluvchiga alohida. Yozuv localStorage'da —
  // boshqa bo'limga o'tib qaytilsa ham savat joyida qoladi.
  const [state, setState] = useState(loadCarts);
  const { carts, activeId } = state;
  const [renaming, setRenaming] = useState(false);
  useEscape(() => setRenaming(false), renaming);
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
  useEscape(() => setJustSold(null), !!justSold);
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
    // Kilogramm/litrda "+" bir kilodan sakrash noqulay: xaridor 1,5 kg
    // ham oladi. Shuning uchun bunday tovarlarda qadam yarim birlik.
    const step = isFractional(line.product.unit) ? 0.5 : 1;
    const qty = Math.round((line.qty + delta * step) * 1000) / 1000;
    setQtyDraft((d) => { const n = { ...d }; delete n[id]; return n; });
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

  /**
   * Miqdorni qo'lda yozish — kilogramm/litr uchun.
   *
   * Yozilayotgan matn alohida saqlanadi (qtyDraft). Ilgari maydon
   * to'g'ridan-to'g'ri songa bog'langan edi va "1," yozilishi bilan u
   * 1 ga aylanib qaytardi — keyin "5" bosilsa 15 chiqardi, ya'ni 1,5 kg
   * ni umuman kiritib bo'lmasdi.
   */
  function typeQty(id: number, text: string, unit: string) {
    const clean = text.replace(/[^\d.,]/g, '');
    setQtyDraft((d) => ({ ...d, [id]: clean }));
    setQty(id, parseQty(clean, unit));
  }

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
                    {/* Zargarlikda buyumning o'zi muhim: proba va massa
                        nomdan ham ko'proq narsa aytadi */}
                    {goldLine(p) && <div className="sub">{goldLine(p)}</div>}
                    <div className="sub" style={p.stock <= 0 ? { color: 'var(--red)' } : undefined}>
                      {t('stock')}: {qtyWithUnit(p.stock, p.unit)}
                    </div>
                  </div>
                </div>
                {/* Narx do'konchi aytadigan ko'rinishda: "15 000 / 100 g".
                    Chegirma bo'lsa eski narx chizilgan holda qoladi —
                    sotuvchi ham, xaridor ham farqni ko'radi */}
                {(p.discount_percent ?? 0) > 0 ? (
                  <div style={{ textAlign: 'right' }}>
                    <div className="amount" style={{ color: 'var(--green)' }}>
                      {priceLabel(priceAfter(p.sell_price, p.discount_percent!), p.unit, p.price_qty)}
                    </div>
                    <div className="sub old-price">{priceLabel(p.sell_price, p.unit, p.price_qty)}</div>
                  </div>
                ) : (
                  <div className="amount">{priceLabel(p.sell_price, p.unit, p.price_qty)}</div>
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
                      {goldLine(l.product) && <div className="sub">{goldLine(l.product)}</div>}
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
                  {/* Kilogramm/litrda miqdor qo'lda yoziladi: xaridor 1,5
                      yoki 1,3 kg olishi mumkin, buni "+" bilan terib
                      bo'lmaydi. Maydon ko'rinib turadi — bosish mumkinligi
                      bilinsin. "+/−" esa yarim birlikdan yuradi. */}
                  <div className={`stepper ${isFractional(l.product.unit) ? 'frac' : ''}`}>
                    <button onClick={() => changeQty(l.product.id!, -1)}>−</button>
                    {isFractional(l.product.unit) ? (
                      <label className="st-box">
                        <input
                          className="st-qty"
                          value={qtyDraft[l.product.id!] ?? qtyText(l.qty)}
                          inputMode="decimal"
                          // Har bosilganda eski raqam belgilanadi — yangisi
                          // uning ustiga qo'shilib "21,4" bo'lib ketmasin.
                          // onFocus yetmaydi: maydon allaqachon fokusda
                          // bo'lsa qayta bosilganda u umuman ishlamaydi.
                          onFocus={(e) => e.currentTarget.select()}
                          onClick={(e) => e.currentTarget.select()}
                          onChange={(e) => typeQty(l.product.id!, e.target.value, l.product.unit)}
                          onBlur={() =>
                            setQtyDraft((d) => { const n = { ...d }; delete n[l.product.id!]; return n; })
                          }
                          aria-label={l.product.name}
                        />
                        <span className="st-unit">{l.product.unit}</span>
                      </label>
                    ) : (
                      <span>{l.qty}</span>
                    )}
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
            )
              // Qarzga sotish alohida ruxsat: ruxsati yo'q xodim faqat
              // naqd va karta bilan sotadi
              .filter(([id]) => id !== 'debt' || can('pos_debt'))
              .map(([id, glyph, key]) => (
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

function IntakeMode({
  onDone,
  fromCatalog = null,
  onCatalogUsed,
}: {
  onDone: () => void;
  fromCatalog?: CatalogProduct | null;
  onCatalogUsed?: () => void;
}) {
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  // Yakka buyumli do'konda (zargarlik, telefon) miqdor deyarli har
  // doim 1 — har safar qo'lda yozib o'tirmasin
  const [qty, setQty] = useState(() => (profile().unique ? '1' : ''));
  // OMBOR birligi: tovar qanday kelgan va qanday hisobga olinadi.
  // Sabzi, semichka, go'sht — kilogrammda; ilgari hammasi "dona" bo'lib
  // qolardi va omborda "1.5 dona sabzi" kabi ma'nosiz yozuv chiqardi.
  const [unit, setUnit] = useState<string>(() => profile().units[0] ?? 'dona');
  // NARX birligi: narx qaysi miqdorga aytilgan. Bular ikki xil narsa —
  // "10 kg keldi, 100 grami 15 ming" degan gap eng oddiy holat. Ilgari
  // bittasi ikkinchisini ergashtirib ketardi va grammni tanlagan
  // do'konchi kelgan tovarni ham grammda yozishga majbur bo'lardi.
  const [basis, setBasis] = useState<PriceBasis>(() => priceBases('dona')[0]);
  // Kirim narxi ikki ko'rinishda: tanlangan asos uchun va jami.
  // Ikkalasi ham yoziladigan maydon, biri o'zgarsa ikkinchisi o'zi
  // hisoblanadi — do'konchi qopni "25 kg, 200 ming" deb ham,
  // "100 grami 15 ming" deb ham kiritishi mumkin.
  const [totalDraft, setTotalDraft] = useState<string | null>(null);
  const [expiry, setExpiry] = useState('');
  const [category, setCategory] = useState('');
  const [cats, setCats] = useState<{ name: string }[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Zargarlik buyumi — yorliqdagi to'rt qator (Проба, Размер, Масса,
  // Вставка). Faqat oltin do'konida ko'rinadi.
  const gold = goldShop();
  // Do'kon turi ekranni yig'adi: qaysi birliklar, srok kerakmi,
  // har buyum yakkami. Bir joyda — shopTypes.ts dagi jadval.
  const prof = profile();
  const units = prof.units;
  // Bo'sh maydondagi kulrang namunalar ham turga qarab: zargarlik
  // do'konchisi "Coca-Cola 1.5L" degan namunani ko'rmasin
  const exNum = examples();
  const ex = {
    ...exNum,
    // "Jami to'landi" — miqdor × kirim narxi
    total: formatAmount(String((Number(exNum.qty.replace(/\D/g, '')) || 1) * (Number(exNum.cost.replace(/\D/g, '')) || 0))),
  };
  const [proba, setProba] = useState('585');
  // Yorliq oynasi: qaysi tovar uchun, nechta nusxa va chop etish
  const [labelFor, setLabelFor] = useState<Product | null>(null);
  useEscape(() => setLabelFor(null), !!labelFor);
  const [labelQty, setLabelQty] = useState(gold ? 1 : 8);
  const [printing, setPrinting] = useState(false);
  const [weight, setWeight] = useState('');
  const [size, setSize] = useState('');
  const [stone, setStone] = useState('');

  const [voice, setVoice] = useState(false);
  const [codeWarning, setCodeWarning] = useState('');
  // Nom bo'yicha topilgan tovarlar. Kod bo'lmasa ham eski tovarga
  // kirim qilish kerak: aks holda "Coca-Cola" ikkinchi marta yozilib,
  // qoldiq ikkiga bo'linib ketardi.
  const [matches, setMatches] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Product | null>(null);
  // Markaziy katalogdan tanlangan yozuv — nomi va o'lchami tayyor keladi
  const [fromCat, setFromCat] = useState<CatalogProduct | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useT();

  useEffect(() => {
    api.categories().then(setCats).catch(() => {});
  }, []);

  // Katalogdan tovar tanlangan bo'lsa — maydonlar to'ldiriladi.
  // Narx va miqdor to'ldirilmaydi: ular har do'konda o'ziniki.
  useEffect(() => {
    if (!fromCat) return;
    setName(fromCat.name_uz);
    setUnit(fromCat.unit || 'dona');
    setBasis(priceBases(fromCat.unit || 'dona')[0]);
    if (fromCat.barcode) setBarcode(fromCat.barcode);
    if (fromCat.category_uz) setCategory(fromCat.category_uz);
    setCostPrice('');
    setSellPrice('');
    setTotalDraft(null);
    setPicked(null);
    setMatches([]);
  }, [fromCat]);

  useEffect(() => {
    if (!fromCatalog) return;
    setFromCat(fromCatalog);
    onCatalogUsed?.();
  }, [fromCatalog]);

  // Yozilayotgan nom bo'yicha qidiramiz. Do'konchi tez yozadi —
  // har harfda so'rov yubormaslik uchun kutib turamiz.
  useEffect(() => {
    const q = name.trim();
    // Yakka buyumli do'konda (zargarlik, telefon) nom bo'yicha taklif
    // ZARARLI: ikkita "Uzuk" — biri 4.6 g 585, ikkinchisi 3.1 g 750 —
    // butunlay boshqa buyum. Ro'yxatdan tanlansa eski buyumning
    // birkasi ham ko'chirilardi va server o'sha kod bo'yicha birlashtirib,
    // yangi buyumning probasi bilan massasini yo'qotardi.
    if (prof.unique || picked?.name === q || q.length < 2) {
      setMatches([]);
      return;
    }
    const id = setTimeout(() => {
      api
        .products({ q })
        .then((rows) => setMatches(rows.slice(0, 6)))
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(id);
  }, [name, picked]);

  /** Ro'yxatdan tanlandi — tovarning o'z birligi va narxlari bilan ochiladi */
  function pickProduct(p: Product) {
    setPicked(p);
    setMatches([]);
    setName(p.name);
    if (p.barcode) setBarcode(p.barcode);
    if (p.category) setCategory(p.category);
    const u = p.unit || 'dona';
    const b = basisOf(u, p.price_qty);
    setUnit(u);
    setBasis(b);
    setCostPrice(p.cost_price ? String(priceForBasis(p.cost_price, b.qty)) : '');
    setSellPrice(p.sell_price ? String(priceForBasis(p.sell_price, b.qty)) : '');
    setTotalDraft(null);
  }

  async function lookupBarcode(code: string) {
    setBarcode(code);
    setCodeWarning('');
    if (code.trim().length < 6) return;
    const res = await api.lookupBarcode(code.trim()).catch(() => null);
    if (!res) return;
    // Qo'lda terilgan kodda xato bo'lsa — nazorat raqami buni ushlaydi
    // Zargarlik birkasidagi raqam zavod GTIN'i emas — nazorat raqami
    // to'g'ri kelmagani xato emas, shuning uchun ogohlantirmaymiz
    if (res.valid === false && !gold) setCodeWarning(t('barcodeInvalid'));
    const known = res.product ?? res.catalog;
    if (known) setName(known.name);
    if (res.product) {
      // Tovar allaqachon bor — uning o'z birligi va narx asosi bilan
      // ochiladi, aks holda "1 kg 150 ming" narx "100 g" maydoniga
      // tushib qolardi
      const u = res.product.unit || 'dona';
      const b = basisOf(u, res.product.price_qty);
      setUnit(u);
      setBasis(b);
      setCostPrice(res.product.cost_price ? String(priceForBasis(res.product.cost_price, b.qty)) : '');
      setSellPrice(res.product.sell_price ? String(priceForBasis(res.product.sell_price, b.qty)) : '');
      setTotalDraft(null);
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

  /** Bo'sh ichki kod olib, maydonga qo'yadi */
  async function makeCode() {
    try {
      const r = await api.newBarcode();
      setBarcode(r.barcode);
      setCodeWarning('');
      haptic.select();
    } catch (e: any) {
      toast.error(t('error'), e.details?.message ?? e.message);
    }
  }

  /**
   * Kirimni saqlash.
   *
   * `withLabel` — saqlangandan keyin yorliq oynasi ochiladi. Yorliq
   * uchun kod kerak, kod esa tovar saqlanganda biriktiriladi; shuning
   * uchun avval saqlanadi, keyin chop etiladi.
   */
  async function save(withLabel = false) {
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
        // Serverga har doim 1 ombor birligi uchun narx ketadi
        cost_price: Math.round(unitCost),
        sell_price: Math.round(unitSell),
        unit,
        price_qty: basis.qty,
        qty: parseQty(qty, unit),
        expiry_date: expiry || undefined,
        category: category.trim() || undefined,
        image: image ?? undefined,
        catalog_id: fromCat?.id,
        // Zargarlik: yorliqdan ko'chirilgan ma'lumot
        ...(gold
          ? {
              proba,
              weight_g: Number(String(weight).replace(',', '.')) || undefined,
              size: size.trim() || undefined,
              stone: stone.trim() || undefined,
            }
          : {}),
      });
      toast.success(
        t('toastIntakeSaved'),
        `${product.name} · ${t('toastStockLeft')}: ${qtyWithUnit(product.stock, product.unit)} · ${priceLabel(product.sell_price, product.unit, product.price_qty)}`
      );
      // Yorliq so'ralgan bo'lsa — saqlangan tovarning O'ZI bilan
      // ochamiz: kod, narx va (zargarlikda) proba/massa serverdan
      // qaytgan yozuvdan olinadi
      if (withLabel) setLabelFor(product);
      // forma yopilmaydi — keyingi tovarga tayyor turadi
      // Birlik va narx asosi saqlanib qoladi: do'konchi odatda bir
      // turdagi tovarni ketma-ket kiritadi (bir necha xil sabzavot,
      // keyin ichimliklar)
      setBarcode(''); setName(''); setCostPrice(''); setSellPrice(''); setTotalDraft(null); setQty(prof.unique ? '1' : ''); setExpiry(''); setImage(null); setFromCat(null);
      // Buyum maydonlari ham bo'shaydi: har bir zargarlik buyumi o'ziga
      // xos, oldingisining massasi yangisiga o'tib qolmasin
      setWeight(''); setSize(''); setStone('');
      api.categories().then(setCats).catch(() => {});
      onDone();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  // Bazada narx HAR DOIM 1 ombor birligi uchun saqlanadi — sotuv,
  // qaytarish va hisobot shunga tayanadi. Ekranda esa do'konchi qanday
  // o'ylasa shunday: "100 grami 15 000". Ikkalasining orasidagi
  // ko'prik — basis.qty.
  const qtyNum = parseQty(qty, unit);
  const basisCost = amountValue(costPrice);
  const basisSell = amountValue(sellPrice);
  const unitCost = basisCost ? basisCost / basis.qty : 0;
  const unitSell = basisSell ? basisSell / basis.qty : 0;
  const basisMargin = basisSell && basisCost ? basisSell - basisCost : 0;
  const margin = unitSell && unitCost ? unitSell - unitCost : 0;
  const bases = priceBases(unit);
  // Buyum narxi: massa × probasining gramm narxi. Do'konchi qo'lda
  // boshqa narx yozsa (ishlov haqi qo'shilgan bo'lishi mumkin) —
  // o'shanisi qoladi, bu faqat taklif.
  const gramPrice = gold ? goldPrices(shopInfo())[proba] ?? 0 : 0;
  const goldSum = gold ? goldPrice(shopInfo(), proba, Number(String(weight).replace(',', '.'))) : null;
  // "Jami" maydoni: yozilayotgan bo'lsa o'sha matn, aks holda hisoblangani
  const totalShown =
    totalDraft ?? (qtyNum > 0 && unitCost > 0 ? String(Math.round(unitCost * qtyNum)) : '');

  /** Narx asosini almashtirish: 1 birlik narxi o'zgarmaydi, faqat
      ko'rinishi — "100 g = 15 000" dan "1 kg = 150 000" ga o'tadi */
  function pickBasis(next: PriceBasis) {
    const conv = (txt: string) => {
      const v = amountValue(txt);
      return v ? String(Math.round((v / basis.qty) * next.qty)) : txt;
    };
    setCostPrice(conv(costPrice));
    setSellPrice(conv(sellPrice));
    setBasis(next);
  }

  /** Massa yoki proba o'zgarsa sotuv narxi qayta hisoblanadi.
   *  Do'konchi narxni QO'LDA yozgan bo'lsa tegilmaydi. */
  function setGold(next: { proba?: string; weight?: string }) {
    const p = next.proba ?? proba;
    const w = next.weight ?? weight;
    if (next.proba !== undefined) setProba(p);
    if (next.weight !== undefined) setWeight(w.replace(/[^\d.,]/g, ''));
    // Narx maydoni ombor birligiga bog'liq: 'gramm' da u "1 gramm
    // qancha" degani, 'dona' da esa butun buyum narxi
    const auto = goldFieldPrice(shopInfo(), p, Number(String(w).replace(',', '.')), unit);
    // Avvalgi taklif turgan bo'lsa yoki maydon bo'sh bo'lsa yangilaymiz
    const prev = goldFieldPrice(shopInfo(), proba, Number(String(weight).replace(',', '.')), unit);
    if (auto && (!sellPrice || amountValue(sellPrice) === prev)) setSellPrice(String(auto));
  }

  /** Ombor birligi almashsa narx asosi ham unga mos ro'yxatdan olinadi */
  function pickUnit(u: string) {
    setUnit(u);
    if (u !== unit) pickBasis(priceBases(u)[0]);
  }

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
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setPicked(null);
                  if (fromCat && e.target.value !== fromCat.name_uz) setFromCat(null);
                }}
                placeholder={exampleText('Name')}
              />
              {matches.length > 0 && (
                <div className="name-matches">
                  <div className="nm-head">{t('intakeExisting')}</div>
                  {matches.map((p) => (
                    <button key={p.id} className="nm-item" onClick={() => pickProduct(p)}>
                      <span className="nm-name">{p.name}</span>
                      <span className="nm-sub">
                        {t('leftShort')}: {qtyWithUnit(p.stock, p.unit)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {picked && !fromCat && (
                <div className="nm-picked">
                  <Glyph name="check" size={14} color="var(--green)" /> {t('intakeAddsTo')}
                </div>
              )}
              {fromCat && (
                <div className="nm-picked cat">
                  <Glyph name="star" size={14} color="var(--accent)" /> {t('intakeFromCatalog')}
                  <button className="nm-drop" onClick={() => setFromCat(null)}>{t('cancel')}</button>
                </div>
              )}
            </div>
            <div className="form-row">
              <label>
                {gold ? t('tagLabel') : t('barcodeLabel')} <span className="tag">{t('optional')}</span>
              </label>
              <div className="inline-scan">
                <input
                  className="mono"
                  value={barcode}
                  onChange={(e) => lookupBarcode(e.target.value)}
                  inputMode="numeric"
                  placeholder={ex.code}
                />
                <button onClick={() => setScanning(true)} aria-label={t('scanner')}>
                  <Glyph name="scan" size={19} color="var(--accent)" />
                </button>
                {/* Zavod kodi yo'q tovar (zargarlik buyumi, uy
                    mahsuloti) — do'konning o'z kodi yasaladi va shu
                    zahoti yorliq chop etsa bo'ladi. Kodni server
                    beradi: bo'shligini u tekshiradi. */}
                {!barcode.trim() && (
                  <button onClick={makeCode} aria-label={t('makeBarcode')} title={t('makeBarcode')}>
                    <Glyph name="plus" size={19} color="var(--accent)" />
                  </button>
                )}
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
                placeholder={exampleText('Cat')}
              />
              <datalist id="cat-list">
                {cats.map((c) => <option key={c.name} value={c.name} />)}
              </datalist>
            </div>
            {codeWarning && <p className="form-note" style={{ color: 'var(--yellow)' }}>{codeWarning}</p>}
          </div>
        </div>
      </div>

      {/* Zargarlik buyumi: yorliqdagi to'rt qator.
          Har bir buyum o'ziga xos — massasi va probasi bo'yicha
          narxi ham har xil, shuning uchun narx shu yerdan hisoblanadi. */}
      {gold && (
        <div className="form-group">
          {/* Alohida klass: ".unit-row" ombor birligi qatorini
              bildiradi, bu esa proba. Ikkalasi bir nom bilan yursa,
              birlik qatorini tartib bo'yicha topadigan kod adashadi. */}
          <div className="proba-row">
            <span className="unit-cap">{t('goldProba')}</span>
            <div className="unit-chips">
              {PROBAS.map((p) => (
                <button
                  key={p}
                  className={`chip sm ${proba === p ? 'on' : ''}`}
                  onClick={() => setGold({ proba: p })}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="row-2">
            <div className="form-row">
              <label>{t('goldWeight')}</label>
              <input
                value={weight}
                onChange={(e) => setGold({ weight: e.target.value })}
                inputMode="decimal"
                placeholder="4.6"
              />
            </div>
            <div className="form-row">
              <label>
                {t('goldSize')} <span className="tag">{t('optional')}</span>
              </label>
              <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="18" />
            </div>
          </div>
          <div className="form-row">
            <label>
              {t('goldStone')} <span className="tag">{t('optional')}</span>
            </label>
            <input value={stone} onChange={(e) => setStone(e.target.value)} placeholder="—" />
          </div>
          {/* Narx qanday chiqqani ochiq turadi: do'konchi gramm narxini
              o'zgartirsa nima bo'lishini oldindan ko'radi */}
          {goldSum ? (
            <p className="form-note">
              {t('goldAuto', { w: weight, p: fmt(gramPrice), s: fmt(goldSum) })}
            </p>
          ) : (
            weight.trim() !== '' && <p className="form-note" style={{ color: 'var(--yellow)' }}>{t('goldNoGram')}</p>
          )}
        </div>
      )}

      {/* Miqdor va narx.
          Ikki savol alohida so'raladi, chunki javoblari ham alohida:
          "qancha keldi" (ombor birligi) va "narx nechtasiga" (narx
          birligi). Semichka 10 kg kelib, 100 grami 15 000 bo'lishi —
          eng oddiy holat, ilgari buni kiritib bo'lmasdi. */}
      <div className="form-group">
        {/* Birlik tanlovi faqat TANLASH KERAK bo'lganda ko'rinadi.
            Telefon do'konida hammasi donada — bitta tugmani ko'rsatib
            turish ortiqcha. */}
        {units.length > 1 && (
          <div className="unit-row">
            <span className="unit-cap">{t('unitLabel')}</span>
            <div className="unit-chips">
              {units.map((u) => (
                <button key={u} className={`chip sm ${unit === u ? 'on' : ''}`} onClick={() => pickUnit(u)}>
                  {t(`unit_${u}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="row-2">
          <div className="form-row">
            <label>{t('qtyArrived')} ({t(`unit_${unit}`)})</label>
            <input
              value={qty}
              onChange={(e) => { setQty(e.target.value.replace(/[^\d.,]/g, '')); setTotalDraft(null); }}
              inputMode="decimal"
              placeholder={isFractional(unit) ? '10' : ex.qty}
            />
          </div>
          {/* Srok faqat srogi bor tovarlarda: uzukning ham, telefonning
              ham yaroqlilik muddati yo'q */}
          {prof.expiry && (
            <div className="form-row">
              <label>
                {t('expiry')} <span className="tag">{t('optional')}</span>
              </label>
              <DateField value={expiry} onChange={setExpiry} ariaLabel={t('expiry')} />
            </div>
          )}
        </div>

        {/* Narx qaysi miqdorga — faqat tanlov bo'lganda ko'rinadi.
            Donada "yarim dona narxi" degani yo'q, u yerda ortiqcha. */}
        {bases.length > 1 && (
          <div className="unit-row">
            <span className="unit-cap">{t('priceBasis')}</span>
            <div className="unit-chips">
              {bases.map((b) => (
                <button
                  key={b.qty}
                  className={`chip sm ${Math.abs(b.qty - basis.qty) < 1e-9 ? 'on' : ''}`}
                  onClick={() => pickBasis(b)}
                >
                  {basisText(b)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="row-2">
          <div className="form-row">
            <label>{t('costPrice')} ({basisText(basis)})</label>
            <input
              value={formatAmount(costPrice)}
              onChange={(e) => { setCostPrice(e.target.value); setTotalDraft(null); }}
              inputMode="numeric"
              placeholder={ex.cost}
            />
          </div>
          <div className="form-row">
            <label>{t('totalPaid')}</label>
            <input
              value={formatAmount(totalShown)}
              onChange={(e) => {
                setTotalDraft(e.target.value);
                // Jami yozilsa tanlangan asosdagi narx o'zi chiqadi
                if (qtyNum > 0) {
                  setCostPrice(String(Math.round((amountValue(e.target.value) / qtyNum) * basis.qty)));
                }
              }}
              inputMode="numeric"
              placeholder={ex.total}
            />
          </div>
        </div>

        <div className="row-2">
          <div className="form-row">
            <label>{t('sellPrice')} ({basisText(basis)})</label>
            <input value={formatAmount(sellPrice)} onChange={(e) => setSellPrice(e.target.value)} inputMode="numeric" placeholder={ex.sell} />
          </div>
          <div className="form-row" />
        </div>

        {/* Bitta qatorli xulosa — kiritilgan raqamlar qanday
            tushunilgani ko'rinib turadi, lekin joy egallamaydi.
            Asos 1 birlik bo'lmasa, 1 birlikdagi narx ham yoziladi:
            "10 kg · 100 g = 15 000 · 1 kg = 150 000" */}
        {(qtyNum > 0 || basisCost > 0) && (
          <p className={`intake-line ${margin < 0 ? 'bad' : ''}`}>
            {qtyNum > 0 && <b>{qtyText(qtyNum)} {t(`unit_${unit}`)}</b>}
            {qtyNum > 0 && basisCost > 0 && ' · '}
            {basisCost > 0 && `${basisText(basis)} = ${fmt(basisCost)}`}
            {basisCost > 0 && basis.qty !== 1 && ` · 1 ${t(`unit_${unit}`)} = ${fmt(Math.round(unitCost))}`}
            {basisMargin !== 0 && (
              <>
                {' · '}
                {basisMargin > 0 ? t('profit') : t('sellBelowCost')}{' '}
                <b>{fmt(basisMargin)}</b>
                {qtyNum > 0 && ` (${t('allOf')} ${fmt(Math.round(margin * qtyNum))})`}
              </>
            )}
          </p>
        )}
      </div>

      <div className="intake-actions">
        <button className="btn-primary btn-lg" onClick={() => save(false)} disabled={busy || !name.trim()}>
          <Glyph name="check" size={19} color="#fff" /> {t('saveIntake')}
        </button>
        {/* Saqlab, darhol yorliq chiqarish. Zargarlikda bu asosiy yo'l:
            har buyumga o'z birkasi bosiladi. */}
        <button className="btn-ghost" onClick={() => save(true)} disabled={busy || !name.trim()}>
          <Glyph name="scan" size={17} color="var(--accent)" /> {t('saveAndLabel')}
        </button>
      </div>

      {/* Yorliq oynasi — ombordagi kartochkadagi bilan bir xil */}
      {labelFor && (
        <div className="sheet-wrap" onClick={() => setLabelFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-title">{t('labelPrint')}</div>
            <div className="sheet-sub">
              {labelFor.name} · {labelFor.barcode || t('noCode')}
            </div>
            {labelFor.barcode ? (
              <div className="label-preview">
                {gold ? (
                  <div dangerouslySetInnerHTML={{ __html: qrSvg(labelFor.barcode, { module: 4 }) ?? '' }} />
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: ean13Svg(labelFor.barcode, { moduleWidth: 2, height: 52 }) ?? '' }} />
                )}
              </div>
            ) : (
              <p className="hint">{t('noCodeForLabel')}</p>
            )}
            <div className="section-title sm">{t('labelCount')}</div>
            <div className="chip-row">
              {[1, 4, 8, 12, 24].map((n) => (
                <button key={n} className={`chip ${labelQty === n ? 'on' : ''}`} onClick={() => setLabelQty(n)}>
                  {n}
                </button>
              ))}
            </div>
            <button
              className="btn-primary btn-lg"
              disabled={!labelFor.barcode}
              onClick={() => { setPrinting(true); }}
            >
              <Glyph name="check" size={19} color="#fff" /> {t('labelPrint')}
            </button>
          </div>
        </div>
      )}

      {printing && labelFor?.barcode && (
        <PrintSheet onDone={() => { setPrinting(false); setLabelFor(null); }}>
          <Labels
            t={t}
            gold={gold}
            items={Array.from({ length: labelQty }, () => ({
              name: labelFor.name,
              price: labelFor.sell_price,
              barcode: labelFor.barcode!,
              proba: labelFor.proba,
              weight_g: labelFor.weight_g,
              size: labelFor.size,
              stone: labelFor.stone,
            }))}
          />
        </PrintSheet>
      )}
    </>
  );
}
