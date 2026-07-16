# Tiny static file server for local development - no Node or Python needed.
# Run:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Then open  http://localhost:8433/
param(
    [int]$Port = 8433,
    [string]$Root = $PSScriptRoot
)

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
    ".md"   = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Tempo Ladder dev server: http://localhost:$Port/  (Ctrl+C to stop)"

$log = Join-Path $PSScriptRoot "serve.log"
"[$(Get-Date -Format o)] started on port $Port" | Out-File $log -Encoding utf8

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
            if ($path.EndsWith("/")) { $path += "index.html" }
            $file = Join-Path $Root ($path -replace "/", "\").TrimStart("\")
            $full = [IO.Path]::GetFullPath($file)
            $isHead = $ctx.Request.HttpMethod -eq "HEAD"
            if ($full.StartsWith([IO.Path]::GetFullPath($Root)) -and (Test-Path $full -PathType Leaf)) {
                $bytes = [IO.File]::ReadAllBytes($full)
                $ext = [IO.Path]::GetExtension($full).ToLower()
                $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
                $ctx.Response.ContentLength64 = $bytes.Length
                # HEAD (e.g. health checks): headers only — writing a body throws.
                if (-not $isHead) {
                    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                    "[$(Get-Date -Format o)] 200 $path" | Out-File $log -Append -Encoding utf8
                }
            } else {
                $ctx.Response.StatusCode = 404
                if (-not $isHead) {
                    $msg = [Text.Encoding]::UTF8.GetBytes("404 - not found")
                    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
                }
                "[$(Get-Date -Format o)] 404 $path" | Out-File $log -Append -Encoding utf8
            }
            $ctx.Response.Close()
        } catch {
            # One bad request (aborted connection, etc.) must not kill the server.
            "[$(Get-Date -Format o)] request error: $($_.Exception.Message)" | Out-File $log -Append -Encoding utf8
            try { $ctx.Response.Abort() } catch {}
        }
    }
} catch {
    "[$(Get-Date -Format o)] FATAL: $($_.Exception.Message)" | Out-File $log -Append -Encoding utf8
    throw
} finally {
    "[$(Get-Date -Format o)] exiting (listening=$($listener.IsListening))" | Out-File $log -Append -Encoding utf8
    $listener.Stop()
}
