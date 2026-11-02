param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$hostName = 'com.aether.browser'
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $hostRoot 'com.aether.browser.json'
$launcherPath = Join-Path $hostRoot 'aether-native-host.cmd'
$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"

if (-not (Test-Path -LiteralPath (Join-Path $hostRoot 'dist\index.js'))) {
  throw 'Native host build is missing. Run pnpm native-host:build first.'
}

$manifest = @{
  name = $hostName
  description = 'Aether local browser bridge'
  path = $launcherPath
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
$manifestJson = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, [System.Text.UTF8Encoding]::new($false))
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath
Write-Output "Registered $hostName for Chrome extension $ExtensionId"
