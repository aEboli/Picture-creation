param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$Port = 3000,
  [string]$HostName = "127.0.0.1",
  [string]$DataDir = "",
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
  [string]$OutLog = "",
  [string]$ErrLog = ""
)

function Resolve-NormalizedPath {
  param(
    [string]$PathValue,
    [string]$FallbackPath
  )

  $candidate = if ([string]::IsNullOrWhiteSpace($PathValue)) { $FallbackPath } else { $PathValue }
  $candidate = $candidate.Trim()
  $candidate = $candidate.Trim('"')
  $candidate = $candidate.Trim("'")

  if ([string]::IsNullOrWhiteSpace($candidate)) {
    $candidate = $FallbackPath
  }

  $fullPath = [System.IO.Path]::GetFullPath($candidate)
  $rootPath = [System.IO.Path]::GetPathRoot($fullPath)
  if ($fullPath -ne $rootPath) {
    $fullPath = $fullPath.TrimEnd('\', '/')
  }

  return $fullPath
}

function Sync-StandaloneRuntimeAsset {
  param(
    [string]$SourcePath,
    [string]$TargetPath,
    [string]$Label,
    [string]$LogPath
  )

  if (-not (Test-Path $SourcePath)) {
    return
  }

  $targetParent = Split-Path -Parent $TargetPath
  if (-not [string]::IsNullOrWhiteSpace($targetParent) -and -not (Test-Path $targetParent)) {
    New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
  }

  if (Test-Path $TargetPath) {
    Remove-Item -Path $TargetPath -Recurse -Force
  }

  Copy-Item -Path $SourcePath -Destination $targetParent -Recurse -Force

  if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
    "[{0}] Synced {1}: {2} -> {3}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Label, $SourcePath, $TargetPath |
      Out-File -FilePath $LogPath -Encoding utf8 -Append
  }
}

$fallbackProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedProjectRoot = Resolve-NormalizedPath -PathValue $ProjectRoot -FallbackPath $fallbackProjectRoot
$resolvedDataDir = if ([string]::IsNullOrWhiteSpace($DataDir)) {
  [System.IO.Path]::Combine($resolvedProjectRoot, "data")
} else {
  Resolve-NormalizedPath -PathValue $DataDir -FallbackPath ([System.IO.Path]::Combine($resolvedProjectRoot, "data"))
}

if (-not (Test-Path $NodeExe)) {
  throw "node.exe not found: $NodeExe"
}

Set-Location $resolvedProjectRoot

$env:PORT = [string]$Port
$env:HOSTNAME = $HostName
$env:COMMERCE_STUDIO_DATA_DIR = $resolvedDataDir

$resolvedOutLog = if ([string]::IsNullOrWhiteSpace($OutLog)) {
  [System.IO.Path]::Combine($resolvedProjectRoot, ".runtime", "prod-$Port.out.log")
} else {
  Resolve-NormalizedPath -PathValue $OutLog -FallbackPath ([System.IO.Path]::Combine($resolvedProjectRoot, ".runtime", "prod-$Port.out.log"))
}

$resolvedErrLog = if ([string]::IsNullOrWhiteSpace($ErrLog)) {
  [System.IO.Path]::Combine($resolvedProjectRoot, ".runtime", "prod-$Port.err.log")
} else {
  Resolve-NormalizedPath -PathValue $ErrLog -FallbackPath ([System.IO.Path]::Combine($resolvedProjectRoot, ".runtime", "prod-$Port.err.log"))
}

foreach ($logPath in @($resolvedOutLog, $resolvedErrLog)) {
  $logDir = Split-Path -Parent $logPath
  if (-not [string]::IsNullOrWhiteSpace($logDir) -and -not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
}

"[{0}] Launching standalone server on {1}:{2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $HostName, $Port |
  Out-File -FilePath $resolvedOutLog -Encoding utf8 -Append
"[{0}] Project root: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $resolvedProjectRoot |
  Out-File -FilePath $resolvedOutLog -Encoding utf8 -Append
"[{0}] Data directory: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $resolvedDataDir |
  Out-File -FilePath $resolvedOutLog -Encoding utf8 -Append
"[{0}] Error log: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $resolvedErrLog |
  Out-File -FilePath $resolvedOutLog -Encoding utf8 -Append

$standaloneRoot = [System.IO.Path]::Combine($resolvedProjectRoot, ".next", "standalone")
$rootServerEntry = [System.IO.Path]::Combine($resolvedProjectRoot, "server.js")
$standaloneServerEntry = [System.IO.Path]::Combine($standaloneRoot, "server.js")
$serverEntry = if (Test-Path $rootServerEntry) {
  "server.js"
} elseif (Test-Path $standaloneServerEntry) {
  ".next\standalone\server.js"
} else {
  throw "Missing standalone server entry: server.js or .next\standalone\server.js"
}

"[{0}] Server entry: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $serverEntry |
  Out-File -FilePath $resolvedOutLog -Encoding utf8 -Append

Sync-StandaloneRuntimeAsset `
  -SourcePath ([System.IO.Path]::Combine($resolvedProjectRoot, ".next", "static")) `
  -TargetPath ([System.IO.Path]::Combine($standaloneRoot, ".next", "static")) `
  -Label ".next/static" `
  -LogPath $resolvedOutLog
Sync-StandaloneRuntimeAsset `
  -SourcePath ([System.IO.Path]::Combine($resolvedProjectRoot, "public")) `
  -TargetPath ([System.IO.Path]::Combine($standaloneRoot, "public")) `
  -Label "public" `
  -LogPath $resolvedOutLog

& $NodeExe $serverEntry 1>> $resolvedOutLog 2>> $resolvedErrLog
exit $LASTEXITCODE
