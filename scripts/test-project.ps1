param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$animationRoot = Join-Path $projectRoot "public\assets\horse\animation"
$sourceRoot = Join-Path $projectRoot "public\assets\horse\source"
$palominoMaskPath = Join-Path $sourceRoot "palomino-flaxen-mask.png"

& (Join-Path $projectRoot "server.ps1") -SelfTest
& (Join-Path $PSScriptRoot "test-game-core.ps1")

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
    [System.Drawing.Color]::FromArgb(255, 241, 193, 108),
    [System.Drawing.Color]::FromArgb(255, 70, 55, 43),
    [System.Drawing.Color]::FromArgb(255, 24, 16, 10)
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
$palominoMaskRoles = @(
  [pscustomobject]@{
    Name = "mane-shadow"
    Code = [System.Drawing.Color]::FromArgb(255, 255, 0, 0)
    Output = [System.Drawing.Color]::FromArgb(255, 176, 157, 112)
  },
  [pscustomobject]@{
    Name = "mane-base"
    Code = [System.Drawing.Color]::FromArgb(255, 255, 96, 0)
    Output = [System.Drawing.Color]::FromArgb(255, 226, 213, 174)
  },
  [pscustomobject]@{
    Name = "mane-light"
    Code = [System.Drawing.Color]::FromArgb(255, 255, 192, 0)
    Output = [System.Drawing.Color]::FromArgb(255, 255, 244, 215)
  },
  [pscustomobject]@{
    Name = "tail-shadow"
    Code = [System.Drawing.Color]::FromArgb(255, 0, 0, 255)
    Output = [System.Drawing.Color]::FromArgb(255, 176, 157, 112)
  },
  [pscustomobject]@{
    Name = "tail-base"
    Code = [System.Drawing.Color]::FromArgb(255, 0, 96, 255)
    Output = [System.Drawing.Color]::FromArgb(255, 226, 213, 174)
  },
  [pscustomobject]@{
    Name = "tail-light"
    Code = [System.Drawing.Color]::FromArgb(255, 0, 192, 255)
    Output = [System.Drawing.Color]::FromArgb(255, 255, 244, 215)
  }
)

