# Builds the Tauri icon set from a single square PNG.
#   powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1 -Source "$env:USERPROFILE\Downloads\icon.png"
param(
  [string]$Source = "$env:USERPROFILE\Downloads\icon.png",
  [string]$OutDir = "$PSScriptRoot\..\src-tauri\icons"
)

Add-Type -AssemblyName System.Drawing
if (!(Test-Path $Source)) { throw "Source not found: $Source" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))

function Resize-To([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode  = 'HighQuality'
  $g.SmoothingMode    = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
  $g.Dispose()
  return $bmp
}

# PNG variants expected by Tauri
$pngs = @{ 'icon.png' = 512; '32x32.png' = 32; '128x128.png' = 128; '128x128@2x.png' = 256 }
foreach ($name in $pngs.Keys) {
  $bmp = Resize-To $pngs[$name]
  $bmp.Save((Join-Path $OutDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  $name ($($pngs[$name])px)"
}

# Multi-size .ico: header + directory entries + PNG payloads
$sizes = 16, 32, 48, 64, 128, 256
$blobs = @()
foreach ($s in $sizes) {
  $bmp = Resize-To $s
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $blobs += , @($s, $ms.ToArray())
  $ms.Dispose(); $bmp.Dispose()
}

$icoPath = Join-Path $OutDir 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$blobs.Count)
$offset = 6 + 16 * $blobs.Count
foreach ($b in $blobs) {
  $dim = if ($b[0] -ge 256) { 0 } else { $b[0] }
  $bw.Write([byte]$dim); $bw.Write([byte]$dim)
  $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$b[1].Length); $bw.Write([uint32]$offset)
  $offset += $b[1].Length
}
foreach ($b in $blobs) { $bw.Write($b[1]) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose(); $src.Dispose()

Write-Host "  icon.ico ($($sizes -join ', ')px)"
Write-Host "Done: $OutDir"
