param(
  [int]$Port = 8080,
  [switch]$SelfTest
)

$root = (Resolve-Path $PSScriptRoot).Path
$indexPath = Join-Path $root "index.html"
$allowedDirectories = @(
  (Join-Path $root "src"),
  (Join-Path $root "vendor"),
  (Join-Path $root "public\assets\horse\animation")
)
$allowedExtensions = @(".html", ".js", ".css", ".png", ".json")

function Test-IsWithinDirectory(
  [string]$CandidatePath,
  [string]$DirectoryPath
) {
  $candidate = [System.IO.Path]::GetFullPath($CandidatePath)
  $directory = [System.IO.Path]::GetFullPath($DirectoryPath)
  $directoryPrefix =
    $directory.TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    ) + [System.IO.Path]::DirectorySeparatorChar

  return $candidate.Equals(
    $directory,
    [System.StringComparison]::OrdinalIgnoreCase
  ) -or $candidate.StartsWith(
    $directoryPrefix,
    [System.StringComparison]::OrdinalIgnoreCase
  )
}

function Test-IsAllowedFile([string]$CandidatePath) {
  $candidate = [System.IO.Path]::GetFullPath($CandidatePath)
  if ($candidate.Equals(
    $indexPath,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    return $true
  }

  $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
  if ($extension -notin $allowedExtensions) {
    return $false
  }

  foreach ($directory in $allowedDirectories) {
    if (Test-IsWithinDirectory $candidate $directory) {
      return $true
    }
  }
  return $false
}

function Resolve-RequestPath([string]$RequestTarget) {
  $requestUri = [Uri]("http://localhost$RequestTarget")
  $requestPath = $requestUri.AbsolutePath
  $relativePath = [Uri]::UnescapeDataString(
    $requestPath.TrimStart("/")
  )
  if ([string]::IsNullOrWhiteSpace($relativePath)) {
    $relativePath = "index.html"
  }
  return [System.IO.Path]::GetFullPath(
    (Join-Path $root $relativePath)
  )
}

if ($SelfTest) {
  $runtimeFrame = Join-Path $root "public\assets\horse\animation\horse-n-idle.png"
  $outsidePath = [System.IO.Path]::GetFullPath(
    (Join-Path $root "..\horsin-around-game-secret\probe.txt")
  )
  $encodedTraversal = Resolve-RequestPath(
    "/%2e%2e/horsin-around-game-secret/probe.txt"
  )
  $checks = @(
    (Test-IsAllowedFile $indexPath),
    (Test-IsAllowedFile $runtimeFrame),
    (-not (Test-IsAllowedFile (Join-Path $root "server.ps1"))),
    (-not (Test-IsAllowedFile (Join-Path $root ".git\config"))),
    (-not (Test-IsAllowedFile $outsidePath)),
    (-not (Test-IsAllowedFile $encodedTraversal))
  )
  if ($checks -contains $false) {
    throw "Static server path self-test failed."
  }
  Write-Output "Static server path self-test passed."
  return
}

$listener = [System.Net.Sockets.TcpListener]::new(
  [System.Net.IPAddress]::Loopback,
  $Port
)
$listener.Start()

Write-Host "Horsin' Around is running at http://localhost:$Port"
Write-Host "Press Ctrl+C to stop."

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".png"  = "image/png"
  ".json" = "application/json; charset=utf-8"
}

try {
  while ($true) {
    # Poll before accepting so PowerShell can process Ctrl+C while idle.
    while (-not $listener.Pending()) {
      Start-Sleep -Milliseconds 100
    }

    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $buffer = [byte[]]::new(8192)
      $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
      $request = [System.Text.Encoding]::ASCII.GetString(
        $buffer,
        0,
        $bytesRead
      )
      $requestLine = ($request -split "\r?\n")[0]
      $requestParts = @($requestLine -split "\s+")
      $method = if ($requestParts.Count -gt 0) {
        $requestParts[0].ToUpperInvariant()
      } else {
        ""
      }

      $status = "400 Bad Request"
      $contentType = "text/plain; charset=utf-8"
      $body = [System.Text.Encoding]::UTF8.GetBytes("400 Bad Request")

      if ($requestParts.Count -ge 2 -and $method -in @("GET", "HEAD")) {
        try {
          $requestedPath = Resolve-RequestPath $requestParts[1]
          if (-not (Test-IsAllowedFile $requestedPath)) {
            $status = "403 Forbidden"
            $body = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
          } elseif (
            -not (
              Test-Path -LiteralPath $requestedPath -PathType Leaf
            )
          ) {
            $status = "404 Not Found"
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
          } else {
            $status = "200 OK"
            $extension = [System.IO.Path]::GetExtension(
              $requestedPath
            ).ToLowerInvariant()
            $contentType = $mimeTypes[$extension]
            if (-not $contentType) {
              $contentType = "application/octet-stream"
            }
            $body = [System.IO.File]::ReadAllBytes($requestedPath)
          }
        } catch {
          $status = "400 Bad Request"
          $body = [System.Text.Encoding]::UTF8.GetBytes(
            "400 Bad Request"
          )
        }
      } elseif ($requestParts.Count -ge 2) {
        $status = "405 Method Not Allowed"
        $body = [System.Text.Encoding]::UTF8.GetBytes(
          "405 Method Not Allowed"
        )
      }

      $header = (
        "HTTP/1.1 $status`r`n" +
        "Content-Type: $contentType`r`n" +
        "Content-Length: $($body.Length)`r`n" +
        "Cache-Control: no-cache`r`n" +
        "X-Content-Type-Options: nosniff`r`n" +
        "Allow: GET, HEAD`r`n" +
        "Connection: close`r`n`r`n"
      )
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      if ($method -ne "HEAD") {
        $stream.Write($body, 0, $body.Length)
      }
      $stream.Flush()
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
