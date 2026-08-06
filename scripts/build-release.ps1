param(
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "dist"
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = $releaseRoot
}

$releaseRootPath = [System.IO.Path]::GetFullPath($releaseRoot)
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$releasePrefix =
  $releaseRootPath.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar

$isReleaseOutput =
  $outputPath.Equals(
    $releaseRootPath,
    [System.StringComparison]::OrdinalIgnoreCase
  ) -or
  $outputPath.StartsWith(
    $releasePrefix,
    [System.StringComparison]::OrdinalIgnoreCase
  )
if (-not $isReleaseOutput) {
  throw "Release output must be dist/ or one of its child directories."
}

function Assert-NoReparsePointInReleasePath([string]$CandidatePath) {
  $currentPath = $CandidatePath
  while ($true) {
    if (Test-Path -LiteralPath $currentPath) {
      $item = Get-Item -Force -LiteralPath $currentPath
      if (
        $item.Attributes -band
        [System.IO.FileAttributes]::ReparsePoint
      ) {
        throw "Refusing to use a release path containing a reparse point."
      }
    }

    if ($currentPath.Equals(
      $releaseRootPath,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
      break
    }

    $parentPath = [System.IO.Path]::GetDirectoryName($currentPath)
    if (
      [string]::IsNullOrWhiteSpace($parentPath) -or
      $parentPath.Equals(
        $currentPath,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      throw "Could not validate the release output path."
    }
    $currentPath = $parentPath
  }
}

Assert-NoReparsePointInReleasePath $outputPath

if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Recurse -Force
}

$sourceOutput = Join-Path $outputPath "src"
$vendorOutput = Join-Path $outputPath "vendor"
$animationOutput = Join-Path $outputPath "public\assets\horse\animation"
New-Item -ItemType Directory -Force -Path @(
  $sourceOutput,
  $vendorOutput,
  $animationOutput
) | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "index.html") `
  -Destination $outputPath
Copy-Item -LiteralPath (Join-Path $projectRoot "src\game.js") `
  -Destination $sourceOutput
Copy-Item -LiteralPath (Join-Path $projectRoot "src\styles.css") `
  -Destination $sourceOutput
Copy-Item -LiteralPath (Join-Path $projectRoot "vendor\phaser.min.js") `
  -Destination $vendorOutput

$skinIds = @("chestnut", "palomino", "midnight")
$runtimeSheets = @(
  $skinIds | ForEach-Object { "horse-$_-sheet.png" }
)
if ($runtimeSheets.Count -ne 3) {
  throw "Expected exactly 3 runtime horse skin sheets."
}

foreach ($sheetName in $runtimeSheets) {
  $sheetPath = Join-Path (
    Join-Path $projectRoot "public\assets\horse\animation"
  ) $sheetName
  if (-not (Test-Path -LiteralPath $sheetPath -PathType Leaf)) {
    throw "Missing runtime horse skin sheet: $sheetPath"
  }
  Copy-Item -LiteralPath $sheetPath -Destination $animationOutput
}

$releaseBytes = (
  Get-ChildItem -Recurse -File -LiteralPath $outputPath |
    Measure-Object -Property Length -Sum
).Sum
Write-Output "Release built at $outputPath ($releaseBytes bytes)."
