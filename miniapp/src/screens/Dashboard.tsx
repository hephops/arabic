import { useEffect, useState } from 'react';
import { api, fmt, fmtShort, Dashboard as DashboardData } from '../api';
import { AppIcon, Glyph } from '../icons';
import { ProductThumb } from '../ui';
import type { SubScreen } from '../App';
import { useT } from '../i18n';
import { can, type PermKey } from '../perms';
import { GoalBar, GoalSheet } from '../goal';
import { DiscountSheet } from '../discount';
import { uzToday, fmtWhen } from '../format';

export default function Dashboard({
  onNavigate,
  isEmployee = false,
  employeeName,
}: {
  onNavigate: (s: SubScreen) => void;
  isEmployee?: boolean;
  employeeName?: string;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [goalSheet, setGoalSheet] = useState(false);
  const [discountSheet, setDiscountSheet] = useState(false);
  const { t } = useT();

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="screen error">{t('error')}: {error}</div>;
  if (!data) return <div className="screen empty">{t('loading')}</div>;

  const maxRev = Math.max(...data.week.map((w) => w.revenue), 1);
  const weekTotal = data.week.reduce((a, w) => a + w.revenue, 0);
  const today = uzToday();
  const WD = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

  return (
    <div className="screen wide">
      {isEmployee && (
        <div className="role-banner">
          <Glyph name="person" size={16} color="var(--accent)" />
          <span>
            {t('employeeMode')}
            {employeeName ? ` · ${employeeName}` : ''}
          </span>
        </div>
      )}

      {/* Keng ekranda: chapda savdo kartasi, o'ngda ko'rsatkichlar — bir qatorda */}
      <div className="home-top">
      {/* Bugungi savdo — asosiy karta */}
      <div
        className="hero"
        onClick={() => can('reports') && onNavigate('reports')}
        style={{ cursor: can('reports') ? 'pointer' : 'default' }}
      >
        <div className="hero-top">
          <div>
            <div className="hero-label">{t('todaySales')}</div>
            <div className="hero-value">{fmt(data.today.revenue)}</div>
          </div>
          <Glyph name="chart" size={22} color="rgba(255,255,255,0.75)" />
        </div>
        <div className="hero-stats">
          {can('reports') && (
            // Xarajat bo'lsa — "sof foyda", bo'lmasa oddiy foyda ko'rsatiladi.
            // Do'konchi bosh sahifada allaqachon haqiqiy raqamni ko'radi.
            <div className="hero-stat">
              <div className="k">{data.today.expenses > 0 ? t('netProfit') : t('profit')}</div>
              <div className="v">{fmtShort(data.today.net_profit ?? data.today.profit)}</div>
            </div>
          )}
          <div className="hero-stat">
            <div className="k">{t('salesCount')}</div>
            <div className="v">{data.today.count}</div>
          </div>
          {can('reports') && data.today.expenses > 0 ? (
            <div className="hero-stat">
              <div className="k">{t('expenses')}</div>
              <div className="v">−{fmtShort(data.today.expenses)}</div>
            </div>
          ) : (
            <div className="hero-stat">
              <div className="k">{t('payDebt')}</div>
              <div className="v">{fmtShort(data.today.debt)}</div>
            </div>
          )}
        </div>
        {weekTotal > 0 ? (
          <div className="spark">
            {data.week.map((w) => (
              <div className={`col ${w.day === today ? 'today' : ''}`} key={w.day}>
                <div className="track">
                  <div
                    className="bar"
                    // foizda — ustun balandligi ekran kengligiga qarab o'zgaradi
                    style={{ height: `${w.revenue > 0 ? Math.max(8, Math.round((w.revenue / maxRev) * 100)) : 5}%` }}
                  />
                </div>
                <div className="d">{WD[new Date(w.day).getDay()]}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="spark-empty">{t('noSalesWeek')}</div>
        )}
      </div>

      {/* O'ng ustun: bugungi maqsad va uchta asosiy ko'rsatkich.
          Ikkalasi bitta idishda — .home-top gridi ikkita bola kutadi. */}
      <div className="home-side">
      <GoalBar
        revenue={data.today.revenue}
        goal={data.daily_goal}
        onSet={can('settings') ? () => setGoalSheet(true) : undefined}
      />

      {/* Uchta asosiy ko'rsatkich */}
      <div className="stat-row">
        <div className="stat-card" onClick={() => onNavigate('reminders')} style={{ cursor: 'pointer' }}>
          <div className="k">
            <Glyph name="arrowDown" size={13} color="var(--green)" /> {t('statOwed')}
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>{fmtShort(data.owed_to_me)}</div>
        </div>
        <div className="stat-card" onClick={() => onNavigate('suppliers')} style={{ cursor: 'pointer' }}>
          <div className="k">
            <Glyph name="arrowUp" size={13} color="var(--red)" /> {t('statOwe')}
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>{fmtShort(data.i_owe)}</div>
        </div>
        <div className="stat-card">
          <div className="k">
            <Glyph name="banknote" size={13} color="var(--accent)" /> {t('netBalance')}
          </div>
          <div className="v" style={{ color: data.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtShort(data.net)}</div>
        </div>
      </div>
      </div>

      </div>

      {/* Oynacha grid ichida turmasin — ochilganda ustunlarni surib yuborardi */}
      {goalSheet && (
        <GoalSheet
          goal={data.daily_goal}
          todayRevenue={data.today.revenue}
          onClose={() => setGoalSheet(false)}
          onSaved={(g) => setData({ ...data, daily_goal: g })}
        />
      )}

      {/* Tez kirish */}
      <div className="tile-row">
        {(
          [
            ['reminders', 'calendar', 'tileReminder', 'reminders'],
            ['suppliers', 'truck', 'tileSupplier', 'suppliers'],
            ['reports', 'chart', 'tileReport', 'reports'],
            ['expenses', 'wallet', 'tileExpenses', 'expenses'],
            ['inventory', 'boxes', 'tileInventory', 'inventory'],
          ] as [SubScreen, string, string, PermKey][]
        )
          .filter(([, , , perm]) => can(perm))
          .map(([id, glyph, key]) => (
          <div key={key} className="tile" onClick={() => onNavigate(id)}>
            <AppIcon glyph={glyph} size={32} />
            <div className="label">{t(key)}</div>
          </div>
        ))}
      </div>

      <div className="home-cols">
        <div>
      {data.overdue.length > 0 && (
        <>
          <div className="section-title">{t('overdueDebts')}</div>
          <div className="list-group">
            {data.overdue.map((d) => (
              <div className="list-item" key={d.id}>
                <div>
                  <div className="name">{d.customer_name}</div>
                  <div className="sub">{t('dueDate')}: {d.due_date}</div>
                </div>
                <div className="amount" style={{ color: 'var(--red)' }}>
                  {fmt(d.amount - d.paid_amount)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.due_today.length > 0 && (
        <>
          <div className="section-title">{t('dueToday')}</div>
          <div className="list-group">
            {data.due_today.map((d) => (
              <div className="list-item" key={d.id}>
                <div className="name">{d.customer_name}</div>
                <div className="amount">{fmt(d.amount - d.paid_amount)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.supplier_due.length > 0 && (
        <>
          <div className="section-title">{t('myDebtsSection')}</div>
          <div className="list-group">
            {data.supplier_due.map((s) => (
              <div className="list-item" key={s.id} onClick={() => onNavigate('suppliers')}>
                <div className="lead">
                  <AppIcon glyph="truck" color={s.status === 'overdue' ? 'red' : 'amber'} size={29} />
                  <div>
                    <div className="name">{s.supplier_name}</div>
                    <div className="sub">
                      {s.note ? `${s.note} · ` : ''}
                      {s.due_date ? `${t('dueDate')}: ${s.due_date}` : ''}
                    </div>
                  </div>
                </div>
                <div className="amount" style={{ color: s.status === 'overdue' ? 'var(--red)' : undefined }}>
                  {fmt(s.amount - s.paid_amount)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.low_stock.length > 0 && (
        <>
          <div className="section-title">{t('lowStock')}</div>
          <div className="list-group">
            {data.low_stock.map((p) => (
              <div className="list-item" key={p.id}>
                <div className="lead">
                  <ProductThumb product={p} size={34} />
                  <div className="name">{p.name}</div>
                </div>
                <div className="amount" style={{ color: p.stock < 0 ? 'var(--red)' : 'var(--yellow)' }}>
                  {p.stock} {p.unit}
                  {p.stock < 0 && <span className="badge overdue">{t('stockNegative')}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Srogi yaqin tovarlar — shunchaki ro'yxat emas, harakatga chorlov.
          Bu tovarlar sotilmasa to'g'ridan-to'g'ri zarar, shuning uchun
          bir bosishda hammasiga chegirma qo'yish taklif qilinadi. */}
      {data.expiring_soon.length > 0 && (
        <>
          <div className="section-title">{t('expiringSoon')}</div>
          <div className="list-group">
            {data.expiring_soon.map((p) => {
              const days = p.days_left ?? 0;
              const off = p.discount_percent ?? 0;
              return (
                <div className="list-item" key={p.id}>
                  <div className="lead">
                  <ProductThumb product={p} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div className="name">
                      {p.name}
                      {off > 0 && <span className="badge sale">−{off}%</span>}
                    </div>
                    <div className="sub">
                      <span style={{ color: days <= 1 ? 'var(--red)' : 'var(--yellow)', fontWeight: 500 }}>
                        {days <= 0 ? t('expiryToday') : `${days} ${t('daysShort')}`}
                      </span>
                      {' · '}{p.expiry_date}
                    </div>
                  </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {off > 0 ? (
                      <>
                        <div className="amount" style={{ color: 'var(--green)' }}>
                          {fmt(p.price_after_discount ?? p.sell_price)}
                        </div>
                        <div className="sub old-price">{fmt(p.sell_price)}</div>
                      </>
                    ) : (
                      <div className="amount">{fmt(p.sell_price)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {can('price_edit') && (
            <button className="btn-ghost" onClick={() => setDiscountSheet(true)}>
              <Glyph name="flash" size={16} color="var(--accent)" /> {t('discountAction')}
            </button>
          )}
        </>
      )}

      {discountSheet && (
        <DiscountSheet
          items={data.expiring_soon}
          onClose={() => setDiscountSheet(false)}
          onSaved={() => api.dashboard().then(setData).catch(() => {})}
        />
      )}

        </div>
        <div>
      {data.recent_sales.length > 0 && (
        <>
          <div className="section-title">{t('recentSales')}</div>
          <div className="list-group">
            {data.recent_sales.map((s) => (
              <div className="list-item" key={s.id} onClick={() => onNavigate('reports')}>
                <div className="lead">
                  <AppIcon
                    glyph={s.payment_type === 'debt' ? 'note' : s.payment_type === 'card' ? 'card' : 'banknote'}
                    color={s.payment_type === 'debt' ? 'yellow' : s.payment_type === 'card' ? 'indigo' : 'green'}
                    size={29}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.items ?? '—'}
                    </div>
                    <div className="sub">
                      {fmtWhen(s.created_at)} ·{' '}
                      {s.payment_type === 'cash' ? t('payCash') : s.payment_type === 'card' ? t('payCard') : t('payDebt')}
                      {s.customer_name ? ` · ${s.customer_name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="amount">{fmt(s.total)}</div>
              </div>
            ))}
          </div>
        </>
      )}

        </div>
      </div>

      {data.overdue.length === 0 &&
        data.due_today.length === 0 &&
        data.recent_sales.length === 0 &&
        data.supplier_due.length === 0 && (
          <div className="empty-state">
            <AppIcon glyph="book" size={54} />
            <div className="t">{t('allClearTitle')}</div>
            <div className="s">{t('allClearSub')}</div>
          </div>
        )}

    </div>
  );
}
