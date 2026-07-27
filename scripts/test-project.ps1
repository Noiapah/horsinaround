param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$animationRoot = Join-Path $projectRoot "public\assets\horse\animation"
$sourceRoot = Join-Path $projectRoot "public\assets\horse\source"

& (Join-Path $projectRoot "server.ps1") -SelfTest

Add-Type -AssemblyName System.Drawing

$directions = @("n", "ne", "e", "se", "s", "sw", "w", "nw")
$runtimeFrames = @()
foreach ($direction in $directions) {
  $runtimeFrames += Join-Path $animationRoot "horse-$direction-idle.png"
  for ($frame = 0; $frame -lt 4; $frame += 1) {
    $runtimeFrames += (
      Join-Path $animationRoot "horse-$direction-walk-$frame.png"
    )
  }

  $sourceSheet = Join-Path $sourceRoot "horse-$direction-cycle-sheet.png"
  if (-not (Test-Path -LiteralPath $sourceSheet -PathType Leaf)) {
    throw "Missing checked-in animation source: $sourceSheet"
  }
}

if ($runtimeFrames.Count -ne 40) {
  throw "Expected 40 runtime animation frames, found $($runtimeFrames.Count)."
}

foreach ($framePath in $runtimeFrames) {
  if (-not (Test-Path -LiteralPath $framePath -PathType Leaf)) {
    throw "Missing runtime animation frame: $framePath"
  }

  $image = [System.Drawing.Image]::FromFile($framePath)
  try {
    if ($image.Width -ne 128 -or $image.Height -ne 128) {
      throw "Animation frame must be 128x128: $framePath"
    }
  } finally {
    $image.Dispose()
  }
}

$animationBuilder = Get-Content `
  (Join-Path $PSScriptRoot "build-animation-assets.ps1") -Raw
if ($animationBuilder -match "\\.codex\\generated_images") {
  throw "Animation builder still depends on a user-specific generated path."
}

$phaserSource = Get-Content `
  (Join-Path $projectRoot "vendor\phaser.min.js") -Raw
if ($phaserSource -notmatch "3\.90\.0") {
  throw "Unexpected Phaser runtime version."
}

Write-Output "Project checks passed: server paths, 40 runtime frames, sources, and Phaser runtime."
