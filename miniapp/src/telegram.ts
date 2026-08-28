// Telegram Mini App SDK bilan ishlash.
// Ilova Telegram ichida ochilsa — uning tugmalari, mavzusi va tebranishi ishlatiladi.
// Oddiy brauzerda ochilsa — hammasi jimgina o'tkazib yuboriladi.

import { App as CapApp } from '@capacitor/app';

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
  if (tg?.BackButton) {
    if (backHandler) tg.BackButton.offClick(backHandler);
    if (handler) {
      tg.BackButton.onClick(handler);
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  }
  // Telegram tashqarisida (native ilova) shu handler android'ning
  // apparat "orqaga" tugmasi uchun ham ishlatiladi — pastdagi
  // initNativeBackButton() ga qarang.
  backHandler = handler;
}

/**
 * Android'ning apparat "orqaga" tugmasi.
 *
 * Ekran ichida bo'lim ochiq bo'lsa (setBackButton bilan ro'yxatdan
 * o'tgan bo'lsa) — o'sha yopiladi. Aks holda ilova asosiy ekranda
 * turibdi, tugma ilovani chiqarib yuboradi (Telegram/brauzerda bu
 * hech narsa qilmaydi — faqat native ilovada ishlaydi).
 */
export function initNativeBackButton() {
  CapApp.addListener('backButton', () => {
    if (backHandler) backHandler();
    else CapApp.exitApp();
  });
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

/**
 * Botni ochish.
 *
 * Ilova Telegram ichida ochilgan bo'lsa — chat to'g'ridan-to'g'ri
 * Telegram ichida ochiladi (brauzer oynasi ochilmaydi). Oddiy
 * brauzerda esa havola Telegram ilovasiga o'tkazadi.
 *
 * Havolada `?start=...` bo'lgani uchun bot ochilishi bilan /start
 * o'zi yuboriladi va kod darhol keladi.
 */
export function openBot(url: string) {
  if (!url) return;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
