param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$horseRoot = Join-Path $projectRoot "public\assets\horse"
$animationRoot = Join-Path $horseRoot "animation"
$sourceRoot = Join-Path $horseRoot "source"
$designPath = Join-Path $sourceRoot "palomino-design-reference-chroma.png"
$outputPath = Join-Path $sourceRoot "palomino-flaxen-mask.png"

if (-not (Test-Path -LiteralPath $designPath -PathType Leaf)) {
  throw "Missing Palomino design reference: $designPath"
}

$directions = @("n", "ne", "e", "se", "s", "sw", "w", "nw")
$poses = @("idle", "walk-0", "walk-1", "walk-2", "walk-3")
# The generated turnaround presents the front-facing and rear-facing rows in
# screen-view order, so north and south are intentionally exchanged here.
$designRows = @(4, 1, 2, 3, 0, 5, 6, 7)
# Foreground bounds were reviewed against the checked-in 981x1604 concept.
# They keep the reference aligned to each canonical frame without repeatedly
# scanning more than 1.5 million reference pixels during every asset rebuild.
$designBoundsData = @(
  "65,818,131,995", "264,818,328,1000", "463,818,527,995",
  "663,818,728,1000", "861,818,923,999",
  "26,216,163,390", "228,221,376,389", "429,221,563,389",
  "632,225,771,388", "827,226,970,388",
  "5,432,196,581", "209,434,386,583", "409,432,588,582",
  "588,441,783,581", "807,435,981,583",
  "19,616,183,792", "222,625,375,793", "423,626,572,788",
  "613,621,771,798", "814,619,969,785",
  "64,12,131,184", "269,12,334,184", "464,16,537,184",
  "663,12,732,188", "866,12,930,183",
  "30,1028,160,1203", "234,1033,354,1203", "438,1033,555,1203",
  "635,1032,761,1203", "835,1035,962,1203",
  "5,1203,195,1396", "209,1203,390,1393", "406,1203,575,1393",
  "602,1203,780,1396", "801,1203,977,1392",
  "35,1436,173,1595", "224,1436,368,1594", "424,1440,559,1595",
  "621,1443,760,1595", "813,1444,953,1595"
)
if ($designBoundsData.Count -ne 40) {
  throw "Palomino reference metadata must define exactly 40 frame bounds."
}
$facingVectors = @(
  [System.Drawing.PointF]::new(0, -1),
  [System.Drawing.PointF]::new(0.707, -0.707),
  [System.Drawing.PointF]::new(1, 0),
  [System.Drawing.PointF]::new(0.707, 0.707),
  [System.Drawing.PointF]::new(0, 1),
  [System.Drawing.PointF]::new(-0.707, 0.707),
  [System.Drawing.PointF]::new(-1, 0),
  [System.Drawing.PointF]::new(-0.707, -0.707)
)

$outlineArgb = [System.Drawing.Color]::FromArgb(255, 31, 22, 13).ToArgb()
$eyeArgb = [System.Drawing.Color]::FromArgb(255, 255, 244, 215).ToArgb()
$transparent = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
$maskColors = [ordered]@{
  maneShadow = [System.Drawing.Color]::FromArgb(255, 255, 0, 0)
  maneBase = [System.Drawing.Color]::FromArgb(255, 255, 96, 0)
  maneLight = [System.Drawing.Color]::FromArgb(255, 255, 192, 0)
  tailShadow = [System.Drawing.Color]::FromArgb(255, 0, 0, 255)
  tailBase = [System.Drawing.Color]::FromArgb(255, 0, 96, 255)
  tailLight = [System.Drawing.Color]::FromArgb(255, 0, 192, 255)
}
$maskArgb = @{}
foreach ($color in $maskColors.Values) {
  $maskArgb[$color.ToArgb()] = $true
}

