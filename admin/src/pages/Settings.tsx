import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, type AdminAiStatus } from '../api';
import { SHOP_TYPES, typeKey } from '../shopTypes';

type Field = {
  key: string;
  label: string;
  hint?: string;
  /** so'mda — yoniga yozuv bilan ko'rsatiladi */
  money?: boolean;
  /** ha/yo'q tugmasi */
  toggle?: boolean;
  /** kunlik narxdan kelib chiqib "oyiga shuncha" deb ko'rsatiladi */
  perMonth?: boolean;
  wide?: boolean;
};
type Group = { title: string; sub?: string; fields: Field[] };

// Sozlamalar shu yerda turadi — mijoz ilovasi qiymatlarni serverdan oladi,
// ya'ni bu yerda o'zgartirilgan raqam darhol butun tizimga tatbiq bo'ladi.
//
// Tarif degan narsa yo'q: bitta kunlik narx bor, u har kuni do'kon
// balansidan yechiladi.
const GROUPS: Group[] = [
  {
    // Balansdan pul ketadigan HAMMA narsa shu yerda. Ilgari ular uch
    // joyga tarqalgan edi (kunlik to'lov, xizmat tannarxi, AI bo'limi)
    // va "nima uchun yechilyapti" degan savolga javob topish uchun
    // sahifa bo'ylab qidirishga to'g'ri kelardi.
    title: 'Yechimlar — balansdan nima uchun pul yechiladi',
    sub: "Har biri do'kon balansidan avtomatik yechiladi. 0 — o'sha xizmat bepul",
    fields: [
      { key: 'daily_price', label: 'Kunlik xizmat haqi', money: true, perMonth: true, hint: 'Har kuni yechiladi — asosiy tushum' },
      { key: 'ai_question_price', label: 'AI: bitta savol', money: true, hint: "Har savolda yechiladi. 0 — bepul, kunlik haqqa kiradi" },
      { key: 'sms_price', label: '1 ta SMS', money: true, hint: 'Mijozga eslatma yuborilganda' },
      { key: 'call_price', label: "1 ta AI qo'ng'iroq", money: true, hint: "Qarzdorga qo'ng'iroq qilinganda" },
      // Chegara ham shu yerda: AI bilan bog'liq raqamlar bir joyda
      // tursin, ilgari u faqat AI panelida edi va tur tanlanganda
      // umuman ko'rinmasdi
      {
        key: 'ai_daily_limit',
        label: 'AI: kuniga savol chegarasi',
        hint: "Bitta do'kon uchun. 0 — cheksiz (tavsiya etilmaydi)",
      },
    ],
  },
  {
    title: "Kunlik to'lov qoidalari",
    sub: "Bepul muddat, ogohlantirish va to'xtatish",
    fields: [
      { key: 'trial_days', label: 'Bepul kunlar', hint: "Yangi do'konga beriladi, bu muddatda pul yechilmaydi" },
      { key: 'low_balance_days', label: 'Ogohlantirish (kun)', hint: 'Shuncha kun qolganda do‘konchi ogohlantiriladi' },
      {
        key: 'block_on_empty',
        label: 'Balans tugasa to‘xtatilsinmi',
        toggle: true,
        hint: "Yoqilsa: balansi tugagan do'kon yangi yozuv qo'sha olmaydi. O'chiq bo'lsa faqat ogohlantiriladi",
      },
    ],
  },
  {
    title: "Balansni to'ldirish",
    sub: "Do'konchi pulni shu kartaga o'tkazadi, siz Balans bo'limida kiritasiz",
    fields: [
      { key: 'topup_card', label: 'Karta raqami', wide: true, hint: 'Ilovada do‘konchiga ko‘rsatiladi' },
      { key: 'topup_card_holder', label: 'Karta egasi' },
      { key: 'min_topup_amount', label: "Eng kam to'ldirish", money: true },
    ],
  },
  {
    title: "Qo'shimchalar",
    sub: "Balansga QO'SHILADIGAN summalar",
    fields: [
      { key: 'referral_bonus', label: 'Taklif uchun bonus', money: true, hint: "Do'kon balansiga qo'shiladi" },
      // Targ'ovchi xodimga har ulangan do'kon uchun. Bu do'kon
      // balansiga tegmaydi — xodimga beriladigan pul.
      {
        key: 'agent_bonus',
        label: "Xodim mukofoti (1 do'kon)",
        money: true,
        hint: "Targ'ovchi xodimga har ulangan do'kon uchun",
      },
    ],
  },
  {
    title: "Qo'llab-quvvatlash",
    sub: 'Ilovada mijozga ko‘rsatiladi',
    fields: [
      { key: 'support_phone', label: 'Telefon raqami' },
      { key: 'support_telegram', label: 'Telegram' },
      { key: 'low_balance_notify', label: 'Balans ogohlantirishi (Telegram)', toggle: true },
    ],
  },
];

