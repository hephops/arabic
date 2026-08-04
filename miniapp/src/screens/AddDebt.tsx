import { useEffect, useRef, useState } from 'react';
import { api, fmt } from '../api';
import { Glyph } from '../icons';
import { haptic } from '../telegram';
import { useT } from '../i18n';
import { formatAmount, amountValue, formatPhone, phoneDigits, phoneE164, isPhoneComplete } from '../format';
import { toast } from '../toast';

// Qarz yozishning ikki yo'li teng: ovoz bilan va qo'lda.
// Ovoz: brauzer SpeechRecognition. Ishlamasa — sabab aniq aytiladi va
// matn maydoni qoladi (PROD: audio -> backend -> Mohir.ai STT).

type Parsed = { customer_name: string; amount: number; due_date: string | null; note: string | null };

const SR: any = typeof window !== 'undefined'
  ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  : null;

export default function AddDebt({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'voice' | 'manual'>('voice');
  const { t } = useT();

  return (
    <div className="screen narrow">
      <div className="segmented">
        <button className={mode === 'voice' ? 'on' : ''} onClick={() => { setMode('voice'); haptic.select(); }}>
          <Glyph name="mic" size={16} /> {t('byVoice')}
        </button>
        <button className={mode === 'manual' ? 'on' : ''} onClick={() => { setMode('manual'); haptic.select(); }}>
          <Glyph name="pencil" size={16} /> {t('byHand')}
        </button>
      </div>

      {mode === 'voice' ? <VoiceMode onDone={onDone} /> : <ManualMode onDone={onDone} />}
    </div>
  );
}

/* ─────────── Ovoz bilan ─────────── */

function VoiceMode({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('');
  const [live, setLive] = useState('');
  const [listening, setListening] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [phone, setPhone] = useState('');
  const [needPhone, setNeedPhone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const recRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const { t, lang } = useT();

  // Ekrandan chiqilsa mikrofon albatta o'chadi
  useEffect(() => () => stop(), []);

  function stop() {
    clearTimeout(timerRef.current);
    try {
      recRef.current?.stop();
    } catch { /* allaqachon to'xtagan */ }
    recRef.current = null;
    setListening(false);
    setLive('');
  }

  function start() {
    if (listening) return stop();
    if (!SR) {
      setError(t('noSpeechSupport'));
      return;
    }
    setError('');
    setParsed(null);
    setLive('');

    const rec = new SR();
    rec.lang = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let finalText = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setLive(interim);
      if (finalText.trim()) {
        setText(finalText.trim());
        stop();
        haptic.success();
        parse(finalText.trim());
      }
    };
    rec.onerror = (e: any) => {
      const kind = e?.error;
      setError(
        kind === 'not-allowed' || kind === 'service-not-allowed'
          ? t('micDenied')
          : kind === 'network'
          ? t('micNoNetwork')
          : kind === 'no-speech'
          ? t('micNoResult')
          : t('micNoResult')
      );
      stop();
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setError(t('micNoResult'));
      stop();
      return;
    }
    // 12 soniyadan keyin o'zi to'xtaydi — "Eshityapman..." holatida qotib qolmasin
    timerRef.current = setTimeout(() => {
      if (recRef.current) {
        stop();
        setError((prev) => prev || t('micNoResult'));
      }
    }, 12000);
  }

  async function parse(value: string) {
    setError('');
    setNeedPhone(false);
    try {
      setParsed(await api.parseVoice(value));
    } catch {
      setError(t('couldNotParse'));
    }
  }

  async function save() {
    if (!parsed) return;
    setBusy(true);
    try {
      await api.createDebt({
        customer_name: parsed.customer_name,
        customer_phone: isPhoneComplete(phone) ? phoneE164(phone) : undefined,
        amount: parsed.amount,
        note: parsed.note ?? undefined,
        due_date: parsed.due_date ?? undefined,
        source: 'voice',
      });
      toast.success(t('toastDebtSaved'), `${parsed.customer_name} · ${fmt(parsed.amount)}`);
      onDone();
    } catch (e: any) {
      // Bu qarzdorning raqami yo'q — shu yerda so'raymiz
      if (e.message === 'customer_phone_required') {
        setNeedPhone(true);
        setError(t('phoneRequired'));
      } else if (e.message === 'phone_taken') {
        setError(t('phoneTaken'));
      } else {
        setError(t('error') + ': ' + e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mic-stage">
        <button className={`mic-btn ${listening ? 'on' : ''} ${SR ? '' : 'off'}`} onClick={start}>
          {listening && (
            <>
              <span className="ring r1" />
              <span className="ring r2" />
            </>
          )}
          <Glyph name={listening ? 'close' : 'mic'} size={34} color="#fff" />
        </button>
        <div className="mic-state">{listening ? t('listening') : t('micTap')}</div>
        <div className="mic-example">{live || t('voiceExample')}</div>
      </div>

      {!SR && (
        <div className="notice">
          <Glyph name="warning" size={17} color="var(--yellow)" />
          <span>{t('noSpeechSupport')}</span>
        </div>
      )}

      <div className="form-group">
        <div className="form-row">
          <label>{t('orType')}</label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Karim akaga 120 ming shanbagacha"
            onKeyDown={(e) => e.key === 'Enter' && text.trim() && parse(text)}
          />
        </div>
      </div>
      <button className="btn-ghost" onClick={() => parse(text)} disabled={!text.trim()}>
        {t('analyze')}
      </button>

      {parsed && (
        <div className="confirm-card">
          <div className="confirm-head">{t('confirm')}</div>
          <div className="confirm-amount">{fmt(parsed.amount)}</div>
          <div className="confirm-name">{parsed.customer_name}</div>
          <div className="confirm-meta">
            {parsed.due_date && (
              <span>
                <Glyph name="calendar" size={13} /> {parsed.due_date}
              </span>
            )}
            {parsed.note && (
              <span>
                <Glyph name="pencil" size={13} /> {parsed.note}
              </span>
            )}
          </div>
          {needPhone && (
            <div className="confirm-phone">
              <label>{t('debtorPhone')}</label>
              <div className="phone-field inline">
                <span className="cc">+998</span>
                <input
                  className="phone-input"
                  value={formatPhone(phone).replace('+998', '').trim()}
                  onChange={(e) => setPhone(phoneDigits(e.target.value))}
                  inputMode="tel"
                  placeholder="90 123 45 67"
                  autoFocus
                />
              </div>
              <p className="field-note">{t('phoneWhy')}</p>
            </div>
          )}
          <button
            className="btn-primary"
            onClick={save}
            disabled={busy || (needPhone && !isPhoneComplete(phone))}
          >
            <Glyph name="check" size={18} color="#fff" /> {t('save')}
          </button>
        </div>
      )}

      {error && (
        <div className="notice">
          <Glyph name="warning" size={17} color="var(--yellow)" />
          <span>{error}</span>
        </div>
      )}
    </>
  );
}

/* ─────────── Qo'lda ─────────── */

function ManualMode({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  const value = amountValue(amount);

  async function save() {
    if (!name.trim() || !value) {
      setError(t('nameAmountRequired'));
      return;
    }
    if (!isPhoneComplete(phone)) {
      setError(t('phoneRequired'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.createDebt({
        customer_name: name.trim(),
        customer_phone: phoneE164(phone),
        amount: value,
        note: note || undefined,
        due_date: dueDate || undefined,
        source: 'manual',
      });
      toast.success(t('toastDebtSaved'), `${name.trim()} · ${fmt(value)}`);
      onDone();
    } catch (e: any) {
      setError(t('error') + ': ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="amount-stage">
        <input
          className="amount-input"
          value={formatAmount(amount)}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          placeholder="0"
          autoFocus
        />
        <div className="amount-cur">{t('currency')}</div>
      </div>

      <div className="form-group">
        <div className="form-row">
          <label>{t('customerName')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Karim aka" />
        </div>
        <div className="form-row">
          <label>{t('debtorPhone')}</label>
          <div className="phone-field inline">
            <span className="cc">+998</span>
            <input
              className="phone-input"
              value={formatPhone(phone).replace('+998', '').trim()}
              onChange={(e) => setPhone(phoneDigits(e.target.value))}
              inputMode="tel"
              placeholder="90 123 45 67"
            />
          </div>
          <p className="field-note">{t('phoneWhy')}</p>
        </div>
        <div className="form-row">
          <label>
            {t('dueDate')} <span className="tag">{t('optional')}</span>
          </label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="form-row">
          <label>
            {t('note')} <span className="tag">{t('optional')}</span>
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="un, yog'..." />
        </div>
      </div>

      <button
        className="btn-primary btn-lg"
        onClick={save}
        disabled={busy || !name.trim() || !value || !isPhoneComplete(phone)}
      >
        <Glyph name="check" size={19} color="#fff" /> {t('addDebtBtn')}
      </button>
      {error && <p className="error center">{error}</p>}
    </>
  );
}