function Get-CanonicalHorseBounds([System.Drawing.Bitmap]$frame) {
  $minX = 32
  $minY = 32
  $maxX = -1
  $maxY = -1
  for ($logicalY = 0; $logicalY -lt 32; $logicalY += 1) {
    for ($logicalX = 0; $logicalX -lt 32; $logicalX += 1) {
      if ($frame.GetPixel($logicalX * 4, $logicalY * 4).A -eq 0) {
        continue
      }
      $minX = [Math]::Min($minX, $logicalX)
      $minY = [Math]::Min($minY, $logicalY)
      $maxX = [Math]::Max($maxX, $logicalX)
      $maxY = [Math]::Max($maxY, $logicalY)
    }
  }
  if ($maxX -lt $minX -or $maxY -lt $minY) {
    throw "Canonical horse frame contains no opaque pixels."
  }
  return [System.Drawing.Rectangle]::FromLTRB(
    $minX,
    $minY,
    $maxX + 1,
    $maxY + 1
  )
}

function Remove-SmallMaskComponents(
  [System.Drawing.Bitmap]$mask,
  [int]$originX,
  [int]$originY,
  [int]$minimumSize = 3
) {
  $visited = @{}
  for ($y = 0; $y -lt 32; $y += 1) {
    for ($x = 0; $x -lt 32; $x += 1) {
      $key = "$x,$y"
      if (
        $visited.ContainsKey($key) -or
        $mask.GetPixel($originX + $x, $originY + $y).A -eq 0
      ) {
        continue
      }
      $component = [System.Collections.Generic.List[System.Drawing.Point]]::new()
      $pending = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()
      $pending.Enqueue([System.Drawing.Point]::new($x, $y))
      while ($pending.Count -gt 0) {
        $point = $pending.Dequeue()
        $pointKey = "$($point.X),$($point.Y)"
        if ($visited.ContainsKey($pointKey)) {
          continue
        }
        $visited[$pointKey] = $true
        $component.Add($point)
        for ($offsetY = -1; $offsetY -le 1; $offsetY += 1) {
          for ($offsetX = -1; $offsetX -le 1; $offsetX += 1) {
            if ($offsetX -eq 0 -and $offsetY -eq 0) {
              continue
            }
            $neighborX = $point.X + $offsetX
            $neighborY = $point.Y + $offsetY
            if (
              $neighborX -lt 0 -or
              $neighborX -ge 32 -or
              $neighborY -lt 0 -or
              $neighborY -ge 32
            ) {
              continue
            }
            $neighborKey = "$neighborX,$neighborY"
            if (
              -not $visited.ContainsKey($neighborKey) -and
              $mask.GetPixel(
                $originX + $neighborX,
                $originY + $neighborY
              ).A -ne 0
            ) {
              $pending.Enqueue(
                [System.Drawing.Point]::new($neighborX, $neighborY)
              )
            }
          }
        }
      }
      if ($component.Count -lt $minimumSize) {
        foreach ($point in $component) {
          $mask.SetPixel(
            $originX + $point.X,
            $originY + $point.Y,
            $transparent
          )
        }
      }
    }
  }
}

function Save-PngAtomically(
  [System.Drawing.Bitmap]$bitmap,
  [string]$path
) {
  $token = [Guid]::NewGuid().ToString("N")
  $temporaryPath = "$path.tmp-$token.png"
  $backupPath = "$path.backup-$token"
  try {
    $stream = [System.IO.File]::Open(
      $temporaryPath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $stream.Dispose()
    }
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      [System.IO.File]::Replace(
        [System.IO.Path]::GetFullPath($temporaryPath),
        [System.IO.Path]::GetFullPath($path),
        [System.IO.Path]::GetFullPath($backupPath),
        $true
      )
    } else {
      [System.IO.File]::Move($temporaryPath, $path)
    }
  } finally {
    if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
    if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
      Remove-Item -LiteralPath $backupPath -Force
    }
  }
}

