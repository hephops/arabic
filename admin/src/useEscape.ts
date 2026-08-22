// Oyna Escape bilan yopilsin.
//
// Admin panel kompyuterda ishlaydi, klaviatura doim qo'l ostida.
// Ilgari oynani yopish uchun faqat "Bekor" tugmasini yoki fon ustini
// bosish mumkin edi — Escape hech qayerda ishlamasdi. Bu shunchaki
// noqulaylik emas: fon ustiga bosish tasodifan yopib yuborishi mumkin,
// shuning uchun ba'zi oynalarda u to'xtatilgan va yopishning yagona
// yo'li kichkina tugma bo'lib qolardi.
//
// Ochiq oynalar bir-birining ustiga chiqsa (masalan chek rasmi
// kattalashtirilganda), Escape faqat ENG TEPADAGINI yopadi: har bir
// oyna o'zini ro'yxatga qo'yadi, ro'yxatning oxirgisi javob beradi.

import { useEffect } from 'react';

const stack: (() => void)[] = [];

export function useEscape(onClose: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    stack.push(onClose);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const top = stack[stack.length - 1];
      // Faqat eng tepadagi oyna javob beradi
      if (top !== onClose) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = stack.lastIndexOf(onClose);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [onClose, active]);
}
