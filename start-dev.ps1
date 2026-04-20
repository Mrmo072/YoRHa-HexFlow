$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logsDir = Join-Path $root '.runtime\logs'

if (!(Test-Path $logsDir)) {
    New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
}

function Test-Dependency {
    param(
        [string]$ModuleName
    )

    & python -c "import $ModuleName" *> $null
    return $LASTEXITCODE -eq 0
}

function Get-FreePort {
    param(
        [int]$PreferredPort
    )

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $PreferredPort)
    try {
        $listener.Start()
        return $PreferredPort
    } catch {
        $fallback = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
        $fallback.Start()
        $port = $fallback.LocalEndpoint.Port
        $fallback.Stop()
        return $port
    } finally {
        try {
            $listener.Stop()
        } catch {
        }
    }
}

function Test-PortInUse {
    param(
        [int]$Port
    )

    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $asyncResult = $client.BeginConnect([System.Net.IPAddress]::Loopback, $Port, $null, $null)
        $connected = $asyncResult.AsyncWaitHandle.WaitOne(300)
        if ($connected -and $client.Connected) {
            $client.EndConnect($asyncResult)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        if ($client) {
            $client.Close()
        }
    }
}

if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python 3.12+ was not found on PATH.'
}

if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'npm was not found on PATH. Please install Node.js.'
}

$requiredModules = @('fastapi', 'uvicorn', 'sqlalchemy', 'pymysql', 'networkx')
$missingModules = @($requiredModules | Where-Object { !(Test-Dependency $_) })
if ($missingModules.Count -gt 0) {
    Write-Host "Installing backend dependencies: $($missingModules -join ', ')" -ForegroundColor Yellow
    & python -m pip install -r (Join-Path $root 'backend\requirements.txt')
}

$frontendNodeModules = Join-Path $root 'frontend\node_modules'
if (!(Test-Path $frontendNodeModules)) {
    Write-Host 'Installing frontend dependencies...' -ForegroundColor Yellow
    Push-Location (Join-Path $root 'frontend')
    try {
        & npm.cmd install
    } finally {
        Pop-Location
    }
}

$frontendPort = Get-FreePort -PreferredPort 5173
$backendLog = Join-Path $logsDir 'backend.log'
$frontendLog = Join-Path $logsDir 'frontend.log'

Write-Host 'Starting backend...' -ForegroundColor Cyan
if (Test-PortInUse -Port 8000) {
    Write-Host 'Backend already running on port 8000. Reusing it.' -ForegroundColor Yellow
} else {
    Start-Process -FilePath 'C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe' `
        -WorkingDirectory $root `
        -ArgumentList @(
            '-NoExit',
            '-Command',
            "`$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(`$false); " +
            "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new(`$false); " +
            "Set-Location '$root'; " +
            "Write-Host 'YoRHa Backend: http://127.0.0.1:8000' -ForegroundColor Green; " +
            "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload *>> '$backendLog'"
        )
}

Write-Host 'Starting frontend...' -ForegroundColor Cyan
Start-Process -FilePath 'C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe' `
    -WorkingDirectory (Join-Path $root 'frontend') `
    -ArgumentList @(
        '-NoExit',
        '-Command',
        "`$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(`$false); " +
        "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new(`$false); " +
        "Set-Location '" + (Join-Path $root 'frontend') + "'; " +
        "Write-Host 'YoRHa Frontend: http://127.0.0.1:$frontendPort' -ForegroundColor Green; " +
        "npm.cmd run dev -- --host 127.0.0.1 --port $frontendPort *>> '$frontendLog'"
    )

Write-Host ''
Write-Host "Backend: http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:$frontendPort" -ForegroundColor Green
Write-Host "Logs: $logsDir" -ForegroundColor DarkGray
