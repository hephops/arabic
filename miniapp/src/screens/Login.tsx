import { useEffect, useState } from 'react';
import { api, setToken } from '../api';
import { Glyph } from '../icons';
import { useT, LANG_NAMES, type Lang } from '../i18n';
import { inTelegram, initData, haptic } from '../telegram';

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
  const [language, setLanguage] = useState<Lang>('uz');
  const { t, setLang } = useT();
  const [checkingTg, setCheckingTg] = useState(inTelegram);

  // Telegram ichida ochilgan bo'lsa — hisob bog'langan bo'lsa avtomatik kiramiz
  useEffect(() => {
    if (!inTelegram) return;
    api
      .telegramAuth(initData())
      .then((res) => {
        setToken(res.token);
        haptic.success();
        onLogin();
      })
      .catch(() => setCheckingTg(false));
  }, []);

  async function sendOtp() {
    setBusy(true);
    setError('');
    try {
      const res = await api.requestOtp(phone);
      setHint(res.dev_hint);
      setStep('code');
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError('');
    try {
      const res = await api.verify(phone, code, undefined, inTelegram ? initData() : undefined);
      setToken(res.token);
      if (!res.shop.owner_name) {
        // yangi do'kon — profilni to'ldirish bosqichi
        setShopName(res.shop.name === "Mening do‘konim" ? '' : res.shop.name);
        setStep('setup');
      } else {
        onLogin();
      }
    } catch (e: any) {
      setError(e.message === 'invalid_code' ? t('loginWrongCode') : t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
    if (!shopName.trim()) {
      setError(t('setupNameRequired'));
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
      setError(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  if (checkingTg) {
    return (
      <div className="login-wrap center">
        <div className="login-logo">A</div>
        <p className="hint">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">A</div>
      <h2 className="center" style={{ marginBottom: 4 }}>Arabic.One</h2>
      <p className="center hint" style={{ marginBottom: 24 }}>{t('loginSubtitle')}</p>

      {step === 'phone' && (
        <>
          <label>{t('loginPhone')}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <button className="btn-primary" onClick={sendOtp} disabled={busy || phone.length < 9}>
            {t('loginGetCode')}
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <label>{t('loginCode')}</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} />
          {hint && <p className="hint">{t('loginDevHint')}: {hint}</p>}
          <button className="btn-primary" onClick={verify} disabled={busy || code.length < 6}>
            {t('loginEnter')}
          </button>
          <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setStep('phone')}>
            {t('back')}
          </button>
        </>
      )}

      {step === 'setup' && (
        <>
          <p className="center hint" style={{ marginBottom: 10 }}>{t('setupWelcome')}</p>
          <label>{t('setupShopName')} *</label>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Barakat do'koni" />
          <label>{t('setupOwner')}</label>
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Akbar aka" />
          <label>{t('setupCard')}</label>
          <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} inputMode="numeric" placeholder="8600 0000 0000 0000" />
          <label>{t('navLanguage')}</label>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as Lang);
              setLang(e.target.value as Lang);
            }}
          >
            {Object.entries(LANG_NAMES).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={finishSetup} disabled={busy}>
            <Glyph name="check" size={18} color="#fff" strokeWidth={2.4} /> {t('setupStart')}
          </button>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
