# Asl logo fayllarini shu yerga tashlang

Hozir ilovada turgan belgi — **vaqtinchalik**, qo'lda chizilgan taxminiy
variant. Asl fayllar kelishi bilan almashtiriladi.

## Nima kerak

Shu papkaga quyidagi fayllarni qo'ying (nomi aynan shunday bo'lsin):

| Fayl | Nima |
|---|---|
| `buysale-mark.png` yoki `.svg` | Faqat belgi (savat + BS), fonsiz |
| `buysale-logo.png` yoki `.svg` | Belgi + "BuySale" yozuvi |

**SVG bo'lsa eng yaxshi** — har qanday o'lchamda aniq chiqadi va ikonka
ham shundan yasaladi. Faqat PNG bo'lsa, foni shaffof (fonsiz) bo'lsin va
kamida 1024 px kenglikda bo'lsin.

## Qanday tashlash

Windows'da, `d:\knk\Arabicone` papkasida:

```
copy "C:\Users\kamronbek Nazarov\Downloads\Telegram Desktop\buysale-mark.png" brand\original\
copy "C:\Users\kamronbek Nazarov\Downloads\Telegram Desktop\buysale-logo.png" brand\original\

git add brand/original
git commit -m "Asl logo fayllari"
git push origin claude/debt-subscriptions-system-4x6yt7
```

Shundan keyin ayting — fayllarni ilovaning hamma joyiga (kirish ekrani,
yon menyu, admin panel, favicon, telefon ikonkasi) ulab beraman va
vaqtinchalik chizmani olib tashlayman.
