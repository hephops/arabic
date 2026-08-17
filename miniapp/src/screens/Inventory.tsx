import { useEffect, useRef, useState } from 'react';
import { api, fmt, Product, StocktakeRow, Supplier, BASE } from '../api';
import { AppIcon, Glyph } from '../icons';
import { NavBar, Summary, EmptyState, Segmented, DateField } from '../ui';
import { useT } from '../i18n';
import Scanner from '../Scanner';
import { formatAmount } from '../format';
import { toast, loadFailed } from '../toast';
import { DiscountSheet, priceAfter } from '../discount';
import { PrintSheet, Labels } from '../print';
import { UNITS, isFractional, parseQty, normalizeUnit } from '../units';
import { ean13Svg, isEan13, scaleBarcode } from '../ean13';
import { scanFail } from '../beep';

// Ombor: mahsulotlar ro'yxati, tahrirlash va inventarizatsiya

function daysTo(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function Thumb({ p, size = 42 }: { p: Product; size?: number }) {
  if (p.image_url) {
    return (
      <img
        src={`${BASE}${p.image_url}`}
        alt=""
        style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return <AppIcon glyph="boxes" color="gray" size={size} />;
}

export default function Inventory({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'expiry'>('all');
  // Ommaviy chegirma oynasi uchun tanlangan tovarlar
  const [discountFor, setDiscountFor] = useState<Product[] | null>(null);
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [counting, setCounting] = useState(false);
  const { t } = useT();

  const load = () => api.products().then(setProducts).catch(loadFailed);
  useEffect(() => {
    load();
  }, []);

  if (counting) return <Stocktake products={products} onBack={() => { setCounting(false); load(); }} />;
  if (editing)
    return (
      <ProductEdit
        product={editing}
        onBack={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    );

  // Do'kondagi kategoriyalar — mahsulotlardan yig'iladi
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];

  const filtered = products.filter((p) => {
    if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (category && p.category !== category) return false;
    if (filter === 'low') return p.stock <= 5;
    if (filter === 'expiry') return p.expiry_date !== null && daysTo(p.expiry_date) <= 7;
    return true;
  });

  const totalValue = products.reduce((s, p) => s + p.stock * p.cost_price, 0);

  return (
    <>
      <NavBar
        title={t('navInventory')}
        onBack={onBack}
        right={
          <button className="nav-btn" onClick={() => setCounting(true)}>
            {t('stocktake')}
          </button>
        }
      />
      <div className="screen">
        <Summary
          icon="boxes"
          label={`${products.length} ${t('productsCount')}`}
          value={fmt(totalValue)}
        />

        <div className="search-row">
          <div className="search-field">
            <Glyph name="search" size={17} color="#8a8a8e" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} />
            {query && (
              <button className="search-clear" onClick={() => setQuery('')}>
                <Glyph name="close" size={15} color="#8a8a8e" />
              </button>
            )}
          </div>
        </div>

        <Segmented
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: t('filterAll') },
            { id: 'low', label: t('filterLow') },
            { id: 'expiry', label: t('filterExpiry') },
          ]}
        />

        {/* Kategoriyalar — ko'p tovarli do'konda kerakli guruhni tez topish uchun */}
        {categories.length > 0 && (
          <div className="chip-row">
            <button className={`chip ${category === '' ? 'on' : ''}`} onClick={() => setCategory('')}>
              {t('categoryAll')}
            </button>
            {categories.map((c) => (
              <button key={c} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="list-group">
          {filtered.map((p) => {
            const expDays = p.expiry_date ? daysTo(p.expiry_date) : null;
            return (
              <div className="list-item" key={p.id} onClick={() => setEditing(p)}>
                <div className="lead">
                  <Thumb p={p} />
                  <div>
                    <div className="name">
                      {p.name}
                      {(p.discount_percent ?? 0) > 0 && <span className="badge sale">−{p.discount_percent}%</span>}
                    </div>
                    <div className="sub">
                      {/* Chegirma bo'lsa eski narx chizilgan holda qoladi */}
                      {(p.discount_percent ?? 0) > 0 ? (
                        <>
                          <b style={{ color: 'var(--green)' }}>{fmt(priceAfter(p.sell_price, p.discount_percent!))}</b>{' '}
                          <span className="old-price">{fmt(p.sell_price)}</span>
                        </>
                      ) : (
                        fmt(p.sell_price)
                      )}
                      {expDays !== null && (
                        <span style={{ color: expDays < 0 ? 'var(--red)' : expDays <= 7 ? 'var(--yellow)' : undefined }}>
                          {' '}
                          · {t('expiry')}: {expDays < 0 ? `${-expDays} ${t('daysPassed')}` : `${expDays} ${t('daysLeft')}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    className="amount"
                    style={{ color: p.stock < 0 ? 'var(--red)' : p.stock <= 5 ? 'var(--yellow)' : undefined }}
                  >
                    {p.stock} {p.unit}
                  </span>
                  <Glyph name="chevron" size={15} color="#c7c7cc" />
                </div>
              </div>
            );
          })}
        </div>
        {/* Srogi yaqinlar ro'yxati ochilganda — bir bosishda hammasiga
            chegirma. Bosh sahifadagi bilan bir xil oyna. */}
        {filter === 'expiry' && filtered.length > 0 && (
          <button className="btn-ghost" onClick={() => setDiscountFor(filtered)}>
            <Glyph name="flash" size={16} color="var(--accent)" /> {t('discountAction')}
          </button>
        )}

        {discountFor && (
          <DiscountSheet
            items={discountFor}
            onClose={() => setDiscountFor(null)}
            onSaved={load}
          />
        )}

        {filtered.length === 0 && (
          <EmptyState
            icon="boxes"
            title={t('noProducts')}
            sub={query || filter !== 'all' ? t('noProductsFilter') : t('noProductsSub')}
          />
        )}
      </div>
    </>
  );
}

/* ───────── Mahsulotni tahrirlash ───────── */

function ProductEdit({ product, onBack, onSaved }: { product: Product; onBack: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [form, setForm] = useState({
    name: product.name,
    cost_price: String(product.cost_price),
    sell_price: String(product.sell_price),
    stock: String(product.stock),
    low_stock_threshold: String(product.low_stock_threshold ?? 5),
    expiry_date: product.expiry_date ?? '',
    // Birlikni keyin ham o'zgartirish mumkin: do'konchi "dona" deb
    // kiritib qo'yib, keyin bu tovar kilogrammda ekanini eslashi mumkin
    unit: normalizeUnit(product.unit),
  });
  // Buyurtma shu bo'yicha guruhlanadi
  const [supplierId, setSupplierId] = useState<string>(product.supplier_id ? String(product.supplier_id) : '');
  const [discount, setDiscount] = useState<number>(product.discount_percent ?? 0);
  // Tarozi raqami va uning namunaviy kodi (1 kg uchun)
  const [plu, setPlu] = useState<string | null>(product.plu ?? null);
  const [sample, setSample] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [codes, setCodes] = useState<{ id: number; barcode: string }[]>([]);
  const [newCode, setNewCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState(false);
  const [labelQty, setLabelQty] = useState(8);
  const [printingLabels, setPrintingLabels] = useState(false);

  // Yorliqqa faqat EAN-13 chizib bo'ladi — shunga yaraydigan birinchi kod
  const labelCode = codes.map((c) => c.barcode).find((c) => isEan13(c)) ?? null;

  /** Do'konning o'z kodini yasash — zavod kodi yo'q tovar uchun */
  async function makeCode() {
    setBusy(true);
    try {
      const res = await api.generateBarcode(product.id!);
      toast.success(t('barcodeMade'), res.barcode);
      loadCodes();
    } catch (e: any) {
      toast.error(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCodes = () => api.productBarcodes(product.id!).then(setCodes).catch(() => {});
  useEffect(() => {
    loadCodes();
    api.suppliers().then(setSuppliers).catch(() => {});
    // Kartochka ochilganda mavjud PLU uchun namunaviy kodni chizamiz
    if (product.plu) setSample(scaleBarcode(product.plu, 1000));
  }, []);

  async function makePlu() {
    setBusy(true);
    try {
      const res = await api.setPlu(product.id!);
      setPlu(res.plu ?? null);
      setSample(res.sample_barcode);
      toast.success(t('scaleMade'), res.plu ?? '');
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePlu() {
    setBusy(true);
    try {
      await api.removePlu(product.id!);
      setPlu(null);
      setSample(null);
      toast.info(t('scaleRemoved'), product.name);
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addCode(code: string) {
    const clean = code.replace(/[\s-]/g, '');
    if (clean.length < 6) return;
    setError('');
    try {
      await api.attachBarcode(product.id!, clean);
      toast.success(t('toastCodeAdded'), clean);
      setNewCode('');
      loadCodes();
    } catch (e: any) {
      setError(e.message === 'barcode_taken' ? t('barcodeTaken') : t('error'));
    }
  }

  function pickImage(file: File | undefined) {
    if (!file) return;
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
    await api.updateProduct(product.id!, {
      name: form.name.trim(),
      cost_price: parseInt(form.cost_price.replace(/\D/g, ''), 10) || 0,
      sell_price: parseInt(form.sell_price.replace(/\D/g, ''), 10) || 0,
      unit: form.unit,
      stock: parseQty(form.stock, form.unit),
      low_stock_threshold: parseQty(form.low_stock_threshold, form.unit) || 5,
      expiry_date: form.expiry_date || null,
      supplier_id: supplierId ? Number(supplierId) : null,
      discount_percent: discount,
      image: image ?? undefined,
    } as any);
    toast.success(t('toastProductSaved'), form.name.trim());
    onSaved();
  }

  async function remove() {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      await api.deleteProduct(product.id!);
      toast.info(t('toastProductDeleted'), product.name);
      onSaved();
    } catch (e: any) {
      toast.error(e.message === 'has_sales' ? t('hasSales') : t('error'));
    }
  }

  return (
    <>
      <NavBar title={t('editProduct')} onBack={onBack} />
      <div className="screen">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {image ? (
            <img src={image} alt="" style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover' }} />
          ) : (
            <Thumb p={product} size={54} />
          )}
          <button className="chip" onClick={() => fileRef.current?.click()}>
            <Glyph name="camera" size={16} /> {product.image_url || image ? t('changePhoto') : t('takePhoto')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => pickImage(e.target.files?.[0])}
          />
        </div>

        <label>{t('productName')}</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>{t('productBarcodes')}</label>
        <div className="list-group">
          {codes.map((c) => (
            <div className="list-item" key={c.id}>
              <div className="name mono-code">{c.barcode}</div>
              <button
                className="chip"
                onClick={async () => {
                  await api.removeBarcode(product.id!, c.barcode).catch(() => {});
                  toast.info(t('toastCodeRemoved'), c.barcode);
                  loadCodes();
                }}
              >
                {t('delete')}
              </button>
            </div>
          ))}
          <div className="list-item" style={{ gap: 8 }}>
            <input
              style={{ margin: 0, background: 'none', padding: 0, flex: 1 }}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder={t('addBarcode')}
              onKeyDown={(e) => e.key === 'Enter' && addCode(newCode)}
            />
            <button className="chip" onClick={() => setScanning(true)}>
              <Glyph name="scan" size={16} />
            </button>
            <button className="chip" onClick={() => addCode(newCode)} disabled={newCode.length < 6}>
              <Glyph name="plus" size={16} />
            </button>
          </div>
        </div>
        {/* Zavod kodi yo'q tovar uchun — do'konning o'z kodi ("20" bilan boshlanadi) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <button className="chip" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={makeCode}>
            <Glyph name="plus" size={15} /> {t('makeBarcode')}
          </button>
          <button
            className="chip"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => (labelCode ? setLabels(true) : toast.error(t('noCodeForLabel')))}
          >
            <Glyph name="note" size={15} /> {t('printLabel')}
          </button>
        </div>
        <p className="field-note">{t('makeBarcodeHint')}</p>

        {/* ── Tarozi raqami (PLU) ──
            Pomidor, go'sht, guruch kabi og'irlikda sotiladigan tovarlar
            uchun. Do'konchi bu raqamni tarozisiga kiritadi; shundan
            keyin tarozi bosgan yorliq kassada o'zi tanilib, og'irligi
            bilan savatga tushadi — sotuvchi hech narsa yozmaydi. */}
        <div className="section-title">{t('scaleTitle')}</div>
        {plu ? (
          <>
            <div className="scale-card">
              <div>
                <div className="sc-label">{t('scalePlu')}</div>
                <div className="sc-plu">{plu}</div>
              </div>
              <div className="sc-sample">
                <div className="sc-label">{t('scaleSample1kg')}</div>
                <div className="mono-code">{sample ?? '—'}</div>
              </div>
            </div>
            {sample && (
              <div
                className="label-preview"
                dangerouslySetInnerHTML={{ __html: ean13Svg(sample, { moduleWidth: 2, height: 46 }) ?? '' }}
              />
            )}
            <p className="field-note">{t('scaleHint')}</p>
            <button className="btn-ghost danger" onClick={removePlu} disabled={busy}>
              {t('scaleRemove')}
            </button>
          </>
        ) : (
          <>
            <button className="chip" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} onClick={makePlu}>
              <Glyph name="plus" size={15} /> {t('scaleMake')}
            </button>
            <p className="field-note">{t('scaleWhy')}</p>
          </>
        )}

        {scanning && (
          <Scanner
            onScan={(code) => {
              setScanning(false);
              addCode(code);
            }}
            onClose={() => setScanning(false)}
          />
        )}

        {/* Yorliq: nechta chop etishni so'raymiz */}
        {labels && labelCode && (
          <div className="sheet-wrap" onClick={() => setLabels(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <div className="sheet-title">{t('printLabel')}</div>
              <div className="sheet-sub">{form.name || product.name} · {labelCode}</div>
              <div
                className="label-preview"
                dangerouslySetInnerHTML={{ __html: ean13Svg(labelCode, { moduleWidth: 2, height: 52 }) ?? '' }}
              />
              <label className="sheet-label">{t('labelCount')}</label>
              <div className="chip-row wrap">
                {[1, 4, 8, 12, 24].map((n) => (
                  <button key={n} className={`chip ${labelQty === n ? 'on' : ''}`} onClick={() => setLabelQty(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <button className="btn-primary btn-lg" onClick={() => { setLabels(false); setPrintingLabels(true); }}>
                <Glyph name="check" size={18} color="#fff" /> {t('labelPrint')}
              </button>
            </div>
          </div>
        )}

        {printingLabels && labelCode && (
          <PrintSheet onDone={() => setPrintingLabels(false)}>
            <Labels
              t={t}
              items={Array.from({ length: labelQty }, () => ({
                name: form.name || product.name,
                price: parseInt(form.sell_price.replace(/\D/g, ''), 10) || product.sell_price,
                barcode: labelCode,
              }))}
            />
          </PrintSheet>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label>{t('costPrice')}</label>
            <input value={formatAmount(form.cost_price)} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} inputMode="numeric" />
          </div>
          <div style={{ flex: 1 }}>
            <label>{t('sellPrice')}</label>
            <input value={formatAmount(form.sell_price)} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} inputMode="numeric" />
          </div>
        </div>
        <label>{t('unitLabel')}</label>
        <div className="chip-row">
          {UNITS.map((u) => (
            <button key={u} className={`chip ${form.unit === u ? 'on' : ''}`} onClick={() => setForm({ ...form, unit: u })}>
              {t(`unit_${u}`)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label>{t('stock')} ({t(`unit_${form.unit}`)})</label>
            <input
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/[^\d.,]/g, '') })}
              inputMode="decimal"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>{t('lowStockLimit')}</label>
            <input
              value={form.low_stock_threshold}
              onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
              inputMode="decimal"
            />
          </div>
        </div>
        <label>
          {t('discountLabel')} ({t('optional')})
        </label>
        <div className="chip-row wrap">
          {[0, 10, 20, 30, 50].map((d) => (
            <button key={d} className={`chip ${discount === d ? 'on' : ''}`} onClick={() => setDiscount(d)}>
              {d === 0 ? t('discountNone') : `−${d}%`}
            </button>
          ))}
        </div>
        {discount > 0 && (
          <p className="field-note">
            {t('discountNewPrice')}:{' '}
            <b style={{ color: 'var(--green)' }}>
              {fmt(priceAfter(parseInt(form.sell_price.replace(/\D/g, ''), 10) || 0, discount))}
            </b>
          </p>
        )}

        <label>
          {t('expiry')} ({t('optional')})
        </label>
        <DateField value={form.expiry_date} onChange={(v) => setForm({ ...form, expiry_date: v })} ariaLabel={t('expiry')} />

        {/* Ta'minotchi — "Buyurtma" bo'limi shu bo'yicha guruhlaydi,
            shunda har bir ta'minotchiga alohida ro'yxat tayyorlanadi */}
        <label>
          {t('supplierOfProduct')} ({t('optional')})
        </label>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">{t('noSupplierGroup')}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button className="btn-primary" onClick={save}>
          <Glyph name="check" size={18} color="#fff" /> {t('save')}
        </button>
        <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={remove}>
          {t('deleteProduct')}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}

/* ───────── Inventarizatsiya ───────── */

function Stocktake({ products, onBack }: { products: Product[]; onBack: () => void }) {
  const { t } = useT();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [result, setResult] = useState<StocktakeRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');

  function onScan(code: string) {
    setScanning(false);
    const p = products.find((x) => x.barcode === code);
    if (p?.id) {
      // skaner qilingan mahsulot sonini bittaga oshiramiz
      setCounts((prev) => ({ ...prev, [p.id!]: String((parseFloat(prev[p.id!] ?? '0') || 0) + 1) }));
      setQuery(p.name);
    } else {
      // Bu kod omborda yo'q — ilgari hech narsa bo'lmasdi va sanoqchi
      // buni sezmay o'tib ketardi
      scanFail();
      toast.error(t('toastNotFound'), code);
    }
  }

  async function apply() {
    const items = Object.entries(counts)
      .filter(([, v]) => v !== '')
      .map(([id, v]) => ({ product_id: Number(id), actual: parseFloat(v) || 0 }));
    if (!items.length) return;
    const res = await api.stocktake(items);
    setResult(res.items.filter((r) => r.diff !== 0));
  }

  const list = products.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()));

  if (result) {
    return (
      <>
        <NavBar title={t('stocktake')} onBack={onBack} />
        <div className="screen">
          <div className="card center">
            <AppIcon glyph="boxes" size={44} />
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>
              {result.length} {t('stocktakeDone')}
            </div>
          </div>
          <div className="list-group">
            {result.map((r) => (
              <div className="list-item" key={r.product_id}>
                <div>
                  <div className="name">{r.name}</div>
                  <div className="sub">
                    {r.before} → {r.actual}
                  </div>
                </div>
                <div className="amount" style={{ color: r.diff < 0 ? 'var(--red)' : 'var(--green)' }}>
                  {r.diff > 0 ? '+' : ''}
                  {r.diff}
                </div>
              </div>
            ))}
          </div>
          {result.length === 0 && <div className="empty">{t('noProducts')}</div>}
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar title={t('stocktake')} onBack={onBack} />
      <div className="screen">
        <p className="hint" style={{ margin: '0 4px 10px' }}>
          {t('stocktakeHint')}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} style={{ flex: 1 }} />
          <button className="chip" style={{ height: 44, marginBottom: 8 }} onClick={() => setScanning(true)}>
            <Glyph name="scan" size={19} /> {t('scanner')}
          </button>
        </div>
        {scanning && <Scanner onScan={onScan} onClose={() => setScanning(false)} />}

        <div className="list-group">
          {list.map((p) => {
            const val = counts[p.id!] ?? '';
            const diff = val === '' ? null : (parseFloat(val) || 0) - p.stock;
            return (
              <div className="list-item" key={p.id}>
                <div className="lead">
                  <Thumb p={p} size={36} />
                  <div>
                    <div className="name">{p.name}</div>
                    <div className="sub">
                      {t('stock')}: {p.stock} {p.unit}
                      {diff !== null && diff !== 0 && (
                        <span style={{ color: diff < 0 ? 'var(--red)' : 'var(--green)' }}>
                          {' '}
                          · {t('diff')}: {diff > 0 ? '+' : ''}
                          {diff}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <input
                  value={val}
                  onChange={(e) => setCounts({ ...counts, [p.id!]: e.target.value })}
                  inputMode="decimal"
                  placeholder={t('actualQty')}
                  style={{ width: 92, marginBottom: 0, textAlign: 'center', background: 'var(--fill)' }}
                />
              </div>
            );
          })}
        </div>

        <button className="btn-primary" onClick={apply} disabled={Object.values(counts).every((v) => v === '')}>
          <Glyph name="check" size={18} color="#fff" /> {t('applyStocktake')}
        </button>
      </div>
    </>
  );
}
