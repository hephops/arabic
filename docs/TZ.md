# ARABIC.ONE — Texnik Topshiriq (TZ)

**Loyiha:** Do'konchilar uchun raqamli qarz daftari — ovozli kiritish, avtomatik eslatmalar va AI qo'ng'iroq bilan.
**Platformalar:** Android (APK / Google Play), iOS (App Store), Web Admin Panel.
**Brend:** ARABIC.ONE
**Versiya:** 1.0 (qoralama)

---

## 1. Loyihaning maqsadi

Do'konchi (savdogar) qog'oz qarz daftarini telefoniga ko'chiradi:

1. Qarzni **ovoz bilan** kiritadi — "Akmalga 50 ming so'mlik mahsulot berdim, oyning o'nigacha" — tizim buni avtomatik yozuvga aylantiradi.
2. Muddat kelganda tizim qarzdorga **avtomatik eslatma** yuboradi (SMS / Telegram), kerak bo'lsa **AI ovozli qo'ng'iroq** qiladi.
3. Do'konchi oylik **obuna** to'laydi (Payme / Click / Uzum orqali).

---

## 2. Foydalanuvchi rollari

| Rol | Tavsif |
|---|---|
| **Do'konchi** | Asosiy foydalanuvchi. Mobil ilovada qarzlarni yuritadi, obuna to'laydi. |
| **Qarzdor (mijoz)** | Ilova o'rnatishi shart emas. SMS/Telegram/qo'ng'iroq orqali eslatma oladi. Ixtiyoriy: havola orqali o'z qarzini ko'radi. |
| **Admin** | Web-panelda foydalanuvchilar, obunalar, to'lovlar, qo'ng'iroqlarni boshqaradi. |
| **Super-admin** | Tariflar, admin hisoblari, tizim sozlamalari. |

---

## 3. Mobil ilova (Android + iOS)

> Bitta kod bazasi — **Flutter** tavsiya etiladi (bir vaqtda APK va iOS chiqadi).

### 3.1. Ro'yxatdan o'tish / Kirish
- Telefon raqami + SMS-kod (OTP) orqali.
- Do'kon profili: nomi, manzili (ixtiyoriy), do'kon turi.
- Til tanlash: **O'zbek (lotin), O'zbek (kirill), Rus**.

### 3.2. Asosiy ekran (Dashboard)
- Umumiy qarz summasi (menga qarzdorlar).
- Bugun muddati kelgan qarzlar ro'yxati.
- Kechikkan qarzlar (qizil belgi bilan).
- Katta **mikrofon tugmasi** — ovozli kiritish (asosiy funksiya, doim ko'z oldida).

### 3.3. Ovozli qarz kiritish (asosiy "fishka")
- Do'konchi mikrofonni bosib gapiradi: *"Karim akaga 120 ming so'm, shanbagacha"*.
- Oqim: **Ovoz → STT (matn) → AI tahlil → tayyor yozuv**:
  - Mijoz ismi: Karim aka
  - Summa: 120 000 so'm
  - Muddat: kelasi shanba (aniq sana)
- Tizim yozuvni **tasdiqlash ekranida** ko'rsatadi — do'konchi "Saqlash" bosadi yoki tahrirlaydi (xato bo'lsa qo'lda to'g'irlaydi).
- Ovozni tanimasa — qo'lda kiritish formasi ochiladi.
- STT: **Mohir.ai** (o'zbek tili uchun) yoki Google Speech-to-Text; tahlil: LLM (Claude API).

### 3.4. Qarz daftari
- Mijozlar ro'yxati: ism, telefon, umumiy qarz, oxirgi amaliyot sanasi.
- Mijoz sahifasi: barcha qarzlar tarixi (berildi / qaytarildi), balans.
- Amaliyotlar: **Qarz berish** (+) va **To'lov qabul qilish** (−), qisman to'lov qo'llab-quvvatlanadi.
- Har bir yozuvda: summa, izoh (mahsulot), sana, muddat, holat (faol / kechikkan / yopilgan).
- Qidiruv va filtr (ism bo'yicha, muddati bo'yicha, kechikkanlar).
- Kontaktlar kitobidan mijoz import qilish.

### 3.5. Eslatmalar tizimi (eskalatsiya zinasi)
Do'konchi har bir mijoz/qarz uchun rejimni tanlaydi:
1. **Yumshoq:** muddatdan 1 kun oldin SMS/Telegram xabar — "Ertaga qarz muddati keladi".
2. **O'rta:** muddat kuni va keyin har 3 kunda takroriy xabar.
3. **AI qo'ng'iroq:** kechikkanda tizim qarzdorga o'zbek tilida ovozli qo'ng'iroq qiladi — muloyim matn: *"Assalomu alaykum, [do'kon nomi] do'konidan eslatma: [summa] qarzingizning muddati o'tdi, iltimos to'lab qo'ying"*.
- Har bir eslatma do'konchi ilovasida log bo'lib ko'rinadi (yuborildi / yetkazildi / ko'tarildi).
- AI qo'ng'iroq faqat do'konchining aniq ruxsati bilan yoqiladi (mijoz bilan munosabatni saqlash uchun).

