import { createContext, useContext, useState, type ReactNode } from 'react';

// Uch til: o'zbek (lotin), o'zbek (kirill), rus.
// Kirillcha lug'at qo'lda yozilmaydi — lotinchadan avtomatik o'giriladi,
// shunda ikkala yozuv hech qachon bir-biridan farq qilib qolmaydi.

export type Lang = 'uz' | 'uz_cyrl' | 'ru';

export const LANG_NAMES: Record<Lang, string> = {
  uz: "O'zbekcha (lotin)",
  uz_cyrl: 'Ўзбекча (кирилл)',
  ru: 'Русский',
};

const UZ: Record<string, string> = {
  // Umumiy
  save: 'Saqlash',
  cancel: 'Bekor qilish',
  back: 'Orqaga',
  edit: 'Tahrirlash',
  delete: "O'chirish",
  loading: 'Yuklanmoqda...',
  error: 'Xatolik',
  search: 'Qidirish...',
  saved: 'Saqlandi',
  amount: 'Summa',
  note: 'Izoh',
  optional: 'ixtiyoriy',
  phone: 'Telefon',
  name: 'Ismi',
  dueDate: 'Muddat',
  currency: "so'm",
  pcs: 'dona',
  notSet: 'kiritilmagan',
  required: 'majburiy',

  // Bo'limlar
  tabHome: 'Asosiy',
  tabCustomers: 'Mijozlar',
  tabAdd: 'Qarz yozish',
  tabKassa: 'Kassa',
  tabProfile: 'Profil',
  navScanner: 'Skaner',
  navSuppliers: 'Postavshiklar',
  navReminders: 'Eslatmalar',
  navReports: 'Hisobotlar',
  navInventory: 'Ombor',
  navBalance: 'Balans',
  navPlan: 'Obuna',
  navEmployees: 'Xodimlar',
  navReferral: 'Taklif qilish',
  navShop: "Do'kon",
  navLanguage: 'Til',
  navSettings: 'Sozlamalar',

  // Kirish
  loginSubtitle: "Do'kon Daftari — qarz, ombor, kassa",
  loginPhone: 'Telefon raqamingiz',
  loginGetCode: 'SMS kod olish',
  loginCode: 'SMS kod',
  loginEnter: 'Kirish',
  loginDevHint: 'DEV rejim — kod',
  loginWrongCode: "Kod noto'g'ri",
  setupWelcome: "Xush kelibsiz! Do'koningiz haqida aytib bering:",
  setupShopName: "Do'kon nomi",
  setupOwner: 'Ismingiz',
  setupCard: "Karta raqami (qarzdorlar to'lovi uchun; keyin ham kiritsa bo'ladi)",
  setupStart: 'Boshlash',
  setupNameRequired: "Do'kon nomini kiriting",

  // Asosiy ekran
  owedToMe: 'Menga qarzdorlar',
  iOwe: 'Men qarzdorman',
  tileReminder: 'Eslatma',
  tileSupplier: 'Postavshik',
  tileReport: 'Hisobot',
  tileInventory: 'Ombor',
  overdueDebts: 'Kechikkan qarzlar',
  dueToday: 'Bugun muddati keladi',
  lowStock: 'Kam qolgan tovarlar',
  expiringSoon: 'Srogi yaqin',
  noDueToday: "Bugun muddati keladigan qarz yo'q",

  // Mijozlar
  addCustomer: "Mijoz qo'shish",
  phoneForReminders: 'Telefon (eslatmalar uchun)',
  noCustomers: "Hozircha mijozlar yo'q",
  totalDebt: 'Umumiy qarz',
  debtHistory: 'Qarzlar tarixi',
  statusPaid: "to'langan",
  statusOverdue: 'kechikkan',
  statusActive: 'faol',
  paidLabel: "to'landi",
  paymentAmount: "To'lov summasi",
  acceptPayment: "To'lov qabul qilish",
  noDebts: "Qarzlar yo'q",

  // Qarz yozish
  byVoice: 'Ovoz bilan',
  byHand: "Qo'lda",
  voiceExample: 'Masalan: "Karim akaga 120 ming so\'m, shanbagacha"',
  speak: 'Gapiring',
  listening: 'Eshityapman...',
  orType: 'Yoki yozing',
  analyze: 'Tahlil qilish',
  confirm: 'Tasdiqlang',
  customerName: 'Mijoz ismi',
  addDebtBtn: 'Qarz yozish',
  nameAmountRequired: 'Ism va summa majburiy',
  couldNotParse: "Tushunolmadim — qo'lda kiriting yoki boshqacha ayting",
  noSpeechSupport: "Bu qurilmada ovoz tanish yo'q — matn yozing yoki qo'lda kiriting",

  // Kassa
  modeSale: 'Sotuv',
  modeIntake: 'Tovar kirimi',
  searchProduct: 'Mahsulot nomi yoki shtrix-kod...',
  scanner: 'Skaner',
  stock: 'qoldiq',
  cart: 'Savat',
  payCash: 'Naqd',
  payCard: 'Karta',
  payDebt: 'Qarzga',
  debtCustomerPlaceholder: 'Mijoz ismi (qarz daftariga yoziladi)',
  finishSale: 'Sotuvni yakunlash',
  saleSaved: 'Sotuv saqlandi',
  writtenToDebts: 'qarz daftariga yozildi',
  searchOrScan: 'Mahsulot qidiring yoki skaner qiling',
  debtNeedsCustomer: 'Qarzga sotishda mijoz ismi kerak',
  barcodeLabel: "Shtrix-kod (skaner yoki qo'lda; bo'sh qoldirsa ham bo'ladi)",
  productName: 'Mahsulot nomi',
  productImage: 'Mahsulot rasmi',
  takePhoto: 'Rasm olish / tanlash',
  changePhoto: 'Rasmni almashtirish',
  costPrice: 'Kirim narxi',
  sellPrice: 'Sotuv narxi',
  qty: 'Soni',
  expiry: 'Srok',
  saveIntake: 'Kirimni saqlash',
  productNameRequired: 'Mahsulot nomi majburiy',
  scanHint: 'Shtrix-kodni ramka ichiga keltiring',
  scanNoSupport: "Bu qurilma kamera skanerini qo'llamaydi — kodni qo'lda tering",
  scanNoPermission: "Kameraga ruxsat berilmadi — kodni qo'lda tering",
  close: 'Yopish',

  // Postavshiklar
  myTotalDebt: 'Jami qarzim (postavshiklarga)',
  addSupplierDebt: 'Qarz yozish (tovar oldim)',
  supplierName: 'Postavshik nomi',
  whatGoods: 'Izoh (qanday tovar)',
  payDeadline: "To'lash muddati",
  myDebt: 'Qarzim',
  markPaid: "To'lov qilindi deb belgilash",
  noSuppliers: "Hozircha postavshiklar yo'q",
  nameAmountRequiredShort: 'Nomi va summa majburiy',

  // Hisobotlar
  periodDay: 'Bugun',
  periodWeek: 'Hafta',
  periodMonth: 'Oy',
  revenue: 'Savdo',
  profit: 'Foyda',
  paymentTypes: "To'lov turlari",
  topProducts: "Eng ko'p sotilganlar",
  noSalesPeriod: "Bu davrda savdo bo'lmagan",

  // Ombor
  productsCount: 'xil mahsulot · ombor qiymati',
  filterAll: 'Hammasi',
  filterLow: 'Kam qolgan',
  filterExpiry: 'Srogi yaqin',
  daysLeft: 'kun qoldi',
  daysPassed: "kun o'tgan!",
  noProducts: 'Mahsulot topilmadi',

  // Eslatmalar
  tabSettings: 'Sozlamalar',
  tabLog: 'Jurnal',
  modeOff: "O'chirilgan",
  modeOffDesc: 'Hech qanday eslatma yuborilmaydi',
  modeSoft: 'Yumshoq',
  modeSoftDesc: 'Muddatdan 1 kun oldin bitta xabar',
  modeMedium: "O'rta",
  modeMediumDesc: 'Muddat kuni va kechikkanda har 3 kunda',
  modeCall: "AI qo'ng'iroq",
  modeCallDesc: "O'rta + kechikkanda qo'ng'iroq va rekvizitli SMS",
  defaultMode: 'Standart rejim (yangi mijozlarga)',
  applyToAll: "Shu rejimni barcha mijozlarga qo'llash",
  byCustomer: "Mijozlar bo'yicha",
  noPhone: 'telefon kiritilmagan',
  checkNow: 'Hozir tekshirish',
  reminderHint: 'Tizim har soatda avtomatik tekshiradi. SMS provayderi ulanmaguncha xabarlar faqat jurnalga yoziladi.',
  reminderMode: 'Eslatma rejimi',
  noPhoneWarning: "Diqqat: bu mijozning telefon raqami kiritilmagan — eslatma yuborilmaydi.",
  sent: 'Yuborilgan',
  calls: "Qo'ng'iroq",
  failed: 'Xato',
  notSent: 'yuborilmadi',
  kindBefore: 'Muddatdan oldin',
  kindDue: 'Muddat kuni',
  kindOverdue: 'Kechikkan',
  kindCall: "AI qo'ng'iroq",
  kindAfterCall: "Qo'ng'iroqdan keyin (rekvizit)",
  noReminders: 'Hozircha eslatma yuborilmagan',
  appliedToAll: "Barcha mijozlarga qo'llandi",
  defaultSaved: 'Standart rejim saqlandi',
  remindersQueued: "ta yangi eslatma navbatga qo'yildi",
  noRemindersNow: "Hozircha yuboriladigan eslatma yo'q",

  // Profil
  balanceFrom: 'Obuna haqi shu balansdan yechiladi',
  topup: "To'ldirish",
  topupAmount: "Summani yozing",
  minAmount: 'Minimal summa',
  topupVia: "To'ldirish — Payme / Click / Uzum",
  history: 'Tarix',
  currentPlan: 'Joriy tarif',
  planFree: 'Bepul',
  planExtend: 'Uzaytirish (30 kun)',
  planActivate: 'Faollashtirish',
  planActivated: 'Obuna faollashtirildi!',
  insufficientBalance: "Balansda mablag' yetarli emas — avval balansni to'ldiring",
  monthly: 'oy',
  shopInfo: "Do'kon ma'lumotlari",
  shopName: "Do'kon nomi",
  ownerName: 'Ega ismi',
  cardNumber: 'Karta raqami',
  cardHint: "Karta raqami (qarzdorlarga SMS'da ko'rsatiladi)",
  address: 'Manzil',
  employees: 'Xodimlar (sotuvchilar)',
  inviteFriend: "Do'stingni taklif qil",
  logoutBtn: 'Chiqish',
  employeesHint:
    "Sotuvchi o'z PIN-kodi bilan kiradi: sotadi va qarz yozadi, lekin narx o'zgartirish, o'chirish va hisobotlar faqat sizda qoladi. Har amaliyot kim qilgani yozib boriladi.",
  addEmployee: "Xodim qo'shish",
  pinCode: 'PIN-kod (4 raqam)',
  pinRequired: 'Ism va 4 xonali PIN kerak',
  employeeActive: 'Faol',
  employeeBlocked: 'Bloklangan',
  roleSeller: 'sotuvchi',
  block: 'Bloklash',
  unblock: 'Faollashtirish',
  noEmployees: "Hozircha xodimlar yo'q",
  yourPromoCode: 'Sizning promo-kodingiz',
  share: 'Ulashish',
  copied: 'Nusxalandi!',
  invitedCount: 'Taklif qilganlaringiz',
  shops: "ta do'kon",
  planPremiumF1: 'Cheksiz qarz yozuvlari',
  planPremiumF2: 'Ovozli kiritish',
  planPremiumF3: 'SMS va Telegram eslatmalar',
  planPremiumF4: "AI qo'ng'iroq",
  planBusinessF1: 'Premium hammasi',
  planBusinessF2: 'Ombor va kassa (POS)',
  planBusinessF3: 'Shtrix-kod skaneri',
  planBusinessF4: 'Xodimlar rejimi',
  planBusinessF5: 'AI biznes-maslahatchi',
};

