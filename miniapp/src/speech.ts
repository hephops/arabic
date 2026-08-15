import { useEffect, useRef, useState } from 'react';
import { translate } from './i18n';
import { haptic } from './telegram';

// Brauzerning ovoz tanish imkoniyati (SpeechRecognition).
//
// DIQQAT — bu yerdagi eng muhim haqiqat: Chrome o'zbek tilini (uz-UZ)
// ishonchli qo'llab-quvvatlamaydi. Shuning uchun:
//   1. avval uz-UZ bilan urinamiz;
//   2. natija kelmasa yoki til qo'llab-quvvatlanmasa — ruscha rejimga
//      o'tamiz (ruscha tanish o'zbekcha so'zlarni ham taxminan yozadi,
//      keyingi tahlil xatolarga chidamli qilingan);
//   3. baribir ishlamasa — sabab aniq aytiladi va matn yozish qoladi.
// Matn yozish yo'li har doim ochiq turadi, chunki u har qanday
// qurilmada ishlaydi.

const SR: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    : null;

export const speechSupported = () => !!SR;

export interface SpeechState {
  listening: boolean;
  /** hali tugallanmagan, "eshitilyapti" matni */
  interim: string;
  error: string;
}

export function useSpeech(onFinal: (text: string) => void, lang: string) {
  const [state, setState] = useState<SpeechState>({ listening: false, interim: '', error: '' });
  const recRef = useRef<any>(null);
  // uz-UZ ishlamasa ruschaga o'tamiz — bir marta
  const triedFallback = useRef(false);

  useEffect(() => () => stop(), []);

  function stop() {
    try {
      recRef.current?.stop();
    } catch {
      /* allaqachon to'xtagan */
    }
    recRef.current = null;
    setState((s) => ({ ...s, listening: false, interim: '' }));
  }

  function start(forceLang?: string) {
    if (state.listening) return stop();
    if (!SR) {
      setState({ listening: false, interim: '', error: translate('noSpeechSupport') });
      return;
    }
    setState({ listening: true, interim: '', error: '' });

    const rec = new SR();
    rec.lang = forceLang ?? (lang === 'ru' ? 'ru-RU' : 'uz-UZ');
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setState((s) => ({ ...s, interim }));
      if (final.trim()) {
        stop();
        haptic.success();
        onFinal(final.trim());
      }
    };

    rec.onerror = (e: any) => {
      const kind = e?.error;
      // "language-not-supported" — aynan o'zbekcha uchun tez-tez uchraydi:
      // jimgina ruschaga o'tib qayta urinamiz
      if ((kind === 'language-not-supported' || kind === 'no-speech') && !triedFallback.current && rec.lang !== 'ru-RU') {
        triedFallback.current = true;
        stop();
        setTimeout(() => start('ru-RU'), 150);
        return;
      }
      setState({
        listening: false,
        interim: '',
        error:
          kind === 'not-allowed' || kind === 'service-not-allowed'
            ? translate('micDenied')
            : kind === 'network'
            ? translate('micNoNetwork')
            : kind === 'language-not-supported'
            ? translate('micNoLang')
            : translate('micNoResult'),
      });
      stop();
    };

    rec.onend = () => setState((s) => ({ ...s, listening: false }));

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setState({ listening: false, interim: '', error: translate('micNoResult') });
      stop();
    }
  }

  return { ...state, start, stop, supported: !!SR };
}
