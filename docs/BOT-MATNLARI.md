# Telegram bot — BotFather uchun matnlar

Bu yerdagi matnlar to'g'ridan-to'g'ri **@BotFather** ga ko'chiriladi.
Har biri ikki tilda: o'zbekcha va ruscha.

BotFather tilni o'zi tanlay olmaydi — bitta matn turadi. Shuning uchun
tavsiya: **ikki tilni bitta matnga qo'shib yozing** (pastda tayyor
variantlar shunday). Bot ichidagi xabarlar esa foydalanuvchining tiliga
qarab o'zi almashadi (`backend/src/botText.ts`).

---

## 1. Name (bot nomi)

```
BuySale
```

## 2. About — `/setabouttext`

Profil sahifasida ko'rinadi, 120 belgigacha.

```
Savdo, ombor va qarz daftari bitta ilovada · Торговля, склад и долги в одном приложении
```

## 3. Description — `/setdescription`

Bot ochilganda "What can this bot do?" blokida ko'rinadi, 512 belgigacha.

```
BuySale — do'kon uchun savdo, ombor va qarz daftari.

• Kirish kodi shu yerga keladi — SMS kerak emas
• Kechki hisobot: kunlik savdo, foyda va qarzlar
• Qarzni ovoz yoki matn bilan yozish
• Ta'minotchiga buyurtmani bir bosishda yuborish

——

BuySale — торговля, склад и книга долгов для магазина.

• Код входа приходит сюда — SMS не нужен
• Вечерний отчёт: продажи, прибыль и долги за день
• Запись долга голосом или текстом
• Отправка заказа поставщику в одно нажатие
```

## 4. Botpic — `/setuserpic`

`brand/buysale-mark.svg` dan yasalgan kvadrat rasm.
Tayyori: `miniapp/public/icon-512.png` (512×512).

## 5. Welcome picture — "Set Welcome Picture"

640×360 px kerak. `brand/` dagi gorizontal qulfdan yasang:
oq fon, o'rtada `buysale-logo.svg`.

## 6. Commands — `/setcommands`

```
start - Boshlash / Начать
kod - Kirish kodi / Код входа
qarz - Qarz yozish / Записать долг
help - Yordam / Помощь
```

> Kirishda do'konchi botga hech narsa yozmaydi va raqamini yubormaydi.
> Ilovadagi «Kodni olish» tugmasi botni ochadi va `/start` o'zi bosiladi —
> raqam havola ichida, imzolangan holda keladi. Kod esa `<code>` ichida
> yuboriladi: Telegramda bosilsa nusxalanadi.

---

## Bot ichidagi xabarlar

Bularni BotFather'ga kiritish shart emas — ular kodda va
foydalanuvchining tiliga qarab o'zi tanlanadi:

| Holat | Fayl |
|---|---|
| Salomlashish, raqam so'rash, kirish kodi | `backend/src/botText.ts` |
| Qarz yozish javoblari | `backend/src/telegram.ts` |
| Kechki hisobot | `backend/src/dailyReport.ts` |

Til tartibi: do'konchi **ilovada tanlagan til** → ulanishda saqlangani →
Telegram'ning o'z tili. Ya'ni ilovada ruschaga o'tsa, botdan ham ruscha
xabar keladi.

---

## Sozlash (server tomonida)

`backend/.env` fayliga:

```
TELEGRAM_BOT_TOKEN=<BotFather bergan token>
TELEGRAM_BOT_USERNAME=<bot nomi, @ siz>
TELEGRAM_WEBHOOK_SECRET=<o'zingiz o'ylab topgan uzun matn>
PUBLIC_URL=https://duk.goybusut.uz
MINIAPP_URL=https://duk.goybusut.uz
```

Token **hech qachon** kodga yoki git'ga yozilmaydi — faqat `.env` da.
Server ishga tushganda webhook o'zi ro'yxatdan o'tadi.
