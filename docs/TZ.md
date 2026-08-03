# ARABIC.ONE — Texnik Topshiriq (TZ)

**Loyiha:** Do'konchilar uchun raqamli qarz daftari va savdo hisobi — ovozli va qo'lda kiritish, shtrix-kodli ombor/kassa (POS), avtomatik eslatmalar va AI qo'ng'iroq bilan.
**Platformalar:** Android (APK / Google Play), iOS (App Store), **Telegram Mini App**, Web Admin Panel.

> **Muhim prinsip:** Mobil ilova va Telegram bot — **teng huquqli ikkita mijoz platformasi**. Do'konchi qaysi biri qulay bo'lsa o'shani ishlataveradi (yoki ikkalasini birga), hamma ma'lumot bitta hisobda sinxron turadi. Qarz kiritish ham ikki usulda teng ishlaydi: **ovoz orqali** va **qo'lda** — ikkalasi ham asosiy usul.
**Brend:** ARABIC.ONE
**Versiya:** 1.0 (qoralama)

---

## 1. Loyihaning maqsadi

Do'konchi (savdogar) qog'oz qarz daftarini telefoniga ko'chiradi:

1. Qarzni **ovoz bilan** kiritadi — "Akmalga 50 ming so'mlik mahsulot berdim, oyning o'nigacha" — tizim buni avtomatik yozuvga aylantiradi.
2. Muddat kelganda tizim qarzdorga **avtomatik eslatma** yuboradi (SMS / Telegram), kerak bo'lsa **AI ovozli qo'ng'iroq** qiladi.
3. Do'kon savdosini ham yuritadi: **shtrix-kod skaneri** bilan tovar kirimi, ombor qoldig'i va kassa (sotuv) — "qarzga sotish" bitta tugma bilan qarz daftariga tushadi.
4. Do'konchi oylik **obuna** to'laydi (Payme / Click / Uzum orqali).

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
- **To'lov rekvizitlari:** do'konchining karta raqami (Humo/Uzcard) va telefon raqami — qarzdorlarga yuboriladigan SMS'da "pulni shu kartaga tashlang" deb ko'rsatiladi. Bir nechta karta qo'shsa bo'ladi, bittasi asosiy.
- Til tanlash: **O'zbek (lotin), O'zbek (kirill), Rus**.

### 3.1.1. Eski qog'oz daftarini ko'chirish (onboarding import)
Yangi do'konchining qo'lida yillar davomida yozilgan qog'oz qarz daftari bor — uni qo'lda ko'chirish azob. Shuning uchun **avtomatik import**:

1. **Rasmga olish:** do'konchi daftar sahifasini telefon kamerasida suratga oladi (bir nechta sahifa ketma-ket).
2. **AI o'qiydi:** rasm AI'ga (vision-model, Claude API) yuboriladi — qo'lyozmadagi ism, summa, sanalarni ajratib, jadvalga aylantiradi. O'zbek/rus/kirill-lotin aralash qo'lyozmani ham tushunishga harakat qiladi.
3. **Tekshirish ekrani:** natija jadval ko'rinishida chiqadi — har bir qator: ism / summa / sana. Do'konchi xatolarni to'g'irlaydi, keraksizini o'chiradi ("qo'lyozma har xil bo'ladi, 100% aniqlik bo'lmaydi — tasdiqlash bosqichi majburiy").
4. **Saqlash:** tasdiqlangan yozuvlar bazaga kiradi, mijozlar avtomatik yaratiladi.

Qo'shimcha import usullari:
- **Excel/CSV fayl** yuklash (daftarini allaqachon Excelda yuritganlar uchun).
- **Ovoz orqali ketma-ket aytish:** "Anvar 200 ming, Zulfiya opa 45 ming..." — AI ro'yxatga aylantiradi.
- Telegram Mini App'da ham xuddi shu import ishlaydi (rasmni botga tashlasa ham bo'ladi).

