// Qidiruv uchun matnni bir ko'rinishga keltirish.
//
// O'zbekistonda bitta tovar uch xil yoziladi: "Coca-Cola 1.5L",
// "Кока-Кола 1,5 л", "coca cola 1500 ml". Do'konchi qaysi birini yozsa
// ham topilishi kerak.
//
// Shuning uchun har ikkala matn — qidirilayotgani ham, bazadagisi ham —
// shu yerdan o'tkaziladi va bir xil satrga aylanadi. Hech qanday sun'iy
// intellekt kerak emas, oddiy almashtirish yetadi.

/** Kirill -> lotin. Uzun ketma-ketliklar birinchi turadi. */
const CYRILLIC: [RegExp, string][] = [
  [/щ/g, 'sh'], [/ш/g, 'sh'], [/ч/g, 'ch'], [/ц/g, 's'],
  [/ю/g, 'yu'], [/я/g, 'ya'], [/ё/g, 'yo'], [/ж/g, 'j'],
  [/ъ/g, ''], [/ь/g, ''], [/э/g, 'e'], [/ы/g, 'i'],
  [/қ/g, 'q'], [/ғ/g, 'g'], [/ҳ/g, 'h'], [/ў/g, 'o'],
  [/а/g, 'a'], [/б/g, 'b'], [/в/g, 'v'], [/г/g, 'g'], [/д/g, 'd'],
  [/е/g, 'e'], [/з/g, 'z'], [/и/g, 'i'], [/й/g, 'y'], [/к/g, 'k'],
  [/л/g, 'l'], [/м/g, 'm'], [/н/g, 'n'], [/о/g, 'o'], [/п/g, 'p'],
  [/р/g, 'r'], [/с/g, 's'], [/т/g, 't'], [/у/g, 'u'], [/ф/g, 'f'],
  [/х/g, 'x'],
];

/**
 * O'lchov so'zlari bir ko'rinishga keltiriladi: "литр", "litr", "l"
 * hammasi "l" bo'ladi. Aks holda "1.5 l" va "1,5 litr" boshqa satr
 * bo'lib qolardi.
 */
const UNITS: [RegExp, string][] = [
  [/\b(litr|liter|litre)\b/g, 'l'],
  [/\b(millilitr|milliliter|ml)\b/g, 'ml'],
  [/\b(kilogramm|kilogram|kg)\b/g, 'kg'],
  [/\b(gramm|gram|gr|g)\b/g, 'g'],
  [/\b(dona|sht|shtuk|pcs)\b/g, 'dona'],
];

/**
 * Qidiruv kaliti. Bazada shu ko'rinishda saqlanadi va qidirilayotgan
 * matn ham shunga aylantiriladi.
 */
export function normalizeSearch(input: string | null | undefined): string {
  let s = (input ?? '').toLowerCase();

  // O'zbek apostroflarining hamma ko'rinishi — "o'" va "o" bir xil bo'lsin
  s = s.replace(/[ʻʼ'`’‘]/g, '');

  for (const [re, to] of CYRILLIC) s = s.replace(re, to);

  // Vergul o'rniga nuqta: "1,5" va "1.5" bir xil son
  s = s.replace(/(\d),(\d)/g, '$1.$2');

  // Harf va raqamdan boshqa hamma narsa bo'shliq
  s = s.replace(/[^a-z0-9.\s]/g, ' ');

  // Sondan keyin darhol kelgan o'lchov ajratiladi: "1.5l" -> "1.5 l"
  s = s.replace(/(\d)([a-z])/g, '$1 $2');

  s = s.replace(/\s+/g, ' ').trim();
  for (const [re, to] of UNITS) s = s.replace(re, to);

  // Ortiqcha nol: "1.50" -> "1.5", "2.0" -> "2"
  s = s.replace(/(\d+)\.(\d*?)0+\b/g, (_, a, b) => (b ? `${a}.${b}` : a));

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Tovarning to'liq qidiruv kaliti — nom, brend va hajm birga.
 * Do'konchi "kola 1.5" deb yozsa ham, "coca cola" deb yozsa ham topsin.
 */
export function productSearchKey(p: {
  name_uz?: string | null;
  name_ru?: string | null;
  brand?: string | null;
  volume_value?: number | null;
  volume_unit?: string | null;
}): string {
  const volume =
    p.volume_value != null && p.volume_unit ? `${p.volume_value} ${p.volume_unit}` : '';
  const parts = [p.name_uz, p.name_ru, p.brand, volume].filter(Boolean).join(' ');
  // Takroriy so'zlarni olib tashlaymiz — kalit qisqaroq va tozaroq bo'ladi
  const words = normalizeSearch(parts).split(' ');
  return [...new Set(words)].join(' ');
}

/**
 * Qidiruv so'rovini bo'laklarga ajratadi. Har bo'lak alohida
 * tekshiriladi: "kola 1.5" -> ["kola", "1.5"], ikkalasi ham kalitda
 * bo'lishi kerak. Shunda so'zlarning tartibi ahamiyatsiz bo'ladi.
 */
export function searchTerms(q: string): string[] {
  return normalizeSearch(q).split(' ').filter((w) => w.length > 0);
}
