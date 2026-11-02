$ErrorActionPreference = 'Stop'
$hostRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\apps\native-host')
$probePath = Join-Path $hostRoot 'dist\native-messaging-spike.cjs'
$launcherPath = Join-Path $hostRoot 'dist\native-messaging-spike.cmd'
$driverPath = Join-Path $hostRoot 'dist\native-messaging-spike-driver.cjs'

if (-not (Test-Path -LiteralPath (Join-Path $hostRoot 'dist\index.js'))) {
  throw 'Build @aether/native-host before running this spike.'
}

Set-Content -LiteralPath $probePath -Encoding utf8 -Value @'
let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length < 4) return;
  const length = buffer.readUInt32LE(0);
  if (buffer.length < length + 4) return;
  const response = buffer.subarray(4, length + 4);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(response.length);
  process.stdout.write(Buffer.concat([header, response]));
});
'@
Set-Content -LiteralPath $launcherPath -Encoding ascii -Value "@echo off`r`nnode `"%~dp0native-messaging-spike.cjs`""
Set-Content -LiteralPath $driverPath -Encoding utf8 -Value @'
const { spawnSync } = require('node:child_process');
const launcher = process.argv[2];
const request = Buffer.from('{"type":"stdio-spike"}');
const header = Buffer.alloc(4);
header.writeUInt32LE(request.length);
const result = spawnSync('cmd.exe', ['/d', '/c', launcher], { input: Buffer.concat([header, request]) });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Host launcher exit code ${result.status}: ${result.stderr.toString()}`);
if (result.stdout.length < 4 || result.stdout.readUInt32LE(0) !== request.length) throw new Error('Native message length prefix was not preserved.');
if (!result.stdout.subarray(4).equals(request)) throw new Error('Native message payload was not preserved.');
process.stdout.write('Windows command launcher preserved a little-endian framed stdio message.');
'@

try {
  & node $driverPath $launcherPath
  if ($LASTEXITCODE -ne 0) { throw "Native host stdio spike failed with exit code $LASTEXITCODE." }
  Write-Output ''
  Write-Output 'Spike passed for the Windows command launcher and framed stdio. Chrome registration is checked by the install script.'
} finally {
  Remove-Item -LiteralPath $probePath, $launcherPath, $driverPath -Force -ErrorAction SilentlyContinue
}
