// Telegram Mini App SDK bilan ishlash.
// Ilova Telegram ichida ochilsa — uning tugmalari, mavzusi va tebranishi ishlatiladi.
// Oddiy brauzerda ochilsa — hammasi jimgina o'tkazib yuboriladi.

interface TgWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: {
    text: string;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    setParams(p: { text?: string; color?: string; is_active?: boolean }): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  ready(): void;
  expand(): void;
  close(): void;
  openTelegramLink(url: string): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
}

export const tg: TgWebApp | undefined = (window as any).Telegram?.WebApp;
export const inTelegram = !!tg?.initData;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Ilova ranglariga moslaymiz (iOS oq dizayn)
  tg.setHeaderColor?.('#f9f9fb');
  tg.setBackgroundColor?.('#f2f2f7');
}

/* ── Orqaga tugmasi ── */

let backHandler: (() => void) | null = null;

export function setBackButton(handler: (() => void) | null) {
  if (!tg?.BackButton) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = handler;
  if (handler) {
    tg.BackButton.onClick(handler);
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

/* ── Asosiy tugma (pastdagi katta tugma) ── */

let mainHandler: (() => void) | null = null;

export function setMainButton(text: string | null, handler?: () => void, active = true) {
  if (!tg?.MainButton) return;
  if (mainHandler) tg.MainButton.offClick(mainHandler);
  mainHandler = null;
  if (!text) {
    tg.MainButton.hide();
    return;
  }
  tg.MainButton.setParams({ text, is_active: active });
  if (handler) {
    mainHandler = handler;
    tg.MainButton.onClick(handler);
  }
  tg.MainButton.show();
  if (active) tg.MainButton.enable();
  else tg.MainButton.disable();
}

/* ── Tebranish (haptic) ── */

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  success: () => tg?.HapticFeedback?.notificationOccurred('success'),
  error: () => tg?.HapticFeedback?.notificationOccurred('error'),
  select: () => tg?.HapticFeedback?.selectionChanged(),
};

export const initData = () => tg?.initData ?? '';
