// Ovozli matnni qarz yozuviga aylantirish.
// DEV: qoidaga asoslangan parser. PROD: STT (Mohir.ai) + LLM (Claude API) —
// bu parser fallback bo'lib qoladi (internet/API ishlamasa).

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

function nextWeekday(target: number): string {
  const d = new Date();
  let diff = (target - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
    const plainMatch = lower.replace(/\s/g, ' ').match(/(\d[\d\s]{3,})\s*(so'm|сум|som)?/);
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
      const d = new Date();
      due = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    } else if (dayOfMonth) {
      const d = new Date();
      const target = parseInt(dayOfMonth[1], 10);
      const month = d.getDate() >= target ? d.getMonth() + 1 : d.getMonth();
      due = new Date(d.getFullYear(), month, target).toISOString().slice(0, 10);
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
