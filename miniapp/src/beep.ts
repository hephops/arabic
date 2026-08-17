// Skaner ovozi.
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

const SETTING_KEY = 'arabic.scanSound.v1';

let ctx: AudioContext | null = null;
let unlockInstalled = false;

/** Ovoz yoqilganmi (qurilmaga bog'liq sozlama, do'konga emas) */
export function scanSoundOn(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setScanSound(on: boolean) {
  try {
    localStorage.setItem(SETTING_KEY, on ? 'on' : 'off');
  } catch {
    /* shaxsiy rejimda localStorage yopiq bo'lishi mumkin */
  }
  if (on) unlockBeep();
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
