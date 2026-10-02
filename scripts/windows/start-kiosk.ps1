<#
.SYNOPSIS
  Starts the touchless ordering kiosk on a Windows PC:
    1. the local vision service (webcam -> gesture events)
    2. the kiosk web app (optional: skip if the kiosk is served by another machine)
    3. the browser in full-screen kiosk mode
  Services are restarted automatically if they crash.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\start-kiosk.ps1
  powershell -ExecutionPolicy Bypass -File scripts\windows\start-kiosk.ps1 -KioskUrl http://shop-server:3000 -SkipKioskApp
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$KioskUrl = 'http://localhost:3000',
  [ValidateSet('edge', 'chrome')] [string]$Browser = 'edge',
  [switch]$SkipKioskApp,
  [switch]$SkipVision
)

$ErrorActionPreference = 'Stop'
$LogDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null

function Write-Log([string]$Message) {
  $line = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $Message
  Add-Content -Path (Join-Path $LogDir 'kiosk-launcher.log') -Value $line
  Write-Host $line
}

function Wait-Http([string]$Url, [int]$TimeoutSeconds = 120) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      return $true
    } catch { Start-Sleep -Seconds 2 }
  }
  return $false
}

function Start-Hidden([string]$Name, [string]$File, [string[]]$Arguments, [string]$WorkingDirectory) {
  Write-Log "Starting $Name"
  return Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $LogDir "$Name.out.log") `
    -RedirectStandardError (Join-Path $LogDir "$Name.err.log")
}

# ---------- 1. Vision service (runs locally: it needs the webcam) ----------
$visionDir = Join-Path $RepoRoot 'services\vision'
$python = Join-Path $visionDir '.venv\Scripts\python.exe'
$vision = $null
if (-not $SkipVision) {
  if (-not (Test-Path $python)) {
    Write-Log 'Vision venv missing - running setup (one time)'
    & node (Join-Path $RepoRoot 'scripts\run-vision.mjs') setup
  }
  $vision = Start-Hidden 'vision' $python @('-m', 'app') $visionDir
  if (-not (Wait-Http 'http://127.0.0.1:8765/health' 90)) { Write-Log 'WARNING: vision service did not become healthy (kiosk will show the camera screen)' }
}

# ---------- 2. Kiosk web app (production build) ----------
$kiosk = $null
if (-not $SkipKioskApp) {
  $standalone = Join-Path $RepoRoot 'apps\kiosk\.next\standalone\apps\kiosk\server.js'
  if (Test-Path $standalone) {
    $env:PORT = '3000'; $env:HOSTNAME = '127.0.0.1'
    $kiosk = Start-Hidden 'kiosk' 'node' @($standalone) $RepoRoot
  } else {
    Write-Log 'No production build found - run: npm run build   (falling back to dev server)'
    $kiosk = Start-Hidden 'kiosk' 'npm.cmd' @('run', 'dev', '-w', 'kiosk') $RepoRoot
  }
  if (-not (Wait-Http $KioskUrl 180)) { Write-Log "ERROR: kiosk app not reachable at $KioskUrl" }
}

# ---------- 3. Browser in kiosk mode ----------
$flags = @(
  '--kiosk', $KioskUrl,
  '--no-first-run', '--noerrdialogs', '--disable-translate', '--disable-features=Translate',
  '--autoplay-policy=no-user-gesture-required',   # feedback sounds without a click
  '--disable-pinch', '--overscroll-history-navigation=0',
  '--disable-session-crashed-bubble', '--hide-crash-restore-bubble'
)
if ($Browser -eq 'edge') {
  $exe = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  $flags += '--edge-kiosk-type=fullscreen'
} else {
  $exe = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $exe) { throw "$Browser not found" }
Write-Log "Launching $Browser in kiosk mode -> $KioskUrl"
$browserProc = Start-Process -FilePath $exe -ArgumentList $flags -PassThru

# ---------- Watchdog: restart anything that exits ----------
while ($true) {
  Start-Sleep -Seconds 10
  if ($vision -and $vision.HasExited) { Write-Log 'Vision service exited - restarting'; $vision = Start-Hidden 'vision' $python @('-m', 'app') $visionDir }
  if ($kiosk -and $kiosk.HasExited) {
    Write-Log 'Kiosk app exited - restarting'
    $kiosk = if (Test-Path $standalone) { Start-Hidden 'kiosk' 'node' @($standalone) $RepoRoot } else { Start-Hidden 'kiosk' 'npm.cmd' @('run', 'dev', '-w', 'kiosk') $RepoRoot }
  }
  if ($browserProc.HasExited) { Write-Log 'Browser closed - relaunching'; $browserProc = Start-Process -FilePath $exe -ArgumentList $flags -PassThru }
}
