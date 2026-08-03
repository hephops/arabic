import { useEffect, useRef, useState } from 'react';
import { api, fmt, Product, SaleRow, SaleDetail, BASE } from '../api';
import { AppIcon, Glyph } from '../icons';
import Scanner from '../Scanner';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import { formatAmount, amountValue } from '../format';
import { toast } from '../toast';

interface CartLine {
  product: Product;
  qty: number;
}

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

export default function Kassa({ onDone, isEmployee = false }: { onDone: () => void; isEmployee?: boolean }) {
  const [mode, setMode] = useState<'sale' | 'intake' | 'history'>('sale');
  const { t } = useT();

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

  useEffect(() => {
    api.sales(50).then(setSales).catch(() => {});
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

  if (detail) {
    return (
      <>
        <button className="btn-ghost" style={{ textAlign: 'left' }} onClick={() => setDetail(null)}>
          ‹ {t('back')}
        </button>
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 8px' }}>
            {t('receipt')} #{detail.id} · {detail.created_at.slice(0, 16)}
          </div>
          <div className="list-group" style={{ marginBottom: 8 }}>
            {detail.items.map((i) => (
              <div className="list-item" key={i.id}>
                <div>
                  <div className="name">{i.name}</div>
                  <div className="sub">
                    {i.qty} {i.unit} × {fmt(i.price)}
                  </div>
                </div>
                <div className="amount">{fmt(i.qty * i.price)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 17 }}>
            <span>{t('total')}</span>
            <span>{fmt(detail.total)}</span>
          </div>
          {detail.customer && <p className="hint">{detail.customer.name} · {detail.customer.phone ?? t('noPhone')}</p>}
          <button className="btn-primary" onClick={() => sendReceipt(detail.id)}>
            <Glyph name="note" size={17} color="#fff" /> {t('sendReceipt')}
          </button>
        </div>
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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<'cash' | 'card' | 'debt'>('cash');
  const [customerName, setCustomerName] = useState('');
  const [scanning, setScanning] = useState(false);
  // Skanerda topilmagan kod: mahsulot tanlansa, kod o'shanga biriktiriladi
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const { t } = useT();

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const isBarcode = /^\d{6,}$/.test(q.trim());
    if (isBarcode) {
      await handleCode(q.trim());
      return;
    }
    const found = await api.products({ q });
    setResults(found.filter((p) => p.id !== null));
  }

  /** Skaner yoki qo'lda kiritilgan kod: topilsa savatga, topilmasa biriktirishga taklif */
  async function handleCode(code: string) {
    try {
      const res = await api.lookupBarcode(code);
      if (res.product) {
        setPendingCode(null);
        addToCart(res.product);
        return;
      }
      // Topilmadi — kodni eslab qolamiz va nom bo'yicha qidirishga o'tkazamiz
      toast.error(t('toastNotFound'), res.code);
      setPendingCode(res.code);
      setQuery('');
      if (res.catalog) {
        const byName = await api.products({ q: res.catalog.name });
        setResults(byName.filter((p) => p.id !== null));
      } else {
        setResults([]);
      }
    } catch (e: any) {
      toast.error(t('error'), e.message);
    }
  }

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
    let qty = 1;
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        qty = existing.qty + 1;
        return prev.map((l) => (l.product.id === p.id ? { ...l, qty } : l));
      }
      return [...prev, { product: p, qty: 1 }];
    });
    toast.success(p.name, `${qty} ${t('pcs')} · ${fmt(p.sell_price * qty)}`);
    setQuery('');
    setResults([]);
  }

  function changeQty(id: number, delta: number) {
    haptic.tap();
    const line = cart.find((l) => l.product.id === id);
    if (!line) return;
    const qty = line.qty + delta;
    if (qty <= 0) toast.info(line.product.name, t('toastRemoved'));
    setCart((prev) =>
      prev.map((l) => (l.product.id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0)
    );
  }

  const total = cart.reduce((s, l) => s + l.product.sell_price * l.qty, 0);

  async function checkout() {
    if (payment === 'debt' && !customerName.trim()) {
      toast.error(t('debtNeedsCustomer'));
      return;
    }
    try {
      await api.createSale({
        items: cart.map((l) => ({ product_id: l.product.id!, qty: l.qty })),
        payment_type: payment,
        customer_name: payment === 'debt' ? customerName.trim() : undefined,
      });
      toast.success(t('saleSaved'), `${fmt(total)}${payment === 'debt' ? ` · ${t('writtenToDebts')}` : ''}`);
      setCart([]);
      setCustomerName('');
      onDone();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    }
  }

  const qtyTotal = cart.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      <div className="search-row">
        <div className="search-field">
          <Glyph name="search" size={17} color="#8a8a8e" />
          <input value={query} onChange={(e) => search(e.target.value)} placeholder={t('searchProduct')} />
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
            cart.length > 0
              ? `${cart.reduce((s, l) => s + l.qty, 0)} ${t('pcs')} · ${fmt(total)}`
              : t('searchOrScan')
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
                  <div className="sub">{t('stock')}: {p.stock} {p.unit}</div>
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
            {t('cart')} · {qtyTotal} {t('pcs')}
          </div>
          <div className="list-group">
            {cart.map((l) => (
              <div className="list-item" key={l.product.id}>
                <div className="lead">
                  <ProductThumb product={l.product} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{l.product.name}</div>
                    <div className="sub">{fmt(l.product.sell_price * l.qty)}</div>
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

          <div className="checkout">
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
              <input
                style={{ marginTop: 10, marginBottom: 0 }}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t('debtCustomerPlaceholder')}
              />
            )}
            <button className="btn-primary btn-lg" onClick={checkout}>
              <Glyph name="check" size={19} color="#fff" /> {t('finishSale')}
            </button>
          </div>
        </>
      )}

      {cart.length === 0 && !results.length && (
        <div className="empty-state">
          <AppIcon glyph="cart" size={54} />
          <div className="t">{t('cartEmptyTitle')}</div>
          <div className="s">{t('cartEmptySub')}</div>
          <button className="btn-primary btn-lg" style={{ maxWidth: 280, margin: '18px auto 0' }} onClick={() => setScanning(true)}>
            <Glyph name="scan" size={20} color="#fff" /> {t('scanToSell')}
          </button>
        </div>
      )}
    </>
  );
}

function IntakeMode({ onDone }: { onDone: () => void }) {
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [qty, setQty] = useState('');
  const [expiry, setExpiry] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [codeWarning, setCodeWarning] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useT();

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
    setBusy(true);
    try {
      const product = await api.intake({
        barcode: barcode.trim() || undefined,
        name: name.trim(),
        cost_price: parseInt(costPrice.replace(/\D/g, ''), 10) || 0,
        sell_price: parseInt(sellPrice.replace(/\D/g, ''), 10) || 0,
        qty: parseFloat(qty) || 0,
        expiry_date: expiry || undefined,
        image: image ?? undefined,
      });
      toast.success(t('toastIntakeSaved'), `${product.name} · ${t('toastStockLeft')}: ${product.stock} ${product.unit}`);
      // forma yopilmaydi — keyingi tovarga tayyor turadi
      setBarcode(''); setName(''); setCostPrice(''); setSellPrice(''); setQty(''); setExpiry(''); setImage(null);
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
