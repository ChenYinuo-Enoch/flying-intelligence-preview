[CmdletBinding()]
param(
    [string]$PackagePath = '',
    [switch]$DryRun,
    [switch]$NoOpenBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\admin-github-common.ps1')

$resolvedPackage = Select-AdminPackagePath -PackagePath $PackagePath
$package = Read-AdminPublishPackage -PackagePath $resolvedPackage
Assert-AdminPackageEnvelope -Package $package
Assert-AdminTrustedPackage -PackagePath $resolvedPackage
$context = Get-AdminGitHubContext
$preflight = Test-AdminPublishPreflight -Package $package -GitHubContext $context
$summary = Get-AdminUpdateSummary -Package $package

Write-Output ''
Write-Output 'Flying Intelligence Admin Publish'
Write-Output ''
Write-Output "Package: $([IO.Path]::GetFileName($resolvedPackage))"
Write-Output "Type: $($summary.Type)"
Write-Output "Update: $($summary.Subject)"
Write-Output "Target: $($context.Repository) / $($context.Branch)"
Write-Output "Base SHA: $($package.baseCommitSha)"
Write-Output "Current Main: $($context.MainSha)"

if ($DryRun) {
    Write-Output 'DRY_RUN=PASS'
    Write-Output 'REMOTE_WRITE_PERFORMED=NO'
    Write-Output "STAGING_BRANCH=$($preflight.StagingBranch)"
    return
}

if (-not (Confirm-AdminOperation -Prompt 'Publish this update?')) {
    Write-Output 'PUBLISH_STATUS=CANCELLED'
    return
}

$staging = New-AdminRemoteStaging -PackagePath $resolvedPackage -Package $package -CurrentMainSha $context.MainSha
Write-Output 'STAGING_STATUS=READY'
Write-Output "STAGING_BRANCH=$($staging.Branch)"

$dispatch = Start-AdminPublishWorkflow -UpdateId ([string]$package.updateId) -StagingCommitSha $staging.CommitSha
$run = Wait-AdminWorkflowRun -Workflow 'admin-publish.yml' -ExpectedTitle $dispatch.ExpectedTitle -DispatchedAt $dispatch.DispatchedAt
$watch = Watch-AdminWorkflowRun -Run $run -Operation 'PUBLISH'

$afterContext = Get-AdminGitHubContext
if ($afterContext.MainSha -ceq $context.MainSha) {
    Assert-AdminWorkflowExitCode -ExitCode $watch.ExitCode -Operation 'PUBLISH' -RunId $watch.RunId -RunUrl $watch.RunUrl
    throw 'PUBLISH_MAIN_SHA_UNCHANGED'
}
$publishedCommit = Get-AdminCommit -Sha $afterContext.MainSha
Assert-AdminCommitParent -Commit $publishedCommit -ExpectedParentSha $context.MainSha
$publishedSubject = ($publishedCommit.message -split "`r?`n")[0]
if ($publishedSubject -cnotmatch '^admin:' -or $publishedSubject -cmatch '^admin: rollback') { throw 'PUBLISHED_COMMIT_UNEXPECTED' }

$pages = if ($watch.Succeeded) {
    Wait-AdminPreviewDeployment -ExpectedMainSha $afterContext.MainSha -Page $summary.Page
}
else {
    [pscustomobject]@{ Status = 'COMMIT_SUCCESS_PAGES_PENDING'; Website = $script:AdminPreviewSite }
}
$cleanup = 'SUCCESS'
if (Test-AdminStagingBranchExists -StagingBranch $staging.Branch) {
    try { Remove-AdminStagingBranch -StagingBranch $staging.Branch -ExpectedCommitSha $staging.CommitSha }
    catch { $cleanup = 'PENDING' }
}

Write-Output '================================'
Write-Output 'PUBLISHED'
Write-Output '================================'
Write-Output "Update: $($summary.Type): $($summary.Subject)"
Write-Output "Commit: $($afterContext.MainSha.Substring(0, 7))"
Write-Output "GitHub Action: $($run.url)"
Write-Output "Website: $($pages.Website)"
Write-Output "Staging Cleanup: $cleanup"
Write-Output "PUBLISH_STATUS=$($pages.Status)"
if (-not $watch.Succeeded) { Write-Output "WORKFLOW_STATUS=FAILED_AFTER_COMMIT`nRUN_ID=$($watch.RunId)`nRUN_URL=$($watch.RunUrl)" }
Write-Output '================================'

if (-not $NoOpenBrowser -and $pages.Status -ceq 'DEPLOYED') { Start-Process $pages.Website }
