# ============================================================
#  serve.ps1 - Local static server for the exam platform
#
#  Usage:
#     powershell -ExecutionPolicy Bypass -File serve.ps1
#     powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8090
#
#  Then open:  http://localhost:8080
#  (Serving over http:// keeps quiz results and the wrong-answer
#   bank saved permanently in the browser localStorage.)
# ============================================================
param(
    [int]$Port = 8080,
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$listener = $null
$usedPort = $Port
for ($p = $Port; $p -lt ($Port + 20); $p++) {
    $l = $null
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add("http://localhost:$p/")
        $l.Start()
        $listener = $l
        $usedPort = $p
        break
    } catch {
        if ($l) { try { $l.Close() } catch { } }
    }
}
if (-not $listener) {
    Write-Host ("Could not start the server on ports {0}-{1}." -f $Port, ($Port + 19)) -ForegroundColor Red
    exit 1
}

$mime = @{
    '.html'  = 'text/html; charset=utf-8'
    '.htm'   = 'text/html; charset=utf-8'
    '.css'   = 'text/css; charset=utf-8'
    '.js'    = 'application/javascript; charset=utf-8'
    '.mjs'   = 'application/javascript; charset=utf-8'
    '.json'  = 'application/json; charset=utf-8'
    '.svg'   = 'image/svg+xml'
    '.png'   = 'image/png'
    '.jpg'   = 'image/jpeg'
    '.jpeg'  = 'image/jpeg'
    '.gif'   = 'image/gif'
    '.ico'   = 'image/x-icon'
    '.woff'  = 'font/woff'
    '.woff2' = 'font/woff2'
    '.ttf'   = 'font/ttf'
    '.txt'   = 'text/plain; charset=utf-8'
    '.md'    = 'text/markdown; charset=utf-8'
    '.csv'   = 'text/csv; charset=utf-8'
}

Write-Host ""
Write-Host "  Exam platform - local server" -ForegroundColor Green
Write-Host ("  Root : {0}" -f $Root)
Write-Host ("  Open : http://localhost:{0}/" -f $usedPort) -ForegroundColor Cyan
Write-Host "  Stop : press Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

try { Start-Process ("http://localhost:{0}/" -f $usedPort) | Out-Null } catch { }

$rootPath = [System.IO.Path]::GetFullPath($Root)

while ($listener.IsListening) {
    $context = $null
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rel = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
        $rel = $rel -replace '/', [System.IO.Path]::DirectorySeparatorChar

        $fullPath = [System.IO.Path]::GetFullPath((Join-Path $rootPath $rel))

        if (-not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }

        if (Test-Path -LiteralPath $fullPath -PathType Container) {
            $fullPath = Join-Path $fullPath 'index.html'
        }

        if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentType = $type
            $response.ContentLength64 = $bytes.Length
            $response.Headers.Add('Cache-Control', 'no-cache')
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host ("200  {0}" -f $rel) -ForegroundColor DarkGray
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes('404 - Not found')
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host ("404  {0}" -f $rel) -ForegroundColor Yellow
        }
        $response.Close()
    } catch {
        if ($context) { try { $context.Response.StatusCode = 500; $context.Response.Close() } catch { } }
    }
}
