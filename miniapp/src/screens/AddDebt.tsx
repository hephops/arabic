import { useState } from 'react';
import { api } from '../api';

// Ovozli kiritish: brauzer SpeechRecognition (Telegram webview'da bor/yo'qligiga qarab)
// bo'lmasa — matn yozib parse qilinadi. PROD: audio -> backend -> Mohir.ai STT.

export default function AddDebt({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'voice' | 'manual'>('voice');
  const [voiceText, setVoiceText] = useState('');
  const [listening, setListening] = useState(false);
  const [parsed, setParsed] = useState<{ customer_name: string; amount: number; due_date: string | null; note: string | null } | null>(null);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function startListening() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Bu qurilmada ovoz tanish yo'q — matn yozing yoki qo'lda kiriting");
      return;
    }
    const rec = new SR();
    rec.lang = 'uz-UZ';
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setVoiceText(text);
      parseText(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  async function parseText(text: string) {
    setError('');
    try {
      const res = await api.parseVoice(text);
      setParsed(res);
    } catch {
      setError("Tushunolmadim — qo'lda kiriting yoki boshqacha ayting");
    }
  }

  async function saveParsed() {
    if (!parsed) return;
    setBusy(true);
    try {
      await api.createDebt({
        customer_name: parsed.customer_name,
        amount: parsed.amount,
        note: parsed.note ?? undefined,
        due_date: parsed.due_date ?? undefined,
        source: 'voice',
      });
      onDone();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveManual() {
    const amt = parseInt(amount.replace(/\D/g, ''), 10);
    if (!name.trim() || !amt) {
      setError('Ism va summa majburiy');
      return;
    }
    setBusy(true);
    try {
      await api.createDebt({
        customer_name: name.trim(),
        amount: amt,
        note: note || undefined,
        due_date: dueDate || undefined,
        source: 'manual',
      });
      onDone();
    } catch (e: any) {
      setError('Xatolik: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  const quickAmounts = [10000, 50000, 100000, 200000];

  return (
    <div className="screen">
      <div className="chip-row">
        <button className={`chip ${mode === 'voice' ? 'selected' : ''}`} onClick={() => setMode('voice')}>
          🎤 Ovoz bilan
        </button>
        <button className={`chip ${mode === 'manual' ? 'selected' : ''}`} onClick={() => setMode('manual')}>
          ✍️ Qo'lda
        </button>
      </div>

      {mode === 'voice' ? (
        <>
          <div className="card center">
            <p className="hint">Masalan: "Karim akaga 120 ming so'm, shanbagacha"</p>
            <button
              className="btn-primary"
              style={{ background: listening ? 'var(--red)' : 'var(--accent)' }}
              onClick={startListening}
            >
              {listening ? '🔴 Eshityapman...' : '🎤 Gapiring'}
            </button>
          </div>
          <label>Yoki yozing</label>
          <input
            value={voiceText}
            onChange={(e) => setVoiceText(e.target.value)}
            placeholder="Karim akaga 120 ming shanbagacha"
          />
          <button className="btn-ghost" onClick={() => parseText(voiceText)} disabled={!voiceText.trim()}>
            Tahlil qilish
          </button>

          {parsed && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="section-title">Tasdiqlang</div>
              <div className="list-item" style={{ background: 'var(--bg2)' }}>
                <div className="name">👤 {parsed.customer_name}</div>
              </div>
              <div className="big-amount">{new Intl.NumberFormat('uz-UZ').format(parsed.amount)} so'm</div>
              {parsed.due_date && <p className="center hint">Muddat: {parsed.due_date}</p>}
              {parsed.note && <p className="center hint">Izoh: {parsed.note}</p>}
              <button className="btn-primary" onClick={saveParsed} disabled={busy}>
                ✅ Saqlash
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <label>Mijoz ismi</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Karim aka" />
          <label>Summa</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="120 000" />
          <div className="chip-row">
            {quickAmounts.map((a) => (
              <button key={a} className="chip" onClick={() => setAmount(String(a))}>
                {new Intl.NumberFormat('uz-UZ').format(a)}
              </button>
            ))}
          </div>
          <label>Izoh (ixtiyoriy)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="un, yog'..." />
          <label>Muddat (ixtiyoriy)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <button className="btn-primary" onClick={saveManual} disabled={busy}>
            ✅ Qarz yozish
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