$sourcePaletteIndexes = @{}
for ($index = 0; $index -lt $sourcePalette.Count; $index += 1) {
  $sourceArgb = $sourcePalette[$index].ToArgb()
  $sourcePaletteIndexes[$sourceArgb] = $index
}
$transparentArgb = [System.Drawing.Color]::FromArgb(0, 0, 0, 0).ToArgb()
$palominoMaskRoleByArgb = @{}
foreach ($role in $palominoMaskRoles) {
  $palominoMaskRoleByArgb[$role.Code.ToArgb()] = $role
}
$palominoMaskOverrides = @{}
foreach ($frame in $canonicalFrames) {
  $palominoMaskOverrides[$frame.Name] = @{}
}
if (-not (Test-Path -LiteralPath $palominoMaskPath -PathType Leaf)) {
  throw "Missing Palomino semantic mask: $palominoMaskPath"
}
$palominoMask = [System.Drawing.Bitmap]::FromFile($palominoMaskPath)
try {
  if ($palominoMask.Width -ne 160 -or $palominoMask.Height -ne 256) {
    throw "Palomino semantic mask must be 160x256: $palominoMaskPath"
  }
  if (
    $palominoMask.PixelFormat -ne
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  ) {
    throw "Palomino semantic mask must use 32-bit ARGB pixels."
  }
  for ($maskY = 0; $maskY -lt $palominoMask.Height; $maskY += 1) {
    for ($maskX = 0; $maskX -lt $palominoMask.Width; $maskX += 1) {
      $maskPixel = $palominoMask.GetPixel($maskX, $maskY)
      if ($maskPixel.A -eq 0) {
        if ($maskPixel.ToArgb() -ne $transparentArgb) {
          throw "Palomino mask transparency must be zero RGBA at $maskX,$maskY."
        }
        continue
      }
      if ($maskPixel.A -ne 255) {
        throw "Palomino semantic mask has partial alpha at $maskX,$maskY."
      }
      if (-not $palominoMaskRoleByArgb.ContainsKey($maskPixel.ToArgb())) {
        throw "Palomino semantic mask has an unknown role at $maskX,$maskY."
      }

      $frameColumn = [Math]::Floor($maskX / 32)
      $frameRow = [Math]::Floor($maskY / 32)
      $frame = $canonicalFrames[($frameRow * 5) + $frameColumn]
      $localKey = "$(($maskX % 32)),$(($maskY % 32))"
      $palominoMaskOverrides[$frame.Name][$localKey] =
        $palominoMaskRoleByArgb[$maskPixel.ToArgb()].Output.ToArgb()
    }
  }
} finally {
  $palominoMask.Dispose()
}
foreach ($frame in $canonicalFrames) {
  if ($palominoMaskOverrides[$frame.Name].Count -lt 2) {
    throw "Palomino semantic mask must mark flaxen hair in $($frame.Name)."
  }
}
$stabilizedColorBlocks = @{
  "horse-se-walk-0.png" = @(
    [pscustomobject]@{ Point = [System.Drawing.Point]::new(27, 25); Role = 3 }
  )
  "horse-se-walk-2.png" = @(
    [pscustomobject]@{ Point = [System.Drawing.Point]::new(27, 25); Role = 3 }
  )
  "horse-se-walk-3.png" = @(
    [pscustomobject]@{ Point = [System.Drawing.Point]::new(25, 25); Role = 3 },
    [pscustomobject]@{ Point = [System.Drawing.Point]::new(26, 25); Role = 3 }
  )
  "horse-sw-walk-0.png" = @(
    [pscustomobject]@{ Point = [System.Drawing.Point]::new(13, 15); Role = 3 }
  )
  "horse-sw-walk-1.png" = @(
    [pscustomobject]@{ Point = [System.Drawing.Point]::new(15, 15); Role = 0 },
    [pscustomobject]@{ Point = [System.Drawing.Point]::new(15, 16); Role = 0 }
  )
  "horse-sw-walk-3.png" = @(
    [pscustomobject]@{ Point = [System.Drawing.Point]::new(14, 16); Role = 1 }
  )
}
$palominoMixedRoleColor = $skinPalettes["palomino"][5]
if (
  $palominoMixedRoleColor.R -ge 128 -or
  $palominoMixedRoleColor.G -ge 128 -or
  $palominoMixedRoleColor.B -ge 128
) {
  throw "Palomino's shared mane, hoof, and leg-shadow role must remain dark."
}
$palominoEyeColor = $skinPalettes["palomino"][6]
if (
  $palominoEyeColor.R -ge 64 -or
  $palominoEyeColor.G -ge 64 -or
  $palominoEyeColor.B -ge 64
) {
  throw "Palomino's side-profile eye must remain a dark contrast pixel."
}

