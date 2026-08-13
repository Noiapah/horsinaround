param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$animationRoot = Join-Path $projectRoot "public\assets\horse\animation"
$palominoMaskPath = Join-Path `
  $projectRoot `
  "public\assets\horse\source\palomino-flaxen-mask.png"
$directions = @("n", "ne", "e", "se", "s", "sw", "w", "nw")
$sourcePalette = @(
  "31,22,13",
  "82,45,20",
  "126,62,8",
  "194,98,8",
  "230,151,43",
  "59,47,38",
  "255,244,215"
)
$skinPalettes = [ordered]@{
  chestnut = @(
    "31,22,13",
    "82,45,20",
    "126,62,8",
    "194,98,8",
    "230,151,43",
    "59,47,38",
    "255,244,215"
  )
  palomino = @(
    "48,29,18",
    "104,61,22",
    "176,105,30",
    "224,156,54",
    "246,197,101",
    "75,48,31",
    "24,16,10"
  )
  midnight = @(
    "12,15,20",
    "27,32,41",
    "49,57,72",
    "71,82,101",
    "112,126,148",
    "20,22,29",
    "255,244,215"
  )
}
$palominoMaskColors = [ordered]@{
  "255,0,0" = "176,157,112"
  "255,96,0" = "226,213,174"
  "255,192,0" = "255,244,215"
  "0,0,255" = "176,157,112"
  "0,96,255" = "226,213,174"
  "0,192,255" = "255,244,215"
}

function Convert-ToColor([string]$value) {
  $parts = $value.Split(",")
  if ($parts.Count -ne 3) {
    throw "Invalid RGB palette value: $value"
  }
  return [System.Drawing.Color]::FromArgb(
    255,
    [int]$parts[0],
    [int]$parts[1],
    [int]$parts[2]
  )
}

function Apply-PalominoSemanticMask(
  [System.Drawing.Bitmap]$sheet,
  [string]$maskPath,
  [System.Collections.IDictionary]$maskPalette
) {
  if (-not (Test-Path -LiteralPath $maskPath -PathType Leaf)) {
    throw "Missing Palomino semantic mask: $maskPath"
  }
  $mask = [System.Drawing.Bitmap]::FromFile($maskPath)
  try {
    if ($mask.Width -ne 160 -or $mask.Height -ne 256) {
      throw "Palomino semantic mask must be 160x256: $maskPath"
    }

    $mappedColors = @{}
    foreach ($sourceValue in $maskPalette.Keys) {
      $sourceColor = Convert-ToColor $sourceValue
      $mappedColors[$sourceColor.ToArgb()] = Convert-ToColor `
        $maskPalette[$sourceValue]
    }

    for ($maskY = 0; $maskY -lt $mask.Height; $maskY += 1) {
      for ($maskX = 0; $maskX -lt $mask.Width; $maskX += 1) {
        $maskPixel = $mask.GetPixel($maskX, $maskY)
        if ($maskPixel.A -eq 0) {
          if ($maskPixel.ToArgb() -ne 0) {
            throw "Palomino mask transparency must be zero RGBA at $maskX,$maskY."
          }
          continue
        }
        if ($maskPixel.A -ne 255) {
          throw "Palomino mask must use binary alpha at $maskX,$maskY."
        }
        if (-not $mappedColors.ContainsKey($maskPixel.ToArgb())) {
          throw "Unknown Palomino semantic mask color at $maskX,$maskY."
        }

        $sheetX = $maskX * 4
        $sheetY = $maskY * 4
        $targetColor = $mappedColors[$maskPixel.ToArgb()]
        for ($blockY = 0; $blockY -lt 4; $blockY += 1) {
          for ($blockX = 0; $blockX -lt 4; $blockX += 1) {
            if ($sheet.GetPixel($sheetX + $blockX, $sheetY + $blockY).A -eq 0) {
              throw (
                "Palomino semantic mask leaves the horse silhouette at " +
                "$maskX,$maskY."
              )
            }
            $sheet.SetPixel(
              $sheetX + $blockX,
              $sheetY + $blockY,
              $targetColor
            )
          }
        }
      }
    }
  } finally {
    $mask.Dispose()
  }
}

foreach ($skinId in $skinPalettes.Keys) {
  $targetPalette = $skinPalettes[$skinId]
  if ($targetPalette.Count -ne $sourcePalette.Count) {
    throw "Skin palette must map all source colors: $skinId"
  }

  $colorMaps = [System.Drawing.Imaging.ColorMap[]]::new(
    $sourcePalette.Count
  )
  for ($index = 0; $index -lt $sourcePalette.Count; $index += 1) {
    $colorMap = [System.Drawing.Imaging.ColorMap]::new()
    $colorMap.OldColor = Convert-ToColor $sourcePalette[$index]
    $colorMap.NewColor = Convert-ToColor $targetPalette[$index]
    $colorMaps[$index] = $colorMap
  }

  $sheet = [System.Drawing.Bitmap]::new(
    640,
    1024,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($sheet)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode =
        [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.InterpolationMode =
        [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode =
        [System.Drawing.Drawing2D.PixelOffsetMode]::Half

      $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
      try {
        $attributes.SetRemapTable($colorMaps)
        for ($row = 0; $row -lt $directions.Count; $row += 1) {
          $direction = $directions[$row]
          $frameNames = @(
            "horse-$direction-idle.png",
            "horse-$direction-walk-0.png",
            "horse-$direction-walk-1.png",
            "horse-$direction-walk-2.png",
            "horse-$direction-walk-3.png"
          )
          for ($column = 0; $column -lt $frameNames.Count; $column += 1) {
            $framePath = Join-Path $animationRoot $frameNames[$column]
            if (-not (Test-Path -LiteralPath $framePath -PathType Leaf)) {
              throw "Missing canonical horse frame: $framePath"
            }
            $frameImage = [System.Drawing.Image]::FromFile($framePath)
            try {
              if ($frameImage.Width -ne 128 -or $frameImage.Height -ne 128) {
                throw "Horse frame must be 128x128: $framePath"
              }
              $destination = [System.Drawing.Rectangle]::new(
                $column * 128,
                $row * 128,
                128,
                128
              )
              $graphics.DrawImage(
                $frameImage,
                $destination,
                0,
                0,
                128,
                128,
                [System.Drawing.GraphicsUnit]::Pixel,
                $attributes
              )
            } finally {
              $frameImage.Dispose()
            }
          }
        }
      } finally {
        $attributes.Dispose()
      }
    } finally {
      $graphics.Dispose()
    }

    if ($skinId -eq "palomino") {
      Apply-PalominoSemanticMask `
        $sheet `
        $palominoMaskPath `
        $palominoMaskColors
    }

    $outputPath = Join-Path $animationRoot "horse-$skinId-sheet.png"
    $stream = [System.IO.File]::Open(
      $outputPath,
      [System.IO.FileMode]::Create,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    try {
      $sheet.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $stream.Dispose()
    }
  } finally {
    $sheet.Dispose()
  }
}

Write-Output "Built $($skinPalettes.Count) horse skin sheets in $animationRoot"
