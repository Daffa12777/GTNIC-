# Menjalankan ML, backend, dan frontend di tiga jendela PowerShell (Windows).
# Pemakaian dari folder root proyek:  .\scripts\dev.ps1
$root = Split-Path -Parent $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\ml'; python -m uvicorn app:app --port 8100"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\backend'; npm run start:dev"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\frontend'; npm run dev"
Write-Host "UI: http://localhost:5173  API: http://localhost:8000/api/health  ML: http://localhost:8100/health"
