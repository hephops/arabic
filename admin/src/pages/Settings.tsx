import { useEffect, useState } from 'react';
import { api, fmt } from '../api';

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
    title: "Kunlik to'lov",
    sub: "Har kuni do'kon balansidan shuncha yechiladi",
    fields: [
      { key: 'daily_price', label: 'Kunlik narx', money: true, perMonth: true, hint: 'Asosiy narx — hamma uchun bir xil' },
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
    title: 'Xizmat tannarxi',
    sub: 'Eslatma va qo‘ng‘iroqlar hisob-kitobi uchun',
    fields: [
      { key: 'sms_price', label: '1 ta SMS narxi', money: true },
      { key: 'call_price', label: "1 ta AI qo'ng'iroq narxi", money: true },
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
  const [data, setData] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings().then(setData).catch((e) => setErr(e.message));
  }, []);

  const value = (k: string) => dirty[k] ?? data[k] ?? '';
  const changed = Object.keys(dirty).length > 0;

  function set(k: string, v: string) {
    setMsg('');
    setDirty((d) => ({ ...d, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setErr('');
    try {
      setData(await api.saveSettings(dirty));
      setDirty({});
      setMsg('Saqlandi');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>

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
