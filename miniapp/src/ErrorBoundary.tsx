import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';

/* Oq ekranning oldini olish.
 *
 * React chizish paytida xato chiqsa butun daraxtni yechib tashlaydi —
 * do'konchi savdo o'rtasida bo'm-bo'sh oq ekranni ko'radi va nima
 * qilishni bilmaydi. Shu chegara xatoni ushlab, tushunarli yozuv va
 * "Qayta yuklash" tugmasini ko'rsatadi.
 *
 * Til tanlash konteksti ishlamay qolgan bo'lishi ham mumkin, shuning
 * uchun matn shu yerda — to'g'ridan-to'g'ri localStorage'dagi tildan. */

/**
 * Xato DOM'ga TASHQARIDAN aralashuvdan chiqqanmi.
 *
 * Brauzerning avtomatik tarjimasi matn tugunlarini <font> ichiga o'rab
 * qo'yadi, React esa o'zi qo'ygan tugunni topolmay qoladi
 * ("removeChild ... not a child of this node"). Bu ilovaning xatosi
 * emas va qaytadan chizish bilan tuzaladi — shuning uchun bir marta
 * jimgina qayta urinamiz.
 */
function domAralashuvi(xato: unknown): boolean {
  const m = String((xato as Error)?.message ?? xato);
  return (
    /removeChild|insertBefore|appendChild/.test(m) && /not a child|NotFoundError|Node/.test(m)
  );
}

const MATN = {
  uz: {
    sarlavha: 'Ilovada xatolik',
    izoh: 'Ilovani qayta yuklang. Xato takrorlansa quyidagi yozuvni suratga olib yuboring.',
    tarjima:
      "Brauzer ilovani tarjima qilyapti — shundan ekran to'xtab qoldi. Tarjimani o'chiring va qayta yuklang.",
    tugma: 'Qayta yuklash',
  },
  uz_cyrl: {
    sarlavha: 'Иловада хатолик',
    izoh: 'Иловани қайта юкланг. Хато такрорланса қуйидаги ёзувни суратга олиб юборинг.',
    tarjima:
      'Браузер иловани таржима қиляпти — шундан экран тўхтаб қолди. Таржимани ўчиринг ва қайта юкланг.',
    tugma: 'Қайта юклаш',
  },
  ru: {
    sarlavha: 'Ошибка в приложении',
    izoh: 'Перезагрузите приложение. Если ошибка повторится — пришлите фото текста ниже.',
    tarjima:
      'Браузер переводит страницу — из-за этого приложение остановилось. Отключите перевод и перезагрузите.',
    tugma: 'Перезагрузить',
  },
} as const;

type Props = { children: ReactNode };
type State = { xato: Error | null; urinish: number };

/** Avtomatik qayta chizish soni — sikl bo'lib ketmasin */
const QAYTA = 1;

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { xato: null, urinish: 0 };

  static getDerivedStateFromError(xato: Error): Pick<State, 'xato'> {
    return { xato };
  }

  componentDidCatch(xato: Error, info: ErrorInfo) {
    console.error('[ilova] xato:', xato, info.componentStack);
    if (domAralashuvi(xato) && this.state.urinish < QAYTA) {
      this.setState((s) => ({ xato: null, urinish: s.urinish + 1 }));
    }
  }

  render() {
    const { xato, urinish } = this.state;
    // Kalit o'zgarsa React DOM'ni noldan yasaydi — buzilgan tugunlar qolmaydi
    if (!xato) return <Fragment key={urinish}>{this.props.children}</Fragment>;
    const lang = (localStorage.getItem('lang') ?? 'uz') as keyof typeof MATN;
    const t = MATN[lang] ?? MATN.uz;
    return (
      <div className="crash-page">
        <h2>{t.sarlavha}</h2>
        <p>{domAralashuvi(xato) ? t.tarjima : t.izoh}</p>
        <pre className="crash-text">{xato.message || String(xato)}</pre>
        <button className="btn" onClick={() => location.reload()}>{t.tugma}</button>
      </div>
    );
  }
}
