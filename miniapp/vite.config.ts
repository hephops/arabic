import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

// Yuklab olinadigan APK manzili uchun qisqa barmoq izi.
//
// NIMA UCHUN: sayt oldida Cloudflare turadi va u `/buysale.apk` ni
// keshlab qo'yadi (4 soat). Bir marta shu tufayli do'konchilarga
// ESKI, sarlavhasi buzuq javob berilgan — Android faylni tanimay,
// o'rnatishni taklif qilmagan. Yangi APK chiqarilganda ham xuddi
// shu bo'lardi: yarim kun davomida odamlar eskisini yuklab olardi.
//
// Manzilga faylning o'z izini qo'shsak (`?v=a1b2c3d4`), APK
// o'zgarishi bilan manzil ham o'zgaradi — Cloudflare uni yangi
// fayl deb biladi va keshdan bermaydi. Qo'lda versiya yozish
// shart emas, aks holda uni yangilashni unutish oson edi.
function apkFingerprint(): string {
  const f = 'public/buysale.apk';
  if (!existsSync(f)) return '';
  return createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 8);
}

// Telefonda kamerani sinash uchun HTTPS kerak: brauzerlar kamerani faqat
// xavfsiz manzilda (https:// yoki localhost) ochadi. `npm run dev:https`
// o'z-o'zidan sertifikat yasaydi — telefonda "ishonchsiz sayt" ogohlantirishini
// bir marta qabul qilsangiz, kamera ishlay boshlaydi.
const https = process.env.HTTPS === '1';

// Telefonda backend'ga to'g'ridan-to'g'ri (boshqa origin/port) so'rov yuborilsa,
// alohida sertifikat ishonchi va CORS bilan uchrashamiz. Buning o'rniga backend
// so'rovlarini Vite orqali (server-to-server, brauzersiz) proksi qilamiz — brauzer
// faqat bitta xavfsiz manzil (shu server) bilan gaplashadi.
//
// DIQQAT: bu ro'yxat backend/src/server.ts dagi HAR BIR birinchi bo'g'inni
// (masalan '/debts', '/supplier-debts') qamrab olishi shart. Bir marta
// shu yerga qo'shishni unutib, "Postavshikka qarz yozish" HTTP 404 bilan
// jimgina ishlamay qolgan edi — brauzer /supplier-debts ni Vite'ning o'z
// ichida (backendga proksi qilmasdan) qidirib topolmagan. Yangi marshrut
// (`app.get/post/patch/delete('/yangi-nom...')`) qo'shsangiz, shu yerga
// ham "yangi-nom" ni qo'shing.
const API_PREFIXES = [
  'auth', 'telegram', 'public', 'me', 'balance', 'dashboard', 'customers',
  'reminders', 'voice', 'suppliers', 'supplier-debts', 'debts', 'employees',
  'referral', 'products', 'barcodes', 'uploads', 'sales', 'reports',
  'expenses', 'returns', 'categories', 'inventory', 'orders', 'catalog', 'ai',
];
const apiProxy = Object.fromEntries(
  API_PREFIXES.map((p) => [`/${p}`, { target: 'http://localhost:3000', changeOrigin: true }])
);

// Android ilovasini (buysale.apk) to'g'ri sarlavhalar bilan berish.
//
// Vite `.apk` kengaytmasini bilmaydi va Content-Type'ni UMUMAN
// yubormaydi. Bunday javobni telefon brauzeri "noma'lum fayl" deb
// qabul qilishi va o'rnatishni taklif qilmasligi mumkin —
// do'konchi faylni yuklab olib, u bilan nima qilishni bilmay
// qolardi. To'g'ri turi berilsa Android darhol "O'rnatish"
// oynasini ochadi.
//
// Kesh ham o'chiriladi: standart 4 soatlik kesh tufayli yangi
// versiya chiqarilganda do'konchilar yarim kun eskisini yuklab
// olishda davom etardi.
function apkHeaders() {
  const middleware = (req: any, res: any, next: any) => {
    if (req.url?.split('?')[0].endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="BuySale.apk"');
      res.setHeader('Cache-Control', 'no-cache');
    }
    next();
  };
  // DIQQAT: bu ilgaklar HECH NARSA QAYTARMASLIGI kerak.
  // `(s) => s.middlewares.use(...)` deb yozilsa, `use()` connect
  // ilovasini qaytaradi, u esa funksiya — Vite uni "serverdan keyin
  // chaqiriladigan ilgak" deb o'ylab bo'sh argument bilan chaqiradi
  // va server "Cannot read properties of undefined (reading 'url')"
  // bilan umuman ishga tushmay qoladi.
  return {
    name: 'apk-headers',
    configureServer(s: any) {
      s.middlewares.use(middleware);
    },
    configurePreviewServer(s: any) {
      s.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  define: { __APK_V__: JSON.stringify(apkFingerprint()) },
  plugins: [react(), apkHeaders(), ...(https ? [basicSsl()] : [])],
  server: { port: 5173, host: true, allowedHosts: true, proxy: apiProxy },
  // Ishlab chiqarishga chiqargan `dist/` ni tekshirish uchun ("npm run preview").
  // MUHIM: haqiqiy do'konchilarga shu orqali xizmat qiling, `vite`/`dev` emas —
  // dev-server fayllari versiyalanmagan nom bilan berilib, brauzer ularni
  // keshlab qoladi va F5 yangi deployni ko'rsatmay qoladi.
  preview: { port: 5173, host: true, allowedHosts: true, proxy: apiProxy },
});
