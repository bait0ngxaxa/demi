param(
  [string]$OutputDirectory = "public/line/rich-menus"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$manifestLines = & npx jiti scripts/line-rich-menu-asset-manifest.ts
if ($LASTEXITCODE -ne 0) { throw "Could not read the TypeScript Rich Menu manifest." }
$manifest = (($manifestLines -join "`n") | ConvertFrom-Json)
$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $OutputDirectory))
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$canvasColor = [System.Drawing.ColorTranslator]::FromHtml("#F3F7F5")
$inkColor = [System.Drawing.ColorTranslator]::FromHtml("#102620")
$mutedColor = [System.Drawing.ColorTranslator]::FromHtml("#405C54")
$brandColor = [System.Drawing.ColorTranslator]::FromHtml("#0E3C35")
$lineColor = [System.Drawing.ColorTranslator]::FromHtml("#AEBFBA")
$surfaceColor = [System.Drawing.ColorTranslator]::FromHtml("#FFFFFF")
$softColor = [System.Drawing.ColorTranslator]::FromHtml("#DCEEE9")
$alertColor = [System.Drawing.ColorTranslator]::FromHtml("#E8F1EE")

function Draw-CenteredText($Graphics, [string]$Text, [System.Drawing.Font]$Font, [System.Drawing.Brush]$Brush, [System.Drawing.RectangleF]$Bounds) {
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit
  $Graphics.DrawString($Text, $Font, $Brush, $Bounds, $format)
  $format.Dispose()
}

$titleFont = [System.Drawing.Font]::new("Noto Sans Thai SemiBold", 92, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$contextFont = [System.Drawing.Font]::new("Noto Sans Thai", 54, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$actionFont = [System.Drawing.Font]::new("Noto Sans Thai SemiBold", 78, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$smallFont = [System.Drawing.Font]::new("Noto Sans Thai SemiBold", 42, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

foreach ($menu in $manifest) {
  $bitmap = [System.Drawing.Bitmap]::new(2500, 1686, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear($canvasColor)
  $graphics.FillRectangle([System.Drawing.SolidBrush]::new($brandColor), 0, 0, 2500, 500)
  Draw-CenteredText $graphics "DEMI" $titleFont ([System.Drawing.Brushes]::White) ([System.Drawing.RectangleF]::new(80, 46, 2340, 148))
  Draw-CenteredText $graphics $menu.title $contextFont ([System.Drawing.Brushes]::White) ([System.Drawing.RectangleF]::new(100, 206, 2300, 100))
  Draw-CenteredText $graphics $menu.context $contextFont ([System.Drawing.Brushes]::White) ([System.Drawing.RectangleF]::new(100, 324, 2300, 88))

  foreach ($action in $menu.actions) {
    $bounds = $action.bounds
    $rect = [System.Drawing.RectangleF]::new([single]$bounds.x, [single]$bounds.y, [single]$bounds.width, [single]$bounds.height)
    $isMain = $bounds.y -lt 1200
    if ($isMain) {
      $graphics.FillRectangle([System.Drawing.SolidBrush]::new($softColor), $rect)
      Draw-CenteredText $graphics $action.label $actionFont ([System.Drawing.SolidBrush]::new($brandColor)) $rect
    } else {
      $fill = if ($action.kind -eq "uri" -and $action.label -eq "จัดการบัญชี") { $alertColor } else { $surfaceColor }
      $graphics.FillRectangle([System.Drawing.SolidBrush]::new($fill), $rect)
      $pen = [System.Drawing.Pen]::new($lineColor, 3)
      $graphics.DrawRectangle($pen, [single]$rect.X, [single]$rect.Y, [single]$rect.Width, [single]$rect.Height)
      $pen.Dispose()
      Draw-CenteredText $graphics $action.label $smallFont ([System.Drawing.SolidBrush]::new($inkColor)) $rect
    }
  }
  $outputPath = Join-Path $resolvedOutput $menu.assetFile
  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

$titleFont.Dispose()
$contextFont.Dispose()
$actionFont.Dispose()
$smallFont.Dispose()
Get-ChildItem -LiteralPath $resolvedOutput -Filter "*.png" | Select-Object Name, Length
