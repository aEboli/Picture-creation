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
  '.learnings',
  '.codex',
  '.claude',
  '.playwright-mcp',
  '.playwright-cli',
  '.runtime',
  'AGENTS.md',
  'ARCHITECTURE.md',
  'app',
  'components',
  'data',
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
  'PAGE_FRAME.md',
  'PRD.md',
  'PROJECT_STATE.md',
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
  'TECH_DECISIONS.md',
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

  $releaseDataDir = Join-Path $releaseDir '.\data'
  if (Test-Path $releaseDataDir) {
    Remove-Item -Path $releaseDataDir -Recurse -Force
  }
}

$releaseScriptsDir = Join-Path $releaseDir 'scripts'
New-Item -ItemType Directory -Path $releaseScriptsDir -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'scripts\start-project-standalone.ps1') -Destination $releaseScriptsDir -Force

$launcher = @(
  '@echo off',
  'setlocal EnableExtensions EnableDelayedExpansion',
  'for %%I in ("%~dp0.") do set "SCRIPT_DIR=%%~fI"',
  'if not defined SCRIPT_DIR for %%I in ("%CD%") do set "SCRIPT_DIR=%%~fI"',
  'cd /d "%SCRIPT_DIR%"',
  'if not exist ".runtime" mkdir ".runtime" >nul 2>nul',
  'if not exist ".\data" mkdir ".\data" >nul 2>nul',
  'set "PICTURE_CREATION_DATA_DIR=%SCRIPT_DIR%\data"',
  'set "COMMERCE_STUDIO_DATA_DIR=%PICTURE_CREATION_DATA_DIR%"',
  'set "NODE_EXE=%SCRIPT_DIR%\runtime\node.exe"',
  'if not exist "%NODE_EXE%" set "NODE_EXE=C:\Program Files\nodejs\node.exe"',
  'if not exist "%NODE_EXE%" set "NODE_EXE=node"',
  'if not exist ".\scripts\start-project-standalone.ps1" (',
  '  echo Missing standalone startup helper: .\scripts\start-project-standalone.ps1',
  '  pause',
  '  exit /b 1',
  ')',
  'if not exist ".\server.js" if not exist ".next\standalone\server.js" (',
  '  echo Missing standalone server entry: server.js or .next\standalone\server.js',
  '  pause',
  '  exit /b 1',
  ')',
  'set "PORT="',
  'for %%P in (3000 3001 3002 3003 3004 3005) do (',
  '  netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul',
  '  if errorlevel 1 (',
  '    set "PORT=%%P"',
  '    goto :PORT_READY',
  '  )',
  ')',
  'echo No free port found in 3000-3005.',
  'pause',
  'exit /b 1',
  ':PORT_READY',
  'set "LOGFILE=%SCRIPT_DIR%\.runtime\prod-%PORT%.log"',
  'set "ERRLOGFILE=%SCRIPT_DIR%\.runtime\prod-%PORT%.err.log"',
  'if exist "%LOGFILE%" del "%LOGFILE%" >nul 2>nul',
  'if exist "%ERRLOGFILE%" del "%ERRLOGFILE%" >nul 2>nul',
  'echo Starting production server on port %PORT% ...',
  'set "HOSTNAME=127.0.0.1"',
  'start "Picture-creation Production" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\scripts\start-project-standalone.ps1" -ProjectRoot "%SCRIPT_DIR%" -Port %PORT% -HostName %HOSTNAME% -DataDir "%PICTURE_CREATION_DATA_DIR%" -NodeExe "%NODE_EXE%" -OutLog "%LOGFILE%" -ErrLog "%ERRLOGFILE%"',
  'set "READY="',
  'for /l %%I in (1,1,25) do (',
  '  netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul',
  '  if not errorlevel 1 (',
  '    set "READY=1"',
  '    goto :READY',
  '  )',
  '  timeout /t 1 >nul',
  ')',
  'if not defined READY (',
  '  echo Production server did not start successfully.',
  '  echo Script directory: %SCRIPT_DIR%',
  '  echo Output log: %LOGFILE%',
  '  echo Error log: %ERRLOGFILE%',
  '  if exist "%LOGFILE%" (',
  '    echo ------------- OUTPUT LOG START -------------',
  '    type "%LOGFILE%"',
  '    echo -------------- OUTPUT LOG END --------------',
  '  )',
  '  if exist "%ERRLOGFILE%" (',
  '    echo ------------- ERROR LOG START --------------',
  '    type "%ERRLOGFILE%"',
  '    echo -------------- ERROR LOG END ---------------',
  '  )',
  '  pause',
  '  exit /b 1',
  ')',
  ':READY',
  'echo Server is ready.',
  'echo URL: http://127.0.0.1:%PORT%',
  'start "" http://127.0.0.1:%PORT%',
  'echo Output log: %LOGFILE%',
  'echo Error log: %ERRLOGFILE%',
  'echo You can close this helper window now.',
  'pause',
  'exit /b 0'
)
Set-Content -LiteralPath (Join-Path $releaseDir '启动网站.bat') -Value $launcher -Encoding ASCII

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
Set-Content -LiteralPath (Join-Path $releaseDir '安装到本机.bat') -Value $localInstaller -Encoding ASCII

$ipHelper = @(
  '@echo off',
  'ipconfig | findstr /R /C:"IPv4"',
  'pause'
)
Set-Content -LiteralPath (Join-Path $releaseDir '查看局域网地址.bat') -Value $ipHelper -Encoding ASCII

$readme = @(
  'Picture-creation - Green release instructions',
  '',
  '1. This release includes node.exe, so the target machine does not need a separate Node.js install.',
  '2. Run the launcher batch file to start the app.',
  '3. The launcher automatically picks a free port from 3000-3005 and opens the browser after startup.',
  '4. To install into the current user profile and create a desktop shortcut, run the local installer batch file.',
  '5. LAN devices can access the app at http://your-PC-IP:actual-port; the port is the one selected at launch.',
  '6. Default data is stored in the local data folder.',
  '7. Safe release mode clears the default API key and custom auth headers from the packaged copy.'
)
Set-Content -LiteralPath (Join-Path $releaseDir 'README-部署-简体中文.txt') -Value $readme -Encoding UTF8

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
