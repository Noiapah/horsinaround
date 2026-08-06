param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$horseRoot = Join-Path $projectRoot "public\assets\horse"
$outputRoot = Join-Path $horseRoot "animation"
$sourceRoot = Join-Path $horseRoot "source"

New-Item -ItemType Directory -Force -Path $outputRoot, $sourceRoot | Out-Null

$sheets = [ordered]@{
    e  = (Join-Path $sourceRoot "horse-e-cycle-sheet.png")
    w  = (Join-Path $sourceRoot "horse-w-cycle-sheet.png")
    n  = (Join-Path $sourceRoot "horse-n-cycle-sheet.png")
    s  = (Join-Path $sourceRoot "horse-s-cycle-sheet.png")
    ne = (Join-Path $sourceRoot "horse-ne-cycle-sheet.png")
    se = (Join-Path $sourceRoot "horse-se-cycle-sheet.png")
    sw = (Join-Path $sourceRoot "horse-sw-cycle-sheet.png")
    nw = (Join-Path $sourceRoot "horse-nw-cycle-sheet.png")
}

$palette = @(
    [System.Drawing.Color]::FromArgb(255, 31, 22, 13),
    [System.Drawing.Color]::FromArgb(255, 82, 45, 20),
    [System.Drawing.Color]::FromArgb(255, 126, 62, 8),
    [System.Drawing.Color]::FromArgb(255, 194, 98, 8),
    [System.Drawing.Color]::FromArgb(255, 230, 151, 43),
    [System.Drawing.Color]::FromArgb(255, 59, 47, 38)
)
$eyeColor = [System.Drawing.Color]::FromArgb(255, 255, 244, 215)
# These source-authored colors flash for one frame inside otherwise stable body
# pixels. Each correction verifies its original role before replacing it, so a
# future source change fails loudly instead of silently repainting anatomy.
$transientColorCorrections = @{
    "se:0" = @(
        [pscustomobject]@{ Point = [System.Drawing.Point]::new(27, 25); From = 4; To = 3 }
    )
    "se:2" = @(
        [pscustomobject]@{ Point = [System.Drawing.Point]::new(27, 25); From = 4; To = 3 }
    )
    "se:3" = @(
        [pscustomobject]@{ Point = [System.Drawing.Point]::new(25, 25); From = 4; To = 3 },
        [pscustomobject]@{ Point = [System.Drawing.Point]::new(26, 25); From = 4; To = 3 }
    )
    "sw:0" = @(
        [pscustomobject]@{ Point = [System.Drawing.Point]::new(13, 15); From = 4; To = 3 }
    )
    "sw:1" = @(
        [pscustomobject]@{ Point = [System.Drawing.Point]::new(15, 15); From = 5; To = 0 },
        [pscustomobject]@{ Point = [System.Drawing.Point]::new(15, 16); From = 5; To = 0 }
    )
    "sw:3" = @(
        [pscustomobject]@{ Point = [System.Drawing.Point]::new(14, 16); From = 5; To = 1 }
    )
}

function Test-IsBackground([System.Drawing.Color]$color) {
    $isPink =
        $color.R -gt 175 -and
        $color.B -gt 145 -and
        (
            $color.R - $color.G -gt 12 -or
            $color.B - $color.G -gt 12
        )
    return $isPink
}

function Test-IsBoundsBackdrop([System.Drawing.Color]$color) {
    # Bounds detection must reject both the pink chroma key and its pale,
    # antialiased white separators. Horse colors never occupy this range.
    return $color.R -gt 175 -and $color.B -gt 145
}

function Get-NearestPaletteColor([System.Drawing.Color]$color) {
    if ($color.A -lt 80) {
        return [System.Drawing.Color]::Transparent
    }

    $available = [System.Collections.Generic.List[System.Drawing.Color]]::new()
    foreach ($entry in $palette) {
        $available.Add($entry)
    }

    $best = $available[0]
    $bestDistance = [double]::MaxValue
    foreach ($entry in $available) {
        $dr = [double]$color.R - $entry.R
        $dg = [double]$color.G - $entry.G
        $db = [double]$color.B - $entry.B
        $distance = ($dr * $dr) + ($dg * $dg) + ($db * $db)
        if ($distance -lt $bestDistance) {
            $bestDistance = $distance
            $best = $entry
        }
    }
    return $best
}

