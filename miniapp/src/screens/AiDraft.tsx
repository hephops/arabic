import { useEffect, useState } from 'react';
import { api, fmt, AiDraftItem } from '../api';
import { Glyph } from '../icons';
import { useT } from '../i18n';
import { toast } from '../toast';
import { haptic } from '../telegram';
import { qtyText, normalizeUnit } from '../units';
import { formatAmount, amountValue } from '../format';
import { DateField } from '../ui';
import Scanner from '../Scanner';
import { profile } from '../shopTypes';

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
  /** Ombordagi tovarning O'Z nomi — moslik kod yoki soddalashtirilgan nom
      bo'yicha topilganda u nakladnoydagidan boshqacha bo'ladi */
  eski_nom?: string | null;
  eski_sotuv_narxi?: number | null;
  eski_qoldiq?: number | null;
  /** Kod boshqa tovardan ko'chirilsinmi — do'konchi tasdiqlagan bo'lsa */
  kod_kochir?: boolean;
  /** kod kimdan olinishi — kartada ko'rinib tursin */
  kod_eski?: string;
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
  // Ro'yxatda do'kon turining birliklari + taklifda uchragan boshqasi
  const unitList = Array.from(
    new Set([...profile().units, ...items.map((x) => normalizeUnit(x.birlik)).filter(Boolean)])
  );
  const [rows, setRows] = useState<Row[]>(items);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<'done' | 'cancelled' | null>(null);
  // Skaner qaysi qator uchun ochilgani. Kod kelganda aynan o'sha qatorga
  // yozilishi kerak — bittasini yodda tutmasak, kod adashib tushadi.
  const [scanFor, setScanFor] = useState<number | null>(null);
  // Do'konchi o'zi ochgan/yopgan qatorlar. Tegilmagani ro'yxatda yo'q —
  // u holda qatorning to'liqligi hal qiladi (ochiq() ga qara).
  const [open, setOpen] = useState<Record<number, boolean>>({});
  // Band shtrix-kod haqidagi ogohlantirish: qaysi qator, qaysi kod va
  // kod hozir kimda turgani. null — ogohlantirish yo'q.
  const [warn, setWarn] = useState<{ row: number; code: string; owner: string } | null>(null);

  // Bitta ekranda bir nechta saqlangan taklif turishi mumkin. React
  // ro'yxatni qayta chizganda shu komponentni boshqa taklif uchun ishlatib
  // yuborsa, ekranda eski qatorlar qolib ketardi — taklif almashsa,
  // qatorlarni ham yangisidan boshlaymiz.
  useEffect(() => {
    setRows(items);
    setOpen({});
    setScanFor(null);
    setClosed(null);
    setWarn(null);
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

  /**
   * Kod omborda bandmi.
   *
   * Bu tekshiruv FAQAT shu kartada bor: kirim kartasida kod yozilishi
   * bilan tovarning qoldig'i o'zgaradi, ya'ni xato kod qoldiqni
   * BEGONA tovarga qo'shib yuboradi (server tovarni avval kod bo'yicha
   * qidiradi). Ilovaning boshqa joylarida band kod shunchaki rad
   * etiladi, ko'chirilmaydi.
   */
  async function checkCode(i: number, code: string, mavjudId?: number | null) {
    const clean = code.trim();
    if (!clean) return;
    const res = await api.lookupBarcode(clean).catch(() => null);
    const owner = res?.product;
    // Egasi yo'q yoki egasi shu qatorning O'Z tovari — hammasi joyida
    if (!owner || owner.id === mavjudId) return;
    haptic.error();
    setWarn({ row: i, code: clean, owner: owner.name });
  }

  /** "O'tkazilsin" — kod eski tovardan olinib shunga biriktiriladi */
  function moveCode() {
    if (!warn) return;
    haptic.select();
    set(warn.row, { shtrix_kod: warn.code, kod_kochir: true, kod_eski: warn.owner });
    setWarn(null);
  }

  /** "Qo'shilmasin" — kod maydondan olib tashlanadi, qator o'z nomi
      bilan ketadi va begona tovarga tegmaydi */
  function dropCode() {
    if (!warn) return;
    haptic.select();
    set(warn.row, { shtrix_kod: '', kod_kochir: false, kod_eski: undefined });
    setWarn(null);
  }

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
    // O'chirish qaytarib bo'lmaydi, tugmasi esa qatorni ochish tugmasining
    // yonginasida turadi — barmoq bilan bosganda 23-40 qatorli nakladnoyda
    // qaysi qator yo'qolganini ham bilib bo'lmaydi. Shuning uchun qator
    // nomini aytib tasdiq so'raymiz (boshqa ekranlar ham shunday qiladi).
    // window. kerak: shu komponentda confirm() nomli o'z funksiyamiz bor,
    // usiz brauzerniki emas, tasdiqlash oqimi chaqirilib ketardi.
    if (!window.confirm(t('draftRemoveAsk', { n: rows[i]?.nom || t('name') }))) return;
    haptic.select();
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
      // Tasdiqlashdan OLDIN hamma kod yana bir bor tekshiriladi.
      //
      // Maydonga qo'l tegmagan bo'lishi ham mumkin: kod rasmdan
      // o'qilgan bo'lsa do'konchi uni ochib ham ko'rmaydi. Kod esa
      // band bo'lsa qoldiq begona tovarga tushib ketardi — shuning
      // uchun band kod topilsa tasdiqlash TO'XTAYDI va do'konchi
      // o'zi hal qiladi (qayta bosadi).
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const code = (r.shtrix_kod ?? '').trim();
        if (!code || r.kod_kochir) continue;
        const res = await api.lookupBarcode(code).catch(() => null);
        const owner = res?.product;
        if (!owner || owner.id === r.mavjud_id) continue;
        haptic.error();
        setWarn({ row: i, code, owner: owner.name });
        setBusy(false);
        return;
      }
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
        // Moslik shtrix-kod yoki soddalashtirilgan nom bo'yicha topilgan
        // bo'lishi mumkin — u holda kartada nakladnoydagi nom turadi va
        // do'konchi moslik to'g'rimi-yo'qmi tekshira olmaydi. Noto'g'ri
        // moslik esa BEGONA tovarning qoldig'ini oshirib yuboradi, shuning
        // uchun ombordagi tovarning o'z nomini ko'rsatamiz. Nomlar bir xil
        // bo'lsa yozuv ortiqcha — kartani behuda uzaytirmaymiz.
        // Qator bo'yicha hisob: jami kirim summasi, ustama foizi va
        // bir birlikdan tushadigan foyda
        const kn = Number(r.kirim_narxi) || 0;
        const sn = Number(r.sotuv_narxi) || 0;
        const hisob = {
          jami: (Number(r.miqdor) || 0) * kn,
          ustama: kn > 0 && sn > 0 ? Math.round(((sn - kn) / kn) * 100) : null,
          foyda: kn > 0 && sn > 0 ? sn - kn : null,
        };
        const eskiNom = r.eski_nom?.trim() || '';
        const matched =
          eskiNom && eskiNom.toLowerCase() !== (r.nom || '').trim().toLowerCase()
            ? t('draftMatched', { n: eskiNom })
            : '';
        // Omborda bori uchun quruq "bor" degani kam: qoldiq va eski sotuv
        // narxi ko'rinsa, do'konchi narxni o'zgartirayotganini darrov biladi
        const stock = [
          matched,
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
              {/* Ochiq qatorda nom maydoni inputga aylanadi — uni bosgan
                  odam yozishga tushib qoladi, ya'ni qatorni yopadigan
                  yagona joy shu tugma. Shu sababli tugma nomi holatga
                  qarab o'zgaradi va ochiq holatda ko'rinib turadi (.on). */}
              <button
                className={`ai-draft-toggle ${op ? 'on' : ''}`}
                onClick={() => toggle(i)}
                aria-expanded={op}
                aria-label={op ? t('close') : t('draftToggle')}
                title={op ? t('close') : t('draftToggle')}
              >
                <Glyph name="chevron" size={13} color={op ? 'var(--text)' : 'var(--muted)'} />
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
                    {/* Birliklar do'kon turidan: qurilishda qop va m²,
                        zargarlikda gramm. Ilgari ro'yxat qat'iy edi va
                        u yerdagi "quti"/"qop" serverga yetib bormasdi. */}
                    {unitList.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </label>
                {/* Narx ilovaning qolgan joylaridagi kabi ajratib
                    yoziladi (7 000), aks holda nol sanab o'tirishga
                    to'g'ri kelardi */}
                <label>
                  <span>{t('draftCost')}</span>
                  <input
                    className="kirim"
                    inputMode="numeric"
                    value={formatAmount(String(r.kirim_narxi || ''))}
                    onChange={(e) => set(i, { kirim_narxi: amountValue(e.target.value) })}
                  />
                </label>
                <label>
                  <span>{t('draftSell')}</span>
                  <input
                    className="sotuv"
                    inputMode="numeric"
                    value={formatAmount(String(r.sotuv_narxi || ''))}
                    onChange={(e) => set(i, { sotuv_narxi: amountValue(e.target.value) })}
                  />
                </label>
                {/* Qator hisobi — do'konchi kalkulyator qidirmasin.
                    Ustama foizi eng muhimi: nakladnoydan kelgan kirim
                    narxi bilan o'zi qo'ygan sotuv narxi orasidagi farq
                    shu yerda darrov ko'rinadi. */}
                {(hisob.jami > 0 || hisob.ustama !== null) && (
                  <div className="ai-draft-calc wide">
                    {hisob.jami > 0 && (
                      <span>
                        {t('draftRowTotal')}: <b>{fmt(hisob.jami)}</b>
                      </span>
                    )}
                    {hisob.ustama !== null && (
                      <span className={hisob.ustama < 0 ? 'red' : 'green'}>
                        {t('draftMarkup')}: <b>{hisob.ustama > 0 ? '+' : ''}{hisob.ustama}%</b>
                        {hisob.foyda !== null ? ` · ${fmt(hisob.foyda)}` : ''}
                      </span>
                    )}
                  </div>
                )}

                <label className="wide">
                  <span>{t('barcodeLabel')} · {t('optional')}</span>
                  <div className="ai-draft-code">
                    {/* Maydon harfni ham qabul qiladi (ART9 kabi artikullar),
                        shuning uchun klaviatura ham harfli bo'lsin: raqamli
                        klaviaturada artikulni qo'lda yozib bo'lmasdi.
                        Uzun raqamli kodni esa yonidagi skaner o'qiydi. */}
                    <input
                      className="kod"
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={r.shtrix_kod ?? ''}
                      onChange={(e) =>
                        set(i, {
                          shtrix_kod: e.target.value.replace(/[^0-9A-Za-z]/g, ''),
                          // kod qo'lda o'zgardi — eski ruxsat kuchini yo'qotadi
                          kod_kochir: false,
                          kod_eski: undefined,
                        })
                      }
                      // Yozib bo'lgandan keyin tekshiramiz: har harfda
                      // so'rov yuborsak, yarim yozilgan kod "band emas"
                      // bo'lib chiqaverardi
                      onBlur={(e) => checkCode(i, e.target.value, r.mavjud_id)}
                    />
                    <button className="ai-draft-scan" onClick={() => setScanFor(i)} aria-label={t('scanner')}>
                      <Glyph name="scan" size={17} color="var(--accent)" />
                    </button>
                  </div>
                  {/* Kod ko'chirilishi tasdiqlangan bo'lsa — kartada
                      ko'rinib tursin, do'konchi tugmani bosishdan oldin
                      yana bir bor o'ylab ko'radi */}
                  {r.kod_kochir && r.kod_eski && (
                    <div className="ai-draft-stock warn">
                      <Glyph name="warning" size={12} color="var(--yellow)" />
                      <span>{t('draftCodeMoving', { n: r.kod_eski })}</span>
                    </div>
                  )}
                </label>
                {/* Srok faqat srogi bor do'konda: zargarlik yoki telefon
                    kartasida bu maydon bo'sh joy egallardi */}
                {profile().expiry && (
                  <label className="wide">
                    <span>{t('expiry')} · {t('optional')}</span>
                    <DateField value={r.srok || ''} onChange={(v) => set(i, { srok: v })} ariaLabel={t('expiry')} />
                  </label>
                )}
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

      {/* Band kod haqidagi ogohlantirish — ekranning O'RTASIDA, chunki
          bu qarorni sezmay o'tib ketib bo'lmaydi: rozi bo'linsa kod
          boshqa tovardan olinadi. */}
      {warn && (
        <div className="kod-warn-wrap" onClick={dropCode}>
          <div className="kod-warn" onClick={(e) => e.stopPropagation()}>
            <Glyph name="warning" size={28} color="var(--yellow)" />
            <b className="kod-warn-title">{t('draftCodeTaken')}</b>
            <p className="kod-warn-text">
              {t('draftCodeTakenBy', { c: warn.code, n: warn.owner })}
            </p>
            <p className="kod-warn-text">
              {t('draftCodeMoveAsk', { n: rows[warn.row]?.nom || t('name'), o: warn.owner })}
            </p>
            <button className="btn-primary" onClick={moveCode}>
              {t('draftCodeMove')}
            </button>
            <button className="btn-ghost" onClick={dropCode}>
              {t('draftCodeDrop')}
            </button>
          </div>
        </div>
      )}

      {scanRow !== null && (
        <Scanner
          onScan={(code) => {
            set(scanRow, { shtrix_kod: code, kod_kochir: false, kod_eski: undefined });
            setScanFor(null);
            // Skaner o'qigan kod omborda bormi — darrov tekshiramiz
            checkCode(scanRow, code, rows[scanRow]?.mavjud_id);
          }}
          onClose={() => setScanFor(null)}
        />
      )}
    </div>
  );
}
