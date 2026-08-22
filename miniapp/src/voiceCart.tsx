import { useEffect, useRef, useState } from 'react';
import { api, fmt, Product } from './api';
import { Glyph } from './icons';
import { useT } from './i18n';
import { useSpeech } from './speech';
import { toast } from './toast';
import { haptic } from './telegram';
import { useEscape } from './useEscape';

// "Uch dona non, bitta sut" deb aytish bilan savat to'ladi.
//
// Do'konchilar, ayniqsa yoshi kattaroqlari, klaviaturada yozishni yoqtirmaydi.
// Ovoz tanish har doim ham aniq ishlamaydi (o'zbek tili uchun brauzer
// qo'llab-quvvatlashi zaif), shuning uchun ikkita narsa muhim:
//   1. aytilgani DARHOL ro'yxat bo'lib ko'rinadi — do'konchi tasdiqlaydi,
//      savatga jimgina noto'g'ri tovar tushib qolmaydi;
//   2. matn yozish yo'li doim ochiq — bu har qanday qurilmada ishlaydi.

export interface VoiceLine {
  said: string;
  qty: number;
  product: (Product & { id: number }) | null;
  score: number;
}

export function VoiceCartSheet({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (items: { product: Product; qty: number }[]) => void;
}) {
  const { t, lang } = useT();
  const [text, setText] = useState('');
  const [lines, setLines] = useState<VoiceLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const speech = useSpeech((final) => {
    setText(final);
    parse(final);
  }, lang);

  // Ovoz ishlamaydigan qurilmada darhol matn maydoniga o'tamiz
  useEffect(() => {
    if (!speech.supported) inputRef.current?.focus();
  }, [speech.supported]);

  async function parse(value: string) {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      const res = await api.parseVoiceCart(v);
      setLines(res.lines as VoiceLine[]);
      if (res.found === 0) haptic.error();
    } catch (e: any) {
      toast.error(t('error'), e.message);
    } finally {
      setBusy(false);
    }
  }

  function setQty(i: number, qty: number) {
    setLines((prev) => prev?.map((l, n) => (n === i ? { ...l, qty: Math.max(0, Math.round(qty * 100) / 100) } : l)) ?? null);
  }

  function drop(i: number) {
    setLines((prev) => prev?.filter((_, n) => n !== i) ?? null);
  }

  function addAll() {
    const items = (lines ?? [])
      .filter((l) => l.product && l.qty > 0)
      .map((l) => ({ product: l.product as Product, qty: l.qty }));
    if (!items.length) return;
    onAdd(items);
    toast.success(t('voiceAdded'), `${items.length} ${t('itemsShort')}`);
    onClose();
  }

  const ready = (lines ?? []).filter((l) => l.product && l.qty > 0);
  const missing = (lines ?? []).filter((l) => !l.product);

  // Kompyuterda Escape bilan ham yopilsin
  useEscape(onClose);

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{t('voiceCartTitle')}</div>
        <div className="sheet-sub">{t('voiceCartHint')}</div>

        {speech.supported && (
          <button
            className={`mic-big ${speech.listening ? 'on' : ''}`}
            onClick={() => speech.start()}
            aria-label={t('speak')}
          >
            <Glyph name="mic" size={30} color="#fff" />
            <span>{speech.listening ? t('listening') : t('micTap')}</span>
          </button>
        )}

        {speech.interim && <div className="voice-live">{speech.interim}</div>}
        {speech.error && <p className="error center">{speech.error}</p>}

        <div className="voice-typed">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && parse(text)}
            placeholder={t('voiceCartPlaceholder')}
          />
          <button className="btn-chip" onClick={() => parse(text)} disabled={busy || !text.trim()}>
            <Glyph name="search" size={16} color="var(--accent)" /> {t('analyze')}
          </button>
        </div>

        {lines && lines.length === 0 && <p className="hint center">{t('voiceNothing')}</p>}

        {lines && lines.length > 0 && (
          <div className="voice-list">
            {lines.map((l, i) => (
              <div className={`voice-row ${l.product ? '' : 'miss'}`} key={i}>
                <div className="vr-body">
                  <div className="vr-name">
                    {l.product?.name ?? l.said}
                    {/* Taxminiy moslik — do'konchi ko'zdan kechirsin */}
                    {l.product && l.score < 0.85 && <span className="badge">{t('voiceGuess')}</span>}
                  </div>
                  <div className="vr-sub">
                    {l.product ? (
                      <>
                        {fmt(l.product.sell_price)} · {t('voiceHeard')}: “{l.said}”
                      </>
                    ) : (
                      <span style={{ color: 'var(--red)' }}>{t('voiceNotFound')}</span>
                    )}
                  </div>
                </div>
                {l.product ? (
                  <div className="ol-qty">
                    <button onClick={() => setQty(i, l.qty - 1)}>−</button>
                    <input
                      value={String(l.qty)}
                      onChange={(e) => setQty(i, parseFloat(e.target.value.replace(',', '.')) || 0)}
                      inputMode="decimal"
                    />
                    <button onClick={() => setQty(i, l.qty + 1)}>+</button>
                  </div>
                ) : (
                  <button className="vr-drop" onClick={() => drop(i)} aria-label={t('delete')}>
                    <Glyph name="close" size={17} color="var(--muted)" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {ready.length > 0 && (
          <button className="btn-primary btn-lg" onClick={addAll}>
            <Glyph name="cart" size={18} color="#fff" /> {t('voiceAddToCart')} ({ready.length})
          </button>
        )}
        {missing.length > 0 && ready.length === 0 && lines && (
          <p className="hint center">{t('voiceAllMissing')}</p>
        )}
      </div>
    </div>
  );
}
