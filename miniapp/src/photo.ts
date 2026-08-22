// Suratni yuborishdan oldin kichraytirish — AI kartasi ham, to'lov
// cheki ham shu yerdan foydalanadi. Ikki nusxada yursa, iPhone uchun
// yozilgan himoyalar bittasida qolib ketardi.

/**
 * Suratni yuborishdan oldin kichraytirish.
 *
 * Telefon kamerasi 12 megapikselli surat beradi. Uni shundoq
 * yuborish uch joyda zarar: tarmoqda sekin, modelda qimmat
 * (rasm token bilan hisoblanadi), serverda esa chegaradan oshadi.
 *
 * IPHONE MUAMMOSI: iOS Safari'da canvas maydoni cheklangan. 12 MP
 * surat (4032x3024) o'sha chegaradan oshadi va toDataURL bo'sh
 * yoki qora rasm qaytaradi — do'konchi esa "yubordim" deb o'ylab
 * turaveradi. Shuning uchun:
 *   - avval createImageBitmap sinaladi (u kattaroq rasmni ham
 *     eplaydi va HEIC ni ham ochadi);
 *   - piksel soni ~2 megapikseldan oshmaydi;
 *   - natija TEKSHIRILADI: haqiqiy JPEG chiqmasa xato beriladi,
 *     jimgina buzuq rasm yuborilmaydi.
 */
export async function shrink(file: File): Promise<string> {
  const MAX_SIDE = 1280;
  const MAX_PIXELS = 2_200_000; // iOS canvas chegarasidan xavfsiz pastda

  let src: ImageBitmap | HTMLImageElement | null = null;
  let url = '';
  try {
    if (typeof createImageBitmap === 'function') {
      src = await createImageBitmap(file);
    }
  } catch {
    /* eplamasa quyida <img> orqali sinaymiz */
  }
  if (!src) {
    url = URL.createObjectURL(file);
    src = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('decode'));
      im.src = url;
    });
  }

  try {
    const iw = (src as any).width as number;
    const ih = (src as any).height as number;
    if (!iw || !ih) throw new Error('empty');

    let scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    if (iw * ih * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (iw * ih));

    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('ctx');
    // Oq fon: shaffof PNG jpeg ga aylanganda qora bo'lib qolmasin
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src as any, 0, 0, w, h);

    const out = c.toDataURL('image/jpeg', 0.78);
    // TEKSHIRUV: iOS chegaradan oshsa "data:," qaytaradi
    if (!out.startsWith('data:image/jpeg;base64,') || out.length < 2000) {
      throw new Error('canvas');
    }
    return out;
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (typeof (src as any)?.close === 'function') (src as any).close();
  }
}

