import type { CapacitorConfig } from '@capacitor/cli';

// Android ilovasining sozlamalari.
//
// MUHIM TANLOV — `server.url`:
//
// Ilova o'z ichiga yig'ilgan fayllarni EMAS, to'g'ridan-to'g'ri
// app.buysale.uz ni ochadi. Sababi amaliy: BuySale deyarli har kuni
// yangilanadi, va agar fayllar APK ichiga tikilsa, har o'zgarishdan
// keyin yangi APK yig'ib, uni har bir do'konchiga qaytadan
// o'rnattirish kerak bo'lardi. Bu yo'l bilan esa APK bir marta
// yig'iladi: veb-ilova yangilanishi bilan telefondagi ilova ham
// o'zi yangilanadi.
//
// Ilova baribir internetsiz ishlamaydi (hamma ma'lumot serverdan
// keladi), shuning uchun bu yerda yo'qotadigan narsa yo'q.
//
// Agar keyinchalik APK ichida ishlashini xohlasangiz — shu `server`
// bo'limini o'chiring, `npm run build` qiling va qaytadan yig'ing.
const config: CapacitorConfig = {
  appId: 'uz.buysale.app',
  appName: 'BuySale',
  webDir: 'dist',
  server: {
    url: 'https://app.buysale.uz',
    // Faqat https — parol va token oddiy http orqali ketmasin
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      // Ilova ochilayotganda oq ekran o'rniga logotip turadi.
      // 1.2 soniya — sayt yuklanguncha yetadi, undan uzog'i esa
      // ilovani sekin ko'rsatib qo'yardi.
      launchShowDuration: 1200,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      // Yuqoridagi soat/batareya qatori: oq fon, qora yozuv —
      // ilovaning o'z foni ham oq (kirish ekraniga qarang)
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
