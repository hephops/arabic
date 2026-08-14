# ARABIC.ONE — barcha xizmatlarni to'xtatish
# ENG OSON YO'L: shu papkadagi stop.bat faylini ikki marta bosing.
#
# start.bat ochgan hamma narsani yopadi:
#   backend (3000), Mini App (5173), admin (5174) va Cloudflare tunnel.
# Tunnel to'xtagach duk.goybusut.uz va admin.goybusut.uz ochilmay qoladi
# (Cloudflare 502 yoki "error 1033" ko'rsatadi) — start.bat bosilsa qaytadi.
#
# DIQQAT: bu skript hech qanday fayl yoki ma'lumotni o'chirmaydi,
# faqat ishlab turgan dasturlarni yopadi.
#
# Diqqat (2): qo'shtirnoq ichida uzun tire (—) ishlatmang. Bu fayl BOM'siz UTF-8,
# PowerShell 5.1 uni CP1251 deb o'qiydi va tire yopuvchi qo'shtirnoqqa aylanib
# skriptni buzadi. Izohlarda bo'lsa zarari yo'q, satr ichida esa bor.

$root = $PSScriptRoot

# Jarayonni yopamiz va uni ochgan oynani ham (start.ps1 har bir xizmatni alohida
# powershell oynasida ochadi — bolasi o'lsa oyna bo'sh qolib ketardi).
function Stop-Tree([int]$procId) {
    # npm portni to'g'ridan-to'g'ri ushlagan jarayonni emas, balki uni ochgan
    # cmd/node (npm) qobig'i orqali ishga tushiradi (masalan: tsx watch —
    # npm-cli.js -> cmd.exe -> tsx watch). Faqat bitta darajaga qarasak,
    # oraliq qobiqlar tirik qolib, dastur "to'xtagan" bo'lib ko'rinadi-yu,
    # aslida hali ishlab turadi. Shuning uchun butun node/cmd zanjirini
    # tepaga qarab yopamiz, faqat oxirida — start.ps1 ochgan powershell
    # oynasiga yetganda — bittagina qo'shib to'xtaymiz.
    $toKill = New-Object System.Collections.Generic.List[int]
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
    while ($current) {
        $toKill.Add([int]$current.ProcessId)
        $parent = $null
        if ($current.ParentProcessId) {
            $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($current.ParentProcessId)" -ErrorAction SilentlyContinue
        }
        $current = $null
        if ($parent -and $parent.Name -match '^(node|cmd)\.exe$') {
            $current = $parent
        } elseif ($parent -and $parent.Name -eq 'powershell.exe' -and $parent.CommandLine -like "*$root*") {
            $toKill.Add([int]$parent.ProcessId)
        }
    }
    foreach ($id in $toKill) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
}

function Stop-Port([int]$port, [string]$label) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Output "  $label (port $port) - allaqachon to'xtagan"
        return
    }
    foreach ($procId in ($conns.OwningProcess | Select-Object -Unique)) {
        Stop-Tree $procId
    }
    Write-Output "  $label (port $port) - to'xtatildi"
}

Write-Output "ARABIC.ONE - to'xtatilmoqda..."
Write-Output ""

Stop-Port 3000 "Backend "
Stop-Port 5173 "Mini App"
Stop-Port 5174 "Admin   "

# Cloudflare tunnel (port egasi bo'lmagani uchun nomi bo'yicha topamiz).
# DIQQAT: bu serverda BOSHQA loyihalar uchun ham cloudflared ishlab turadi
# (news, osonservice va h.k.) — ularga aslo tegmaymiz, faqat o'zimizning
# config.yml bilan ishga tushirilganini (arabicone) qidiramiz.
function Get-MyTunnel {
    Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*.cloudflared\config.yml*" }
}
$tunnel = Get-MyTunnel
if ($tunnel) {
    foreach ($t in $tunnel) { Stop-Process -Id $t.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Output "  Tunnel   (duk/admin.goybusut.uz) - to'xtatildi"
} else {
    Write-Output "  Tunnel   (duk/admin.goybusut.uz) - allaqachon to'xtagan"
}

Start-Sleep -Seconds 1

# Tekshirib beramiz: biror narsa qolib ketmadimi
$qolgan = @()
foreach ($p in 3000, 5173, 5174) {
    if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) { $qolgan += $p }
}
if (Get-MyTunnel) { $qolgan += "tunnel" }

Write-Output ""
if ($qolgan.Count -eq 0) {
    Write-Output "Hammasi to'xtadi. Qaytadan ishga tushirish uchun: start.bat"
} else {
    Write-Warning "Quyidagilar hali ishlayapti: $($qolgan -join ', ')"
    Write-Warning "Ularning oynasini qo'lda yoping yoki stop.bat ni yana bir marta bosing."
}
