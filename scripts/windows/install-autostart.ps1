<#
.SYNOPSIS
  Registers a Scheduled Task that starts the kiosk automatically when the kiosk
  user signs in (vision service + kiosk app + full-screen browser).
  Run from an elevated PowerShell on the kiosk PC.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
  powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Browser chrome -KioskUrl http://shop-server:3000 -SkipKioskApp
#>
param(
  [string]$TaskName = 'GestureCoffeeKiosk',
  [string]$KioskUrl = 'http://localhost:3000',
  [ValidateSet('edge', 'chrome')] [string]$Browser = 'edge',
  [switch]$SkipKioskApp
)

$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'start-kiosk.ps1'
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -KioskUrl $KioskUrl -Browser $Browser"
if ($SkipKioskApp) { $taskArgs += ' -SkipKioskApp' }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Scheduled task '$TaskName' registered. The kiosk will start at the next sign-in of $env:USERNAME."
Write-Host "Start it now with:  Start-ScheduledTask -TaskName $TaskName"
