param(
    [switch]$Force
)

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

function Test-IsBackground([System.Drawing.Color]$color) {
    $isMagenta = $color.R -gt 175 -and $color.B -gt 145 -and $color.G -lt 125
    $isWhite = $color.R -gt 235 -and $color.G -gt 235 -and $color.B -gt 235
    return $isMagenta -or $isWhite
}

function Get-NearestPaletteColor(
    [System.Drawing.Color]$color,
    [bool]$allowEye
) {
    if ($color.A -lt 80) {
        return [System.Drawing.Color]::Transparent
    }

    $available = [System.Collections.Generic.List[System.Drawing.Color]]::new()
    foreach ($entry in $palette) {
        $available.Add($entry)
    }
    if ($allowEye) {
        $available.Add($eyeColor)
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
                    if (-not (Test-IsBackground $pixel)) {
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

                $allowEye = $direction -eq "e" -or $direction -eq "w"
                for ($y = 0; $y -lt $logicalSize; $y += 1) {
                    for ($x = 0; $x -lt $logicalSize; $x += 1) {
                        $pixel = $logical.GetPixel($x, $y)
                        if (Test-IsBackground $pixel) {
                            $mapped = [System.Drawing.Color]::Transparent
                        } else {
                            $mapped = Get-NearestPaletteColor $pixel $allowEye
                        }
                        $logical.SetPixel($x, $y, $mapped)
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

Write-Output "Built 40 animation images in $outputRoot"
