import { useEffect, useState } from 'react';
import { api, fmt, fmtShort, getToken, EmployeeStat, Report } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader, EmptyState, Segmented } from '../ui';
import { useT, group } from '../i18n';
import { expenseCatLabel, expenseCatIcon } from '../expenseCats';
import { loadFailed } from '../toast';

type Period = 'day' | 'week' | 'month';
const PERIODS: [Period, string][] = [
  ['day', 'periodDay'],
  ['week', 'periodWeek'],
  ['month', 'periodMonth'],
];

export default function Reports({ onBack, onOpenExpenses }: { onBack: () => void; onOpenExpenses: () => void }) {
  const [period, setPeriod] = useState<Period>('day');
  const [data, setData] = useState<Report | null>(null);
  const [staff, setStaff] = useState<EmployeeStat[]>([]);
  const { t } = useT();

  useEffect(() => {
    api.reports(period).then(setData).catch(loadFailed);
    api.employeeReport(period).then(setStaff).catch(loadFailed);
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

          {/* Kim qancha sotdi — do'kon egasi uchun eng amaliy ko'rsatkich.
              Ustunlar tushumga nisbatan chiziladi, birinchisi eng uzun. */}
          {staff.length > 0 && (
            <>
              <div className="section-title">{t('staffReport')}</div>
              <div className="staff-list">
                {staff.map((s, i) => {
                  const top = Math.max(...staff.map((x) => Math.abs(x.revenue)), 1);
                  const share = Math.max(3, Math.round((Math.abs(s.revenue) / top) * 100));
                  return (
                    <div className="staff-row" key={s.employee_id ?? 'owner'}>
                      <div className="sr-head">
                        <span className="sr-rank">{i + 1}</span>
                        <span className="sr-name">
                          {s.name ?? t('staffOwner')}
                          {s.name && !s.is_active && <span className="badge">{t('staffInactive')}</span>}
                        </span>
                        <span className="sr-rev">{fmt(s.revenue)}</span>
                      </div>
                      <div className="sr-track">
                        <div className="sr-bar" style={{ width: `${share}%` }} />
                      </div>
                      {/* Ko'rsatkichlar alohida bo'laklarda — uzun qatorga
                          sig'masa tartib bilan pastga tushadi, aralashib ketmaydi */}
                      <div className="sr-sub">
                        <span>{s.sales_count} {t('staffChecks')}</span>
                        <span>{t('staffAvg')} {fmtShort(s.avg_check)}</span>
                        <span className={s.profit >= 0 ? 'green' : 'red'}>
                          {t('grossProfit')} {fmtShort(s.profit)}
                        </span>
                        {s.returned > 0 && <span className="red">{t('returned')} −{fmtShort(s.returned)}</span>}
                        {s.debt_revenue > 0 && <span>{t('payDebt')} {fmtShort(s.debt_revenue)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

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
