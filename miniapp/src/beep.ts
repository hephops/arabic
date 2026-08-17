// Skaner javobi: ovoz va titrash.
//
// Do'konchi kodni kameraga tutganda ekranga qaramaydi — qo'lida tovar,
// ko'zi mijozda. Haqiqiy skanerdagi "bip" shuning uchun bor: o'qildimi
// yo'qmi, quloq bilan biladi. Shu tuyg'uni kamera skaneriga ham beramiz.
//
// Ovoz fayldan emas, brauzerning o'zida hosil qilinadi (Web Audio).
// Sabab uchta: qo'shimcha yuklanadigan fayl yo'q (internet sekin
// bo'lsa ham darhol chiqadi), xizmat-ishchisi keshiga bog'liq emas,
// va sahifa qat'iy CSP ostida ham ishlayveradi.
//
// Ohanglar atayin ikki xil:
//   bip        — kod o'qildi (qisqa, baland — do'kon shovqinida ham eshitiladi)
//   bip-bip    — tovar topilmadi (past va ikki marta — xatoni ajratib turadi)
//
// Titrash ham shu ikki xillikni takrorlaydi: bitta qisqa turtki yoki
// ikkita. Bozorda karnay-surnay ostida ovoz eshitilmasligi mumkin —
// qo'lda sezilgan turtki o'shanda yagona javob bo'lib qoladi.
// Titrash Android/Chrome'da ishlaydi; iPhone Safari'da bunday imkoniyat
// yo'q, shuning uchun u yerda faqat ovoz qoladi.

const SOUND_KEY = 'arabic.scanSound.v1';
const VIBE_KEY = 'arabic.scanVibe.v1';

let ctx: AudioContext | null = null;
let unlockInstalled = false;

function flagOn(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true; // shaxsiy rejimda localStorage yopiq bo'lishi mumkin
  }
}

function setFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    /* saqlanmasa ham joriy seansda ishlayveradi */
  }
}

/** Ovoz yoqilganmi (qurilmaga bog'liq sozlama, do'konga emas) */
export const scanSoundOn = () => flagOn(SOUND_KEY);

export function setScanSound(on: boolean) {
  setFlag(SOUND_KEY, on);
  if (on) unlockBeep();
}

/** Bu qurilma umuman titray oladimi (iPhone Safari'da yo'q) */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Titrash yoqilganmi */
export const scanVibeOn = () => flagOn(VIBE_KEY);

export const setScanVibe = (on: boolean) => setFlag(VIBE_KEY, on);

/** Sozlama yoqilgan bo'lsa qurilmani titratadi */
export function vibrate(pattern: number | number[]) {
  if (!scanVibeOn() || !canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* titrash bo'lmasa ham skanerlash to'xtamasligi kerak */
  }
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * Brauzer qoidasi: ovoz faqat foydalanuvchi biror narsani bosgandan
 * keyin chiqishi mumkin. iPhone bunga ayniqsa qattiq. Shuning uchun
 * birinchi teginishda kanalni ochib qo'yamiz — keyin skaner o'qiganda
 * hech narsa so'ralmaydi, ovoz darhol chiqadi.
 */
export function unlockBeep() {
  const a = audio();
  if (a && a.state === 'suspended') a.resume().catch(() => {});
  if (unlockInstalled) return;
  unlockInstalled = true;
  const wake = () => {
    const c = audio();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(ev, wake, { passive: true });
  }
}

/**
 * Bitta ohang.
 * Boshi va oxiri silliq ko'tarilib-tushadi — keskin uzilsa "chirt"
 * etgan shovqin qo'shilib eshitilardi.
 */
function tone(freq: number, startAt: number, ms: number, gain = 0.22) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + startAt;
  const dur = ms / 1000;
  const osc = a.createOscillator();
  const vol = a.createGain();
  osc.type = 'square'; // skanerdagi ovoz sof sinus emas, biroz "quruq"
  osc.frequency.setValueAtTime(freq, t0);
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  vol.gain.setValueAtTime(gain, t0 + dur - 0.02);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(vol).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function play(fn: () => void) {
  if (!scanSoundOn()) return;
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') a.resume().catch(() => {});
  try {
    fn();
  } catch {
    /* ovoz chiqmasa ham skanerlash to'xtamasligi kerak */
  }
}

/** Kod o'qildi — haqiqiy skanerdagidek bitta qisqa "bip" */
export function beepOk() {
  play(() => tone(2730, 0, 95));
}

/** Tovar topilmadi — pastroq, ikki marta */
export function beepError() {
  play(() => {
    tone(560, 0, 110, 0.18);
    tone(400, 0.14, 160, 0.18);
  });
}

/** Kod o'qildi: bitta "bip" va bitta qisqa turtki */
export function scanOk() {
  beepOk();
  vibrate(60);
}

/** Tovar topilmadi: past ikki ohang va ikkita turtki */
export function scanFail() {
  beepError();
  vibrate([70, 70, 70]);
}
