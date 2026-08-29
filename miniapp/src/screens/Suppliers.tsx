import { useEffect, useState } from 'react';
import { api, fmt, Supplier, SupplierDetail, SupplierTelegram } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader, Summary, EmptyState, DateField } from '../ui';
import { useT } from '../i18n';
import { formatAmount, formatPhoneSoft } from '../format';
import { toast, loadFailed } from '../toast';
import { copyText } from '../clipboard';

// "Men qarzdorman" — postavshiklar (ta'minotchilar) daftari

export default function Suppliers({ onBack }: { onBack: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<SupplierDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [payFor, setPayFor] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const [form, setForm] = useState({ name: '', amount: '', note: '', due: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  const load = () => api.suppliers().then(setSuppliers).catch(loadFailed);
  useEffect(() => {
    load();
  }, []);

  const total = suppliers.reduce((s, x) => s + x.balance, 0);

  async function addDebt() {
    if (busy) return;
    const amount = parseInt(form.amount.replace(/\D/g, ''), 10);
    if (!form.name.trim() || !amount) {
      setError(t('nameAmountRequiredShort'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.createSupplierDebt({
        supplier_name: form.name.trim(),
        amount,
        note: form.note || undefined,
        due_date: form.due || undefined,
      });
      toast.success(t('toastSupplierSaved'), `${form.name.trim()} · ${fmt(amount)}`);
      setForm({ name: '', amount: '', note: '', due: '' });
      setAdding(false);
      load();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  async function pay(debtId: number) {
    if (busy) return;
    const amount = parseInt(payAmount.replace(/\D/g, ''), 10);
    if (!amount) return;
    setBusy(true);
    try {
      await api.paySupplierDebt(debtId, amount);
      toast.success(t('toastPaymentSaved'), fmt(amount));
      setPayFor(null);
      setPayAmount('');
      if (selected) setSelected(await api.supplier(selected.id));
      load();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return (
      <>
        <SubHeader title={selected.name} onBack={() => setSelected(null)} />
        <div className="screen">
        <Summary
          icon="truck"
          label={t('myDebt')}
          value={fmt(selected.balance)}
          color={selected.balance > 0 ? 'var(--red)' : 'var(--green)'}
        />
        <SupplierBot supplierId={selected.id} />

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
                  <label style={{ margin: '0 0 6px' }}>{t('paymentAmount')}</label>
                  <input
                    value={formatAmount(payAmount)}
                    onChange={(e) => setPayAmount(e.target.value)}
                    inputMode="numeric"
                    placeholder={String(d.amount - d.paid_amount)}
                  />
                  <button className="btn-primary" onClick={() => pay(d.id)} disabled={busy}>
                    {t('markPaid')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {selected.debts.length === 0 && <div className="empty">{t('noDebts')}</div>}
        </div>
      </>
    );
  }

  return (
    <>
      <SubHeader title={t('navSuppliers')} onBack={onBack} />
      <div className="screen">
      <Summary
        icon="truck"
        label={t('myTotalDebt')}
        value={fmt(total)}
        color={total > 0 ? 'var(--red)' : undefined}
      />

      {!adding ? (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          <Glyph name="plus" size={18} color="#fff" /> {t('addSupplierDebt')}
        </button>
      ) : (
        <>
          <div className="form-group">
            <div className="form-row">
              <label>{t('supplierName')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Anvar aka (ulgurji)" autoFocus />
            </div>
            <div className="form-row">
              <label>{t('amount')}</label>
              <input value={formatAmount(form.amount)} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" placeholder="2 500 000" />
            </div>
            <div className="form-row">
              <label>{t('whatGoods')} <span className="tag">{t('optional')}</span></label>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ichimliklar, shirinliklar..." />
            </div>
            <div className="form-row">
              <label>{t('payDeadline')} <span className="tag">{t('optional')}</span></label>
              <DateField value={form.due} onChange={(v) => setForm({ ...form, due: v })} ariaLabel={t('dueDate')} />
            </div>
          </div>
          <button className="btn-primary btn-lg" onClick={addDebt} disabled={busy}>
            <Glyph name="check" size={19} color="#fff" /> {t('save')}
          </button>
          <button className="btn-ghost" onClick={() => setAdding(false)} disabled={busy}>{t('cancel')}</button>
          {error && <p className="error center">{error}</p>}
        </>
      )}

      {suppliers.length > 0 && <div className="section-title">{t('navSuppliers')}</div>}
      <div className="list-group">
        {suppliers.map((s) => (
          <div className="list-item" key={s.id} onClick={async () => {
            try {
              setSelected(await api.supplier(s.id));
            } catch (e: any) {
              toast.error(t('error'), e.message);
            }
          }}>
            <div className="lead">
              <AppIcon glyph="truck" size={30} />
              <div>
                <div className="name">{s.name}</div>
                {s.phone && <div className="sub">{formatPhoneSoft(s.phone)}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="amount" style={{ color: s.balance > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(s.balance)}</span>
              <Glyph name="chevron" size={15} color="#c7c7cc" />
            </div>
          </div>
        ))}
      </div>
      {suppliers.length === 0 && !adding && (
        <EmptyState icon="truck" title={t('noSuppliers')} sub={t('noSuppliersSub')} />
      )}
    </div>
    </>
  );
}

/* ───────── Ta'minotchini botga ulash ───────── */

/**
 * Buyurtma ta'minotchiga bot orqali ketadi. Lekin bot faqat o'zini
 * "Start" qilgan odamga yoza oladi — Telegram qoidasi shunday.
 * Shuning uchun bir martalik havola shu yerda turadi: buyurtma
 * yuborishga urinib ko'rmasdan oldin ham ulab qo'yish mumkin.
 */
function SupplierBot({ supplierId }: { supplierId: number }) {
  const [info, setInfo] = useState<SupplierTelegram | null>(null);
  const { t } = useT();

  useEffect(() => {
    api.supplierTelegram(supplierId).then(setInfo).catch(loadFailed);
  }, [supplierId]);

  if (!info) return null;

  if (info.linked) {
    return (
      <div className="trust-card" style={{ borderLeftColor: 'var(--green)' }}>
        <div className="tc-head">
          <span className="trust-dot" style={{ background: 'var(--green)' }} />
          <span className="tc-title" style={{ color: 'var(--green)' }}>{t('supBotLinked')}</span>
        </div>
        <div className="tc-body">{t('supBotLinkedSub')}</div>
      </div>
    );
  }

  // Raqami yo'q yoki bot nomi sozlanmagan — havola tuzib bo'lmaydi
  if (!info.invite) {
    return (
      <div className="trust-warn">
        <Glyph name="warning" size={17} color="var(--yellow)" />
        <div>
          <b>{t('supBotNoPhone')}</b>
          <div className="tw-sub">{t('supBotNoPhoneSub')}</div>
        </div>
      </div>
    );
  }

  const inviteText = `${t('orderTgInviteText')}\n${info.invite}`;

  return (
    <>
      <div className="section-title">{t('supBotTitle')}</div>
      <p className="hint">{t('supBotHint')}</p>
      <div className="order-text">{info.invite}</div>
      {info.phone && (
        <button
          className="btn-primary"
          onClick={() => {
            window.location.href = `sms:${info.phone}?&body=${encodeURIComponent(inviteText)}`;
          }}
        >
          <Glyph name="call" size={18} color="#fff" /> {t('orderTgInviteSms')}
        </button>
      )}
      <div className="order-actions">
        <button
          className="btn-chip"
          onClick={async () => {
            if (await copyText(inviteText)) toast.success(t('copied'));
            else toast.error(t('copyFailed'), t('copyFailedSub'));
          }}
        >
          <Glyph name="copy" size={16} color="var(--accent)" /> {t('orderTgInviteCopy')}
        </button>
      </div>
    </>
  );
}
