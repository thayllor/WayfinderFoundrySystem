# build-css-fixed.ps1
# Download Dart Sass (Windows x64) if missing and compile SCSS -> CSS.
# Usage:
#   .\build-css-fixed.ps1           # compile once
#   .\build-css-fixed.ps1 -Watch   # compile and watch for changes

param(
  [switch]$Watch
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsRoot = Join-Path $root 'tools'
$sassRoot = Join-Path $toolsRoot 'dart-sass'
$zipPath = Join-Path $toolsRoot 'dart-sass.zip'
$downloadUrl = 'https://github.com/sass/dart-sass/releases/latest/download/dart-sass-windows-x64.zip'

if (-not (Test-Path $sassRoot)) {
  Write-Host "dart-sass not found - downloading..."
  if (-not (Test-Path $toolsRoot)) { New-Item -ItemType Directory -Path $toolsRoot | Out-Null }
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
  Try {
    Expand-Archive -Path $zipPath -DestinationPath $toolsRoot -Force
  } Catch {
    Write-Error ("failed to extract {0}: {1}" -f $zipPath, $_)
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
  & $sassRunner.FullName '--watch', "${entryRoot}:${outRoot}", '--no-source-map'
} else {
  Write-Host "Compiling all SCSS in $entryRoot -> $outRoot"
  & $sassRunner.FullName $entryRoot $outRoot '--no-source-map'
  if ($LASTEXITCODE -ne 0) { Write-Error 'sass exited with error' ; Exit $LASTEXITCODE }
  Write-Host "Compiled SCSS files under: $entryRoot"
}
