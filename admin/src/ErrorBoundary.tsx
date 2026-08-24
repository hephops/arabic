import { Component, type ErrorInfo, type ReactNode } from 'react';

/* ─────────── Oq ekranning oldini olish ───────────
 *
 * React'da chizish paytida xato chiqsa, u BUTUN daraxtni yechib
 * tashlaydi: ekran butunlay oqarib qoladi, hech qanday yozuv yo'q va
 * odam nima bo'lganini bilmaydi — menyuga ham qaytolmaydi.
 *
 * Shu chegara xatoni ushlab qoladi: yon menyu joyida qoladi, faqat
 * ochilgan bo'lim o'rnida xato matni ko'rinadi. Matn ataylab yashirilmaydi
 * — aynan o'sha satr xatoni topishga yordam beradi.
 */

type Props = { children: ReactNode };
type State = { xato: Error | null; stack: string };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { xato: null, stack: '' };

  static getDerivedStateFromError(xato: Error): State {
    return { xato, stack: '' };
  }

  componentDidCatch(xato: Error, info: ErrorInfo) {
    // Konsolda to'liq holicha qoladi — brauzer konsolidan ko'chirish uchun
    console.error('[admin] sahifa xatosi:', xato, info.componentStack);
    this.setState({
      stack: (info.componentStack ?? '').split('\n').filter(Boolean).slice(0, 5).join('\n'),
    });
  }

  render() {
    const { xato, stack } = this.state;
    if (!xato) return this.props.children;
    return (
      <div className="panel crash">
        <h3>Bo'lim ochilmadi</h3>
        <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Ilovada xatolik chiqdi. Boshqa bo'limlar ishlayapti — chapdagi menyudan
          birortasini tanlashingiz mumkin. Quyidagi matnni suratga olib yuboring,
          xato shu bo'yicha tuzatiladi.
        </div>
        <pre className="crash-text">{xato.message || String(xato)}{stack ? `\n${stack}` : ''}</pre>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => this.setState({ xato: null, stack: '' })}>
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
