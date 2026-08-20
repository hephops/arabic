import { useEffect, useRef, useState } from 'react';
import { api, AiMessage, AiStatus } from '../api';
import { AppIcon, Glyph } from '../icons';
import { SubHeader } from '../ui';
import { useT } from '../i18n';
import { toast, loadFailed } from '../toast';
import { haptic } from '../telegram';

// AI yordamchi bilan suhbat.
//
// Do'konchi telefonda, ish ustida yozadi — shuning uchun ekran oddiy
// chat: yuqorida savol-javob, pastda yozish maydoni. Boshida esa
// tayyor savollar turadi: birinchi marta kirganda "nima so'rashim
// mumkin?" degan savol tug'ilmasin.

const SUGGESTIONS = [
  { key: 'aiQ1', q: "Bugungi savdo va foyda qancha?" },
  { key: 'aiQ2', q: "Qaysi tovarlarning srogi yaqin?" },
  { key: 'aiQ3', q: "Kim qarzdor va kim kechiktiryapti?" },
  { key: 'aiQ4', q: "Nima tugayapti, nima buyurtma qilay?" },
  { key: 'aiQ5', q: "Qaysi tovar ombordagi pulni bog'lab yotibdi?" },
];

export default function Ai({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const [msgs, setMsgs] = useState<AiMessage[]>([]);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.aiHistory().then(setMsgs).catch(loadFailed);
    api.aiStatus().then(setStatus).catch(loadFailed);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    haptic.select();
    setText('');
    // Savol darhol ekranga chiqadi — javob kutilayotgani bilinib tursin
    setMsgs((m) => [...m, { role: 'user', text: question, created_at: '' }]);
    setBusy(true);
    try {
      const r = await api.aiAsk(question);
      setMsgs((m) => [...m, { role: 'assistant', text: r.text, created_at: '' }]);
      api.aiStatus().then(setStatus).catch(() => {});
    } catch (e: any) {
      const msg = e.details?.message ?? e.message;
      setMsgs((m) => [...m, { role: 'assistant', text: msg, created_at: '' }]);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm(t('aiClearAsk'))) return;
    await api.aiClear();
    setMsgs([]);
    toast.info(t('aiCleared'));
  }

  if (status && !status.enabled) {
    return (
      <>
        <SubHeader title={t('aiTitle')} onBack={onBack} />
        <div className="screen empty">
          <AppIcon glyph="sparkle" color="pink" size={54} />
          <p className="hint center">{t('aiOff')}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <SubHeader
        title={t('aiTitle')}
        onBack={onBack}
        right={
          msgs.length > 0 ? (
            <button className="nav-btn" onClick={clear} aria-label={t('aiClear')}>
              <Glyph name="trash" size={18} color="var(--danger)" />
            </button>
          ) : undefined
        }
      />
      <div className="screen ai-screen">
        {msgs.length === 0 && (
          <div className="ai-intro">
            <AppIcon glyph="sparkle" color="pink" size={52} />
            <div className="ai-intro-title">{t('aiHello')}</div>
            <p className="hint center">{t('aiHint')}</p>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            {m.text}
          </div>
        ))}

        {busy && (
          <div className="ai-msg assistant thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
        <div ref={endRef} />

        {/* Tayyor savollar — birinchi marta kirganda nima so'rashni bilsin */}
        {!busy && (
          <div className="chip-row wrap ai-sugg">
            {SUGGESTIONS.map((s) => (
              <button key={s.key} className="chip" onClick={() => send(s.q)}>
                {t(s.key)}
              </button>
            ))}
          </div>
        )}

        {status && status.left_today !== null && (
          <p className="hint center ai-left">
            {t('aiLeft').replace('{n}', String(status.left_today))}
          </p>
        )}
      </div>

      <div className="ai-bar">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(text)}
          placeholder={t('aiPlaceholder')}
          disabled={busy}
        />
        <button className="ai-send" onClick={() => send(text)} disabled={busy || !text.trim()} aria-label={t('send')}>
          <Glyph name="arrowUp" size={20} color="#fff" strokeWidth={2.4} />
        </button>
      </div>
    </>
  );
}
