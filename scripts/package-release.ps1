param(
  [string]$OutputRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'release'),
  [switch]$SkipBuild,
  [switch]$SanitizeSecrets,
  [switch]$CreateZip
)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseName = 'picture-creation'
$releaseDir = Join-Path $OutputRoot $releaseName
$zipName = if ($SanitizeSecrets) { 'picture-creation-safe.zip' } else { 'picture-creation.zip' }
$zipPath = Join-Path $OutputRoot $zipName
$nestedReleaseDir = Join-Path $releaseDir 'release'
$runtimeDir = Join-Path $releaseDir 'runtime'
$bundledNodePath = Join-Path $runtimeDir 'node.exe'
$systemNodePath = 'C:\Program Files\nodejs\node.exe'
$sharpNativePackageDir = Join-Path $projectRoot 'node_modules\@img\sharp-win32-x64'

Set-Location $projectRoot

if (-not $SkipBuild) {
  Write-Host 'Building standalone release...' -ForegroundColor Cyan
  & 'C:\Program Files\nodejs\npm.cmd' run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if (-not (Test-Path '.next\standalone')) {
  throw 'Missing .next\standalone. Run npm run build first.'
}

if (-not (Test-Path $OutputRoot)) {
  New-Item -ItemType Directory -Path $OutputRoot | Out-Null
}

if (Test-Path $releaseDir) {
  Remove-Item -Path $releaseDir -Recurse -Force
}

New-Item -ItemType Directory -Path $releaseDir | Out-Null
Copy-Item -Path '.next\standalone\*' -Destination $releaseDir -Recurse -Force

$staticTarget = Join-Path $releaseDir '.next\static'
New-Item -ItemType Directory -Path $staticTarget -Force | Out-Null
Copy-Item -Path '.next\static\*' -Destination $staticTarget -Recurse -Force

if (Test-Path '.\public') {
  Copy-Item -Path '.\public' -Destination $releaseDir -Recurse -Force
}

if (Test-Path $sharpNativePackageDir) {
  $sharpNativeTargetDir = Join-Path $releaseDir 'node_modules\@img\sharp-win32-x64'
  New-Item -ItemType Directory -Path $sharpNativeTargetDir -Force | Out-Null
  Copy-Item -Path (Join-Path $sharpNativePackageDir '*') -Destination $sharpNativeTargetDir -Recurse -Force
}

if (Test-Path '.\data') {
  Copy-Item -Path '.\data' -Destination $releaseDir -Recurse -Force
}

if (Test-Path $nestedReleaseDir) {
  Remove-Item -Path $nestedReleaseDir -Recurse -Force
}

$cleanupItems = @(
  '.git',
  '.codex',
  '.playwright-cli',
  '.runtime',
  'AGENTS.md',
  'app',
  'components',
  'doc',
  'docs',
  'lib',
  'openspec',
  'scripts',
  'output',
  'Readme',
  'tmp',
  'release',
  '-',
  '.gitignore',
  'next.config.ts',
  'package-lock.json',
  'README.md',
  'reset-next-dev.bat',
  'run-dev-server.bat',
  'run-prod-server.bat',
  'show-local-ip.bat',
  'start-auto-port.bat',
  'start-dev.bat',
  'start-prod-auto-port.bat',
  'start-prod.bat',
  'tsconfig.json',
  'tsconfig.tsbuildinfo',
  '一键启动并打开网页.bat',
  '使用说明-简体中文.md',
  '启动开发版.bat',
  '启动正式版.bat',
  '构建V2单文件安装器.bat',
  '安全打包发布版.bat',
  '安全打包并生成压缩包.bat',
  '局域网访问检查清单-简体中文.md',
  '打包发布版.bat',
  '打包并生成压缩包.bat',
  '构建绿色安装包.bat',
  '端口占用处理说明-简体中文.md',
  '自动选择端口并启动.bat'
)
foreach ($item in $cleanupItems) {
  $target = Join-Path $releaseDir $item
  if (Test-Path $target) {
    Remove-Item -Path $target -Recurse -Force
  }
}

Get-ChildItem -Path $releaseDir -Filter '*.log' -File -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem -Path $releaseDir -Filter '*.err.log' -File -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem -Path $releaseDir -Filter '*.out.log' -File -ErrorAction SilentlyContinue | Remove-Item -Force

if (Test-Path $systemNodePath) {
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  Copy-Item -Path $systemNodePath -Destination $bundledNodePath -Force
} else {
  Write-Warning 'node.exe was not found under C:\Program Files\nodejs. Portable release will fall back to system PATH.'
}

if ($SanitizeSecrets) {
  $releaseDbCandidates = @(
    (Join-Path $releaseDir '.\data\picture-creation.sqlite'),
    (Join-Path $releaseDir '.\data\commerce-image-studio.sqlite')
  )
  $releaseDb = $releaseDbCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($releaseDb) {
    $sanitizeScript = @'
const { DatabaseSync } = require("node:sqlite");
const dbPath = process.argv[2];
const db = new DatabaseSync(dbPath);
const hasTable = (name) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
if (hasTable("settings")) {
  db.prepare("UPDATE settings SET default_api_key = '', default_api_headers = '', feishu_app_secret = '', updated_at = datetime('now') WHERE id = 1").run();
}
for (const tableName of ["assets", "job_items", "jobs"]) {
  if (hasTable(tableName)) {
    db.prepare(`DELETE FROM ${tableName}`).run();
  }
}
db.close();
'@
    $sanitizeScript | & $systemNodePath - $releaseDb
    if ($LASTEXITCODE -ne 0) {
      throw 'Failed to sanitize release database secrets.'
    }
  }

  $releaseAssetsDir = Join-Path $releaseDir '.\data\assets'
  if (Test-Path $releaseAssetsDir) {
    Remove-Item -Path $releaseAssetsDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $releaseAssetsDir -Force | Out-Null
}

$launcher = @(
  '@echo off',
  'cd /d "%~dp0"',
  'set HOSTNAME=0.0.0.0',
  'if "%PORT%"=="" set PORT=3000',
  'if not exist ".\data" mkdir ".\data"',
  'set "PICTURE_CREATION_DATA_DIR=%~dp0data"',
  'set "COMMERCE_STUDIO_DATA_DIR=%PICTURE_CREATION_DATA_DIR%"',
  'set "NODE_EXE=%~dp0runtime\node.exe"',
  'if not exist "%NODE_EXE%" set "NODE_EXE=node"',
  '"%NODE_EXE%" server.js',
  'pause'
)
Set-Content -Path (Join-Path $releaseDir '启动网站.bat') -Value $launcher -Encoding ASCII

$localInstaller = @(
  '@echo off',
  'setlocal',
  'if "%INSTALL_DIR%"=="" set "INSTALL_DIR=%LocalAppData%\Picture-creation"',
  'set "SOURCE_DIR=%~dp0"',
  'if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"',
  'robocopy "%SOURCE_DIR%" "%INSTALL_DIR%" /MIR /R:1 /W:1',
  'set "ROBOCOPY_EXIT=%ERRORLEVEL%"',
  'if %ROBOCOPY_EXIT% GEQ 8 exit /b %ROBOCOPY_EXIT%',
  'if "%SKIP_SHORTCUT%"=="" powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath(''Desktop''); $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut((Join-Path $desktop ''Picture-creation.lnk'')); $shortcut.TargetPath=(Join-Path $env:INSTALL_DIR ''启动网站.bat''); $shortcut.WorkingDirectory=$env:INSTALL_DIR; $shortcut.Save()"',
  'if "%SKIP_LAUNCH%"=="" start "" "%INSTALL_DIR%\启动网站.bat"',
  'echo Installed to: %INSTALL_DIR%',
  'pause'
)
Set-Content -Path (Join-Path $releaseDir '安装到本机.bat') -Value $localInstaller -Encoding ASCII

$ipHelper = @(
  '@echo off',
  'ipconfig | findstr /R /C:"IPv4"',
  'pause'
)
Set-Content -Path (Join-Path $releaseDir '查看局域网地址.bat') -Value $ipHelper -Encoding ASCII

$readme = @(
  'Picture-creation - 绿色发布版使用说明',
  '',
  '1. 这个发布版已经内置 node.exe，目标电脑不需要再手动安装 Node.js。',
  '2. 直接运行：启动网站.bat',
  '3. 如果希望安装到本机用户目录并创建桌面快捷方式，请运行：安装到本机.bat',
  '4. 浏览器打开 http://127.0.0.1:3000',
  '5. 局域网其他电脑可访问 http://本机IP:3000',
  '6. 默认数据保存在当前目录的 data 文件夹。',
  '7. 安全发布模式会清空发布目录中的默认 API Key 和自定义认证请求头。'
)
Set-Content -Path (Join-Path $releaseDir 'README-部署-简体中文.txt') -Value $readme -Encoding UTF8

Write-Host "Release created at: $releaseDir" -ForegroundColor Green
if (Test-Path $bundledNodePath) {
  Write-Host 'Bundled runtime: node.exe copied into release/runtime' -ForegroundColor Green
}
if ($SanitizeSecrets) {
  Write-Host 'Secrets sanitized in release copy.' -ForegroundColor Yellow
}

if ($CreateZip) {
  if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
  }
  Compress-Archive -Path $releaseDir -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "Zip created at: $zipPath" -ForegroundColor Green
}
