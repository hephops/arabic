import { useState } from 'react';
import { api, setToken } from '../api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState('+998');
  const [code, setCode] = useState('');
  const [shopName, setShopName] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [hint, setHint] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      const res = await api.verify(phone, code, shopName || undefined);
      setToken(res.token);
      onLogin();
    } catch (e: any) {
      setError(e.message === 'invalid_code' ? "Kod noto'g'ri" : 'Xatolik: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">A</div>
      <h2 className="center" style={{ marginBottom: 4 }}>Arabic.One</h2>
      <p className="center hint" style={{ marginBottom: 24 }}>Do'kon Daftari — qarz, ombor, kassa</p>

      {step === 'phone' ? (
        <>
          <label>Telefon raqamingiz</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <label>Do'kon nomi (yangi bo'lsangiz)</label>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Masalan: Barakat do'koni"
          />
          <button className="btn-primary" onClick={sendOtp} disabled={busy || phone.length < 9}>
            SMS kod olish
          </button>
        </>
      ) : (
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
      {error && <p className="error">{error}</p>}
    </div>
  );
}
