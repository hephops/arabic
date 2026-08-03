import { useRef, useState } from 'react';
import { api, fmt, Product, BASE } from '../api';
import { AppIcon, Glyph } from '../icons';
import Scanner from '../Scanner';
import { useT } from '../i18n';

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

export default function Kassa({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'sale' | 'intake'>('sale');
  const { t } = useT();

  return (
    <div className="screen">
      <div className="chip-row">
        <button className={`chip ${mode === 'sale' ? 'selected' : ''}`} onClick={() => setMode('sale')}>
          <Glyph name="cart" size={16} /> {t('modeSale')}
        </button>
        <button className={`chip ${mode === 'intake' ? 'selected' : ''}`} onClick={() => setMode('intake')}>
          <Glyph name="box" size={16} /> {t('modeIntake')}
        </button>
      </div>
      {mode === 'sale' ? <SaleMode onDone={onDone} /> : <IntakeMode onDone={onDone} />}
    </div>
  );
}

function SaleMode({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<'cash' | 'card' | 'debt'>('cash');
  const [customerName, setCustomerName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const { t } = useT();

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const isBarcode = /^\d{6,}$/.test(q.trim());
    const found = await api.products(isBarcode ? { barcode: q.trim() } : { q });
    setResults(found.filter((p) => p.id !== null));
  }

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product: p, qty: 1 }];
    });
    setQuery('');
    setResults([]);
  }

  function changeQty(id: number, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.product.id === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  const total = cart.reduce((s, l) => s + l.product.sell_price * l.qty, 0);

  async function checkout() {
    setError('');
    if (payment === 'debt' && !customerName.trim()) {
      setError(t('debtNeedsCustomer'));
      return;
    }
    try {
      await api.createSale({
        items: cart.map((l) => ({ product_id: l.product.id!, qty: l.qty })),
        payment_type: payment,
        customer_name: payment === 'debt' ? customerName.trim() : undefined,
      });
      setMessage(`${t('saleSaved')}: ${fmt(total)}${payment === 'debt' ? ` (${t('writtenToDebts')})` : ''}`);
      setCart([]);
      setCustomerName('');
      onDone();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder={t('searchProduct')}
          style={{ flex: 1 }}
        />
        <button
          className="chip"
          style={{ height: 48, marginBottom: 10 }}
          onClick={() => setScanning(true)}
          title="Skaner"
        >
          <Glyph name="scan" size={20} />
          {t('scanner')}
        </button>
      </div>
      {scanning && (
        <Scanner
          onScan={(code) => {
            setScanning(false);
            search(code);
          }}
          onClose={() => setScanning(false)}
        />
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
          <div className="section-title">{t('cart')}</div>
          <div className="list-group">
            {cart.map((l) => (
              <div className="list-item" key={l.product.id}>
                <div className="lead">
                  <ProductThumb product={l.product} size={38} />
                  <div>
                    <div className="name">{l.product.name}</div>
                    <div className="sub">{fmt(l.product.sell_price)} × {l.qty}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="chip" onClick={() => changeQty(l.product.id!, -1)}>−</button>
                  <span>{l.qty}</span>
                  <button className="chip" onClick={() => changeQty(l.product.id!, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
          <div className="big-amount">{fmt(total)}</div>
          <div className="chip-row">
            {(
              [
                ['cash', 'banknote', 'payCash'],
                ['card', 'card', 'payCard'],
                ['debt', 'book', 'payDebt'],
              ] as const
            ).map(([id, glyph, key]) => (
              <button
                key={id}
                className={`chip ${payment === id ? 'selected' : ''}`}
                onClick={() => setPayment(id)}
              >
                <Glyph name={glyph} size={16} /> {t(key)}
              </button>
            ))}
          </div>
          {payment === 'debt' && (
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={t('debtCustomerPlaceholder')}
            />
          )}
          <button className="btn-primary" onClick={checkout}>
            <Glyph name="check" size={18} color="#fff" strokeWidth={2.4} /> {t('finishSale')}
          </button>
        </>
      )}
      {cart.length === 0 && !results.length && <div className="empty">{t('searchOrScan')}</div>}
      {message && <p className="hint center">{message}</p>}
      {error && <p className="error">{error}</p>}
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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = useT();

  async function lookupBarcode(code: string) {
    setBarcode(code);
    if (code.trim().length < 6) return;
    const found = await api.products({ barcode: code.trim() });
    if (found.length > 0) {
      setName(found[0].name);
      if (found[0].id !== null) {
        setCostPrice(String(found[0].cost_price || ''));
        setSellPrice(String(found[0].sell_price || ''));
      }
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
    setError('');
    if (!name.trim()) {
      setError(t('productNameRequired'));
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
      setMessage(`"${product.name}" — ${t('stock')}: ${product.stock}`);
      setBarcode(''); setName(''); setCostPrice(''); setSellPrice(''); setQty(''); setExpiry(''); setImage(null);
      onDone();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label>{t('barcodeLabel')}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={barcode}
          onChange={(e) => lookupBarcode(e.target.value)}
          inputMode="numeric"
          placeholder="4780000123456"
          style={{ flex: 1 }}
        />
        <button className="chip" style={{ height: 48, marginBottom: 10 }} onClick={() => setScanning(true)}>
          <Glyph name="scan" size={20} />
          {t('scanner')}
        </button>
      </div>
      {scanning && (
        <Scanner
          onScan={(code) => {
            setScanning(false);
            lookupBarcode(code);
          }}
          onClose={() => setScanning(false)}
        />
      )}
      <label>{t('productName')}</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coca-Cola 1.5L" />

      <label>{t('productImage')} ({t('optional')})</label>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => pickImage(e.target.files?.[0])}
      />
      <div className="chip-row">
        <button className="chip" onClick={() => fileRef.current?.click()}>
          <Glyph name="plus" size={15} /> {image ? t('changePhoto') : t('takePhoto')}
        </button>
        {image && (
          <img src={image} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label>{t('costPrice')}</label>
          <input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} inputMode="numeric" placeholder="10 000" />
        </div>
        <div style={{ flex: 1 }}>
          <label>{t('sellPrice')}</label>
          <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} inputMode="numeric" placeholder="13 000" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label>{t('qty')}</label>
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="24" />
        </div>
        <div style={{ flex: 1 }}>
          <label>{t('expiry')} ({t('optional')})</label>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>
      </div>
      <button className="btn-primary" onClick={save} disabled={busy}>
        <Glyph name="check" size={18} color="#fff" strokeWidth={2.4} /> {t('saveIntake')}
      </button>
      {message && <p className="hint center">{message}</p>}
      {error && <p className="error">{error}</p>}
    </>
  );
}
