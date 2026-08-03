import { useState } from 'react';
import { api, setToken } from '../api';
import { Glyph } from '../icons';

// Ro'yxatdan o'tish TZ bo'yicha: telefon + SMS-kod (OTP), yangi do'kon uchun
// profil to'ldirish bosqichi (do'kon nomi, ega, karta, til).

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [step, setStep] = useState<'phone' | 'code' | 'setup'>('phone');
  const [phone, setPhone] = useState('+998');
  const [code, setCode] = useState('');
  const [hint, setHint] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // setup bosqichi
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [language, setLanguage] = useState('uz');

  async function sendOtp() {
    setBusy(true);
    setError('');
    try {
      const res = await api.requestOtp(phone);
      setHint(res.dev_hint);
      setStep('code');
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError('');
    try {
      const res = await api.verify(phone, code);
      setToken(res.token);
      if (!res.shop.owner_name) {
        // yangi do'kon — profilni to'ldirish bosqichi
        setShopName(res.shop.name === "Mening do‘konim" ? '' : res.shop.name);
        setStep('setup');
      } else {
        onLogin();
      }
    } catch (e: any) {
      setError(e.message === 'invalid_code' ? "Kod noto'g'ri" : 'Xatolik: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
    if (!shopName.trim()) {
      setError("Do'kon nomini kiriting");
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.updateMe({
        name: shopName.trim(),
        owner_name: ownerName.trim() || undefined,
        card_number: cardNumber.trim() || undefined,
        language,
      } as any);
      onLogin();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">A</div>
      <h2 className="center" style={{ marginBottom: 4 }}>Arabic.One</h2>
      <p className="center hint" style={{ marginBottom: 24 }}>Do'kon Daftari — qarz, ombor, kassa</p>

      {step === 'phone' && (
        <>
          <label>Telefon raqamingiz</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <button className="btn-primary" onClick={sendOtp} disabled={busy || phone.length < 9}>
            SMS kod olish
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <label>SMS kod</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} />
          {hint && <p className="hint">DEV rejim — kod: {hint}</p>}
          <button className="btn-primary" onClick={verify} disabled={busy || code.length < 6}>
            Kirish
          </button>
          <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setStep('phone')}>
            Orqaga
          </button>
        </>
      )}

      {step === 'setup' && (
        <>
          <p className="center hint" style={{ marginBottom: 10 }}>Xush kelibsiz! Do'koningiz haqida aytib bering:</p>
          <label>Do'kon nomi *</label>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Barakat do'koni" />
          <label>Ismingiz</label>
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Akbar aka" />
          <label>Karta raqami (qarzdorlar to'lovi uchun; keyin ham kiritsa bo'ladi)</label>
          <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} inputMode="numeric" placeholder="8600 0000 0000 0000" />
          <label>Til</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="uz">O'zbekcha (lotin)</option>
            <option value="uz_cyrl">Ўзбекча (кирилл)</option>
            <option value="ru">Русский</option>
          </select>
          <button className="btn-primary" onClick={finishSetup} disabled={busy}>
            <Glyph name="check" size={18} color="#fff" strokeWidth={2.4} /> Boshlash
          </button>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
