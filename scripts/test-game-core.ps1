param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $projectRoot "server.ps1"
$browserCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
$browserPath = $browserCandidates |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1
if (-not $browserPath) {
  throw "Game core tests require Chrome or Edge."
}

$reservation = [System.Net.Sockets.TcpListener]::new(
  [System.Net.IPAddress]::Loopback,
  0
)
$reservation.Start()
$port = ([System.Net.IPEndPoint]$reservation.LocalEndpoint).Port
$reservation.Stop()

$profilePath = Join-Path (
  [System.IO.Path]::GetTempPath()
) "horsin-around-browser-test-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $profilePath | Out-Null

function Invoke-HeadlessBrowser([string]$Url) {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $browserOutput = & $browserPath `
      "--headless=new" `
      "--disable-gpu" `
      "--virtual-time-budget=5000" `
      "--user-data-dir=$profilePath" `
      "--dump-dom" `
      $Url 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = $browserOutput
  }
}

$server = $null
try {
  $serverOutputPath = Join-Path $profilePath "server-output.txt"
  $serverErrorPath = Join-Path $profilePath "server-error.txt"
  $serverArguments =
    "-NoProfile -ExecutionPolicy Bypass -File `"$serverPath`" -Port $port"
  $server = Start-Process powershell.exe -WindowStyle Hidden -PassThru `
    -ArgumentList $serverArguments `
    -RedirectStandardOutput $serverOutputPath `
    -RedirectStandardError $serverErrorPath

  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if ($server.HasExited) {
      throw "The browser-test server exited with code $($server.ExitCode)."
    }
    $probe = $null
    try {
      $probe = [System.Net.Sockets.TcpClient]::new()
      $probe.ReceiveTimeout = 1000
      $probe.SendTimeout = 1000
      $probe.Connect([System.Net.IPAddress]::Loopback, $port)
      $probeStream = $probe.GetStream()
      $requestBytes = [System.Text.Encoding]::ASCII.GetBytes(
        "GET / HTTP/1.1`r`nHost: localhost`r`nConnection: close`r`n`r`n"
      )
      $probeStream.Write($requestBytes, 0, $requestBytes.Length)
      $responseBuffer = [byte[]]::new(64)
      $responseLength = $probeStream.Read(
        $responseBuffer,
        0,
        $responseBuffer.Length
      )
      $responseStart = [System.Text.Encoding]::ASCII.GetString(
        $responseBuffer,
        0,
        $responseLength
      )
      if ($responseStart -notmatch "HTTP/1\.1 200") {
        throw "Unexpected readiness response."
      }
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 100
    } finally {
      if ($null -ne $probe) {
        $probe.Dispose()
      }
    }
  }
  if (-not $ready) {
    $serverOutput = Get-Content $serverOutputPath -Raw -ErrorAction SilentlyContinue
    $serverError = Get-Content $serverErrorPath -Raw -ErrorAction SilentlyContinue
    throw "The browser-test server did not start.`n$serverOutput`n$serverError"
  }

  $coreTest = Invoke-HeadlessBrowser `
    "http://localhost:$port/tests/game-core.test.html"
  if (
    $coreTest.ExitCode -ne 0 -or
    $coreTest.Output -notmatch 'data-status="passed"'
  ) {
    throw "Game core browser tests failed.`n$($coreTest.Output)"
  }
  $result = [regex]::Match(
    $coreTest.Output,
    "\d+ game core tests passed\."
  ).Value
  Write-Output $result

  $gameSmokeTest = Invoke-HeadlessBrowser "http://localhost:$port/"
  if (
    $gameSmokeTest.ExitCode -ne 0 -or
    $gameSmokeTest.Output -notmatch "<canvas"
  ) {
    throw "Game startup smoke test failed.`n$($gameSmokeTest.Output)"
  }
  Write-Output "Game startup smoke test passed."
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
    $server.WaitForExit(5000) | Out-Null
  }
  if (Test-Path -LiteralPath $profilePath) {
    try {
      Remove-Item -LiteralPath $profilePath -Recurse -Force
    } catch {
      Write-Warning "Could not remove browser-test files at $profilePath"
    }
  }
}
