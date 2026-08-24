import { Component, type ErrorInfo, type ReactNode } from 'react';

/* Oq ekranning oldini olish.
 *
 * React chizish paytida xato chiqsa butun daraxtni yechib tashlaydi —
 * do'konchi savdo o'rtasida bo'm-bo'sh oq ekranni ko'radi va nima
 * qilishni bilmaydi. Shu chegara xatoni ushlab, tushunarli yozuv va
 * "Qayta yuklash" tugmasini ko'rsatadi.
 *
 * Til tanlash konteksti ishlamay qolgan bo'lishi ham mumkin, shuning
 * uchun matn shu yerda — to'g'ridan-to'g'ri localStorage'dagi tildan. */

const MATN = {
  uz: {
    sarlavha: 'Ilovada xatolik',
    izoh: 'Ilovani qayta yuklang. Xato takrorlansa quyidagi yozuvni suratga olib yuboring.',
    tugma: 'Qayta yuklash',
  },
  uz_cyrl: {
    sarlavha: 'Иловада хатолик',
    izoh: 'Иловани қайта юкланг. Хато такрорланса қуйидаги ёзувни суратга олиб юборинг.',
    tugma: 'Қайта юклаш',
  },
  ru: {
    sarlavha: 'Ошибка в приложении',
    izoh: 'Перезагрузите приложение. Если ошибка повторится — пришлите фото текста ниже.',
    tugma: 'Перезагрузить',
  },
} as const;

type Props = { children: ReactNode };
type State = { xato: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { xato: null };

  static getDerivedStateFromError(xato: Error): State {
    return { xato };
  }

  componentDidCatch(xato: Error, info: ErrorInfo) {
    console.error('[ilova] xato:', xato, info.componentStack);
  }

  render() {
    if (!this.state.xato) return this.props.children;
    const lang = (localStorage.getItem('lang') ?? 'uz') as keyof typeof MATN;
    const t = MATN[lang] ?? MATN.uz;
    return (
      <div className="crash-page">
        <h2>{t.sarlavha}</h2>
        <p>{t.izoh}</p>
        <pre className="crash-text">{this.state.xato.message || String(this.state.xato)}</pre>
        <button className="btn" onClick={() => location.reload()}>{t.tugma}</button>
      </div>
    );
  }
}