function Get-EyeCenter(
    [System.Drawing.Bitmap]$sheet,
    [System.Drawing.Rectangle]$cell,
    [System.Drawing.Rectangle]$bound
) {
    $totalX = 0.0
    $totalY = 0.0
    $count = 0
    for ($y = $bound.Top; $y -lt $bound.Bottom; $y += 1) {
        for ($x = $bound.Left; $x -lt $bound.Right; $x += 1) {
            $pixel = $sheet.GetPixel($cell.X + $x, $cell.Y + $y)
            if (
                $pixel.R -gt 235 -and
                $pixel.G -gt 235 -and
                $pixel.B -gt 235
            ) {
                $totalX += $x + 0.5
                $totalY += $y + 0.5
                $count += 1
            }
        }
    }
    if ($count -eq 0) {
        throw "Missing side-profile eye in animation source."
    }
    return [System.Drawing.PointF]::new(
        [float]($totalX / $count),
        [float]($totalY / $count)
    )
}

function Find-NearestOpaquePoint(
    [System.Drawing.Bitmap]$image,
    [System.Drawing.Point]$origin,
    [int]$maximumRadius = 3
) {
    $bestPoint = $null
    $bestDistance = [int]::MaxValue
    for ($offsetY = -$maximumRadius; $offsetY -le $maximumRadius; $offsetY += 1) {
        for ($offsetX = -$maximumRadius; $offsetX -le $maximumRadius; $offsetX += 1) {
            $x = $origin.X + $offsetX
            $y = $origin.Y + $offsetY
            if (
                $x -lt 0 -or
                $x -ge $image.Width -or
                $y -lt 0 -or
                $y -ge $image.Height -or
                $image.GetPixel($x, $y).A -eq 0
            ) {
                continue
            }
            $distance = ($offsetX * $offsetX) + ($offsetY * $offsetY)
            if ($distance -lt $bestDistance) {
                $bestDistance = $distance
                $bestPoint = [System.Drawing.Point]::new($x, $y)
            }
        }
    }
    return $bestPoint
}

