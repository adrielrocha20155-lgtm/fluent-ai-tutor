$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$env:DEV_MODE = "true"
if (-not ($env:Path -split ";" | Where-Object { $_ -eq "C:\Program Files\nodejs" })) {
    if (Test-Path "C:\Program Files\nodejs") {
        $env:Path = "C:\Program Files\nodejs;$env:Path"
    }
}

Write-Host "Starting Backend (Uvicorn) on port 8000..."
$backend = Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload" -PassThru -NoNewWindow

try {
    Write-Host "Starting Frontend (Vite) on port 5173..."
    npm run dev
}
finally {
    if ($backend -and -not $backend.HasExited) {
        Write-Host "Stopping Backend..."
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    }
}
