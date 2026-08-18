# BuySale — brend to'plami

Platformaning nomi **BuySale**, shiori **Savdo · Ombor · Foyda**.

## Fayllar

| Fayl | Qachon ishlatiladi |
|---|---|
| `buysale-mark.svg` | Faqat belgi. Ikonka, favicon, kichik joylar. |
| `buysale-logo.svg` | Gorizontal qulf (belgi + nom). Asosiy variant: sayt sarlavhasi, hujjat, taqdimot. |
| `buysale-logo-stacked.svg` | Tik qulf (belgi tepada, nom va shior pastda). Kirish ekrani, bosma, ilova do'koni. |
| `buysale-logo-dark.svg` | Qorong'i fon uchun — "Buy" oq bo'ladi. |
| `buysale-wordmark.svg` | Faqat nom. Belgi allaqachon yonida turgan joylar uchun. |
| `buysale-mark-mono.svg` | Bir rangli. Chek, yorliq, shtamp — rangli bosib bo'lmaydigan joylar. Rangi `currentColor`. |

## Bitta manba

Hammasi `buysale-mark.svg` dan yig'iladi:

```
node brand/build.mjs
```

Bu buyruq qulflarni (`buysale-logo*.svg`), ilova ikonkalarini
(`miniapp/public/icon-*.png`, `apple-touch-icon.png`, `favicon.svg`) va
ilova ichidagi React komponentini (`miniapp/src/brand.tsx`,
`admin/src/brand.tsx`) qayta yozadi. Belgi o'zgarsa faqat shu bitta
faylni tahrirlab, buyruqni ishga tushirish kifoya — qolgani ergashadi.

Ikonka PNG'lari uchun `playwright` kerak. U bo'lmasa qadam o'tkazib
yuboriladi: SVG'lar va komponent baribir yangilanadi, tayyor PNG'lar
esa repoda turadi.

## Ranglar

| Nom | Kod | Qayerda |
|---|---|---|
| Yashil (savat, "B") | `#21A038` | belgi, o'sish va foyda |
| Ko'k ("S", "Sale") | `#1B5CE8` | belgi, nom, asosiy tugmalar |
| To'q ("Buy") | `#0E1B33` | nom va sarlavhalar |
| Kulrang (shior) | `#5B6472` | shior va izohlar |

## Qoidalar

- Belgi atrofida bo'sh joy qoldiring — kamida g'ildirak diametricha.
- Belgini cho'zmang, ranglarini almashtirmang, soya qo'shmang.
- Rangli fonda `buysale-mark-mono.svg` (oq) ishlatiladi, rangli belgi emas.
- Nomda "Buy" va "Sale" orasida probel yo'q: **BuySale**.

## Ilova ichida

Belgi React komponenti sifatida ham bor — `Logo` va `Wordmark`
(`miniapp/src/icons.tsx`, `admin/src/icons.tsx`). O'lchamga moslashadi va
qo'shimcha so'rov ketmaydi:

```tsx
<Logo size={30} />      // rangli
<Logo size={30} mono /> // bir rangli, currentColor
<Wordmark />            // BuySale
```
