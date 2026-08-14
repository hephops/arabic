import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sertifikat/CORS bilan uchrashmaslik uchun backend so'rovlarini Vite orqali
// proksi qilamiz (miniapp'dagi bilan bir xil yondashuv).
const API_PREFIXES = ['auth', 'admin'];
const apiProxy = Object.fromEntries(
  API_PREFIXES.map((p) => [`/${p}`, { target: 'http://localhost:3000', changeOrigin: true }])
);

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, host: true, allowedHosts: true, proxy: apiProxy },
});
