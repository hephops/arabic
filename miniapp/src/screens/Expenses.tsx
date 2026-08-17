import { useEffect, useMemo, useState } from 'react';
import { api, fmt, getToken, Expense, ExpensePeriod, ExpensesInfo } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader, EmptyState, Segmented, Summary, DateField } from '../ui';
import { useT, group } from '../i18n';
import { formatAmount, amountValue, uzToday } from '../format';
import { EXPENSE_CATS as CATS, expenseCatLabel, expenseCatIcon } from '../expenseCats';
import { toast } from '../toast';
import { haptic } from '../telegram';

// Do'kon xarajatlari: ijara, svet, ish haqi, transport...
// Bularsiz "foyda" faqat tovar ustamasi bo'lib qoladi — shuning uchun
// bu ekrandagi raqamlar Hisobotdagi "sof foyda"ga to'g'ridan-to'g'ri tushadi.

const PERIODS: [ExpensePeriod, string][] = [
  ['day', 'periodDay'],
  ['week', 'periodWeek'],
  ['month', 'periodMonth'],
  ['all', 'expensePeriodAll'],
];

const today = () => uzToday();
const yesterday = () => uzToday(new Date(Date.now() - 86400000));

interface Draft {
  id: number | null;
  category: string;
  /** ro'yxatda yo'q kategoriya — do'konchi o'zi yozgan */
  custom: string;
  amount: string;
  note: string;
  spent_at: string;
  is_recurring: boolean;
}

const emptyDraft = (): Draft => ({
  id: null,
  category: '',
  custom: '',
  amount: '',
  note: '',
  spent_at: today(),
  is_recurring: false,
});

