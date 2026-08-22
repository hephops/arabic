import { useState } from 'react';
import { api, fmt, Product } from './api';
import { Glyph } from './icons';
import { translate } from './i18n';
import { toast } from './toast';
import { useEscape } from './useEscape';

// Srogi yaqin tovarlarga chegirma qo'yish varag'i.
//
// Muddati o'tib ketgan tovar — to'g'ridan-to'g'ri zarar: pul allaqachon
// to'langan, tovar esa chiqindiga ketadi. Shuning uchun bu yerda maqsad
// "hisobot ko'rsatish" emas, do'konchini bir bosishda harakatga o'tkazish:
// tovarlarni belgila, foizni tanla, tayyor.

const PERCENTS = [10, 20, 30, 50];

/** Chegirmadan keyingi narx — serverdagi hisob bilan bir xil bo'lishi shart
 *  (backend/src/server.ts: priceWithDiscount va roundPrice) */
export function priceAfter(sellPrice: number, percent: number): number {
  const pct = Math.min(90, Math.max(0, percent));
  if (!pct) return sellPrice;
  const v = (sellPrice * (100 - pct)) / 100;
  // Yaxlitlash qadami narxga qarab: kichik birlik narxida (ml, gramm)
  // 100 so'mlik qadam chegirmani foizdan katta qilib yuborardi, eng
  // arzon tovarda esa narxni umuman nolga tushirardi
  const step = v >= 10000 ? 100 : v >= 1000 ? 10 : 1;
  return Math.round(v / step) * step;
}

export function DiscountSheet({
  items,
  onClose,
  onSaved,
}: {
  items: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = translate;
  const [percent, setPercent] = useState(20);
  // Boshida hammasi belgilangan — do'konchi odatda hammasiga qo'yadi
  const [picked, setPicked] = useState<Set<number>>(new Set(items.map((i) => i.id!).filter(Boolean)));
  const [busy, setBusy] = useState(false);

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function apply(pct: number) {
    if (busy || picked.size === 0) return;
    setBusy(true);
    try {
      const res = await api.setDiscount([...picked], pct);
      toast.success(
        pct > 0 ? t('discountApplied') : t('discountRemoved'),
        `${res.changed} ${t('itemsShort')}${pct > 0 ? ` · −${pct}%` : ''}`
      );
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  const anyDiscounted = items.some((i) => (i.discount_percent ?? 0) > 0);

  // Kompyuterda Escape bilan ham yopilsin
  useEscape(onClose);

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{t('discountTitle')}</div>
        <div className="sheet-sub">{t('discountHint')}</div>

        <div className="chip-row wrap">
          {PERCENTS.map((p) => (
            <button key={p} className={`chip ${percent === p ? 'on' : ''}`} onClick={() => setPercent(p)}>
              −{p}%
            </button>
          ))}
        </div>

        <div className="disc-list">
          {items.map((i) => {
            const on = picked.has(i.id!);
            return (
              <div className={`disc-row ${on ? '' : 'off'}`} key={i.id} onClick={() => toggle(i.id!)}>
                <span className={`ol-check ${on ? 'on' : ''}`}>
                  {on && <Glyph name="check" size={13} color="#fff" />}
                </span>
                <span className="dr-name">{i.name}</span>
                <span className="dr-price">
                  <span className="old-price">{fmt(i.sell_price)}</span>
                  <b>{fmt(priceAfter(i.sell_price, percent))}</b>
                </span>
              </div>
            );
          })}
        </div>

        <button className="btn-primary btn-lg" onClick={() => apply(percent)} disabled={busy || picked.size === 0}>
          <Glyph name="check" size={18} color="#fff" /> {t('discountApply')} −{percent}% ({picked.size})
        </button>
        {anyDiscounted && (
          <button className="btn-ghost danger" onClick={() => apply(0)} disabled={busy || picked.size === 0}>
            {t('discountRemove')}
          </button>
        )}
      </div>
    </div>
  );
}
