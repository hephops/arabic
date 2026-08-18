import { useEffect, useRef, useState } from 'react';
import { api, setToken } from '../api';
import { Glyph, Logo, Wordmark } from '../icons';
import { useT, LANG_NAMES, type Lang } from '../i18n';
import { inTelegram, initData, haptic, openBot } from '../telegram';
import { formatPhone, phoneE164, isPhoneComplete, phoneDigits, formatCard, cardDigits } from '../format';

// Ro'yxatdan o'tish: telefon → SMS-kod → (yangi do'kon bo'lsa) profilni to'ldirish.
// Har bir bosqich alohida ekran: bitta ish, bitta tugma.

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [step, setStep] = useState<'phone' | 'code' | 'setup' | 'employee'>('phone');
  // Botga to'g'ridan-to'g'ri havola: bosilsa /start o'zi bosiladi
  const [link, setLink] = useState('');
  // Kod allaqachon yuborildimi (raqam ilgari ulangan bo'lsa)
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { t } = useT();
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
      const res = await api.requestOtp(phoneE164(phone));
      setLink(res.deep_link ?? '');
      // Kod ilgari ulangan bo'lsa o'zi ketadi; ulanmagan bo'lsa
      // kod ekranidagi tugma botni ochadi va kod o'sha zahoti keladi.
      setSent(res.via === 'telegram');
      setStep('code');
      haptic.tap();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setBusy(true);
    setError('');
    try {
      const res = await api.verify(phoneE164(phone), code, undefined, inTelegram ? initData() : undefined);
      setToken(res.token);
      haptic.success();
      if (!res.shop.owner_name) {
        setStep('setup');
      } else {
        onLogin();
      }
    } catch (e: any) {
      haptic.error();
      setError(
        e.message === 'invalid_code'
          ? t('loginWrongCode')
          : e.message === 'code_expired'
          ? t('codeExpired')
          : e.message === 'too_many_attempts'
          ? t('tooManyAttempts')
          : t('error') + ': ' + e.message
      );
    } finally {
      setBusy(false);
    }
  }

  if (checkingTg) {
    return (
      <div className="auth auth-center">
        <Brand />
        <p className="auth-sub">{t('loading')}</p>
      </div>
    );
  }

  if (step === 'setup') return <Setup onDone={onLogin} />;
  if (step === 'employee') return <EmployeeLogin onDone={onLogin} onBack={() => setStep('phone')} />;

  return (
    <div className="auth">
      <div className="auth-body">
        <Brand />

        {step === 'phone' ? (
          <>
            {/* Maydon ustidagi yozuv yo'q — telefon ikonkasi va "+998"
                nima so'ralayotganini o'zi aytib turibdi */}
            <div className="auth-card">
              <div className="phone-field">
                <Glyph name="call" size={18} color="#9aa0aa" />
                <span className="cc">+998</span>
                <input
                  className="phone-input"
                  value={formatPhone(phone).replace('+998', '').trim()}
                  onChange={(e) => setPhone(phoneDigits(e.target.value))}
                  inputMode="tel"
                  autoFocus
                  placeholder="90 123 45 67"
                  onKeyDown={(e) => e.key === 'Enter' && isPhoneComplete(phone) && sendOtp()}
                />
              </div>
              <button className="btn-primary btn-lg" onClick={sendOtp} disabled={busy || !isPhoneComplete(phone)}>
                {busy ? t('loading') : t('loginGetCode')}
              </button>
            </div>

            <button className="btn-soft" onClick={() => setStep('employee')}>
              <Glyph name="person" size={17} /> {t('employeeLoginLink')}
            </button>

            <div className="auth-foot">
              <Glyph name="shield" size={14} color="var(--muted)" /> {t('secureLine')}
            </div>
          </>
        ) : (
          <CodeStep
            phone={phone}
            link={link}
            sent={sent}
            busy={busy}
            onSubmit={verify}
            onResend={sendOtp}
            onBack={() => {
              setError('');
              setStep('phone');
            }}
          />
        )}

        {error && <p className="error center">{error}</p>}
      </div>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  const { t } = useT();
  return (
    <div className={`auth-brand ${compact ? 'tight' : ''}`}>
      <div className={`auth-logo ${compact ? 'sm' : ''}`}>
        <Logo size={compact ? 34 : 62} />
      </div>
      {!compact && (
        <>
          <div className="auth-name"><Wordmark /></div>
          <div className="auth-tagline">{t('loginSubtitle')}</div>
        </>
      )}
    </div>
  );
}

/* ─────────── SMS kod: 6 ta alohida katak ─────────── */

