param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$animationRoot = Join-Path $projectRoot "public\assets\horse\animation"
$sourceRoot = Join-Path $projectRoot "public\assets\horse\source"

& (Join-Path $projectRoot "server.ps1") -SelfTest

Add-Type -AssemblyName System.Drawing

$directions = @("n", "ne", "e", "se", "s", "sw", "w", "nw")
$canonicalFrames = @()
foreach ($direction in $directions) {
  $frameNames = @("horse-$direction-idle.png")
  for ($frame = 0; $frame -lt 4; $frame += 1) {
    $frameNames += "horse-$direction-walk-$frame.png"
  }
  foreach ($frameName in $frameNames) {
    $canonicalFrames += [pscustomobject]@{
      Direction = $direction
      Name = $frameName
      Path = Join-Path $animationRoot $frameName
    }
  }

  $sourceSheet = Join-Path $sourceRoot "horse-$direction-cycle-sheet.png"
  if (-not (Test-Path -LiteralPath $sourceSheet -PathType Leaf)) {
    throw "Missing checked-in animation source: $sourceSheet"
  }
}

if ($canonicalFrames.Count -ne 40) {
  throw "Expected 40 canonical animation frames, found $($canonicalFrames.Count)."
}

foreach ($frame in $canonicalFrames) {
  $framePath = $frame.Path
  if (-not (Test-Path -LiteralPath $framePath -PathType Leaf)) {
    throw "Missing canonical animation frame: $framePath"
  }

  $image = [System.Drawing.Image]::FromFile($framePath)
  try {
    if ($image.Width -ne 128 -or $image.Height -ne 128) {
      throw "Animation frame must be 128x128: $framePath"
    }
    if (
      $image.PixelFormat -ne
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    ) {
      throw "Animation frame must use 32-bit ARGB pixels: $framePath"
    }
  } finally {
    $image.Dispose()
  }
}

$sourcePalette = @(
  [System.Drawing.Color]::FromArgb(255, 31, 22, 13),
  [System.Drawing.Color]::FromArgb(255, 82, 45, 20),
  [System.Drawing.Color]::FromArgb(255, 126, 62, 8),
  [System.Drawing.Color]::FromArgb(255, 194, 98, 8),
  [System.Drawing.Color]::FromArgb(255, 230, 151, 43),
  [System.Drawing.Color]::FromArgb(255, 59, 47, 38),
  [System.Drawing.Color]::FromArgb(255, 255, 244, 215)
)
$skinPalettes = [ordered]@{
  chestnut = $sourcePalette
  palomino = @(
    [System.Drawing.Color]::FromArgb(255, 42, 30, 19),
    [System.Drawing.Color]::FromArgb(255, 95, 62, 28),
    [System.Drawing.Color]::FromArgb(255, 166, 111, 42),
    [System.Drawing.Color]::FromArgb(255, 222, 166, 70),
    [System.Drawing.Color]::FromArgb(255, 247, 211, 134),
    [System.Drawing.Color]::FromArgb(255, 238, 218, 168),
    [System.Drawing.Color]::FromArgb(255, 255, 244, 215)
  )
  midnight = @(
    [System.Drawing.Color]::FromArgb(255, 12, 15, 20),
    [System.Drawing.Color]::FromArgb(255, 27, 32, 41),
    [System.Drawing.Color]::FromArgb(255, 49, 57, 72),
    [System.Drawing.Color]::FromArgb(255, 71, 82, 101),
    [System.Drawing.Color]::FromArgb(255, 112, 126, 148),
    [System.Drawing.Color]::FromArgb(255, 20, 22, 29),
    [System.Drawing.Color]::FromArgb(255, 255, 244, 215)
  )
}

$sourcePaletteIndexes = @{}
for ($index = 0; $index -lt $sourcePalette.Count; $index += 1) {
  $sourceArgb = $sourcePalette[$index].ToArgb()
  $sourcePaletteIndexes[$sourceArgb] = $index
}
$transparentArgb = [System.Drawing.Color]::FromArgb(0, 0, 0, 0).ToArgb()

foreach ($frame in $canonicalFrames) {
  $image = [System.Drawing.Bitmap]::FromFile($frame.Path)
  try {
    for ($y = 0; $y -lt 128; $y += 1) {
      for ($x = 0; $x -lt 128; $x += 1) {
        $pixel = $image.GetPixel($x, $y)
        $argb = $pixel.ToArgb()
        if ($pixel.A -eq 0) {
          if ($argb -ne $transparentArgb) {
            throw "Transparent pixel must be zero RGBA in $($frame.Name) at $x,$y."
          }
          continue
        }
        if ($pixel.A -ne 255) {
          throw "Canonical frame has partial alpha in $($frame.Name) at $x,$y."
        }
        if (-not $sourcePaletteIndexes.ContainsKey($argb)) {
          throw "Canonical frame has an unknown palette color in $($frame.Name) at $x,$y."
        }
      }
    }
  } finally {
    $image.Dispose()
  }
}

