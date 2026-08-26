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
  supLinked:
    '✅ Ulandi.\n\nEndi <b>{shop}</b> yuboradigan buyurtmalar shu yerga keladi.',
  supOrder: '🧾 <b>{shop}</b> — yangi buyurtma',
  invResetTitle: '⚠️ Inventarizatsiyani QAYTADAN boshlash kodi',
  invResetHint:
    'Kod: <code>{code}</code>\n\n' +
    '<b>Diqqat.</b> Bu kod kiritilsa <b>{n}</b> ta tekshirilgan buyum belgisi ' +
    "o'chadi va sanoq noldan boshlanadi. Qilingan ish yo'qoladi.\n\n" +
    "Agar bu ishni siz boshlamagan bo'lsangiz — kodni hech kimga bermang.",
  staffIn:
    '👤 <b>{name}</b> ishga kirdi\n' +
    '🕒 {time} · {shop}',
  staffPinWarn:
    '⚠️ <b>{shop}</b> — diqqat!\n\n' +
    'PIN-kod {n} marta noto\'g\'ri terildi. Kirish vaqtincha to\'xtatildi.\n\n' +
    'Agar bu sizning xodimingiz bo\'lmasa — PIN-kodni almashtiring.',
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
  supLinked:
    '✅ Подключено.\n\nТеперь заказы от <b>{shop}</b> будут приходить сюда.',
  supOrder: '🧾 <b>{shop}</b> — новый заказ',
  invResetTitle: '⚠️ Код для сброса инвентаризации',
  invResetHint:
    'Код: <code>{code}</code>\n\n' +
    '<b>Внимание.</b> После ввода этого кода отметки о <b>{n}</b> проверенных ' +
    'товарах будут удалены, а пересчёт начнётся заново. Проделанная работа пропадёт.\n\n' +
    'Если это начали не вы — никому не сообщайте код.',
  staffIn:
    '👤 <b>{name}</b> вышел на смену\n' +
    '🕒 {time} · {shop}',
  staffPinWarn:
    '⚠️ <b>{shop}</b> — внимание!\n\n' +
    'PIN-код ввели неверно {n} раз. Вход временно заблокирован.\n\n' +
    'Если это не ваш сотрудник — смените PIN-код.',
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
  supLinked:
    '✅ Уланди.\n\nЭнди <b>{shop}</b> юборадиган буюртмалар шу ерга келади.',
  supOrder: '🧾 <b>{shop}</b> — янги буюртма',
  invResetTitle: '⚠️ Инвентаризацияни ҚАЙТАДАН бошлаш коди',
  invResetHint:
    'Код: <code>{code}</code>\n\n' +
    '<b>Диққат.</b> Бу код киритилса <b>{n}</b> та текширилган буюм белгиси ' +
    "ўчади ва саноқ нолдан бошланади. Қилинган иш йўқолади.\n\n" +
    "Агар бу ишни сиз бошламаган бўлсангиз — кодни ҳеч кимга берманг.",
  staffIn:
    '👤 <b>{name}</b> ишга кирди\n' +
    '🕒 {time} · {shop}',
  staffPinWarn:
    '⚠️ <b>{shop}</b> — диққат!\n\n' +
    'PIN-код {n} марта нотўғри терилди. Кириш вақтинча тўхтатилди.\n\n' +
    'Агар бу сизнинг ходимингиз бўлмаса — PIN-кодни алмаштиринг.',
};

const DICTS: Record<BotLang, Dict> = { uz: UZ, uz_cyrl: UZ_CYRL, ru: RU };

/** Matnni tilга qarab olish. {kalit} lar values bilan almashtiriladi. */
export function bt(lang: BotLang, key: string, values: Record<string, string | number> = {}): string {
  const dict = DICTS[lang] ?? UZ;
  let text = dict[key] ?? UZ[key] ?? key;
  for (const [k, v] of Object.entries(values)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
