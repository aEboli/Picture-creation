param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
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

$fallbackProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resolvedProjectRoot = Resolve-NormalizedPath -PathValue $ProjectRoot -FallbackPath $fallbackProjectRoot
$standaloneServerPath = [System.IO.Path]::Combine($resolvedProjectRoot, ".next", "standalone", "server.js")
$escapedStandaloneServerPath = [Regex]::Escape($standaloneServerPath)
$relativeStandalonePattern = '(?i)(?:^|["''\s])(?:\.\\)?\.next\\standalone\\server\.js(?:["''\s]|$)'

$processes = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -match $escapedStandaloneServerPath -or
      $_.CommandLine -match $relativeStandalonePattern
    )
  }

if (-not $processes) {
  Write-Host "No standalone server process found for $resolvedProjectRoot"
  exit 0
}

foreach ($process in $processes) {
  try {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped standalone server process $($process.ProcessId)"
  } catch {
    Write-Error "Failed to stop standalone server process $($process.ProcessId): $_"
    exit 1
  }
}