### 3.6. Hisobotlar
- Kunlik / haftalik / oylik: berilgan qarz, qaytgan pul, o'sish grafigi.
- Top qarzdorlar ro'yxati.
- Excel/PDF eksport.

### 3.7. Obuna va to'lov
- Tarif rejalar (masalan): **Bepul** — cheklangan yozuvlar, faqat qo'lda kiritish; **Premium (99 000 so'm/oy)** — cheksiz yozuvlar, ovozli kiritish, SMS + AI qo'ng'iroq.
- To'lov: **Payme, Click, Uzum Bank** integratsiyasi.
- Obuna holati, tugash sanasi, avtomatik uzaytirish.

### 3.8. Qo'shimcha
- **Offline rejim:** internet yo'q bo'lsa ham yozuvlar saqlanadi, ulanish qaytganda sinxronlanadi.
- Push-bildirishnomalar (FCM/APNs).
- Ma'lumotlarni bulutga zaxiralash — telefon yo'qolsa ham daftar yo'qolmaydi.
- PIN-kod / biometrik qulf (qarz daftari — maxfiy ma'lumot).

---

## 4. Admin panel (Web)

> Texnologiya: React + REST API. Faqat admin/super-admin kiradi (login + parol + 2FA).

### 4.1. Dashboard
- Jami foydalanuvchilar, faol obunalar, oylik tushum (MRR).
- Bugungi ro'yxatdan o'tishlar, to'lovlar, qo'ng'iroqlar soni.
- Grafiklar: o'sish dinamikasi, churn (obunani to'xtatganlar).

### 4.2. Foydalanuvchilar boshqaruvi
- Do'konchilar ro'yxati: qidiruv, filtr (viloyat, tarif, holat).
- Profil: ma'lumotlar, obuna tarixi, faollik (oxirgi kirish, yozuvlar soni).
- Bloklash / blokdan chiqarish, obunani qo'lda uzaytirish (sovg'a).

### 4.3. Obuna va to'lovlar
- Tariflarni boshqarish: narx, muddat, funksiyalar to'plami.
- To'lovlar jurnali: kim, qachon, qancha, qaysi tizim orqali (Payme/Click/Uzum).
- Promo-kodlar va chegirmalar yaratish.

### 4.4. AI qo'ng'iroq va xabarlar monitoringi
- Qo'ng'iroqlar jurnali: kimga, qachon, natija (ko'tardi / ko'tarmadi / band), yozib olingan audio.
- SMS/Telegram yuborilganlar statistikasi va xarajati.
- Qo'ng'iroq matnlari (skriptlar) shablonlarini tahrirlash.

### 4.5. Kontent va xabarnomalar
- Barcha yoki tanlangan foydalanuvchilarga push/SMS yuborish (yangilik, aksiya).
- FAQ / yordam bo'limini tahrirlash.

