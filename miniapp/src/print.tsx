import { useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ean13Svg } from './ean13';
import { qrSvg } from './qr';
import { group } from './i18n';
import { fmtDateTime } from './format';
import { qtyText } from './units';

// Chek va yorliq chop etish.
//
// Yangi oyna ochilmaydi (telefon brauzerlari va Telegram ichida u bloklanadi).
// O'rniga chop etiladigan qism sahifaga qo'shiladi, CSS esa chop etishda
// faqat shuni ko'rsatib, qolgan hamma narsani yashiradi.

/** Chop etiladigan qismni sahifaga qo'yadi va darhol chop etish oynasini ochadi
 *
 *  DIQQAT — chek qachon o'chirilishi juda muhim:
 *
 *  Kompyuterda `window.print()` chop etish oynasi yopilguncha KUTADI,
 *  shuning uchun undan keyin darhol o'chirsa ham chek varaqqa tushib
 *  ulgurgan bo'ladi. iPhone (Safari) da esa u DARHOL qaytadi — chop
 *  etish oynasi keyinroq ochiladi. Natijada chek DOM'dan o'chirilgan
 *  bo'lib, telefonda BO'SH VARAQ chiqardi.
 *
 *  Shuning uchun endi chekni faqat chop etish haqiqatan tugagach
 *  o'chiramiz: `afterprint`, `matchMedia('print')` va sahifaga
 *  qaytish (focus) — uchalasidan qaysi biri birinchi kelsa. Hech biri
 *  kelmasa ham ilova qotib qolmasin deb zaxira taymer bor.
 *
 *  IKKINCHI MUHIM JOY — `window.print()` QACHON chaqiriladi:
 *
 *  iPhone (Safari) chop etishni faqat foydalanuvchi bosgan paytda
 *  ochadi. Ilgari u `setTimeout` ichida chaqirilardi — taymer bosishdan
 *  uzilib qolgani uchun Safari uni jimgina bekor qilardi va tugma
 *  umuman ishlamayotgandek tuyulardi. Endi `useLayoutEffect` ichida,
 *  bosish hali tugamasdan turib chaqiriladi. Chek DOM'ga qo'yilgan
 *  bo'ladi, undan oldin bir marta reflow majburlanadi — shunda varaq
 *  bo'sh chiqmaydi. */
export function PrintSheet({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  useLayoutEffect(() => {
    let finished = false;
    // Chop etish boshlanganini bilamiz — undan oldingi "focus" hodisasi
    // (masalan klaviatura yopilishi) chekni erta o'chirib yubormasin
    let printing = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      onDone();
    };

    const onAfterPrint = () => finish();
    // Safari `afterprint` ni har doim ham bermaydi — chop etish rejimidan
    // chiqqanini media so'rovi orqali ham kuzatamiz
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
    const onMedia = (e: MediaQueryListEvent) => {
      if (e.matches) printing = true;
      else if (printing) finish();
    };
    // iOS'da chop etish varag'i yopilganda sahifa fokusni qaytaradi.
    // Lekin varaq OCHILAYOTGANDA ham qisqa fokus bo'lishi mumkin —
    // shunda chek erta o'chib, yana bo'sh varaq chiqardi. Shuning uchun
    // fokusni faqat chop etish boshlanganidan biroz vaqt o'tgach
    // "tugadi" deb hisoblaymiz.
    let printStartedAt = 0;
    const FOCUS_GRACE_MS = 1500;
    const onFocus = () => {
      if (printing && Date.now() - printStartedAt > FOCUS_GRACE_MS) finish();
    };

    // Zaxira taymer. E'LON QILINISHI shu yerda: `cleanup` uni tozalaydi,
    // `window.print()` esa ba'zi brauzerlarda darhol `afterprint` beradi —
    // ya'ni cleanup taymer yaratilishidan OLDIN chaqirilishi mumkin.
    // Ilgari u pastda `const` bilan e'lon qilingan edi va shunday
    // holatda "Cannot access 'guardTimer' before initialization" xatosi
    // chiqib, onDone() umuman ishlamasdi — chop etish qatlami ekranda
    // osilib qolardi.
    let guardTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      window.removeEventListener('afterprint', onAfterPrint);
      window.removeEventListener('focus', onFocus);
      mql?.removeEventListener?.('change', onMedia);
      if (guardTimer) clearTimeout(guardTimer);
    };

    window.addEventListener('afterprint', onAfterPrint);
    window.addEventListener('focus', onFocus);
    mql?.addEventListener?.('change', onMedia);

    printing = true;
    printStartedAt = Date.now();
    // Reflow: chek o'lchamlari hisoblanib bo'lsin, aks holda ba'zi
    // brauzerlarda bo'sh varaq chiqadi
    void document.body.offsetHeight;
    try {
      window.print();
    } catch {
      // Chop etish umuman yo'q qurilma — oynada osilib qolmaymiz
      finish();
    }

    // Hech qanday hodisa kelmasa ham ilova chop etish holatida qotib
    // qolmaydi (do'konchi keyingi chekni chiqara olsin)
    guardTimer = setTimeout(finish, 120_000);

    return cleanup;
  }, []);

  return createPortal(<div className="print-root">{children}</div>, document.body);
}

