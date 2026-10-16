# Builds Google Play screenshots (1080x1920, caption + phone screenshot) and the feature
# graphic (1024x500) from the raw emulator screenshots in store/raw.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-store-graphics.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$raw = Join-Path $root 'store\raw'
$out = Join-Path $root 'store\play'
New-Item -ItemType Directory -Force $out | Out-Null

$green = [System.Drawing.Color]::FromArgb(13, 110, 79)
$greenDark = [System.Drawing.Color]::FromArgb(8, 72, 52)
$mint = [System.Drawing.Color]::FromArgb(200, 240, 222)
$white = [System.Drawing.Color]::White

$shots = @(
  @{ file = '1-home.png';    title = 'Know when to fill up';         sub = 'Fuel left, range and your next fill-up' },
  @{ file = '2-scan.png';    title = 'Scan your fuel slip';          sub = 'Litres, price and garage filled in for you' },
  @{ file = '3-stats.png';   title = 'Your real fuel consumption';   sub = 'Measured from full tank to full tank' },
  @{ file = '4-cost.png';    title = 'The true cost of driving';     sub = 'Fuel, insurance, tyres, services and tolls' },
  @{ file = '5-logbook.png'; title = 'SARS travel logbook';          sub = 'Log trips, export at tax time' },
  @{ file = '6-route.png';   title = 'Road trips made easy';         sub = 'Fuel stops and toll plazas on your route' },
  @{ file = '7-pro.png';     title = 'One payment. No subscription.'; sub = 'Try every Pro feature free for 7 days' }
)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Set-Quality($g) {
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
}

$center = New-Object System.Drawing.StringFormat
$center.Alignment = [System.Drawing.StringAlignment]::Center

$i = 0
foreach ($s in $shots) {
  $i++
  $W = 1080; $H = 1920
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  Set-Quality $g
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, $H), $green, $greenDark)
  $g.FillRectangle($bg, 0, 0, $W, $H)

  $titleFont = New-Object System.Drawing.Font 'Segoe UI Semibold', 62, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font 'Segoe UI', 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString($s.title, $titleFont, (New-Object System.Drawing.SolidBrush $white), (New-Object System.Drawing.RectangleF 40, 90, ($W - 80), 90), $center)
  $g.DrawString($s.sub, $subFont, (New-Object System.Drawing.SolidBrush $mint), (New-Object System.Drawing.RectangleF 40, 185, ($W - 80), 60), $center)

  # Phone: the screenshot with rounded corners, a dark bezel and a soft shadow.
  $shot = [System.Drawing.Image]::FromFile((Join-Path $raw $s.file))
  $ph = 1560; $pw = [int]($shot.Width * $ph / $shot.Height)
  $px = [int](($W - $pw) / 2); $py = 300
  for ($k = 1; $k -le 6; $k++) {
    $shadow = New-RoundedPath ($px - 14 + $k * 2) ($py - 14 + $k * 4) ($pw + 28) ($ph + 28) 70
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(14, 0, 0, 0))), $shadow)
  }
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24, 26, 28))), (New-RoundedPath ($px - 14) ($py - 14) ($pw + 28) ($ph + 28) 70))
  $clip = New-RoundedPath $px $py $pw $ph 56
  $g.SetClip($clip)
  $g.DrawImage($shot, $px, $py, $pw, $ph)
  $g.ResetClip()
  $shot.Dispose()

  $name = Join-Path $out ('{0:D2}-{1}' -f $i, $s.file)
  $bmp.Save($name, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "wrote $name"
}

# Feature graphic: 1024x500, name and promise on the left, the home screen on the right.
$W = 1024; $H = 500
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
Set-Quality $g
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $W, $H), $green, $greenDark)
$g.FillRectangle($bg, 0, 0, $W, $H)
$icon = Join-Path $root 'android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png'
if (Test-Path $icon) {
  $img = [System.Drawing.Image]::FromFile($icon)
  $g.DrawImage($img, 60, 70, 110, 110)
  $img.Dispose()
}
$g.DrawString('FuelBuddy', (New-Object System.Drawing.Font 'Segoe UI Semibold', 72, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $white), 185, 78)
$g.DrawString("The fuel log made for`nSouth African drivers", (New-Object System.Drawing.Font 'Segoe UI', 40, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $mint), 62, 220)
# Built from a char code: Windows PowerShell 5.1 reads scripts as ANSI, not UTF-8.
$dot = ' ' + [char]0x00B7 + ' '
$g.DrawString(('Slip scanning' + $dot + 'Petrol price alerts' + $dot + 'SARS logbook'), (New-Object System.Drawing.Font 'Segoe UI', 24, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $white), 64, 368)
$shot = [System.Drawing.Image]::FromFile((Join-Path $raw '1-home.png'))
$pw = 300; $ph = [int]($shot.Height * $pw / $shot.Width)
$px = 680; $py = 50
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24, 26, 28))), (New-RoundedPath ($px - 10) ($py - 10) ($pw + 20) ($ph + 20) 40))
$g.SetClip((New-RoundedPath $px $py $pw $ph 32))
$g.DrawImage($shot, $px, $py, $pw, $ph)
$g.ResetClip()
$shot.Dispose()
$name = Join-Path $out 'feature-graphic.png'
$bmp.Save($name, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $name"
