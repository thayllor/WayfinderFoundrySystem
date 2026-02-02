# build-css.ps1
# Download Dart Sass (Windows x64) if missing and compile SCSS -> CSS.
# Usage:
#   .\build-css.ps1           # compile once
#   .\build-css.ps1 -Watch   # compile and watch for changes

param(
  [switch]$Watch
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsRoot = Join-Path $root 'tools'
$sassRoot = Join-Path $toolsRoot 'dart-sass'
$zipPath = Join-Path $toolsRoot 'dart-sass.zip'
$downloadUrl = 'https://github.com/sass/dart-sass/releases/latest/download/dart-sass-windows-x64.zip'

$entryRoot = Join-Path $root 'css'
$outRoot = $entryRoot

function Get-SassRunner {
  $cmd = Get-Command sass -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Path }
  if (Test-Path $sassRoot) {
    $runner = Get-ChildItem $sassRoot -Recurse -File -Filter 'sass.bat' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $runner) { $runner = Get-ChildItem $sassRoot -Recurse -File -Filter 'sass.exe' -ErrorAction SilentlyContinue | Select-Object -First 1 }
    if ($runner) { return $runner.FullName }
  }
  return $null
}

$sassRunner = Get-SassRunner
if (-not $sassRunner) {
  Write-Host "No 'sass' found on PATH. Attempting to download Dart Sass to tools folder..."
  if (-not (Test-Path $toolsRoot)) { New-Item -ItemType Directory -Path $toolsRoot | Out-Null }
  try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing -ErrorAction Stop
    Expand-Archive -Path $zipPath -DestinationPath $toolsRoot -Force
    $extracted = Get-ChildItem $toolsRoot -Directory | Where-Object { $_.Name -like 'dart-sass*' } | Select-Object -First 1
    if ($extracted) {
      if (Test-Path $sassRoot) { Remove-Item -Recurse -Force $sassRoot }
      Move-Item -Path $extracted.FullName -Destination $sassRoot
    }
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    $sassRunner = Get-SassRunner
  } catch {
    Write-Host "Download failed: $($_.Exception.Message)"
    Write-Host "Please install Dart Sass (https://sass-lang.com/dart-sass) or ensure 'sass' is on PATH."
    exit 1
  }
}

if ($Watch) {
  Write-Host "Starting sass watch: $entryRoot -> $outRoot"
  & $sassRunner '--watch', "$entryRoot:$outRoot", '--no-source-map'
} else {
  Write-Host "Compiling SCSS: $entryRoot -> $outRoot"
  & $sassRunner $entryRoot $outRoot '--no-source-map'
  if ($LASTEXITCODE -ne 0) { Write-Error 'sass exited with error' ; Exit $LASTEXITCODE }
  Write-Host "Compiled SCSS files under: $entryRoot"
}
# build-css.ps1
# Download Dart Sass (Windows x64) if missing and compile SCSS → CSS.
# Usage:
#   .\build-css.ps1           # compile once
#   .\build-css.ps1 -Watch   # compile and watch for changes

param(
  [switch]$Watch
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsRoot = Join-Path $root 'tools'
$sassRoot = Join-Path $toolsRoot 'dart-sass'
$zipPath = Join-Path $toolsRoot 'dart-sass.zip'
$downloadUrl = 'https://github.com/sass/dart-sass/releases/latest/download/dart-sass-windows-x64.zip'

if (-not (Test-Path $sassRoot)) {
  Write-Host "dart-sass not found — downloading..."
  if (-not (Test-Path $toolsRoot)) { New-Item -ItemType Directory -Path $toolsRoot | Out-Null }
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
  Try {
    Expand-Archive -Path $zipPath -DestinationPath $toolsRoot -Force
  } Catch {
    Write-Error "failed to extract $zipPath: $_"
    Exit 1
  }
  # Move extracted folder (dart-sass or dart-sass-*) to standardized folder name
  $extracted = Get-ChildItem $toolsRoot -Directory | Where-Object { $_.Name -like 'dart-sass*' } | Select-Object -First 1
  if ($extracted) {
    if (Test-Path $sassRoot) { Remove-Item -Recurse -Force $sassRoot }
    Move-Item -Path $extracted.FullName -Destination $sassRoot
  }
  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
}

# Find the sass runner (sass.bat or sass.exe)
$sassRunner = Get-ChildItem $sassRoot -Recurse -File -Filter 'sass.bat' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sassRunner) { $sassRunner = Get-ChildItem $sassRoot -Recurse -File -Filter 'sass.exe' -ErrorAction SilentlyContinue | Select-Object -First 1 }
if (-not $sassRunner) { Write-Error 'Could not find sass runner in tools/dart-sass'; Exit 1 }

# Paths: compile entire css folder (source:target are the same)
$entryRoot = Join-Path $root 'css'
$outRoot = $entryRoot

if ($Watch) {
  Write-Host "Starting sass watch for folder: $entryRoot -> $outRoot"
  & $sassRunner.FullName '--watch', "$entryRoot:$outRoot", '--no-source-map'
} else {
  Write-Host "Compiling all SCSS in $entryRoot -> $outRoot"
  & $sassRunner.FullName $entryRoot $outRoot '--no-source-map'
  if ($LASTEXITCODE -ne 0) { Write-Error 'sass exited with error' ; Exit $LASTEXITCODE }
  Write-Host "Compiled SCSS files under: $entryRoot"
}