export interface ReceiptLine {
  name: string;
  qty: number;
  price: number;
  unit?: string;
}

export interface ReceiptData {
  id: number;
  created_at: string;
  total: number;
  payment_type: string;
  items: ReceiptLine[];
  shop?: { name: string; phone?: string | null; address?: string | null; card_number?: string | null } | null;
  customer?: { name: string; phone?: string | null } | null;
  seller?: { name: string } | null;
  returned?: number;
}

/** Termal printer uchun chek (58 mm). Oddiy A4 printerda ham chiqaveradi. */
export function Receipt({ data, t }: { data: ReceiptData; t: (k: string) => string }) {
  const payLabel =
    data.payment_type === 'cash' ? t('payCash') : data.payment_type === 'card' ? t('payCard') : t('payDebt');
  return (
    <div className="receipt">
      <div className="r-head">
        <div className="r-shop">{data.shop?.name ?? ''}</div>
        {data.shop?.address && <div className="r-sub">{data.shop.address}</div>}
        {data.shop?.phone && <div className="r-sub">{data.shop.phone}</div>}
      </div>

      <div className="r-meta">
        <span>{t('receipt')} #{data.id}</span>
        <span>{fmtDateTime(data.created_at)}</span>
      </div>
      {data.seller?.name && (
        <div className="r-meta">
          <span>{t('seller')}</span>
          <span>{data.seller.name}</span>
        </div>
      )}

      <div className="r-rule" />

      <table className="r-items">
        <tbody>
          {data.items.map((i, n) => (
            <tr key={n}>
              <td className="r-name">
                {i.name}
                <div className="r-qty">
                  {qtyText(i.qty)} {i.unit ?? t('pcs')} × {group(i.price)}
                </div>
              </td>
              <td className="r-sum">{group(i.price * i.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="r-rule" />

      <div className="r-total">
        <span>{t('total')}</span>
        <span>{group(data.total)} {t('currency')}</span>
      </div>
      <div className="r-meta">
        <span>{t('paymentLabel')}</span>
        <span>{payLabel}</span>
      </div>
      {!!data.returned && data.returned > 0 && (
        <div className="r-meta">
          <span>{t('returned')}</span>
          <span>−{group(data.returned)}</span>
        </div>
      )}

      {data.payment_type === 'debt' && data.customer && (
        <>
          <div className="r-rule" />
          <div className="r-meta">
            <span>{t('customerName')}</span>
            <span>{data.customer.name}</span>
          </div>
          {data.shop?.card_number && (
            <div className="r-card">
              {t('cardNumber')}: {data.shop.card_number}
            </div>
          )}
        </>
      )}

      <div className="r-thanks">{t('receiptThanks')}</div>
    </div>
  );
}

export interface LabelItem {
  name: string;
  price: number;
  barcode: string;
  /* Zargarlik birkasi uchun — buyumning o'z belgilari */
  proba?: string | null;
  weight_g?: number | null;
  size?: string | null;
  stone?: string | null;
}

/**
 * Javon yorlig'i: nomi, narxi va shtrix-kod. Bir varaqqa bir nechtasi
 * sig'adi.
 *
 * Zargarlikda birka butunlay boshqacha: u tor va uzun bo'lib buyumga
 * ip bilan bog'lanadi, ustida esa nom emas — PROBA, RAZMER, MASSA va
 * VSTAVKA turadi. Kod ham chiziqli emas, QR: birkaning eni chiziqli
 * kodga yetmaydi. Shuning uchun `gold` bo'lsa boshqa shakl chiziladi.
 */
export function Labels({
  items,
  t,
  gold = false,
  showPrice = false,
}: {
  items: LabelItem[];
  t: (k: string) => string;
  gold?: boolean;
  /** Yorliqda narx yozilsinmi. Standart — yo'q: narx o'zgaradi,
   *  yorliq esa tovarda qolib ketadi va eski narx kassada nizoga
   *  sabab bo'ladi. */
  showPrice?: boolean;
}) {
  if (gold) {
    return (
      <div className="labels">
        {items.map((item, n) => (
          <GoldTag key={n} item={item} />
        ))}
      </div>
    );
  }
  return (
    <div className="labels">
      {items.map((item, n) => {
        const svg = ean13Svg(item.barcode, { moduleWidth: 2, height: 46 });
        return (
          <div className="print-label" key={n}>
            <div className="l-name">{item.name}</div>
            {/* Razmer — kiyim do'konida yorliqdagi eng kerakli belgi:
                javondagi bir xil ko'ylaklarni faqat shu ajratadi.
                Boshqa do'konda maydon bo'sh bo'ladi va chizilmaydi. */}
            {String(item.size ?? '').trim() && <div className="l-size">{item.size}</div>}
            {showPrice && (
              <div className="l-price">
                {group(item.price)} {t('currency')}
              </div>
            )}
            {svg ? (
              <div className="l-code" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="l-code-text">{item.barcode}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Zargarlik birkasi — do'konlarda ishlatiladigan ko'rinishda.
 *
 *  Yozuvlar ataylab ruscha: O'zbekistondagi zargarlik birkalari shu
 *  ko'rinishda chiqadi va tekshiruvchi ham shunga qaraydi. */
function GoldTag({ item }: { item: LabelItem }) {
  const dash = (v?: string | null) => {
    const s = String(v ?? '').trim();
    return s && s !== '—' ? s : '-';
  };
  const qr = qrSvg(item.barcode, { module: 3 });
  return (
    <div className="gold-tag">
      <div className="gt-rows">
        <div><span>Проба</span><b>{dash(item.proba)}</b></div>
        <div><span>Размер</span><b>{dash(item.size)}</b></div>
        <div><span>Масса</span><b>{item.weight_g ? String(item.weight_g) : '-'}</b></div>
        <div><span>Вставка</span><b>{dash(item.stone)}</b></div>
      </div>
      {qr && <div className="gt-qr" dangerouslySetInnerHTML={{ __html: qr }} />}
      <div className="gt-code">{item.barcode}</div>
    </div>
  );
}

export interface OrderSheetLine {
  name: string;
  qty: number;
  unit: string;
}

/** Ta'minotchiga buyurtma — chop etiladigan / PDF qilib saqlanadigan varaq.
 *
 *  Chekdan farqli o'laroq bu A4 uchun: ta'minotchi uni qog'ozda o'qiydi
 *  yoki telefonida PDF qilib oladi. Shuning uchun kattaroq shrift,
 *  jadval ko'rinishi va imzo uchun joy. */
export function OrderPrint({
  lines,
  supplier,
  shop,
  date,
  t,
}: {
  lines: OrderSheetLine[];
  supplier?: string | null;
  shop?: { name: string; phone?: string | null; address?: string | null } | null;
  date: string;
  t: (k: string) => string;
}) {
  return (
    <div className="order-print">
      <div className="op-head">
        <div>
          <div className="op-title">{t('orderDocTitle')}</div>
          <div className="op-sub">{date}</div>
        </div>
        <div className="op-shop">
          <div className="op-shop-name">{shop?.name ?? ''}</div>
          {shop?.phone && <div className="op-sub">{shop.phone}</div>}
          {shop?.address && <div className="op-sub">{shop.address}</div>}
        </div>
      </div>

      {supplier && (
        <div className="op-to">
          {t('orderDocTo')}: <b>{supplier}</b>
        </div>
      )}

      <table className="op-table">
        <thead>
          <tr>
            <th className="op-n">№</th>
            <th>{t('orderDocProduct')}</th>
            <th className="op-q">{t('orderDocQty')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="op-n">{i + 1}</td>
              <td>{l.name}</td>
              <td className="op-q">
                {Math.round(l.qty * 100) / 100} {l.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="op-total">
        {t('orderDocTotal')}: <b>{lines.length}</b> {t('itemsShort')}
      </div>

      {/* Qog'ozda topshirib olish uchun imzo joyi */}
      <div className="op-signs">
        <div>
          <div className="op-line" />
          <div className="op-sub">{t('orderDocFrom')}</div>
        </div>
        <div>
          <div className="op-line" />
          <div className="op-sub">{t('orderDocGot')}</div>
        </div>
      </div>
    </div>
  );
}