### 3.2. Asosiy ekran (Dashboard)
- Umumiy qarz summasi (menga qarzdorlar).
- Bugun muddati kelgan qarzlar ro'yxati.
- Kechikkan qarzlar (qizil belgi bilan).
- Katta **mikrofon tugmasi** — ovozli kiritish (asosiy funksiya, doim ko'z oldida).

### 3.3. Qarz kiritish — ikki teng usul

**A) Ovoz orqali:**
- Do'konchi mikrofonni bosib gapiradi: *"Karim akaga 120 ming so'm, shanbagacha"*.
- Oqim: **Ovoz → STT (matn) → AI tahlil → tayyor yozuv**:
  - Mijoz ismi: Karim aka
  - Summa: 120 000 so'm
  - Muddat: kelasi shanba (aniq sana)
- Tizim yozuvni **tasdiqlash ekranida** ko'rsatadi — do'konchi "Saqlash" bosadi yoki tahrirlaydi.
- STT: **Mohir.ai** (o'zbek tili uchun) yoki Google Speech-to-Text; tahlil: LLM (Claude API).

**B) Qo'lda kiritish (ovoz bilan teng darajadagi asosiy usul):**
- "+" tugmasi → forma: mijoz tanlash (ro'yxatdan yoki yangi qo'shish), summa (katta raqamli klaviatura), izoh (mahsulot nomi, ixtiyoriy), muddat (kalendar yoki tez tanlov: "1 hafta", "oyning oxiri").
- 3–4 bosishda yozuv tayyor bo'lishi kerak — tezlik asosiy mezon.
- Tez-tez ishlatiladigan summalar shablon bo'lib chiqadi (10 000 / 50 000 / 100 000).
- Internet bo'lmasa ham ishlaydi (offline rejim).

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
4. **Qo'ng'iroqdan keyingi SMS (rekvizitlar bilan):** AI qo'ng'iroq tugagach (ko'tarilgan bo'lsa ham, ko'tarilmagan bo'lsa ham) qarzdorga avtomatik SMS ketadi — qarzdor og'zaki eshitganini unutmasligi va to'lashi oson bo'lishi uchun:

   > *"[Do'kon nomi] do'koniga qarzingiz: 120 000 so'm. To'lash uchun karta: 8600 **** **** 1234 ([do'konchi ismi]). Savollar uchun: +998 90 123 45 67"*

   - SMS'dagi karta raqami va telefon — do'konchi profilida ko'rsatilgan rekvizitlardan olinadi.
   - SMS shabloni admin panelda tahrirlash mumkin; do'konchi ham o'z matnini moslashtira oladi.
   - Qarzdor Telegramda bo'lsa, xuddi shu xabar Telegram orqali ham yuboriladi (SMS'dan arzon).
- Har bir eslatma va qo'ng'iroq do'konchi ilovasida log bo'lib ko'rinadi (yuborildi / yetkazildi / ko'tarildi / SMS ketdi).
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

## 4. Telegram Mini App (mobil ilovaga teng platforma)

> Bu oddiy chat-bot emas — **Telegram Mini App**: Telegram ichida ochiladigan to'liq ilova interfeysi (Payme/Uzum botlaridagi kabi). Do'konchi hech narsa o'rnatmasdan, Telegramning o'zida ishlaydi.

### 4.1. Nega Mini App
- O'zbekistonda deyarli hamma Telegramda — o'rnatish to'sig'i nol.
- App Store/Google Play moderatsiyasisiz tez yangilanadi.
- Mobil ilova bilan **bitta backend, bitta hisob** — do'konchi ilovada yozganini botda ko'radi va aksincha.

