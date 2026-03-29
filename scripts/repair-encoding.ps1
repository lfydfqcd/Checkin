param(
  [string]$Root = ".",
  [switch]$DryRun,
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$gb18030 = [System.Text.Encoding]::GetEncoding(54936)

$ignoredDirs = @(
  ".git",
  ".idea",
  ".next",
  ".vscode-test",
  "build",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "out",
  "target"
)

$textExtensions = @(
  ".css",
  ".csv",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".less",
  ".md",
  ".mjs",
  ".scss",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".editorconfig",
  ".gitattributes"
)

function Test-IgnoredPath([string]$Path) {
  foreach ($segment in $ignoredDirs) {
    $pattern = [regex]::Escape([IO.Path]::DirectorySeparatorChar + $segment + [IO.Path]::DirectorySeparatorChar)
    if ($Path -match $pattern) {
      return $true
    }

    $altPattern = [regex]::Escape([IO.Path]::AltDirectorySeparatorChar + $segment + [IO.Path]::AltDirectorySeparatorChar)
    if ($Path -match $altPattern) {
      return $true
    }
  }
  return $false
}

function Test-TextFile([System.IO.FileInfo]$File) {
  $name = $File.Name
  $ext = $File.Extension.ToLowerInvariant()
  if ($textExtensions -contains $name) {
    return $true
  }
  return $textExtensions -contains $ext
}

function Get-BomKind([byte[]]$Bytes) {
  if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) {
    return "utf8-bom"
  }
  if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xFE) {
    return "utf16le-bom"
  }
  if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0xFE -and $Bytes[1] -eq 0xFF) {
    return "utf16be-bom"
  }
  return "none"
}

function Test-IsUtf8([byte[]]$Bytes) {
  try {
    $null = $utf8Strict.GetString($Bytes)
    return $true
  } catch {
    return $false
  }
}

function Get-BackupPath([string]$FilePath) {
  $base = "$FilePath.bak-encoding"
  if (-not (Test-Path -LiteralPath $base)) {
    return $base
  }
  $timestamp = Get-Date -Format "yyyyMMddHHmmss"
  return "$base.$timestamp"
}

$rootPath = (Resolve-Path -LiteralPath $Root).Path
$files = Get-ChildItem -Path $rootPath -Recurse -File | Where-Object {
  -not (Test-IgnoredPath $_.FullName) -and (Test-TextFile $_)
}

$converted = @()
$skipped = 0

foreach ($file in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  if ($bytes.Length -eq 0) {
    $skipped += 1
    continue
  }

  $bomKind = Get-BomKind -Bytes $bytes
  $targetText = $null
  $reason = $null

  if ($bomKind -eq "utf8-bom") {
    $targetText = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    $reason = "remove UTF-8 BOM"
  } elseif ($bomKind -eq "utf16le-bom") {
    $targetText = [System.Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
    $reason = "convert UTF-16 LE BOM -> UTF-8"
  } elseif ($bomKind -eq "utf16be-bom") {
    $targetText = [System.Text.Encoding]::BigEndianUnicode.GetString($bytes, 2, $bytes.Length - 2)
    $reason = "convert UTF-16 BE BOM -> UTF-8"
  } elseif (-not (Test-IsUtf8 -Bytes $bytes)) {
    $targetText = $gb18030.GetString($bytes)
    $reason = "convert non-UTF8 bytes (fallback GB18030) -> UTF-8"
  } else {
    $skipped += 1
    continue
  }

  $relativePath = [IO.Path]::GetRelativePath($rootPath, $file.FullName)

  if ($DryRun) {
    $converted += [PSCustomObject]@{
      File = $relativePath
      Action = $reason
      DryRun = $true
    }
    continue
  }

  if (-not $NoBackup) {
    $backupPath = Get-BackupPath -FilePath $file.FullName
    [System.IO.File]::Copy($file.FullName, $backupPath, $false)
  }

  [System.IO.File]::WriteAllText($file.FullName, $targetText, $utf8NoBom)

  $converted += [PSCustomObject]@{
    File = $relativePath
    Action = $reason
    DryRun = $false
  }
}

if ($converted.Count -gt 0) {
  Write-Host "Converted $($converted.Count) file(s) to UTF-8."
  $converted | Format-Table -AutoSize
} else {
  Write-Host "No file required encoding conversion."
}

Write-Host "Skipped (already UTF-8/no change): $skipped"