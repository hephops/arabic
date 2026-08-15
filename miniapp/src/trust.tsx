import type { Trust } from './api';
import { Glyph } from './icons';
import { translate } from './i18n';

// Qarzdorning ishonch reytingi — bir qarashda tushunarli belgi.
//
// Do'konchi qarz berishdan oldin "buni kutish mumkinmi" deb o'ylaydi.
// Javobni raqamlar bilan emas, rang bilan beramiz; batafsili esa
// mijoz kartochkasida ochib yoziladi ("5 qarzdan 4 tasi o'z vaqtida").

export const TRUST_COLOR: Record<Trust['level'], string> = {
  good: 'var(--green)',
  warn: 'var(--yellow)',
  bad: 'var(--red)',
  new: '#c7c7cc',
};

export function trustLabel(level: Trust['level'], t: (k: string) => string): string {
  return t(
    level === 'good' ? 'trustGood' : level === 'warn' ? 'trustWarn' : level === 'bad' ? 'trustBad' : 'trustNew'
  );
}

/** Ro'yxatdagi kichik nuqta — joyni egallamaydi, lekin ko'zga tashlanadi */
export function TrustDot({ trust, title }: { trust?: Trust | null; title?: string }) {
  if (!trust) return null;
  return (
    <span
      className={`trust-dot ${trust.level}`}
      style={{ background: TRUST_COLOR[trust.level] }}
      title={title ?? trustLabel(trust.level, translate)}
    />
  );
}

/** Mijoz kartochkasidagi to'liq izoh — nega shu rang berilgani aytiladi */
export function TrustCard({ trust }: { trust?: Trust | null }) {
  if (!trust) return null;
  const t = translate;
  const color = TRUST_COLOR[trust.level];

  // Sababni gap qilib aytamiz — quruq raqam do'konchiga hech narsa demaydi
  const reasons: string[] = [];
  if (trust.overdue_days > 0) {
    reasons.push(`${t('trustOverdueNow')}: ${trust.overdue_days} ${t('daysShort')}`);
  }
  if (trust.closed > 0) {
    reasons.push(`${trust.closed} ${t('trustOfDebts')} ${trust.on_time} ${t('trustOnTime')}`);
  }
  if (trust.late > 0) {
    reasons.push(`${t('trustAvgLate')}: ${trust.avg_late_days} ${t('daysShort')}`);
  }
  if (reasons.length === 0) reasons.push(t('trustNoHistory'));

  return (
    <div className="trust-card" style={{ borderLeftColor: color }}>
      <div className="tc-head">
        <span className="trust-dot" style={{ background: color }} />
        <span className="tc-title" style={{ color }}>
          {trustLabel(trust.level, t)}
        </span>
      </div>
      <div className="tc-body">{reasons.join(' · ')}</div>
    </div>
  );
}

/** Qarz yozishdan oldingi ogohlantirish — faqat qizil va sariq uchun */
export function TrustWarning({ trust, name }: { trust?: Trust | null; name?: string }) {
  if (!trust || trust.level === 'good' || trust.level === 'new') return null;
  const t = translate;
  const bad = trust.level === 'bad';
  return (
    <div className={`trust-warn ${bad ? 'bad' : ''}`}>
      <Glyph name="warning" size={17} color={bad ? 'var(--red)' : 'var(--yellow)'} />
      <div>
        <b>{name ? `${name} — ` : ''}{trustLabel(trust.level, t)}</b>
        <div className="tw-sub">
          {trust.overdue_days > 0
            ? `${t('trustOverdueNow')}: ${trust.overdue_days} ${t('daysShort')}`
            : `${trust.closed} ${t('trustOfDebts')} ${trust.late} ${t('trustLateCount')}`}
        </div>
      </div>
    </div>
  );
}
