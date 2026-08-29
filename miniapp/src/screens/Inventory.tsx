import { useEffect, useRef, useState } from 'react';
import { api, fmt, Batch, Product, StocktakeRow, Supplier, BASE } from '../api';
import { AppIcon, Glyph } from '../icons';
import { NavBar, Summary, EmptyState, Segmented, DateField } from '../ui';
import { useT } from '../i18n';
import { can } from '../perms';
import Scanner from '../Scanner';
import { formatAmount, amountValue, fmtDay } from '../format';
import { toast, loadFailed } from '../toast';
import { DiscountSheet, priceAfter } from '../discount';
import { PrintSheet, Labels } from '../print';
import {
  STOCK_UNITS, isFractional, parseQty, normalizeUnit, qtyWithUnit,
  priceBases, basisOf, basisText, priceForBasis, priceLabel, PriceBasis,
} from '../units';
import { ean13Svg, isEan13, scaleBarcode } from '../ean13';
import { qrSvg } from '../qr';
import { scanFail } from '../beep';
import { haptic } from '../telegram';
import {
  goldShop, goldPrice, goldFieldPrice, goldLine, itemLine, shopInfo, profile,
  PROBAS, CLOTHING_SIZES,
} from '../shopTypes';
import { useEscape } from '../useEscape';
import { openPhoto } from '../photoView';
import { labelCount, setLabelCount, labelPrice, setLabelPrice } from '../labelPrefs';

/* ─────────── Zargarlik: og'irlik hisobi ───────────
 *
 * Zargar do'konida asosiy o'lchov — GRAMM. "585 dan jami necha gramm
 * bor" degan savol kuniga bir necha marta tug'iladi (yangi tovar
 * olishdan oldin, hisob-kitobda, tekshiruvda) va ilgari unga javob
 * berish uchun buyumlarni qo'lda qo'shib chiqishga to'g'ri kelardi.
 */

/** Shu qatordagi jami og'irlik, grammda.
 *
 *  Lom grammda yuritiladi — u yerda QOLDIQNING o'zi gramm. Buyum esa
 *  donada: og'irligi × nechta borligi. */
function gramsOf(p: { unit?: string | null; weight_g?: number | null; stock: number }): number {
  const u = String(p.unit ?? '').toLowerCase();
  if (u === 'gramm' || u === 'g') return Number(p.stock) || 0;
  return (Number(p.weight_g) || 0) * (Number(p.stock) || 0);
}

/** "1 234,56" — minglar ajratilgan holda, ortiqcha nol yozilmaydi */
function gramFmt(g: number): string {
  const yaxlit = Math.round((Number(g) || 0) * 100) / 100;
  const [butun, kasr] = String(yaxlit).split('.');
  return butun.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (kasr ? `,${kasr}` : '');
}

/** Shu tovar uchun "kam qoldi" chegarasi: o'zinikini bo'lsa o'shanisi,
 *  bo'lmasa do'kon turining standarti (oltin/telefonda 0-1, oziqda 5) */
const lowLimit = (p: { low_stock_threshold?: number | null }) =>
  p.low_stock_threshold ?? profile().lowStock;

// Ombor: mahsulotlar ro'yxati, tahrirlash va inventarizatsiya

