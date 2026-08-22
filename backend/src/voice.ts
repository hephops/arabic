// Ovozli matnni qarz yozuviga aylantirish.
// DEV: qoidaga asoslangan parser. PROD: STT (Mohir.ai) + LLM (Claude API) —
// bu parser fallback bo'lib qoladi (internet/API ishlamasa).

import { uzDayShift, uzWeekday, uzParts } from './tz.js';

export interface ParsedDebt {
  customer_name: string;
  amount: number;
  due_date: string | null;
  note: string | null;
  raw: string;
}

const WEEKDAYS: Record<string, number> = {
  dushanba: 1, seshanba: 2, chorshanba: 3, payshanba: 4, juma: 5, shanba: 6, yakshanba: 0,
};

// Muddat hisoblari Toshkent kuni bo'yicha: server UTC'da tursa ham
// "ertaga" do'konchining ertasi bo'lishi kerak
function nextWeekday(target: number): string {
  let diff = (target - uzWeekday() + 7) % 7;
  if (diff === 0) diff = 7;
  return uzDayShift(diff);
}

const addDays = (days: number) => uzDayShift(days);

export function parseDebtText(text: string): ParsedDebt | null {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // --- Summa ---
  // "2 million 300 ming" kabi qo'shma summalar qo'shib hisoblanadi:
  // avval million qismi, keyin undan keyingi matndagi "ming" qismi.
  let amount = 0;
  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const millionMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(million|mln|милли?он)/);
  if (millionMatch) amount += Math.round(num(millionMatch[1]) * 1_000_000);
  const afterMillion = millionMatch
    ? lower.slice((millionMatch.index ?? 0) + millionMatch[0].length)
    : lower;
  const thousandMatch = afterMillion.match(/(\d+(?:[.,]\d+)?)\s*(ming|минг|тыс)/);
  if (thousandMatch) amount += Math.round(num(thousandMatch[1]) * 1_000);
  if (!amount) {
    // Telefon raqami summa bo'lib o'qilmasin.
    //
    // Naqsh ochko'z: "Karimga 998 90 123 45 67 raqamiga 50 ming" degan
    // matnda raqam bo'lagini butunlay yutib, 99890123456700 so'mlik
    // qarz yozib qo'yardi. Shuning uchun avval telefonga o'xshash
    // bo'laklar olib tashlanadi: +998..., 998 bilan boshlanadigan
    // uzun raqam va 7 xonadan uzun bo'laklar.
    const tozalangan = lower
      .replace(/\s/g, ' ')
      .replace(/\+?998[\d\s-]{7,}/g, ' ')
      .replace(/\b\d(?:[\d\s-]*\d){7,}\b/g, ' ');
    // Avval "so'm" bilan aytilganini qidiramiz — u aniq summa
    const withUnit = tozalangan.match(/(\d[\d\s]{2,})\s*(so'm|сум|som)/);
    const plainMatch = withUnit ?? tozalangan.match(/(\d[\d\s]{3,})/);
    if (plainMatch) amount = parseInt(plainMatch[1].replace(/\s/g, ''), 10);
  }
  if (!amount || amount <= 0) return null;

  // --- Muddat ---
  let due: string | null = null;
  for (const [day, num] of Object.entries(WEEKDAYS)) {
    if (lower.includes(day)) { due = nextWeekday(num); break; }
  }
  if (!due) {
    const inDays = lower.match(/(\d+)\s*kun/);
    const inWeeks = lower.match(/(\d+)\s*hafta/);
    const dayOfMonth = lower.match(/oyning\s+(\d+)/);
    if (inDays) due = addDays(parseInt(inDays[1], 10));
    else if (inWeeks) due = addDays(parseInt(inWeeks[1], 10) * 7);
    else if (lower.includes('bir hafta') || lower.includes('haftagacha')) due = addDays(7);
    else if (lower.includes('oyning oxiri') || lower.includes('oy oxiri')) {
      const { year, month } = uzParts();
      due = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    } else if (dayOfMonth) {
      const { year, month, day } = uzParts();
      const target = parseInt(dayOfMonth[1], 10);
      due = new Date(Date.UTC(year, day >= target ? month + 1 : month, target)).toISOString().slice(0, 10);
    } else if (lower.includes('ertaga')) due = addDays(1);
  }

  // --- Ism: birinchi so'zlar (summagacha bo'lgan qism), "ga/aka/opa" qo'shimchalari bilan ---
  const beforeAmount = raw.split(/\d/)[0].trim();
  let name = beforeAmount
    .replace(/(ga|га)\s*$/i, '')
    .replace(/\b(qarz|berdim|oldi|uchun)\b/gi, '')
    .trim();
  // Ism summadan keyin aytilgan bo'lsa ("1 million Ali akaga") — matndan
  // raqam va o'lchov so'zlarini olib tashlab, qolganini ism deb olamiz
  if (!name) {
    name = raw
      .replace(/\d+(?:[.,]\d+)?\s*(million|mln|милли?он|ming|минг|тыс|so'?m|сум|som)?/gi, ' ')
      .replace(/\b(qarz|berdim|oldi|uchun|gacha)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/(ga|га)\s*$/i, '')
      .trim();
  }
  if (!name) return null;
  // "Karimga" -> "Karim"
  if (/[a-zа-я]ga$/i.test(name.split(' ')[0]) && name.split(' ').length === 1) {
    name = name.replace(/ga$/i, '');
  }

  // --- Izoh: "lik/so'mlik" dan keyingi mahsulot nomi ---
  const noteMatch = lower.match(/(?:so'?mlik|сумлик|lik)\s+([a-zа-яo'ʻ\s]+?)(?:\s+berdim|\s+oldi|$)/);
  const note = noteMatch ? noteMatch[1].trim() : null;

  return { customer_name: name, amount, due_date: due, note, raw };
}

/* ═══════════ Ovoz bilan savatga qo'shish ═══════════ */

// "Uch dona non, bitta sut, ikki kilo shakar" — shu gapni savatga
// aylantiramiz.
//
// Nega qoidaga asoslangan parser: gap tuzilishi juda oddiy va bir xil
// (miqdor + o'lchov + tovar nomi), shuning uchun bu yerda LLM ortiqcha.
// Eng qiyin joyi tahlil emas — tovar nomini do'kondagi haqiqiy nom
// bilan solishtirish, chunki ovoz tanish "kola" ni "cola", "qola" deb
// ham yozib beradi.

/** O'zbekcha sanoq sonlar (ovozdan matn ko'pincha so'z bilan keladi) */
const UZ_NUMBERS: Record<string, number> = {
  yarim: 0.5, bir: 1, bitta: 1, ikki: 2, ikkita: 2, uch: 3, uchta: 3,
  "to'rt": 4, "to'rtta": 4, tort: 4, tortta: 4, besh: 5, beshta: 5,
  olti: 6, oltita: 6, yetti: 7, yettita: 7, etti: 7,
  sakkiz: 8, sakkizta: 8, "to'qqiz": 9, "to'qqizta": 9, toqqiz: 9,
  "o'n": 10, on: 10, "o'nta": 10, onta: 10,
  yigirma: 20, "o'ttiz": 30, ottiz: 30, qirq: 40, ellik: 50,
  oltmish: 60, yetmish: 70, sakson: 80, "to'qson": 90, toqson: 90, yuz: 100,
  // ruscha — ovoz tanish ruscha rejimda ishlaganda keladi
  один: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6,
  семь: 7, восемь: 8, девять: 9, десять: 10, полкило: 0.5,
};

/** O'lchov so'zlari — bular tovar nomiga kirmaydi */
const UNIT_WORDS = new Set([
  'dona', 'ta', 'kg', 'kilo', 'kilogramm', 'kilogram', 'gramm', 'gram', 'gr',
  'litr', 'l', 'quti', 'blok', 'paket', 'yashik', 'dasta', 'shtuk', 'штук',
  'кг', 'кило', 'литр', 'грамм', 'пачка', 'упаковка',
]);

/** Tahlilga aralashmaydigan yordamchi so'zlar */
const FILLER_WORDS = new Set([
  'va', 'ham', 'yana', 'keyin', 'bitta', 'ol', 'oling', 'qo', 'qosh',
  "qo'sh", 'bering', 'ber', 'и', 'ещё', 'еще', 'плюс',
]);

/** Solishtirish uchun soddalashtirish: harflarni bir xil ko'rinishga keltiramiz */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ʻʼ'`’]/g, '')
    .replace(/ц/g, 's').replace(/ч/g, 'ch').replace(/ш/g, 'sh')
    .replace(/қ/g, 'q').replace(/ғ/g, 'g').replace(/ҳ/g, 'h')
    .replace(/[^a-zа-я0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ikki so'z orasidagi tahrirlash masofasi (Levenshtein) */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export interface CartCandidate {
  id: number;
  name: string;
  unit: string;
  sell_price: number;
  discount_percent?: number;
}

export interface ParsedCartLine {
  /** aytilgan matn bo'lagi */
  said: string;
  qty: number;
  /** topilgan tovar (topilmasa null) */
  product: CartCandidate | null;
  /** moslik ishonchi: 1 — aniq, 0.5 — taxminiy */
  score: number;
}

/**
 * Tovar nomini do'kondagi ro'yxat bilan solishtiradi.
 *
 * Uch bosqich: aniq moslik -> nom ichida uchrashi -> harf xatolariga
 * chidamli taqqoslash. Oxirgisi kerak, chunki ovoz tanish "kola" ni
 * "cola", "shakar" ni "shakat" deb yozib berishi odatiy hol.
 */
export function matchProduct(said: string, products: CartCandidate[]): { product: CartCandidate | null; score: number } {
  const q = normalizeName(said);
  if (!q) return { product: null, score: 0 };

  let best: { product: CartCandidate | null; score: number } = { product: null, score: 0 };
  for (const p of products) {
    const name = normalizeName(p.name);
    if (!name) continue;

    let score = 0;
    if (name === q) score = 1;
    else if (name.startsWith(q) || q.startsWith(name)) score = 0.92;
    else if (name.includes(q) || q.includes(name)) score = 0.85;
    else {
      // So'zma-so'z: aytilgan har bir so'z nomda bormi
      const qWords = q.split(' ').filter((w) => w.length > 2);
      const nWords = name.split(' ');
      if (qWords.length) {
        const hits = qWords.filter((w) => nWords.some((n) => n === w || editDistance(n, w) <= 1)).length;
        if (hits) score = 0.6 * (hits / qWords.length);
      }
      // Butun nom bo'yicha harf xatolariga chidamli taqqoslash
      const dist = editDistance(name, q);
      const tolerance = Math.max(1, Math.floor(Math.max(name.length, q.length) / 4));
      if (dist <= tolerance) score = Math.max(score, 0.8 - dist * 0.05);
    }
    if (score > best.score) best = { product: p, score };
  }
  // Juda past moslik — "topilmadi" deganimiz to'g'riroq, aks holda
  // butunlay boshqa tovar savatga tushib ketadi
  return best.score >= 0.5 ? best : { product: null, score: best.score };
}

/** Miqdorni so'z yoki raqamdan o'qish */
function readQty(words: string[]): { qty: number; used: number } {
  let qty = 0;
  let used = 0;
  for (const w of words) {
    const digits = w.replace(',', '.').match(/^(\d+(?:\.\d+)?)$/);
    if (digits) {
      qty += parseFloat(digits[1]);
      used++;
      continue;
    }
    // "3ta", "2kg" kabi yopishib kelgan shakl
    const glued = w.match(/^(\d+(?:[.,]\d+)?)([a-zа-я']+)$/);
    if (glued) {
      qty += parseFloat(glued[1].replace(',', '.'));
      used++;
      continue;
    }
    const num = UZ_NUMBERS[w];
    if (num !== undefined) {
      // "o'n besh" -> 15, "ikki yuz" -> 200
      if (qty >= 10 && num < 10) qty += num;
      else if (num === 100 && qty > 0) qty *= 100;
      else qty += num;
      used++;
      continue;
    }
    break;
  }
  return { qty, used };
}

/**
 * Gapni savat satrlariga ajratadi.
 *
 * Ajratgichlar: vergul, "va", "yana". Har bo'lakda avval miqdor
 * (so'z yoki raqam), keyin o'lchov, qolgani — tovar nomi.
 */
export function parseCartText(text: string, products: CartCandidate[]): ParsedCartLine[] {
  const raw = (text ?? '').trim();
  if (!raw) return [];

  const chunks = raw
    .split(/[,;]|\bva\b|\byana\b|\bи\b|\bещ[её]\b/gi)
    .map((c) => c.trim())
    .filter(Boolean);

  const lines: ParsedCartLine[] = [];
  for (const chunk of chunks) {
    const words = normalizeName(chunk).split(' ').filter(Boolean);
    if (!words.length) continue;

    const { qty, used } = readQty(words);
    let rest = words.slice(used);
    // O'lchov so'zlarini olib tashlaymiz ("uch dona non" -> "non")
    rest = rest.filter((w) => !UNIT_WORDS.has(w) && !FILLER_WORDS.has(w));
    // "3ta non" — miqdor va o'lchov yopishgan bo'lsa birinchi so'zdan
    // o'lchov qismini ham tozalaymiz
    if (!rest.length && used === 0) continue;

    const said = rest.join(' ');
    if (!said) continue;

    const { product, score } = matchProduct(said, products);
    lines.push({ said, qty: qty > 0 ? qty : 1, product, score });
  }
  return lines;
}
