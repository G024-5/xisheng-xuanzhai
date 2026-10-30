# 等本地服务端口就绪后再打开浏览器。
# 由 start.bat 以分离进程启动，避免"网页开得比服务早"导致 ERR_CONNECTION_REFUSED。
$ErrorActionPreference = 'SilentlyContinue'
$port = 5178
$url = "http://127.0.0.1:$port/"

function Test-Port {
  param([int]$p)
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect('127.0.0.1', $p, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne(400)) { $client.Close(); return $false }
    $client.EndConnect($iar)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

for ($i = 0; $i -lt 60; $i++) {
  if (Test-Port $port) {
    Start-Sleep -Milliseconds 250
    Start-Process $url
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

# 30 秒还没起来
Write-Host ''
if (Test-Port $port) {
  Write-Host '  端口 5178 已被占用，但没有响应 HTTP 请求。' -ForegroundColor Yellow
  Write-Host '  可能是一个没退干净的旧实例，或别的程序占用了端口。' -ForegroundColor Yellow
} else {
  Write-Host '  服务 30 秒内没有启动成功，请看主窗口里的报错。' -ForegroundColor Yellow
}
Write-Host ''
