[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$NoOpenBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'tools\admin-github-common.ps1')

$context = Get-AdminGitHubContext
$currentCommit = Get-AdminCommit -Sha $context.MainSha
Assert-AdminRollbackEligible -Commit $currentCommit
$subject = ($currentCommit.message -split "`r?`n")[0]

Write-Output ''
Write-Output 'Flying Intelligence Admin Rollback'
Write-Output ''
Write-Output "Current Admin update: $subject"
Write-Output "Commit: $($context.MainSha)"
Write-Output "Target: $($context.Repository) / $($context.Branch)"

if ($DryRun) {
    Write-Output 'DRY_RUN=PASS'
    Write-Output 'REMOTE_WRITE_PERFORMED=NO'
    Write-Output "EXPECTED_HEAD_SHA=$($context.MainSha)"
    return
}

if (-not (Confirm-AdminOperation -Prompt 'Rollback this update?')) {
    Write-Output 'ROLLBACK_STATUS=CANCELLED'
    return
}

$dispatch = Start-AdminRollbackWorkflow -ExpectedHeadSha $context.MainSha
$run = Wait-AdminWorkflowRun -Workflow 'admin-rollback.yml' -ExpectedTitle $dispatch.ExpectedTitle -DispatchedAt $dispatch.DispatchedAt
$watch = Watch-AdminWorkflowRun -Run $run -Operation 'ROLLBACK'

$afterContext = Get-AdminGitHubContext
if ($afterContext.MainSha -ceq $context.MainSha) {
    Assert-AdminWorkflowExitCode -ExitCode $watch.ExitCode -Operation 'ROLLBACK' -RunId $watch.RunId -RunUrl $watch.RunUrl
    throw 'ROLLBACK_MAIN_SHA_UNCHANGED'
}
$rollbackCommit = Get-AdminCommit -Sha $afterContext.MainSha
Assert-AdminCommitParent -Commit $rollbackCommit -ExpectedParentSha $context.MainSha
$expectedMessage = "admin: rollback $($context.MainSha.Substring(0, 7))"
if (($rollbackCommit.message -split "`r?`n")[0] -cne $expectedMessage) { throw 'ROLLBACK_COMMIT_UNEXPECTED' }
$pages = if ($watch.Succeeded) {
    Wait-AdminPreviewDeployment -ExpectedMainSha $afterContext.MainSha -Page 'index.html'
}
else {
    [pscustomobject]@{ Status = 'COMMIT_SUCCESS_PAGES_PENDING'; Website = $script:AdminPreviewSite }
}

Write-Output '================================'
Write-Output 'ROLLED BACK'
Write-Output '================================'
Write-Output "Rolled back: $subject"
Write-Output "Rollback commit: $($afterContext.MainSha)"
Write-Output "GitHub Action: $($run.url)"
Write-Output "Website: $($pages.Website)"
Write-Output "ROLLBACK_STATUS=$($pages.Status)"
if (-not $watch.Succeeded) { Write-Output "WORKFLOW_STATUS=FAILED_AFTER_COMMIT`nRUN_ID=$($watch.RunId)`nRUN_URL=$($watch.RunUrl)" }
Write-Output '================================'

if (-not $NoOpenBrowser -and $pages.Status -ceq 'DEPLOYED') { Start-Process $pages.Website }
