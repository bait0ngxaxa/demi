param(
  [string]$OutputDirectory = "public/line/rich-menus",
  [string[]]$AssetFiles = @(),
  [switch]$Check
)

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "generate-line-rich-menu-assets.ts"
$nodeArguments = @("--output", $OutputDirectory)
foreach ($assetFile in $AssetFiles) {
  $nodeArguments += @("--asset-file", $assetFile)
}
if ($Check) {
  $nodeArguments += "--check"
}

& npx jiti $scriptPath @nodeArguments
if ($LASTEXITCODE -ne 0) {
  throw "Rich Menu asset generation failed with exit code $LASTEXITCODE."
}