export default function Expenses({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState<ExpensePeriod>('month');
  const [filter, setFilter] = useState<string>('');
  const [data, setData] = useState<ExpensesInfo | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  async function load() {
    try {
      setData(await api.expenses(period, filter || undefined));
    } catch {
      /* tarmoq — keyingi urinishda yuklanadi */
    }
  }

  useEffect(() => {
    load();
  }, [period, filter]);

  const catLabel = (id: string) => expenseCatLabel(id, t);
  const catIcon = expenseCatIcon;

  // Sanalar bo'yicha guruhlash — kunlik xarajat ko'rinib tursin
  const byDate = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of data?.items ?? []) {
      const list = map.get(e.spent_at) ?? [];
      list.push(e);
      map.set(e.spent_at, list);
    }
    return [...map.entries()];
  }, [data]);

  async function save() {
    if (!draft) return;
    const amount = amountValue(draft.amount);
    const category = draft.category === '__custom' ? draft.custom.trim() : draft.category;
    if (amount <= 0) return toast.error(t('expenseNoAmount'));
    if (!category) return toast.error(t('expenseNoCategory'));
    setBusy(true);
    try {
      const body = {
        category,
        amount,
        note: draft.note.trim() || undefined,
        spent_at: draft.spent_at,
        is_recurring: draft.is_recurring,
      };
      if (draft.id) await api.updateExpense(draft.id, body);
      else await api.createExpense(body);
      haptic.success();
      toast.success(t('expenseSaved'));
      setDraft(null);
      await load();
    } catch (e: any) {
      if (e.message === 'future_date') toast.error(t('expenseFutureDate'));
      else if (e.message === 'amount_required') toast.error(t('expenseNoAmount'));
      else if (e.message === 'category_required') toast.error(t('expenseNoCategory'));
      else toast.error(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await api.deleteExpense(id);
      toast.success(t('expenseDeleted'));
      setDraft(null);
      await load();
    } catch (e: any) {
      toast.error(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  /** Har oygi xarajatni bir bosishda shu oyga yozish */
  async function addSuggestion(category: string, amount: number) {
    setBusy(true);
    try {
      await api.createExpense({ category, amount, spent_at: today(), is_recurring: true });
      haptic.success();
      toast.success(t('expenseSaved'));
      await load();
    } catch (e: any) {
      toast.error(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(e: Expense) {
    const known = CATS.some((c) => c.id === e.category);
    setDraft({
      id: e.id,
      category: known ? e.category : '__custom',
      custom: known ? '' : e.category,
      amount: String(e.amount),
      note: e.note ?? '',
      spent_at: e.spent_at,
      is_recurring: !!e.is_recurring,
    });
  }

  const maxCat = data?.by_category[0]?.total ?? 0;

  return (
    <>
      <SubHeader title={t('navExpenses')} onBack={onBack} />
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
            <Summary
              icon="wallet"
              label={t('expensesTotal')}
              value={fmt(data.total)}
              color="var(--red)"
              right={
                <div className="sub" style={{ textAlign: 'right', marginTop: 0 }}>
                  {t('expenseCount').replace('{n}', String(data.count))}
                </div>
              }
            />

            {/* Har oy takrorlanadigan, lekin bu oyda hali yozilmagan xarajatlar */}
            {data.suggestions.length > 0 && (
              <>
                <div className="section-title">{t('expenseSuggestTitle')}</div>
                <div className="list-group">
                  {data.suggestions.map((s) => (
                    <div className="list-item" key={s.category}>
                      <div className="lead">
                        <AppIcon glyph={catIcon(s.category).glyph} color={catIcon(s.category).color} size={29} />
                        <div>
                          <div className="name">{catLabel(s.category)}</div>
                          <div className="sub">{fmt(s.amount)} · {t('expenseSuggestSub')}</div>
                        </div>
                      </div>
                      <button className="chip on" disabled={busy} onClick={() => addSuggestion(s.category, s.amount)}>
                        {t('expenseSuggestAdd')}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Kategoriya bo'yicha ulush — qaysi xarajat og'irligi ko'rinsin */}
            {data.by_category.length > 0 && (
              <>
                <div className="section-title">{t('expenseByCategory')}</div>
                <div className="card cat-bars">
                  {data.by_category.map((c) => (
                    <button
                      key={c.category}
                      className={`cat-bar ${filter === c.category ? 'on' : ''}`}
                      onClick={() => setFilter(filter === c.category ? '' : c.category)}
                    >
                      <div className="cb-head">
                        <span className="cb-name">
                          <AppIcon glyph={catIcon(c.category).glyph} color={catIcon(c.category).color} size={20} />
                          {catLabel(c.category)}
                        </span>
                        <span className="cb-val">
                          {fmt(c.total)}
                          <span className="cb-pct">
                            {data.total > 0 ? Math.round((c.total / data.total) * 100) : 0}%
                          </span>
                        </span>
                      </div>
                      <div className="cb-track">
                        <div
                          className="cb-fill"
                          style={{ width: `${maxCat > 0 ? Math.max(3, (c.total / maxCat) * 100) : 0}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {data.count === 0 ? (
              <EmptyState icon="wallet" title={t('expenseEmpty')} sub={t('expenseEmptySub')} />
            ) : (
              byDate.map(([date, items]) => (
                <div key={date}>
                  <div className="section-title">
                    {date === today() ? t('periodDay') : date === yesterday() ? t('dateYesterday') : date}
                    <span style={{ float: 'right', textTransform: 'none', letterSpacing: 0 }}>
                      {fmt(items.reduce((s, i) => s + i.amount, 0))}
                    </span>
                  </div>
                  <div className="list-group">
                    {items.map((e) => (
                      <div className="list-item" key={e.id} onClick={() => openEdit(e)} style={{ cursor: 'pointer' }}>
                        <div className="lead">
                          <AppIcon glyph={catIcon(e.category).glyph} color={catIcon(e.category).color} size={29} />
                          <div style={{ minWidth: 0 }}>
                            <div className="name">
                              {catLabel(e.category)}
                              {!!e.is_recurring && (
                                <span className="tag-mini">
                                  <Glyph name="clock" size={11} color="var(--muted)" />
                                </span>
                              )}
                            </div>
                            {e.note && <div className="sub">{e.note}</div>}
                          </div>
                        </div>
                        <div className="amount" style={{ color: 'var(--red)' }}>−{group(e.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            <p className="field-note" style={{ marginTop: 10 }}>{t('expenseWhy')}</p>

            {data.count > 0 && (
              <button
                className="btn-ghost"
                onClick={async () => {
                  const res = await fetch(api.expensesExportUrl(period), {
                    headers: { Authorization: `Bearer ${getToken()}` },
                  });
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `xarajatlar-${period}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Glyph name="arrowDown" size={16} color="var(--accent)" /> {t('expenseExport')}
              </button>
            )}
          </>
        )}

        <button className="btn-primary btn-lg" onClick={() => setDraft(emptyDraft())}>
          <Glyph name="plus" size={18} color="#fff" /> {t('expenseAdd')}
        </button>
      </div>

      {/* Qo'shish / tahrirlash — pastdan chiqadigan oyna */}
      {draft && (
        <div className="sheet-wrap" onClick={() => setDraft(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-title">{draft.id ? t('expenseEdit') : t('expenseAdd')}</div>

            <div className="amount-stage">
              <input
                className="amount-input"
                autoFocus
                inputMode="numeric"
                value={formatAmount(draft.amount)}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                placeholder="0"
              />
              <div className="amount-cur">{t('currency')}</div>
            </div>

            <div className="chip-row wrap">
              {CATS.map((c) => (
                <button
                  key={c.id}
                  className={`chip ${draft.category === c.id ? 'on' : ''}`}
                  onClick={() => setDraft({ ...draft, category: c.id })}
                >
                  {t(c.key)}
                </button>
              ))}
              <button
                className={`chip ${draft.category === '__custom' ? 'on' : ''}`}
                onClick={() => setDraft({ ...draft, category: '__custom' })}
              >
                {t('expenseCustom')}
              </button>
            </div>

            {draft.category === '__custom' && (
              <input
                value={draft.custom}
                onChange={(e) => setDraft({ ...draft, custom: e.target.value })}
                placeholder={t('expenseCustomPlaceholder')}
              />
            )}

            <input
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder={t('expenseNotePlaceholder')}
            />

            <label className="sheet-label">{t('expenseDate')}</label>
            <DateField
              value={draft.spent_at}
              max={today()}
              onChange={(v) => setDraft({ ...draft, spent_at: v })}
              ariaLabel={t('expenseDate')}
            />

            <div className="switch-row" style={{ marginTop: 10 }}>
              <div>
                <div className="sw-title">{t('expenseRecurring')}</div>
                <div className="sw-sub">{t('expenseRecurringHint')}</div>
              </div>
              <button
                className={`switch ${draft.is_recurring ? 'on' : ''}`}
                onClick={() => setDraft({ ...draft, is_recurring: !draft.is_recurring })}
                aria-label={t('expenseRecurring')}
              >
                <span />
              </button>
            </div>

            <button className="btn-primary btn-lg" disabled={busy} onClick={save}>
              <Glyph name="check" size={18} color="#fff" /> {t('save')}
            </button>
            {draft.id && (
              <button className="btn-ghost sheet-danger" disabled={busy} onClick={() => remove(draft.id!)}>
                <Glyph name="trash" size={16} color="var(--red)" /> {t('expenseDelete')}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
