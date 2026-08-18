// Bot matnlari — o'zbekcha, kirillcha va ruscha.
//
// Do'konchi ilovada qaysi tilni tanlagan bo'lsa, botdan ham o'sha tilda
// xabar keladi. Til do'kon yozuvidan (shops.language) yoki ulanishdan
// (telegram_links.language) olinadi; ikkalasi ham bo'lmasa Telegram'ning
// o'z tilidan taxmin qilinadi.

export type BotLang = 'uz' | 'uz_cyrl' | 'ru';

/** Telegram'ning language_code'idan tilni taxmin qilish */
export function langFromTelegram(code?: string | null): BotLang {
  const c = (code ?? '').toLowerCase();
  if (c.startsWith('ru') || c.startsWith('kk') || c.startsWith('ky')) return 'ru';
  return 'uz';
}

export function normalizeLang(value?: string | null): BotLang {
  const v = (value ?? '').toLowerCase();
  if (v === 'ru') return 'ru';
  if (v === 'uz_cyrl' || v === 'uz-cyrl') return 'uz_cyrl';
  return 'uz';
}

type Dict = Record<string, string>;

const UZ: Dict = {
  welcome:
    '<b>BuySale</b> — savdo, ombor va qarz daftari bitta ilovada.\n\n' +
    'Kirish kodi shu yerga keladi. Ilovada raqamingizni kiriting va ' +
    '«Kodni olish» tugmasini bosing.',
  shareBtn: '📱 Raqamni yuborish',
  sharePrompt:
    'Pastdagi <b>«📱 Raqamni yuborish»</b> tugmasini bosing.\n\n' +
    'Raqamingiz faqat kirish kodini yuborish uchun ishlatiladi.',
  linked:
    '✅ Raqamingiz ulandi.\n\nEndi ilovaga kirganingizda kod shu yerga keladi.',
  codeTitle: '🔐 Kirish kodi',
  codeHint: '👆 Kodni bosing — nusxalanadi. {min} daqiqa amal qiladi, hech kimga aytmang.',
  codeExpired: 'Kod muddati tugagan. Ilovada «Kodni olish» ni qaytadan bosing.',
  noPending:
    'Raqamingiz ulangan ✅\n\nIlovada telefon raqamingizni kiriting va «Kod olish» tugmasini bosing — kod shu yerga keladi.',
  openApp: '🛒 Ilovani ochish',
  help:
    '<b>Buyruqlar</b>\n\n' +
    '/start — boshlash va raqamni ulash\n' +
    '/kod — kirish kodini qayta yuborish\n' +
    '/qarz — qarz yozish (matn yuboring)\n' +
    '/help — yordam\n\n' +
    'Masalan: «Karim akaga 120 ming, shanbagacha»',
  notLinked: 'Avval /start bosing va raqamingizni yuboring.',
  reportOn: '✅ Kechki hisobot yoqildi. Har kuni shu yerga keladi.',
};

const RU: Dict = {
  welcome:
    '<b>BuySale</b> — торговля, склад и книга долгов в одном приложении.\n\n' +
    'Код входа приходит сюда. Введите номер в приложении и нажмите ' +
    '«Получить код».',
  shareBtn: '📱 Отправить номер',
  sharePrompt:
    'Нажмите кнопку <b>«📱 Отправить номер»</b> внизу.\n\n' +
    'Номер нужен только для отправки кода входа.',
  linked: '✅ Номер подключён.\n\nТеперь код входа будет приходить сюда.',
  codeTitle: '🔐 Код входа',
  codeHint: '👆 Нажмите на код — он скопируется. Действителен {min} мин, никому не сообщайте.',
  codeExpired: 'Срок кода истёк. Нажмите «Получить код» в приложении ещё раз.',
  noPending:
    'Номер подключён ✅\n\nВведите номер в приложении и нажмите «Получить код» — код придёт сюда.',
  openApp: '🛒 Открыть приложение',
  help:
    '<b>Команды</b>\n\n' +
    '/start — начать и подключить номер\n' +
    '/kod — прислать код входа ещё раз\n' +
    '/qarz — записать долг (отправьте текст)\n' +
    '/help — помощь\n\n' +
    'Например: «Кариму 120 тысяч, до субботы»',
  notLinked: 'Сначала нажмите /start и отправьте номер.',
  reportOn: '✅ Вечерний отчёт включён. Будет приходить сюда каждый день.',
};

// Kirillcha — o'zbekchaning kirill yozuvi. Ma'no bir xil.
const UZ_CYRL: Dict = {
  welcome:
    '<b>BuySale</b> — савдо, омбор ва қарз дафтари битта иловада.\n\n' +
    'Кириш коди шу ерга келади. Иловада рақамингизни киритинг ва ' +
    '«Кодни олиш» тугмасини босинг.',
  shareBtn: '📱 Рақамни юбориш',
  sharePrompt:
    'Пастдаги <b>«📱 Рақамни юбориш»</b> тугмасини босинг.\n\n' +
    'Рақамингиз фақат кириш кодини юбориш учун ишлатилади.',
  linked: '✅ Рақамингиз уланди.\n\nЭнди иловага кирганингизда код шу ерга келади.',
  codeTitle: '🔐 Кириш коди',
  codeHint: '👆 Кодни босинг — нусхаланади. {min} дақиқа амал қилади, ҳеч кимга айтманг.',
  codeExpired: 'Код муддати тугаган. Иловада «Кодни олиш» ни қайтадан босинг.',
  noPending:
    'Рақамингиз уланган ✅\n\nИловада телефон рақамингизни киритинг ва «Код олиш» тугмасини босинг.',
  openApp: '🛒 Иловани очиш',
  help:
    '<b>Буйруқлар</b>\n\n' +
    '/start — бошлаш ва рақамни улаш\n' +
    '/кod — кириш кодини қайта юбориш\n' +
    '/qarz — қарз ёзиш (матн юборинг)\n' +
    '/help — ёрдам',
  notLinked: 'Аввал /start босинг ва рақамингизни юборинг.',
  reportOn: '✅ Кечки ҳисобот ёқилди. Ҳар куни шу ерга келади.',
};

const DICTS: Record<BotLang, Dict> = { uz: UZ, uz_cyrl: UZ_CYRL, ru: RU };

/** Matnni tilга qarab olish. {kalit} lar values bilan almashtiriladi. */
export function bt(lang: BotLang, key: string, values: Record<string, string | number> = {}): string {
  const dict = DICTS[lang] ?? UZ;
  let text = dict[key] ?? UZ[key] ?? key;
  for (const [k, v] of Object.entries(values)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
