# ARABIC.ONE — barcha xizmatlarni ishga tushirish
# ENG OSON YO'L: shu papkadagi start.bat faylini ikki marta bosing.
# (Bu faylni (start.ps1) qatorma-qator ko'chirib terminalga qo'ymang —
#  faqat start.bat orqali yoki ".\start.ps1" deb to'liq ishga tushiring.)

$root = $PSScriptRoot

# Portable Node.js (agar tizimda umuman o'rnatilmagan bo'lsa ishlatiladi)
$nodeBin = "$env:LOCALAPPDATA\Programs\nodejs-portable\node-v24.19.0-win-x64"
if ((Test-Path $nodeBin) -and (-not (Get-Command npm -ErrorAction SilentlyContinue))) {
    $env:PATH = "$nodeBin;$env:PATH"
}

# -ExecutionPolicy Bypass: yangi ochilgan oynalarda ham npm.ps1 bloklanmasin
# (tizimning umumiy skript siyosatiga bog'liq bo'lmasligi uchun)
#
# DIQQAT: Mini App va Admin panel endi "npm run build" bilan tayyor
# versiya (dist/) qilib chiqariladi va SHUNI ko'rsatadi ("preview"),
# dev-serverni (`vite`/`npm run dev`) EMAS. Sabab: dev-server fayllari
# hech qanday versiya belgisiz (hash'siz) beriladi, brauzer ularni
# keshlab qoladi va do'konchi F5 bosganda ham eski versiyani ko'raveradi
# (faqat Ctrl+Shift+R yordam beradi). Build qilingan fayllar esa har
# safar yangi nom bilan chiqadi, shuning uchun har doim eng so'nggi
# versiya ko'rinadi — F5 ham to'g'ri ishlaydi.
#
# Kod yangilanganda (masalan "git pull" qilgandan keyin) o'zgarish
# ko'rinishi uchun bu skriptni QAYTA ishga tushirish kerak (avval
# stop.bat, keyin start.bat) — u har safar qaytadan build qiladi.
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$root\backend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$root\miniapp'; npm run build; npm run preview:https"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "cd '$root\admin'; npm run build; npm run preview"

# Cloudflare Tunnel: duk.goybusut.uz -> Mini App (5173)
#                    admin.goybusut.uz -> Admin panel (5174)
# Ingress qoidalari: %USERPROFILE%\.cloudflared\config.yml
# Tunnel "arabicone"ning credentials fayli bu serverda yo'q (boshqa joyda
# yaratilgan) — shuning uchun nomi bilan emas, TUNNEL_TOKEN muhit
# o'zgaruvchisi (doimiy, user darajasida o'rnatilgan) orqali kiramiz.
$cloudflared = "$env:LOCALAPPDATA\Programs\cloudflared\cloudflared.exe"
$cfConfig = "$env:USERPROFILE\.cloudflared\config.yml"
# Eski terminal/oynalarda user PATH/muhit o'zgaruvchilari yangilanmagan
# bo'lishi mumkin - shuning uchun $env: o'rniga to'g'ridan-to'g'ri
# registrydan o'qiymiz (har doim eng so'nggi qiymatni beradi).
$tunnelToken = [Environment]::GetEnvironmentVariable('TUNNEL_TOKEN', 'User')
if ((Test-Path $cloudflared) -and $tunnelToken) {
    Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", "& '$cloudflared' tunnel --config '$cfConfig' run --token '$tunnelToken'"
} elseif (-not (Test-Path $cloudflared)) {
    # Diqqat: qo'shtirnoq ichida uzun tire (—) ishlatmang. Bu fayl BOM'siz UTF-8,
    # PowerShell 5.1 uni CP1251 deb o'qiydi va tire yopuvchi qo'shtirnoqqa aylanib
    # skriptni buzadi. Izohlarda bo'lsa zarari yo'q, satr ichida esa bor.
    Write-Warning "cloudflared topilmadi - duk.goybusut.uz ochilmaydi. Qayta o'rnating: $cloudflared"
} else {
    Write-Warning "TUNNEL_TOKEN muhit o'zgaruvchisi topilmadi - tunnel ishga tushmaydi."
}

Write-Output "Backend:  http://localhost:3000"
Write-Output "Mini App: https://localhost:5173"
Write-Output "Admin:    http://localhost:5174"
Write-Output ""
Write-Output "Internet: https://duk.goybusut.uz    (do'konchilar uchun Mini App)"
Write-Output "          https://admin.goybusut.uz  (admin panel)"
