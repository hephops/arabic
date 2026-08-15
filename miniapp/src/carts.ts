import type { Product } from './api';

// Bir vaqtda bir nechta savat: har bir oluvchiga alohida savat.
// Birinchi mijozning savati yakunlanmasdan turib ikkinchisiniki ochiladi.
//
// Savatlar localStorage'da turadi — boshqa bo'limga o'tib qaytilsa ham,
// ilova yopilib ochilsa ham savat joyida qoladi (avval yo'qolib ketardi).

export interface CartLine {
  product: Product;
  qty: number;
}

export interface Cart {
  id: number;
  no: number;                 // ekranda ko'rinadigan tartib raqami
  name: string;               // bo'sh bo'lsa "Savat <no>" deb ko'rsatiladi
  lines: CartLine[];
  payment: 'cash' | 'card' | 'debt';
  customerName: string;
  customerPhone: string;
}

export const MAX_CARTS = 8;

const KEY = 'arabic.carts.v1';

let seq = 1;

export function newCart(no: number): Cart {
  return {
    id: Date.now() * 100 + (seq++ % 100),
    no,
    name: '',
    lines: [],
    payment: 'cash',
    customerName: '',
    customerPhone: '',
  };
}

export interface CartState {
  carts: Cart[];
  activeId: number;
}

export function emptyState(): CartState {
  const c = newCart(1);
  return { carts: [c], activeId: c.id };
}

export function loadCarts(): CartState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as CartState;
    if (!parsed?.carts?.length) return emptyState();
    // Buzilgan yozuvdan himoya: har bir savat kutilgan ko'rinishda bo'lsin
    const carts = parsed.carts
      .filter((c) => c && typeof c.id === 'number' && Array.isArray(c.lines))
      .map((c, i) => ({ ...c, no: c.no ?? i + 1, lines: c.lines.filter((l) => l?.product?.id) }));
    if (!carts.length) return emptyState();
    const activeId = carts.some((c) => c.id === parsed.activeId) ? parsed.activeId : carts[0].id;
    return { carts, activeId };
  } catch {
    return emptyState();
  }
}

// Savat o'zgarganini boshqa oynalarga (dock, yon menyu) bildiramiz
const CHANGED = 'arabic-carts-changed';

export function saveCarts(state: CartState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* joy yetmasa ham ilova ishlayveradi */
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Ichida mahsuloti bor savatlar soni — Kassa ikonkasidagi belgi uchun */
export function openCartCount(): number {
  return loadCarts().carts.filter((c) => c.lines.length > 0).length;
}

export function onCartsChanged(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

export function clearCarts() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* muhim emas */
  }
}

// Keyingi bo'sh tartib raqami: 1, 2, 3 ... (o'chirilganidan keyin bo'shlikni to'ldiradi)
export function nextNo(carts: Cart[]): number {
  for (let n = 1; n <= MAX_CARTS + 1; n++) if (!carts.some((c) => c.no === n)) return n;
  return carts.length + 1;
}

// Savat summasi chegirmani hisobga oladi — serverdagi hisob bilan bir xil,
// aks holda kassada bir narx, chekda boshqa narx chiqib qolardi.
export const linePrice = (p: { sell_price: number; discount_percent?: number }) => {
  const pct = Math.min(90, Math.max(0, Number(p.discount_percent) || 0));
  if (!pct) return p.sell_price;
  return Math.round((p.sell_price * (100 - pct)) / 100 / 100) * 100;
};
export const cartTotal = (c: Cart) => c.lines.reduce((s, l) => s + linePrice(l.product) * l.qty, 0);
export const cartQty = (c: Cart) => c.lines.reduce((s, l) => s + l.qty, 0);
