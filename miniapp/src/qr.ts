// QR kodni SVG qilib chizish.
//
// Zargarlik birkasida shtrix-kod emas, QR turadi: birka juda tor
// (bir barmoq eni), chiziqli kod esa u yerga sig'maydi. QR yana
// qulay — telefonning kamerasi ham o'qiy oladi.
//
// Kutubxona allaqachon loyihada bor (@zxing/library skanerda
// ishlatiladi), shuning uchun yangi bog'liqlik qo'shilmaydi.

import { QRCodeWriter, BarcodeFormat, EncodeHintType } from '@zxing/library';

/**
 * Kodni QR SVG qilib qaytaradi. Bo'sh yoki chizib bo'lmasa — null.
 *
 * `size` — bitta modul (qora katakcha) necha piksel. Chop etishda
 * mayda bo'lib qolmasligi uchun 2 dan kam qilinmaydi.
 */
export function qrSvg(text: string, opts: { module?: number; quiet?: number } = {}): string | null {
  const value = String(text ?? '').trim();
  if (!value) return null;
  const module = Math.max(2, Math.round(opts.module ?? 3));
  // Tinch chegara: QR atrofidagi oq joy. Busiz o'qish sezilarli
  // yomonlashadi, ayniqsa yorliq qirqilganda.
  const quiet = opts.quiet ?? 2;

  try {
    const hints = new Map<EncodeHintType, unknown>();
    hints.set(EncodeHintType.MARGIN, 0);
    // O'lchamni kutubxona o'zi tanlasin: 0 berilsa eng kichik mos
    // versiyani oladi va biz uni modul bo'yicha kattalashtiramiz.
    const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, hints as any);
    const w = matrix.getWidth();
    const h = matrix.getHeight();
    const side = (w + quiet * 2) * module;

    let path = '';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (matrix.get(x, y)) {
          path += `M${(x + quiet) * module} ${(y + quiet) * module}h${module}v${module}h-${module}z`;
        }
      }
    }
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">` +
      `<rect width="${side}" height="${side}" fill="#fff"/>` +
      `<path d="${path}" fill="#000"/>` +
      `</svg>`
    );
  } catch {
    // Juda uzun matn yoki qo'llab-quvvatlanmagan belgi — yorliq
    // baribir chiqsin, faqat QR siz
    return null;
  }
}