### 4.2. Kirish
- Botga `/start` → "Ochish" tugmasi → Mini App ochiladi.
- Avtorizatsiya Telegram hisobi orqali avtomatik; birinchi kirishda telefon raqamni tasdiqlaydi (mobil ilovadagi hisob bilan bog'lanadi).

### 4.3. Funksionallik — mobil ilova bilan to'liq parite
Mini App ichida mobil ilovaning barcha asosiy ekranlari bo'ladi:
- Dashboard: umumiy qarz, bugungi muddatlar, kechikkanlar.
- Qarz kiritish — **ikkala usul**: ovozli (Telegram voice yozib yuboradi → STT → AI tahlil → tasdiqlash) va qo'lda (forma).
- Mijozlar ro'yxati, mijoz sahifasi, to'lov qabul qilish.
- Eslatma sozlamalari, hisobotlar.
- Obuna to'lash (Payme/Click havolasi orqali).

### 4.4. Bot qismining qo'shimcha imkoniyatlari (Mini App'dan tashqari)
- Ovozli xabarni to'g'ridan-to'g'ri botga tashlash — Mini App ochmasdan ham qarz yoziladi (eng tez yo'l).
- Kunlik xulosalar chat ko'rinishida: "Bugun 3 ta qarz muddati keladi".
- Qarzdorlarga eslatmalar ham Telegram orqali yetkaziladi (agar qarzdor Telegramda bo'lsa — SMS'dan arzon).

### 4.5. Texnologiya
- Mini App: React + Telegram Web App SDK (dizayn tizimi mobil ilova bilan bir xil — dark navy + brend ko'k).
- Bot: backend'ning bir moduli (webhook), alohida tizim emas.

---

## 5. Ombor va kassa (POS) moduli — shtrix-kod bilan

> Qarz daftari bilan bir ilovada ishlaydigan to'liq savdo hisobi: do'konga tovar kirishi, ombor qoldig'i, narxlar va sotuv — hammasi telefon kamerasi orqali **shtrix-kod skaneri** bilan. Alohida qurilma kerak emas.

### 5.1. Tovar kirimi (prixod)

**Shtrix-kod qanday ishlaydi (muhim tushuntirish):** shtrix-kodning o'zida mahsulot nomi YO'Q — u faqat raqam (masalan `4780000123456`). Nom har doim **bazadan** olinadi:

1. Do'konchi kodni skaner qiladi → tizim raqamni **bazadan qidiradi**.
2. Topilsa (o'zi oldin kiritgan yoki markaziy katalogda bor) → nomi va narxi avtomatik chiqadi.
3. Topilmasa → do'konchi nomini **bir marta qo'lda yozadi** (nomi, birligi: dona/kg/litr) → shu koddan keyingi barcha skanerlashda avtomatik chiqadi.

**Markaziy katalog:** bir do'konchi kiritgan mahsulot (kod + nom) umumiy bazaga tushadi — boshqa do'konchi o'sha kodni skaner qilsa, nom tayyor chiqadi. Vaqt o'tgan sari katalog o'zi boyib boradi, yangi do'konchilarga deyarli hamma narsa tayyor bo'ladi.

**Kirim jarayoni:**
- Skaner (yoki qo'lda) → mahsulot aniqlanadi → kirim narxi, sotuv narxi, soni kiritiladi.
- **Yaroqlilik muddati (srok) — ixtiyoriy maydon:** mahsulotning srogi bo'lsa (sut, kolbasa, dori...) do'konchi kiritadi; srogi yo'q bo'lsa (sovun, daftar...) — shunchaki o'tkazib yuboradi. Majburiy emas.

**Skaner ishlatishni xohlamasa — hammasi qo'lda ham bo'ladi:**
- Kod raqamini qo'lda terish (kamera ishlamasa yoki kod yirtilgan bo'lsa).
- Umuman kodsiz — mahsulotni faqat nomi bilan kiritish.
- Shtrix-kodsiz mahsulotlar (non, go'sht, tarozida sotiladiganlar) uchun tez tanlov tugmalari.

### 5.2. Ombor (sklad)
- Har bir mahsulot: nomi, shtrix-kod, kirim narxi, sotuv narxi, qoldiq soni.
- Qoldiq avtomatik hisoblanadi: kirim (+) va sotuv (−).
- **Kam qolgan tovar ogohlantirishi:** qoldiq belgilangan chegaradan tushsa, do'konchiga bildirishnoma — "Coca-Cola 1.5L — 3 dona qoldi, buyurtma bering".
- Qidiruv: nomi bo'yicha yoki skaner orqali.
- Inventarizatsiya rejimi: do'konchi javonlarni skaner qilib chiqadi, tizim haqiqiy qoldiq bilan bazadagini solishtirib farqni ko'rsatadi.

### 5.2.1. Yaroqlilik muddati (srok) nazorati
Srok kiritilgan mahsulotlar bo'yicha tizim avtomatik kuzatib boradi:
- **Ogohlantirishlar:** srok tugashiga belgilangan kun qolganda (masalan 7 / 3 / 1 kun — sozlanadi) do'konchiga bildirishnoma: *"Sut 'Musaffo' 1L — srogi 3 kundan keyin tugaydi, 12 dona qoldiqda"*.
- **Srok analitikasi (alohida ekran):**
  - Srogi yaqinlashgan mahsulotlar ro'yxati (kun bo'yicha saralangan, rang bilan: sariq — yaqin, qizil — o'tgan).
  - Srogi o'tgan mahsulotlar — javondan olish kerak bo'lganlar.
  - Srok tufayli hisobdan chiqarilgan tovarlar va ulardan ko'rilgan **zarar summasi** (oylik hisobotda).
- Maqsad: do'konchi srogi yaqin tovarni chegirma bilan tezroq sotib yuborishi yoki keyingi safar kamroq olib kelishi mumkin — pul yo'qotmaydi.

### 5.3. Kassa (sotuv rejimi)
- Katta "Sotuv" tugmasi → skaner ochiladi → mahsulotlarni ketma-ket skaner qiladi (supermarket kassasi kabi).
- Savat: mahsulotlar ro'yxati, soni (+/− bilan o'zgartirish), umumiy summa.
- To'lov turlari: **Naqd / Karta / QARZGA**.
- **Qarz daftari bilan integratsiya (asosiy kuch):** mijoz "yozib qo'ying" desa — do'konchi "Qarzga" tugmasini bosadi → mijozni tanlaydi → savdo avtomatik qarz yozuviga aylanadi (mahsulotlar ro'yxati izohda saqlanadi, muddat qo'yiladi). Qo'lda hech narsa yozish kerak emas.
- Chek: sotuv tarixida saqlanadi; xohlasa mijozga SMS/Telegram orqali ro'yxatini yuboradi.

### 5.4. Savdo hisobotlari
- Kunlik/haftalik/oylik savdo: tushum, sotilgan mahsulotlar soni.
- **Foyda hisobi:** sotuv narxi − kirim narxi = har bir mahsulotdan qancha foyda ko'rilgani.
- Eng ko'p sotiladigan mahsulotlar (top-10), sekin ketayotgan tovarlar.
- Naqd / karta / qarzga sotuvlar nisbati.

### 5.5. Texnik jihatlar
- Skaner: telefon kamerasi orqali (ML Kit / ZXing kutubxonasi) — EAN-13, EAN-8, QR formatlarini o'qiydi, sekundiga tanidi, internetisiz ham ishlaydi.
- Telegram Mini App'da ham skaner ishlaydi (Telegram kamera API orqali).
- Eslatma: bu **ichki hisob-kitob vositasi** — rasmiy fiskal kassa (soliq cheki) o'rnini bosmaydi. Rasmiy chek kerak bo'lsa, keyingi bosqichda fiskal modul provayderlari bilan integratsiya qilinadi.

---

## 6. Admin panel (Web)

> Texnologiya: React + REST API. Faqat admin/super-admin kiradi (login + parol + 2FA).

### 6.1. Dashboard
- Jami foydalanuvchilar, faol obunalar, oylik tushum (MRR).
- Bugungi ro'yxatdan o'tishlar, to'lovlar, qo'ng'iroqlar soni.
- Grafiklar: o'sish dinamikasi, churn (obunani to'xtatganlar).

### 6.2. Foydalanuvchilar boshqaruvi
- Do'konchilar ro'yxati: qidiruv, filtr (viloyat, tarif, holat).
- Profil: ma'lumotlar, obuna tarixi, faollik (oxirgi kirish, yozuvlar soni).
- Bloklash / blokdan chiqarish, obunani qo'lda uzaytirish (sovg'a).

### 6.3. Obuna va to'lovlar
- Tariflarni boshqarish: narx, muddat, funksiyalar to'plami.
- To'lovlar jurnali: kim, qachon, qancha, qaysi tizim orqali (Payme/Click/Uzum).
- Promo-kodlar va chegirmalar yaratish.

### 6.4. AI qo'ng'iroq va xabarlar monitoringi
- Qo'ng'iroqlar jurnali: kimga, qachon, natija (ko'tardi / ko'tarmadi / band), yozib olingan audio.
- SMS/Telegram yuborilganlar statistikasi va xarajati.
- Qo'ng'iroq matnlari (skriptlar) shablonlarini tahrirlash.

### 6.5. Kontent va xabarnomalar
- Barcha yoki tanlangan foydalanuvchilarga push/SMS yuborish (yangilik, aksiya).
- FAQ / yordam bo'limini tahrirlash.

### 6.6. Super-admin
- Admin hisoblarini yaratish, rollarni belgilash.
- Tizim sozlamalari: STT provayder, SMS-shlyuz, telefoniya sozlamalari.
- Audit-log: qaysi admin nima qilgani.

---

## 7. Backend arxitektura

```
Mobil ilova (Flutter)        ──┐
Telegram Mini App (React)    ──┼──►  REST API (backend)  ──►  PostgreSQL
Admin panel (React)          ──┘            │
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

## 8. Dizayn tizimi (logodan kelib chiqqan)

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

## 9. Bosqichlar (roadmap)

| Bosqich | Muddat (taxminiy) | Nima chiqadi |
|---|---|---|
| **1. MVP** | 4–6 hafta | Telegram Mini App + mobil ilova (Android): ro'yxatdan o'tish, qarz daftari (qo'lda + ovozli kiritish), SMS/Telegram eslatma. Oddiy admin panel. |
| **2. Monetizatsiya** | +3 hafta | Payme/Click/Uzum obuna, tariflar, to'liq admin panel. |
| **3. AI qo'ng'iroq** | +4 hafta | Telefoniya integratsiyasi, TTS, qo'ng'iroq skriptlari, monitoring. |
| **4. Ombor va kassa (POS)** | +5–6 hafta | Shtrix-kod skaneri, tovar kirimi, ombor qoldig'i, sotuv rejimi, "qarzga sotish" integratsiyasi, foyda hisobotlari. |
| **5. Kengaytirish** | doimiy | Hisobotlar, eksport, qarzdor uchun web-sahifa, iOS App Store nashri, fiskal modul integratsiyasi. |

---

## 10. Ochiq savollar (kelishib olish kerak)

1. Ilova nomi do'konlarda qanday chiqadi — "ARABIC.ONE" o'zими, yoki qo'shimcha nom bilan (masalan "Arabic.One — Qarz Daftari")?
2. AI qo'ng'iroq qaysi til(lar)da — faqat o'zbekmi, rus ham kerakmi?
3. SMS provayderi bilan shartnoma kim nomiga bo'ladi (Eskiz.uz yuridik shaxs talab qiladi)?
4. Bepul tarif chegaralari qanday bo'lsin (nechta yozuv, nechta mijoz)?
5. Birinchi bosqichda faqat Android (APK) chiqarib, iOS ni 2-bosqichga qoldiramizmi? (App Store nashri ko'proq vaqt va Apple hisob talab qiladi — yiliga $99.)
6. Ombor/kassa moduli qaysi tarifga kiradi — Premium ichidami yoki alohida "Biznes" tarifmi?
7. Rasmiy fiskal chek (soliq) integratsiyasi kerakmi, yoki POS faqat ichki hisob-kitob uchunmi? (Fiskal modul alohida litsenziya va provayder shartnomasini talab qiladi.)
