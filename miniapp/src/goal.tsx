import { useState } from 'react';
import { api } from './api';
import { fmtShort, group, translate } from './i18n';
import { Glyph } from './icons';
import { formatAmount } from './format';
import { toast } from './toast';
import { useEscape } from './useEscape';

// "Bugungi maqsad" — kun davomidagi savdo maqsadga qancha yetganini
// ko'rsatuvchi chiziq.
//
// Nima uchun: kassada turgan sotuvchi uchun kun oxirida chiqadigan hisobot
// kech; unga kun davomida "yana qancha qoldi" degan javob kerak. Bu kichik
// element, lekin sotuvchini kun bo'yi harakatga soladi.

export function goalPercent(revenue: number, goal: number): number {
  if (!goal || goal <= 0) return 0;
  return Math.min(100, Math.round((revenue / goal) * 100));
}

/** Bosh sahifadagi keng ko'rinish — foiz, qolgan summa va chiziq */
export function GoalBar({ revenue, goal, onSet }: { revenue: number; goal: number; onSet?: () => void }) {
  const t = translate;
  if (!goal || goal <= 0) {
    if (!onSet) return null;
    // Maqsad qo'yilmagan bo'lsa — bir marta bosiladigan taklif
    return (
      <button className="goal-empty" onClick={onSet}>
        <Glyph name="flash" size={16} color="var(--accent)" />
        {t('goalSetPrompt')}
      </button>
    );
  }
  const pct = goalPercent(revenue, goal);
  const left = Math.max(0, goal - revenue);
  const done = left === 0;
  return (
    <div className="goal-bar" onClick={onSet} style={onSet ? { cursor: 'pointer' } : undefined}>
      <div className="gb-head">
        <span className="gb-label">
          {done ? <Glyph name="trophy" size={15} color="var(--green)" /> : <Glyph name="flash" size={15} color="var(--accent)" />}
          {done ? t('goalReached') : t('goalToday')}
        </span>
        <span className="gb-pct" style={done ? { color: 'var(--green)' } : undefined}>
          {pct}%
        </span>
      </div>
      <div className="gb-track">
        <div className={`gb-fill ${done ? 'done' : ''}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <div className="gb-sub">
        {done ? (
          <>
            {t('goalOver')}: <b>{fmtShort(revenue - goal)}</b>
          </>
        ) : (
          <>
            {t('goalLeft')}: <b>{fmtShort(left)}</b> · {t('goalOf')} {fmtShort(goal)}
          </>
        )}
      </div>
    </div>
  );
}

/** Kassa tepasidagi ingichka chiziq — joy egallamaydi, lekin ko'rinib turadi */
export function GoalStrip({ revenue, goal }: { revenue: number; goal: number }) {
  const t = translate;
  if (!goal || goal <= 0) return null;
  const pct = goalPercent(revenue, goal);
  const done = pct >= 100;
  return (
    <div className="goal-strip">
      <div className="gs-track">
        <div className={`gb-fill ${done ? 'done' : ''}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <span className="gs-text">
        {done ? (
          <>
            <Glyph name="trophy" size={13} color="var(--green)" /> {t('goalReached')}
          </>
        ) : (
          <>
            {fmtShort(revenue)} / {fmtShort(goal)} · {pct}%
          </>
        )}
      </span>
    </div>
  );
}

/** Maqsadni qo'yish oynasi — pastdan chiqadigan varaq.
 *
 *  Tayyor qiymatlar bugungi savdodan kelib chiqib taklif qilinadi:
 *  "bugun 800 ming sotgan bo'lsang, maqsad 1 mln bo'lsin" degan mantiq
 *  do'konchi uchun noldan raqam o'ylab topishdan osonroq. */
export function GoalSheet({
  goal,
  todayRevenue,
  onClose,
  onSaved,
}: {
  goal: number;
  todayRevenue: number;
  onClose: () => void;
  onSaved: (goal: number) => void;
}) {
  const t = translate;
  const [value, setValue] = useState(goal > 0 ? String(goal) : '');
  const [busy, setBusy] = useState(false);

  // Taklif: bugungi savdodan yuqoriroq, ko'rinishi chiroyli yumaloq sonlar
  const base = Math.max(todayRevenue, 300_000);
  const step = base >= 5_000_000 ? 1_000_000 : base >= 1_000_000 ? 500_000 : 100_000;
  const rounded = Math.ceil(base / step) * step;
  const presets = [rounded, rounded + step, rounded + step * 2];

  async function save(amount: number) {
    if (busy) return;
    setBusy(true);
    try {
      await api.updateMe({ daily_goal: amount });
      toast.success(amount > 0 ? t('goalSaved') : t('goalOff'), amount > 0 ? group(amount) : undefined);
      onSaved(amount);
      onClose();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  // Kompyuterda Escape bilan ham yopilsin
  useEscape(onClose);

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{t('goalTitle')}</div>
        <div className="sheet-sub">{t('goalHint')}</div>

        <div className="chip-row wrap">
          {presets.map((p) => (
            <button key={p} className={`chip ${String(p) === value ? 'on' : ''}`} onClick={() => setValue(String(p))}>
              {fmtShort(p)}
            </button>
          ))}
        </div>

        <input
          value={formatAmount(value)}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="1 000 000"
          autoFocus
        />

        <button className="btn-primary btn-lg" onClick={() => save(parseInt(value || '0', 10))} disabled={busy}>
          <Glyph name="check" size={18} color="#fff" /> {t('save')}
        </button>
        {goal > 0 && (
          <button className="btn-ghost danger" onClick={() => save(0)} disabled={busy}>
            {t('goalOff')}
          </button>
        )}
      </div>
    </div>
  );
}
