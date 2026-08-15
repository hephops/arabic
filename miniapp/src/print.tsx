import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ean13Svg } from './ean13';
import { qrSvg } from './qr';
import { group } from './i18n';

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
 *  kelmasa ham ilova qotib qolmasin deb zaxira taymer bor. */
export function PrintSheet({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  useEffect(() => {
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

    const cleanup = () => {
      window.removeEventListener('afterprint', onAfterPrint);
      window.removeEventListener('focus', onFocus);
      mql?.removeEventListener?.('change', onMedia);
      clearTimeout(openTimer);
      clearTimeout(guardTimer);
    };

    window.addEventListener('afterprint', onAfterPrint);
    window.addEventListener('focus', onFocus);
    mql?.addEventListener?.('change', onMedia);

    // Brauzer chizib bo'lishini kutamiz, aks holda bo'sh varaq chiqadi
    const openTimer = setTimeout(() => {
      printing = true;
      printStartedAt = Date.now();
      window.print();
    }, 150);

    // Zaxira: hech qanday hodisa kelmasa ham ilova chop etish holatida
    // qotib qolmaydi (do'konchi keyingi chekni chiqara olsin)
    const guardTimer = setTimeout(finish, 120_000);

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
  const qr = qrSvg(receiptQrText(data, t), { size: 3 });
  return (
    <div className="receipt">
      <div className="r-head">
        <div className="r-shop">{data.shop?.name ?? ''}</div>
        {data.shop?.address && <div className="r-sub">{data.shop.address}</div>}
        {data.shop?.phone && <div className="r-sub">{data.shop.phone}</div>}
      </div>

      <div className="r-meta">
        <span>{t('receipt')} #{data.id}</span>
        <span>{data.created_at.slice(0, 16).replace('T', ' ')}</span>
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
                  {i.qty} {i.unit ?? t('pcs')} × {group(i.price)}
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

      {/* QR — xaridor telefoni bilan o'qiydi: do'kon, chek raqami, sana,
          summa; qarzga olingan bo'lsa karta raqami ham shu yerda */}
      {qr && (
        <div className="r-qr" dangerouslySetInnerHTML={{ __html: qr }} />
      )}

      <div className="r-thanks">{t('receiptThanks')}</div>
    </div>
  );
}

/** Chekdagi QR ichiga yoziladigan matn */
export function receiptQrText(data: ReceiptData, t: (k: string) => string): string {
  const lines = [
    data.shop?.name ?? '',
    `${t('receipt')} #${data.id} · ${data.created_at.slice(0, 16).replace('T', ' ')}`,
    `${t('total')}: ${group(data.total)} ${t('currency')}`,
  ];
  if (data.payment_type === 'debt') {
    lines.push(t('payDebt'));
    if (data.customer?.name) lines.push(data.customer.name);
    if (data.shop?.card_number) lines.push(`${t('cardNumber')}: ${data.shop.card_number}`);
  }
  if (data.shop?.phone) lines.push(data.shop.phone);
  return lines.filter(Boolean).join('\n');
}

export interface LabelItem {
  name: string;
  price: number;
  barcode: string;
}

/** Javon yorlig'i: nomi, narxi va shtrix-kod. Bir varaqqa bir nechtasi sig'adi. */
export function Labels({ items, t }: { items: LabelItem[]; t: (k: string) => string }) {
  return (
    <div className="labels">
      {items.map((item, n) => {
        const svg = ean13Svg(item.barcode, { moduleWidth: 2, height: 46 });
        return (
          <div className="print-label" key={n}>
            <div className="l-name">{item.name}</div>
            <div className="l-price">
              {group(item.price)} {t('currency')}
            </div>
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
