/**
 * Modelga bir vaqtda ketadigan so'rovlar darvozasi.
 *
 * Nega kerak: bitta savol modelda 5-20 soniya turadi. Yuz do'konchi
 * bir vaqtda so'rasa, yuzta so'rov birdan Anthropic'ga ketadi va ikki
 * tomondan ham yiqiladi — API tezlik chegarasiga urilib 429 qaytaradi,
 * server esa yuzta ochiq ulanishni ushlab turadi. Ikkalasining natijasi
 * bir xil: do'konchi sababsiz xato ko'radi.
 *
 * Shuning uchun bir vaqtda faqat MAX ta so'rov o'tadi, qolgani navbatda
 * kutadi. Navbat ham cheksiz emas: WAIT_MS dan ortiq kutish kassada
 * turgan odam uchun ma'nosiz, unga darrov "hozir band" deb aytgan
 * halolroq.
 */

/** Bir vaqtda modelga ketadigan so'rovlar soni */
const MAX = Number(process.env.AI_CONCURRENCY) || 12;
/** Navbatda kutishning eng uzun muddati */
const WAIT_MS = Number(process.env.AI_QUEUE_WAIT_MS) || 20_000;
/** Navbatning uzunligi — bundan oshsa umuman kutdirilmaydi */
const QUEUE_MAX = Number(process.env.AI_QUEUE_MAX) || 60;

let running = 0;
const waiting: { ok: () => void; fail: (e: Error) => void; timer: NodeJS.Timeout }[] = [];

export class BusyError extends Error {
  code = 'ai_busy';
  constructor() {
    super('band');
  }
}

/** Hozirgi holat — admin panelida ko'rsatish uchun */
export function gateState() {
  return { running, waiting: waiting.length, max: MAX };
}

function release() {
  const next = waiting.shift();
  if (next) {
    clearTimeout(next.timer);
    next.ok();
    return;
  }
  running--;
}

/**
 * Darvozadan o'tib ish bajarish. O'rin bo'shamasa navbatda kutadi,
 * juda uzoq kutish kerak bo'lsa BusyError beradi.
 */
export async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (running < MAX) {
    running++;
  } else {
    if (waiting.length >= QUEUE_MAX) throw new BusyError();
    await new Promise<void>((ok, fail) => {
      const timer = setTimeout(() => {
        // O'zini navbatdan olib tashlaydi, aks holda o'rin bo'shaganda
        // allaqachon voz kechgan so'rovga berilib, bekorga sarflanardi
        const i = waiting.findIndex((w) => w.timer === timer);
        if (i >= 0) waiting.splice(i, 1);
        fail(new BusyError());
      }, WAIT_MS);
      waiting.push({ ok, fail, timer });
    });
    // O'rin release() dan meros qoldi: running kamaymagan, shuning
    // uchun bu yerda oshirilmaydi ham
  }
  try {
    return await fn();
  } finally {
    release();
  }
}