function daysTo(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function Thumb({ p, size = 42 }: { p: Product; size?: number }) {
  if (p.image_url) {
    return (
      <img
        className="thumb-zoom"
        src={`${BASE}${p.image_url}`}
        alt={p.name}
        // Rasm bosilsa butun ekranga ochiladi. Qator bosilishi
        // to'xtatiladi — aks holda tahrirlash oynasi ham ochilib ketardi
        onClick={(e) => { e.stopPropagation(); openPhoto(p.image_url, p.name); }}
        style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return <AppIcon glyph="boxes" color="gray" size={size} />;
}

export default function Inventory({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'expiry' | 'proba'>('all');
  // Ommaviy chegirma oynasi uchun tanlangan tovarlar
  const [discountFor, setDiscountFor] = useState<Product[] | null>(null);
  const [category, setCategory] = useState('');
  // Zargarlikda proba bo'yicha saralash: "585 lar qancha" degan savol
  // do'konchida kuniga o'n marta tug'iladi
  const [proba, setProba] = useState('');
  // Kiyim do'konida razmer bo'yicha saralash: "M lardan nechta qoldi"
  const [razmer, setRazmer] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [counting, setCounting] = useState(false);
  // Birkani kamera bilan o'qib, tovarni ro'yxatdan qidirmasdan topish
  const [scanning, setScanning] = useState(false);
  const { t } = useT();

  /** Skanerdan kelgan kod: tovar topilsa kartochkasi ochiladi.
   *
   *  Topilmasa kod qidiruv maydoniga tushadi — do'konchi qo'lda
   *  ko'rib chiqsin, chunki kod boshqa do'konniki yoki hali kirim
   *  qilinmagan bo'lishi mumkin. */
  async function scanFound(code: string) {
    setScanning(false);
    const res = await api.lookupBarcode(code).catch(() => null);
    const topilgan = res?.product ? products.find((x) => x.id === res.product!.id) : null;
    if (topilgan) {
      setEditing(topilgan);
      return;
    }
    scanFail();
    // Yakka buyumli do'konda sotilgan buyum ro'yxatdan chiqib ketadi.
    // Quruq "topilmadi" degani chalkashtirardi: birka qo'lda turibdi-ku.
    // Sababini aniq aytamiz.
    if (res?.product && profile().unique) {
      toast.info(t('invScanSold'), res.product.name);
      return;
    }
    setQuery(code);
    toast.info(t('invScanNotFound'), code);
  }

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
  const gold = goldShop();
  // Bazadagi proba matn: "585". Yozilmagan buyumlar alohida guruh.
  const probaOf = (p: Product) => String((p as any).proba ?? '').trim();

  // Qidiruv va tepadagi filtr — qolgan hammasining asosi
  const base = products.filter((p) => {
    // Kod bo'yicha ham qidiramiz: skaner topa olmagan kodni do'konchi
    // qo'lda ko'rib chiqsa ham natija chiqsin
    if (query) {
      const q = query.toLowerCase().trim();
      const kod = String(p.barcode ?? '').toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !kod.includes(q)) return false;
    }
    // Tovarning O'Z chegarasi bo'yicha. Ilgari hamma joyda qat'iy 5
    // turardi: zargarlik va telefon do'konida har buyum yakka (qoldiq
    // 1-2) va BUTUN ombor doim "kam qolgan" bo'lib yonib turardi.
    if (filter === 'low') return p.stock <= lowLimit(p);
    if (filter === 'expiry') return p.expiry_date !== null && daysTo(p.expiry_date) <= 7;
    return true;
  });
  // Kiyim do'konida razmer — omborni ajratadigan asosiy kesim
  const sized = profile().sizes;
  const sizeOf = (p: Product) => String(p.size ?? '').trim();
  const catOk = (p: Product) => !category || p.category === category;
  const probaOk = (p: Product) => !proba || probaOf(p) === (proba === '—' ? '' : proba);
  const sizeOk = (p: Product) => !razmer || sizeOf(p) === (razmer === '—' ? '' : razmer);

  // Ombordagi razmerlar — tayyor ro'yxat tartibida (XS, S, M ...),
  // raqamli o'lchamlar (42, 44) undan keyin o'z tartibida
  const razmerlar = [...new Set(base.map(sizeOf))].sort((a, b) => {
    const i = CLOTHING_SIZES.indexOf(a), j = CLOTHING_SIZES.indexOf(b);
    if (i >= 0 || j >= 0) return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });
  const razmerSoni = (v: string) => base.filter((p) => catOk(p) && sizeOf(p) === (v === '—' ? '' : v)).length;

  // Ombordagi probalar — buyumlardan yig'iladi, tartibi standart
  // ro'yxat bo'yicha (375, 585, 750 ...), begonasi oxirida
  const probalar = [...new Set(base.map(probaOf))].sort((a, b) => {
    const i = PROBAS.indexOf(a), j = PROBAS.indexOf(b);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  });
  // Har chip yonidagi son: "bossam nechta chiqadi" degani
  const probaSoni = (v: string) => base.filter((p) => catOk(p) && probaOf(p) === (v === '—' ? '' : v)).length;
  const katSoni = (c: string) => base.filter((p) => probaOk(p) && sizeOk(p) && p.category === c).length;

  const filtered = base.filter((p) => catOk(p) && probaOk(p) && sizeOk(p));

  // Ombordagi pul — kirim narxi bo'yicha. Ruxsati yo'q xodimga
  // cost_price umuman yuborilmaydi (server yashiradi), shuning uchun
  // ko'paytmа NaN bo'lib, ekran tepasida "NaN so'm" turardi.
  const costHidden = !can('cost_view');
  const totalValue = costHidden
    ? null
    : products.reduce((s, p) => s + p.stock * (Number(p.cost_price) || 0), 0);

  // Sotuv narxidagi qiymat — ombordagi tovar to'liq sotilsa qancha
  // pul kelishi. Kirim narxi bilan yonma-yon turadi: do'konchi
  // qancha pul kiritgani va qancha kutishi mumkinligini bir qarashda
  // ko'radi. sell_price hamma xodimga ko'rinadi (narx yashirin emas),
  // shuning uchun cost_view ruxsatiga bog'liq emas.
  const sellValue = products.reduce((s, p) => s + p.stock * (Number(p.sell_price) || 0), 0);

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
        {/* Ombordagi pul IKKI narxda ko'rsatiladi.
            Ilgari faqat kirim narxi turardi va do'konchi "shu tovarni
            sotsam qancha bo'ladi" degan savolga javob topolmasdi —
            buning uchun har bir tovarni ochib chiqishi kerak edi. */}
        <Summary icon="boxes" label={t('invKinds')} value={String(products.length)} />
        <div className="duo">
          <div>
            <div className="k">{t('invCostValue')}</div>
            <div className="v">{totalValue === null ? '—' : fmt(totalValue)}</div>
          </div>
          <div>
            <div className="k">{t('invSellValue')}</div>
            <div className="v green">{fmt(sellValue)}</div>
          </div>
        </div>

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
          {/* Kamera bilan qidirish. Omborda tovar ko'p bo'lganda nomini
              terib o'tirishdan ko'ra birkani ko'rsatish tez: kod
              topilsa tovar kartochkasi darhol ochiladi. */}
          <button className="search-scan" onClick={() => setScanning(true)} aria-label={t('scanner')}>
            <Glyph name="scan" size={20} color="#fff" />
          </button>
        </div>

        {scanning && (
          <Scanner status={t('invScanHint')} onScan={scanFound} onClose={() => setScanning(false)} />
        )}

        {/* "Srogi yaqin" filtri faqat srogi bor do'konda. Zargarlik yoki
            telefon do'konida u doim bo'sh natija berardi — ekranning
            uchdan biri o'lik turardi. */}
        <Segmented
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: t('filterAll') },
            // Yakka buyumli do'konda (telefon, zargarlik) "kam qoldi"
            // ma'nosiz: har kartochka bitta buyum
            ...(profile().unique ? [] : [{ id: 'low' as const, label: t('filterLow') }]),
            ...(profile().expiry ? [{ id: 'expiry' as const, label: t('filterExpiry') }] : []),
            // Zargarda kuniga bir necha marta tug'iladigan savol:
            // "585 dan jami necha gramm bor". Ilgari uni bilish uchun
            // buyumlarni qo'lda qo'shib chiqishga to'g'ri kelardi.
            ...(gold ? [{ id: 'proba' as const, label: t('probaTab') }] : []),
          ]}
        />

        {/* Probalar — zargarlik do'konida eng ko'p so'raladigan kesim:
            "585 lar qancha, 750 lar qancha". Yonida soni turadi.
            Bitta probaning o'zi bo'lsa ham qator KO'RINADI: ilgari
            "kamida ikki xil bo'lsa" degan shart bor edi va hamma
            buyumi 585 bo'lgan do'konda qator butunlay yo'qolib,
            do'konchi "nega menda yo'q" deb qolardi. */}
        {gold && filter !== 'proba' && probalar.length > 0 && (
          <div className="chip-row">
            <button className={`chip ${proba === '' ? 'on' : ''}`} onClick={() => setProba('')}>
              {t('probaAll')} <span className="chip-n">{base.filter(catOk).length}</span>
            </button>
            {probalar.map((v) => {
              const id = v || '—';
              return (
                <button key={id} className={`chip ${proba === id ? 'on' : ''}`} onClick={() => setProba(proba === id ? '' : id)}>
                  {v || t('probaNone')} <span className="chip-n">{probaSoni(id)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Razmerlar — kiyim do'konida eng ko'p so'raladigan kesim:
            "M lardan nechta qoldi". Yonida soni turadi. */}
        {sized && filter !== 'proba' && razmerlar.length > 0 && (
          <div className="chip-row">
            <button className={`chip ${razmer === '' ? 'on' : ''}`} onClick={() => setRazmer('')}>
              {t('sizeAll')} <span className="chip-n">{base.filter(catOk).length}</span>
            </button>
            {razmerlar.map((v) => {
              const id = v || '—';
              return (
                <button
                  key={id}
                  className={`chip ${razmer === id ? 'on' : ''}`}
                  onClick={() => setRazmer(razmer === id ? '' : id)}
                >
                  {v || t('sizeNone')} <span className="chip-n">{razmerSoni(id)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Kategoriyalar — ko'p tovarli do'konda kerakli guruhni tez topish uchun */}
        {filter !== 'proba' && categories.length > 0 && (
          <div className="chip-row">
            <button className={`chip ${category === '' ? 'on' : ''}`} onClick={() => setCategory('')}>
              {t('categoryAll')} <span className="chip-n">{base.filter((p) => probaOk(p) && sizeOk(p)).length}</span>
            </button>
            {categories.map((c) => (
              <button key={c} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(category === c ? '' : c)}>
                {c} <span className="chip-n">{katSoni(c)}</span>
              </button>
            ))}
          </div>
        )}

        {filter === 'proba' && <ProbaWeights rows={base} costHidden={costHidden} />}

        {filter !== 'proba' && (
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
                    {/* Zargarlikda proba va massa buyumni nomdan ham
                        yaxshiroq ajratadi (bir xil nomli uzuk ko'p bo'ladi) */}
                    {itemLine(p) && <div className="sub">{itemLine(p)}</div>}
                    <div className="sub">
                      {/* Chegirma bo'lsa eski narx chizilgan holda qoladi */}
                      {(p.discount_percent ?? 0) > 0 ? (
                        <>
                          <b style={{ color: 'var(--green)' }}>
                            {priceLabel(priceAfter(p.sell_price, p.discount_percent!), p.unit, p.price_qty)}
                          </b>{' '}
                          <span className="old-price">{priceLabel(p.sell_price, p.unit, p.price_qty)}</span>
                        </>
                      ) : (
                        priceLabel(p.sell_price, p.unit, p.price_qty)
                      )}
                      {expDays !== null && profile().expiry && (
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
                    style={{ color: p.stock < 0 ? 'var(--red)' : p.stock <= lowLimit(p) ? 'var(--yellow)' : undefined }}
                  >
                    {qtyWithUnit(p.stock, p.unit)}
                  </span>
                  <Glyph name="chevron" size={15} color="#c7c7cc" />
                </div>
              </div>
            );
          })}
        </div>
        )}
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

        {filter !== 'proba' && filtered.length === 0 && (
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

/* ───────── Probalar bo'yicha og'irlik ─────────
 *
 * Zargar do'konida asosiy o'lchov gramm: "585 dan jami necha gramm
 * bor" degan savol yangi tovar olishdan oldin ham, hisob-kitobda ham,
 * tekshiruvda ham tug'iladi. Ilgari javob berish uchun buyumlarni
 * qo'lda qo'shib chiqishga to'g'ri kelardi — 95 ta uzuk uchun bu
 * jiddiy ish.
 *
 * Lom grammda yuritiladi, buyum esa donada — ikkalasi ham shu yerda
 * bitta grammga keltiriladi (gramsOf).
 */
function ProbaWeights({ rows, costHidden }: { rows: Product[]; costHidden: boolean }) {
  const { t } = useT();
  const guruh = new Map<string, { dona: number; gram: number; qiymat: number }>();
  for (const p of rows) {
    const key = String(p.proba ?? '').trim();
    const bor = guruh.get(key) ?? { dona: 0, gram: 0, qiymat: 0 };
    bor.dona += 1;
    bor.gram += gramsOf(p);
    bor.qiymat += (Number(p.cost_price) || 0) * (Number(p.stock) || 0);
    guruh.set(key, bor);
  }
  // Tartib standart proba ro'yxati bo'yicha (375, 585, 750 ...),
  // begonasi va probasizi oxirida
  const qatorlar = [...guruh.entries()].sort(([a], [b]) => {
    const i = PROBAS.indexOf(a), j = PROBAS.indexOf(b);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
  });
  const jami = qatorlar.reduce(
    (s, [, v]) => ({ dona: s.dona + v.dona, gram: s.gram + v.gram, qiymat: s.qiymat + v.qiymat }),
    { dona: 0, gram: 0, qiymat: 0 }
  );

  if (!qatorlar.length) return <EmptyState icon="boxes" title={t('noProducts')} sub={t('probaEmpty')} />;

  return (
    <>
      <p className="hint" style={{ margin: '0 4px 10px' }}>{t('probaWeightHint')}</p>
      <div className="list-group">
        {qatorlar.map(([proba, v]) => (
          <div className="list-item" key={proba || '—'}>
            <div className="lead">
              <span className="proba-tag">{proba || t('probaNone')}</span>
              <div>
                <div className="name">{gramFmt(v.gram)} {t('unit_gramm')}</div>
                <div className="sub">
                  {v.dona} {t('unit_dona')}
                  {/* Kilogrammga o'tgan og'irlik yiroqdan tushunarliroq */}
                  {v.gram >= 1000 && ` · ${gramFmt(v.gram / 1000)} kg`}
                </div>
              </div>
            </div>
            {!costHidden && <div className="right-val">{fmt(v.qiymat)}</div>}
          </div>
        ))}
        <div className="list-item proba-jami">
          <div className="lead">
            <span className="proba-tag jami">{t('total')}</span>
            <div>
              <div className="name">{gramFmt(jami.gram)} {t('unit_gramm')}</div>
              <div className="sub">
                {jami.dona} {t('unit_dona')}
                {jami.gram >= 1000 && ` · ${gramFmt(jami.gram / 1000)} kg`}
              </div>
            </div>
          </div>
          {!costHidden && <div className="right-val">{fmt(jami.qiymat)}</div>}
        </div>
      </div>
    </>
  );
}

/* ───────── Mahsulotni tahrirlash ───────── */

function ProductEdit({ product, onBack, onSaved }: { product: Product; onBack: () => void; onSaved: () => void }) {
  const { t } = useT();
  // Narx qaysi miqdorga aytilgani — omborniki bilan bir xil emas.
  // "10 kg keldi, 100 grami 15 000" degan tovar bu yerda ham o'sha
  // ko'rinishda ochilishi kerak, aks holda do'konchi 150 000 ni ko'rib
  // qo'rqib ketadi.
  const [basis, setBasis] = useState<PriceBasis>(() => basisOf(product.unit, product.price_qty));
  const [form, setForm] = useState({
    name: product.name,
    cost_price: String(priceForBasis(product.cost_price, basisOf(product.unit, product.price_qty).qty)),
    sell_price: String(priceForBasis(product.sell_price, basisOf(product.unit, product.price_qty).qty)),
    stock: String(product.stock),
    low_stock_threshold: String(product.low_stock_threshold ?? profile().lowStock),
    // Birlikni keyin ham o'zgartirish mumkin: do'konchi "dona" deb
    // kiritib qo'yib, keyin bu tovar kilogrammda ekanini eslashi mumkin
    unit: normalizeUnit(product.unit),
  });
  // Buyurtma shu bo'yicha guruhlanadi
  const [supplierId, setSupplierId] = useState<string>(product.supplier_id ? String(product.supplier_id) : '');
  // Zargarlik buyumi — yorliqdagi to'rt qator
  const gold = goldShop();
  const prof = profile();
  // Tovarning O'Z birligi ro'yxatda bo'lmasa ham qoladi: do'kon turi
  // keyin o'zgargan bo'lishi mumkin, eski tovarni ochib bo'lmay
  // qolmasin
  const unitList = prof.units.includes(normalizeUnit(product.unit))
    ? prof.units
    : [...prof.units, normalizeUnit(product.unit)];
  const [proba, setProba] = useState(product.proba ?? '585');
  const [weight, setWeight] = useState(product.weight_g != null ? String(product.weight_g) : '');
  const [size, setSize] = useState(product.size ?? '');
  const [stone, setStone] = useState(product.stone ?? '');
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
  useEscape(() => setLabels(false), labels);
  // Zargarlikda har buyum yakka — bitta birka yetadi
  // Nechta yorliq va narx ko'rsatilsinmi — qurilmada eslab qolinadi
  const [labelQty, setLabelQty] = useState(gold ? 1 : labelCount());
  const [labelWithPrice, setLabelWithPrice] = useState(labelPrice());
  const [printingLabels, setPrintingLabels] = useState(false);

  // Yorliqqa chiziqli kod faqat EAN-13 bo'lsa chiziladi. Zargarlikda
  // esa QR ishlatiladi — u har qanday raqamni ko'taradi, ya'ni
  // birkadagi 16 xonali raqam ham bo'laveradi.
  const labelCode = gold
    ? codes[0]?.barcode ?? product.barcode ?? null
    : codes.map((c) => c.barcode).find((c) => isEan13(c)) ?? null;

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

  // Maydonlarda tanlangan asos uchun narx turadi, bazaga esa har doim
  // 1 ombor birligi uchun narx boradi
  const basisCost = parseInt(form.cost_price.replace(/\D/g, ''), 10) || 0;
  const basisSell = parseInt(form.sell_price.replace(/\D/g, ''), 10) || 0;
  const unitCost = Math.round(basisCost / basis.qty);
  const unitSell = Math.round(basisSell / basis.qty);
  const bases = priceBases(form.unit);

  /** Asos almashsa 1 birlik narxi o'zgarmaydi, faqat ko'rinishi */
  function pickBasis(next: PriceBasis, unit = form.unit) {
    const conv = (txt: string) => {
      const v = parseInt(txt.replace(/\D/g, ''), 10) || 0;
      return v ? String(Math.round((v / basis.qty) * next.qty)) : txt;
    };
    setForm((f) => ({ ...f, unit, cost_price: conv(f.cost_price), sell_price: conv(f.sell_price) }));
    setBasis(next);
  }

  /**
   * Proba yoki massa o'zgarsa sotuv narxini qayta hisoblash.
   *
   * Ikki narsa hisobga olinadi:
   *  - Do'konchi narxni QO'LDA yozgan bo'lsa tegilmaydi. Ilgari har
   *    tegishda ustidan yozib yuborilardi va ishlov haqi qo'shilgan
   *    narx jimgina yo'qolardi.
   *  - Narx maydoni ombor birligiga bog'liq: 'gramm' da u "1 gramm
   *    qancha" degani, butun buyum narxi emas.
   */
  function setGoldAuto(p: string, w: string) {
    const num = (v: string) => Number(String(v).replace(',', '.'));
    const auto = goldFieldPrice(shopInfo(), p, num(w), form.unit);
    if (!auto) return;
    const prev = goldFieldPrice(shopInfo(), proba, num(weight), form.unit);
    setForm((f) => {
      const hozir = amountValue(f.sell_price);
      // Bo'sh yoki oldingi taklif turgan bo'lsa — yangilaymiz
      if (f.sell_price && hozir !== prev) return f;
      return { ...f, sell_price: String(auto) };
    });
  }

  async function save() {
    setError('');
    // Narx maydonlari FAQAT huquqi bo'lganda yuboriladi.
    //
    // Ikki xato shu yerdan chiqardi:
    //  1) price_edit yo'q xodim tovarni umuman saqlay olmasdi — server
    //     narx kalitini ko'rib 403 qaytarardi, ekranda esa sabab
    //     ko'rinmasdi (nom o'zgartirmoqchi bo'lgan xodim "ishlamayapti"
    //     deb qolardi);
    //  2) cost_view yo'q xodimga tannarx yuborilmaydi, ya'ni maydon
    //     doim bo'sh — saqlaganda do'konning tannarxi nolga tushardi.
    const narxlar = can('price_edit')
      ? { sell_price: unitSell, discount_percent: discount, ...(can('cost_view') ? { cost_price: unitCost } : {}) }
      : {};
    await api.updateProduct(product.id!, {
      name: form.name.trim(),
      ...narxlar,
      unit: form.unit,
      price_qty: basis.qty,
      stock: parseQty(form.stock, form.unit),
      low_stock_threshold: parseQty(form.low_stock_threshold, form.unit) || profile().lowStock,
      supplier_id: supplierId ? Number(supplierId) : null,
      image: image ?? undefined,
      ...(gold
        ? {
            proba,
            weight_g: Number(String(weight).replace(',', '.')) || null,
            size: size.trim(),
            stone: stone.trim(),
          }
        : {}),
      // Kiyimda razmer tovarning bir qismi — u ham tahrirlanadi
      ...(prof.sizes ? { size: size.trim() } : {}),
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
            bilan savatga tushadi — sotuvchi hech narsa yozmaydi.

            Faqat tarozi ishlatadigan do'konda ko'rinadi: zargar uzuk
            kartochkasida "tarozi raqami yasash" tugmasini ko'rmasin. */}
        {prof.scale && (
        <>
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
                dangerouslySetInnerHTML={{
                  __html:
                    (gold
                      ? qrSvg(labelCode, { module: 4 })
                      : ean13Svg(labelCode, { moduleWidth: 2, height: 52 })) ?? '',
                }}
              />
              <label className="sheet-label">{t('labelCount')}</label>
              <div className="chip-row wrap">
                {[1, 4, 8, 12, 24].map((n) => (
                  <button key={n} className={`chip ${labelQty === n ? 'on' : ''}`} onClick={() => { setLabelQty(n); setLabelCount(n); }}>
                    {n}
                  </button>
                ))}
              </div>
              {/* Narx yorliqda yozilsinmi. Standart — yo'q: narx
                  o'zgaradi, yorliq esa tovarda qolib ketadi va eski
                  narxli yorliq kassada nizoga sabab bo'ladi. */}
              {!gold && (
                <label className="sheet-check">
                  <input
                    type="checkbox"
                    checked={labelWithPrice}
                    onChange={(e) => { setLabelWithPrice(e.target.checked); setLabelPrice(e.target.checked); }}
                  />
                  <span>{t('labelShowPrice')}</span>
                </label>
              )}
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
              gold={gold}
              showPrice={labelWithPrice}
              items={Array.from({ length: labelQty }, () => ({
                name: form.name || product.name,
                // Yorliqdagi narx 1 birlik uchun — kod ham shunday o'qiladi
                price: unitSell || product.sell_price,
                barcode: labelCode,
                // Zargarlik birkasi buyumning o'z belgilari bilan chiqadi
                proba,
                weight_g: Number(String(weight).replace(',', '.')) || null,
                size,
                stone,
              }))}
            />
          </PrintSheet>
        )}

        {/* Ombor birligi narxdan oldin turadi: narx maydonining sarlavhasi
            shunga qarab o'zgaradi ("Sotuv narxi (100 g)") */}
        <label>{t('unitLabel')}</label>
        <div className="chip-row">
          {unitList.map((u) => (
            <button
              key={u}
              className={`chip ${form.unit === u ? 'on' : ''}`}
              onClick={() => { if (u !== form.unit) pickBasis(priceBases(u)[0], normalizeUnit(u)); }}
            >
              {t(`unit_${u}`)}
            </button>
          ))}
        </div>
        {bases.length > 1 && (
          <>
            <label>{t('priceBasis')}</label>
            <div className="chip-row">
              {bases.map((b) => (
                <button
                  key={b.qty}
                  className={`chip ${Math.abs(b.qty - basis.qty) < 1e-9 ? 'on' : ''}`}
                  onClick={() => pickBasis(b)}
                >
                  {basisText(b)}
                </button>
              ))}
            </div>
          </>
        )}
        {/* Razmer — kiyim do'konida tovarni ajratadigan asosiy belgi.
            Xato yozilgan bo'lsa shu yerdan tuzatiladi. */}
        {prof.sizes && (
          <>
            <label>{t('sizeLabel')}</label>
            <input value={size} onChange={(e) => setSize(e.target.value)} placeholder={t('sizePh')} />
            <div className="chip-row wrap" style={{ marginTop: 8 }}>
              {CLOTHING_SIZES.map((x) => (
                <button
                  key={x}
                  className={`chip ${size.trim().toUpperCase() === x ? 'on' : ''}`}
                  onClick={() => setSize(size.trim().toUpperCase() === x ? '' : x)}
                >
                  {x}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Zargarlik buyumi: yorliqdagi qatorlar. Narx massa × gramm
            narxidan chiqadi, lekin qo'lda ham yozsa bo'ladi. */}
        {gold && (
          <>
            <label>{t('goldProba')}</label>
            <div className="chip-row wrap">
              {PROBAS.map((x) => (
                <button
                  key={x}
                  className={`chip ${proba === x ? 'on' : ''}`}
                  onClick={() => {
                    setProba(x);
                    setGoldAuto(x, weight);
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>{t('goldWeight')}</label>
                <input
                  value={weight}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.,]/g, '');
                    setWeight(v);
                    setGoldAuto(proba, v);
                  }}
                  inputMode="decimal"
                  placeholder="4.6"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>{t('goldSize')}</label>
                <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="18" />
              </div>
            </div>
            <label>{t('goldStone')}</label>
            <input value={stone} onChange={(e) => setStone(e.target.value)} placeholder="—" />
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label>{t('costPrice')} ({basisText(basis)})</label>
            <input value={formatAmount(form.cost_price)} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} inputMode="numeric" />
          </div>
          <div style={{ flex: 1 }}>
            <label>{t('sellPrice')} ({basisText(basis)})</label>
            <input value={formatAmount(form.sell_price)} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} inputMode="numeric" />
          </div>
        </div>
        {basis.qty !== 1 && basisSell > 0 && (
          <p className="field-note">
            1 {t(`unit_${form.unit}`)} = <b>{fmt(unitSell)}</b>
          </p>
        )}
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
              {priceLabel(priceAfter(unitSell, discount), form.unit, basis.qty)}
            </b>
          </p>
        )}

        {/* Srok endi partiyaga tegishli: bir tovar ikki marta kelsa
            har birining o'z muddati bo'ladi. Ilgari yangi kirim
            eskisining srogini o'chirib yuborardi. */}
        {/* Partiyalar — bir tovar bir necha marta kelganda. Yakka
            buyumli do'konda (zargarlik, telefon) har buyum bir marta
            keladi, ya'ni bu blok doim bitta qatordan iborat bo'lardi. */}
        {!prof.unique && <Batches product={product} />}

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

/* ───────── Inventarizatsiya ─────────
 *
 * Maqsad: javondagi tovarni hisobdagi bilan solishtirish. Zargarlik
 * do'konida bu 200 ta buyumni birkasidan skanerlab chiqish demak —
 * bir o'tirishda tugamaydi va do'konchi ekrandan chiqib ketadi.
 *
 * Shuning uchun "tekshirildi" belgisi SERVERDA saqlanadi: qaytib
 * kirilganda sanoq qayeridan to'xtagan bo'lsa o'sha yerdan davom
 * etadi. Ekran ikkiga bo'lingan — tekshirilmaganlar va
 * tekshirilganlar; skanerlangan buyum birinchisidan ikkinchisiga
 * o'tadi. Oxirida "Tekshirilmagan" da qolganlar — javonda topilmagan
 * tovarlar, ya'ni aynan izlanayotgan narsa.
 */

function Stocktake({ products, onBack }: { products: Product[]; onBack: () => void }) {
  const { t } = useT();
  /** product_id → javonda topilgan son */
  const [marks, setMarks] = useState<Record<number, number>>({});
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState<'left' | 'done'>('left');
  const [result, setResult] = useState<StocktakeRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState<Record<number, string>>({});
  // Qaytadan boshlash oynasi: ogohlantirish va Telegramdan kelgan kod
  const [restart, setRestart] = useState(false);
  useEscape(() => setRestart(false), restart);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .invSession()
      .then((s) => {
        setMarks(Object.fromEntries(s.marks.map((m) => [m.product_id, m.actual])));
        setTotal(s.total);
      })
      .catch(loadFailed);
  }, []);

  /** Tovarni tekshirilgan deb belgilash. Son berilmasa — hisobdagidek. */
  async function mark(p: Product, actual?: number) {
    try {
      const r = await api.invMark(p.id!, actual);
      setMarks((m) => ({ ...m, [r.product_id]: r.actual }));
      haptic.success();
      return true;
    } catch (e: any) {
      toast.error(p.name, e.message);
      return false;
    }
  }

  async function unmark(id: number) {
    try {
      await api.invUnmark(id);
      setMarks((m) => { const n = { ...m }; delete n[id]; return n; });
      haptic.tap();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    }
  }

  /** Skanerdan kelgan kod. Skaner YOPILMAYDI: sanoqchi buyumlarni
   *  ketma-ket o'tkazadi, har biriga qayta ochib o'tirmaydi. */
  async function onScan(kod: string) {
    const p = products.find(
      (x) => String(x.barcode ?? '') === kod || String(x.barcode ?? '').replace(/^0+/, '') === kod.replace(/^0+/, '')
    );
    if (!p?.id) {
      // Bu kod omborda yo'q — sanoqchi buni sezmay o'tib ketmasin
      scanFail();
      toast.error(t('toastNotFound'), kod);
      return;
    }
    if (marks[p.id] !== undefined) {
      toast.info(p.name, t('invMarked'));
      return;
    }
    if (await mark(p)) toast.success(p.name, t('invMarked'));
  }

  async function apply() {
    const items = Object.entries(marks).map(([id, actual]) => ({ product_id: Number(id), actual }));
    if (!items.length) return;
    setBusy(true);
    try {
      const res = await api.stocktake(items);
      setResult(res.items.filter((r) => r.diff !== 0));
      setMarks({});
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  /* ── Qaytadan boshlash ──
   *
   * Bu bir necha soatlik ishni o'chiradi, shuning uchun tasdiq kodi
   * do'kon EGASINING Telegramiga boradi. Xodim ham, tasodifiy bosish
   * ham buni bajara olmaydi. */
  async function getCode() {
    setBusy(true);
    try {
      const r = await api.invResetCode();
      setCodeSent(true);
      if (r.via === 'telegram') toast.success(t('invRestartCode'));
      else toast.error(t('invRestartNoTg'));
      if (r.dev_hint) setCode(r.dev_hint);
    } catch (e: any) {
      toast.error(e.message === 'forbidden' ? t('invOwnerOnly') : t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setBusy(true);
    try {
      await api.invReset(code.trim());
      setMarks({});
      setRestart(false);
      setCode('');
      setCodeSent(false);
      toast.success(t('invRestartDone'));
    } catch (e: any) {
      toast.error(e.message === 'code_expired' ? t('invCodeExpired') : t('invBadCode'));
    } finally {
      setBusy(false);
    }
  }

  const mos = (p: Product) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || String(p.barcode ?? '').toLowerCase().includes(q);
  };
  const qolgan = products.filter((p) => marks[p.id!] === undefined);
  const tekshirilgan = products.filter((p) => marks[p.id!] !== undefined);
  const list = (tab === 'left' ? qolgan : tekshirilgan).filter(mos);
  const jami = total || products.length;
  const done = Object.keys(marks).length;

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
        <p className="hint" style={{ margin: '0 4px 10px' }}>{t('invScanHelp')}</p>

        {/* Qancha bajarilgani doim ko'rinib tursin — 200 ta buyumni
            sanayotgan odam "yana qancha qoldi" deb o'ylaydi */}
        <div className="inv-progress">
          <div className="inv-bar"><i style={{ width: `${jami ? (done / jami) * 100 : 0}%` }} /></div>
          <b>{t('invProgress', { done: String(done), all: String(jami) })}</b>
        </div>

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
          <button className="search-scan" onClick={() => setScanning(true)} aria-label={t('scanner')}>
            <Glyph name="scan" size={20} color="#fff" />
          </button>
        </div>

        {/* Skaner UZLUKSIZ: buyumlar ketma-ket o'tkaziladi, har biriga
            skanerni qayta ochish 200 ta buyumda chidab bo'lmas ish */}
        {scanning && (
          <Scanner
            continuous
            status={t('invProgress', { done: String(done), all: String(jami) })}
            onScan={onScan}
            onClose={() => setScanning(false)}
          />
        )}

        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { id: 'left', label: `${t('invTabLeft')} (${qolgan.length})` },
            { id: 'done', label: `${t('invTabDone')} (${tekshirilgan.length})` },
          ]}
        />

        <div className="list-group">
          {list.map((p) => {
            const bor = marks[p.id!];
            const farq = bor === undefined ? null : bor - p.stock;
            return (
              <div className="list-item" key={p.id}>
                <div className="lead">
                  <Thumb p={p} size={36} />
                  <div style={{ minWidth: 0 }}>
                    {/* Razmer va proba bo'lmasa kiyim yoki zargarlik
                        do'konida bir xil nomli beshta qator ko'rinardi
                        va sanoqchi qaysi biriga yozishni bilmasdi */}
                    <div className="name">
                      {p.name}
                      {itemLine(p) && <i className="nm-belgi">{itemLine(p)}</i>}
                    </div>
                    <div className="sub">
                      {t('stock')}: {p.stock} {p.unit}
                      {farq !== null && farq !== 0 && (
                        <span style={{ color: farq < 0 ? 'var(--red)' : 'var(--green)' }}>
                          {' '}· {t('diff')}: {farq > 0 ? '+' : ''}{farq}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {tab === 'left' ? (
                  <div className="inv-act">
                    {/* Son yozilmasa "hisobdagidek" deb belgilanadi:
                        skanerlab o'tayotgan odam har buyumga raqam
                        terib o'tirmaydi */}
                    <input
                      value={qty[p.id!] ?? ''}
                      onChange={(e) => setQty({ ...qty, [p.id!]: e.target.value.replace(/[^\d.,]/g, '') })}
                      inputMode="decimal"
                      placeholder={String(p.stock)}
                      aria-label={p.name}
                    />
                    <button
                      className="inv-ok"
                      aria-label={t('invMarked')}
                      onClick={() => {
                        const v = (qty[p.id!] ?? '').replace(',', '.').trim();
                        mark(p, v === '' ? undefined : Number(v) || 0);
                      }}
                    >
                      <Glyph name="check" size={17} color="#fff" />
                    </button>
                  </div>
                ) : (
                  <div className="inv-act">
                    <span className="inv-val">{bor}</span>
                    <button className="inv-undo" aria-label={t('invUndo')} onClick={() => unmark(p.id!)}>
                      <Glyph name="close" size={16} color="var(--muted)" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {list.length === 0 && (
          <div className="empty">
            {tab === 'left' ? (query ? t('noProductsFilter') : t('invNoneLeft')) : query ? t('noProductsFilter') : t('invNoneDone')}
          </div>
        )}

        <button className="btn-primary" onClick={apply} disabled={busy || done === 0}>
          <Glyph name="check" size={18} color="#fff" /> {t('applyStocktake')}
        </button>
        <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => setRestart(true)}>
          {t('invRestart')}
        </button>
      </div>

      {/* Qaytadan boshlash — ogohlantirish va Telegramdagi kod */}
      {restart && (
        <div className="sheet-wrap" onClick={() => setRestart(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-title">{t('invRestartTitle')}</div>
            {/* Ogohlantirish KOD SO'RALADIGAN joyning o'zida turadi:
                boshqa ekranda qolsa odam uni o'qimasdan o'tib ketardi */}
            <p className="inv-warn">{t('invRestartWarn', { n: String(done) })}</p>
            {!codeSent ? (
              <button className="btn-primary" disabled={busy} onClick={getCode}>
                {t('invRestartGet')}
              </button>
            ) : (
              <>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  placeholder="123456"
                  className="mono"
                  style={{ textAlign: 'center', letterSpacing: 4, fontSize: 20 }}
                  aria-label={t('invRestartGet')}
                />
                <button
                  className="btn-primary"
                  style={{ background: 'var(--red)' }}
                  disabled={busy || code.trim().length < 4}
                  onClick={doReset}
                >
                  {t('invRestart')}
                </button>
              </>
            )}
            <button className="btn-ghost" onClick={() => setRestart(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────── Partiyalar ───────── */

/**
 * Bitta tovar bir necha marta keladi va har safar o'z srogi bilan
 * keladi. Do'konchi javonda qaysi partiya turganini va qaysi biri
 * birinchi tugashini shu yerdan ko'radi.
 *
 * Sotuvda srogi eng erta tugaydigani birinchi ketadi — pastdagi
 * ro'yxat ham o'sha tartibda.
 */
function Batches({ product }: { product: Product }) {
  const [rows, setRows] = useState<Batch[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const { t } = useT();
  // Srogi yo'q do'konda partiya faqat "qachon va qancha keldi" —
  // "Sroksiz" degan bo'sh ustun ko'rsatilmaydi
  const withExpiry = profile().expiry;

  const load = () => api.productBatches(product.id!).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, [product.id]);

  if (!rows) return null;

  return (
    <>
      <label>{t('batchesTitle')}</label>
      {rows.length === 0 ? (
        <p className="hint">{t('batchesNone')}</p>
      ) : (
        <>
          <div className="card" style={{ padding: 0 }}>
            {rows.map((b) => {
              const days = b.expiry_date ? daysTo(b.expiry_date) : null;
              const color = days === null ? 'var(--muted)' : days < 0 ? 'var(--red)' : days <= 7 ? 'var(--yellow)' : 'var(--green)';
              return (
                <div key={b.id}>
                  <div
                    className="batch-row"
                    onClick={() => withExpiry && setEditing(editing === b.id ? null : b.id)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="batch-qty">{qtyWithUnit(b.qty_left, product.unit)}</div>
                      <div className="batch-when">{fmtDay(b.created_at)} {t('batchCame')}</div>
                    </div>
                    {withExpiry && (
                      <div className="batch-exp" style={{ color }}>
                        {b.expiry_date ? fmtDay(b.expiry_date) : t('batchNoExpiry')}
                      </div>
                    )}
                  </div>
                  {editing === b.id && withExpiry && (
                    <div style={{ padding: '0 13px 11px' }}>
                      <DateField
                        value={b.expiry_date ?? ''}
                        onChange={async (v) => {
                          try {
                            setRows(await api.setBatchExpiry(product.id!, b.id, v || null));
                            setEditing(null);
                          } catch (e: any) {
                            // Xato ushlanmasa sana saqlanmagan bo'lsa ham
                            // maydon yopilib, saqlangandek ko'rinardi —
                            // keyingi ochilishda eskisi qaytib kelardi
                            toast.error(t('error'), e.message);
                          }
                        }}
                        ariaLabel={t('expiry')}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* "Srogi erta tugaydigani birinchi sotiladi" — srok yo'q
              do'konda bu va'da yolg'on bo'lardi */}
          {withExpiry && <p className="hint">{t('batchesHint')}</p>}
        </>
      )}
    </>
  );
}
