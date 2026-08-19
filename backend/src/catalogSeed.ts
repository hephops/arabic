// Markaziy katalogning boshlang'ich to'ldirilishi.
//
// Bo'limlar daraxti platformaning va'dasini belgilaydi: bu faqat oziq-ovqat
// do'koni uchun emas. Atir do'koni, elektronika, oyoq kiyim — hammasi
// shu yerda o'z bo'limini topishi kerak.
//
// Tovarlarga SHTRIX-KOD YOZILMAGAN va bu ataylab: o'ylab topilgan kod
// haqiqiy zavod kodi bilan to'qnashib, boshqa tovarni ko'rsatib qo'yardi.
// Do'konchi tovarni birinchi marta skanerlaganda kod o'zi biriktiriladi.

import { db } from './db.js';
import { productSearchKey } from './search.js';

interface CatNode {
  uz: string;
  ru: string;
  glyph: string;
  color: string;
  kids: { uz: string; ru: string }[];
}

/** Ildiz bo'limlar va ular ichidagilar */
export const CATEGORY_TREE: CatNode[] = [
  {
    uz: 'Ichimliklar', ru: 'Напитки', glyph: 'bottle', color: 'blue',
    kids: [
      { uz: 'Gazli ichimliklar', ru: 'Газированные напитки' },
      { uz: 'Suvlar', ru: 'Вода' },
      { uz: 'Sharbatlar', ru: 'Соки' },
      { uz: 'Energetik ichimliklar', ru: 'Энергетики' },
      { uz: 'Choy va kofe', ru: 'Чай и кофе' },
      { uz: 'Pivo va alkogol', ru: 'Пиво и алкоголь' },
    ],
  },
  {
    uz: 'Sut mahsulotlari', ru: 'Молочные продукты', glyph: 'milk', color: 'teal',
    kids: [
      { uz: 'Sut va qaymoq', ru: 'Молоко и сливки' },
      { uz: 'Yogurt va tvorog', ru: 'Йогурт и творог' },
      { uz: 'Pishloq', ru: 'Сыр' },
      { uz: 'Sariyog va margarin', ru: 'Масло и маргарин' },
      { uz: 'Qatiq va ayron', ru: 'Кефир и айран' },
    ],
  },
  {
    uz: 'Non va shirinliklar', ru: 'Хлеб и сладости', glyph: 'bread', color: 'orange',
    kids: [
      { uz: 'Non va bulochka', ru: 'Хлеб и булочки' },
      { uz: 'Pechenye va vafli', ru: 'Печенье и вафли' },
      { uz: 'Shokolad va konfet', ru: 'Шоколад и конфеты' },
      { uz: 'Tort va pirojniy', ru: 'Торты и пирожные' },
      { uz: 'Saqich va karamel', ru: 'Жвачка и карамель' },
    ],
  },
  {
    uz: "Go'sht va kolbasa", ru: 'Мясо и колбасы', glyph: 'meat', color: 'red',
    kids: [
      { uz: 'Kolbasa va sosiska', ru: 'Колбаса и сосиски' },
      { uz: "Go'sht konservasi", ru: 'Мясные консервы' },
      { uz: "Muzlatilgan go'sht", ru: 'Замороженное мясо' },
      { uz: 'Baliq va dengiz mahsulotlari', ru: 'Рыба и морепродукты' },
    ],
  },
  {
    uz: 'Baqqollik', ru: 'Бакалея', glyph: 'boxes', color: 'yellow',
    kids: [
      { uz: "Yog' va sirka", ru: 'Масло и уксус' },
      { uz: 'Un va yorma', ru: 'Мука и крупы' },
      { uz: 'Shakar va tuz', ru: 'Сахар и соль' },
      { uz: 'Makaron va tugmacha', ru: 'Макароны' },
      { uz: 'Ziravor va souslar', ru: 'Специи и соусы' },
      { uz: 'Konserva va murabbo', ru: 'Консервы и варенье' },
    ],
  },
  {
    uz: 'Meva va sabzavot', ru: 'Фрукты и овощи', glyph: 'leaf', color: 'green',
    kids: [
      { uz: 'Mevalar', ru: 'Фрукты' },
      { uz: 'Sabzavotlar', ru: 'Овощи' },
      { uz: 'Koʻkatlar', ru: 'Зелень' },
      { uz: 'Quruq mevalar va yongʻoq', ru: 'Сухофрукты и орехи' },
    ],
  },
  {
    uz: 'Muzlatilgan mahsulotlar', ru: 'Заморозка', glyph: 'snow', color: 'teal',
    kids: [
      { uz: 'Muzqaymoq', ru: 'Мороженое' },
      { uz: 'Yarim tayyor mahsulotlar', ru: 'Полуфабрикаты' },
      { uz: 'Muzlatilgan sabzavot', ru: 'Замороженные овощи' },
    ],
  },
  {
    uz: 'Gigiena va parvarish', ru: 'Гигиена и уход', glyph: 'drop', color: 'mint',
    kids: [
      { uz: 'Shampun va sovun', ru: 'Шампунь и мыло' },
      { uz: 'Tish pastasi va choʻtka', ru: 'Зубная паста и щётки' },
      { uz: 'Bir martalik buyumlar', ru: 'Одноразовые товары' },
      { uz: 'Ustara va soqol vositalari', ru: 'Бритьё' },
      { uz: 'Ayollar gigienasi', ru: 'Женская гигиена' },
    ],
  },
  {
    uz: 'Parfumeriya va kosmetika', ru: 'Парфюмерия и косметика', glyph: 'sparkle', color: 'pink',
    kids: [
      { uz: 'Erkaklar atri', ru: 'Мужская парфюмерия' },
      { uz: 'Ayollar atri', ru: 'Женская парфюмерия' },
      { uz: 'Yuz parvarishi', ru: 'Уход за лицом' },
      { uz: 'Krem va loson', ru: 'Кремы и лосьоны' },
      { uz: 'Dekorativ kosmetika', ru: 'Декоративная косметика' },
      { uz: 'Soch parvarishi', ru: 'Уход за волосами' },
      { uz: 'Tirnoq va lak', ru: 'Ногти и лаки' },
    ],
  },
  {
    uz: "Uy-roʻzgʻor kimyosi", ru: 'Бытовая химия', glyph: 'spray', color: 'indigo',
    kids: [
      { uz: 'Kir yuvish vositalari', ru: 'Стирка' },
      { uz: 'Idish yuvish', ru: 'Мытьё посуды' },
      { uz: 'Tozalash vositalari', ru: 'Чистящие средства' },
      { uz: 'Hasharotlarga qarshi', ru: 'От насекомых' },
      { uz: 'Xushboʻy vositalar', ru: 'Освежители' },
    ],
  },
  {
    uz: 'Elektronika', ru: 'Электроника', glyph: 'plug', color: 'gray',
    kids: [
      { uz: 'Telefon aksessuarlari', ru: 'Аксессуары для телефонов' },
      { uz: 'Quloqchin va kolonka', ru: 'Наушники и колонки' },
      { uz: 'Batareyka va zaryadlagich', ru: 'Батарейки и зарядки' },
      { uz: 'Kabel va adapter', ru: 'Кабели и адаптеры' },
      { uz: 'Maishiy texnika', ru: 'Бытовая техника' },
      { uz: 'Lampochka va yoritish', ru: 'Лампы и освещение' },
      { uz: 'Xotira kartalari va flesh', ru: 'Карты памяти и флешки' },
    ],
  },
  {
    uz: 'Kiyim va oyoq kiyim', ru: 'Одежда и обувь', glyph: 'shirt', color: 'purple',
    kids: [
      { uz: 'Erkaklar kiyimi', ru: 'Мужская одежда' },
      { uz: 'Ayollar kiyimi', ru: 'Женская одежда' },
      { uz: 'Bolalar kiyimi', ru: 'Детская одежда' },
      { uz: 'Oyoq kiyim', ru: 'Обувь' },
      { uz: 'Paypoq va ichki kiyim', ru: 'Носки и бельё' },
      { uz: 'Bosh kiyim va aksessuar', ru: 'Головные уборы и аксессуары' },
      { uz: 'Sumka va hamyon', ru: 'Сумки и кошельки' },
    ],
  },
  {
    uz: 'Bolalar uchun', ru: 'Для детей', glyph: 'gift', color: 'pink',
    kids: [
      { uz: 'Bolalar ovqati', ru: 'Детское питание' },
      { uz: 'Podguznik va salfetka', ru: 'Подгузники и салфетки' },
      { uz: "Oʻyinchoqlar", ru: 'Игрушки' },
      { uz: 'Bolalar gigienasi', ru: 'Детская гигиена' },
    ],
  },
  {
    uz: 'Uy anjomlari', ru: 'Товары для дома', glyph: 'house', color: 'amber',
    kids: [
      { uz: 'Idish-tovoq', ru: 'Посуда' },
      { uz: 'Oshxona jihozlari', ru: 'Кухонные принадлежности' },
      { uz: 'Toʻshak va matolar', ru: 'Текстиль' },
      { uz: 'Tozalash anjomlari', ru: 'Уборочный инвентарь' },
      { uz: 'Shamlar va bezaklar', ru: 'Свечи и декор' },
    ],
  },
  {
    uz: 'Kanselyariya', ru: 'Канцтовары', glyph: 'note', color: 'yellow',
    kids: [
      { uz: 'Daftar va qogʻoz', ru: 'Тетради и бумага' },
      { uz: 'Yozuv qurollari', ru: 'Пишущие принадлежности' },
      { uz: 'Maktab buyumlari', ru: 'Школьные товары' },
      { uz: 'Ofis buyumlari', ru: 'Офисные товары' },
    ],
  },
  {
    uz: "Sogʻliq", ru: 'Здоровье', glyph: 'heart', color: 'red',
    kids: [
      { uz: 'Vitaminlar va BFQ', ru: 'Витамины и БАД' },
      { uz: 'Tibbiy buyumlar', ru: 'Медицинские товары' },
      { uz: 'Niqob va antiseptik', ru: 'Маски и антисептики' },
    ],
  },
  {
    uz: 'Tamaki mahsulotlari', ru: 'Табачные изделия', glyph: 'boxes', color: 'gray',
    kids: [
      { uz: 'Sigaretalar', ru: 'Сигареты' },
      { uz: 'Zajigalka va gugurt', ru: 'Зажигалки и спички' },
    ],
  },
  {
    uz: 'Hayvonlar uchun', ru: 'Зоотовары', glyph: 'paw', color: 'amber',
    kids: [
      { uz: 'Mushuk va it ovqati', ru: 'Корм для кошек и собак' },
      { uz: 'Hayvon aksessuarlari', ru: 'Аксессуары для животных' },
    ],
  },
  {
    uz: 'Avto tovarlar', ru: 'Автотовары', glyph: 'truck', color: 'gray',
    kids: [
      { uz: 'Moy va suyuqliklar', ru: 'Масла и жидкости' },
      { uz: 'Avto aksessuarlar', ru: 'Автоаксессуары' },
      { uz: 'Avto kimyosi', ru: 'Автохимия' },
    ],
  },
  {
    uz: 'Bogʻ va qurilish', ru: 'Сад и стройка', glyph: 'tool', color: 'green',
    kids: [
      { uz: 'Asboblar', ru: 'Инструменты' },
      { uz: "Boʻyoq va lak", ru: 'Краски и лаки' },
      { uz: 'Urugʻ va oʻgʻit', ru: 'Семена и удобрения' },
      { uz: 'Elektr mollari', ru: 'Электротовары' },
    ],
  },
];

