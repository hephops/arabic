import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

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
  'expenses', 'returns', 'categories', 'inventory', 'orders', 'catalog',
];
const apiProxy = Object.fromEntries(
  API_PREFIXES.map((p) => [`/${p}`, { target: 'http://localhost:3000', changeOrigin: true }])
);

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: { port: 5173, host: true, allowedHosts: true, proxy: apiProxy },
  // Ishlab chiqarishga chiqargan `dist/` ni tekshirish uchun ("npm run preview").
  // MUHIM: haqiqiy do'konchilarga shu orqali xizmat qiling, `vite`/`dev` emas —
  // dev-server fayllari versiyalanmagan nom bilan berilib, brauzer ularni
  // keshlab qoladi va F5 yangi deployni ko'rsatmay qoladi.
  preview: { port: 5173, host: true, allowedHosts: true, proxy: apiProxy },
});
