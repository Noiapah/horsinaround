param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$animationRoot = Join-Path $projectRoot "public\assets\horse\animation"
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
    "42,30,19",
    "95,62,28",
    "166,111,42",
    "222,166,70",
    "247,211,134",
    "238,218,168",
    "255,244,215"
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

function Test-LogicalBlockTouchesTransparency(
  [System.Drawing.Bitmap]$image,
  [int]$blockX,
  [int]$blockY
) {
  $neighbors = @(
    [pscustomobject]@{ X = $blockX - 4; Y = $blockY },
    [pscustomobject]@{ X = $blockX + 4; Y = $blockY },
    [pscustomobject]@{ X = $blockX; Y = $blockY - 4 },
    [pscustomobject]@{ X = $blockX; Y = $blockY + 4 }
  )
  foreach ($neighbor in $neighbors) {
    $x = $neighbor.X
    $y = $neighbor.Y
    if (
      $x -lt 0 -or
      $x -ge $image.Width -or
      $y -lt 0 -or
      $y -ge $image.Height
    ) {
      return $true
    }
    if ($image.GetPixel($x, $y).A -eq 0) {
      return $true
    }
  }
  return $false
}

function Repair-PalominoSilhouette(
  [System.Drawing.Bitmap]$sheet,
  [string]$animationRoot,
  [string[]]$directions
) {
  # The source's neutral mane shade also serves as a moving-leg outline.
  # Keep it cream inside the horse, but use the dark coat shade for exposed
  # 4x4 edge blocks so walking frames do not flash a cream fringe.
  $mixedSourceColor = Convert-ToColor "59,47,38"
  $edgeColor = Convert-ToColor "95,62,28"

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
      $sourceImage = [System.Drawing.Bitmap]::FromFile($framePath)
      try {
        for ($blockY = 0; $blockY -lt 128; $blockY += 4) {
          for ($blockX = 0; $blockX -lt 128; $blockX += 4) {
            if (
              $sourceImage.GetPixel($blockX, $blockY).ToArgb() -ne
              $mixedSourceColor.ToArgb()
            ) {
              continue
            }
            $touchesTransparency = Test-LogicalBlockTouchesTransparency `
              -image $sourceImage `
              -blockX $blockX `
              -blockY $blockY
            if (-not $touchesTransparency) {
              continue
            }

            for ($y = 0; $y -lt 4; $y += 1) {
              for ($x = 0; $x -lt 4; $x += 1) {
                $sheet.SetPixel(
                  ($column * 128) + $blockX + $x,
                  ($row * 128) + $blockY + $y,
                  $edgeColor
                )
              }
            }
          }
        }
      } finally {
        $sourceImage.Dispose()
      }
    }
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
      Repair-PalominoSilhouette $sheet $animationRoot $directions
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