$design = $null
$mask = $null
try {
  $design = [System.Drawing.Bitmap]::FromFile($designPath)
  if ($design.Width -ne 981 -or $design.Height -ne 1604) {
    throw "Palomino design reference must be 981x1604: $designPath"
  }
  if (
    $design.PixelFormat -ne
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  ) {
    throw "Palomino design reference must use 24-bit RGB pixels: $designPath"
  }
  $designRectangle = [System.Drawing.Rectangle]::new(
    0,
    0,
    $design.Width,
    $design.Height
  )
  $designData = $design.LockBits(
    $designRectangle,
    [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  try {
    if ($designData.Stride -le 0) {
      throw "Palomino design reference must use a top-down pixel buffer."
    }
    $designStride = $designData.Stride
    $designBytes = [byte[]]::new($designStride * $design.Height)
    [System.Runtime.InteropServices.Marshal]::Copy(
      $designData.Scan0,
      $designBytes,
      0,
      $designBytes.Length
    )
  } finally {
    $design.UnlockBits($designData)
  }
  $mask = [System.Drawing.Bitmap]::new(
    160,
    256,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  for ($directionIndex = 0; $directionIndex -lt $directions.Count; $directionIndex += 1) {
    $direction = $directions[$directionIndex]
    $designRow = $designRows[$directionIndex]
    $facing = $facingVectors[$directionIndex]
    for ($poseIndex = 0; $poseIndex -lt $poses.Count; $poseIndex += 1) {
      $pose = $poses[$poseIndex]
      # Hair belongs to the horse's body, not to a particular leg phase. Use
      # the reviewed idle turnaround for every gait frame; the canonical
      # frame still supplies the exact animated silhouette and registration.
      $referencePoseIndex = 0
      $framePath = Join-Path $animationRoot "horse-$direction-$pose.png"
      if (-not (Test-Path -LiteralPath $framePath -PathType Leaf)) {
        throw "Missing canonical frame: $framePath"
      }
      $frame = [System.Drawing.Bitmap]::FromFile($framePath)
      try {
        if ($frame.Width -ne 128 -or $frame.Height -ne 128) {
          throw "Canonical horse frame must be 128x128: $framePath"
        }
        $cellLeft = [int][Math]::Floor(
          $referencePoseIndex * $design.Width / 5
        )
        $cellRight = [int][Math]::Floor(
          ($referencePoseIndex + 1) * $design.Width / 5
        )
        $cellTop = [int][Math]::Floor($designRow * $design.Height / 8)
        $cellBottom = [int][Math]::Floor(($designRow + 1) * $design.Height / 8)
        $boundsParts = @(
          $designBoundsData[
            ($directionIndex * 5) + $referencePoseIndex
          ].Split(",") |
            ForEach-Object { [int]$_ }
        )
        $designBounds = [System.Drawing.Rectangle]::FromLTRB(
          $boundsParts[0],
          $boundsParts[1],
          $boundsParts[2],
          $boundsParts[3]
        )
        if (
          $designBounds.Left -lt $cellLeft -or
          $designBounds.Top -lt $cellTop -or
          $designBounds.Right -gt $cellRight -or
          $designBounds.Bottom -gt $cellBottom
        ) {
          throw "Palomino reference bounds leave their frame cell."
        }
        $canonicalBounds = Get-CanonicalHorseBounds $frame
        $maskOriginX = $poseIndex * 32
        $maskOriginY = $directionIndex * 32

        for ($logicalY = 0; $logicalY -lt 32; $logicalY += 1) {
          for ($logicalX = 0; $logicalX -lt 32; $logicalX += 1) {
            $canonical = $frame.GetPixel($logicalX * 4, $logicalY * 4)
            if (
              $canonical.A -eq 0 -or
              $canonical.ToArgb() -eq $outlineArgb -or
              $canonical.ToArgb() -eq $eyeArgb
            ) {
              continue
            }

            $relativeX = $logicalX - $canonicalBounds.X
            $relativeY = $logicalY - $canonicalBounds.Y
            # The frontal concept is drawn upright while the south-facing
            # top-down runtime sprite points toward the bottom of its cell.
            $designRelativeY = if ($direction -eq "s") {
              $canonicalBounds.Height - $relativeY - 1
            } else {
              $relativeY
            }
            $sampleLeft = $designBounds.X + [int][Math]::Floor(
              $relativeX * $designBounds.Width / $canonicalBounds.Width
            )
            $sampleRight = $designBounds.X + [int][Math]::Ceiling(
              ($relativeX + 1) * $designBounds.Width / $canonicalBounds.Width
            )
            $sampleTop = $designBounds.Y + [int][Math]::Floor(
              $designRelativeY * $designBounds.Height / $canonicalBounds.Height
            )
            $sampleBottom = $designBounds.Y + [int][Math]::Ceiling(
              ($designRelativeY + 1) * $designBounds.Height / $canonicalBounds.Height
            )
            $horsePixels = 0
            $flaxenPixels = 0
            $blueTotal = 0
            for ($sourceY = $sampleTop; $sourceY -lt $sampleBottom; $sourceY += 1) {
              for ($sourceX = $sampleLeft; $sourceX -lt $sampleRight; $sourceX += 1) {
                $sourceOffset = ($sourceY * $designStride) + ($sourceX * 3)
                $sampleBlue = $designBytes[$sourceOffset]
                $sampleGreen = $designBytes[$sourceOffset + 1]
                $sampleRed = $designBytes[$sourceOffset + 2]
                $isChroma = (
                  $sampleGreen -gt 165 -and
                  $sampleGreen -gt $sampleRed + 48 -and
                  $sampleGreen -gt $sampleBlue + 48
                )
                $isHorse = (
                  -not $isChroma -and
                  $sampleRed -ge $sampleGreen -and
                  $sampleRed -gt $sampleBlue + 15
                )
                if ($isHorse) {
                  $horsePixels += 1
                }
                if (
                  $isHorse -and
                  $sampleRed -ge 220 -and
                  $sampleGreen -ge 200 -and
                  $sampleBlue -ge 145 -and
                  ($sampleGreen - $sampleBlue) -le 85
                ) {
                  $flaxenPixels += 1
                  $blueTotal += $sampleBlue
                }
              }
            }
            if (
              $flaxenPixels -lt 2 -or
              $horsePixels -eq 0 -or
              $flaxenPixels / $horsePixels -lt 0.30
            ) {
              continue
            }

            $normalizedX =
              (($relativeX + 0.5) / $canonicalBounds.Width) - 0.5
            $normalizedY =
              (($relativeY + 0.5) / $canonicalBounds.Height) - 0.5
            $alongFacing =
              ($normalizedX * $facing.X) +
              ($normalizedY * $facing.Y)
            $feature = if ($alongFacing -lt -0.11) { "tail" } else { "mane" }
            $averageBlue = $blueTotal / $flaxenPixels
            $shade = if ($averageBlue -ge 210) {
              "Light"
            } elseif ($averageBlue -ge 175) {
              "Base"
            } else {
              "Shadow"
            }
            $mask.SetPixel(
              $maskOriginX + $logicalX,
              $maskOriginY + $logicalY,
              $maskColors["$feature$shade"]
            )
          }
        }
        Remove-SmallMaskComponents $mask $maskOriginX $maskOriginY 3
      } finally {
        $frame.Dispose()
      }
    }
  }

  for ($y = 0; $y -lt $mask.Height; $y += 1) {
    for ($x = 0; $x -lt $mask.Width; $x += 1) {
      $pixel = $mask.GetPixel($x, $y)
      if ($pixel.A -eq 0) {
        if ($pixel.ToArgb() -ne $transparent.ToArgb()) {
          throw "Mask transparency must be zero RGBA at $x,$y."
        }
      } elseif (-not $maskArgb.ContainsKey($pixel.ToArgb())) {
        throw "Unknown Palomino mask code at $x,$y."
      }
    }
  }

  Save-PngAtomically $mask $outputPath
} finally {
  if ($null -ne $mask) {
    $mask.Dispose()
  }
  if ($null -ne $design) {
    $design.Dispose()
  }
}

Write-Output "Built Palomino semantic mask at $outputPath"
