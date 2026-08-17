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
// Titrash ham shu ikki xillikni takrorlaydi: bitta turtki yoki ikkita.
// Bozorda karnay-surnay ostida ovoz eshitilmasligi mumkin — qo'lda
// sezilgan turtki o'shanda yagona javob bo'lib qoladi. Titrash qanday
// beriladi (Android va iPhone'da har xil) — pastda tushuntirilgan.

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

/* ── Titrash ──
 *
 * Ikki yo'l bor, chunki brauzerlar bir xil emas:
 *
 * 1. navigator.vibrate — Android/Chrome. Ishlashi uchun foydalanuvchi
 *    sahifada kamida bir marta biror narsani bosgan bo'lishi shart
 *    (skanerni ochish tugmasi shu shartni bajaradi).
 *
 * 2. iPhone. Apple brauzerga navigator.vibrate bermagan va bermaydi ham.
 *    Ammo iOS 17.4 dan boshlab Safari <input type="checkbox" switch>
 *    elementini biladi va uni almashtirganda tizimning o'zi qisqa
 *    titrash beradi. Ko'rinmaydigan shunday element yasab, o'sha
 *    "chertish"dan foydalanamiz — iPhone'da titrashning yagona yo'li shu.
 *
 * Kompyuterda titraydigan qismning o'zi yo'q: navigator.vibrate
 * Chrome'da mavjud bo'lsa ham hech narsa qilmaydi. Shuning uchun
 * "titray oladi" deb faqat sensorli qurilmani hisoblaymiz — aks holda
 * sozlama yoqilgandek ko'rinib, aslida ishlamasdi.
 */

const isTouchDevice = () =>
  typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0;

const hasVibrateApi = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** iOS 17.4+ da switch elementi bormi */
function hasSwitchHaptic(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return 'switch' in document.createElement('input');
  } catch {
    return false;
  }
}

let hapticSwitch: HTMLLabelElement | null = null;

/** iPhone'da bitta qisqa titrash */
function tapSwitch() {
  if (!hapticSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    hapticSwitch = label;
  }
  hapticSwitch.click();
}

/** Bu qurilma umuman titray oladimi */
export function canVibrate(): boolean {
  // Sensorli ekran — "bu telefon" degan eng ishonchli belgi. Usiz
  // tekshirsak, kompyuterdagi Chrome ham "titray olaman" derdi
  // (navigator.vibrate bor, lekin titraydigan qismi yo'q), Mac'dagi
  // Safari ham switch elementini biladi.
  if (!isTouchDevice()) return false;
  return hasVibrateApi() || hasSwitchHaptic();
}

/** Titrash yoqilganmi */
export const scanVibeOn = () => flagOn(VIBE_KEY);

export const setScanVibe = (on: boolean) => setFlag(VIBE_KEY, on);

/**
 * Sozlama yoqilgan bo'lsa qurilmani titratadi.
 * `pulses` — nechta turtki (iPhone'da uzunlikni boshqarib bo'lmaydi,
 * faqat sonini; shuning uchun ikkala yo'l uchun bir xil o'lchov).
 */
export function vibrate(pulses = 1) {
  if (!scanVibeOn() || !canVibrate()) return;
  try {
    if (hasVibrateApi() && isTouchDevice()) {
      // 60ms ko'p telefonda sezilmay ketardi — motor to'liq
      // aylanishga ulgurmaydi. 110ms aniq seziladigan chegara.
      const pattern: number[] = [];
      for (let i = 0; i < pulses; i++) {
        if (i > 0) pattern.push(80); // turtkilar orasidagi tanaffus
        pattern.push(110);
      }
      navigator.vibrate(pattern);
      return;
    }
    for (let i = 0; i < pulses; i++) setTimeout(tapSwitch, i * 190);
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

/* ── Tekshiruv uchun ──
 * Sozlamalardagi "Titrashni tekshirish" oynasi shu yerdan foydalanadi.
 * Sozlamadan qat'i nazar ishlaydi: maqsad — qurilma nimaga qodirligini
 * bilish, taxmin qilish emas.
 */

export interface VibeInfo {
  /** navigator.vibrate mavjudmi (Android/Chrome) */
  hasApi: boolean;
  /** sensorli ekran nuqtalari — 0 bo'lsa bu kompyuter */
  touchPoints: number;
  /** iOS 17.4+ switch elementi bormi */
  hasSwitch: boolean;
  /** ilova alohida oyna sifatida o'rnatilganmi */
  standalone: boolean;
  /** HTTPS'mi (usiz ko'p imkoniyat yopiq) */
  secure: boolean;
  browser: string;
}

export function vibeInfo(): VibeInfo {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = /CriOS/.test(ua)
    ? 'Chrome (iPhone)'
    : /FxiOS/.test(ua)
      ? 'Firefox (iPhone)'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'Safari (iPhone)'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /YaBrowser/.test(ua)
            ? 'Yandex'
            : /Edg\//.test(ua)
              ? 'Edge'
              : /Chrome/.test(ua)
                ? 'Chrome'
                : /Firefox/.test(ua)
                  ? 'Firefox'
                  : /Safari/.test(ua)
                    ? 'Safari'
                    : '—';
  return {
    hasApi: hasVibrateApi(),
    touchPoints: typeof navigator === 'undefined' ? 0 : (navigator.maxTouchPoints ?? 0),
    hasSwitch: hasSwitchHaptic(),
    standalone:
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true),
    secure: typeof window !== 'undefined' && window.isSecureContext,
    browser,
  };
}

/**
 * To'g'ridan-to'g'ri navigator.vibrate. Qaytgan qiymat muhim:
 * false bo'lsa brauzer so'rovni rad etgan (odatda foydalanuvchi hali
 * sahifada hech narsa bosmagan bo'lsa yoki tizim taqiqlagan bo'lsa).
 */
export function tryVibrateApi(pattern: number | number[]): boolean | null {
  if (!hasVibrateApi()) return null;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/** To'g'ridan-to'g'ri iPhone usuli */
export function tryIosHaptic(): boolean {
  if (!hasSwitchHaptic()) return false;
  try {
    tapSwitch();
    return true;
  } catch {
    return false;
  }
}

/** Kod o'qildi: bitta "bip" va bitta turtki */
export function scanOk() {
  beepOk();
  vibrate(1);
}

/** Tovar topilmadi: past ikki ohang va ikkita turtki */
export function scanFail() {
  beepError();
  vibrate(2);
}
