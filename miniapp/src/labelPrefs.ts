// Yorliq chop etish sozlamalari — do'konchi bir marta tanlaydi.
//
// Ikkovi ham qurilmada saqlanadi: do'konchi har safar bir xil narsani
// qayta tanlab o'tirmasin. Serverga yuborilmaydi — bu shu qurilmadagi
// printerga bog'liq odat, do'konning ma'lumoti emas.

const KEY_SON = 'label_count';
const KEY_NARX = 'label_price';

/** Bir bosishda nechta yorliq chiqadi.
 *
 *  Standart — BITTA. Ilgari 8 ta edi: do'konchi bitta tovarga yorliq
 *  chiqarmoqchi bo'lsa ham printerdan sakkiztasi chiqib, qog'oz
 *  behuda ketardi. Ko'p kerak bo'lsa o'zi tanlaydi. */
export function labelCount(): number {
  try {
    const n = Number(localStorage.getItem(KEY_SON));
    return Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : 1;
  } catch {
    return 1;
  }
}

export function setLabelCount(n: number): void {
  try {
    localStorage.setItem(KEY_SON, String(Math.max(1, Math.min(100, Math.round(n)))));
  } catch {
    /* localStorage yopiq bo'lishi mumkin */
  }
}

/** Yorliqda narx yozilsinmi.
 *
 *  Standart — YO'Q. Narx tez-tez o'zgaradi, yorliq esa tovarda qolib
 *  ketadi: eski narxli yorliq kassada nizoga sabab bo'ladi. Kerak
 *  bo'lgan do'kon o'zi yoqib qo'yadi. */
export function labelPrice(): boolean {
  try {
    return localStorage.getItem(KEY_NARX) === '1';
  } catch {
    return false;
  }
}

export function setLabelPrice(on: boolean): void {
  try {
    localStorage.setItem(KEY_NARX, on ? '1' : '0');
  } catch {
    /* localStorage yopiq bo'lishi mumkin */
  }
}
