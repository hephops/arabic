import { useEffect, useState } from 'react';
import { api, fmt, Report } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader } from '../ui';
import { useT } from '../i18n';

type Period = 'day' | 'week' | 'month';
const PERIODS: [Period, string][] = [
  ['day', 'periodDay'],
  ['week', 'periodWeek'],
  ['month', 'periodMonth'],
];

export default function Reports({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState<Period>('day');
  const [data, setData] = useState<Report | null>(null);
  const { t } = useT();

  useEffect(() => {
    api.reports(period).then(setData).catch(() => {});
  }, [period]);

  return (
    <div className="screen">
      <SubHeader title={t('navReports')} onBack={onBack} />
      <div className="chip-row">
        {PERIODS.map(([id, key]) => (
          <button key={id} className={`chip ${period === id ? 'selected' : ''}`} onClick={() => setPeriod(id)}>
            {t(key)}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="empty">{t('loading')}</div>
      ) : (
        <>
          <div className="card split-card">
            <div className="split">
              <div className="label">{t('revenue')} ({data.count})</div>
              <div className="value">{fmt(data.revenue)}</div>
            </div>
            <div className="split">
              <div className="label">{t('profit')}</div>
              <div className="value green">{fmt(data.profit)}</div>
            </div>
          </div>

          <div className="section-title">{t('paymentTypes')}</div>
          <div className="list-group">
            <div className="list-item">
              <div className="lead"><Glyph name="banknote" size={20} color="var(--green)" /><div className="name">{t('payCash')}</div></div>
              <div className="amount">{fmt(data.cash)}</div>
            </div>
            <div className="list-item">
              <div className="lead"><Glyph name="card" size={20} color="var(--accent)" /><div className="name">{t('payCard')}</div></div>
              <div className="amount">{fmt(data.card)}</div>
            </div>
            <div className="list-item">
              <div className="lead"><Glyph name="book" size={20} color="var(--yellow)" /><div className="name">{t('payDebt')}</div></div>
              <div className="amount">{fmt(data.debt)}</div>
            </div>
          </div>

          {data.top_products.length > 0 && (
            <>
              <div className="section-title">{t('topProducts')}</div>
              <div className="list-group">
                {data.top_products.map((p, i) => (
                  <div className="list-item" key={p.name}>
                    <div className="lead">
                      <span style={{ width: 22, fontWeight: 700, color: 'var(--muted)' }}>{i + 1}</span>
                      <div className="name">{p.name}</div>
                    </div>
                    <div>
                      <div className="amount">{p.sold} {t('pcs')}</div>
                      <div className="sub" style={{ textAlign: 'right' }}>{fmt(p.revenue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {data.count === 0 && <div className="empty">{t('noSalesPeriod')}</div>}
        </>
      )}
    </div>
  );
}
