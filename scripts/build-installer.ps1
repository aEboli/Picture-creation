param(
  [string]$OutputRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'release'),
  [switch]$SkipBuild,
  [switch]$SanitizeSecrets
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packageScript = Join-Path $projectRoot 'scripts\package-release.ps1'
$iexpressPath = 'C:\Windows\System32\iexpress.exe'
$packageZipName = if ($SanitizeSecrets) { 'picture-creation-safe.zip' } else { 'picture-creation.zip' }
$packageZipPath = Join-Path $OutputRoot $packageZipName
$installerName = if ($SanitizeSecrets) { 'picture-creation-safe-installer' } else { 'picture-creation-installer' }
$installerDir = Join-Path $OutputRoot $installerName
$installerZipPath = Join-Path $OutputRoot ($installerName + '.zip')
$setupBaseName = if ($SanitizeSecrets) { 'picture-creation-safe-setup' } else { 'picture-creation-setup' }
$setupPath = Join-Path $OutputRoot ($setupBaseName + '.exe')
$ddfPath = Join-Path $OutputRoot ('~' + $setupBaseName + '.DDF')
$installerScriptPath = Join-Path $installerDir 'install.cmd'
$installerChinesePath = Join-Path $installerDir '一键安装.cmd'
$readmePath = Join-Path $installerDir 'README-安装包-简体中文.txt'
$sedPath = Join-Path $installerDir 'installer.sed'

if (-not (Test-Path $OutputRoot)) {
  New-Item -ItemType Directory -Path $OutputRoot | Out-Null
}

& $packageScript -SkipBuild:$SkipBuild -SanitizeSecrets:$SanitizeSecrets -CreateZip
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not (Test-Path $packageZipPath)) {
  throw "Expected package zip was not created: $packageZipPath"
}

if (Test-Path $installerDir) {
  Remove-Item -Path $installerDir -Recurse -Force
}
New-Item -ItemType Directory -Path $installerDir | Out-Null
Copy-Item -Path $packageZipPath -Destination (Join-Path $installerDir 'package.zip') -Force

$installScript = @(
  '@echo off',
  'setlocal',
  'if "%INSTALL_DIR%"=="" set "INSTALL_DIR=%LocalAppData%\Picture-creation"',
  'set "EXTRACT_DIR=%TEMP%\PictureCreationInstaller"',
  'if exist "%EXTRACT_DIR%" rd /s /q "%EXTRACT_DIR%"',
  'mkdir "%EXTRACT_DIR%"',
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath ''%~dp0package.zip'' -DestinationPath ''%EXTRACT_DIR%'' -Force"',
  'if errorlevel 1 exit /b 1',
  'robocopy "%EXTRACT_DIR%\picture-creation" "%INSTALL_DIR%" /MIR /R:1 /W:1',
  'set "ROBOCOPY_EXIT=%ERRORLEVEL%"',
  'if %ROBOCOPY_EXIT% GEQ 8 exit /b %ROBOCOPY_EXIT%',
  'if "%SKIP_SHORTCUT%"=="" powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath(''Desktop''); $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut((Join-Path $desktop ''Picture-creation.lnk'')); $shortcut.TargetPath=(Join-Path $env:INSTALL_DIR ''启动网站.bat''); $shortcut.WorkingDirectory=$env:INSTALL_DIR; $shortcut.Save()"',
  'if "%SKIP_LAUNCH%"=="" start "" "%INSTALL_DIR%\启动网站.bat"',
  'if exist "%EXTRACT_DIR%" rd /s /q "%EXTRACT_DIR%"',
  'echo Installed to: %INSTALL_DIR%',
  'pause',
  'exit /b 0'
)
Set-Content -Path $installerScriptPath -Value $installScript -Encoding ASCII
Set-Content -Path $installerChinesePath -Value $installScript -Encoding ASCII

$readme = @(
  'Picture-creation - 绿色安装包说明',
  '',
  '1. 这个安装包已经包含运行时，目标电脑不需要手动安装 Node.js。',
  '2. 双击：一键安装.cmd',
  '3. 默认安装到：%LocalAppData%\Picture-creation',
  '4. 安装完成后会自动创建桌面快捷方式。',
  '5. 安装完成后会自动启动网站。',
  '6. 如果要静默验证，可先在命令行设置：set SKIP_SHORTCUT=1 和 set SKIP_LAUNCH=1',
  '7. 如果要自定义安装目录，可先设置：set INSTALL_DIR=你的目录，再运行一键安装.cmd'
)
Set-Content -Path $readmePath -Value $readme -Encoding UTF8

if (Test-Path $installerZipPath) {
  Remove-Item -Path $installerZipPath -Force
}
Compress-Archive -Path $installerDir -DestinationPath $installerZipPath -CompressionLevel Optimal
Write-Host "Installer package created at: $installerDir" -ForegroundColor Green
Write-Host "Installer zip created at: $installerZipPath" -ForegroundColor Green

if (Test-Path $iexpressPath) {
  $sourceDir = $installerDir.TrimEnd('\\') + '\\'
  $sedLines = @(
    '[Version]',
    'Class=IEXPRESS',
    'SEDVersion=3',
    '',
    '[Options]',
    'PackagePurpose=InstallApp',
    'ShowInstallProgramWindow=1',
    'HideExtractAnimation=1',
    'UseLongFileName=1',
    'InsideCompressed=0',
    'CAB_FixedSize=0',
    'CAB_ResvCodeSigning=0',
    'RebootMode=N',
    'InstallPrompt=%InstallPrompt%',
    'DisplayLicense=%DisplayLicense%',
    'FinishMessage=%FinishMessage%',
    'TargetName=%TargetName%',
    'FriendlyName=%FriendlyName%',
    'AppLaunched=%AppLaunched%',
    'PostInstallCmd=%PostInstallCmd%',
    'AdminQuietInstCmd=%AdminQuietInstCmd%',
    'UserQuietInstCmd=%UserQuietInstCmd%',
    'SourceFiles=SourceFiles',
    '',
    '[Strings]',
    'InstallPrompt=',
    'DisplayLicense=',
    'FinishMessage=',
    ('TargetName=' + $setupPath),
    'FriendlyName=Picture-creation Installer',
    'AppLaunched=cmd.exe /d /s /c ""install.cmd""',
    'PostInstallCmd=<None>',
    'AdminQuietInstCmd=',
    'UserQuietInstCmd=',
    'FILE0="install.cmd"',
    'FILE1="package.zip"',
    '',
    '[SourceFiles]',
    ('SourceFiles0=' + $sourceDir),
    '',
    '[SourceFiles0]',
    '%FILE0%=',
    '%FILE1%='
  )
  Set-Content -Path $sedPath -Value $sedLines -Encoding ASCII

  if (Test-Path $setupPath) {
    Remove-Item -Path $setupPath -Force
  }
  if (Test-Path $ddfPath) {
    Remove-Item -Path $ddfPath -Force
  }

  try {
    & $iexpressPath /N $sedPath
    if (Test-Path $setupPath) {
      Write-Host "Installer EXE created at: $setupPath" -ForegroundColor Green
    } else {
      Write-Warning 'IExpress did not produce an EXE. Use the installer folder or installer ZIP instead.'
    }
  } catch {
    Write-Warning ('IExpress failed. Use the installer folder or installer ZIP instead. ' + $_.Exception.Message)
  } finally {
    if (Test-Path $sedPath) {
      Remove-Item -Path $sedPath -Force
    }
    if (Test-Path $ddfPath) {
      Remove-Item -Path $ddfPath -Force
    }
  }
}
