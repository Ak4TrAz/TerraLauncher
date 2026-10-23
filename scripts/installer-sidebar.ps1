# Génère l'image latérale de l'installeur NSIS (164x314, BMP 24 bits) : fond automne, feuilles, renard, nom
param([string]$pub, [string]$out)
Add-Type -AssemblyName System.Drawing
$w = 164; $h = 314
$bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(58, 38, 26)), ([System.Drawing.Color]::FromArgb(24, 18, 14)), 90
$g.FillRectangle($bg, $rect)
$glow = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow.AddEllipse(-30, 40, 224, 200)
$pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
$pgb.CenterColor = [System.Drawing.Color]::FromArgb(110, 228, 107, 26)
$pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 228, 107, 26))
$g.FillPath($pgb, $glow)
# Feuilles (pixel art : pas de lissage)
$g.InterpolationMode = 'NearestNeighbor'; $g.PixelOffsetMode = 'Half'
$leaves = @(@(1, 12, 18, 0.6), @(2, 118, 30, 0.55), @(3, 14, 270, 0.5), @(4, 126, 250, 0.6), @(1, 96, 286, 0.45), @(3, 132, 140, 0.4), @(2, 6, 160, 0.4))
foreach ($l in $leaves) {
  $img = [System.Drawing.Image]::FromFile("$pub\leaves\leaf$($l[0]).png")
  $g.DrawImage($img, $l[1], $l[2], [int]($img.Width * $l[3]), [int]($img.Height * $l[3]))
  $img.Dispose()
}
$fox = [System.Drawing.Image]::FromFile("$pub\fox.png")
$fw = 124; $fh = [int]($fox.Height * $fw / $fox.Width)
$g.DrawImage($fox, [int](($w - $fw) / 2), 74, $fw, $fh)
$fox.Dispose()
$g.InterpolationMode = 'HighQualityBicubic'
$font = New-Object System.Drawing.Font 'Segoe UI', 15, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'
$cream = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(246, 234, 220))
$ember = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 128, 38))
$y = 74 + $fh + 14
$t1 = 'Terra'; $t2 = 'Launcher'
$s1 = $g.MeasureString($t1, $font); $s2 = $g.MeasureString($t2, $font)
$x = ($w - ($s1.Width + $s2.Width - 6)) / 2
$g.DrawString($t1, $font, $cream, $x, $y)
$g.DrawString($t2, $font, $ember, $x + $s1.Width - 6, $y)
$small = New-Object System.Drawing.Font 'Segoe UI', 10, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 170, 150))
$g.DrawString("Communaut$([char]0xE9) Terranova", $small, $muted, (New-Object System.Drawing.RectangleF 0, ($y + 22), $w, 16), $fmt)
$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()
