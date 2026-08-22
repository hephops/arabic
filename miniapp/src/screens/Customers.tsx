import { useEffect, useState } from 'react';
import { api, fmt, Customer, CustomerDetail, CustomerTelegram, ReminderMode } from '../api';
import { AppIcon, Glyph } from '../icons';
import { NavBar, DateField } from '../ui';
import { useT, LANG_NAMES, type Lang } from '../i18n';
import { MODES } from './Reminders';
import { formatAmount, formatPhoneSoft, phoneStore, formatPhone, phoneDigits, phoneE164, isPhoneComplete } from '../format';
import { toast, loadFailed } from '../toast';
import { TrustCard, TrustDot, TrustWarning } from '../trust';
import { useEscape } from '../useEscape';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [tgSheet, setTgSheet] = useState(false);
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
  const [editForm, setEditForm] = useState({
    name: '', phone: '', language: 'uz', reminder_mode: 'soft',
    credit_limit: '', is_blocked: false,
  });
  const [error, setError] = useState('');

  const load = () => api.customers().then(setCustomers).catch(loadFailed);
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
      credit_limit: c.credit_limit ? String(c.credit_limit) : '',
      is_blocked: !!c.is_blocked,
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
      } else if (e.message === 'customer_blocked') {
        toast.error(t('blockedCustomer'));
      } else if (e.message === 'credit_limit_exceeded') {
        const d = e.details?.details ?? {};
        toast.error(
          t('limitExceeded'),
          t('limitDetail').replace('{limit}', fmt(d.limit ?? 0)).replace('{current}', fmt(d.current ?? 0))
        );
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
        credit_limit: Number(editForm.credit_limit.replace(/\D/g, '')) || 0,
        is_blocked: editForm.is_blocked ? 1 : 0,
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
              <label>{t('creditLimit')}</label>
              <input
                value={formatAmount(editForm.credit_limit)}
                onChange={(e) => setEditForm({ ...editForm, credit_limit: e.target.value })}
                inputMode="numeric"
                placeholder="0"
              />
              <p className="field-note">{t('creditLimitHint')}</p>

              <div className="switch-row">
                <div>
                  <div className="sw-title">{t('blockCustomer')}</div>
                  <div className="sw-sub">{t('blockCustomerHint')}</div>
                </div>
                <button
                  className={`switch ${editForm.is_blocked ? 'on' : ''}`}
                  onClick={() => setEditForm({ ...editForm, is_blocked: !editForm.is_blocked })}
                  aria-label={t('blockCustomer')}
                >
                  <span />
                </button>
              </div>

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

              {/* To'lov odati — qarz berishdan oldin bir qarashda ko'rinsin */}
              <TrustCard trust={selected.trust} />

              {/* Telegram: ulangan mijozga chek va xarid tarixi o'zi boradi */}
              <button
                className={`tg-link-btn ${selected.telegram_user_id ? 'linked' : ''}`}
                onClick={() => setTgSheet(true)}
              >
                <Glyph name="send" size={17} color={selected.telegram_user_id ? 'var(--green)' : 'var(--accent)'} />
                {selected.telegram_user_id ? t('tgLinked') : t('tgLinkAction')}
              </button>

              {tgSheet && (
                <CustomerTelegramSheet
                  customer={selected}
                  onClose={() => setTgSheet(false)}
                  onChanged={() => openCustomer(selected.id)}
                />
              )}

              {mode === 'debt' ? (
                <div className="card">
                  <TrustWarning trust={selected.trust} />
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
                  <DateField value={debtForm.due} onChange={(v) => setDebtForm({ ...debtForm, due: v })} ariaLabel={t('dueDate')} />
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
                <div style={{ minWidth: 0 }}>
                  {/* Nuqta — to'lov odati. Do'konchi ro'yxatda ham
                      "kimga ehtiyot bo'lish kerak" ni ko'rib turadi */}
                  <div className="name">
                    <TrustDot trust={c.trust} />
                    {c.name}
                  </div>
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

/* ───────── Mijozni Telegram'ga ulash ───────── */

// Do'konchi mijozga havola beradi, mijoz bosadi — shundan keyin chek
// va xarid tarixi mijozning o'z Telegram'iga boradi.
//
// Nega havola (SMS/qo'ng'iroq emas): mijozning Telegram raqamini
// do'konchi bilmaydi va bilishi ham shart emas. Havolani bosgan odam
// o'zini o'zi bog'laydi — bu ham osonroq, ham to'g'riroq.
function CustomerTelegramSheet({
  customer,
  onClose,
  onChanged,
}: {
  customer: CustomerDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useT();
  const [info, setInfo] = useState<CustomerTelegram | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.customerTelegram(customer.id).then(setInfo).catch(loadFailed);
  }, [customer.id]);

  async function copyLink() {
    if (!info?.link) return;
    try {
      await navigator.clipboard.writeText(info.link);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'), t('copyFailedSub'));
    }
  }

  async function unlink() {
    if (busy) return;
    setBusy(true);
    try {
      await api.unlinkCustomerTelegram(customer.id);
      toast.info(t('tgUnlinked'), customer.name);
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  const shareText = info?.link ? `${t('tgInviteText')}\n${info.link}` : '';

  // Kompyuterda Escape bilan ham yopilsin
  useEscape(onClose);

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{t('tgSheetTitle')}</div>
        <div className="sheet-sub">{t('tgSheetHint')}</div>

        {info?.linked && (
          <div className="trust-card" style={{ borderLeftColor: 'var(--green)' }}>
            <div className="tc-head">
              <span className="trust-dot" style={{ background: 'var(--green)' }} />
              <span className="tc-title" style={{ color: 'var(--green)' }}>{t('tgLinked')}</span>
            </div>
            <div className="tc-body">{t('tgLinkedSub')}</div>
          </div>
        )}

        {info && !info.link && (
          <div className="trust-warn">
            <Glyph name="warning" size={17} color="var(--yellow)" />
            <div>
              <b>{t('tgNoBotName')}</b>
              <div className="tw-sub">{t('tgNoBotNameSub')}</div>
            </div>
          </div>
        )}

        {info?.link && (
          <>
            <div className="order-text">{info.link}</div>
            <div className="order-actions">
              <button className="btn-chip" onClick={copyLink}>
                <Glyph name="copy" size={16} color="var(--accent)" /> {t('copy')}
              </button>
              <button
                className="btn-chip"
                onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(info.link!)}&text=${encodeURIComponent(t('tgInviteText'))}`, '_blank')}
              >
                <Glyph name="send" size={16} color="var(--accent)" /> Telegram
              </button>
              {customer.phone && (
                <button
                  className="btn-chip"
                  onClick={() => { window.location.href = `sms:${customer.phone}?&body=${encodeURIComponent(shareText)}`; }}
                >
                  <Glyph name="call" size={16} color="var(--accent)" /> SMS
                </button>
              )}
            </div>
          </>
        )}

        {info?.linked && (
          <button className="btn-ghost danger" onClick={unlink} disabled={busy}>
            {t('tgUnlink')}
          </button>
        )}
      </div>
    </div>
  );
}