/** Server javob bermasa ishlaydigan zaxira ro'yxat.
 *  backend/src/billing.ts:TYPE_SETTING_KEYS bilan bir xil.
 *
 *  Turga faqat BALANSDAN PUL YECHILADIGAN narxlar bo'linadi. Bepul
 *  muddat, to'ldirish kartasi, bonuslar va qo'llab-quvvatlash butun
 *  kompaniya uchun bitta — ular tur tanlanganda umuman ko'rinmaydi. */
const DEFAULT_TYPE_KEYS = [
  'daily_price',
  'ai_question_price',
  'ai_daily_limit',
  'sms_price',
  'call_price',
];

/* ─────────── Har tur uchun alohida sozlama ───────────
 *
 * Umumiy sozlama hamma do'konga tegishli. Lekin zargarlik do'koni
 * bilan non do'koni bir xil pul to'lashi shart emas — shuning uchun
 * tepadagi tugmalardan turni tanlab, o'sha tur uchun boshqa raqam
 * qo'yish mumkin.
 *
 * Maydon BO'SH qoldirilsa "ustama yo'q" degani: o'sha tur umumiy
 * qiymat bilan ishlaydi. Nol esa haqiqiy nol — "bu turdan pul
 * olinmaydi".
 */

export default function Settings() {
  const [ai, setAi] = useState<AdminAiStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testOk, setTestOk] = useState(false);
  const [data, setData] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  /** '' — umumiy sozlama, aks holda tanlangan do'kon turi */
  const [stype, setStype] = useState('');
  /** Qaysi sozlamani tur uchun alohida qo'yish mumkin.
   *  Serverdan olinadi; so'rov muvaffaqiyatsiz bo'lsa quyidagi
   *  zaxira ro'yxat ishlaydi — aks holda tur tanlangan holda yozilgan
   *  qiymat jimgina UMUMIY sozlamaga tushib ketardi. */
  const [typeKeys, setTypeKeys] = useState<string[]>(DEFAULT_TYPE_KEYS);
  /** Sozlama umuman qo'yilmagan bo'lsa ishlaydigan qiymatlar (serverdan) */
  const [defs, setDefs] = useState<Record<string, string>>({});

  useEffect(() => {
    api.settings().then(setData).catch((e) => setErr(e.message));
    api.aiStatus().then(setAi).catch(() => {});
    // Ro'yxat serverdan olinadi: panelga qo'lda ko'chirilsa, server
    // yangi sozlama qo'shganda panel eskisini ko'rsatib turardi
    api.settingsMeta()
      .then((m) => {
        setTypeKeys(m.type_keys?.length ? m.type_keys : DEFAULT_TYPE_KEYS);
        setDefs(m.defaults ?? {});
      })
      .catch(() => {});
  }, []);

  /** Turga alohida qo'yish mumkin bo'lgan sozlamami */
  const perType = (k: string) => typeKeys.includes(k);
  /** Tanlangan turdagi to'liq kalit: 'daily_price' -> 't_oltin_daily_price'.
   *  Turga bo'linmaydigan sozlama (karta raqami, AI kaliti) har doim
   *  umumiy bo'lib qoladi. */
  const full = (k: string) => (stype && perType(k) ? typeKey(stype, k) : k);

  const value = (k: string) => dirty[full(k)] ?? data[full(k)] ?? '';
  /** Umumiy qiymat — tur tanlanganda "ustama qo'yilmasa shu ishlaydi".
   *
   *  Umumiy sozlama ham qo'yilmagan bo'lsa serverning standart qiymati
   *  ko'rsatiladi: bo'sh maydonni "—" deb ko'rsatish yolg'on bo'lardi,
   *  chunki amalda o'sha standart raqam ishlab turadi. */
  const base = (k: string) => {
    const v = dirty[k] ?? data[k] ?? '';
    return String(v).trim() !== '' ? v : (defs[k] ?? '');
  };
  const changed = Object.keys(dirty).length > 0;

  /** Shu tur uchun nechta ustama qo'yilgan — tugmada ko'rsatiladi */
  function overrides(t: string): number {
    let n = 0;
    for (const k of typeKeys) {
      const v = dirty[typeKey(t, k)] ?? data[typeKey(t, k)] ?? '';
      if (String(v).trim() !== '') n++;
    }
    return n;
  }

  function set(k: string, v: string) {
    setMsg('');
    setDirty((d) => ({ ...d, [full(k)]: v }));
  }

  /**
   * Kalitni haqiqiy so'rov bilan sinab ko'rish.
   *
   * Sinov SAQLANGAN kalitni tekshiradi. Shuning uchun maydonda
   * saqlanmagan o'zgarish bo'lsa avval o'zi saqlaydi — aks holda
   * yangi kalitni yozib "Sinab ko'rish" bosgan odam eskisining
   * (yoki yo'qligining) natijasini ko'rib chalkashardi.
   */
  async function testAi() {
    setTesting(true);
    setTestMsg('');
    try {
      if (Object.keys(dirty).length > 0) await save();
      const r = await api.aiTest();
      setTestOk(r.ok);
      setTestMsg(r.ok ? `✅ Ishlayapti (${r.model}): ${r.answer}` : `⛔ ${r.error}`);
    } catch (e: any) {
      setTestOk(false);
      setTestMsg(`⛔ ${e.message}`);
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr('');
    try {
      setData(await api.saveSettings(dirty));
      setDirty({});
      setMsg('Saqlandi');
      // Kalit yoki model o'zgargan bo'lishi mumkin — holatni yangilaymiz
      api.aiStatus().then(setAi).catch(() => {});
      setTestMsg('');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const typeInfo = SHOP_TYPES.find((x) => x.id === stype);

  return (
    <>
      {/* Qaysi do'konlar uchun sozlanyapti.
          "Umumiy" — hammasi uchun. Tur tanlansa faqat o'sha turdagi
          do'konlarga tegadigan qiymatlar ko'rinadi. */}
      <div className="panel">
        <h3>Kimga tegishli</h3>
        <div className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
          Umumiy sozlama hamma do'konga tegishli. Turni tanlab, faqat o'sha turdagi
          do'konlar uchun boshqacha qiymat qo'yish mumkin
        </div>
        <div className="stype-tabs">
          <button className={`stype-tab ${stype === '' ? 'on' : ''}`} onClick={() => setStype('')}>
            ⚙️ Umumiy
          </button>
          {SHOP_TYPES.map((t) => {
            const n = overrides(t.id);
            return (
              <button
                key={t.id}
                className={`stype-tab ${stype === t.id ? 'on' : ''}`}
                onClick={() => setStype(t.id)}
              >
                {t.emoji} {t.label}
                {n > 0 && <i className="stype-badge">{n}</i>}
              </button>
            );
          })}
        </div>
        {stype && (
          <div className="stype-note">
            <b>{typeInfo?.emoji} {typeInfo?.label}</b> do'konlari uchun sozlanyapti.
            Maydon bo'sh qoldirilsa — umumiy qiymat ishlaydi.
            <br />
            Turga faqat <b>balansdan pul yechiladigan narxlar</b> bo'linadi. Bepul
            muddat, to'ldirish kartasi, bonuslar, qo'llab-quvvatlash va AI kaliti
            butun tizim uchun bitta — ular «Umumiy» bo'limida o'zgartiriladi.
          </div>
        )}
      </div>

      {/* AI yordamchi.
          Kalit shu yerdan qo'yiladi — serverga kirib .env tahrirlash
          shart emas. Kalitning O'ZI hech qachon qaytarilmaydi: brauzerga
          faqat oxirgi 4 belgi keladi, jurnalga esa "qo'yildi/o'chirildi"
          yoziladi. Yozib saqlash bilan darhol ishlaydi, qayta ishga
          tushirish kerak emas. */}
      {ai && !stype && (
        <div className="panel">
          <h3>AI yordamchi</h3>
          <div className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>
            {ai.enabled ? (
              <>
                ✅ <b>Yoqilgan</b> · kalit …{ai.key_tail || '????'}
                {ai.from_env ? ' (.env faylidan)' : ''}
                <br />
                30 kunda: tannarx <b>{fmt(ai.cost_month)}</b>
                {ai.question_price > 0 && (
                  <>
                    {' '}· do'konchilardan <b>{fmt(ai.earned_month)}</b> ({ai.paid_questions_month} savol) ·{' '}
                    <b className={ai.earned_month >= ai.cost_month ? 'ok-msg' : 'err-msg'}>
                      {ai.earned_month >= ai.cost_month ? 'foyda' : 'zarar'} {fmt(Math.abs(ai.earned_month - ai.cost_month))}
                    </b>
                  </>
                )}
                {' '}· {ai.calls_month} chaqiruv · {ai.shops_month} do'kon
              </>
            ) : (
              <>⛔ <b>O'chiq</b> — kalit qo'yilmagan. Do'konchilarga "AI yoqilmagan" deb ko'rinadi.</>
            )}
          </div>

          <div className="set-grid">
            <div className="set-field wide">
              <label>
                Anthropic kaliti{ai.key_tail ? ` · hozir …${ai.key_tail}` : ''}
              </label>
              <input
                type="password"
                autoComplete="off"
                placeholder={ai.key_tail ? "O'zgartirish uchun yangisini yozing" : 'sk-ant-...'}
                value={dirty.anthropic_api_key ?? ''}
                onChange={(e) => set('anthropic_api_key', e.target.value)}
              />
              <div className="set-hint">
                console.anthropic.com → API Keys. Yozib "Saqlash" bosilsa darhol ishlaydi — serverni
                qayta ishga tushirish shart emas. Kalit brauzerga hech qachon qaytarilmaydi.
              </div>
            </div>

            <div className="set-field">
              <label>Model</label>
              <select value={value('ai_model') || 'claude-haiku-4-5'} onChange={(e) => set('ai_model', e.target.value)}>
                <option value="claude-haiku-4-5">Haiku — arzon</option>
                <option value="claude-sonnet-5">Sonnet — aqlliroq</option>
              </select>
              <div className="set-hint">
                Sonnet o'zbekchani tabiiyroq yozadi. Bizga tushadigan TANNARX: Haiku ~100 so'm,
                Sonnet ~300 so'm bitta savolga. Do'konchidan olinadigan narxni siz qo'yasiz.
              </div>
            </div>

            {/* Savol narxi endi "Yechimlar" bo'limida — balansdan pul
                ketadigan hamma narsa bitta joyda tursin. Bu yerda faqat
                hozirgi holati eslatib turiladi. */}
            <div className="set-field">
              <label>Bitta savol narxi</label>
              <div className="set-static">
                {Number(value('ai_question_price') || 0) > 0
                  ? `${fmtNum(Number(value('ai_question_price')))} so'm`
                  : 'BEPUL'}
              </div>
              <div className="set-hint">Yuqoridagi «Yechimlar» bo'limida o'zgartiriladi</div>
            </div>

            {/* Chegara ham "Yechimlar" bo'limiga ko'chdi: u yerda uni
                har bir do'kon turi uchun alohida qo'yish mumkin.
                Bu yerda faqat hozirgi holati ko'rinib tursin. */}
            <div className="set-field">
              <label>Kuniga savol chegarasi</label>
              <div className="set-static">{ai.daily_limit > 0 ? `${ai.daily_limit} ta` : 'Cheksiz'}</div>
              <div className="set-hint">Yuqoridagi «Yechimlar» bo'limida o'zgartiriladi</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={testAi} disabled={testing || saving}>
              {testing ? 'Tekshirilyapti…' : dirty.anthropic_api_key ? 'Saqlab sinash' : 'Sinab ko\'rish'}
            </button>
            {testMsg && <span className={testOk ? 'ok-msg' : 'err-msg'}>{testMsg}</span>}
          </div>
        </div>
      )}

      {/* Maydonlar ustunma-ustun joylashadi — ilgari har biri butun
          kenglikni egallab, sahifa cho'zilib ketardi */}
      {GROUPS.map((g) => {
        // Tur tanlanganda faqat o'sha turga qo'yish mumkin bo'lgan
        // maydonlar qoladi. Karta raqami yoki qo'llab-quvvatlash
        // telefonini turga bo'lish ma'nosiz — ular kompaniyaniki.
        const fields = stype ? g.fields.filter((f) => perType(f.key)) : g.fields;
        if (!fields.length) return null;
        return (
        <div className="panel" key={g.title}>
          <h3>{g.title}</h3>
          {g.sub && <div className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>{g.sub}</div>}
          <div className="set-grid">
            {fields.map((f) => {
              const v = value(f.key);
              const inherited = stype && String(v).trim() === '';
              return (
              <div className={`set-field ${f.wide ? 'wide' : ''} ${inherited ? 'inherited' : ''}`} key={f.key}>
                <label>{f.label}</label>
                {f.toggle ? (
                  // Turda uch holat bo'ladi: umumiy (bo'sh), yoqilgan, o'chiq.
                  // Shuning uchun tur tanlanganda tugma emas, ro'yxat —
                  // aks holda "umumiy" holatiga qaytib bo'lmasdi.
                  stype ? (
                    <select value={v} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">Umumiy ({base(f.key) === '1' ? 'yoqilgan' : "o'chiq"})</option>
                      <option value="1">Yoqilgan</option>
                      <option value="0">O'chiq</option>
                    </select>
                  ) : (
                    <button
                      className={`toggle ${v === '1' ? 'on' : ''}`}
                      onClick={() => set(f.key, v === '1' ? '0' : '1')}
                    >
                      <span />
                      <b>{v === '1' ? 'Yoqilgan' : "O'chiq"}</b>
                    </button>
                  )
                ) : (
                  <>
                    <input
                      value={v}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={(stype ? base(f.key) : defs[f.key]) || '—'}
                    />
                    {inherited ? (
                      <div className="set-note muted">
                        Umumiy: <b>{f.money && base(f.key) !== '' && !Number.isNaN(Number(base(f.key)))
                          ? fmt(Number(base(f.key)))
                          : (base(f.key) || '—')}</b>
                      </div>
                    ) : !stype && String(v).trim() === '' && (defs[f.key] ?? '') !== '' ? (
                      // Umumiy sozlama ham bo'sh — amalda serverning
                      // standart qiymati ishlaydi, shuni aytib turamiz
                      <div className="set-note muted">
                        Standart: <b>{f.money && !Number.isNaN(Number(defs[f.key]))
                          ? fmt(Number(defs[f.key]))
                          : defs[f.key]}</b>
                      </div>
                    ) : (
                      f.money && v !== '' && !Number.isNaN(Number(v)) && (
                        <div className="set-note">
                          {fmt(Number(v))}
                          {f.perMonth && Number(v) > 0 && (
                            <> · oyiga ~{fmt(Number(v) * 30)} · yiliga ~{fmt(Number(v) * 365)}</>
                          )}
                        </div>
                      )
                    )}
                  </>
                )}
                {f.hint && <div className="set-hint">{f.hint}</div>}
              </div>
              );
            })}
          </div>
        </div>
        );
      })}

      <div className="save-bar">
        <button className="btn" disabled={!changed || saving} onClick={save}>
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
        {changed && (
          <button className="btn ghost" onClick={() => setDirty({})}>
            Bekor qilish
          </button>
        )}
        {msg && <span className="ok-msg">{msg}</span>}
        {err && <span className="error">{err}</span>}
      </div>
    </>
  );
}
