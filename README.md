# BuySale — Savdo, ombor, foyda

Do'konchilar uchun raqamli qarz daftari va savdo hisobi: ovozli/qo'lda kiritish,
shtrix-kodli ombor va kassa (POS), avtomatik eslatmalar va AI qo'ng'iroq.

To'liq texnik topshiriq: [`docs/TZ.md`](docs/TZ.md) ([PDF](docs/TZ_ARABIC_ONE.pdf)).

## Tuzilma

| Papka | Nima | Texnologiya |
|---|---|---|
| `backend/` | REST API + baza | Node.js, Fastify, SQLite (dev) → PostgreSQL (prod) |
| `miniapp/` | Telegram Mini App / web-mijoz | React, Vite, TypeScript |
| `docs/` | TZ va hujjatlar | — |

## Ishga tushirish (dev)

```bash
# 1. Backend (port 3000)
cd backend
npm install
npm run dev

# 2. Mini App (port 5173)
cd miniapp
npm install
npm run dev
```

Brauzerda `http://localhost:5173` ochiladi. Kirish kodi Telegram bot orqali
keladi; sinov uchun `backend/.env` da `OTP_DEV_CODE=123456` qo'ysangiz kod
qotib turadi (**ishlab chiqarishda bo'sh qoldiring**).

### Backend manzili

Ilova so'rovlarni **o'zi ochilgan domenga** yuboradi (`/auth/...`), Vite esa
ularni backendga uzatadi (`vite.config.ts` dagi `API_PREFIXES`). Shu sababli
ilova qaysi domenda tursa ham ishlaydi — do'konchining telefonida ham.

Backendni chindan ham boshqa domenga qo'ysangiz `VITE_API_URL` beriladi; u
holda serverda CORS ham ochilishi kerak.

> Yangi marshrut qo'shsangiz (`app.get('/yangi-nom'...)`), uning birinchi
> bo'g'inini `API_PREFIXES` ga ham qo'shing — aks holda brauzer JSON o'rniga
> `index.html` oladi va ekran jimgina ishlamay qoladi. `test-proxy.mjs` shuni
> tekshiradi.

## API qisqacha

- `POST /auth/request-otp`, `POST /auth/verify` — telefon + OTP orqali kirish
- `GET /dashboard` — balanslar, bugungi/kechikkan qarzlar, kam qolgan va srogi yaqin tovarlar
- `GET|POST /customers`, `GET /customers/:id` — mijozlar
- `POST /debts`, `POST /debts/:id/payments` — qarz yozish va to'lov qabul qilish
- `POST /voice/parse` — matnni qarz yozuviga aylantirish (DEV: qoida asosida; PROD: Mohir.ai STT + Claude API)
- `GET /suppliers`, `POST /supplier-debts` — "Men qarzdorman" (postavshiklar)
- `GET /products`, `POST /products/intake` — ombor: qidiruv/shtrix-kod, tovar kirimi
- `POST /sales` — kassa: naqd/karta/**qarzga** (qarzga sotuv avtomatik qarz daftariga tushadi)
- `GET /reports/summary?period=day|week|month` — tushum, foyda, top mahsulotlar

## Telegram bot va Mini App

### 1. Sozlamalar
`backend/.env` faylini yarating (namuna: `.env.example`) — **bu fayl git'ga tushmaydi**:

```
TELEGRAM_BOT_TOKEN=BotFather bergan token
MINIAPP_URL=https://sizning-domeningiz        # HTTPS bo'lishi SHART
PUBLIC_URL=https://api.sizning-domeningiz     # backend manzili (webhook uchun)
TELEGRAM_WEBHOOK_SECRET=tasodifiy-maxfiy-soz
AUTH_SECRET=tasodifiy-uzun-satr
```

### 2. BotFather'da Mini App'ni ro'yxatdan o'tkazish
1. `/newapp` → botni tanlang → nom, tavsif, rasm → **Web App URL**: `MINIAPP_URL`
2. `/setmenubutton` → botga "Ochish" tugmasini qo'ying (o'sha URL)

### 3. Webhook
Backend ishga tushganda `PUBLIC_URL` bo'lsa webhook o'zi ro'yxatdan o'tadi.
Qo'lda ham qilsa bo'ladi:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.domen/telegram/webhook&secret_token=<SECRET>"
```

### Nima ishlaydi
- `/start` — ilovani ochish tugmasi bilan salomlashish
- Botga matn yuborilsa — qarz yozuviga aylanadi (`Karim akaga 120 ming, shanbagacha`)
- Mini App Telegram ichida ochilsa — **initData** orqali avtomatik kiradi
  (birinchi marta telefon tasdiqlanadi va Telegram hisobi do'konga bog'lanadi)
- Telegram'ning **Orqaga** tugmasi, **tebranish** (haptic) va mavzu ranglari ishlatiladi

> Ovozli xabarni matnga aylantirish (Mohir.ai STT) hali ulanmagan —
> bot hozircha matn ko'rinishida yuborishni so'raydi.

## PWA — brauzerdan ilova sifatida

Mini App oddiy brauzerda ham ishlaydi va **PWA** qilib rasmiylashtirilgan:

- `public/manifest.webmanifest` — ilova nomi, ranglari, ikonkalari, tez havolalar
- `public/sw.js` — service worker: ilova qobig'i keshlanadi (API keshlanmaydi)
- `InstallPrompt.tsx` — "Ekranga qo'shish" banneri (iOS Safari uchun alohida ko'rsatma)

**Shart:** PWA faqat **HTTPS** da ishlaydi (localhost bundan mustasno).
Domenga qo'yilgach do'konchi saytni ochib "Ekranga qo'shish" bosadi —
telefonida ikonka paydo bo'ladi va ilova alohida oynada ochiladi.

## Hozirgi holat

MVP skelet: auth, qarz daftari (ovozli parse + qo'lda), mijozlar, ombor kirimi,
kassa (qarzga sotish bilan), dashboard, hisobotlar — hammasi ishlaydi.

Keyingi qadamlar: haqiqiy SMS (Eskiz.uz), Mohir.ai STT, Telegram bot webhook,
kamera skaneri (ML Kit / html5-qrcode), admin panel, to'lovlar (Payme/Click/Uzum),
AI qo'ng'iroq (telefoniya + TTS).
