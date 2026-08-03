# Arabic.One — Mini App

Do'konchi ilovasi: qarz daftari, kassa, ombor, eslatmalar.
React + Vite + TypeScript. Telegram Mini App va PWA sifatida ham ochiladi.

## Ishga tushirish

```bash
npm install
npm run dev          # http://localhost:5173
```

## Telefonda sinash (kamera uchun MUHIM)

Brauzerlar kamerani **faqat xavfsiz manzilda** ochadi: `https://` yoki `localhost`.
Telefondan `http://192.168.x.x:5173` orqali kirilsa, iPhone Safari kameraga
ruxsat ham so'ramaydi — shuning uchun skaner kompyuterda ishlab, telefonda
ishlamaydi.

Telefonda sinash uchun HTTPS bilan ishga tushiring:

```bash
npm run dev:https    # https://192.168.x.x:5173
```

Sertifikat o'z-o'zidan yasaladi, shuning uchun telefon "Bu sayt ishonchsiz"
deb ogohlantiradi — **Advanced → Visit this website** ni bosib bir marta
qabul qilsangiz, kamera ishlay boshlaydi.

Agar kamera baribir ochilmasa, iPhone Safari'da:
**«aA» tugmasi → Website Settings → Camera → Allow**, so'ng sahifani yangilang.

Ishlab chiqarishda domenga SSL sertifikat o'rnatiladi (Telegram Mini App uchun
bu baribir majburiy) — u yerda hech qanday ogohlantirish bo'lmaydi.

## Rollar

- **Do'kon egasi** — telefon raqami + SMS kod orqali kiradi.
- **Sotuvchi (xodim)** — kirish ekranidagi «Xodim sifatida kirish» orqali:
  do'kon raqami + egasi bergan 4 xonali PIN-kod. Sotuvchi sotadi va qarz
  yozadi; narx o'zgartirish, o'chirish, hisobot, balans va sozlamalar
  faqat egada qoladi. Har bir sotuv va qarz kim tomonidan yozilgani
  bazaga yozib boriladi.
