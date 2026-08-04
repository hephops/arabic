import { useEffect, useState } from 'react';
import { api, fmt, Customer, CustomerDetail, ReminderMode } from '../api';
import { AppIcon, Glyph } from '../icons';
import { NavBar } from '../ui';
import { useT, LANG_NAMES, type Lang } from '../i18n';
import { MODES } from './Reminders';
import { formatAmount, formatPhoneSoft, phoneStore, formatPhone, phoneDigits, phoneE164, isPhoneComplete } from '../format';
import { toast } from '../toast';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [query, setQuery] = useState('');
  const { t } = useT();

  // mijoz sahifasidagi rejimlar
  const [mode, setMode] = useState<'view' | 'debt' | 'edit'>('view');
  const [debtForm, setDebtForm] = useState({ amount: '', note: '', due: '' });
  // Mijozning raqami yo'q bo'lsa — qarz yozishda shu yerda so'raladi
  const [debtPhone, setDebtPhone] = useState('');
  const [needPhone, setNeedPhone] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', language: 'uz', reminder_mode: 'soft' });
  const [error, setError] = useState('');

  const load = () => api.customers().then(setCustomers).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function openCustomer(id: number) {
    const c = await api.customer(id);
    setSelected(c);
    setMode('view');
    setEditForm({
      name: c.name,
      phone: c.phone ?? '',
      language: c.language ?? 'uz',
      reminder_mode: c.reminder_mode ?? 'soft',
    });
  }

  async function submitPayment(debtId: number) {
    const amount = parseInt(payAmount.replace(/\D/g, ''), 10);
    if (!amount) return;
    await api.payDebt(debtId, amount);
    toast.success(t('toastPaymentSaved'), fmt(amount));
    setPayFor(null);
    setPayAmount('');
    if (selected) openCustomer(selected.id);
    load();
  }

  async function addDebt() {
    if (!selected) return;
    const amount = parseInt(debtForm.amount.replace(/\D/g, ''), 10);
    if (!amount) {
      setError(t('nameAmountRequired'));
      return;
    }
    setError('');
    try {
      await api.createDebt({
        customer_id: selected.id,
        customer_phone: isPhoneComplete(debtPhone) ? phoneE164(debtPhone) : undefined,
        amount,
        note: debtForm.note || undefined,
        due_date: debtForm.due || undefined,
      });
    } catch (e: any) {
      // Bu mijozning raqami yo'q — shu yerda so'raymiz va qaytadan yuboramiz
      if (e.message === 'customer_phone_required') {
        setNeedPhone(true);
        toast.error(t('phoneRequired'));
      } else {
        toast.error(t('error'), e.message);
      }
      return;
    }
    setNeedPhone(false);
    setDebtPhone('');
    toast.success(t('toastDebtSaved'), `${selected.name} · ${fmt(amount)}`);
    setDebtForm({ amount: '', note: '', due: '' });
    setMode('view');
    openCustomer(selected.id);
    load();
  }

  async function saveEdit() {
    if (!selected) return;
    setError('');
    if (!isPhoneComplete(editForm.phone)) {
      toast.error(t('phoneRequired'));
      return;
    }
    try {
      await api.updateCustomer(selected.id, {
        name: editForm.name.trim(),
        phone: phoneE164(editForm.phone),
        language: editForm.language,
        reminder_mode: editForm.reminder_mode as ReminderMode,
      } as any);
    } catch (e: any) {
      const owner = e.details?.customer?.name;
      toast.error(
        e.message === 'phone_taken' ? t('phoneTaken') : e.message === 'phone_required' ? t('phoneRequired') : t('error'),
        owner
      );
      return;
    }
    toast.success(t('saved'), editForm.name.trim());
    setMode('view');
    openCustomer(selected.id);
    load();
  }

  async function removeCustomer() {
    if (!selected) return;
    if (!confirm(t('deleteConfirm'))) return;
    try {
      const name = selected.name;
      await api.deleteCustomer(selected.id);
      toast.info(t('toastCustomerDeleted'), name);
      setSelected(null);
      load();
    } catch (e: any) {
      toast.error(e.message === 'has_open_debts' ? t('hasOpenDebts') : t('error'));
    }
  }

  /* ───────── Mijoz sahifasi ───────── */
  if (selected) {
    const modeInfo = MODES.find((m) => m.id === selected.reminder_mode) ?? MODES[1];
    return (
      <>
        <NavBar
          title={selected.name}
          onBack={() => setSelected(null)}
          right={
            mode === 'view' ? (
              <button className="nav-btn" onClick={() => setMode('edit')}>
                {t('edit')}
              </button>
            ) : (
              <button className="nav-btn" onClick={() => setMode('view')}>
                {t('cancel')}
              </button>
            )
          }
        />
        <div className="screen">
          {mode === 'edit' ? (
            <>
              <label>{t('name')}</label>
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              <label>{t('phoneForReminders')}</label>
              <input
                value={formatPhoneSoft(editForm.phone)}
                onChange={(e) => setEditForm({ ...editForm, phone: phoneStore(e.target.value) })}
                inputMode="tel"
                placeholder="+998 90 123 45 67"
              />
              <label>{t('customerLang')}</label>
              <select
                value={editForm.language}
                onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
              >
                {Object.entries(LANG_NAMES)
                  .filter(([id]) => id !== 'uz_cyrl')
                  .map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
              </select>
              <label>{t('reminderMode')}</label>
              <select
                value={editForm.reminder_mode}
                onChange={(e) => setEditForm({ ...editForm, reminder_mode: e.target.value })}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {t(m.key)}
                  </option>
                ))}
              </select>
              <button className="btn-primary" onClick={saveEdit}>
                <Glyph name="check" size={18} color="#fff" /> {t('save')}
              </button>
              <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={removeCustomer}>
                {t('deleteCustomer')}
              </button>
              {error && <p className="error">{error}</p>}
            </>
          ) : (
            <>
              <div className="card center">
                <div className="hint">{t('totalDebt')}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: selected.balance > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {fmt(selected.balance)}
                </div>
                <div className="hint">
                  {selected.phone ? formatPhoneSoft(selected.phone) : t('noPhone')} · {t(modeInfo.key)}
                </div>
              </div>

              {mode === 'debt' ? (
                <div className="card">
                  <label>{t('amount')}</label>
                  <input
                    value={formatAmount(debtForm.amount)}
                    onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })}
                    inputMode="numeric"
                    placeholder="120 000"
                    autoFocus
                  />
                  <label>
                    {t('note')} ({t('optional')})
                  </label>
                  <input
                    value={debtForm.note}
                    onChange={(e) => setDebtForm({ ...debtForm, note: e.target.value })}
                    placeholder="un, yog'..."
                  />
                  <label>
                    {t('dueDate')} ({t('optional')})
                  </label>
                  <input type="date" value={debtForm.due} onChange={(e) => setDebtForm({ ...debtForm, due: e.target.value })} />
                  {(needPhone || !selected.phone) && (
                    <>
                      <label>{t('debtorPhone')}</label>
                      <div className="phone-field inline">
                        <span className="cc">+998</span>
                        <input
                          className="phone-input"
                          value={formatPhone(debtPhone).replace('+998', '').trim()}
                          onChange={(e) => setDebtPhone(phoneDigits(e.target.value))}
                          inputMode="tel"
                          placeholder="90 123 45 67"
                        />
                      </div>
                      <p className="field-note">{t('phoneWhy')}</p>
                    </>
                  )}
                  <button
                    className="btn-primary"
                    onClick={addDebt}
                    disabled={(needPhone || !selected.phone) && !isPhoneComplete(debtPhone)}
                  >
                    <Glyph name="check" size={18} color="#fff" /> {t('save')}
                  </button>
                  <button className="btn-ghost" onClick={() => setMode('view')}>
                    {t('cancel')}
                  </button>
                  {error && <p className="error">{error}</p>}
                </div>
              ) : (
                <button className="btn-primary" onClick={() => setMode('debt')}>
                  <Glyph name="plus" size={18} color="#fff" /> {t('addDebtHere')}
                </button>
              )}

              <div className="section-title">{t('debtHistory')}</div>
              <div className="list-group">
                {selected.debts.map((d) => (
                  <div key={d.id}>
                    <div className="list-item" onClick={() => setPayFor(payFor === d.id ? null : d.id)}>
                      <div>
                        <div className="name">
                          {fmt(d.amount)}
                          <span className={`badge ${d.status}`}>
                            {d.status === 'paid' ? t('statusPaid') : d.status === 'overdue' ? t('statusOverdue') : t('statusActive')}
                          </span>
                        </div>
                        <div className="sub">
                          {d.note ?? ''} {d.due_date ? `· ${t('dueDate')}: ${d.due_date}` : ''}
                          {d.paid_amount > 0 && d.status !== 'paid' ? ` · ${t('paidLabel')}: ${fmt(d.paid_amount)}` : ''}
                        </div>
                      </div>
                    </div>
                    {payFor === d.id && d.status !== 'paid' && (
                      <div className="card">
                        <label>{t('paymentAmount')}</label>
                        <input
                          value={formatAmount(payAmount)}
                          onChange={(e) => setPayAmount(e.target.value)}
                          inputMode="numeric"
                          placeholder={String(d.amount - d.paid_amount)}
                        />
                        <button className="btn-primary" onClick={() => submitPayment(d.id)}>
                          {t('acceptPayment')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {selected.debts.length === 0 && <div className="empty">{t('noDebts')}</div>}
            </>
          )}
        </div>
      </>
    );
  }

  /* ───────── Mijozlar ro'yxati ───────── */
  const filtered = customers.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="screen">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} />

      {!adding ? (
        <button className="btn-primary" style={{ marginBottom: 4 }} onClick={() => setAdding(true)}>
          <Glyph name="plus" size={18} color="#fff" /> {t('addCustomer')}
        </button>
      ) : (
        <div className="card">
          <label>{t('name')}</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Karim aka" autoFocus />
          <label>{t('phoneForReminders')}</label>
          <div className="phone-field inline">
            <span className="cc">+998</span>
            <input
              className="phone-input"
              value={formatPhone(newPhone).replace('+998', '').trim()}
              onChange={(e) => setNewPhone(phoneDigits(e.target.value))}
              inputMode="tel"
              placeholder="90 123 45 67"
            />
          </div>
          <p className="field-note">{t('phoneWhy')}</p>
          <button
            className="btn-primary"
            disabled={!newName.trim() || !isPhoneComplete(newPhone)}
            onClick={async () => {
              if (!newName.trim() || !isPhoneComplete(newPhone)) return;
              try {
                await api.createCustomer({ name: newName.trim(), phone: phoneE164(newPhone) });
              } catch (err: any) {
                toast.error(
                  err.message === 'phone_taken' ? t('phoneTaken') : t('error'),
                  err.details?.customer?.name
                );
                return;
              }
              toast.success(t('toastCustomerAdded'), newName.trim());
              setNewName('');
              setNewPhone('');
              setAdding(false);
              load();
            }}
          >
            <Glyph name="check" size={18} color="#fff" /> {t('save')}
          </button>
          <button className="btn-ghost" onClick={() => setAdding(false)}>
            {t('cancel')}
          </button>
        </div>
      )}

      <div className="section-title">{t('tabCustomers')}</div>
      <div className="list-group">
        {filtered.map((c) => {
          const m = MODES.find((x) => x.id === c.reminder_mode) ?? MODES[1];
          return (
            <div className="list-item" key={c.id} onClick={() => openCustomer(c.id)}>
              <div className="lead">
                <AppIcon glyph={m.icon} color={m.color} size={29} />
                <div>
                  <div className="name">{c.name}</div>
                  {/* Raqami yo'q mijozga eslatma ketmaydi — qizil qilib ko'rsatamiz */}
                  <div className="sub" style={c.phone ? undefined : { color: 'var(--red)' }}>
                    {c.phone ? formatPhoneSoft(c.phone) : t('noPhone')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="amount" style={{ color: c.balance > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {fmt(c.balance)}
                </span>
                <Glyph name="chevron" size={15} color="#c7c7cc" />
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="empty">{t('noCustomers')}</div>}
    </div>
  );
}
