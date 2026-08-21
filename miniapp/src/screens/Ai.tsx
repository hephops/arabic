import { useEffect, useRef, useState } from 'react';
import { api, fmt, AiMessage, AiStatus } from '../api';
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
  { key: 'aiQ6', q: "Srogi yaqin tovarlarni telegramga yubor" },
];

export default function Ai({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const [msgs, setMsgs] = useState<AiMessage[]>([]);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // React holati darhol yangilanmaydi: Enter tez-tez bosilsa bir necha
  // so'rov birdaniga ketib qolardi (ekranda uchta bir xil savol).
  // Ref esa o'sha zahoti o'zgaradi.
  const sending = useRef(false);
  // Hozir qaysi vosita ishlayapti — kutish jonli ko'rinsin
  const [statusTool, setStatusTool] = useState('');
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
    if (!question || sending.current) return;
    sending.current = true;
    haptic.select();
    setText('');
    // Savol darhol ekranga chiqadi — javob kutilayotgani bilinib tursin
    setMsgs((m) => [...m, { role: 'user', text: question, created_at: '' }]);
    setBusy(true);
    setStatusTool('');
    // Javob bo'lak-bo'lak keladi.
    //
    // Javob pufakchasi DARHOL qo'shiladi (bo'sh holda), keyin har
    // bo'lakda oxirgi xabar almashtiriladi. Ilgari "birinchi bo'lakda
    // qo'sh, keyingilarida almashtir" degan bayroq ishlatilgandi va
    // savolning o'zi yo'qolib qolardi: React yangilanishni keyinroq
    // bajaradi, o'sha paytda bayroq allaqachon o'zgargan bo'lib,
    // birinchi bo'lak foydalanuvchi xabarini bosib yozardi.
    setMsgs((m) => [...m, { role: 'assistant', text: '', created_at: '' }]);
    let acc = '';
    const push = (delta: string) => {
      acc += delta;
      const text = acc;
      setMsgs((m) => {
        const next = [...m];
        next[next.length - 1] = { role: 'assistant', text, created_at: '' };
        return next;
      });
    };
    try {
      await api.aiStream(question, (e) => {
        if (e.type === 'text') push(e.delta);
        else if (e.type === 'status') setStatusTool(e.tool);
        else if (e.type === 'error') push((acc ? '\n\n' : '') + e.message);
      });
      if (!acc) push(t('aiNoAnswer'));
      api.aiStatus().then(setStatus).catch(() => {});
    } catch (e: any) {
      push((acc ? '\n\n' : '') + (e.details?.message ?? e.message));
    } finally {
      sending.current = false;
      setStatusTool('');
      setBusy(false);
    }
  }

  /** Tayyor javobni Telegramga o'tkazish — yordamchining o'ziga aytamiz */
  function sendToTelegram(text: string) {
    send(`${t('aiToTelegramCmd')}\n\n${text.slice(0, 1500)}`);
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
            {status && status.price > 0 && (
              <p className="hint center">{t('aiPriceHint').replace('{n}', fmt(status.price))}</p>
            )}
          </div>
        )}

        {msgs.filter((m) => m.text).map((m, i) => (
          <div key={i} className={`ai-msg-wrap ${m.role}`}>
            <div className={`ai-msg ${m.role}`}>{m.text}</div>
            {/* Javobni bir bosishda Telegramga o'tkazish. Yordamchi
                buni gap bilan ham qila oladi, lekin do'konchi bunday
                imkoniyat borligini bilishi kerak — tugma ko'rinib
                tursin. */}
            {m.role === 'assistant' && m.text.length > 40 && (
              <button className="ai-send-tg" onClick={() => sendToTelegram(m.text)} disabled={busy}>
                <Glyph name="send" size={13} color="var(--accent)" /> {t('aiToTelegram')}
              </button>
            )}
          </div>
        ))}

        {busy && (
          <div className="ai-msg assistant thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            {statusTool && <span className="ai-status">{t('tool_' + statusTool)}</span>}
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

        {status && (status.left_today !== null || status.price > 0) && (
          <p className="hint center ai-left">
            {status.price > 0 && (
              <>{t('aiPrice').replace('{n}', fmt(status.price))}</>
            )}
            {status.price > 0 && status.left_today !== null && ' · '}
            {status.left_today !== null && t('aiLeft').replace('{n}', String(status.left_today))}
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
