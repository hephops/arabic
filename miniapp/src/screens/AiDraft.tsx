import { useEffect, useState } from 'react';
import { api, fmt, AiDraftItem } from '../api';
import { Glyph } from '../icons';
import { useT } from '../i18n';
import { toast } from '../toast';
import { haptic } from '../telegram';
import { qtyText } from '../units';
import { DateField } from '../ui';
import Scanner from '../Scanner';

// Rasmdan o'qilgan kirim taklifi.
//
// Bu ekrandagi eng nozik joy: shu yerda do'konchining ombori
// o'zgaradi. Shuning uchun har qator TAHRIRLANADI — yordamchi
// qo'lyozmani noto'g'ri o'qigan bo'lsa, do'konchi tugmani bosishdan
// oldin tuzatib qo'yadi.
//
// "Tasdiqlash" bosilmaguncha omborga hech narsa tushmaydi.
//
// Qatorda oltita maydon bor, nakladnoyda esa 30-40 qator bo'ladi —
// hammasi ochiq tursa karta bir necha ekran bo'lib ketadi. Shuning
// uchun qator YIG'IB ko'rsatiladi, faqat to'ldirilishi kerak bo'lgani
// o'zi ochiq turadi.

/**
 * Kartadagi bitta qator. Nakladnoydan o'qilgan maydonlardan tashqari
 * vosita ombordagi holatni ham qo'shib beradi — ular tahrirlanmaydi,
 * do'konchi tovar allaqachon bor ekanini bilib tursin.
 */
