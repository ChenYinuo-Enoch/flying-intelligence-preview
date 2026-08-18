Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\tools\admin-staging-lib.ps1')

function Assert-Throws {
    param([scriptblock]$Operation, [string]$Pattern)
    try { & $Operation; throw "Expected failure: $Pattern" }
    catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw }
    }
}

Assert-ExpectedGitHubUser -ActualUser 'ChenYinuo-Enoch'
Assert-Throws { Assert-ExpectedGitHubUser -ActualUser 'another-user' } 'WRONG_GITHUB_USER'

Assert-ExpectedOriginUrl -OriginUrl 'https://github.com/ChenYinuo-Enoch/flying-intelligence-preview.git'
Assert-Throws { Assert-ExpectedOriginUrl -OriginUrl 'https://github.com/Flying-Intelligence/flying-intelligence.github.io.git' } 'WRONG_ORIGIN'

$package = [pscustomobject]@{
    schemaVersion = 1
    updateId = '20260818-102030-abc12345'
    updateType = 'member_status'
    baseCommitSha = '1111111111111111111111111111111111111111'
    previewSite = 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/'
    targetEnvironment = 'preview'
    content = [pscustomobject]@{ id = 'member-one'; status = 'former'; time = '(2025 - 2026)' }
}
Assert-AdminPackageEnvelope -Package $package
Assert-FreshAdminPackage -BaseCommitSha $package.baseCommitSha -CurrentMainSha $package.baseCommitSha
Assert-Throws { Assert-FreshAdminPackage -BaseCommitSha $package.baseCommitSha -CurrentMainSha ('2' * 40) } 'STALE_UPDATE_PACKAGE'
if ((Get-AdminStagingBranch -UpdateId $package.updateId) -cne "admin-staging/$($package.updateId)") { throw 'STAGING_BRANCH_ASSERTION_FAILED' }
Assert-Throws { Get-AdminStagingBranch -UpdateId '../main' } 'INVALID_STAGING_BRANCH'

$package | Add-Member -NotePropertyName targetRepo -NotePropertyValue 'other'
Assert-Throws { Assert-AdminPackageEnvelope -Package $package } 'REMOTE_TARGET_FIELD_FORBIDDEN'

Write-Output 'STAGING_HELPER_TESTS=PASS'
