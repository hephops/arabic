import { useState } from 'react';
import { api, fmt, AiDraftItem } from '../api';
import { Glyph } from '../icons';
import { useT } from '../i18n';
import { toast } from '../toast';
import { haptic } from '../telegram';

// Rasmdan o'qilgan kirim taklifi.
//
// Bu ekrandagi eng nozik joy: shu yerda do'konchining ombori
// o'zgaradi. Shuning uchun har qator TAHRIRLANADI — yordamchi
// qo'lyozmani noto'g'ri o'qigan bo'lsa, do'konchi tugmani bosishdan
// oldin tuzatib qo'yadi.
//
// "Tasdiqlash" bosilmaguncha omborga hech narsa tushmaydi.

export default function AiDraft({
  draftId,
  items,
  onDone,
}: {
  draftId: number;
  items: AiDraftItem[];
  onDone: (text: string) => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<AiDraftItem[]>(items);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<'done' | 'cancelled' | null>(null);

  const set = (i: number, patch: Partial<AiDraftItem>) =>
    setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const total = rows.reduce((s, r) => s + (Number(r.miqdor) || 0) * (Number(r.kirim_narxi) || 0), 0);
  // Narxi yoki birligi to'ldirilmagan qatorlar — do'konchi ko'rib tursin
  const missing = rows.filter((r) => !r.birlik || !r.kirim_narxi).length;

  async function confirm() {
    setBusy(true);
    haptic.select();
    try {
      const r = await api.aiIntakeConfirm(draftId, rows);
      setClosed('done');
      toast.success(t('draftDone'), `${r.done.length} ${t('draftItems')}`);
      onDone(
        `${t('draftDone')}: ${r.done.map((d) => d.nom).join(', ')}` +
          (r.failed.length ? `\n${t('draftFailed')}: ${r.failed.map((f) => `${f.nom} (${f.sabab})`).join(', ')}` : '')
      );
    } catch (e: any) {
      toast.error(t('error'), e.details?.message ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    await api.aiIntakeCancel(draftId).catch(() => {});
    setClosed('cancelled');
  }

  if (closed) {
    return (
      <div className={`ai-draft closed ${closed}`}>
        <Glyph name={closed === 'done' ? 'check' : 'close'} size={15} color="var(--muted)" />
        <span>{closed === 'done' ? t('draftDone') : t('draftCancelled')}</span>
      </div>
    );
  }

  return (
    <div className="ai-draft">
      <div className="ai-draft-head">
        <Glyph name="box" size={16} color="var(--accent)" />
        <b>{t('draftTitle')}</b>
        <span className="ai-draft-count">{rows.length}</span>
      </div>
      <p className="hint" style={{ margin: '2px 0 10px' }}>{t('draftHint')}</p>

      {rows.map((r, i) => (
        <div className="ai-draft-row" key={i}>
          <div className="ai-draft-top">
            <input
              className="nom"
              value={r.nom}
              onChange={(e) => set(i, { nom: e.target.value })}
              placeholder={t('name')}
            />
            {r.omborda_bor ? (
              <span className="badge paid">{t('draftKnown')}</span>
            ) : (
              <span className="badge">{t('draftNew')}</span>
            )}
            <button className="ai-draft-x" onClick={() => setRows((x) => x.filter((_, k) => k !== i))} aria-label={t('delete')}>
              <Glyph name="close" size={14} color="var(--muted)" />
            </button>
          </div>
          <div className="ai-draft-fields">
            <label>
              <span>{t('draftQty')}</span>
              <input
                inputMode="decimal"
                value={String(r.miqdor ?? '')}
                onChange={(e) => set(i, { miqdor: Number(e.target.value.replace(',', '.')) || 0 })}
              />
            </label>
            <label>
              <span>{t('draftUnit')}</span>
              <select value={r.birlik || ''} onChange={(e) => set(i, { birlik: e.target.value })}>
                <option value="">—</option>
                {['dona', 'kg', 'litr', 'quti', 'qop', 'metr'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('draftCost')}</span>
              <input
                inputMode="numeric"
                value={String(r.kirim_narxi || '')}
                onChange={(e) => set(i, { kirim_narxi: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </label>
            <label>
              <span>{t('draftSell')}</span>
              <input
                inputMode="numeric"
                value={String(r.sotuv_narxi || '')}
                onChange={(e) => set(i, { sotuv_narxi: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </label>
          </div>
        </div>
      ))}

      <div className="ai-draft-total">
        <span>{t('draftTotal')}</span>
        <b>{fmt(total)}</b>
      </div>
      {missing > 0 && <p className="hint">{t('draftMissing').replace('{n}', String(missing))}</p>}

      <div className="ai-draft-btns">
        <button className="btn-primary" onClick={confirm} disabled={busy || rows.length === 0}>
          <Glyph name="check" size={17} color="#fff" /> {busy ? t('loading') : t('draftConfirm')}
        </button>
        <button className="btn-ghost" onClick={cancel} disabled={busy}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