function CodeStep({
  phone,
  link,
  sent,
  busy,
  onSubmit,
  onResend,
  onBack,
}: {
  phone: string;
  /** botga to'g'ridan-to'g'ri havola */
  link: string;
  /** kod allaqachon Telegramga ketganmi */
  sent: boolean;
  busy: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [opened, setOpened] = useState(false);
  const [left, setLeft] = useState(60);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useT();

  useEffect(() => {
    inputRef.current?.focus();
    const timer = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  function change(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 6);
    setCode(d);
    if (d.length === 6) onSubmit(d);
  }

  return (
    <>
      <div className="auth-card">
        <div className="auth-card-title">{t('authCodeTitle')}</div>
        <div className="auth-card-sub">{formatPhone(phone)}</div>

        <div className="otp" onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`otp-box ${code.length === i ? 'active' : ''} ${code[i] ? 'filled' : ''}`}>
              {code[i] ?? ''}
            </div>
          ))}
          <input
            ref={inputRef}
            className="otp-hidden"
            value={code}
            onChange={(e) => change(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
          />
        </div>

        {/* Kod hali yuborilmagan bo'lsa — botni ochadigan tugma.
            U diqqatni tortadi (asta-sekin pulsatsiya qiladi), chunki
            do'konchi kutib qolmasligi kerak: kod o'zi kelmaydi,
            avval shu tugma bosiladi. */}
        {!sent && link && (
          <button
            className="btn-primary btn-lg tg-get"
            onClick={() => {
              setOpened(true);
              openBot(link);
            }}
          >
            <Glyph name="send" size={18} color="#fff" /> {t('tgGetCode')}
          </button>
        )}
        {sent && <p className="code-note">{t('tgCodeSent')}</p>}
        {!sent && opened && <p className="code-note">{t('tgPasteHint')}</p>}

        <button
          className={`btn-primary btn-lg ${!sent && !opened ? 'quiet' : ''}`}
          onClick={() => onSubmit(code)}
          disabled={busy || code.length < 6}
        >
          {t('loginEnter')}
        </button>
      </div>

      <div className="auth-links">
        {left > 0 ? (
          <span className="muted-link">
            {t('authResendIn')} {left}s
          </span>
        ) : (
          <button
            className="link"
            onClick={() => {
              setLeft(60);
              onResend();
            }}
          >
            {t('authResend')}
          </button>
        )}
        <button className="link" onClick={onBack}>
          {t('authChangeNumber')}
        </button>
      </div>
    </>
  );
}

/* ─────────── Xodim (sotuvchi) kirishi ─────────── */

function EmployeeLogin({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const { t } = useT();

  async function enter(code = pin) {
    if (!isPhoneComplete(phone) || code.length < 4) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.employeeLogin(phoneE164(phone), code);
      setToken(res.token);
      haptic.success();
      onDone();
    } catch (e: any) {
      haptic.error();
      setPin('');
      setError(
        e.message === 'invalid_pin'
          ? t('employeeWrongPin')
          : e.message === 'shop_not_found'
          ? t('employeeShopNotFound')
          : e.message === 'too_many_attempts'
          ? t('tooManyAttempts')
          : t('error') + ': ' + e.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-body">
        <Brand compact />

        <div className="auth-card">
          <div className="auth-card-title">{t('employeeLoginTitle')}</div>
          <div className="auth-card-sub">{t('employeeLoginHint')}</div>

          <label className="auth-label">{t('employeeShopPhone')}</label>
          <div className="phone-field">
            <span className="cc">+998</span>
            <input
              className="phone-input"
              value={formatPhone(phone).replace('+998', '').trim()}
              onChange={(e) => setPhone(phoneDigits(e.target.value))}
              inputMode="tel"
              autoFocus
              placeholder="90 123 45 67"
            />
          </div>

          <label className="auth-label" style={{ marginTop: 16 }}>{t('pinCode')}</label>
          <div className="otp" onClick={() => pinRef.current?.focus()}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`otp-box ${pin.length === i ? 'active' : ''} ${pin[i] ? 'filled' : ''}`}>
                {pin[i] ? '•' : ''}
              </div>
            ))}
            <input
              ref={pinRef}
              className="otp-hidden"
              value={pin}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                setPin(d);
                if (d.length === 4 && isPhoneComplete(phone)) enter(d);
              }}
              inputMode="numeric"
              maxLength={4}
            />
          </div>

          <button
            className="btn-primary btn-lg"
            onClick={() => enter()}
            disabled={busy || !isPhoneComplete(phone) || pin.length < 4}
          >
            {t('loginEnter')}
          </button>
        </div>

        <button className="btn-soft" onClick={onBack}>
          <Glyph name="house" size={17} /> {t('ownerLoginLink')}
        </button>
        {error && <p className="error center">{error}</p>}
      </div>
    </div>
  );
}

/* ─────────── Yangi do'kon: profilni to'ldirish ─────────── */

function Setup({ onDone }: { onDone: () => void }) {
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [card, setCard] = useState('');
  const [language, setLanguage] = useState<Lang>('uz');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { t, setLang } = useT();

  const cardLen = cardDigits(card).length;
  const cardBad = cardLen > 0 && cardLen < 16;

  async function finish() {
    if (!shopName.trim()) {
      setError(t('setupNameRequired'));
      return;
    }
    if (cardBad) {
      setError(t('cardInvalid'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.updateMe({
        name: shopName.trim(),
        owner_name: ownerName.trim() || undefined,
        card_number: cardLen === 16 ? formatCard(card) : undefined,
        language,
      } as any);
      haptic.success();
      onDone();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-body">
        <Brand compact />
        <div className="auth-head">
          <h1 className="auth-title">{t('setupTitle')}</h1>
          <p className="auth-sub">{t('setupSub')}</p>
        </div>

        <div className="form-group">
          <div className="form-row">
            <label>{t('setupShopName')}</label>
            <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Barakat do'koni" autoFocus />
          </div>
          <div className="form-row">
            <label>{t('setupOwner')}</label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Akbar aka" />
          </div>
        </div>

        <div className="form-group">
          <div className="form-row">
            <label>
              {t('setupCardShort')} <span className="tag">{t('optionalField')}</span>
            </label>
            <input
              className={`mono ${cardBad ? 'bad' : ''}`}
              value={formatCard(card)}
              onChange={(e) => setCard(e.target.value)}
              inputMode="numeric"
              placeholder="8600 0000 0000 0000"
            />
          </div>
          <p className="form-note">{t('setupCardHint')}</p>
        </div>

        <div className="form-group">
          <div className="form-row">
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
          </div>
        </div>

        <button className="btn-primary btn-lg" onClick={finish} disabled={busy || !shopName.trim()}>
          <Glyph name="check" size={19} color="#fff" /> {t('setupStart')}
        </button>
        {error && <p className="error center">{error}</p>}
      </div>
    </div>
  );
}
