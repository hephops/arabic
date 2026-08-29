// Yig'ilgan APK ni Android loyihasining ichidan olib tashlaydi.
//
// NIMA UCHUN KERAK:
//
// buysale.apk `public/` papkasida turadi — kirish ekranidagi
// "Yuklab olish" tugmasi uni shu yerdan beradi. Vite `public/` ni
// `dist/` ga ko'chiradi, `cap sync` esa `dist/` ni butunlay
// Android loyihasiga ko'chiradi.
//
// Natijada har yangi APK o'zidan oldingi APK ni ICHIGA olib ketardi:
// 1-versiya 3.6 MB, 2-versiya 7 MB, 3-versiya 11 MB... har safar
// o'sib boraveradi. Buni hech kim sezmaydi, chunki ilova baribir
// ishlayveradi — faqat hajmi tushunarsiz kattalashadi.
//
// Ilova jonli saytni ochgani uchun (capacitor.config.ts dagi
// server.url) bu fayllar umuman ishlatilmaydi, shuning uchun uni
// o'chirib tashlash xavfsiz.
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const targets = [
  join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'buysale.apk'),
  join(root, 'ios', 'App', 'App', 'public', 'buysale.apk'),
];

let removed = 0;
for (const f of targets) {
  if (existsSync(f)) {
    rmSync(f);
    removed++;
  }
}
console.log(
  removed > 0
    ? `[strip-apk] ${removed} ta nusxa olib tashlandi (ilova o'z ichiga o'zini olmaydi)`
    : '[strip-apk] tozalanadigan narsa yo\'q'
);
