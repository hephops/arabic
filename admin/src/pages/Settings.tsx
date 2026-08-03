import { useEffect, useState } from 'react';
import { api, fmt } from '../api';

type Field = { key: string; label: string; hint?: string; money?: boolean };
type Group = { title: string; sub?: string; fields: Field[] };

// Sozlamalar shu yerda turadi — mijoz ilovasi qiymatlarni serverdan oladi,
// ya'ni bu yerda o'zgartirilgan raqam darhol butun tizimga tatbiq bo'ladi.
const GROUPS: Group[] = [
  {
    title: 'Balans',
    sub: "Do'konchi balansini to'ldirganda tekshiriladi",
    fields: [
      {
        key: 'min_topup_amount',
        label: "Minimal to'ldirish summasi",
        hint: "Bundan kam summa kiritilsa ilova to'ldirishga ruxsat bermaydi",
        money: true,
      },
    ],
  },
  {
    title: 'Tariflar',
    sub: '30 kunlik obuna narxi, balansdan yechiladi',
    fields: [
      { key: 'price_premium', label: 'Premium narxi', money: true },
      { key: 'price_business', label: 'Biznes narxi', money: true },
      { key: 'trial_days', label: 'Sinov muddati (kun)', hint: "Yangi do'kon uchun bepul kunlar" },
    ],
  },
  {
    title: 'Xizmat tannarxi',
    sub: 'Eslatma va qo‘ng‘iroqlar hisob-kitobi uchun',
    fields: [
      { key: 'sms_price', label: '1 ta SMS narxi', money: true },
      { key: 'call_price', label: "1 ta AI qo'ng'iroq narxi", money: true },
    ],
  },
  {
    title: 'Referal',
    fields: [{ key: 'referral_bonus', label: 'Taklif uchun bonus', hint: "Do'kon balansiga qo'shiladi", money: true }],
  },
  {
    title: "Qo'llab-quvvatlash",
    sub: 'Ilovada mijozga ko‘rsatiladi',
    fields: [
      { key: 'support_phone', label: 'Telefon raqami' },
      { key: 'support_telegram', label: 'Telegram' },
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
      <div className="page-title">Sozlamalar</div>
      <div className="page-sub">Tizim bo'ylab amal qiladigan qiymatlar</div>

      {GROUPS.map((g) => (
        <div className="panel" key={g.title}>
          <h3>{g.title}</h3>
          {g.sub && <div className="muted" style={{ marginTop: -6, marginBottom: 12, fontSize: 13 }}>{g.sub}</div>}
          {g.fields.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  style={{ width: 220 }}
                  value={value(f.key)}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder="—"
                />
                {f.money && value(f.key) !== '' && !Number.isNaN(Number(value(f.key))) && (
                  <span className="muted">{fmt(Number(value(f.key)))}</span>
                )}
              </div>
              {f.hint && <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>{f.hint}</div>}
            </div>
          ))}
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
