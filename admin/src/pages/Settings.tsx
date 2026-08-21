import { useEffect, useState } from 'react';
import { api, fmt, fmtNum, type AdminAiStatus } from '../api';

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

  useEffect(() => {
    api.settings().then(setData).catch((e) => setErr(e.message));
    api.aiStatus().then(setAi).catch(() => {});
  }, []);

  const value = (k: string) => dirty[k] ?? data[k] ?? '';
  const changed = Object.keys(dirty).length > 0;

  function set(k: string, v: string) {
    setMsg('');
    setDirty((d) => ({ ...d, [k]: v }));
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

  return (
    <>
      {/* AI yordamchi.
          Kalit shu yerdan qo'yiladi — serverga kirib .env tahrirlash
          shart emas. Kalitning O'ZI hech qachon qaytarilmaydi: brauzerga
          faqat oxirgi 4 belgi keladi, jurnalga esa "qo'yildi/o'chirildi"
          yoziladi. Yozib saqlash bilan darhol ishlaydi, qayta ishga
          tushirish kerak emas. */}
      {ai && (
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

            <div className="set-field">
              <label>Kuniga savol chegarasi (bitta do'kon uchun)</label>
              <input
                type="number"
                min={0}
                placeholder={String(ai.daily_limit)}
                value={value('ai_daily_limit')}
                onChange={(e) => set('ai_daily_limit', e.target.value)}
              />
              <div className="set-hint">
                0 — cheksiz (tavsiya etilmaydi). Hozir: {ai.daily_limit} ta
              </div>
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
      {GROUPS.map((g) => (
        <div className="panel" key={g.title}>
          <h3>{g.title}</h3>
          {g.sub && <div className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>{g.sub}</div>}
          <div className="set-grid">
            {g.fields.map((f) => (
              <div className={`set-field ${f.wide ? 'wide' : ''}`} key={f.key}>
                <label>{f.label}</label>
                {f.toggle ? (
                  <button
                    className={`toggle ${value(f.key) === '1' ? 'on' : ''}`}
                    onClick={() => set(f.key, value(f.key) === '1' ? '0' : '1')}
                  >
                    <span />
                    <b>{value(f.key) === '1' ? 'Yoqilgan' : "O'chiq"}</b>
                  </button>
                ) : (
                  <>
                    <input value={value(f.key)} onChange={(e) => set(f.key, e.target.value)} placeholder="—" />
                    {f.money && value(f.key) !== '' && !Number.isNaN(Number(value(f.key))) && (
                      <div className="set-note">
                        {fmt(Number(value(f.key)))}
                        {f.perMonth && Number(value(f.key)) > 0 && (
                          <> · oyiga ~{fmt(Number(value(f.key)) * 30)} · yiliga ~{fmt(Number(value(f.key)) * 365)}</>
                        )}
                      </div>
                    )}
                  </>
                )}
                {f.hint && <div className="set-hint">{f.hint}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}

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
