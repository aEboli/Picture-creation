param(
  [string]$OutputRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'release'),
  [switch]$SkipBuild,
  [switch]$SanitizeSecrets,
  [string]$ReleaseTag = ""
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageScript = Join-Path $projectRoot 'scripts\package-release.ps1'
$releaseDir = Join-Path $OutputRoot 'picture-creation'
$normalizedTag = $ReleaseTag.Trim()
$slugTag = if ($normalizedTag) { '-' + (($normalizedTag -replace '\s+', '-') -replace '[^A-Za-z0-9\-]', '').ToLowerInvariant() } else { '' }
$displayTag = if ($normalizedTag) { ' ' + $normalizedTag.ToUpperInvariant() } else { '' }
$appDirSuffix = if ($normalizedTag) { ($normalizedTag -replace '\s+', '') -replace '[^A-Za-z0-9]', '' } else { '' }
$setupBaseName = if ($SanitizeSecrets) { "picture-creation${slugTag}-safe-setup" } else { "picture-creation${slugTag}-setup" }
$setupPath = Join-Path $OutputRoot ($setupBaseName + '.exe')
$tmpDir = Join-Path $projectRoot 'tmp\inno'
$issPath = Join-Path $tmpDir 'picture-creation.iss'
$isccCandidates = @(
  'C:\Users\AEboli\AppData\Local\Programs\Inno Setup 6\ISCC.exe',
  'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
  'C:\Program Files\Inno Setup 6\ISCC.exe'
)
$isccPath = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $isccPath) {
  throw 'ISCC.exe was not found. Install Inno Setup first.'
}

$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$appVersion = $packageJson.version
$legacySetupPath = Join-Path $OutputRoot ("PICTURE-CREATION-WINDOWS-$appVersion.exe")
$appName = "Picture-creation$displayTag"
$publisherName = $appName
$defaultDirName = if ($appDirSuffix) { "{localappdata}\Picture-creation$appDirSuffix" } else { '{localappdata}\Picture-creation' }
$appId = if ($appDirSuffix) { "PictureCreation$appDirSuffix" } else { 'PictureCreation' }
$languagesDir = Join-Path (Split-Path $isccPath -Parent) 'Languages'
$languageLines = @(
  '[Languages]',
  'Name: "english"; MessagesFile: "compiler:Default.isl"'
)

if (Test-Path (Join-Path $languagesDir 'ChineseSimplified.isl')) {
  $languageLines += 'Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"'
}

& $packageScript -SkipBuild:$SkipBuild -SanitizeSecrets:$SanitizeSecrets
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not (Test-Path $releaseDir)) {
  throw "Release directory was not created: $releaseDir"
}

@(
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  'if exist "server.js" (',
  '  ".\runtime\node.exe" server.js',
  ') else (',
  '  echo server.js not found.',
  '  pause',
  ')',
  'endlocal'
) | Set-Content -LiteralPath (Join-Path $releaseDir 'start-app.bat') -Encoding ASCII

@(
  '@echo off',
  'setlocal',
  'cd /d "%~dp0"',
  'echo This package is already portable.',
  'echo Run start-app.bat to launch the app from this folder.',
  'pause',
  'endlocal'
) | Set-Content -LiteralPath (Join-Path $releaseDir 'install-local.cmd') -Encoding ASCII

@(
  '@echo off',
  'setlocal',
  'ipconfig',
  'pause',
  'endlocal'
) | Set-Content -LiteralPath (Join-Path $releaseDir 'show-lan-ip.bat') -Encoding ASCII

if (Test-Path $tmpDir) {
  Remove-Item -Path $tmpDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tmpDir | Out-Null

function Escape-InnoString([string]$value) {
  return $value.Replace('\', '\\')
}

$sourceDirEscaped = Escape-InnoString $releaseDir
$outputDirEscaped = Escape-InnoString $OutputRoot
$defaultDirEscaped = Escape-InnoString $defaultDirName
$appNameEscaped = Escape-InnoString $appName
$publisherEscaped = Escape-InnoString $publisherName
$appIdEscaped = Escape-InnoString $appId
$iss = @"
#define MyAppName "$appNameEscaped"
#define MyAppVersion "$appVersion"
#define MyAppPublisher "$publisherEscaped"
#define MyAppExeName "start-app.bat"
#define MySourceDir "$sourceDirEscaped"
#define MyOutputDir "$outputDirEscaped"
#define MyOutputBaseFilename "$setupBaseName"
#define MyDefaultDirName "$defaultDirEscaped"
#define MyAppId "$appIdEscaped"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={#MyDefaultDirName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#MyOutputDir}
OutputBaseFilename={#MyOutputBaseFilename}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\runtime\node.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UsePreviousAppDir=yes
SetupLogging=yes
ChangesEnvironment=no
CloseApplications=no
CreateUninstallRegKey=no
Uninstallable=no

$($languageLines -join "`r`n")

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
"@
Set-Content -LiteralPath $issPath -Value $iss -Encoding UTF8

if (Test-Path $setupPath) {
  Remove-Item -Path $setupPath -Force
}

& $isccPath $issPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not (Test-Path $setupPath)) {
  throw "Setup EXE was not created: $setupPath"
}

Write-Host "Inno Setup installer created at: $setupPath" -ForegroundColor Green

if (Test-Path $legacySetupPath) {
  Remove-Item -Path $legacySetupPath -Force
}

Copy-Item -Path $setupPath -Destination $legacySetupPath -Force
Write-Host "Versioned installer created at: $legacySetupPath" -ForegroundColor Green
