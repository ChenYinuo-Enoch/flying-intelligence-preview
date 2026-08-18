Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\tools\admin-github-common.ps1')

function Assert-Equal {
    param($Actual, $Expected, [string]$Label)
    if ($Actual -cne $Expected) { throw "$Label expected '$Expected' but received '$Actual'." }
}

function Assert-Throws {
    param([scriptblock]$Operation, [string]$Pattern)
    try { & $Operation; throw "Expected failure: $Pattern" }
    catch {
        if ($_.Exception.Message -notmatch $Pattern) { throw }
    }
}

$sha = '5db13f0114c5a61aeeed9954ec46373f6430f12a'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) "测试 用户 $([Guid]::NewGuid().ToString('N'))\Flying Intelligence"
$downloads = Join-Path $fixtureRoot '下载 文件'
New-Item -ItemType Directory -Path $downloads | Out-Null

try {
    $olderPath = Join-Path $downloads 'flying-admin-update-20260818-100000-old00001.json'
    $packagePath = Join-Path $downloads 'flying-admin-update-20260818-104820-成员更新.json'
    $packageObject = [ordered]@{
        schemaVersion = 1
        updateId = '20260818-104820-645bd9e1'
        updateType = 'member_status'
        createdAt = '2026-08-18T10:48:20.000Z'
        baseCommitSha = $sha
        previewSite = 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/'
        targetEnvironment = 'preview'
        content = [ordered]@{ id = 'member-one'; status = 'former'; time = '(2025 - 2026)' }
    }
    $json = $packageObject | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($olderPath, $json, [Text.UTF8Encoding]::new($false))
    Start-Sleep -Milliseconds 25
    [IO.File]::WriteAllText($packagePath, $json, [Text.UTF8Encoding]::new($false))

    $resolved = Resolve-AdminPackagePath -PackagePath $packagePath
    Assert-Equal $resolved ([IO.Path]::GetFullPath($packagePath)) 'Unicode package path'
    $candidates = @(Get-AdminPackageCandidates -DownloadsPath $downloads)
    Assert-Equal $candidates.Count 2 'Package candidate count'
    Assert-Equal $candidates[0].FullName $resolved 'Newest package selection order'
    if (-not (Test-Path -LiteralPath (Get-AdminDownloadsPath) -PathType Container)) { throw 'Windows Downloads Known Folder resolution failed.' }
    $package = Read-AdminPublishPackage -PackagePath $resolved
    Assert-AdminPackageEnvelope -Package $package
    Assert-Equal (Get-AdminStagingBranch -UpdateId $package.updateId) 'admin-staging/20260818-104820-645bd9e1' 'Staging branch'
    $summary = Get-AdminUpdateSummary -Package $package
    Assert-Equal $summary.Type 'Member Status' 'Summary type'
    Assert-Equal $summary.Subject 'member-one -> Former' 'Summary subject'

    Assert-Throws { Assert-FreshAdminPackage -BaseCommitSha ('1' * 40) -CurrentMainSha $sha } 'STALE_PACKAGE'
    $invalidIdPackage = $json | ConvertFrom-Json
    $invalidIdPackage.updateId = '../main'
    Assert-Throws { Assert-AdminPackageEnvelope -Package $invalidIdPackage } 'INVALID_UPDATE_ID'
    $invalidJsonPath = Join-Path $downloads 'flying-admin-update-invalid.json'
    [IO.File]::WriteAllText($invalidJsonPath, '{ invalid json', [Text.UTF8Encoding]::new($false))
    Assert-Throws { Read-AdminPublishPackage -PackagePath $invalidJsonPath } 'INVALID_PACKAGE_JSON'

    $calls = [Collections.Generic.List[object]]::new()
    $remoteState = [pscustomobject]@{ StagingExists = $false; StagingSha = ''; UploadedContent = '' }
    $listedRunCreatedAt = (Get-Date).ToUniversalTime().ToString('o')
    Set-AdminGhInvoker -Invoker {
        param([string[]]$Arguments, [string]$InputPath, [bool]$PassThru)
        $key = $Arguments -join ' '
        $body = if ($InputPath) { [IO.File]::ReadAllText($InputPath, [Text.Encoding]::UTF8) } else { '' }
        $calls.Add([pscustomobject]@{ Key = $key; Body = $body })
        if ($key -eq 'auth status --active --hostname github.com') { return [pscustomobject]@{ ExitCode = 0; Output = '' } }
        if ($key -eq 'api --hostname github.com user') { return [pscustomobject]@{ ExitCode = 0; Output = '{"login":"ChenYinuo-Enoch"}' } }
        if ($key -eq 'api --hostname github.com repos/ChenYinuo-Enoch/flying-intelligence-preview') { return [pscustomobject]@{ ExitCode = 0; Output = '{"full_name":"ChenYinuo-Enoch/flying-intelligence-preview","permissions":{"push":true}}' } }
        if ($key -eq 'api --hostname github.com repos/ChenYinuo-Enoch/flying-intelligence-preview/git/ref/heads/main') { return [pscustomobject]@{ ExitCode = 0; Output = "{`"object`":{`"sha`":`"$sha`"}}" } }
        if ($key -like 'api --hostname github.com repos/ChenYinuo-Enoch/flying-intelligence-preview/git/matching-refs/heads/admin-staging/*') {
            $result = if ($remoteState.StagingExists) { "[{`"ref`":`"refs/heads/admin-staging/20260818-104820-645bd9e1`",`"object`":{`"sha`":`"$($remoteState.StagingSha)`"}}]" } else { '[]' }
            return [pscustomobject]@{ ExitCode = 0; Output = $result }
        }
        if ($key -eq 'api --hostname github.com --method POST repos/ChenYinuo-Enoch/flying-intelligence-preview/git/refs --input-file') {
            $remoteState.StagingExists = $true
            $remoteState.StagingSha = $sha
            return [pscustomobject]@{ ExitCode = 0; Output = '{"ref":"refs/heads/admin-staging/20260818-104820-645bd9e1"}' }
        }
        if ($key -eq 'api --hostname github.com --method PUT repos/ChenYinuo-Enoch/flying-intelligence-preview/contents/.admin-staging/update.json --input-file') {
            $request = $body | ConvertFrom-Json
            $remoteState.UploadedContent = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($request.content))
            $remoteState.StagingSha = '2222222222222222222222222222222222222222'
            return [pscustomobject]@{ ExitCode = 0; Output = '{"commit":{"sha":"2222222222222222222222222222222222222222"}}' }
        }
        if ($key -like 'api --hostname github.com repos/ChenYinuo-Enoch/flying-intelligence-preview/contents/.admin-staging/update.json*') {
            $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteState.UploadedContent))
            return [pscustomobject]@{ ExitCode = 0; Output = "{`"content`":`"$encoded`"}" }
        }
        if ($key -like 'workflow run admin-publish.yml *' -or $key -like 'workflow run admin-rollback.yml *') {
            return [pscustomobject]@{ ExitCode = 0; Output = '' }
        }
        if ($key -like 'run watch *') { return [pscustomobject]@{ ExitCode = 1; Output = '' } }
        if ($key -like 'run view *') { return [pscustomobject]@{ ExitCode = 0; Output = '{"status":"completed","conclusion":"failure","url":"https://example/new"}' } }
        if ($key -like 'run list *') { return [pscustomobject]@{ ExitCode = 0; Output = "[{`"databaseId`":11,`"displayTitle`":`"Admin Publish 20260818-104820-645bd9e1`",`"createdAt`":`"$listedRunCreatedAt`",`"status`":`"queued`",`"conclusion`":`"`",`"url`":`"https://example/new`"}]" } }
        if ($key -eq 'api --hostname github.com --method DELETE repos/ChenYinuo-Enoch/flying-intelligence-preview/git/refs/heads/admin-staging/20260818-104820-645bd9e1') {
            $remoteState.StagingExists = $false
            return [pscustomobject]@{ ExitCode = 0; Output = '' }
        }
        throw "Unexpected gh call: $key"
    }

    $context = Get-AdminGitHubContext
    Assert-Equal $context.GitHubUser 'ChenYinuo-Enoch' 'GitHub user'
    Assert-Equal $context.MainSha $sha 'Remote main SHA'
    $beforeWrites = @($calls | Where-Object { $_.Key -match '--method (POST|PUT|DELETE)|workflow run' }).Count
    $dryRunResult = Test-AdminPublishPreflight -Package $package -GitHubContext $context
    Assert-Equal $dryRunResult.StagingBranch 'admin-staging/20260818-104820-645bd9e1' 'Dry Run staging branch'
    $afterWrites = @($calls | Where-Object { $_.Key -match '--method (POST|PUT|DELETE)|workflow run' }).Count
    Assert-Equal $afterWrites $beforeWrites 'Dry Run remote write count'

    $staging = New-AdminRemoteStaging -PackagePath $resolved -Package $package -CurrentMainSha $context.MainSha
    Assert-Equal $staging.Branch 'admin-staging/20260818-104820-645bd9e1' 'Remote staging branch'
    Assert-Equal (($remoteState.UploadedContent | ConvertFrom-Json).updateId) $package.updateId 'Uploaded package update ID'
    Assert-Equal @($calls | Where-Object { $_.Key -like 'api --hostname github.com --method POST *' }).Count 1 'Create ref request count'
    Assert-Equal @($calls | Where-Object { $_.Key -like 'api --hostname github.com --method PUT *' }).Count 1 'Upload request count'
    Assert-Throws { Test-AdminPublishPreflight -Package $package -GitHubContext $context } 'STAGING_BRANCH_EXISTS'

    $publishDispatch = Start-AdminPublishWorkflow -UpdateId $package.updateId -StagingCommitSha $staging.CommitSha
    Assert-Equal $publishDispatch.ExpectedTitle 'Admin Publish 20260818-104820-645bd9e1' 'Publish run title'
    if (@($calls | Where-Object { $_.Key -match 'workflow run admin-publish\.yml.*--repo github\.com/ChenYinuo-Enoch/flying-intelligence-preview.*staging_branch=admin-staging/20260818-104820-645bd9e1.*update_id=20260818-104820-645bd9e1.*staging_commit_sha=2222222222222222222222222222222222222222' }).Count -ne 1) {
        throw 'Publish workflow dispatch inputs were not fixed to the update ID.'
    }
    $rollbackDispatch = Start-AdminRollbackWorkflow -ExpectedHeadSha $sha
    Assert-Equal $rollbackDispatch.ExpectedTitle 'Admin Rollback 5db13f0' 'Rollback run title'
    $remoteState.StagingSha = '3333333333333333333333333333333333333333'
    Assert-Throws { Remove-AdminStagingBranch -StagingBranch $staging.Branch -ExpectedCommitSha $staging.CommitSha } 'STAGING_BRANCH_CHANGED'
    Assert-Equal $remoteState.StagingExists $true 'Mutated staging branch preserved'
    $remoteState.StagingSha = $staging.CommitSha
    Remove-AdminStagingBranch -StagingBranch $staging.Branch -ExpectedCommitSha $staging.CommitSha
    Assert-Equal $remoteState.StagingExists $false 'Staging cleanup state'

    $dispatch = [datetime]'2026-08-18T11:00:00Z'
    $runs = @(
        [pscustomobject]@{ databaseId = 10; displayTitle = 'Admin Publish 20260818-104820-645bd9e1'; createdAt = '2026-08-18T10:00:00Z'; url = 'https://example/old' },
        [pscustomobject]@{ databaseId = 11; displayTitle = 'Admin Publish 20260818-104820-645bd9e1'; createdAt = '2026-08-18T11:00:02Z'; url = 'https://example/new' }
    )
    $run = Find-AdminWorkflowRun -Runs $runs -ExpectedTitle 'Admin Publish 20260818-104820-645bd9e1' -DispatchedAt $dispatch
    Assert-Equal $run.databaseId 11 'Exact workflow run correlation'
    $listedRun = Wait-AdminWorkflowRun -Workflow 'admin-publish.yml' -ExpectedTitle 'Admin Publish 20260818-104820-645bd9e1' -DispatchedAt ((Get-Date).ToUniversalTime().AddMinutes(-1)) -TimeoutSeconds 5
    Assert-Equal $listedRun.databaseId 11 'Host-qualified workflow run discovery'
    $watch = Watch-AdminWorkflowRun -Run $run -Operation 'PUBLISH'
    Assert-Equal $watch.Succeeded $false 'Workflow failure is returned for authoritative main verification'
    Assert-Equal $watch.Conclusion 'failure' 'Workflow conclusion comes from run view'
    Assert-Throws { Assert-AdminWorkflowExitCode -ExitCode 1 -Operation 'PUBLISH' -RunId 11 -RunUrl 'https://example/new' } 'PUBLISH_STATUS=FAILED'

    $eligible = [pscustomobject]@{ sha = $sha; message = 'admin: add member "Example"'; parents = @([pscustomobject]@{ sha = '1' * 40 }) }
    Assert-AdminRollbackEligible -Commit $eligible
    Assert-AdminCommitParent -Commit $eligible -ExpectedParentSha ('1' * 40)
    Assert-Throws { Assert-AdminCommitParent -Commit $eligible -ExpectedParentSha ('2' * 40) } 'UNEXPECTED_COMMIT_PARENT'
    Assert-Throws { Assert-AdminRollbackEligible -Commit ([pscustomobject]@{ sha = $sha; message = 'admin: rollback 1234567'; parents = @([pscustomobject]@{ sha = '1' * 40 }) }) } 'ROLLBACK_AVAILABLE=NO'
    Assert-Throws { Assert-AdminRollbackEligible -Commit ([pscustomobject]@{ sha = $sha; message = 'docs: update'; parents = @([pscustomobject]@{ sha = '1' * 40 }) }) } 'ROLLBACK_AVAILABLE=NO'
    Assert-Throws { Assert-AdminRollbackEligible -Commit ([pscustomobject]@{ sha = $sha; message = 'admin: update'; parents = @([pscustomobject]@{}, [pscustomobject]@{}) }) } 'ROLLBACK_AVAILABLE=NO'
    Assert-Throws { Remove-AdminStagingBranch -StagingBranch 'main' -ExpectedCommitSha $sha } 'INVALID_STAGING_BRANCH'

    Set-AdminWebInvoker -Invoker { param([string]$Url) return [pscustomobject]@{ StatusCode = 404; Content = '' } }
    $pending = Wait-AdminPreviewDeployment -ExpectedMainSha $sha -Page 'pages/group.html' -TimeoutSeconds 0
    Assert-Equal $pending.Status 'COMMIT_SUCCESS_PAGES_PENDING' 'Pages pending status'
    Set-AdminWebInvoker -Invoker {
        param([string]$Url)
        if ($Url -match '_preview-build\.json') { return [pscustomobject]@{ StatusCode = 200; Content = "{`"mainSha`":`"$sha`"}" } }
        return [pscustomobject]@{ StatusCode = 200; Content = '<!doctype html>' }
    }
    $deployed = Wait-AdminPreviewDeployment -ExpectedMainSha $sha -Page 'pages/group.html' -TimeoutSeconds 0
    Assert-Equal $deployed.Status 'DEPLOYED' 'Pages deployed status'

    Set-AdminGhInvoker -Invoker {
        param([string[]]$Arguments, [string]$InputPath, [bool]$PassThru)
        if (($Arguments -join ' ') -eq 'auth status --active --hostname github.com') { return [pscustomobject]@{ ExitCode = 0; Output = '' } }
        if (($Arguments -join ' ') -eq 'api --hostname github.com user') { return [pscustomobject]@{ ExitCode = 0; Output = '{"login":"wrong-user"}' } }
        throw 'Unexpected call after wrong user response.'
    }
    Assert-Throws { Get-AdminGitHubContext } 'WRONG_GITHUB_USER'

    Set-AdminGhInvoker -Invoker {
        param([string[]]$Arguments, [string]$InputPath, [bool]$PassThru)
        $key = $Arguments -join ' '
        if ($key -eq 'auth status --active --hostname github.com') { return [pscustomobject]@{ ExitCode = 0; Output = '' } }
        if ($key -eq 'api --hostname github.com user') { return [pscustomobject]@{ ExitCode = 0; Output = '{"login":"ChenYinuo-Enoch"}' } }
        if ($key -eq 'api --hostname github.com repos/ChenYinuo-Enoch/flying-intelligence-preview') { return [pscustomobject]@{ ExitCode = 0; Output = '{"full_name":"ChenYinuo-Enoch/flying-intelligence-preview","permissions":{"push":false}}' } }
        throw 'Unexpected call after permission response.'
    }
    Assert-Throws { Get-AdminGitHubContext } 'REPOSITORY_WRITE_PERMISSION_REQUIRED'

    $previousGhToken = [Environment]::GetEnvironmentVariable('GH_TOKEN')
    try {
        [Environment]::SetEnvironmentVariable('GH_TOKEN', 'forbidden-test-token')
        Assert-Throws { Get-AdminGitHubContext } 'GITHUB_TOKEN_ENVIRONMENT_FORBIDDEN'
    }
    finally { [Environment]::SetEnvironmentVariable('GH_TOKEN', $previousGhToken) }

    Write-Output 'UNICODE_PATH=PASS'
    Write-Output 'SPACE_PATH=PASS'
    Write-Output 'WINDOWS_DOWNLOADS_KNOWN_FOLDER=PASS'
    Write-Output 'PACKAGE_DISCOVERY=PASS'
    Write-Output 'INVALID_PACKAGE_REJECTED=PASS'
    Write-Output 'REMOTE_STAGING_API_TEST=PASS'
    Write-Output 'DRY_RUN_REMOTE_WRITES=0'
    Write-Output 'WORKFLOW_CORRELATION=PASS'
    Write-Output 'ROLLBACK_GUARDS=PASS'
    Write-Output 'PAGES_PENDING_HANDLING=PASS'
    Write-Output 'IDENTITY_PERMISSION_GUARDS=PASS'
}
finally {
    Reset-AdminGhInvoker
    Reset-AdminWebInvoker
    if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}
