// Tarjimon va kengaytmalardan himoya.
//
// MUAMMO. Brauzer tarjimoni (yoki Gemini/Google Translate kabi
// kengaytmalar) sahifadagi matn tugunlarini <font> ichiga o'rab
// qo'yadi. React esa o'zi yaratgan tugunlarni eslab turadi va
// keyingi qayta chizishda ularni o'chirmoqchi bo'ladi — lekin tugun
// endi boshqa ota-ona ichida. Natijada:
//
//   Failed to execute 'removeChild' on 'Node': The node to be
//   removed is not a child of this node.
//
// va butun panel oqarib qoladi.
//
// index.html da translate="no" va notranslate allaqachon bor, lekin
// ular faqat brauzerning O'Z tarjimasiga ta'sir qiladi. Kengaytmalar
// bu ko'rsatmalarni umuman hisobga olmaydi — admin shu sababli
// "Bo'lim ochilmadi" xatosini ko'rgan edi.
//
// YECHIM. removeChild/insertBefore ni himoyalab o'raymiz: tugun
// aslida shu ota-onaning bolasi bo'lmasa, xato tashlamasdan jimgina
// qaytamiz. React uchun bu "o'chirildi" degani bilan bir xil — u
// ishlashda davom etadi va sahifa tirik qoladi.
//
// NARXI. Bu chindan buzuq DOM amalini ham jimgina yutib yuboradi.
// Lekin bunday xato deyarli bo'lmaydi, tarjimon esa har kuni
// aralashadi — va oqarib qolgan panel har qanday yashirin xatodan
// yomonroq.
export function installDomGuard() {
  if (typeof Node !== 'function' || !Node.prototype) return;

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    node: T,
    ref: Node | null
  ): T {
    // Mo'ljal tugun ko'chib ketgan bo'lsa oxiriga qo'shamiz —
    // tashlab yuborsak element umuman chizilmay qolardi.
    if (ref && ref.parentNode !== this) return this.appendChild(node) as T;
    return insertBefore.call(this, node, ref) as T;
  };
}
