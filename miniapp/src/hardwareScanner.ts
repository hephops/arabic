import { useEffect, useRef } from 'react';

// USB/HID shtrix-kod skanerlari (masalan Honeywell) kompyuterga klaviatura
// sifatida ulanadi: kodni juda tez "terib", oxirida Enter (ba'zan Tab)
// yuboradi. Odam bunchalik tez yoza olmaydi — belgilar orasi odatda
// 40ms dan tezroq keladi. Shu farqdan foydalanib skaner o'qishini
// aniqlaymiz, fokus qaysi maydonda turganidan qat'i nazar.
//
// Uchinchi belgidan boshlab (ketma-ketlik skaner ekanligi tasdiqlangach)
// keyingi belgilar fokusdagi maydonga yozilib ketishining oldi olinadi —
// aks holda kod tasodifan boshqa (masalan narx) maydonga tushib qolardi.

const FAST_GAP_MS = 40;
const CONFIRM_LEN = 3;
const MIN_CODE_LEN = 4;

export function useHardwareScanner(onScan: (code: string) => void, enabled = true) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = '';
    let confirmed = false;
    let lastAt = 0;

    function reset() {
      buffer = '';
      confirmed = false;
    }

    function finish(e: KeyboardEvent) {
      const code = buffer;
      const wasConfirmed = confirmed;
      reset();
      if (wasConfirmed && code.length >= MIN_CODE_LEN) {
        e.preventDefault();
        e.stopPropagation();
        onScanRef.current(code);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        finish(e);
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
        reset();
        return;
      }
      const now = Date.now();
      const gap = now - lastAt;
      lastAt = now;
      if (gap > FAST_GAP_MS) {
        // pauza — yangi ketma-ketlik, hali skaner ekanligi noma'lum
        buffer = e.key;
        confirmed = false;
        return;
      }
      buffer += e.key;
      if (buffer.length >= CONFIRM_LEN) confirmed = true;
      if (confirmed) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
