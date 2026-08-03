import { useEffect, useState } from 'react';
import { api, fmt, Customer, ReminderMode, RemindersInfo } from '../api';
import { AppIcon, Glyph } from '../icons';
import { NavBar } from '../ui';

// Eslatmalar: rejim sozlamalari va yuborilganlar jurnali

export const MODES: { id: ReminderMode; title: string; desc: string; icon: string; color: any }[] = [
  { id: 'off', title: "O'chirilgan", desc: 'Hech qanday eslatma yuborilmaydi', icon: 'close', color: 'gray' },
  { id: 'soft', title: 'Yumshoq', desc: 'Muddatdan 1 kun oldin bitta xabar', icon: 'calendar', color: 'blue' },
  { id: 'medium', title: "O'rta", desc: "Muddat kuni va kechikkanda har 3 kunda", icon: 'warning', color: 'orange' },
  { id: 'call', title: "AI qo'ng'iroq", desc: "O'rta + kechikkanda qo'ng'iroq va rekvizitli SMS", icon: 'mic', color: 'red' },
];

const KIND_LABEL: Record<string, string> = {
  before: 'Muddatdan oldin',
  due: 'Muddat kuni',
  overdue: 'Kechikkan',
  call: "AI qo'ng'iroq",
  after_call: "Qo'ng'iroqdan keyin (rekvizit)",
};

const CHANNEL: Record<string, { icon: string; color: any; label: string }> = {
  sms: { icon: 'note', color: 'green', label: 'SMS' },
  telegram: { icon: 'note', color: 'teal', label: 'Telegram' },
  call: { icon: 'mic', color: 'red', label: "Qo'ng'iroq" },
};

export function modeTitle(mode: ReminderMode): string {
  return MODES.find((m) => m.id === mode)?.title ?? mode;
}

export default function Reminders({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'settings' | 'log'>('settings');
  const [info, setInfo] = useState<RemindersInfo | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [message, setMessage] = useState('');

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
    setMessage(applyToAll ? 'Barcha mijozlarga qo‘llandi' : 'Standart rejim saqlandi');
    load();
  }

  async function setCustomerMode(customer: Customer, mode: ReminderMode) {
    await api.updateCustomer(customer.id, { reminder_mode: mode });
    setEditing(null);
    load();
  }

  async function checkNow() {
    const res = await api.runReminders();
    setMessage(
      res.created > 0 ? `${res.created} ta yangi eslatma navbatga qo'yildi` : 'Hozircha yuboriladigan eslatma yo‘q'
    );
    load();
  }

  if (!info) return <div className="screen empty">Yuklanmoqda...</div>;

  // Mijoz rejimini tanlash oynasi
  if (editing) {
    return (
      <>
        <NavBar title={editing.name} onBack={() => setEditing(null)} />
        <div className="screen">
          <div className="section-title">Eslatma rejimi</div>
          <div className="list-group">
            {MODES.map((m) => (
              <div className="list-item" key={m.id} onClick={() => setCustomerMode(editing, m.id)}>
                <div className="lead">
                  <AppIcon glyph={m.icon} color={m.color} size={29} />
                  <div>
                    <div className="name">{m.title}</div>
                    <div className="sub">{m.desc}</div>
                  </div>
                </div>
                {editing.reminder_mode === m.id && <Glyph name="check" size={19} color="var(--accent)" />}
              </div>
            ))}
          </div>
          {!editing.phone && (
            <p className="hint" style={{ margin: '4px 14px' }}>
              Diqqat: bu mijozning telefon raqami kiritilmagan — eslatma yuborilmaydi.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar title="Eslatmalar" onBack={onBack} />
      <div className="screen">
        <div className="chip-row">
          <button className={`chip ${tab === 'settings' ? 'selected' : ''}`} onClick={() => setTab('settings')}>
            Sozlamalar
          </button>
          <button className={`chip ${tab === 'log' ? 'selected' : ''}`} onClick={() => setTab('log')}>
            Jurnal {info.stats.total > 0 && `(${info.stats.total})`}
          </button>
        </div>

        {tab === 'settings' ? (
          <>
            <div className="section-title">Standart rejim (yangi mijozlarga)</div>
            <div className="list-group">
              {MODES.map((m) => (
                <div className="list-item" key={m.id} onClick={() => setDefault(m.id, false)}>
                  <div className="lead">
                    <AppIcon glyph={m.icon} color={m.color} size={29} />
                    <div>
                      <div className="name">{m.title}</div>
                      <div className="sub">{m.desc}</div>
                    </div>
                  </div>
                  {info.default_mode === m.id && <Glyph name="check" size={19} color="var(--accent)" />}
                </div>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => setDefault(info.default_mode, true)}>
              Shu rejimni barcha mijozlarga qo'llash
            </button>

            <div className="section-title">Mijozlar bo'yicha</div>
            <div className="list-group">
              {customers.map((c) => {
                const mode = MODES.find((m) => m.id === c.reminder_mode) ?? MODES[1];
                return (
                  <div className="list-item" key={c.id} onClick={() => setEditing(c)}>
                    <div className="lead">
                      <AppIcon glyph={mode.icon} color={mode.color} size={29} />
                      <div>
                        <div className="name">{c.name}</div>
                        <div className="sub">{c.phone ?? 'telefon kiritilmagan'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="sub" style={{ marginTop: 0 }}>{mode.title}</span>
                      <Glyph name="chevron" size={15} color="#c7c7cc" />
                    </div>
                  </div>
                );
              })}
            </div>
            {customers.length === 0 && <div className="empty">Mijozlar yo'q</div>}

            <button className="btn-primary" onClick={checkNow}>
              <Glyph name="check" size={17} color="#fff" /> Hozir tekshirish
            </button>
            <p className="hint center">
              Tizim har soatda avtomatik tekshiradi. SMS provayderi ulanmaguncha xabarlar faqat jurnalga yoziladi.
            </p>
          </>
        ) : (
          <>
            <div className="card split-card">
              <div className="split">
                <div className="label">Yuborilgan</div>
                <div className="value green">{info.stats.sent ?? 0}</div>
              </div>
              <div className="split">
                <div className="label">Qo'ng'iroq</div>
                <div className="value">{info.stats.calls ?? 0}</div>
              </div>
              <div className="split">
                <div className="label">Xato</div>
                <div className="value red">{info.stats.failed ?? 0}</div>
              </div>
            </div>

            <div className="section-title">Jurnal</div>
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
                            {l.status === 'failed' ? 'yuborilmadi' : ch.label}
                          </span>
                        </div>
                        <div className="sub">{KIND_LABEL[l.kind ?? ''] ?? l.kind} · {l.created_at.slice(0, 16)}</div>
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
              <div className="empty">Hozircha eslatma yuborilmagan</div>
            )}
          </>
        )}

        {message && <p className="hint center">{message}</p>}
      </div>
    </>
  );
}
