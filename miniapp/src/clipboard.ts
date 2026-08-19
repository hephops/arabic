// Matnni nusxalash.
//
// navigator.clipboard faqat HTTPS'da (yoki localhost'da) ishlaydi va
// eski brauzerlarda umuman yo'q — shuning uchun zaxira yo'l kerak.
// Do'konchining telefoni har xil bo'ladi, "nusxalandi" deb aldab
// qo'ymaslik uchun natija qaytariladi.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