type SeedProduct = [
  category: string,   // ota bo'lim / ichki bo'lim
  name: string,
  ru: string | null,
  brand: string | null,
  volume: number | null,
  vunit: string | null,
  unit: string,
];

/**
 * Boshlang'ich tovarlar. Bir tovarning har hajmi alohida yozuv —
 * do'konchi "Coca-Cola" ni emas, "Coca-Cola 1.5 l" ni sotadi.
 */
export const SEED_PRODUCTS: SeedProduct[] = [
  // ── Gazli ichimliklar ──
  ['Ichimliklar/Gazli ichimliklar', 'Coca-Cola 0.5 l', 'Кока-Кола 0.5 л', 'Coca-Cola', 0.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Coca-Cola 1 l', 'Кока-Кола 1 л', 'Coca-Cola', 1, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Coca-Cola 1.5 l', 'Кока-Кола 1.5 л', 'Coca-Cola', 1.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Coca-Cola 2 l', 'Кока-Кола 2 л', 'Coca-Cola', 2, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Coca-Cola Zero 1.5 l', 'Кока-Кола Зеро 1.5 л', 'Coca-Cola', 1.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Pepsi 0.5 l', 'Пепси 0.5 л', 'Pepsi', 0.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Pepsi 1 l', 'Пепси 1 л', 'Pepsi', 1, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Pepsi 1.5 l', 'Пепси 1.5 л', 'Pepsi', 1.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Pepsi 2 l', 'Пепси 2 л', 'Pepsi', 2, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Fanta 0.5 l', 'Фанта 0.5 л', 'Fanta', 0.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Fanta 1.5 l', 'Фанта 1.5 л', 'Fanta', 1.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Sprite 0.5 l', 'Спрайт 0.5 л', 'Sprite', 0.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Sprite 1.5 l', 'Спрайт 1.5 л', 'Sprite', 1.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Mirinda 1.5 l', 'Миринда 1.5 л', 'Mirinda', 1.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', '7UP 1.5 l', '7UP 1.5 л', '7UP', 1.5, 'l', 'dona'],

  // ── Suvlar ──
  ['Ichimliklar/Suvlar', 'Nestle Pure Life 0.5 l', 'Нестле 0.5 л', 'Nestle', 0.5, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Nestle Pure Life 1.5 l', 'Нестле 1.5 л', 'Nestle', 1.5, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Nestle Pure Life 5 l', 'Нестле 5 л', 'Nestle', 5, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Hydrolife 0.5 l', 'Гидролайф 0.5 л', 'Hydrolife', 0.5, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Hydrolife 1.5 l', 'Гидролайф 1.5 л', 'Hydrolife', 1.5, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Chortoq mineral suv 0.5 l', 'Чартак 0.5 л', 'Chortoq', 0.5, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Chortoq mineral suv 1.5 l', 'Чартак 1.5 л', 'Chortoq', 1.5, 'l', 'dona'],

  // ── Sharbatlar ──
  ['Ichimliklar/Sharbatlar', 'Sharbat olma 1 l', 'Сок яблочный 1 л', null, 1, 'l', 'dona'],
  ['Ichimliklar/Sharbatlar', 'Sharbat apelsin 1 l', 'Сок апельсиновый 1 л', null, 1, 'l', 'dona'],
  ['Ichimliklar/Sharbatlar', 'Sharbat shaftoli 1 l', 'Сок персиковый 1 л', null, 1, 'l', 'dona'],
  ['Ichimliklar/Sharbatlar', 'Sharbat pomidor 1 l', 'Сок томатный 1 л', null, 1, 'l', 'dona'],

  // ── Energetik ──
  ['Ichimliklar/Energetik ichimliklar', 'Red Bull 250 ml', 'Ред Булл 250 мл', 'Red Bull', 250, 'ml', 'dona'],
  ['Ichimliklar/Energetik ichimliklar', 'Adrenaline Rush 0.5 l', 'Адреналин 0.5 л', 'Adrenaline', 0.5, 'l', 'dona'],
  ['Ichimliklar/Energetik ichimliklar', 'Gorilla 0.45 l', 'Горилла 0.45 л', 'Gorilla', 0.45, 'l', 'dona'],

  // ── Choy va kofe ──
  ['Ichimliklar/Choy va kofe', "Choy koʻk 100 g", 'Чай зелёный 100 г', null, 100, 'g', 'dona'],
  ['Ichimliklar/Choy va kofe', 'Choy qora 100 g', 'Чай чёрный 100 г', null, 100, 'g', 'dona'],
  ['Ichimliklar/Choy va kofe', 'Nescafe Classic 50 g', 'Нескафе Классик 50 г', 'Nescafe', 50, 'g', 'dona'],
  ['Ichimliklar/Choy va kofe', 'Nescafe 3 in 1', 'Нескафе 3 в 1', 'Nescafe', 1, 'dona', 'dona'],
  ['Ichimliklar/Choy va kofe', 'Jacobs Monarch 95 g', 'Якобс Монарх 95 г', 'Jacobs', 95, 'g', 'dona'],

  // ── Sut ──
  ['Sut mahsulotlari/Sut va qaymoq', 'Sut 1 l', 'Молоко 1 л', null, 1, 'l', 'dona'],
  ['Sut mahsulotlari/Sut va qaymoq', 'Sut 0.5 l', 'Молоко 0.5 л', null, 0.5, 'l', 'dona'],
  ['Sut mahsulotlari/Sut va qaymoq', 'Qaymoq 200 g', 'Сливки 200 г', null, 200, 'g', 'dona'],
  ['Sut mahsulotlari/Yogurt va tvorog', 'Yogurt 200 g', 'Йогурт 200 г', null, 200, 'g', 'dona'],
  ['Sut mahsulotlari/Yogurt va tvorog', 'Tvorog 200 g', 'Творог 200 г', null, 200, 'g', 'dona'],
  ['Sut mahsulotlari/Pishloq', 'Pishloq', 'Сыр', null, null, null, 'kg'],
  ['Sut mahsulotlari/Pishloq', 'Suluguni 300 g', 'Сулугуни 300 г', null, 300, 'g', 'dona'],
  ['Sut mahsulotlari/Sariyog va margarin', 'Sariyog 200 g', 'Масло сливочное 200 г', null, 200, 'g', 'dona'],
  ['Sut mahsulotlari/Qatiq va ayron', 'Qatiq 0.5 l', 'Кефир 0.5 л', null, 0.5, 'l', 'dona'],
  ['Sut mahsulotlari/Qatiq va ayron', 'Ayron 0.5 l', 'Айран 0.5 л', null, 0.5, 'l', 'dona'],

  // ── Non va shirinliklar ──
  ['Non va shirinliklar/Non va bulochka', 'Non (mahalliy)', 'Хлеб (местный)', null, null, null, 'dona'],
  ['Non va shirinliklar/Non va bulochka', 'Non 500 g', 'Хлеб 500 г', null, 500, 'g', 'dona'],
  ['Non va shirinliklar/Non va bulochka', 'Bulochka', 'Булочка', null, null, null, 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Snickers 50 g', 'Сникерс 50 г', 'Snickers', 50, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Twix 55 g', 'Твикс 55 г', 'Twix', 55, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Mars 50 g', 'Марс 50 г', 'Mars', 50, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Alpen Gold 90 g', 'Альпен Гольд 90 г', 'Alpen Gold', 90, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Konfet (aralash)', 'Конфеты (ассорти)', null, null, null, 'kg'],
  ['Non va shirinliklar/Pechenye va vafli', 'Pechenye', 'Печенье', null, null, null, 'kg'],
  ['Non va shirinliklar/Pechenye va vafli', 'Vafli', 'Вафли', null, null, null, 'kg'],
  ['Non va shirinliklar/Saqich va karamel', 'Orbit', 'Орбит', 'Orbit', 1, 'dona', 'dona'],
  ['Non va shirinliklar/Saqich va karamel', 'Dirol', 'Дирол', 'Dirol', 1, 'dona', 'dona'],

  // ── Go'sht ──
  ['Goʻsht va kolbasa/Kolbasa va sosiska', 'Kolbasa (doʻkon)', 'Колбаса', null, null, null, 'kg'],
  ['Goʻsht va kolbasa/Kolbasa va sosiska', 'Sosiska 500 g', 'Сосиски 500 г', null, 500, 'g', 'dona'],
  ['Goʻsht va kolbasa/Goʻsht konservasi', 'Tushonka 340 g', 'Тушёнка 340 г', null, 340, 'g', 'dona'],
  ['Goʻsht va kolbasa/Baliq va dengiz mahsulotlari', 'Baliq konservasi 240 g', 'Рыбные консервы 240 г', null, 240, 'g', 'dona'],

  // ── Baqqollik ──
  ['Baqqollik/Yogʻ va sirka', "Paxta yogʻi 1 l", 'Масло хлопковое 1 л', null, 1, 'l', 'dona'],
  ['Baqqollik/Yogʻ va sirka', "Kungaboqar yogʻi 1 l", 'Масло подсолнечное 1 л', null, 1, 'l', 'dona'],
  ['Baqqollik/Yogʻ va sirka', "Kungaboqar yogʻi 5 l", 'Масло подсолнечное 5 л', null, 5, 'l', 'dona'],
  ['Baqqollik/Un va yorma', 'Un 1 kg', 'Мука 1 кг', null, 1, 'kg', 'dona'],
  ['Baqqollik/Un va yorma', 'Un 50 kg', 'Мука 50 кг', null, 50, 'kg', 'dona'],
  ['Baqqollik/Un va yorma', 'Guruch', 'Рис', null, null, null, 'kg'],
  ['Baqqollik/Un va yorma', 'Grechka', 'Гречка', null, null, null, 'kg'],
  ['Baqqollik/Shakar va tuz', 'Shakar 1 kg', 'Сахар 1 кг', null, 1, 'kg', 'dona'],
  ['Baqqollik/Shakar va tuz', 'Tuz 1 kg', 'Соль 1 кг', null, 1, 'kg', 'dona'],
  ['Baqqollik/Makaron va tugmacha', 'Makaron 400 g', 'Макароны 400 г', null, 400, 'g', 'dona'],
  ['Baqqollik/Ziravor va souslar', 'Ketchup 500 g', 'Кетчуп 500 г', null, 500, 'g', 'dona'],
  ['Baqqollik/Ziravor va souslar', 'Mayonez 400 g', 'Майонез 400 г', null, 400, 'g', 'dona'],
  ['Baqqollik/Konserva va murabbo', 'Murabbo 500 g', 'Варенье 500 г', null, 500, 'g', 'dona'],

  // ── Meva-sabzavot ──
  ['Meva va sabzavot/Mevalar', 'Olma', 'Яблоки', null, null, null, 'kg'],
  ['Meva va sabzavot/Mevalar', 'Banan', 'Бананы', null, null, null, 'kg'],
  ['Meva va sabzavot/Mevalar', 'Apelsin', 'Апельсины', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Kartoshka', 'Картофель', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Piyoz', 'Лук', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Sabzi', 'Морковь', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Pomidor', 'Помидоры', null, null, null, 'kg'],
  ['Meva va sabzavot/Quruq mevalar va yongʻoq', 'Mayiz', 'Изюм', null, null, null, 'kg'],
  ['Meva va sabzavot/Quruq mevalar va yongʻoq', 'Yongʼoq', 'Орехи', null, null, null, 'kg'],
  ['Meva va sabzavot/Quruq mevalar va yongʻoq', 'Semichka', 'Семечки', null, null, null, 'kg'],

  // ── Muzlatilgan ──
  ['Muzlatilgan mahsulotlar/Muzqaymoq', 'Muzqaymoq (stakan)', 'Мороженое (стакан)', null, null, null, 'dona'],
  ['Muzlatilgan mahsulotlar/Muzqaymoq', 'Muzqaymoq (briket)', 'Мороженое (брикет)', null, null, null, 'dona'],
  ['Muzlatilgan mahsulotlar/Yarim tayyor mahsulotlar', 'Manti (muzlatilgan)', 'Манты замороженные', null, null, null, 'kg'],
  ['Muzlatilgan mahsulotlar/Yarim tayyor mahsulotlar', 'Pelmen 800 g', 'Пельмени 800 г', null, 800, 'g', 'dona'],

  // ── Gigiena ──
  ['Gigiena va parvarish/Shampun va sovun', 'Shampun 400 ml', 'Шампунь 400 мл', null, 400, 'ml', 'dona'],
  ['Gigiena va parvarish/Shampun va sovun', 'Head & Shoulders 400 ml', 'Хед энд Шолдерс 400 мл', 'Head & Shoulders', 400, 'ml', 'dona'],
  ['Gigiena va parvarish/Shampun va sovun', 'Sovun 100 g', 'Мыло 100 г', null, 100, 'g', 'dona'],
  ['Gigiena va parvarish/Shampun va sovun', 'Suyuq sovun 500 ml', 'Жидкое мыло 500 мл', null, 500, 'ml', 'dona'],
  ['Gigiena va parvarish/Tish pastasi va choʻtka', 'Colgate 100 ml', 'Колгейт 100 мл', 'Colgate', 100, 'ml', 'dona'],
  ['Gigiena va parvarish/Tish pastasi va choʻtka', 'Tish choʻtkasi', 'Зубная щётка', null, 1, 'dona', 'dona'],
  ['Gigiena va parvarish/Bir martalik buyumlar', 'Salfetka', 'Салфетки', null, 1, 'dona', 'dona'],
  ['Gigiena va parvarish/Bir martalik buyumlar', 'Tualet qogʻozi', 'Туалетная бумага', null, 1, 'dona', 'dona'],
  ['Gigiena va parvarish/Ustara va soqol vositalari', 'Ustara (bir martalik)', 'Бритва одноразовая', null, 1, 'dona', 'dona'],
  ['Gigiena va parvarish/Ayollar gigienasi', 'Prokladka', 'Прокладки', null, 1, 'dona', 'dona'],

  // ── Parfumeriya va kosmetika ──
  ['Parfumeriya va kosmetika/Erkaklar atri', 'Erkaklar atri 100 ml', 'Мужской парфюм 100 мл', null, 100, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Erkaklar atri', 'Erkaklar atri 50 ml', 'Мужской парфюм 50 мл', null, 50, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Erkaklar atri', 'Dezodorant (erkaklar) 150 ml', 'Дезодорант мужской 150 мл', null, 150, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Ayollar atri', 'Ayollar atri 100 ml', 'Женский парфюм 100 мл', null, 100, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Ayollar atri', 'Ayollar atri 50 ml', 'Женский парфюм 50 мл', null, 50, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Ayollar atri', 'Dezodorant (ayollar) 150 ml', 'Дезодорант женский 150 мл', null, 150, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Krem va loson', 'Yuz kremi 50 ml', 'Крем для лица 50 мл', null, 50, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Krem va loson', 'Qoʻl kremi 75 ml', 'Крем для рук 75 мл', null, 75, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Krem va loson', 'Tana kremi 200 ml', 'Крем для тела 200 мл', null, 200, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Krem va loson', 'Quyoshdan himoya krem 50 ml', 'Солнцезащитный крем 50 мл', null, 50, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Yuz parvarishi', 'Yuz niqobi', 'Маска для лица', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Yuz parvarishi', 'Mitsellyar suv 200 ml', 'Мицеллярная вода 200 мл', null, 200, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Dekorativ kosmetika', 'Lab boʻyogʻi', 'Помада', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Dekorativ kosmetika', 'Tush (kipriklar uchun)', 'Тушь для ресниц', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Dekorativ kosmetika', 'Pudra', 'Пудра', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Soch parvarishi', 'Soch balzami 400 ml', 'Бальзам для волос 400 мл', null, 400, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Soch parvarishi', 'Soch boʻyogʻi', 'Краска для волос', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Tirnoq va lak', 'Tirnoq laki', 'Лак для ногтей', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Tirnoq va lak', 'Lak tozalagich 100 ml', 'Жидкость для снятия лака 100 мл', null, 100, 'ml', 'dona'],

  // ── Uy-ro'zg'or kimyosi ──
  ['Uy-roʻzgʻor kimyosi/Kir yuvish vositalari', 'Kir yuvish kukuni 3 kg', 'Стиральный порошок 3 кг', null, 3, 'kg', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Kir yuvish vositalari', 'Kir yuvish kukuni 450 g', 'Стиральный порошок 450 г', null, 450, 'g', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Kir yuvish vositalari', 'Kir yumshatgich 1 l', 'Кондиционер для белья 1 л', null, 1, 'l', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Idish yuvish', 'Idish yuvish vositasi 500 ml', 'Средство для посуды 500 мл', null, 500, 'ml', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Tozalash vositalari', 'Oq (oqartirgich) 1 l', 'Белизна 1 л', null, 1, 'l', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Tozalash vositalari', 'Oyna tozalagich 500 ml', 'Средство для стёкол 500 мл', null, 500, 'ml', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Hasharotlarga qarshi', 'Chivinga qarshi spray', 'Спрей от комаров', null, 1, 'dona', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Xushboʻy vositalar', 'Havo xushboʻylagich 300 ml', 'Освежитель воздуха 300 мл', null, 300, 'ml', 'dona'],

  // ── Elektronika ──
  ['Elektronika/Telefon aksessuarlari', 'Telefon gʻilofi', 'Чехол для телефона', null, 1, 'dona', 'dona'],
  ['Elektronika/Telefon aksessuarlari', 'Himoya oynasi', 'Защитное стекло', null, 1, 'dona', 'dona'],
  ['Elektronika/Telefon aksessuarlari', 'Popsocket', 'Попсокет', null, 1, 'dona', 'dona'],
  ['Elektronika/Quloqchin va kolonka', 'Simli quloqchin', 'Проводные наушники', null, 1, 'dona', 'dona'],
  ['Elektronika/Quloqchin va kolonka', 'Bluetooth quloqchin', 'Bluetooth наушники', null, 1, 'dona', 'dona'],
  ['Elektronika/Quloqchin va kolonka', 'Bluetooth kolonka', 'Bluetooth колонка', null, 1, 'dona', 'dona'],
  ['Elektronika/Batareyka va zaryadlagich', 'Batareyka AA (2 dona)', 'Батарейки AA (2 шт)', null, 2, 'dona', 'dona'],
  ['Elektronika/Batareyka va zaryadlagich', 'Batareyka AAA (2 dona)', 'Батарейки AAA (2 шт)', null, 2, 'dona', 'dona'],
  ['Elektronika/Batareyka va zaryadlagich', 'Quvvat banki 10000 mAh', 'Повербанк 10000 мАч', null, 1, 'dona', 'dona'],
  ['Elektronika/Batareyka va zaryadlagich', 'Zaryadlagich (adapter)', 'Зарядное устройство', null, 1, 'dona', 'dona'],
  ['Elektronika/Kabel va adapter', 'USB-C kabel 1 m', 'Кабель USB-C 1 м', null, 1, 'dona', 'dona'],
  ['Elektronika/Kabel va adapter', 'Lightning kabel 1 m', 'Кабель Lightning 1 м', null, 1, 'dona', 'dona'],
  ['Elektronika/Kabel va adapter', 'Micro-USB kabel 1 m', 'Кабель Micro-USB 1 м', null, 1, 'dona', 'dona'],
  ['Elektronika/Kabel va adapter', 'Uzaytirgich (5 rozetka)', 'Удлинитель (5 розеток)', null, 1, 'dona', 'dona'],
  ['Elektronika/Lampochka va yoritish', 'LED lampochka 10 W', 'LED лампа 10 Вт', null, 10, 'dona', 'dona'],
  ['Elektronika/Lampochka va yoritish', 'Fonar (qoʻl chirogʻi)', 'Фонарик', null, 1, 'dona', 'dona'],
  ['Elektronika/Xotira kartalari va flesh', 'Flesh xotira 32 GB', 'Флешка 32 ГБ', null, 32, 'dona', 'dona'],
  ['Elektronika/Xotira kartalari va flesh', 'MicroSD 64 GB', 'MicroSD 64 ГБ', null, 64, 'dona', 'dona'],
  ['Elektronika/Maishiy texnika', 'Dazmol', 'Утюг', null, 1, 'dona', 'dona'],
  ['Elektronika/Maishiy texnika', 'Elektr chaynak', 'Электрочайник', null, 1, 'dona', 'dona'],

  // ── Kiyim va oyoq kiyim ──
  ['Kiyim va oyoq kiyim/Erkaklar kiyimi', 'Erkaklar futbolkasi', 'Мужская футболка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Erkaklar kiyimi', 'Erkaklar koʻylagi', 'Мужская рубашка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Erkaklar kiyimi', 'Erkaklar shimi', 'Мужские брюки', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Ayollar kiyimi', 'Ayollar koʻylagi', 'Женское платье', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Ayollar kiyimi', 'Ayollar bluzkasi', 'Женская блузка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Bolalar kiyimi', 'Bolalar futbolkasi', 'Детская футболка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Oyoq kiyim', 'Krossovka', 'Кроссовки', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Oyoq kiyim', 'Tufli', 'Туфли', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Oyoq kiyim', 'Shippak', 'Тапочки', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Oyoq kiyim', 'Etik', 'Сапоги', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Paypoq va ichki kiyim', 'Paypoq', 'Носки', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Paypoq va ichki kiyim', 'Ichki kiyim', 'Нижнее бельё', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Bosh kiyim va aksessuar', 'Kepka', 'Кепка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Bosh kiyim va aksessuar', 'Sharf', 'Шарф', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Sumka va hamyon', 'Sumka', 'Сумка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Sumka va hamyon', 'Hamyon', 'Кошелёк', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Sumka va hamyon', 'Ryukzak', 'Рюкзак', null, 1, 'dona', 'dona'],

  // ── Bolalar ──
  ['Bolalar uchun/Bolalar ovqati', 'Bolalar pyuresi 100 g', 'Детское пюре 100 г', null, 100, 'g', 'dona'],
  ['Bolalar uchun/Bolalar ovqati', 'Bolalar suti 400 g', 'Детская смесь 400 г', null, 400, 'g', 'dona'],
  ['Bolalar uchun/Podguznik va salfetka', 'Podguznik (oʻrta)', 'Подгузники (средние)', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Podguznik va salfetka', 'Nam salfetka', 'Влажные салфетки', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Oʻyinchoqlar', 'Mashina (oʻyinchoq)', 'Машинка (игрушка)', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Oʻyinchoqlar', "Qoʻgʻirchoq", 'Кукла', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Oʻyinchoqlar', 'Konstruktor', 'Конструктор', null, 1, 'dona', 'dona'],

  // ── Uy anjomlari ──
  ['Uy anjomlari/Idish-tovoq', 'Tarelka', 'Тарелка', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Idish-tovoq', 'Piyola', 'Пиала', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Idish-tovoq', 'Choynak', 'Чайник заварочный', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Oshxona jihozlari', 'Pichoq', 'Нож', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Oshxona jihozlari', 'Qoshiq (6 dona)', 'Ложки (6 шт)', null, 6, 'dona', 'dona'],
  ['Uy anjomlari/Toʻshak va matolar', 'Sochiq', 'Полотенце', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Toʻshak va matolar', 'Choyshab', 'Простыня', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Tozalash anjomlari', 'Supurgi', 'Веник', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Tozalash anjomlari', 'Latta (pol uchun)', 'Тряпка для пола', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Shamlar va bezaklar', 'Sham', 'Свеча', null, 1, 'dona', 'dona'],

  // ── Kanselyariya ──
  ['Kanselyariya/Daftar va qogʻoz', 'Daftar 48 varaq', 'Тетрадь 48 листов', null, 48, 'dona', 'dona'],
  ['Kanselyariya/Daftar va qogʻoz', 'Daftar 12 varaq', 'Тетрадь 12 листов', null, 12, 'dona', 'dona'],
  ['Kanselyariya/Daftar va qogʻoz', 'A4 qogʻoz (500 varaq)', 'Бумага A4 (500 листов)', null, 500, 'dona', 'dona'],
  ['Kanselyariya/Yozuv qurollari', 'Ruchka', 'Ручка', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Yozuv qurollari', 'Qalam', 'Карандаш', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Yozuv qurollari', 'Marker', 'Маркер', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Maktab buyumlari', 'Chizgʻich', 'Линейка', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Maktab buyumlari', 'Oʻchirgʻich', 'Ластик', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Maktab buyumlari', 'Ranglar (12 rang)', 'Краски (12 цветов)', null, 12, 'dona', 'dona'],
  ['Kanselyariya/Ofis buyumlari', 'Stepler', 'Степлер', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Ofis buyumlari', 'Skotch', 'Скотч', null, 1, 'dona', 'dona'],

  // ── Sog'liq ──
  ['Sogʻliq/Vitaminlar va BFQ', 'Vitamin C', 'Витамин C', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Vitaminlar va BFQ', 'Multivitamin', 'Мультивитамины', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Tibbiy buyumlar', 'Bint', 'Бинт', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Tibbiy buyumlar', 'Plastir', 'Пластырь', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Tibbiy buyumlar', 'Termometr', 'Термометр', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Niqob va antiseptik', 'Tibbiy niqob (10 dona)', 'Медицинская маска (10 шт)', null, 10, 'dona', 'dona'],
  ['Sogʻliq/Niqob va antiseptik', 'Antiseptik 100 ml', 'Антисептик 100 мл', null, 100, 'ml', 'dona'],

  // ── Tamaki ──
  ['Tamaki mahsulotlari/Zajigalka va gugurt', 'Zajigalka', 'Зажигалка', null, 1, 'dona', 'dona'],
  ['Tamaki mahsulotlari/Zajigalka va gugurt', 'Gugurt', 'Спички', null, 1, 'dona', 'dona'],

  // ── Hayvonlar ──
  ['Hayvonlar uchun/Mushuk va it ovqati', 'Mushuk ovqati 400 g', 'Корм для кошек 400 г', null, 400, 'g', 'dona'],
  ['Hayvonlar uchun/Mushuk va it ovqati', 'It ovqati 500 g', 'Корм для собак 500 г', null, 500, 'g', 'dona'],
  ['Hayvonlar uchun/Hayvon aksessuarlari', 'Boʻyinbogʻ (hayvon uchun)', 'Ошейник', null, 1, 'dona', 'dona'],

  // ── Avto ──
  ['Avto tovarlar/Moy va suyuqliklar', 'Motor moyi 4 l', 'Моторное масло 4 л', null, 4, 'l', 'dona'],
  ['Avto tovarlar/Moy va suyuqliklar', 'Antifriz 5 l', 'Антифриз 5 л', null, 5, 'l', 'dona'],
  ['Avto tovarlar/Avto aksessuarlar', 'Avto xushboʻylagich', 'Автоароматизатор', null, 1, 'dona', 'dona'],
  ['Avto tovarlar/Avto aksessuarlar', 'Avto gilamchasi', 'Автоковрик', null, 1, 'dona', 'dona'],
  ['Avto tovarlar/Avto kimyosi', 'Oyna suyuqligi 5 l', 'Стеклоомыватель 5 л', null, 5, 'l', 'dona'],

  // ── Bog' va qurilish ──
  ['Bogʻ va qurilish/Asboblar', 'Bolgʻa', 'Молоток', null, 1, 'dona', 'dona'],
  ['Bogʻ va qurilish/Asboblar', 'Otvertka toʻplami', 'Набор отвёрток', null, 1, 'dona', 'dona'],
  ['Bogʻ va qurilish/Asboblar', 'Ruletka 5 m', 'Рулетка 5 м', null, 5, 'dona', 'dona'],
  ['Bogʻ va qurilish/Boʻyoq va lak', 'Boʻyoq (oq) 1 kg', 'Краска белая 1 кг', null, 1, 'kg', 'dona'],
  ['Bogʻ va qurilish/Urugʻ va oʻgʻit', 'Urugʻ (sabzavot)', 'Семена овощей', null, 1, 'dona', 'dona'],
  ['Bogʻ va qurilish/Elektr mollari', 'Rozetka', 'Розетка', null, 1, 'dona', 'dona'],
  ['Bogʻ va qurilish/Elektr mollari', 'Vklyuchatel', 'Выключатель', null, 1, 'dona', 'dona'],
];


/**
 * Ikkinchi to'plam — bo'limlarni to'ldirish uchun.
 * Alohida ro'yxat: birinchisi qaysi tovarlardan boshlanganini
 * ko'rsatib turadi, yangilari esa oxiriga qo'shilaveradi.
 */
export const SEED_PRODUCTS_2: SeedProduct[] = [
  // ── Ichimliklar ──
  ['Ichimliklar/Gazli ichimliklar', 'Fanta 2 l', 'Фанта 2 л', 'Fanta', 2, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Sprite 1 l', 'Спрайт 1 л', 'Sprite', 1, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Sprite 2 l', 'Спрайт 2 л', 'Sprite', 2, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Mirinda 0.5 l', 'Миринда 0.5 л', 'Mirinda', 0.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', '7UP 0.5 l', '7UP 0.5 л', '7UP', 0.5, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Coca-Cola 0.25 l (banka)', 'Кока-Кола 0.25 л', 'Coca-Cola', 0.25, 'l', 'dona'],
  ['Ichimliklar/Gazli ichimliklar', 'Pepsi 0.25 l (banka)', 'Пепси 0.25 л', 'Pepsi', 0.25, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Nestle Pure Life 10 l', 'Нестле 10 л', 'Nestle', 10, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Hydrolife 5 l', 'Гидролайф 5 л', 'Hydrolife', 5, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Chortoq mineral suv 5 l', 'Чартак 5 л', 'Chortoq', 5, 'l', 'dona'],
  ['Ichimliklar/Suvlar', 'Zam Zam suv 1.5 l', 'Зам Зам 1.5 л', 'Zam Zam', 1.5, 'l', 'dona'],
  ['Ichimliklar/Sharbatlar', 'Sharbat uzum 1 l', 'Сок виноградный 1 л', null, 1, 'l', 'dona'],
  ['Ichimliklar/Sharbatlar', 'Sharbat anor 1 l', 'Сок гранатовый 1 л', null, 1, 'l', 'dona'],
  ['Ichimliklar/Sharbatlar', 'Sharbat multifrukt 1 l', 'Сок мультифрукт 1 л', null, 1, 'l', 'dona'],
  ['Ichimliklar/Sharbatlar', 'Sharbat olma 0.2 l', 'Сок яблочный 0.2 л', null, 0.2, 'l', 'dona'],
  ['Ichimliklar/Energetik ichimliklar', 'Red Bull 355 ml', 'Ред Булл 355 мл', 'Red Bull', 355, 'ml', 'dona'],
  ['Ichimliklar/Energetik ichimliklar', 'Flash Up 0.45 l', 'Флэш Ап 0.45 л', 'Flash', 0.45, 'l', 'dona'],
  ['Ichimliklar/Choy va kofe', 'Choy koʻk 250 g', 'Чай зелёный 250 г', null, 250, 'g', 'dona'],
  ['Ichimliklar/Choy va kofe', 'Choy qora 250 g', 'Чай чёрный 250 г', null, 250, 'g', 'dona'],
  ['Ichimliklar/Choy va kofe', 'Choy paketli (25 dona)', 'Чай в пакетиках (25 шт)', null, 25, 'dona', 'dona'],
  ['Ichimliklar/Choy va kofe', 'Nescafe Gold 95 g', 'Нескафе Голд 95 г', 'Nescafe', 95, 'g', 'dona'],
  ['Ichimliklar/Pivo va alkogol', 'Pivo 0.5 l (shisha)', 'Пиво 0.5 л', null, 0.5, 'l', 'dona'],
  ['Ichimliklar/Pivo va alkogol', 'Pivo 1 l', 'Пиво 1 л', null, 1, 'l', 'dona'],

  // ── Sut mahsulotlari ──
  ['Sut mahsulotlari/Sut va qaymoq', 'Sut 1.5 l', 'Молоко 1.5 л', null, 1.5, 'l', 'dona'],
  ['Sut mahsulotlari/Sut va qaymoq', 'Sut (quyuqlashtirilgan) 380 g', 'Сгущённое молоко 380 г', null, 380, 'g', 'dona'],
  ['Sut mahsulotlari/Sut va qaymoq', 'Smetana 200 g', 'Сметана 200 г', null, 200, 'g', 'dona'],
  ['Sut mahsulotlari/Sut va qaymoq', 'Smetana 400 g', 'Сметана 400 г', null, 400, 'g', 'dona'],
  ['Sut mahsulotlari/Yogurt va tvorog', 'Yogurt 500 g', 'Йогурт 500 г', null, 500, 'g', 'dona'],
  ['Sut mahsulotlari/Yogurt va tvorog', 'Yogurt ichimlik 300 ml', 'Питьевой йогурт 300 мл', null, 300, 'ml', 'dona'],
  ['Sut mahsulotlari/Yogurt va tvorog', 'Tvorog 500 g', 'Творог 500 г', null, 500, 'g', 'dona'],
  ['Sut mahsulotlari/Pishloq', 'Pishloq (plavlenniy) 100 g', 'Плавленый сыр 100 г', null, 100, 'g', 'dona'],
  ['Sut mahsulotlari/Pishloq', 'Brinza', 'Брынза', null, null, null, 'kg'],
  ['Sut mahsulotlari/Sariyog va margarin', 'Sariyog 500 g', 'Масло сливочное 500 г', null, 500, 'g', 'dona'],
  ['Sut mahsulotlari/Sariyog va margarin', 'Margarin 200 g', 'Маргарин 200 г', null, 200, 'g', 'dona'],
  ['Sut mahsulotlari/Qatiq va ayron', 'Qatiq 1 l', 'Кефир 1 л', null, 1, 'l', 'dona'],
  ['Sut mahsulotlari/Qatiq va ayron', 'Ayron 1 l', 'Айран 1 л', null, 1, 'l', 'dona'],
  ['Sut mahsulotlari/Qatiq va ayron', 'Suzma 400 g', 'Сузьма 400 г', null, 400, 'g', 'dona'],

  // ── Non va shirinliklar ──
  ['Non va shirinliklar/Non va bulochka', 'Lavash', 'Лаваш', null, null, null, 'dona'],
  ['Non va shirinliklar/Non va bulochka', 'Baton', 'Батон', null, null, null, 'dona'],
  ['Non va shirinliklar/Non va bulochka', 'Suxari 200 g', 'Сухари 200 г', null, 200, 'g', 'dona'],
  ['Non va shirinliklar/Pechenye va vafli', 'Pechenye 300 g', 'Печенье 300 г', null, 300, 'g', 'dona'],
  ['Non va shirinliklar/Pechenye va vafli', 'Vafli 200 g', 'Вафли 200 г', null, 200, 'g', 'dona'],
  ['Non va shirinliklar/Pechenye va vafli', 'Krekker 150 g', 'Крекер 150 г', null, 150, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Bounty 55 g', 'Баунти 55 г', 'Bounty', 55, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'KitKat 40 g', 'КитКат 40 г', 'KitKat', 40, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Milka 90 g', 'Милка 90 г', 'Milka', 90, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Nutella 350 g', 'Нутелла 350 г', 'Nutella', 350, 'g', 'dona'],
  ['Non va shirinliklar/Shokolad va konfet', 'Halva', 'Халва', null, null, null, 'kg'],
  ['Non va shirinliklar/Tort va pirojniy', 'Tort (kichik)', 'Торт (маленький)', null, null, null, 'dona'],
  ['Non va shirinliklar/Tort va pirojniy', 'Keks', 'Кекс', null, null, null, 'dona'],
  ['Non va shirinliklar/Saqich va karamel', 'Karamel', 'Карамель', null, null, null, 'kg'],
  ['Non va shirinliklar/Saqich va karamel', 'Chupa Chups', 'Чупа Чупс', 'Chupa Chups', 1, 'dona', 'dona'],

  // ── Go'sht ──
  ['Goʻsht va kolbasa/Kolbasa va sosiska', 'Sosiska 1 kg', 'Сосиски 1 кг', null, 1, 'kg', 'dona'],
  ['Goʻsht va kolbasa/Kolbasa va sosiska', 'Vetchina', 'Ветчина', null, null, null, 'kg'],
  ['Goʻsht va kolbasa/Kolbasa va sosiska', 'Kazi', 'Казы', null, null, null, 'kg'],
  ['Goʻsht va kolbasa/Muzlatilgan goʻsht', 'Tovuq (butun)', 'Курица (тушка)', null, null, null, 'kg'],
  ['Goʻsht va kolbasa/Muzlatilgan goʻsht', 'Tovuq filesi', 'Куриное филе', null, null, null, 'kg'],
  ['Goʻsht va kolbasa/Muzlatilgan goʻsht', 'Mol goʻshti', 'Говядина', null, null, null, 'kg'],
  ['Goʻsht va kolbasa/Muzlatilgan goʻsht', 'Qoʻy goʻshti', 'Баранина', null, null, null, 'kg'],
  ['Goʻsht va kolbasa/Baliq va dengiz mahsulotlari', 'Seld (tuzlangan)', 'Селёдка', null, null, null, 'kg'],
  ['Goʻsht va kolbasa/Baliq va dengiz mahsulotlari', 'Baliq (muzlatilgan)', 'Рыба замороженная', null, null, null, 'kg'],

  // ── Baqqollik ──
  ['Baqqollik/Yogʻ va sirka', 'Zaytun yogʻi 500 ml', 'Оливковое масло 500 мл', null, 500, 'ml', 'dona'],
  ['Baqqollik/Yogʻ va sirka', 'Sirka 500 ml', 'Уксус 500 мл', null, 500, 'ml', 'dona'],
  ['Baqqollik/Un va yorma', 'Un 5 kg', 'Мука 5 кг', null, 5, 'kg', 'dona'],
  ['Baqqollik/Un va yorma', 'Un 25 kg', 'Мука 25 кг', null, 25, 'kg', 'dona'],
  ['Baqqollik/Un va yorma', 'Mosh', 'Маш', null, null, null, 'kg'],
  ['Baqqollik/Un va yorma', 'Loviya', 'Фасоль', null, null, null, 'kg'],
  ['Baqqollik/Un va yorma', 'Noʻxat', 'Горох', null, null, null, 'kg'],
  ['Baqqollik/Un va yorma', 'Yasmiq', 'Чечевица', null, null, null, 'kg'],
  ['Baqqollik/Un va yorma', 'Manniy yormasi', 'Манная крупа', null, null, null, 'kg'],
  ['Baqqollik/Shakar va tuz', 'Shakar 5 kg', 'Сахар 5 кг', null, 5, 'kg', 'dona'],
  ['Baqqollik/Shakar va tuz', 'Shakar 50 kg', 'Сахар 50 кг', null, 50, 'kg', 'dona'],
  ['Baqqollik/Shakar va tuz', 'Tuz 500 g', 'Соль 500 г', null, 500, 'g', 'dona'],
  ['Baqqollik/Makaron va tugmacha', 'Makaron 1 kg', 'Макароны 1 кг', null, 1, 'kg', 'dona'],
  ['Baqqollik/Makaron va tugmacha', 'Vermishel 400 g', 'Вермишель 400 г', null, 400, 'g', 'dona'],
  ['Baqqollik/Makaron va tugmacha', 'Doshirak', 'Доширак', 'Doshirak', 1, 'dona', 'dona'],
  ['Baqqollik/Ziravor va souslar', 'Ketchup 1 kg', 'Кетчуп 1 кг', null, 1, 'kg', 'dona'],
  ['Baqqollik/Ziravor va souslar', 'Mayonez 800 g', 'Майонез 800 г', null, 800, 'g', 'dona'],
  ['Baqqollik/Ziravor va souslar', 'Soya sousi 200 ml', 'Соевый соус 200 мл', null, 200, 'ml', 'dona'],
  ['Baqqollik/Ziravor va souslar', 'Qora murch 50 g', 'Чёрный перец 50 г', null, 50, 'g', 'dona'],
  ['Baqqollik/Ziravor va souslar', 'Zira 50 g', 'Зира 50 г', null, 50, 'g', 'dona'],
  ['Baqqollik/Ziravor va souslar', 'Lavr bargi 10 g', 'Лавровый лист 10 г', null, 10, 'g', 'dona'],
  ['Baqqollik/Konserva va murabbo', 'Asal 500 g', 'Мёд 500 г', null, 500, 'g', 'dona'],
  ['Baqqollik/Konserva va murabbo', 'Nohut konservasi 400 g', 'Консервы нут 400 г', null, 400, 'g', 'dona'],
  ['Baqqollik/Konserva va murabbo', 'Pomidor pastasi 500 g', 'Томатная паста 500 г', null, 500, 'g', 'dona'],
  ['Baqqollik/Konserva va murabbo', 'Tuxum (10 dona)', 'Яйца (10 шт)', null, 10, 'dona', 'dona'],

  // ── Meva-sabzavot ──
  ['Meva va sabzavot/Mevalar', 'Uzum', 'Виноград', null, null, null, 'kg'],
  ['Meva va sabzavot/Mevalar', 'Anor', 'Гранат', null, null, null, 'kg'],
  ['Meva va sabzavot/Mevalar', 'Nok', 'Груша', null, null, null, 'kg'],
  ['Meva va sabzavot/Mevalar', 'Shaftoli', 'Персики', null, null, null, 'kg'],
  ['Meva va sabzavot/Mevalar', 'Limon', 'Лимон', null, null, null, 'kg'],
  ['Meva va sabzavot/Mevalar', 'Tarvuz', 'Арбуз', null, null, null, 'kg'],
  ['Meva va sabzavot/Mevalar', 'Qovun', 'Дыня', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Bodring', 'Огурцы', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Karam', 'Капуста', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Sarimsoq', 'Чеснок', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Qalampir', 'Перец', null, null, null, 'kg'],
  ['Meva va sabzavot/Sabzavotlar', 'Baqlajon', 'Баклажан', null, null, null, 'kg'],
  ['Meva va sabzavot/Koʻkatlar', 'Koʻkat (dastasi)', 'Зелень (пучок)', null, null, null, 'dona'],
  ['Meva va sabzavot/Quruq mevalar va yongʻoq', 'Turshak', 'Курага', null, null, null, 'kg'],
  ['Meva va sabzavot/Quruq mevalar va yongʻoq', 'Bodom', 'Миндаль', null, null, null, 'kg'],
  ['Meva va sabzavot/Quruq mevalar va yongʻoq', 'Yerongʻoq', 'Арахис', null, null, null, 'kg'],
  ['Meva va sabzavot/Quruq mevalar va yongʻoq', 'Pista', 'Фисташки', null, null, null, 'kg'],

  // ── Muzlatilgan ──
  ['Muzlatilgan mahsulotlar/Muzqaymoq', 'Muzqaymoq (rojok)', 'Мороженое (рожок)', null, null, null, 'dona'],
  ['Muzlatilgan mahsulotlar/Muzqaymoq', 'Muzqaymoq (eskimo)', 'Мороженое (эскимо)', null, null, null, 'dona'],
  ['Muzlatilgan mahsulotlar/Yarim tayyor mahsulotlar', 'Chuchvara (muzlatilgan)', 'Чучвара замороженная', null, null, null, 'kg'],
  ['Muzlatilgan mahsulotlar/Yarim tayyor mahsulotlar', 'Kotlet (muzlatilgan)', 'Котлеты замороженные', null, null, null, 'kg'],
  ['Muzlatilgan mahsulotlar/Yarim tayyor mahsulotlar', 'Naggets 300 g', 'Наггетсы 300 г', null, 300, 'g', 'dona'],
  ['Muzlatilgan mahsulotlar/Muzlatilgan sabzavot', 'Muzlatilgan aralashma 400 g', 'Овощная смесь 400 г', null, 400, 'g', 'dona'],

  // ── Gigiena ──
  ['Gigiena va parvarish/Shampun va sovun', 'Shampun 200 ml', 'Шампунь 200 мл', null, 200, 'ml', 'dona'],
  ['Gigiena va parvarish/Shampun va sovun', 'Dush geli 250 ml', 'Гель для душа 250 мл', null, 250, 'ml', 'dona'],
  ['Gigiena va parvarish/Shampun va sovun', 'Xoʻjalik sovuni', 'Хозяйственное мыло', null, 1, 'dona', 'dona'],
  ['Gigiena va parvarish/Tish pastasi va choʻtka', 'Tish pastasi 100 ml', 'Зубная паста 100 мл', null, 100, 'ml', 'dona'],
  ['Gigiena va parvarish/Tish pastasi va choʻtka', 'Blend-a-med 100 ml', 'Бленд-а-мед 100 мл', 'Blend-a-med', 100, 'ml', 'dona'],
  ['Gigiena va parvarish/Bir martalik buyumlar', 'Tualet qogʻozi (4 dona)', 'Туалетная бумага (4 шт)', null, 4, 'dona', 'dona'],
  ['Gigiena va parvarish/Bir martalik buyumlar', 'Nam salfetka (100 dona)', 'Влажные салфетки (100 шт)', null, 100, 'dona', 'dona'],
  ['Gigiena va parvarish/Bir martalik buyumlar', 'Qogʻoz sochiq', 'Бумажные полотенца', null, 1, 'dona', 'dona'],
  ['Gigiena va parvarish/Ustara va soqol vositalari', 'Soqol koʻpigi 200 ml', 'Пена для бритья 200 мл', null, 200, 'ml', 'dona'],
  ['Gigiena va parvarish/Ayollar gigienasi', 'Prokladka (10 dona)', 'Прокладки (10 шт)', null, 10, 'dona', 'dona'],

  // ── Parfumeriya ──
  ['Parfumeriya va kosmetika/Erkaklar atri', 'Erkaklar atri 30 ml', 'Мужской парфюм 30 мл', null, 30, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Erkaklar atri', 'Odekolon 100 ml', 'Одеколон 100 мл', null, 100, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Ayollar atri', 'Ayollar atri 30 ml', 'Женский парфюм 30 мл', null, 30, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Ayollar atri', 'Tualet suvi 50 ml', 'Туалетная вода 50 мл', null, 50, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Yuz parvarishi', 'Yuz yuvish geli 150 ml', 'Гель для умывания 150 мл', null, 150, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Yuz parvarishi', 'Skrab 100 ml', 'Скраб 100 мл', null, 100, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Krem va loson', 'Bolalar kremi 40 ml', 'Детский крем 40 мл', null, 40, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Krem va loson', 'Oyoq kremi 75 ml', 'Крем для ног 75 мл', null, 75, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Dekorativ kosmetika', 'Koʻz qalami', 'Карандаш для глаз', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Dekorativ kosmetika', 'Tonal krem', 'Тональный крем', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Dekorativ kosmetika', 'Rumyana', 'Румяна', null, 1, 'dona', 'dona'],
  ['Parfumeriya va kosmetika/Soch parvarishi', 'Soch maskasi 200 ml', 'Маска для волос 200 мл', null, 200, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Soch parvarishi', 'Soch laki 250 ml', 'Лак для волос 250 мл', null, 250, 'ml', 'dona'],
  ['Parfumeriya va kosmetika/Tirnoq va lak', 'Tirnoq qaychisi', 'Ножницы для ногтей', null, 1, 'dona', 'dona'],

  // ── Uy-ro'zg'or kimyosi ──
  ['Uy-roʻzgʻor kimyosi/Kir yuvish vositalari', 'Kir yuvish kukuni 6 kg', 'Стиральный порошок 6 кг', null, 6, 'kg', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Kir yuvish vositalari', 'Kir yuvish geli 1.3 l', 'Гель для стирки 1.3 л', null, 1.3, 'l', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Kir yuvish vositalari', 'Dogʻ ketkazgich 500 g', 'Пятновыводитель 500 г', null, 500, 'g', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Idish yuvish', 'Idish yuvish vositasi 1 l', 'Средство для посуды 1 л', null, 1, 'l', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Idish yuvish', 'Idish yuvish gubkasi (5 dona)', 'Губки для посуды (5 шт)', null, 5, 'dona', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Tozalash vositalari', 'Domestos 1 l', 'Доместос 1 л', 'Domestos', 1, 'l', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Tozalash vositalari', 'Pol yuvish vositasi 1 l', 'Средство для пола 1 л', null, 1, 'l', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Hasharotlarga qarshi', 'Chivin plastinkasi', 'Пластины от комаров', null, 1, 'dona', 'dona'],
  ['Uy-roʻzgʻor kimyosi/Xushboʻy vositalar', 'Xona xushboʻylagich (avtomat)', 'Автоматический освежитель', null, 1, 'dona', 'dona'],

  // ── Elektronika ──
  ['Elektronika/Telefon aksessuarlari', 'Telefon ushlagich (avto)', 'Автодержатель для телефона', null, 1, 'dona', 'dona'],
  ['Elektronika/Telefon aksessuarlari', 'Selfi tayoq', 'Селфи-палка', null, 1, 'dona', 'dona'],
  ['Elektronika/Quloqchin va kolonka', 'TWS quloqchin', 'TWS наушники', null, 1, 'dona', 'dona'],
  ['Elektronika/Batareyka va zaryadlagich', 'Batareyka Krona 9V', 'Батарейка Крона 9В', null, 1, 'dona', 'dona'],
  ['Elektronika/Batareyka va zaryadlagich', 'Quvvat banki 20000 mAh', 'Повербанк 20000 мАч', null, 1, 'dona', 'dona'],
  ['Elektronika/Batareyka va zaryadlagich', 'Avto zaryadlagich', 'Автозарядка', null, 1, 'dona', 'dona'],
  ['Elektronika/Kabel va adapter', 'HDMI kabel 1.5 m', 'HDMI кабель 1.5 м', null, 1.5, 'dona', 'dona'],
  ['Elektronika/Kabel va adapter', 'Uzaytirgich (3 rozetka)', 'Удлинитель (3 розетки)', null, 1, 'dona', 'dona'],
  ['Elektronika/Lampochka va yoritish', 'LED lampochka 15 W', 'LED лампа 15 Вт', null, 15, 'dona', 'dona'],
  ['Elektronika/Lampochka va yoritish', 'LED lenta 5 m', 'LED лента 5 м', null, 5, 'dona', 'dona'],
  ['Elektronika/Lampochka va yoritish', 'Stol chirogʻi', 'Настольная лампа', null, 1, 'dona', 'dona'],
  ['Elektronika/Xotira kartalari va flesh', 'Flesh xotira 64 GB', 'Флешка 64 ГБ', null, 64, 'dona', 'dona'],
  ['Elektronika/Xotira kartalari va flesh', 'MicroSD 128 GB', 'MicroSD 128 ГБ', null, 128, 'dona', 'dona'],
  ['Elektronika/Maishiy texnika', 'Fen', 'Фен', null, 1, 'dona', 'dona'],
  ['Elektronika/Maishiy texnika', 'Mikser', 'Миксер', null, 1, 'dona', 'dona'],
  ['Elektronika/Maishiy texnika', 'Blender', 'Блендер', null, 1, 'dona', 'dona'],
  ['Elektronika/Maishiy texnika', 'Ventilyator', 'Вентилятор', null, 1, 'dona', 'dona'],

  // ── Kiyim ──
  ['Kiyim va oyoq kiyim/Erkaklar kiyimi', 'Erkaklar sportivka', 'Мужской спортивный костюм', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Erkaklar kiyimi', 'Erkaklar kurtkasi', 'Мужская куртка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Ayollar kiyimi', 'Ayollar yubkasi', 'Женская юбка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Ayollar kiyimi', 'Ayollar kurtkasi', 'Женская куртка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Bolalar kiyimi', 'Bolalar shimi', 'Детские брюки', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Bolalar kiyimi', 'Bolalar kurtkasi', 'Детская куртка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Oyoq kiyim', 'Botinka', 'Ботинки', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Oyoq kiyim', 'Sandal', 'Сандалии', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Oyoq kiyim', 'Kalish', 'Галоши', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Paypoq va ichki kiyim', 'Kolgotki', 'Колготки', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Paypoq va ichki kiyim', 'Mayka', 'Майка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Bosh kiyim va aksessuar', 'Doʻppi', 'Тюбетейка', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Bosh kiyim va aksessuar', 'Qoʻlqop', 'Перчатки', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Bosh kiyim va aksessuar', 'Kamar', 'Ремень', null, 1, 'dona', 'dona'],
  ['Kiyim va oyoq kiyim/Sumka va hamyon', 'Maktab sumkasi', 'Школьный рюкзак', null, 1, 'dona', 'dona'],

  // ── Bolalar ──
  ['Bolalar uchun/Bolalar ovqati', 'Bolalar pyuresi 200 g', 'Детское пюре 200 г', null, 200, 'g', 'dona'],
  ['Bolalar uchun/Bolalar ovqati', 'Bolalar shirasi 200 ml', 'Детский сок 200 мл', null, 200, 'ml', 'dona'],
  ['Bolalar uchun/Bolalar ovqati', 'Bolalar bo\'tqasi 200 g', 'Детская каша 200 г', null, 200, 'g', 'dona'],
  ['Bolalar uchun/Podguznik va salfetka', 'Podguznik (kichik)', 'Подгузники (малые)', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Podguznik va salfetka', 'Podguznik (katta)', 'Подгузники (большие)', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Oʻyinchoqlar', 'Yumshoq oʻyinchoq', 'Мягкая игрушка', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Oʻyinchoqlar', 'Puzzle', 'Пазлы', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Oʻyinchoqlar', 'Koptok', 'Мяч', null, 1, 'dona', 'dona'],
  ['Bolalar uchun/Bolalar gigienasi', 'Bolalar shampuni 250 ml', 'Детский шампунь 250 мл', null, 250, 'ml', 'dona'],
  ['Bolalar uchun/Bolalar gigienasi', 'Soʻrgʻich', 'Соска', null, 1, 'dona', 'dona'],

  // ── Uy anjomlari ──
  ['Uy anjomlari/Idish-tovoq', 'Kosa', 'Миска', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Idish-tovoq', 'Stakan', 'Стакан', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Idish-tovoq', 'Kastryulka', 'Кастрюля', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Idish-tovoq', 'Tova', 'Сковорода', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Oshxona jihozlari', 'Kesish taxtasi', 'Разделочная доска', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Oshxona jihozlari', 'Terka', 'Тёрка', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Oshxona jihozlari', 'Ochgich (konserva uchun)', 'Консервный нож', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Toʻshak va matolar', 'Yostiq', 'Подушка', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Toʻshak va matolar', 'Adyol', 'Одеяло', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Tozalash anjomlari', 'Chelak', 'Ведро', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Tozalash anjomlari', 'Shvabra', 'Швабра', null, 1, 'dona', 'dona'],
  ['Uy anjomlari/Tozalash anjomlari', 'Axlat xaltasi (30 dona)', 'Мусорные пакеты (30 шт)', null, 30, 'dona', 'dona'],
  ['Uy anjomlari/Shamlar va bezaklar', 'Ramka (surat uchun)', 'Фоторамка', null, 1, 'dona', 'dona'],

  // ── Kanselyariya ──
  ['Kanselyariya/Daftar va qogʻoz', 'Daftar 96 varaq', 'Тетрадь 96 листов', null, 96, 'dona', 'dona'],
  ['Kanselyariya/Daftar va qogʻoz', 'Albom (rasm uchun)', 'Альбом для рисования', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Yozuv qurollari', 'Ruchka (koʻk, 10 dona)', 'Ручки синие (10 шт)', null, 10, 'dona', 'dona'],
  ['Kanselyariya/Yozuv qurollari', 'Rangli qalam (12 rang)', 'Цветные карандаши (12 цветов)', null, 12, 'dona', 'dona'],
  ['Kanselyariya/Yozuv qurollari', 'Flomaster (12 rang)', 'Фломастеры (12 цветов)', null, 12, 'dona', 'dona'],
  ['Kanselyariya/Maktab buyumlari', 'Penal', 'Пенал', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Maktab buyumlari', 'Sirkul', 'Циркуль', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Maktab buyumlari', 'Yelim (PVA)', 'Клей ПВА', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Ofis buyumlari', 'Papka', 'Папка', null, 1, 'dona', 'dona'],
  ['Kanselyariya/Ofis buyumlari', 'Kalkulyator', 'Калькулятор', null, 1, 'dona', 'dona'],

  // ── Sog'liq ──
  ['Sogʻliq/Vitaminlar va BFQ', 'Vitamin D', 'Витамин D', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Vitaminlar va BFQ', 'Baliq yogʻi', 'Рыбий жир', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Tibbiy buyumlar', 'Vata 100 g', 'Вата 100 г', null, 100, 'g', 'dona'],
  ['Sogʻliq/Tibbiy buyumlar', 'Shprits (5 ml)', 'Шприц 5 мл', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Tibbiy buyumlar', 'Bosim oʻlchagich', 'Тонометр', null, 1, 'dona', 'dona'],
  ['Sogʻliq/Niqob va antiseptik', 'Tibbiy qoʻlqop (10 juft)', 'Медицинские перчатки (10 пар)', null, 10, 'dona', 'dona'],

  // ── Tamaki ──
  ['Tamaki mahsulotlari/Sigaretalar', 'Sigareta (paket)', 'Сигареты (пачка)', null, 1, 'dona', 'dona'],
  ['Tamaki mahsulotlari/Sigaretalar', 'Sigareta (blok)', 'Сигареты (блок)', null, 10, 'dona', 'dona'],
  ['Tamaki mahsulotlari/Zajigalka va gugurt', 'Kul solgich', 'Пепельница', null, 1, 'dona', 'dona'],

  // ── Hayvonlar ──
  ['Hayvonlar uchun/Mushuk va it ovqati', 'Mushuk ovqati 1.5 kg', 'Корм для кошек 1.5 кг', null, 1.5, 'kg', 'dona'],
  ['Hayvonlar uchun/Mushuk va it ovqati', 'It ovqati 3 kg', 'Корм для собак 3 кг', null, 3, 'kg', 'dona'],
  ['Hayvonlar uchun/Mushuk va it ovqati', 'Tovuq ozuqasi', 'Корм для кур', null, null, null, 'kg'],
  ['Hayvonlar uchun/Hayvon aksessuarlari', 'Mushuk toldirgichi 5 l', 'Наполнитель для кошек 5 л', null, 5, 'l', 'dona'],

  // ── Avto ──
  ['Avto tovarlar/Moy va suyuqliklar', 'Motor moyi 1 l', 'Моторное масло 1 л', null, 1, 'l', 'dona'],
  ['Avto tovarlar/Moy va suyuqliklar', 'Tormoz suyuqligi 1 l', 'Тормозная жидкость 1 л', null, 1, 'l', 'dona'],
  ['Avto tovarlar/Avto aksessuarlar', 'Avto chexol', 'Чехлы для авто', null, 1, 'dona', 'dona'],
  ['Avto tovarlar/Avto aksessuarlar', 'Domkrat', 'Домкрат', null, 1, 'dona', 'dona'],
  ['Avto tovarlar/Avto kimyosi', 'Avto shampuni 1 l', 'Автошампунь 1 л', null, 1, 'l', 'dona'],
  ['Avto tovarlar/Avto kimyosi', 'Antigel 250 ml', 'Антигель 250 мл', null, 250, 'ml', 'dona'],

  // ── Bog' va qurilish ──
  ['Bogʻ va qurilish/Asboblar', 'Ombur', 'Плоскогубцы', null, 1, 'dona', 'dona'],
  ['Bogʻ va qurilish/Asboblar', 'Arra', 'Пила', null, 1, 'dona', 'dona'],
  ['Bogʻ va qurilish/Asboblar', 'Mix (1 kg)', 'Гвозди 1 кг', null, 1, 'kg', 'dona'],
  ['Bogʻ va qurilish/Asboblar', 'Shurup (100 dona)', 'Саморезы (100 шт)', null, 100, 'dona', 'dona'],
  ['Bogʻ va qurilish/Boʻyoq va lak', 'Emal boʻyoq 2.5 kg', 'Эмаль 2.5 кг', null, 2.5, 'kg', 'dona'],
  ['Bogʻ va qurilish/Boʻyoq va lak', 'Cho\'tka (boʻyoq uchun)', 'Кисть малярная', null, 1, 'dona', 'dona'],
  ['Bogʻ va qurilish/Urugʻ va oʻgʻit', 'Oʻgʻit 1 kg', 'Удобрение 1 кг', null, 1, 'kg', 'dona'],
  ['Bogʻ va qurilish/Elektr mollari', 'Sim (1 m)', 'Провод (1 м)', null, 1, 'dona', 'metr'],
  ['Bogʻ va qurilish/Elektr mollari', 'Izolenta', 'Изолента', null, 1, 'dona', 'dona'],
];

/**
 * Katalogni birinchi marta to'ldirish.
 *
 * Faqat bo'sh bazada ishlaydi — admin qo'shgan yoki tahrirlagan
 * ma'lumot ustidan hech qachon yozilmaydi.
 */
export function seedCatalog(): { categories: number; products: number } {
  const have = db.prepare('SELECT COUNT(*) AS c FROM catalog_categories').get() as any;
  if (have.c > 0) return { categories: 0, products: 0 };

  const insCat = db.prepare(
    'INSERT INTO catalog_categories (parent_id, name_uz, name_ru, glyph, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insProd = db.prepare(
    `INSERT INTO catalog_products (category_id, name_uz, name_ru, brand, volume_value, volume_unit, unit, search_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let cats = 0;
  let prods = 0;
  const byPath = new Map<string, number>();

  // Bo'lim yo'lini kalitga aylantirish. Apostrof o'zbekchada besh xil
  // belgi bilan yoziladi (' ' ʻ ʼ `) — ular kalitdan olib tashlanadi,
  // aks holda "Yog' va sirka" bilan "Yogʻ va sirka" boshqa bo'lim
  // bo'lib qolardi va tovar jimgina tushib qolardi.
  const pathKey = (s: string) => s.toLowerCase().replace(/[ʻʼ'`’‘]/g, '');

  const tx = db.transaction(() => {
    CATEGORY_TREE.forEach((root, i) => {
      const rootId = Number(insCat.run(null, root.uz, root.ru, root.glyph, root.color, (i + 1) * 10).lastInsertRowid);
      cats++;
      root.kids.forEach((kid, j) => {
        const kidId = Number(insCat.run(rootId, kid.uz, kid.ru, root.glyph, root.color, (j + 1) * 10).lastInsertRowid);
        cats++;
        byPath.set(pathKey(`${root.uz}/${kid.uz}`), kidId);
      });
    });

    for (const [path, name, ru, brand, vol, vunit, unit] of [...SEED_PRODUCTS, ...SEED_PRODUCTS_2]) {
      const catId = byPath.get(pathKey(path));
      if (!catId) {
        console.warn(`[katalog] bo'lim topilmadi: ${path}`);
        continue;
      }
      const key = productSearchKey({ name_uz: name, name_ru: ru, brand, volume_value: vol, volume_unit: vunit });
      insProd.run(catId, name, ru, brand, vol, vunit, unit, key);
      prods++;
    }
  });
  tx();

  console.log(`[katalog] ${cats} ta bo'lim va ${prods} ta tovar yozildi`);
  return { categories: cats, products: prods };
}
