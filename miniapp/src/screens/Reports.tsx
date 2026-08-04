import { useEffect, useState } from 'react';
import { api, fmt, getToken, Report } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader, EmptyState, Segmented } from '../ui';
import { useT, group } from '../i18n';
import { expenseCatLabel, expenseCatIcon } from '../expenseCats';

type Period = 'day' | 'week' | 'month';
const PERIODS: [Period, string][] = [
  ['day', 'periodDay'],
  ['week', 'periodWeek'],
  ['month', 'periodMonth'],
];

export default function Reports({ onBack, onOpenExpenses }: { onBack: () => void; onOpenExpenses: () => void }) {
  const [period, setPeriod] = useState<Period>('day');
  const [data, setData] = useState<Report | null>(null);
  const { t } = useT();

  useEffect(() => {
    api.reports(period).then(setData).catch(() => {});
  }, [period]);

  return (
    <>
      <SubHeader title={t('navReports')} onBack={onBack} />
      <div className="screen">
      <Segmented
        value={period}
        onChange={setPeriod}
        items={PERIODS.map(([id, key]) => ({ id, label: t(key) }))}
      />

      {!data ? (
        <div className="empty">{t('loading')}</div>
      ) : (
        <>
          <div className="duo">
            <div>
              <div className="k">{t('revenue')} ({data.count})</div>
              <div className="v">{fmt(data.revenue)}</div>
            </div>
            <div>
              <div className="k">{t('grossProfit')}</div>
              <div className="v green">{fmt(data.profit)}</div>
            </div>
          </div>

          {/* Sof foyda: yalpi foydadan xarajatlar ayrilgani.
              Do'konchi aslida qancha ishlaganini shu ko'rsatadi. */}
          <div className="card net-card" onClick={onOpenExpenses} style={{ cursor: 'pointer' }}>
            <div className="net-line">
              <span className="k">{t('grossProfit')}</span>
              <span className="v">{fmt(data.profit)}</span>
            </div>
            <div className="net-line">
              <span className="k">
                <AppIcon glyph="wallet" size={20} /> {t('expenses')}
              </span>
              <span className="v red">−{group(data.expenses)}</span>
            </div>
            <div className="net-line total">
              <span className="k">{t('netProfit')}</span>
              <span className={`v ${data.net_profit >= 0 ? 'green' : 'red'}`}>{fmt(data.net_profit)}</span>
            </div>
            {data.expenses === 0 && <div className="net-hint">{t('expenseEmptySub')}</div>}
          </div>

          {data.expenses_by_category.length > 0 && (
            <>
              <div className="section-title">{t('expenseByCategory')}</div>
              <div className="list-group">
                {data.expenses_by_category.map((c) => (
                  <div className="list-item" key={c.category} onClick={onOpenExpenses} style={{ cursor: 'pointer' }}>
                    <div className="lead">
                      <AppIcon glyph={expenseCatIcon(c.category).glyph} color={expenseCatIcon(c.category).color} size={26} />
                      <div className="name">{expenseCatLabel(c.category, t)}</div>
                    </div>
                    <div className="amount" style={{ color: 'var(--red)' }}>−{group(c.total)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

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

          {data.count === 0 && <EmptyState icon="chart" title={t('noSalesPeriod')} sub={t('noSalesPeriodSub')} />}

          {data.count > 0 && (
            <button
              className="btn-primary btn-lg"
              onClick={async () => {
                // token bilan yuklab olamiz va faylni saqlaymiz
                const res = await fetch(api.exportUrl(period), {
                  headers: { Authorization: `Bearer ${getToken()}` },
                });
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `hisobot-${period}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Glyph name="arrowDown" size={17} color="#fff" /> {t('exportCsv')}
            </button>
          )}
        </>
      )}
    </div>
    </>
  );
}