$expectedSheetNames = @(
  $skinPalettes.Keys | ForEach-Object { "horse-$_-sheet.png" }
)
$actualSheetNames = @(
  Get-ChildItem -LiteralPath $animationRoot -Filter "horse-*-sheet.png" -File |
    ForEach-Object Name
)
$unexpectedSheets = @(
  $actualSheetNames | Where-Object { $_ -notin $expectedSheetNames }
)
$missingSheets = @(
  $expectedSheetNames | Where-Object { $_ -notin $actualSheetNames }
)
if (
  $actualSheetNames.Count -ne 3 -or
  $unexpectedSheets.Count -gt 0 -or
  $missingSheets.Count -gt 0
) {
  throw (
    "Expected exactly these horse skin sheets: " +
    ($expectedSheetNames -join ", ")
  )
}

foreach ($skinId in $skinPalettes.Keys) {
  $targetPalette = $skinPalettes[$skinId]
  if ($targetPalette.Count -ne $sourcePalette.Count) {
    throw "Skin palette must map all source colors: $skinId"
  }

  $sheetPath = Join-Path $animationRoot "horse-$skinId-sheet.png"
  $sheet = [System.Drawing.Bitmap]::FromFile($sheetPath)
  try {
    if ($sheet.Width -ne 640 -or $sheet.Height -ne 1024) {
      throw "Horse skin sheet must be 640x1024: $sheetPath"
    }
    if (
      $sheet.PixelFormat -ne
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    ) {
      throw "Horse skin sheet must use 32-bit ARGB pixels: $sheetPath"
    }

    for ($frameIndex = 0; $frameIndex -lt $canonicalFrames.Count; $frameIndex += 1) {
      $frame = $canonicalFrames[$frameIndex]
      $column = $frameIndex % 5
      $row = [Math]::Floor($frameIndex / 5)
      $sourceImage = [System.Drawing.Bitmap]::FromFile($frame.Path)
      try {
        for ($y = 0; $y -lt 128; $y += 1) {
          for ($x = 0; $x -lt 128; $x += 1) {
            $sourcePixel = $sourceImage.GetPixel($x, $y)
            $sourceArgb = $sourcePixel.ToArgb()
            if ($sourcePixel.A -eq 0) {
              $expectedArgb = $transparentArgb
            } else {
              $paletteIndex = $sourcePaletteIndexes[$sourceArgb]
              $expectedArgb = $targetPalette[$paletteIndex].ToArgb()
            }
            $actualArgb = $sheet.GetPixel(
              ($column * 128) + $x,
              ($row * 128) + $y
            ).ToArgb()
            if ($actualArgb -ne $expectedArgb) {
              throw (
                "Horse skin pixel mismatch for $skinId/$($frame.Name) " +
                "at $x,$y."
              )
            }
          }
        }
      } finally {
        $sourceImage.Dispose()
      }
    }
  } finally {
    $sheet.Dispose()
  }
}

$animationBuilder = Get-Content `
  (Join-Path $PSScriptRoot "build-animation-assets.ps1") -Raw
if ($animationBuilder -match "\\.codex\\generated_images") {
  throw "Animation builder still depends on a user-specific generated path."
}
if ($animationBuilder -notmatch "build-horse-skins\.ps1") {
  throw "Animation builder does not generate the horse skin sheets."
}

$skinBuilderPath = Join-Path $PSScriptRoot "build-horse-skins.ps1"
if (-not (Test-Path -LiteralPath $skinBuilderPath -PathType Leaf)) {
  throw "Missing deterministic horse skin builder: $skinBuilderPath"
}
$skinBuilder = Get-Content $skinBuilderPath -Raw
if ($skinBuilder -match "\\.codex\\generated_images") {
  throw "Horse skin builder depends on a user-specific generated path."
}

$phaserSource = Get-Content `
  (Join-Path $projectRoot "vendor\phaser.min.js") -Raw
if ($phaserSource -notmatch "3\.90\.0") {
  throw "Unexpected Phaser runtime version."
}

Write-Output "Project checks passed: server paths, 40 canonical frames, 3 exact horse skin sheets, sources, and Phaser runtime."
