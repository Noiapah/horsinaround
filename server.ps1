param(
  [int]$Port = 8080
)

$root = (Resolve-Path $PSScriptRoot).Path
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
      $request = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $bytesRead)
      $requestLine = ($request -split "\r?\n")[0]
      $requestTarget = ($requestLine -split " ")[1]
      $requestPath = ([Uri]("http://localhost$requestTarget")).AbsolutePath
      $relativePath = [Uri]::UnescapeDataString($requestPath.TrimStart("/"))

      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = "index.html"
      }

      $requestedPath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
      $isAllowed = $requestedPath.StartsWith(
        $root,
        [System.StringComparison]::OrdinalIgnoreCase
      )

      if (-not $isAllowed -or -not (Test-Path -LiteralPath $requestedPath -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      }
      else {
        $extension = [System.IO.Path]::GetExtension($requestedPath).ToLowerInvariant()
        $contentType = $mimeTypes[$extension]
        if (-not $contentType) {
          $contentType = "application/octet-stream"
        }

        $body = [System.IO.File]::ReadAllBytes($requestedPath)
        $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      }

      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
    }
    finally {
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
