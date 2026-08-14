import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ean13Svg } from './ean13';
import { group } from './i18n';

// Chek va yorliq chop etish.
//
// Yangi oyna ochilmaydi (telefon brauzerlari va Telegram ichida u bloklanadi).
// O'rniga chop etiladigan qism sahifaga qo'shiladi, CSS esa chop etishda
// faqat shuni ko'rsatib, qolgan hamma narsani yashiradi.

/** Chop etiladigan qismni sahifaga qo'yadi va darhol chop etish oynasini ochadi */
export function PrintSheet({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  useEffect(() => {
    // Brauzer chizib bo'lishini kutamiz, aks holda bo'sh varaq chiqadi
    const timer = setTimeout(() => {
      window.print();
      onDone();
    }, 120);
    return () => clearTimeout(timer);
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

      <div className="r-thanks">{t('receiptThanks')}</div>
    </div>
  );
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
          <div className="label" key={n}>
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
