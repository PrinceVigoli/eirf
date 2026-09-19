param([string]$DailyAt = "02:00")
$ErrorActionPreference = "Stop"
$workspacePath = Split-Path -Parent $PSScriptRoot
$backupScript = Join-Path $workspacePath "scripts\backup.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun
Register-ScheduledTask -TaskName "eIRF Local Backup" -Action $action -Trigger $trigger -Settings $settings -Description "Daily local e-IRF PostgreSQL and evidence backup" -Force
Write-Host "Daily e-IRF backup scheduled for $DailyAt."