const RU: Record<string, string> = {
  save: 'Сохранить',
  cancel: 'Отмена',
  back: 'Назад',
  edit: 'Изменить',
  delete: 'Удалить',
  loading: 'Загрузка...',
  error: 'Ошибка',
  search: 'Поиск...',
  saved: 'Сохранено',
  amount: 'Сумма',
  note: 'Примечание',
  optional: 'необязательно',
  phone: 'Телефон',
  name: 'Имя',
  dueDate: 'Срок',
  currency: 'сум',
  pcs: 'шт',
  notSet: 'не указано',
  required: 'обязательно',

  tabHome: 'Главная',
  tabCustomers: 'Клиенты',
  tabAdd: 'Записать долг',
  tabKassa: 'Касса',
  tabProfile: 'Профиль',
  navScanner: 'Сканер',
  navSuppliers: 'Поставщики',
  navReminders: 'Напоминания',
  navReports: 'Отчёты',
  navInventory: 'Склад',
  navBalance: 'Баланс',
  navPlan: 'Подписка',
  navEmployees: 'Сотрудники',
  navReferral: 'Пригласить',
  navShop: 'Магазин',
  navLanguage: 'Язык',
  navSettings: 'Настройки',

  loginSubtitle: 'Тетрадь магазина — долги, склад, касса',
  loginPhone: 'Ваш номер телефона',
  loginGetCode: 'Получить SMS-код',
  loginCode: 'SMS-код',
  loginEnter: 'Войти',
  loginDevHint: 'DEV режим — код',
  loginWrongCode: 'Неверный код',
  setupWelcome: 'Добро пожаловать! Расскажите о вашем магазине:',
  setupShopName: 'Название магазина',
  setupOwner: 'Ваше имя',
  setupCard: 'Номер карты (для оплаты долгов; можно указать позже)',
  setupStart: 'Начать',
  setupNameRequired: 'Укажите название магазина',

  owedToMe: 'Мне должны',
  iOwe: 'Я должен',
  tileReminder: 'Напомин.',
  tileSupplier: 'Поставщик',
  tileReport: 'Отчёт',
  tileInventory: 'Склад',
  overdueDebts: 'Просроченные долги',
  dueToday: 'Срок сегодня',
  lowStock: 'Заканчивается товар',
  expiringSoon: 'Скоро истекает срок',
  noDueToday: 'На сегодня сроков нет',

  addCustomer: 'Добавить клиента',
  phoneForReminders: 'Телефон (для напоминаний)',
  noCustomers: 'Пока нет клиентов',
  totalDebt: 'Общий долг',
  debtHistory: 'История долгов',
  statusPaid: 'оплачен',
  statusOverdue: 'просрочен',
  statusActive: 'активен',
  paidLabel: 'оплачено',
  paymentAmount: 'Сумма оплаты',
  acceptPayment: 'Принять оплату',
  noDebts: 'Долгов нет',

  byVoice: 'Голосом',
  byHand: 'Вручную',
  voiceExample: 'Например: «Кариму 120 тысяч сум, до субботы»',
  speak: 'Говорите',
  listening: 'Слушаю...',
  orType: 'Или напишите',
  analyze: 'Разобрать',
  confirm: 'Подтвердите',
  customerName: 'Имя клиента',
  addDebtBtn: 'Записать долг',
  nameAmountRequired: 'Имя и сумма обязательны',
  couldNotParse: 'Не понял — введите вручную или скажите иначе',
  noSpeechSupport: 'На этом устройстве нет распознавания речи — напишите текст',

  modeSale: 'Продажа',
  modeIntake: 'Приход товара',
  searchProduct: 'Название товара или штрих-код...',
  scanner: 'Сканер',
  stock: 'остаток',
  cart: 'Корзина',
  payCash: 'Наличные',
  payCard: 'Карта',
  payDebt: 'В долг',
  debtCustomerPlaceholder: 'Имя клиента (запишется в долги)',
  finishSale: 'Завершить продажу',
  saleSaved: 'Продажа сохранена',
  writtenToDebts: 'записано в долги',
  searchOrScan: 'Найдите товар или отсканируйте',
  debtNeedsCustomer: 'Для продажи в долг нужно имя клиента',
  barcodeLabel: 'Штрих-код (сканер или вручную; можно оставить пустым)',
  productName: 'Название товара',
  productImage: 'Фото товара',
  takePhoto: 'Снять / выбрать фото',
  changePhoto: 'Заменить фото',
  costPrice: 'Цена прихода',
  sellPrice: 'Цена продажи',
  qty: 'Количество',
  expiry: 'Срок годности',
  saveIntake: 'Сохранить приход',
  productNameRequired: 'Название товара обязательно',
  scanHint: 'Наведите штрих-код в рамку',
  scanNoSupport: 'Устройство не поддерживает сканер — введите код вручную',
  scanNoPermission: 'Нет доступа к камере — введите код вручную',
  close: 'Закрыть',

  myTotalDebt: 'Мой долг (поставщикам)',
  addSupplierDebt: 'Записать долг (взял товар)',
  supplierName: 'Название поставщика',
  whatGoods: 'Примечание (какой товар)',
  payDeadline: 'Срок оплаты',
  myDebt: 'Мой долг',
  markPaid: 'Отметить как оплачено',
  noSuppliers: 'Пока нет поставщиков',
  nameAmountRequiredShort: 'Название и сумма обязательны',

  periodDay: 'Сегодня',
  periodWeek: 'Неделя',
  periodMonth: 'Месяц',
  revenue: 'Продажи',
  profit: 'Прибыль',
  paymentTypes: 'Виды оплаты',
  topProducts: 'Самые продаваемые',
  noSalesPeriod: 'За этот период продаж не было',

  productsCount: 'видов товара · стоимость склада',
  filterAll: 'Все',
  filterLow: 'Заканчивается',
  filterExpiry: 'Срок близко',
  daysLeft: 'дн. осталось',
  daysPassed: 'дн. просрочено!',
  noProducts: 'Товар не найден',

  tabSettings: 'Настройки',
  tabLog: 'Журнал',
  modeOff: 'Отключено',
  modeOffDesc: 'Напоминания не отправляются',
  modeSoft: 'Мягкий',
  modeSoftDesc: 'Одно сообщение за 1 день до срока',
  modeMedium: 'Средний',
  modeMediumDesc: 'В день срока и каждые 3 дня при просрочке',
  modeCall: 'AI звонок',
  modeCallDesc: 'Средний + звонок и SMS с реквизитами при просрочке',
  defaultMode: 'Режим по умолчанию (для новых клиентов)',
  applyToAll: 'Применить ко всем клиентам',
  byCustomer: 'По клиентам',
  noPhone: 'телефон не указан',
  checkNow: 'Проверить сейчас',
  reminderHint:
    'Система проверяет каждый час. Пока SMS-провайдер не подключён, сообщения только записываются в журнал.',
  reminderMode: 'Режим напоминаний',
  noPhoneWarning: 'Внимание: у клиента не указан телефон — напоминание не будет отправлено.',
  sent: 'Отправлено',
  calls: 'Звонки',
  failed: 'Ошибки',
  notSent: 'не отправлено',
  kindBefore: 'До срока',
  kindDue: 'День срока',
  kindOverdue: 'Просрочка',
  kindCall: 'AI звонок',
  kindAfterCall: 'После звонка (реквизиты)',
  noReminders: 'Напоминаний пока не было',
  appliedToAll: 'Применено ко всем клиентам',
  defaultSaved: 'Режим по умолчанию сохранён',
  remindersQueued: 'новых напоминаний поставлено в очередь',
  noRemindersNow: 'Пока нет напоминаний к отправке',

  balanceFrom: 'Плата за подписку списывается с этого баланса',
  topup: 'Пополнить',
  topupAmount: 'Введите сумму',
  minAmount: 'Минимальная сумма',
  topupVia: 'Пополнить — Payme / Click / Uzum',
  history: 'История',
  currentPlan: 'Текущий тариф',
  planFree: 'Бесплатный',
  planExtend: 'Продлить (30 дней)',
  planActivate: 'Активировать',
  planActivated: 'Подписка активирована!',
  insufficientBalance: 'Недостаточно средств — сначала пополните баланс',
  monthly: 'мес',
  shopInfo: 'Данные магазина',
  shopName: 'Название магазина',
  ownerName: 'Имя владельца',
  cardNumber: 'Номер карты',
  cardHint: 'Номер карты (показывается должникам в SMS)',
  address: 'Адрес',
  employees: 'Сотрудники (продавцы)',
  inviteFriend: 'Пригласить друга',
  logoutBtn: 'Выйти',
  employeesHint:
    'Продавец входит по своему PIN-коду: продаёт и записывает долги, но изменение цен, удаление и отчёты остаются только у вас. Каждое действие фиксируется.',
  addEmployee: 'Добавить сотрудника',
  pinCode: 'PIN-код (4 цифры)',
  pinRequired: 'Нужно имя и 4-значный PIN',
  employeeActive: 'Активен',
  employeeBlocked: 'Заблокирован',
  roleSeller: 'продавец',
  block: 'Заблокировать',
  unblock: 'Активировать',
  noEmployees: 'Пока нет сотрудников',
  yourPromoCode: 'Ваш промокод',
  share: 'Поделиться',
  copied: 'Скопировано!',
  invitedCount: 'Вы пригласили',
  shops: 'магазинов',
  planPremiumF1: 'Неограниченные записи долгов',
  planPremiumF2: 'Голосовой ввод',
  planPremiumF3: 'SMS и Telegram напоминания',
  planPremiumF4: 'AI звонок',
  planBusinessF1: 'Всё из Premium',
  planBusinessF2: 'Склад и касса (POS)',
  planBusinessF3: 'Сканер штрих-кодов',
  planBusinessF4: 'Режим сотрудников',
  planBusinessF5: 'AI бизнес-советник',
};

