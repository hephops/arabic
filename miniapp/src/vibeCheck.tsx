import { useState } from 'react';
import { translate } from './i18n';
import { Glyph } from './icons';
import { vibeInfo, tryVibrateApi, tryIosHaptic } from './beep';

// "Titrashni tekshirish" oynasi.
//
// Titrash ishlamasa sababini uzoqdan topib bo'lmaydi: brauzer,
// qurilma va tizim sozlamalari qo'shilib turli natija beradi. Shuning
// uchun qurilmaning o'zi javob bersin — bu yerda nima borligi yozilib,
// har bir yo'lni alohida bosib ko'rish mumkin.
//
// Sinov tugmalari sozlamadan qat'i nazar ishlaydi: maqsad — qurilma
// nimaga qodirligini bilish, sozlama to'g'ri qo'yilganini emas.

type Result = 'ok' | 'rejected' | 'none' | null;

export function VibeCheckSheet({ onClose }: { onClose: () => void }) {
  const t = translate;
  const info = vibeInfo();
  const [api, setApi] = useState<Result>(null);
  const [ios, setIos] = useState<Result>(null);

  const mark = (r: Result) =>
    r === 'ok' ? (
      <Glyph name="check" size={16} color="var(--green)" />
    ) : r === null ? null : (
      <Glyph name="close" size={16} color="var(--red)" />
    );

  const rows: [string, string][] = [
    [t('vibeRowBrowser'), info.browser],
    [t('vibeRowApi'), info.hasApi ? t('vibeYes') : t('vibeNo')],
    [t('vibeRowTouch'), String(info.touchPoints)],
    [t('vibeRowSwitch'), info.hasSwitch ? t('vibeYes') : t('vibeNo')],
    [t('vibeRowInstalled'), info.standalone ? t('vibeYes') : t('vibeNo')],
    [t('vibeRowSecure'), info.secure ? t('vibeYes') : t('vibeNo')],
  ];

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">{t('vibeCheckTitle')}</div>
        <div className="sheet-sub">{t('vibeCheckHint')}</div>

        <div className="list-group" style={{ marginTop: 12 }}>
          {rows.map(([k, v]) => (
            <div className="list-item" key={k}>
              <div className="name" style={{ fontWeight: 500 }}>{k}</div>
              <div className="amount" style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>

        <div className="section-title">{t('vibeTryTitle')}</div>
        <div className="list-group">
          <button
            className="list-item"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => {
              // Uzun turtki — "sezdimmi yoki yo'qmi" degan shubha qolmasin
              const r = tryVibrateApi(600);
              setApi(r === null ? 'none' : r ? 'ok' : 'rejected');
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="name">{t('vibeTryApi')}</div>
              <div className="sub">
                {api === null
                  ? t('vibeTryApiSub')
                  : api === 'none'
                    ? t('vibeResNone')
                    : api === 'rejected'
                      ? t('vibeResRejected')
                      : t('vibeResSent')}
              </div>
            </div>
            {mark(api)}
          </button>

          <button
            className="list-item"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => setIos(tryIosHaptic() ? 'ok' : 'none')}
          >
            <div style={{ minWidth: 0 }}>
              <div className="name">{t('vibeTryIos')}</div>
              <div className="sub">
                {ios === null ? t('vibeTryIosSub') : ios === 'none' ? t('vibeResNone') : t('vibeResSent')}
              </div>
            </div>
            {mark(ios)}
          </button>
        </div>

        <div className="hint">{t('vibeCheckFoot')}</div>

        <button className="btn-ghost" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </div>
  );
}
