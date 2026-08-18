Set-StrictMode -Version Latest

$script:ExpectedGitHubUser = 'ChenYinuo-Enoch'
$script:ExpectedOriginUrl = 'https://github.com/ChenYinuo-Enoch/flying-intelligence-preview.git'
$script:AllowedUpdateTypes = @('add_member', 'add_publication', 'member_status')

function Assert-ExpectedGitHubUser {
    param([Parameter(Mandatory = $true)][string]$ActualUser)
    if ($ActualUser.Trim() -cne $script:ExpectedGitHubUser) {
        throw "WRONG_GITHUB_USER: expected $($script:ExpectedGitHubUser)."
    }
}

function Assert-ExpectedOriginUrl {
    param([Parameter(Mandatory = $true)][string]$OriginUrl)
    if ($OriginUrl.Trim() -cne $script:ExpectedOriginUrl) {
        throw 'WRONG_ORIGIN: origin must be ChenYinuo-Enoch/flying-intelligence-preview.'
    }
}

function Assert-AdminPackageEnvelope {
    param([Parameter(Mandatory = $true)]$Package)
    if ($Package.schemaVersion -ne 1) { throw 'UNSUPPORTED_PACKAGE_SCHEMA' }
    if ([string]$Package.updateId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{7,79}$') { throw 'INVALID_UPDATE_ID' }
    if ([string]$Package.updateType -cnotin $script:AllowedUpdateTypes) { throw 'UNSUPPORTED_UPDATE_TYPE' }
    if ([string]$Package.targetEnvironment -cne 'preview') { throw 'INVALID_TARGET_ENVIRONMENT' }
    if ([string]$Package.previewSite -cne 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/') { throw 'INVALID_PREVIEW_SITE' }
    if ($null -eq $Package.content) { throw 'MISSING_PACKAGE_CONTENT' }
    $base = [string]$Package.baseCommitSha
    if ($base -and $base -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_BASE_COMMIT_SHA' }
    foreach ($blocked in @('targetOwner', 'targetRepo', 'targetBranch')) {
        if ($Package.PSObject.Properties.Name -contains $blocked) { throw "REMOTE_TARGET_FIELD_FORBIDDEN: $blocked" }
    }
}

function Assert-FreshAdminPackage {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$BaseCommitSha,
        [Parameter(Mandatory = $true)][string]$CurrentMainSha
    )
    if ($CurrentMainSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_CURRENT_MAIN_SHA' }
    if ($BaseCommitSha -and $BaseCommitSha -cne $CurrentMainSha) {
        throw "STALE_UPDATE_PACKAGE`nThe website changed after this update was prepared.`nReturn to Admin and prepare the update again."
    }
}

function Get-AdminStagingBranch {
    param([Parameter(Mandatory = $true)][string]$UpdateId)
    $branch = "admin-staging/$UpdateId"
    if ($branch -notmatch '^admin-staging/[A-Za-z0-9._-]+$') { throw 'INVALID_STAGING_BRANCH' }
    return $branch
}
