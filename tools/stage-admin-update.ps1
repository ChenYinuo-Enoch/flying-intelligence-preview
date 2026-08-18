[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$PackagePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'admin-staging-lib.ps1')

$resolvedPackage = (Resolve-Path -LiteralPath $PackagePath).Path
$repositoryRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repositoryRoot) { throw 'NOT_A_GIT_REPOSITORY' }

$initialBranch = (& git -C $repositoryRoot branch --show-current).Trim()
$initialStatus = (& git -C $repositoryRoot status --porcelain) -join "`n"

& gh auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) { throw 'GITHUB_CLI_NOT_AUTHENTICATED' }
$githubUser = (& gh api user --jq .login).Trim()
if ($LASTEXITCODE -ne 0) { throw 'GITHUB_IDENTITY_UNAVAILABLE' }
Assert-ExpectedGitHubUser -ActualUser $githubUser

$originUrl = (& git -C $repositoryRoot remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0) { throw 'ORIGIN_UNAVAILABLE' }
Assert-ExpectedOriginUrl -OriginUrl $originUrl

$package = Get-Content -Raw -LiteralPath $resolvedPackage | ConvertFrom-Json
Assert-AdminPackageEnvelope -Package $package

& git -C $repositoryRoot fetch origin main --prune
if ($LASTEXITCODE -ne 0) { throw 'ORIGIN_MAIN_FETCH_FAILED' }
$currentMainSha = (& git -C $repositoryRoot rev-parse origin/main).Trim()
Assert-FreshAdminPackage -BaseCommitSha ([string]$package.baseCommitSha) -CurrentMainSha $currentMainSha
if (-not [string]$package.baseCommitSha) { $package.baseCommitSha = $currentMainSha }

$stagingBranch = Get-AdminStagingBranch -UpdateId ([string]$package.updateId)
& git -C $repositoryRoot show-ref --verify --quiet "refs/heads/$stagingBranch"
if ($LASTEXITCODE -eq 0) { throw "STAGING_BRANCH_EXISTS: $stagingBranch" }
& git -C $repositoryRoot ls-remote --exit-code --heads origin "refs/heads/$stagingBranch" *> $null
if ($LASTEXITCODE -eq 0) { throw "STAGING_BRANCH_EXISTS: $stagingBranch" }
if ($LASTEXITCODE -ne 2) { throw 'STAGING_BRANCH_CHECK_FAILED' }

$tempWorktree = Join-Path ([IO.Path]::GetTempPath()) "flying-admin-stage-$([Guid]::NewGuid().ToString('N'))"
$worktreeCreated = $false
try {
    & git -C $repositoryRoot worktree add --detach $tempWorktree origin/main
    if ($LASTEXITCODE -ne 0) { throw 'TEMP_WORKTREE_CREATE_FAILED' }
    $worktreeCreated = $true

    & git -C $tempWorktree switch -c $stagingBranch
    if ($LASTEXITCODE -ne 0) { throw 'STAGING_BRANCH_CREATE_FAILED' }

    $stagingDirectory = Join-Path $tempWorktree '.admin-staging'
    $stagingPayload = Join-Path $stagingDirectory 'update.json'
    New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
    $json = $package | ConvertTo-Json -Depth 100
    [IO.File]::WriteAllText($stagingPayload, "$json`n", [Text.UTF8Encoding]::new($false))

    & git -C $tempWorktree add -- '.admin-staging/update.json'
    if ($LASTEXITCODE -ne 0) { throw 'STAGING_ADD_FAILED' }
    & git -C $tempWorktree commit -m "admin-stage: $($package.updateId)"
    if ($LASTEXITCODE -ne 0) { throw 'STAGING_COMMIT_FAILED' }
    & git -C $tempWorktree push origin "HEAD:refs/heads/$stagingBranch"
    if ($LASTEXITCODE -ne 0) { throw 'STAGING_PUSH_FAILED' }
}
finally {
    if ($worktreeCreated) {
        & git -C $repositoryRoot worktree remove $tempWorktree
        if ($LASTEXITCODE -ne 0) { Write-Warning "Temporary worktree cleanup failed: $tempWorktree" }
    }
}

$finalBranch = (& git -C $repositoryRoot branch --show-current).Trim()
$finalStatus = (& git -C $repositoryRoot status --porcelain) -join "`n"
if ($finalBranch -cne $initialBranch -or $finalStatus -cne $initialStatus) {
    throw 'CURRENT_WORKTREE_CHANGED_UNEXPECTEDLY'
}

Write-Output 'STAGING_STATUS=READY'
Write-Output "STAGING_BRANCH=$stagingBranch"
Write-Output "UPDATE_ID=$($package.updateId)"
Write-Output "BASE_COMMIT_SHA=$currentMainSha"
Write-Output 'NEXT_STEP=OPEN_GITHUB_ACTIONS'
Write-Output 'ACTIONS_URL=https://github.com/ChenYinuo-Enoch/flying-intelligence-preview/actions/workflows/admin-publish.yml'
Write-Output 'Do NOT create a Pull Request.'
Write-Output 'The staging branch is only used by: Admin Publish Preview Update.'
