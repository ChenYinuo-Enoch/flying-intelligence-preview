[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$PackagePath,
    [switch]$DryRun,
    [switch]$NoOpenBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Warning 'stage-admin-update.ps1 is a compatibility wrapper. Use .\Publish-Admin-Update.ps1 for the supported one-command flow.'
$repositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
& (Join-Path $repositoryRoot 'Publish-Admin-Update.ps1') -PackagePath $PackagePath -DryRun:$DryRun -NoOpenBrowser:$NoOpenBrowser
if ($LASTEXITCODE -ne 0) { throw 'PUBLISH_COMMAND_FAILED' }