type Row = AiDraftItem & {
  shtrix_kod?: string;
  mavjud_id?: number | null;
  eski_sotuv_narxi?: number | null;
  eski_qoldiq?: number | null;
};

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
  const [rows, setRows] = useState<Row[]>(items);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<'done' | 'cancelled' | null>(null);
  // Skaner qaysi qator uchun ochilgani. Kod kelganda aynan o'sha qatorga
  // yozilishi kerak — bittasini yodda tutmasak, kod adashib tushadi.
  const [scanFor, setScanFor] = useState<number | null>(null);
  // Do'konchi o'zi ochgan/yopgan qatorlar. Tegilmagani ro'yxatda yo'q —
  // u holda qatorning to'liqligi hal qiladi (ochiq() ga qara).
  const [open, setOpen] = useState<Record<number, boolean>>({});

  // Bitta ekranda bir nechta saqlangan taklif turishi mumkin. React
  // ro'yxatni qayta chizganda shu komponentni boshqa taklif uchun ishlatib
  // yuborsa, ekranda eski qatorlar qolib ketardi — taklif almashsa,
  // qatorlarni ham yangisidan boshlaymiz.
  useEffect(() => {
    setRows(items);
    setOpen({});
    setScanFor(null);
    setClosed(null);
  }, [draftId]);

  const set = (i: number, patch: Partial<Row>) => {
    setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
    // Qatorga qo'l tegdi — endi u FAQAT do'konchining o'zi yopsa yopiladi.
    // Busiz shunday bo'lardi: qator "to'ldirilmagani uchun" ochiq turgan,
    // do'konchi kirim narxini yozishi bilan qator to'liq bo'lib qolgan va
    // ekran uni o'sha zahoti yopib qo'ygan — qolgan maydonlarini
    // to'ldirib bo'lmasdi.
    setOpen((o) => (o[i] === undefined ? { ...o, [i]: true } : o));
  };

  // Birligi yoki kirim narxi yo'q qator — do'konchining qo'li tegishi shart
  const toFill = (r: Row) => !r.birlik || !r.kirim_narxi;
  // To'ldirilmagani o'zi ochiq turadi: uzun nakladnoyda do'konchi qaysi
  // qatorga qo'l urish kerakligini qidirib o'tirmasin
  const ochiq = (i: number) => open[i] ?? toFill(rows[i]);

  function toggle(i: number) {
    const next = !ochiq(i);
    haptic.select();
    setOpen((o) => ({ ...o, [i]: next }));
  }

  function removeRow(i: number) {
    setRows((x) => x.filter((_, k) => k !== i));
    // Ochiq/yopiq holat indeksga bog'langan — o'chirilganidan keyingilarini
    // bir pog'ona surmasak, holat qo'shni qatorga o'tib ketadi
    setOpen((o) => {
      const next: Record<number, boolean> = {};
      for (const [k, v] of Object.entries(o)) {
        const n = Number(k);
        if (n !== i) next[n > i ? n - 1 : n] = v;
      }
      return next;
    });
  }

  const total = rows.reduce((s, r) => s + (Number(r.miqdor) || 0) * (Number(r.kirim_narxi) || 0), 0);
  // Narxi yoki birligi to'ldirilmagan qatorlar — do'konchi ko'rib tursin
  const missing = rows.filter(toFill).length;

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

  // Alohida o'zgaruvchi: skaner yopilganda qaysi qatorga yozishni
  // callback ichida ham aniq bilib turamiz
  const scanRow = scanFor;

  return (
    <div className="ai-draft">
      <div className="ai-draft-head">
        <Glyph name="box" size={16} color="var(--accent)" />
        <b>{t('draftTitle')}</b>
        <span className="ai-draft-count">{rows.length}</span>
      </div>
      <p className="hint" style={{ margin: '2px 0 10px' }}>{t('draftHint')}</p>

      {rows.map((r, i) => {
        const op = ochiq(i);
        // Yopiq qatorda eng kerakli uchtasi bir satrda turadi
        const meta = [
          r.miqdor ? `${qtyText(r.miqdor)}${r.birlik ? ` ${r.birlik}` : ''}` : '',
          r.kirim_narxi ? fmt(r.kirim_narxi) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        // Omborda bori uchun quruq "bor" degani kam: qoldiq va eski sotuv
        // narxi ko'rinsa, do'konchi narxni o'zgartirayotganini darrov biladi
        const stock = [
          r.eski_qoldiq != null
            ? t('draftInStock', { q: `${qtyText(r.eski_qoldiq)} ${r.eski_birlik || r.birlik || ''}`.trim() })
            : '',
          r.eski_sotuv_narxi ? t('draftOldPrice', { p: fmt(r.eski_sotuv_narxi) }) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        // Nakladnoydagi birlik ombordagidan boshqa bo'lsa qoldiq aralashib
        // ketadi (quti va dona bir xil hisoblanib qoladi) — ogohlantiramiz
        const unitDiff = !!r.omborda_bor && !!r.eski_birlik && !!r.birlik && r.eski_birlik !== r.birlik;
        return (
          <div className={`ai-draft-row ${op ? 'open' : ''}`} key={i}>
            <div className="ai-draft-top">
              <button
                className={`ai-draft-toggle ${op ? 'on' : ''}`}
                onClick={() => toggle(i)}
                aria-expanded={op}
                aria-label={t('draftToggle')}
              >
                <Glyph name="chevron" size={13} color="var(--muted)" />
              </button>
              {op ? (
                <input
                  className="nom"
                  value={r.nom}
                  onChange={(e) => set(i, { nom: e.target.value })}
                  placeholder={t('name')}
                />
              ) : (
                <button className="ai-draft-sum" onClick={() => toggle(i)}>
                  {/* Alohida klass: ".nom" tahrirlanadigan MAYDONNI
                      bildiradi, bu esa shunchaki yozuv. Ikkalasi bir
                      nom bilan yursa, qatorni ochmasdan turib nomni
                      o'zgartirmoqchi bo'lgan kod adashadi. */}
                  <span className="ai-draft-sum-nom">{r.nom || t('name')}</span>
                  {meta && <span className="meta">{meta}</span>}
                </button>
              )}
              {op && !r.omborda_bor && <span className="badge">{t('draftNew')}</span>}
              <button className="ai-draft-x" onClick={() => removeRow(i)} aria-label={t('delete')}>
                <Glyph name="close" size={14} color="var(--muted)" />
              </button>
            </div>

            {/* Ombordagi holat yopiq qatorda ham ko'rinadi — tanish tovarni
                ochmasdan ajratib olish uchun shu satrning o'zi yetadi */}
            {r.omborda_bor && (
              <div className="ai-draft-stock">
                <Glyph name="box" size={12} color="var(--green)" />
                <span>{stock || t('draftKnown')}</span>
              </div>
            )}
            {unitDiff && (
              <div className="ai-draft-stock warn">
                <Glyph name="warning" size={12} color="var(--yellow)" />
                <span>{t('draftUnitDiff', { u: r.eski_birlik ?? '' })}</span>
              </div>
            )}

            {/* Maydonlarga o'z nomi qo'yilgan: ular tartibi bilan emas,
                MA'NOSI bilan topilsin. Yangi maydon qo'shilganda tartibga
                tayangan kod jimgina boshqa maydonni tahrirlab qo'yardi. */}
            {op && (
              <div className="ai-draft-fields">
                <label>
                  <span>{t('draftQty')}</span>
                  <input
                    className="miqdor"
                    inputMode="decimal"
                    value={String(r.miqdor ?? '')}
                    onChange={(e) => set(i, { miqdor: Number(e.target.value.replace(',', '.')) || 0 })}
                  />
                </label>
                <label>
                  <span>{t('draftUnit')}</span>
                  <select className="birlik" value={r.birlik || ''} onChange={(e) => set(i, { birlik: e.target.value })}>
                    <option value="">—</option>
                    {['dona', 'kg', 'litr', 'quti', 'qop', 'metr'].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('draftCost')}</span>
                  <input
                    className="kirim"
                    inputMode="numeric"
                    value={String(r.kirim_narxi || '')}
                    onChange={(e) => set(i, { kirim_narxi: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                  />
                </label>
                <label>
                  <span>{t('draftSell')}</span>
                  <input
                    className="sotuv"
                    inputMode="numeric"
                    value={String(r.sotuv_narxi || '')}
                    onChange={(e) => set(i, { sotuv_narxi: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                  />
                </label>
                <label className="wide">
                  <span>{t('barcodeLabel')} · {t('optional')}</span>
                  <div className="ai-draft-code">
                    <input
                      className="kod"
                      inputMode="numeric"
                      value={r.shtrix_kod ?? ''}
                      onChange={(e) => set(i, { shtrix_kod: e.target.value.replace(/[^0-9A-Za-z]/g, '') })}
                    />
                    <button className="ai-draft-scan" onClick={() => setScanFor(i)} aria-label={t('scanner')}>
                      <Glyph name="scan" size={17} color="var(--accent)" />
                    </button>
                  </div>
                </label>
                <label className="wide">
                  <span>{t('expiry')} · {t('optional')}</span>
                  <DateField value={r.srok || ''} onChange={(v) => set(i, { srok: v })} ariaLabel={t('expiry')} />
                </label>
              </div>
            )}
          </div>
        );
      })}

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

      {scanRow !== null && (
        <Scanner
          onScan={(code) => {
            set(scanRow, { shtrix_kod: code });
            setScanFor(null);
          }}
          onClose={() => setScanFor(null)}
        />
      )}
    </div>
  );
}