### 4.6. Super-admin
- Admin hisoblarini yaratish, rollarni belgilash.
- Tizim sozlamalari: STT provayder, SMS-shlyuz, telefoniya sozlamalari.
- Audit-log: qaysi admin nima qilgani.

---

## 5. Backend arxitektura

```
Mobil ilova (Flutter)  ──┐
                         ├──►  REST API (backend)  ──►  PostgreSQL
Admin panel (React)   ──┘            │
                                     ├──►  STT: Mohir.ai / Google STT
                                     ├──►  AI tahlil: Claude API
                                     ├──►  SMS: Eskiz.uz / Play Mobile
                                     ├──►  Telegram Bot API
                                     ├──►  Telefoniya: SIP/Asterisk + TTS (AI qo'ng'iroq)
                                     └──►  To'lov: Payme / Click / Uzum API
```

- **Backend:** Node.js (NestJS) yoki Python (FastAPI).
- **Baza:** PostgreSQL; media (audio) uchun S3-compatible storage.
- **Navbat (queue):** eslatmalar va qo'ng'iroqlarni rejalashtirish uchun (Redis + worker).
- **Xavfsizlik:** JWT autentifikatsiya, HTTPS, telefon raqamlar shifrlangan holda saqlanadi.

---

## 6. Dizayn tizimi (logodan kelib chiqqan)

| Element | Qiymat |
|---|---|
| Asosiy fon (dark) | To'q ko'k-navy gradient: `#0A1228 → #0E1B3A` |
| Aksent (brend ko'k) | `#2E7CF6` (logodagi doira rangi) |
| Matn | Oq `#FFFFFF`, ikkilamchi: `#8FA3C8` |
| Muvaffaqiyat (to'lov qaytdi) | Yashil `#22C55E` |
| Ogohlantirish (kechikkan qarz) | Qizil `#EF4444` |
| Shrift | Inter / SF Pro — logodagi kabi qalin, zamonaviy |
| Uslub | Dark theme asosiy; yumaloq kartochkalar, katta tugmalar (do'konchi qo'li band bo'lsa ham bosishi oson) |

Logo: ko'k doira ichida oq "A" — ilova ikonkasi va splash-ekranda ishlatiladi.

---

## 7. Bosqichlar (roadmap)

| Bosqich | Muddat (taxminiy) | Nima chiqadi |
|---|---|---|
| **1. MVP** | 4–6 hafta | Mobil ilova: ro'yxatdan o'tish, qarz daftari (qo'lda + ovozli kiritish), SMS/Telegram eslatma. Oddiy admin panel. |
| **2. Monetizatsiya** | +3 hafta | Payme/Click/Uzum obuna, tariflar, to'liq admin panel. |
| **3. AI qo'ng'iroq** | +4 hafta | Telefoniya integratsiyasi, TTS, qo'ng'iroq skriptlari, monitoring. |
| **4. Kengaytirish** | doimiy | Hisobotlar, eksport, qarzdor uchun web-sahifa, iOS App Store nashri. |

---

## 8. Ochiq savollar (kelishib olish kerak)

1. Ilova nomi do'konlarda qanday chiqadi — "ARABIC.ONE" o'zими, yoki qo'shimcha nom bilan (masalan "Arabic.One — Qarz Daftari")?
2. AI qo'ng'iroq qaysi til(lar)da — faqat o'zbekmi, rus ham kerakmi?
3. SMS provayderi bilan shartnoma kim nomiga bo'ladi (Eskiz.uz yuridik shaxs talab qiladi)?
4. Bepul tarif chegaralari qanday bo'lsin (nechta yozuv, nechta mijoz)?
5. Birinchi bosqichda faqat Android (APK) chiqarib, iOS ni 2-bosqichga qoldiramizmi? (App Store nashri ko'proq vaqt va Apple hisob talab qiladi — yiliga $99.)
