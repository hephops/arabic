# ARABIC.ONE — Do'kon Daftari

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

Brauzerda `http://localhost:5173` ochiladi. DEV rejimda SMS kod doim `123456`.

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

## Hozirgi holat

MVP skelet: auth, qarz daftari (ovozli parse + qo'lda), mijozlar, ombor kirimi,
kassa (qarzga sotish bilan), dashboard, hisobotlar — hammasi ishlaydi.

Keyingi qadamlar: haqiqiy SMS (Eskiz.uz), Mohir.ai STT, Telegram bot webhook,
kamera skaneri (ML Kit / html5-qrcode), admin panel, to'lovlar (Payme/Click/Uzum),
AI qo'ng'iroq (telefoniya + TTS).