$frameMetrics = @()
foreach ($frame in $canonicalFrames) {
  $image = [System.Drawing.Bitmap]::FromFile($frame.Path)
  try {
    $frameMaskOverrides = $palominoMaskOverrides[$frame.Name]
    $opaquePixels = 0
    $eyePixels = 0
    $opaqueLogicalCells = @{}
    $firstOpaqueLogicalPoint = $null
    $minOpaqueX = 128
    $minOpaqueY = 128
    $maxOpaqueX = -1
    $maxOpaqueY = -1
    for ($y = 0; $y -lt 128; $y += 1) {
      for ($x = 0; $x -lt 128; $x += 1) {
        $pixel = $image.GetPixel($x, $y)
        $argb = $pixel.ToArgb()
        $logicalPixelArgb = $image.GetPixel(
          $x - ($x % 4),
          $y - ($y % 4)
        ).ToArgb()
        if ($argb -ne $logicalPixelArgb) {
          throw "Canonical frame breaks its 4x4 pixel grid in $($frame.Name) at $x,$y."
        }
        if ($pixel.A -eq 0) {
          if (
            $x % 4 -eq 0 -and
            $y % 4 -eq 0 -and
            $frameMaskOverrides.ContainsKey("$($x / 4),$($y / 4)")
          ) {
            throw "Palomino semantic mask leaves the horse in $($frame.Name) at $x,$y."
          }
          if ($argb -ne $transparentArgb) {
            throw "Transparent pixel must be zero RGBA in $($frame.Name) at $x,$y."
          }
          continue
        }
        if ($pixel.A -ne 255) {
          throw "Canonical frame has partial alpha in $($frame.Name) at $x,$y."
        }
        if ($x % 4 -eq 0 -and $y % 4 -eq 0) {
          $logicalKey = "$x,$y"
          $opaqueLogicalCells[$logicalKey] = $true
          if ($null -eq $firstOpaqueLogicalPoint) {
            $firstOpaqueLogicalPoint = [System.Drawing.Point]::new($x, $y)
          }
          $maskKey = "$($x / 4),$($y / 4)"
          if (
            $frameMaskOverrides.ContainsKey($maskKey) -and
            $argb -in @($sourcePalette[0].ToArgb(), $sourcePalette[6].ToArgb())
          ) {
            throw (
              "Palomino semantic mask covers outline or eye in " +
              "$($frame.Name) at $x,$y."
            )
          }
        }
        $opaquePixels += 1
        $minOpaqueX = [Math]::Min($minOpaqueX, $x)
        $minOpaqueY = [Math]::Min($minOpaqueY, $y)
        $maxOpaqueX = [Math]::Max($maxOpaqueX, $x)
        $maxOpaqueY = [Math]::Max($maxOpaqueY, $y)
        if ($argb -eq $sourcePalette[6].ToArgb()) {
          $eyePixels += 1
        }
        if (
          $x -eq 0 -or
          $x -eq 127 -or
          $y -eq 0 -or
          $y -eq 127
        ) {
          throw "Canonical frame touches its cell boundary in $($frame.Name) at $x,$y."
        }
        if (-not $sourcePaletteIndexes.ContainsKey($argb)) {
          throw "Canonical frame has an unknown palette color in $($frame.Name) at $x,$y."
        }
      }
    }
    if ($opaqueLogicalCells.Count -eq 0) {
      throw "Canonical frame has no horse pixels: $($frame.Name)"
    }
    $visitedLogicalCells = @{}
    $pendingLogicalCells = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()
    $pendingLogicalCells.Enqueue($firstOpaqueLogicalPoint)
    while ($pendingLogicalCells.Count -gt 0) {
      $point = $pendingLogicalCells.Dequeue()
      $pointKey = "$($point.X),$($point.Y)"
      if ($visitedLogicalCells.ContainsKey($pointKey)) {
        continue
      }
      $visitedLogicalCells[$pointKey] = $true
      $neighbors = @(
        [System.Drawing.Point]::new($point.X - 4, $point.Y - 4),
        [System.Drawing.Point]::new($point.X, $point.Y - 4),
        [System.Drawing.Point]::new($point.X + 4, $point.Y - 4),
        [System.Drawing.Point]::new($point.X - 4, $point.Y),
        [System.Drawing.Point]::new($point.X + 4, $point.Y),
        [System.Drawing.Point]::new($point.X - 4, $point.Y + 4),
        [System.Drawing.Point]::new($point.X, $point.Y + 4),
        [System.Drawing.Point]::new($point.X + 4, $point.Y + 4)
      )
      foreach ($neighbor in $neighbors) {
        $neighborKey = "$($neighbor.X),$($neighbor.Y)"
        if (
          $opaqueLogicalCells.ContainsKey($neighborKey) -and
          -not $visitedLogicalCells.ContainsKey($neighborKey)
        ) {
          $pendingLogicalCells.Enqueue($neighbor)
        }
      }
    }
    if ($visitedLogicalCells.Count -ne $opaqueLogicalCells.Count) {
      throw "Canonical frame contains detached pixel islands: $($frame.Name)"
    }
    if ($stabilizedColorBlocks.ContainsKey($frame.Name)) {
      foreach ($correction in $stabilizedColorBlocks[$frame.Name]) {
        $point = $correction.Point
        $actualArgb = $image.GetPixel(
          $point.X * 4,
          $point.Y * 4
        ).ToArgb()
        if ($actualArgb -ne $sourcePalette[$correction.Role].ToArgb()) {
          throw (
            "Transient color was not stabilized in $($frame.Name) " +
            "at $($point.X),$($point.Y)."
          )
        }
      }
    }
    $isSideProfile = $frame.Direction -in @("e", "w")
    if ($isSideProfile -and $eyePixels -ne 16) {
      throw "Side-profile frame must contain exactly one 4x4 eye: $($frame.Name)"
    }
    if (-not $isSideProfile -and $eyePixels -ne 0) {
      throw "Non-side-profile frame must not contain an eye: $($frame.Name)"
    }
    $frameMetrics += [pscustomobject]@{
      Direction = $frame.Direction
      Name = $frame.Name
      OpaquePixels = $opaquePixels
      Width = $maxOpaqueX - $minOpaqueX + 1
      Height = $maxOpaqueY - $minOpaqueY + 1
      Bottom = $maxOpaqueY
    }
  } finally {
    $image.Dispose()
  }
}