foreach ($direction in $sheets.Keys) {
    $sheetPath = $sheets[$direction]
    if (-not (Test-Path -LiteralPath $sheetPath)) {
        throw "Missing generated sheet: $sheetPath"
    }

    $expectedFrames = @(
        (Join-Path $outputRoot "horse-$direction-idle.png"),
        (Join-Path $outputRoot "horse-$direction-walk-0.png"),
        (Join-Path $outputRoot "horse-$direction-walk-1.png"),
        (Join-Path $outputRoot "horse-$direction-walk-2.png"),
        (Join-Path $outputRoot "horse-$direction-walk-3.png")
    )
    if (-not $Force -and ($expectedFrames | Where-Object { -not (Test-Path $_) }).Count -eq 0) {
        continue
    }

    Copy-Item -LiteralPath (Join-Path $horseRoot "horse-$direction.png") `
        -Destination (Join-Path $outputRoot "horse-$direction-idle.png") `
        -Force

    $sheet = [System.Drawing.Bitmap]::FromFile($sheetPath)
    try {
        $halfWidth = [int]($sheet.Width / 2)
        $halfHeight = [int]($sheet.Height / 2)
        $edgeInset = 10
        $gutterInset = 10
        $cellWidth = $halfWidth - $edgeInset - $gutterInset
        $cellHeight = $halfHeight - $edgeInset - $gutterInset
        $cells = @(
            [System.Drawing.Rectangle]::new($edgeInset, $edgeInset, $cellWidth, $cellHeight),
            [System.Drawing.Rectangle]::new($halfWidth + $gutterInset, $edgeInset, $cellWidth, $cellHeight),
            [System.Drawing.Rectangle]::new($edgeInset, $halfHeight + $gutterInset, $cellWidth, $cellHeight),
            [System.Drawing.Rectangle]::new($halfWidth + $gutterInset, $halfHeight + $gutterInset, $cellWidth, $cellHeight)
        )

        $bounds = @()
        foreach ($cell in $cells) {
            $minX = $cell.Width
            $minY = $cell.Height
            $maxX = -1
            $maxY = -1
            for ($y = 0; $y -lt $cell.Height; $y += 4) {
                for ($x = 0; $x -lt $cell.Width; $x += 4) {
                    $pixel = $sheet.GetPixel($cell.X + $x, $cell.Y + $y)
                    if (-not (Test-IsBoundsBackdrop $pixel)) {
                        $minX = [Math]::Min($minX, $x)
                        $minY = [Math]::Min($minY, $y)
                        $maxX = [Math]::Max($maxX, $x)
                        $maxY = [Math]::Max($maxY, $y)
                    }
                }
            }
            if ($maxX -lt 0) {
                throw "No horse pixels found in $direction animation cell."
            }
            if (
                $minX -le 0 -or
                $minY -le 0 -or
                $maxX + 4 -ge $cell.Width -or
                $maxY + 4 -ge $cell.Height
            ) {
                throw (
                    "Horse bounds touch an animation-cell edge for " +
                    "$direction; backdrop detection is contaminated."
                )
            }
            $bounds += [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 4, $maxY + 4)
        }

        $unionLeft = ($bounds | ForEach-Object Left | Measure-Object -Minimum).Minimum
        $unionTop = ($bounds | ForEach-Object Top | Measure-Object -Minimum).Minimum
        $unionRight = ($bounds | ForEach-Object Right | Measure-Object -Maximum).Maximum
        $unionBottom = ($bounds | ForEach-Object Bottom | Measure-Object -Maximum).Maximum
        $sharedBound = [System.Drawing.Rectangle]::FromLTRB(
            $unionLeft,
            $unionTop,
            $unionRight,
            $unionBottom
        )
        $logicalSize = 32
        $usableSize = 28
        $scale = [Math]::Min(
            $usableSize / $sharedBound.Width,
            $usableSize / $sharedBound.Height
        )

        for ($frame = 0; $frame -lt 4; $frame += 1) {
            $cell = $cells[$frame]
            $bound = $sharedBound
            $logical = [System.Drawing.Bitmap]::new(
                $logicalSize,
                $logicalSize,
                [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
            )
            try {
                $graphics = [System.Drawing.Graphics]::FromImage($logical)
                try {
                    $graphics.Clear([System.Drawing.Color]::Transparent)
                    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $drawWidth = [Math]::Max(1, [int][Math]::Round($bound.Width * $scale))
                    $drawHeight = [Math]::Max(1, [int][Math]::Round($bound.Height * $scale))
                    $drawX = [int][Math]::Round(($logicalSize - $drawWidth) / 2)
                    $drawY = [int][Math]::Round(($logicalSize - $drawHeight) / 2)
                    $allowEye = $direction -eq "e" -or $direction -eq "w"
                    $eyeTarget = $null
                    if ($allowEye) {
                        $eyeCenter = Get-EyeCenter $sheet $cell $bound
                        $eyeX = $drawX + [int][Math]::Floor(
                            (($eyeCenter.X - $bound.Left) / $bound.Width) *
                            $drawWidth
                        )
                        $eyeY = $drawY + [int][Math]::Floor(
                            (($eyeCenter.Y - $bound.Top) / $bound.Height) *
                            $drawHeight
                        )
                        $eyeTarget = [System.Drawing.Point]::new(
                            [Math]::Max(
                                0,
                                [Math]::Min($logicalSize - 1, $eyeX)
                            ),
                            [Math]::Max(
                                0,
                                [Math]::Min($logicalSize - 1, $eyeY)
                            )
                        )
                    }
                    $destination = [System.Drawing.Rectangle]::new(
                        $drawX,
                        $drawY,
                        $drawWidth,
                        $drawHeight
                    )
                    $sourceRect = [System.Drawing.Rectangle]::new(
                        $cell.X + $bound.X,
                        $cell.Y + $bound.Y,
                        $bound.Width,
                        $bound.Height
                    )
                    $graphics.DrawImage(
                        $sheet,
                        $destination,
                        $sourceRect,
                        [System.Drawing.GraphicsUnit]::Pixel
                    )
                } finally {
                    $graphics.Dispose()
                }

                for ($y = 0; $y -lt $logicalSize; $y += 1) {
                    for ($x = 0; $x -lt $logicalSize; $x += 1) {
                        $pixel = $logical.GetPixel($x, $y)
                        if (Test-IsBackground $pixel) {
                            $mapped = [System.Drawing.Color]::Transparent
                        } else {
                            $mapped = Get-NearestPaletteColor $pixel
                        }
                        $logical.SetPixel($x, $y, $mapped)
                    }
                }
                if ($eyeTarget) {
                    $eyeTarget = Find-NearestOpaquePoint $logical $eyeTarget
                    if (-not $eyeTarget) {
                        throw (
                            "Could not place the side-profile eye for " +
                            "$direction walk frame $frame."
                        )
                    }
                    $logical.SetPixel($eyeTarget.X, $eyeTarget.Y, $eyeColor)
                }
                $correctionKey = "${direction}:$frame"
                if ($transientColorCorrections.ContainsKey($correctionKey)) {
                    foreach ($correction in $transientColorCorrections[$correctionKey]) {
                        $point = $correction.Point
                        if (
                            $logical.GetPixel($point.X, $point.Y).ToArgb() -ne
                            $palette[$correction.From].ToArgb()
                        ) {
                            throw (
                                "Expected transient color role is missing for " +
                                "$direction walk frame $frame at " +
                                "$($point.X),$($point.Y); review the source before rebuilding."
                            )
                        }
                        $logical.SetPixel(
                            $point.X,
                            $point.Y,
                            $palette[$correction.To]
                        )
                    }
                }

                $final = [System.Drawing.Bitmap]::new(
                    128,
                    128,
                    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
                )
                try {
                    $graphics = [System.Drawing.Graphics]::FromImage($final)
                    try {
                        $graphics.Clear([System.Drawing.Color]::Transparent)
                        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
                        $graphics.DrawImage($logical, 0, 0, 128, 128)
                    } finally {
                        $graphics.Dispose()
                    }
                    $final.Save(
                        (Join-Path $outputRoot "horse-$direction-walk-$frame.png"),
                        [System.Drawing.Imaging.ImageFormat]::Png
                    )
                } finally {
                    $final.Dispose()
                }
            } finally {
                $logical.Dispose()
            }
        }
    } finally {
        $sheet.Dispose()
    }
}

$previewDirections = @("n", "ne", "e", "se", "s", "sw", "w", "nw")
$preview = [System.Drawing.Bitmap]::new(640, 1024)
try {
    $graphics = [System.Drawing.Graphics]::FromImage($preview)
    try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        for ($row = 0; $row -lt $previewDirections.Count; $row += 1) {
            $direction = $previewDirections[$row]
            $names = @(
                "horse-$direction-idle.png",
                "horse-$direction-walk-0.png",
                "horse-$direction-walk-1.png",
                "horse-$direction-walk-2.png",
                "horse-$direction-walk-3.png"
            )
            for ($column = 0; $column -lt $names.Count; $column += 1) {
                $background = if (($row + $column) % 2 -eq 0) {
                    [System.Drawing.Color]::FromArgb(255, 95, 157, 69)
                } else {
                    [System.Drawing.Color]::FromArgb(255, 82, 142, 59)
                }
                $graphics.FillRectangle(
                    [System.Drawing.SolidBrush]::new($background),
                    $column * 128,
                    $row * 128,
                    128,
                    128
                )
                $frameImage = [System.Drawing.Image]::FromFile(
                    (Join-Path $outputRoot $names[$column])
                )
                try {
                    $graphics.DrawImage(
                        $frameImage,
                        $column * 128,
                        $row * 128,
                        128,
                        128
                    )
                } finally {
                    $frameImage.Dispose()
                }
            }
        }
    } finally {
        $graphics.Dispose()
    }
    $preview.Save(
        (Join-Path $horseRoot "animation-preview.png"),
        [System.Drawing.Imaging.ImageFormat]::Png
    )
} finally {
    $preview.Dispose()
}

& (Join-Path $PSScriptRoot "build-palomino-mask.ps1")
& (Join-Path $PSScriptRoot "build-horse-skins.ps1")

Write-Output "Built 40 canonical animation images and 3 horse skin sheets in $outputRoot"
