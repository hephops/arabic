// Chapdagi menyu yig'ilgan (faqat ikonkalar) yoki yoyilgan holatda bo'ladi.
// Holat <html data-side="min|full"> orqali beriladi — qolganini CSS hal qiladi,
// shuning uchun ekranlarga qo'shimcha holat ulash shart emas.

const KEY = 'arabic.side';

export function applySide(value?: 'min' | 'full') {
  const v = value ?? ((localStorage.getItem(KEY) as 'min' | 'full') || 'full');
  document.documentElement.dataset.side = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* muhim emas */
  }
}

export function toggleSide() {
  applySide(document.documentElement.dataset.side === 'min' ? 'full' : 'min');
}

applySide();
