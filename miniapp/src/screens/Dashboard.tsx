import { useEffect, useState } from 'react';
import { api, fmt, Dashboard as DashboardData } from '../api';
import { AppIcon, Glyph } from '../icons';
import type { SubScreen } from '../App';
import { useT } from '../i18n';

export default function Dashboard({
  onOpenAdd,
  onNavigate,
}: {
  onOpenAdd: () => void;
  onNavigate: (s: SubScreen) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const { t } = useT();

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="screen error">{t('error')}: {error}</div>;
  if (!data) return <div className="screen empty">{t('loading')}</div>;

  return (
    <div className="screen">
      <div className="card split-card">
        <div className="split">
          <div className="label">{t('owedToMe')}</div>
          <div className="value green">{fmt(data.owed_to_me)}</div>
        </div>
        <div className="split" onClick={() => onNavigate('suppliers')} style={{ cursor: 'pointer' }}>
          <div className="label">{t('iOwe')} ›</div>
          <div className="value red">{fmt(data.i_owe)}</div>
        </div>
      </div>

      {/* Tez kirish */}
      <div className="tile-row">
        {(
          [
            ['reminders', 'calendar', 'tileReminder'],
            ['suppliers', 'truck', 'tileSupplier'],
            ['reports', 'chart', 'tileReport'],
            ['inventory', 'boxes', 'tileInventory'],
          ] as [SubScreen, string, string][]
        ).map(([id, glyph, key]) => (
          <div key={key} className="tile" onClick={() => onNavigate(id)}>
            <AppIcon glyph={glyph} size={32} />
            <div className="label">{t(key)}</div>
          </div>
        ))}
      </div>

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
                      {s.created_at.slice(5, 16)} ·{' '}
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
                <div className="name">{p.name}</div>
                <div className="amount" style={{ color: 'var(--yellow)' }}>
                  {p.stock} {p.unit}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.expiring_soon.length > 0 && (
        <>
          <div className="section-title">{t('expiringSoon')}</div>
          <div className="list-group">
            {data.expiring_soon.map((p) => (
              <div className="list-item" key={p.id}>
                <div className="name">{p.name}</div>
                <div className="sub">{p.expiry_date}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.overdue.length === 0 &&
        data.due_today.length === 0 &&
        data.recent_sales.length === 0 &&
        data.supplier_due.length === 0 && <div className="empty">{t('noDueToday')}</div>}

      <button className="fab-voice" onClick={onOpenAdd} title="Qarz qo'shish">
        <Glyph name="mic" size={26} color="#fff" strokeWidth={2} />
      </button>
    </div>
  );
}