foreach ($direction in $directions) {
  $directionMetrics = @(
    $frameMetrics | Where-Object Direction -eq $direction
  )
  $idle = $directionMetrics | Where-Object Name -like "*-idle.png"
  $walkFrames = @(
    $directionMetrics | Where-Object Name -like "*-walk-*.png"
  )
  foreach ($walk in $walkFrames) {
    $areaRatio = $walk.OpaquePixels / $idle.OpaquePixels
    if ($areaRatio -lt 0.8 -or $areaRatio -gt 1.25) {
      throw "Animation geometry changes scale unexpectedly: $($walk.Name)"
    }
    if (
      [Math]::Abs($walk.Width - $idle.Width) -gt 20 -or
      [Math]::Abs($walk.Height - $idle.Height) -gt 20 -or
      [Math]::Abs($walk.Bottom - $idle.Bottom) -gt 16
    ) {
      throw "Animation geometry shifts unexpectedly: $($walk.Name)"
    }
  }
}

foreach ($direction in $directions) {
  $walkFrames = @(
    $canonicalFrames |
      Where-Object {
        $_.Direction -eq $direction -and $_.Name -like "*-walk-*.png"
      } |
      Sort-Object Name
  )
  $walkImages = [System.Collections.Generic.List[System.Drawing.Bitmap]]::new()
  try {
    foreach ($walkFrame in $walkFrames) {
      $walkImages.Add([System.Drawing.Bitmap]::FromFile($walkFrame.Path))
    }
    for ($logicalY = 0; $logicalY -lt 32; $logicalY += 1) {
      for ($logicalX = 0; $logicalX -lt 32; $logicalX += 1) {
        $isStableBody = $true
        foreach ($walkImage in $walkImages) {
          $pixel = $walkImage.GetPixel($logicalX * 4, $logicalY * 4)
          if (
            $pixel.A -eq 0 -or
            $pixel.ToArgb() -in @(
              $sourcePalette[0].ToArgb(),
              $sourcePalette[6].ToArgb()
            )
          ) {
            $isStableBody = $false
            break
          }
        }
        if (-not $isStableBody) {
          continue
        }

        $maskKey = "$logicalX,$logicalY"
        $stableValues = @(
          foreach ($walkFrame in $walkFrames) {
            $overrides = $palominoMaskOverrides[$walkFrame.Name]
            if ($overrides.ContainsKey($maskKey)) {
              $overrides[$maskKey]
            } else {
              $transparentArgb
            }
          }
        )
        if (@($stableValues | Select-Object -Unique).Count -ne 1) {
          throw (
            "Palomino flaxen color glimmers inside stable anatomy for " +
            "$direction at $maskKey."
          )
        }
      }
    }
  } finally {
    foreach ($walkImage in $walkImages) {
      $walkImage.Dispose()
    }
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
      $frameMaskOverrides = $palominoMaskOverrides[$frame.Name]
      $column = $frameIndex % 5
      $row = [Math]::Floor($frameIndex / 5)
      $sourceImage = [System.Drawing.Bitmap]::FromFile($frame.Path)
      try {
        for ($y = 0; $y -lt 128; $y += 1) {
          for ($x = 0; $x -lt 128; $x += 1) {
            $sourcePixel = $sourceImage.GetPixel($x, $y)
            $sourceArgb = $sourcePixel.ToArgb()
            $actualArgb = $sheet.GetPixel(
              ($column * 128) + $x,
              ($row * 128) + $y
            ).ToArgb()
            if ($sourcePixel.A -eq 0) {
              $expectedArgb = $transparentArgb
            } else {
              $paletteIndex = $sourcePaletteIndexes[$sourceArgb]
              $expectedArgb = $targetPalette[$paletteIndex].ToArgb()
              if ($skinId -eq "palomino") {
                $maskKey = "$([Math]::Floor($x / 4)),$([Math]::Floor($y / 4))"
                if ($frameMaskOverrides.ContainsKey($maskKey)) {
                  $expectedArgb = $frameMaskOverrides[$maskKey]
                }
              }
            }
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
if ($animationBuilder -notmatch "build-palomino-mask\.ps1") {
  throw "Animation builder does not regenerate the Palomino semantic mask."
}

$skinBuilderPath = Join-Path $PSScriptRoot "build-horse-skins.ps1"
if (-not (Test-Path -LiteralPath $skinBuilderPath -PathType Leaf)) {
  throw "Missing deterministic horse skin builder: $skinBuilderPath"
}
$skinBuilder = Get-Content $skinBuilderPath -Raw
if ($skinBuilder -match "\\.codex\\generated_images") {
  throw "Horse skin builder depends on a user-specific generated path."
}

$palominoMaskBuilderPath = Join-Path `
  $PSScriptRoot `
  "build-palomino-mask.ps1"
if (-not (Test-Path -LiteralPath $palominoMaskBuilderPath -PathType Leaf)) {
  throw "Missing deterministic Palomino mask builder: $palominoMaskBuilderPath"
}
$palominoMaskBuilder = Get-Content $palominoMaskBuilderPath -Raw
if ($palominoMaskBuilder -match "\\.codex\\generated_images") {
  throw "Palomino mask builder depends on a user-specific generated path."
}
$palominoDesignPath = Join-Path `
  $sourceRoot `
  "palomino-design-reference-chroma.png"
if (-not (Test-Path -LiteralPath $palominoDesignPath -PathType Leaf)) {
  throw "Missing checked-in Palomino design reference: $palominoDesignPath"
}

$gameSource = Get-Content (Join-Path $projectRoot "src\game.js") -Raw
if (
  $gameSource -notmatch "pixelArt:\s*true" -or
  $gameSource -notmatch "roundPixels:\s*true"
) {
  throw "Phaser must keep pixel-art filtering and render rounding enabled."
}
$cameraZooms = [regex]::Matches(
  $gameSource,
  "\.setZoom\(\s*(?<zoom>\d+(?:\.\d+)?)\s*\)"
)
foreach ($cameraZoom in $cameraZooms) {
  $zoom = [double]$cameraZoom.Groups["zoom"].Value
  if ($zoom -ne [Math]::Truncate($zoom)) {
    throw "Fractional camera zoom disables Phaser pixel rounding: $zoom"
  }
}
if ($gameSource -match "horse\.setY\(Math\.round") {
  throw "Horse physics positions must not be snapped to repair rendering."
}

$phaserSource = Get-Content `
  (Join-Path $projectRoot "vendor\phaser.min.js") -Raw
if ($phaserSource -notmatch "3\.90\.0") {
  throw "Unexpected Phaser runtime version."
}

Write-Output "Project checks passed: server paths, 40 connected grid-aligned canonical frames, 3 exact horse skin sheets, stable bespoke Palomino semantics, sources, and Phaser runtime."
