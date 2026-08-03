# ARABIC.ONE — Texnik Topshiriq (TZ)

**Loyiha:** Do'konchilar uchun raqamli qarz daftari va savdo hisobi — ovozli va qo'lda kiritish, shtrix-kodli ombor/kassa (POS), avtomatik eslatmalar va AI qo'ng'iroq bilan.
**Platformalar:** Android (APK / Google Play), iOS (App Store), **Telegram Mini App**, **brauzer / PWA**, Web Admin Panel.

> **Muhim prinsip:** Mobil ilova va Telegram bot — **teng huquqli ikkita mijoz platformasi**. Do'konchi qaysi biri qulay bo'lsa o'shani ishlataveradi (yoki ikkalasini birga), hamma ma'lumot bitta hisobda sinxron turadi. Qarz kiritish ham ikki usulda teng ishlaydi: **ovoz orqali** va **qo'lda** — ikkalasi ham asosiy usul.
**Brend:** ARABIC.ONE
**Ilova nomi (do'konlarda):** "Arabic.One — Do'kon Daftari" ✅ (tasdiqlangan)
**Versiya:** 1.1

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
| **Do'konchi (ega)** | Asosiy foydalanuvchi. Qarzlar, ombor, kassa, hisobotlar — to'liq huquq. Obuna to'laydi. |
| **Sotuvchi (xodim)** | Ega qo'shadi, alohida PIN bilan kiradi. Sotadi, qarz yozadi — lekin o'chirish/tahrirlash va hisobotlar yopiq. Har amali logda. |
| **Qarzdor (mijoz)** | Ilova o'rnatishi shart emas. SMS/Telegram/qo'ng'iroq orqali eslatma oladi. Ixtiyoriy: havola orqali o'z qarzini ko'radi. |
| **Postavshik (ta'minotchi)** | Do'konchi unga qarzdor bo'lishi mumkin — "Men qarzdorman" bo'limida yuritiladi, to'lov eslatmasi do'konchiga keladi. |
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

### 3.4.1. Ta'minotchilar (postavshik) daftari — "Men qarzdorman"
Do'konchining o'zi ham postavshiklardan qarzga tovar oladi — shu tomonini ham yuritamiz, butun pul aylanmasi bitta ilovada bo'ladi:
- Ikki bo'lim: **"Menga qarzdorlar"** (mijozlar) va **"Men qarzdorman"** (postavshiklar).
- Postavshik yozuvi: nomi/firma, telefon, olingan tovar (izoh), summa, to'lash muddati.
- Muddat yaqinlashganda **do'konchining o'ziga eslatma** keladi: *"Ertaga 'Anvar aka postavshik'ka 2 500 000 so'm to'lash kerak"*.
- Qisman to'lovlar, to'lov tarixi — mijozlar daftari bilan bir xil mexanika.
- Dashboard'da umumiy balans ko'rinadi: menga qarzdorlar jami / men qarzdorman jami / sof holat.
- Kiritish usullari ham bir xil: ovoz orqali (*"Anvar akadan 2 million lik tovar oldim, oyning oxirigacha"*) yoki qo'lda.

### 3.5. Eslatmalar tizimi (eskalatsiya zinasi)
Do'konchi har bir mijoz/qarz uchun rejimni tanlaydi:
1. **Yumshoq:** muddatdan 1 kun oldin SMS/Telegram xabar — "Ertaga qarz muddati keladi".
2. **O'rta:** muddat kuni va keyin har 3 kunda takroriy xabar.
3. **AI qo'ng'iroq:** kechikkanda tizim qarzdorga ovozli qo'ng'iroq qiladi — **o'zbek yoki rus tilida** (mijoz kartochkasida do'konchi qaysi tilni belgilagan bo'lsa, o'shanda; standart — o'zbek). Muloyim matn: *"Assalomu alaykum, [do'kon nomi] do'konidan eslatma: [summa] qarzingizning muddati o'tdi, iltimos to'lab qo'ying"*.
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

### 3.6.1. AI biznes-maslahatchi (ovozli savol-javob)
Do'konchi hisobotlarni titkilamasdan, savolini **ovoz bilan (yoki yozib)** so'raydi — AI do'konning o'z ma'lumotlari asosida javob beradi:
- *"Bu oy qancha foyda qildim?"* → *"Iyul oyida sof foyda 4 200 000 so'm — o'tgan oydan 12% ko'p."*
- *"Eng katta qarzdorim kim?"* → *"Karim aka — 850 000 so'm, oxirgi to'lovi 2 hafta oldin."*
- *"Qaysi tovar yaxshi ketyapti?"* → *"Bu hafta eng ko'p sotilgani: Coca-Cola 1.5L (48 dona)."*
- *"Kimga qo'ng'iroq qildirishim kerak?"* → kechikkan qarzdorlar ro'yxati va tavsiya.
- AI **faqat shu do'konning ma'lumotlariga** tayanadi (boshqa do'konlar ma'lumotini ko'rmaydi), javoblari raqamlar bilan asoslanadi.
- Mobil ilovada ham, Telegram'da ham ishlaydi (botga ovozli savol tashlasa ham bo'ladi).
- Texnologiya: mavjud STT + LLM (Claude API) — qo'shimcha infratuzilma kerak emas.

### 3.7. Obuna va to'lov — balansli model
Obuna **balans orqali** ishlaydi (telefon hisobi kabi):
- Do'konchi **balansiga pul tashlaydi** (Payme / Click / Uzum orqali) — summani **o'zi yozadi** (tayyor variantlar yo'q); **minimal to'ldirish summasi admin panelda belgilanadi** va tizim shu chegarani talab qiladi.
- Obuna haqi (oylik) **balansdan avtomatik yechiladi**; balans yetmasa — to'ldirishni so'raydi.
- **Balans doim ko'rinib turadi:** ilova yuqorisida (header'da) va kabinetda.
- Kabinetda balans tarixi: har bir to'ldirish (+) va yechim (−) sanasi bilan.
- Tarif rejalar (masalan): **Bepul** — cheklangan; **Premium (99 000/oy)** — qarz daftari to'liq; **Biznes (199 000/oy)** — + ombor/kassa/xodimlar (narxlar keyin aniqlanadi).
- Obuna holati, tugash sanasi, avtomatik uzaytirish (balansdan).

**Referal dastur (o'sish kanali):**
- Har do'konchining o'z **taklif havolasi / promo-kodi** bor (ilova ichida "Do'stingni taklif qil" bo'limi).
- Taklif qilingan do'konchi ro'yxatdan o'tib obuna bo'lsa — **ikkalasiga ham 1 oy bepul** obuna qo'shiladi.
- Do'konchi o'z referallarini ko'radi: nechta taklif qildi, nechtasi ulandi, qancha bonus yig'di.
- Cheklovlar admin panelda sozlanadi (masalan oyiga maksimal bonus), suiiste'molga qarshi tekshiruv.

### 3.7.1. Xodim (sotuvchi) rejimi
Ko'p do'konda kassada egasi emas, yollangan sotuvchi o'tiradi — ruxsatlar bo'linishi shart:
- Ega o'z hisobiga **xodim qo'shadi**: ism + alohida PIN-kod (yoki telefon raqam).
- **Sotuvchi qila oladi:** sotuv (kassa), qarz yozish, to'lov qabul qilish, tovar kirimi.
- **Faqat ega qila oladi:** narx o'zgartirish, qarz/sotuvni o'chirish yoki tahrirlash, hisobotlar va foyda ko'rish, karta rekvizitlari, obuna, xodim boshqaruvi.
- **Har bir amaliyotda kim qilgani yozib boriladi** — ega kechqurun ko'radi: qaysi sotuvchi qancha sotdi, nima yozdi, nimani o'zgartirmoqchi bo'ldi.
- Sotuvchi smenasi hisoboti: smena davomidagi savdo, naqd/karta/qarzga bo'linishi.
- Ruxsatlar to'plamini ega o'zi sozlay oladi (masalan ishonchli xodimga hisobotlarni ochish).

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

### 4.6. PWA — brauzerdan ham ilova sifatida
Mini App aynan shu kod bilan **oddiy brauzerda** ham ochiladi (Telegramsiz, qidiruv orqali topib kirsa ham). Brauzer versiyasi **PWA** qilib rasmiylashtiriladi:
- Do'konchi saytni ochib **"Ekranga qo'shish"** bosadi — telefonida ARABIC.ONE ikonkasi paydo bo'ladi.
- Alohida oynada ochiladi (brauzer manzil satri ko'rinmaydi), o'z splash-ekrani bilan — haqiqiy ilovadan farq qilmaydi.
- Ilova qobig'i keshlanadi: internet sekin bo'lsa ham tez ochiladi.
- Play Market/App Store'siz tarqatish yo'li — havolani yuborish kifoya.

Shunday qilib bitta kod uch joyda ishlaydi: **Telegram Mini App**, **brauzer/PWA**, va keyinchalik **Flutter ilova** (Android/iOS).

---

## 5. Foydalanish qulayligi (UX prinsiplari)

Do'konchining qo'li band, mijoz kutib turadi — shuning uchun har bir amal **eng kam bosish** bilan bajarilishi shart. Majburiy qoidalar:

1. **Ikki bosish qoidasi:** eng ko'p ishlatiladigan uchta amal — *sotuv*, *qarz yozish*, *tovar kirimi* — istalgan ekrandan **2 bosishdan oshmasligi** kerak. Menyu ichida menyu bo'lmaydi.
2. **Tezkor amal tugmasi:** har ekranda suzuvchi tugma — bosilganda uchta asosiy amal darhol chiqadi.
3. **Uzluksiz skaner:** kassada skaner **ochiq qoladi** — mahsulotlarni ketma-ket skanerlab savatga qo'shaveradi, har safar tugma bosish shart emas (supermarket kassasi kabi). Ekranda savat summasi ko'rinib turadi.
4. **Kirimda ham uzluksizlik:** bir tovar saqlangach forma yopilmaydi — keyingi tovarni kiritishga tayyor turadi, saqlangani qisqa xabar bilan bildiriladi.
5. **Katta tugmalar:** minimal 44px balandlik (iOS talabi), raqam kiritishda telefon raqamli klaviaturasi ochiladi.
6. **Tasdiqlash — faqat kerak joyda:** o'chirish va pul bilan bog'liq amallardagina; qolgan hollarda darhol bajariladi.
7. **Tebranish (haptic):** savatga qo'shilganda, sotuv yakunlanganda, xatoda — do'konchi ekranga qaramay ham amal bajarilganini his qiladi.

---

## 6. Ombor va kassa (POS) moduli — shtrix-kod bilan

> Qarz daftari bilan bir ilovada ishlaydigan to'liq savdo hisobi: do'konga tovar kirishi, ombor qoldig'i, narxlar va sotuv — hammasi telefon kamerasi orqali **shtrix-kod skaneri** bilan. Alohida qurilma kerak emas.

### 5.1. Tovar kirimi (prixod)

**Shtrix-kod qanday ishlaydi (muhim tushuntirish):** shtrix-kodning o'zida mahsulot nomi YO'Q — u faqat raqam (masalan `4780000123456`). Nom har doim **bazadan** olinadi:

1. Do'konchi kodni skaner qiladi → tizim raqamni **bazadan qidiradi**.
2. Topilsa (o'zi oldin kiritgan yoki markaziy katalogda bor) → nomi va narxi avtomatik chiqadi.
3. Topilmasa → do'konchi nomini **bir marta qo'lda yozadi** (nomi, birligi: dona/kg/litr) → shu koddan keyingi barcha skanerlashda avtomatik chiqadi.

**Markaziy katalog:** bir do'konchi kiritgan mahsulot (kod + nom) umumiy bazaga tushadi — boshqa do'konchi o'sha kodni skaner qilsa, nom tayyor chiqadi. Vaqt o'tgan sari katalog o'zi boyib boradi, yangi do'konchilarga deyarli hamma narsa tayyor bo'ladi.

**Kirim jarayoni:**
- Skaner (yoki qo'lda) → mahsulot aniqlanadi → kirim narxi, sotuv narxi, soni kiritiladi.
- **Mahsulot rasmi (ixtiyoriy):** do'konchi mahsulotni telefon kamerasida suratga oladi yoki galereyadan tanlaydi — kassada va omborda mahsulot rasm bilan ko'rinadi (topish oson bo'ladi). Rasm avtomatik kichraytiriladi (trafik tejash uchun).
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

## 7. Admin panel (Web)

> Texnologiya: React + REST API. Faqat admin/super-admin kiradi (login + parol + 2FA).

### 7.1. Dashboard
- Jami foydalanuvchilar, faol obunalar, oylik tushum (MRR).
- Bugungi ro'yxatdan o'tishlar, to'lovlar, qo'ng'iroqlar soni.
- Grafiklar: o'sish dinamikasi, churn (obunani to'xtatganlar).

### 7.2. Foydalanuvchilar boshqaruvi
- Do'konchilar ro'yxati: qidiruv, filtr (viloyat, tarif, holat).
- Profil: ma'lumotlar, obuna tarixi, faollik (oxirgi kirish, yozuvlar soni).
- Bloklash / blokdan chiqarish, obunani qo'lda uzaytirish (sovg'a).

### 7.3. Obuna va to'lovlar
- Tariflarni boshqarish: narx, muddat, funksiyalar to'plami.
- To'lovlar jurnali: kim, qachon, qancha, qaysi tizim orqali (Payme/Click/Uzum).
- Promo-kodlar va chegirmalar yaratish.
- **Referal dastur boshqaruvi:** bonus miqdori va shartlarini sozlash, referal statistikasi (kim nechta olib keldi), suiiste'molni aniqlash va bloklash.
- **Balans sozlamalari:** minimal to'ldirish summasini belgilash (do'konchi ilovada shu chegaradan kam summa kirita olmaydi), balans harakatlari monitoringi.

### 7.4. AI qo'ng'iroq va xabarlar monitoringi
- Qo'ng'iroqlar jurnali: kimga, qachon, natija (ko'tardi / ko'tarmadi / band), yozib olingan audio.
- SMS/Telegram yuborilganlar statistikasi va xarajati.
- Qo'ng'iroq matnlari (skriptlar) shablonlarini tahrirlash.

### 7.5. Kontent va xabarnomalar
- Barcha yoki tanlangan foydalanuvchilarga push/SMS yuborish (yangilik, aksiya).
- FAQ / yordam bo'limini tahrirlash.

### 7.6. Super-admin
- Admin hisoblarini yaratish, rollarni belgilash.
- Tizim sozlamalari: STT provayder, SMS-shlyuz, telefoniya sozlamalari.
- Audit-log: qaysi admin nima qilgani.

### 7.7. Amalga oshirilgan (v1)

Admin panel React'da yozildi va backendga ulandi (`/admin/*` API, alohida token turi — do'konchi tokeni bilan kirib bo'lmaydi).

| Bo'lim | Nima qiladi |
|---|---|
| Panel | Do'konlar soni, faol obunalar, bugungi ro'yxatdan o'tishlar, bloklanganlar, MRR, 14 kunlik grafik |
| Do'konlar | Qidiruv/filtr, do'kon kartochkasi: statistika, obuna sovg'a qilish, balansni tuzatish, bloklash |
| To'lovlar | To'ldirish va obuna yechimlari jurnali, CSV yuklab olish |
| Eslatmalar | SMS / Telegram / AI qo'ng'iroq tarixi, yuborilgan matnni ko'rish |
| Referallar | Kim nechta do'kon olib kelgan |
| Sozlamalar | Tizim qiymatlari (pastdagi jadval) |
| Adminlar | Admin yaratish, parolni almashtirish, bloklash (faqat super-admin) |
| Audit jurnali | Har bir admin harakati yozib boriladi |

**Sozlamalar kalitlari** (`settings` jadvali). Bu yerda o'zgartirilgan qiymat darhol mijoz ilovasiga tatbiq bo'ladi — kodda qotib qolmagan:

| Kalit | Ma'nosi | Boshlang'ich |
|---|---|---|
| `min_topup_amount` | **Minimal to'ldirish summasi** — ilova bundan kam summani qabul qilmaydi | 10 000 |
| `price_premium` | Premium tarif narxi (30 kun) | 99 000 |
| `price_business` | Biznes tarif narxi (30 kun) | 199 000 |
| `trial_days` | Yangi do'kon uchun sinov muddati | 14 |
| `referral_bonus` | Taklif uchun bonus | 20 000 |
| `sms_price` / `call_price` | 1 ta SMS / AI qo'ng'iroq tannarxi | 150 / 900 |
| `support_phone` / `support_telegram` | Ilovada ko'rsatiladigan yordam kontakti | — |

> Birinchi ishga tushirishda `admin / admin123` hisobi avtomatik yaratiladi. Ishlab chiqarishga chiqarishdan oldin `.env` dagi `ADMIN_PASSWORD` ni albatta o'zgartirish kerak.

---

## 8. Backend arxitektura

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

## 9. Dizayn tizimi — Apple (iOS) uslubi

Butun mahsulot **Apple dizayn tiliga** quriladi: yorug' oq fonlar, guruhlangan oq kartochkalar, iOS'dagi kabi rangli gradient kvadrat (squircle) ikonkalar. **Emoji ishlatilmaydi** — barcha ikonkalar SF Symbols uslubida chizilgan SVG.

| Element | Qiymat |
|---|---|
| Asosiy fon | iOS tizim foni `#F2F2F7` (och kulrang-oq) |
| Kartochkalar | Oq `#FFFFFF`, radius 14px, yengil soya |
| Aksent | iOS blue `#007AFF` (brend ko'kiga mos) |
| Matn | Qora `#1C1C1E`, ikkilamchi: `#8E8E93` |
| Muvaffaqiyat | iOS green `#34C759` |
| Ogohlantirish | iOS red `#FF3B30`, sariq `#FF9500` |
| Ikonkalar | SF Symbols uslubidagi chiziqli SVG; bo'lim ikonkalari — iOS ilovalari kabi gradientli kvadratlar (yashil/qizil/ko'k/sariq) |
| Shrift | SF Pro / -apple-system — iOS tizim shrifti |
| Uslub | iOS guruhlangan ro'yxatlar (inset grouped list), blur'li pastki tab-bar, katta tugmalar |

Logo: gradient ko'k kvadratda oq "A" — ilova ikonkasi va splash-ekranda. Mahsulotlar ro'yxatlarda **o'z rasmi bilan** ko'rinadi (rasm bo'lmasa — kulrang quti ikonkasi).

---

## 10. Bosqichlar (roadmap)

| Bosqich | Muddat (taxminiy) | Nima chiqadi |
|---|---|---|
| **1. MVP** | 4–6 hafta | Telegram Mini App + mobil ilova (Android): ro'yxatdan o'tish, qarz daftari (qo'lda + ovozli kiritish), SMS/Telegram eslatma. Oddiy admin panel. |
| **2. Monetizatsiya** | +3 hafta | Payme/Click/Uzum obuna, tariflar, to'liq admin panel. |
| **3. AI qo'ng'iroq** | +4 hafta | Telefoniya integratsiyasi, TTS, qo'ng'iroq skriptlari, monitoring. |
| **4. Ombor va kassa (POS)** | +5–6 hafta | Shtrix-kod skaneri, tovar kirimi, ombor qoldig'i, sotuv rejimi, "qarzga sotish" integratsiyasi, foyda hisobotlari. |
| **5. Kengaytirish** | doimiy | Postavshik daftari, xodim rejimi, AI biznes-maslahatchi, referal dastur, qarzdor uchun web-sahifa, iOS App Store nashri, fiskal modul integratsiyasi. |

---

## 11. Qarorlar va ochiq savollar

| # | Savol | Holat | Qaror |
|---|---|---|---|
| 1 | Ilova nomi | ✅ **Hal qilindi** | **"Arabic.One — Do'kon Daftari"**. Play Market tavsifi va kalit so'zlarga: "qarz daftari, sklad, kassa, shtrix kod, do'kon programmasi" qo'shiladi. |
| 2 | AI qo'ng'iroq tili | ✅ **Hal qilindi** | **O'zbek + Rus**. Mijoz kartochkasida til belgilanadi, standart — o'zbek. |
| 3 | SMS/to'lov shartnomalari uchun yuridik shaxs | ⏳ **Jarayonda** | Asoschilar o'zlari hal qilishadi (MChJ/YaTT). Eskiz.uz, Payme, Click shartnomalari shu nomga bo'ladi. Backend ishlariga to'siq emas — test rejimda boshlayveramiz. |
| 4 | Bepul tarif chegaralari | 🔜 **Keyinroq** | Tariflar keyin o'ylanadi. Ishchi taklif (o'zgarishi mumkin): 20 mijoz, cheksiz yozuv, faqat qo'lda kiritish. |
| 5 | Android birinchi, iOS keyin | ✅ **Tavsiya qabul** | Birinchi bosqich — Android (APK + Play Market). iOS Flutter tufayli tayyor turadi, 2-bosqichda nashr qilinadi. |
| 6 | POS qaysi tarifda | 🔜 **Keyinroq** | Tariflar bilan birga hal qilinadi. Ishchi taklif: alohida "Biznes" tarif (Premium + POS + xodimlar + AI maslahatchi). |
| 7 | Fiskal chek integratsiyasi | ✅ **Tavsiya qabul** | MVP'da yo'q — POS ichki hisob-kitob uchun. Talab bo'lsa 5-bosqichda qo'shiladi. |
