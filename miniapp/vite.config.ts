import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Telefonda kamerani sinash uchun HTTPS kerak: brauzerlar kamerani faqat
// xavfsiz manzilda (https:// yoki localhost) ochadi. `npm run dev:https`
// o'z-o'zidan sertifikat yasaydi — telefonda "ishonchsiz sayt" ogohlantirishini
// bir marta qabul qilsangiz, kamera ishlay boshlaydi.
const https = process.env.HTTPS === '1';

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: { port: 5173, host: true },
});
