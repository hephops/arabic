// Pastdan chiqadigan oyna Escape bilan yopilsin.
//
// Ilova telefonda ham, kompyuterda ham ishlaydi. Kompyuterda esa
// klaviatura doim qo'l ostida: ochilgan oynani yopish uchun sichqoncha
// bilan kichkina tugmani nishonga olish o'rniga Escape bosilsin.
// Telefonda hech narsa o'zgarmaydi.
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