/* ─────────── Lotin → Kirill o'girgichi ─────────── */

const DIGRAPHS: [RegExp, string][] = [
  [/o['’ʻ`]/g, 'ў'], [/O['’ʻ`]/g, 'Ў'],
  [/g['’ʻ`]/g, 'ғ'], [/G['’ʻ`]/g, 'Ғ'],
  [/sh/g, 'ш'], [/Sh/g, 'Ш'], [/SH/g, 'Ш'],
  [/ch/g, 'ч'], [/Ch/g, 'Ч'], [/CH/g, 'Ч'],
  [/yo/g, 'ё'], [/Yo/g, 'Ё'],
  [/yu/g, 'ю'], [/Yu/g, 'Ю'],
  [/ya/g, 'я'], [/Ya/g, 'Я'],
  [/ye/g, 'е'], [/Ye/g, 'Е'],
  [/ts/g, 'ц'],
];

const LETTERS: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж',
  k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с',
  t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з',
  A: 'А', B: 'Б', D: 'Д', E: 'Е', F: 'Ф', G: 'Г', H: 'Ҳ', I: 'И', J: 'Ж',
  K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О', P: 'П', Q: 'Қ', R: 'Р', S: 'С',
  T: 'Т', U: 'У', V: 'В', X: 'Х', Y: 'Й', Z: 'З',
};

// Kirillchada o'girilmaydigan atamalar
const KEEP = ['AI', 'SMS', 'PIN', 'POS', 'Arabic.One', 'Payme', 'Click', 'Uzum', 'Telegram', 'DEV'];

export function toCyrillic(text: string): string {
  let out = text;
  const kept: string[] = [];
  // atamalarni vaqtincha belgiga almashtirib turamiz
  KEEP.forEach((w, i) => {
    if (out.includes(w)) {
      kept[i] = w;
      out = out.split(w).join(`\u0000${i}\u0000`);
    }
  });
  for (const [re, rep] of DIGRAPHS) out = out.replace(re, rep);
  out = out.replace(/[a-zA-Z]/g, (ch) => LETTERS[ch] ?? ch);
  // so'z boshidagi "е" → "э" (o'zbek imlosi)
  out = out.replace(/(^|[\s(«"'])е/g, '$1э').replace(/(^|[\s(«"'])Е/g, '$1Э');
  kept.forEach((w, i) => {
    if (w) out = out.split(`\u0000${i}\u0000`).join(w);
  });
  return out;
}

/* ─────────── Kontekst ─────────── */

let currentLang: Lang = (localStorage.getItem('lang') as Lang) || 'uz';

export function translate(key: string, lang: Lang = currentLang): string {
  if (lang === 'ru') return RU[key] ?? UZ[key] ?? key;
  const uz = UZ[key] ?? key;
  return lang === 'uz_cyrl' ? toCyrillic(uz) : uz;
}

// Summa formati — valyuta nomi tilga qarab o'zgaradi
export function fmt(n: number): string {
  return `${new Intl.NumberFormat('uz-UZ').format(n)} ${translate('currency')}`;
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: 'uz',
  setLang: () => {},
  t: (k) => translate(k),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);

  function setLang(l: Lang) {
    currentLang = l;
    localStorage.setItem('lang', l);
    setLangState(l);
  }

  function t(key: string, vars?: Record<string, string | number>) {
    let s = translate(key, lang);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  }

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}
