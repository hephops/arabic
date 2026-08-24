import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';

/* ─────────── Oq ekranning oldini olish ───────────
 *
 * React'da chizish paytida xato chiqsa, u BUTUN daraxtni yechib
 * tashlaydi: ekran butunlay oqarib qoladi, hech qanday yozuv yo'q va
 * odam nima bo'lganini bilmaydi — menyuga ham qaytolmaydi.
 *
 * Shu chegara xatoni ushlab qoladi: yon menyu joyida qoladi, faqat
 * ochilgan bo'lim o'rnida xato matni ko'rinadi.
 */

/**
 * Xato DOM'ga TASHQARIDAN aralashuvdan chiqqanmi.
 *
 * Brauzerning avtomatik tarjimasi (yoki DOM'ni o'zgartiradigan
 * kengaytma) sahifadagi matn tugunlarini <font> ichiga o'rab qo'yadi.
 * React esa o'zi qo'ygan tugunni qidiradi va topolmaydi:
 *   "Failed to execute 'removeChild' on 'Node': The node to be
 *    removed is not a child of this node."
 * Bu ilovaning xatosi emas — daraxtni qaytadan chizish bilan
 * tuzaladi, shuning uchun bir marta o'zimiz jimgina qayta urinamiz.
 */
function domAralashuvi(xato: unknown): boolean {
  const m = String((xato as Error)?.message ?? xato);
  return (
    /removeChild|insertBefore|appendChild/.test(m) &&
    /not a child|NotFoundError|Node/.test(m)
  );
}

type Props = { children: ReactNode };
type State = { xato: Error | null; stack: string; urinish: number };

/** Avtomatik qayta chizish soni — sikl bo'lib ketmasin */
const QAYTA = 1;

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { xato: null, stack: '', urinish: 0 };

  static getDerivedStateFromError(xato: Error): Pick<State, 'xato'> {
    return { xato };
  }

  componentDidCatch(xato: Error, info: ErrorInfo) {
    // Konsolda to'liq holicha qoladi — brauzer konsolidan ko'chirish uchun
    console.error('[admin] sahifa xatosi:', xato, info.componentStack);

    // Tashqi aralashuv bo'lsa — kartochka ko'rsatmasdan qaytadan chizamiz.
    // `urinish` o'zgargani uchun bolalar yangi kalit bilan mount bo'ladi,
    // ya'ni DOM noldan yasaladi va buzilgan tugunlar qolmaydi.
    if (domAralashuvi(xato) && this.state.urinish < QAYTA) {
      this.setState((s) => ({ xato: null, stack: '', urinish: s.urinish + 1 }));
      return;
    }

    this.setState({
      stack: (info.componentStack ?? '').split('\n').filter(Boolean).slice(0, 5).join('\n'),
    });
  }

  render() {
    const { xato, stack, urinish } = this.state;
    // Kalit o'zgarsa React eski daraxtni tashlab, DOM'ni qaytadan
    // yasaydi. Fragment ishlatilgan — qo'shimcha <div> qo'shilsa
    // sahifaning tashqi ko'rinishi o'zgarib ketardi.
    if (!xato) return <Fragment key={urinish}>{this.props.children}</Fragment>;
    const tarjima = domAralashuvi(xato);
    return (
      <div className="panel crash">
        <h3>Bo'lim ochilmadi</h3>
        <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          {tarjima ? (
            <>
              Brauzer shu sahifani <b>tarjima qilyapti</b> (yoki biror kengaytma sahifaga
              aralashyapti) — shundan ilova chizishga ulgurmay to'xtab qoldi. Brauzer
              manzil qatoridagi tarjima belgisini bosib <b>«Tarjima qilinmasin»</b> ni
              tanlang, so'ng sahifani yangilang.
            </>
          ) : (
            <>
              Ilovada xatolik chiqdi. Boshqa bo'limlar ishlayapti — chapdagi menyudan
              birortasini tanlashingiz mumkin. Quyidagi matnni suratga olib yuboring,
              xato shu bo'yicha tuzatiladi.
            </>
          )}
        </div>
        <pre className="crash-text">{xato.message || String(xato)}{stack ? `\n${stack}` : ''}</pre>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => this.setState({ xato: null, stack: '', urinish: 0 })}>
            Qaytadan urinish
          </button>
          <button className="btn ghost" onClick={() => location.reload()}>
            Sahifani yangilash
          </button>
        </div>
      </div>
    );
  }
}
