import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Yig'ilgan versiya panelning pastida ko'rinadi. Kerak: serverda
// "git pull" qilingandan keyin qayta yig'ilganini KO'RIB tekshirish
// mumkin bo'lsin — aks holda eski yig'ma ko'rsatilib turgani bilan
// kod yangilangandek tuyuladi va xato boshqa joydan qidiriladi.
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '?';
  }
})();
const yigilgan = new Date().toLocaleString('sv').slice(0, 16);

// Sertifikat/CORS bilan uchrashmaslik uchun backend so'rovlarini Vite orqali
// proksi qilamiz (miniapp'dagi bilan bir xil yondashuv).
// 'uploads' — chek suratlari shu yerdan olinadi (Cheklar bo'limi)
const API_PREFIXES = ['auth', 'admin', 'uploads'];
const apiProxy = Object.fromEntries(
  API_PREFIXES.map((p) => [`/${p}`, { target: 'http://localhost:3000', changeOrigin: true }])
);

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(`${commit} · ${yigilgan}`) },
  server: { port: 5174, host: true, allowedHosts: true, proxy: apiProxy },
  // Ishlab chiqarishga chiqargan `dist/` ni tekshirish uchun ("npm run preview")
  preview: { port: 5174, host: true, allowedHosts: true, proxy: apiProxy },
});
