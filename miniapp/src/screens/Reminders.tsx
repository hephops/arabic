import { useEffect, useState } from 'react';
import { api, fmt, Customer, ReminderMode, RemindersInfo } from '../api';
import { AppIcon, Glyph } from '../icons';
import { NavBar } from '../ui';
import { useT } from '../i18n';

// Eslatmalar: rejim sozlamalari va yuborilganlar jurnali

export const MODES: { id: ReminderMode; key: string; icon: string; color: any }[] = [
  { id: 'off', key: 'modeOff', icon: 'close', color: 'gray' },
  { id: 'soft', key: 'modeSoft', icon: 'calendar', color: 'blue' },
  { id: 'medium', key: 'modeMedium', icon: 'warning', color: 'orange' },
  { id: 'call', key: 'modeCall', icon: 'mic', color: 'red' },
];

const KIND_KEY: Record<string, string> = {
  before: 'kindBefore',
  due: 'kindDue',
  overdue: 'kindOverdue',
  call: 'kindCall',
  after_call: 'kindAfterCall',
};

const CHANNEL: Record<string, { icon: string; color: any; label: string }> = {
  sms: { icon: 'note', color: 'green', label: 'SMS' },
  telegram: { icon: 'note', color: 'teal', label: 'Telegram' },
  call: { icon: 'mic', color: 'red', label: 'calls' },
};

export default function Reminders({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'settings' | 'log'>('settings');
  const [info, setInfo] = useState<RemindersInfo | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [message, setMessage] = useState('');
  const { t } = useT();

  async function load() {
    const [r, c] = await Promise.all([api.reminders(), api.customers()]);
    setInfo(r);
    setCustomers(c);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function setDefault(mode: ReminderMode, applyToAll: boolean) {
    await api.setReminderDefault(mode, applyToAll);
    setMessage(applyToAll ? t('appliedToAll') : t('defaultSaved'));
    load();
  }

  async function setCustomerMode(customer: Customer, mode: ReminderMode) {
    await api.updateCustomer(customer.id, { reminder_mode: mode });
    setEditing(null);
    load();
  }

  async function checkNow() {
    const res = await api.runReminders();
    setMessage(res.created > 0 ? `${res.created} ${t('remindersQueued')}` : t('noRemindersNow'));
    load();
  }

  if (!info) return <div className="screen empty">{t('loading')}</div>;

  // Mijoz rejimini tanlash oynasi
  if (editing) {
    return (
      <>
        <NavBar title={editing.name} onBack={() => setEditing(null)} />
        <div className="screen">
          <div className="section-title">{t('reminderMode')}</div>
          <div className="list-group">
            {MODES.map((m) => (
              <div className="list-item" key={m.id} onClick={() => setCustomerMode(editing, m.id)}>
                <div className="lead">
                  <AppIcon glyph={m.icon} color={m.color} size={29} />
                  <div>
                    <div className="name">{t(m.key)}</div>
                    <div className="sub">{t(m.key + 'Desc')}</div>
                  </div>
                </div>
                {editing.reminder_mode === m.id && <Glyph name="check" size={19} color="var(--accent)" />}
              </div>
            ))}
          </div>
          {!editing.phone && (
            <p className="hint" style={{ margin: '4px 14px' }}>
              {t('noPhoneWarning')}
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar title={t('navReminders')} onBack={onBack} />
      <div className="screen">
        <div className="chip-row">
          <button className={`chip ${tab === 'settings' ? 'selected' : ''}`} onClick={() => setTab('settings')}>
            {t('tabSettings')}
          </button>
          <button className={`chip ${tab === 'log' ? 'selected' : ''}`} onClick={() => setTab('log')}>
            {t('tabLog')} {info.stats.total > 0 && `(${info.stats.total})`}
          </button>
        </div>

        {tab === 'settings' ? (
          <>
            <div className="section-title">{t('defaultMode')}</div>
            <div className="list-group">
              {MODES.map((m) => (
                <div className="list-item" key={m.id} onClick={() => setDefault(m.id, false)}>
                  <div className="lead">
                    <AppIcon glyph={m.icon} color={m.color} size={29} />
                    <div>
                      <div className="name">{t(m.key)}</div>
                      <div className="sub">{t(m.key + 'Desc')}</div>
                    </div>
                  </div>
                  {info.default_mode === m.id && <Glyph name="check" size={19} color="var(--accent)" />}
                </div>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => setDefault(info.default_mode, true)}>
              {t('applyToAll')}
            </button>

            <div className="section-title">{t('byCustomer')}</div>
            <div className="list-group">
              {customers.map((c) => {
                const mode = MODES.find((m) => m.id === c.reminder_mode) ?? MODES[1];
                return (
                  <div className="list-item" key={c.id} onClick={() => setEditing(c)}>
                    <div className="lead">
                      <AppIcon glyph={mode.icon} color={mode.color} size={29} />
                      <div>
                        <div className="name">{c.name}</div>
                        <div className="sub">{c.phone ?? t('noPhone')}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="sub" style={{ marginTop: 0 }}>{t(mode.key)}</span>
                      <Glyph name="chevron" size={15} color="#c7c7cc" />
                    </div>
                  </div>
                );
              })}
            </div>
            {customers.length === 0 && <div className="empty">{t('noCustomers')}</div>}

            <button className="btn-primary" onClick={checkNow}>
              <Glyph name="check" size={17} color="#fff" /> {t('checkNow')}
            </button>
            <p className="hint center">
              {t('reminderHint')}
            </p>
          </>
        ) : (
          <>
            <div className="card split-card">
              <div className="split">
                <div className="label">{t('sent')}</div>
                <div className="value green">{info.stats.sent ?? 0}</div>
              </div>
              <div className="split">
                <div className="label">{t('calls')}</div>
                <div className="value">{info.stats.calls ?? 0}</div>
              </div>
              <div className="split">
                <div className="label">{t('failed')}</div>
                <div className="value red">{info.stats.failed ?? 0}</div>
              </div>
            </div>

            <div className="section-title">{t('tabLog')}</div>
            <div className="list-group">
              {info.logs.map((l) => {
                const ch = CHANNEL[l.channel] ?? CHANNEL.sms;
                return (
                  <div className="list-item" key={l.id} style={{ alignItems: 'flex-start' }}>
                    <div className="lead" style={{ alignItems: 'flex-start' }}>
                      <AppIcon glyph={ch.icon} color={l.status === 'failed' ? 'gray' : ch.color} size={29} />
                      <div style={{ minWidth: 0 }}>
                        <div className="name">
                          {l.customer_name ?? 'Mijoz'}
                          <span className={`badge ${l.status === 'failed' ? 'overdue' : 'paid'}`}>
                            {l.status === 'failed' ? t('notSent') : ch.label === 'calls' ? t('calls') : ch.label}
                          </span>
                        </div>
                        <div className="sub">{t(KIND_KEY[l.kind ?? ''] ?? '')} · {l.created_at.slice(0, 16)}</div>
                        {l.payload && (
                          <div className="sub" style={{ marginTop: 4, color: 'var(--text)', opacity: 0.75 }}>
                            {l.payload}
                          </div>
                        )}
                      </div>
                    </div>
                    {l.amount != null && <div className="amount">{fmt(l.amount)}</div>}
                  </div>
                );
              })}
            </div>
            {info.logs.length === 0 && (
              <div className="empty">{t('noReminders')}</div>
            )}
          </>
        )}

        {message && <p className="hint center">{message}</p>}
      </div>
    </>
  );
}
