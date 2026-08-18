Set-StrictMode -Version Latest

$script:AdminTargetOwner = 'ChenYinuo-Enoch'
$script:AdminTargetRepo = 'flying-intelligence-preview'
$script:AdminTargetBranch = 'main'
$script:AdminTargetRepository = 'ChenYinuo-Enoch/flying-intelligence-preview'
$script:AdminGhRepository = 'github.com/ChenYinuo-Enoch/flying-intelligence-preview'
$script:AdminPreviewSite = 'https://chenyinuo-enoch.github.io/flying-intelligence-preview/'
$script:AdminAllowedUpdateTypes = @('add_member', 'add_publication', 'member_status')
$script:AdminGhInvoker = $null
$script:AdminWebInvoker = $null

function Set-AdminGhInvoker {
    param([Parameter(Mandatory = $true)][scriptblock]$Invoker)
    $script:AdminGhInvoker = $Invoker
}

function Reset-AdminGhInvoker { $script:AdminGhInvoker = $null }

function Set-AdminWebInvoker {
    param([Parameter(Mandatory = $true)][scriptblock]$Invoker)
    $script:AdminWebInvoker = $Invoker
}

function Reset-AdminWebInvoker { $script:AdminWebInvoker = $null }

function Get-AdminPinnedApiArguments {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    if ($Arguments.Count -eq 0 -or $Arguments[0] -cne 'api') { throw 'GITHUB_API_ARGUMENTS_INVALID' }
    return @('api', '--hostname', 'github.com') + @($Arguments | Select-Object -Skip 1)
}

function Assert-AdminGhAuthentication {
    foreach ($name in @('GH_TOKEN', 'GITHUB_TOKEN')) {
        if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
            throw "GITHUB_TOKEN_ENVIRONMENT_FORBIDDEN: $name"
        }
    }
    $result = Invoke-AdminGhCommand -Arguments @('auth', 'status', '--active', '--hostname', 'github.com')
    Assert-AdminGhSuccess -Result $result -FailureCode 'GITHUB_CLI_NOT_AUTHENTICATED'
}

function Invoke-AdminGhCommand {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$InputPath = '',
        [switch]$PassThru
    )

    if ($null -ne $script:AdminGhInvoker) {
        $mockResult = & $script:AdminGhInvoker $Arguments $InputPath ([bool]$PassThru)
        if ($null -eq $mockResult -or $null -eq $mockResult.ExitCode) { throw 'GH_TEST_INVOKER_INVALID_RESULT' }
        return $mockResult
    }

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GITHUB_CLI_NOT_FOUND' }

    $nativeArguments = [Collections.Generic.List[string]]::new()
    foreach ($argument in $Arguments) {
        if ($argument -ceq '--input-file') {
            if (-not $InputPath) { throw 'GH_INPUT_FILE_MISSING' }
            $nativeArguments.Add('--input')
            $nativeArguments.Add($InputPath)
        }
        else { $nativeArguments.Add($argument) }
    }

    $previousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        if ($PassThru) {
            & gh @nativeArguments 2>&1 | ForEach-Object { Write-Host ([string]$_) }
            $exitCode = $LASTEXITCODE
            $output = @()
        }
        else {
            $output = @(& gh @nativeArguments 2>&1)
            $exitCode = $LASTEXITCODE
        }
    }
    finally { $ErrorActionPreference = $previousErrorAction }

    return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Assert-AdminGhSuccess {
    param(
        [Parameter(Mandatory = $true)]$Result,
        [Parameter(Mandatory = $true)][string]$FailureCode
    )
    if ([int]$Result.ExitCode -ne 0) {
        $detail = (@($Result.Output) | ForEach-Object { [string]$_ }) -join "`n"
        if ($detail) { throw "$FailureCode`n$detail" }
        throw $FailureCode
    }
}

function ConvertFrom-AdminGhCommandJson {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$FailureCode
    )
    $result = Invoke-AdminGhCommand -Arguments $Arguments
    Assert-AdminGhSuccess -Result $result -FailureCode $FailureCode
    $text = (@($result.Output) | ForEach-Object { [string]$_ }) -join "`n"
    if (-not $text) { throw "$FailureCode`nGitHub returned an empty response." }
    try { return $text | ConvertFrom-Json }
    catch { throw "$FailureCode`nGitHub returned invalid JSON." }
}

function ConvertFrom-AdminGhJson {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$FailureCode
    )
    return ConvertFrom-AdminGhCommandJson -Arguments (Get-AdminPinnedApiArguments -Arguments $Arguments) -FailureCode $FailureCode
}

function Invoke-AdminGhJsonRequest {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('POST', 'PUT')][string]$Method,
        [Parameter(Mandatory = $true)][string]$Endpoint,
        [Parameter(Mandatory = $true)]$Body,
        [Parameter(Mandatory = $true)][string]$FailureCode
    )
    $inputPath = [IO.Path]::GetTempFileName()
    try {
        $json = $Body | ConvertTo-Json -Depth 100 -Compress
        [IO.File]::WriteAllText($inputPath, $json, [Text.UTF8Encoding]::new($false))
        $result = Invoke-AdminGhCommand -Arguments @('api', '--hostname', 'github.com', '--method', $Method, $Endpoint, '--input-file') -InputPath $inputPath
        Assert-AdminGhSuccess -Result $result -FailureCode $FailureCode
        $text = (@($result.Output) | ForEach-Object { [string]$_ }) -join "`n"
        if (-not $text) { return $null }
        try { return $text | ConvertFrom-Json }
        catch { throw "$FailureCode`nGitHub returned invalid JSON." }
    }
    finally {
        if (Test-Path -LiteralPath $inputPath) { Remove-Item -LiteralPath $inputPath -Force }
    }
}

function Invoke-AdminGhDelete {
    param(
        [Parameter(Mandatory = $true)][string]$Endpoint,
        [Parameter(Mandatory = $true)][string]$FailureCode
    )
    $result = Invoke-AdminGhCommand -Arguments @('api', '--hostname', 'github.com', '--method', 'DELETE', $Endpoint)
    Assert-AdminGhSuccess -Result $result -FailureCode $FailureCode
}

function Resolve-AdminPackagePath {
    param([Parameter(Mandatory = $true)][string]$PackagePath)
    $resolved = Resolve-Path -LiteralPath $PackagePath -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $resolved.Path -PathType Leaf)) { throw 'PACKAGE_FILE_NOT_FOUND' }
    return [IO.Path]::GetFullPath($resolved.Path)
}

function Get-AdminDownloadsPath {
    $knownFolder = $null
    try {
        $properties = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction Stop
        $knownFolder = [string]$properties.'{374DE290-123F-4565-9164-39C4925E467B}'
    }
    catch { $knownFolder = $null }
    if ($knownFolder) {
        $expanded = [Environment]::ExpandEnvironmentVariables($knownFolder)
        if (Test-Path -LiteralPath $expanded -PathType Container) { return [IO.Path]::GetFullPath($expanded) }
    }
    $fallback = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
    if (-not (Test-Path -LiteralPath $fallback -PathType Container)) { throw 'DOWNLOADS_FOLDER_NOT_FOUND' }
    return [IO.Path]::GetFullPath($fallback)
}

function Get-AdminPackageCandidates {
    param([string]$DownloadsPath = '')
    $folder = if ($DownloadsPath) { (Resolve-Path -LiteralPath $DownloadsPath -ErrorAction Stop).Path } else { Get-AdminDownloadsPath }
    return @(Get-ChildItem -LiteralPath $folder -Filter 'flying-admin-update-*.json' -File |
        Sort-Object -Property LastWriteTimeUtc -Descending)
}

function Select-AdminPackagePath {
    param([string]$PackagePath = '')
    if ($PackagePath) { return Resolve-AdminPackagePath -PackagePath $PackagePath }
    $candidates = @(Get-AdminPackageCandidates)
    if ($candidates.Count -eq 0) { throw 'PUBLISH_PACKAGE_NOT_FOUND' }
    if ($candidates.Count -eq 1) { return $candidates[0].FullName }

    Write-Host 'Multiple publish packages were found. The newest is selected by default.'
    for ($index = 0; $index -lt $candidates.Count; $index += 1) {
        Write-Host ('[{0}] {1}  {2}' -f ($index + 1), $candidates[$index].Name, $candidates[$index].LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
    }
    $selection = Read-Host 'Select package [1]'
    if (-not $selection) { $selection = '1' }
    $number = 0
    if (-not [int]::TryParse($selection, [ref]$number) -or $number -lt 1 -or $number -gt $candidates.Count) { throw 'INVALID_PACKAGE_SELECTION' }
    return $candidates[$number - 1].FullName
}

function Read-AdminPublishPackage {
    param([Parameter(Mandatory = $true)][string]$PackagePath)
    $resolved = Resolve-AdminPackagePath -PackagePath $PackagePath
    try {
        $text = [IO.File]::ReadAllText($resolved, [Text.Encoding]::UTF8)
        return $text | ConvertFrom-Json
    }
    catch { throw "INVALID_PACKAGE_JSON`n$($_.Exception.Message)" }
}

function Assert-AdminPackageEnvelope {
    param([Parameter(Mandatory = $true)]$Package)
    $names = @($Package.PSObject.Properties.Name)
    foreach ($required in @('schemaVersion', 'updateId', 'updateType', 'createdAt', 'baseCommitSha', 'targetEnvironment', 'previewSite', 'content')) {
        if ($names -notcontains $required) { throw "MISSING_PACKAGE_FIELD: $required" }
    }
    if ($Package.schemaVersion -ne 1) { throw 'UNSUPPORTED_PACKAGE_SCHEMA' }
    if ([string]$Package.updateId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{7,79}$') { throw 'INVALID_UPDATE_ID' }
    if ([string]$Package.updateType -cnotin $script:AdminAllowedUpdateTypes) { throw 'UNSUPPORTED_UPDATE_TYPE' }
    if ([string]$Package.targetEnvironment -cne 'preview') { throw 'INVALID_TARGET_ENVIRONMENT' }
    if ([string]$Package.previewSite -cne $script:AdminPreviewSite) { throw 'INVALID_PREVIEW_SITE' }
    if ($null -eq $Package.content) { throw 'MISSING_PACKAGE_CONTENT' }
    if ([string]$Package.baseCommitSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_BASE_COMMIT_SHA' }
    foreach ($blocked in @('targetOwner', 'targetRepo', 'targetBranch')) {
        if ($names -contains $blocked) { throw "REMOTE_TARGET_FIELD_FORBIDDEN: $blocked" }
    }
}

function Assert-AdminTrustedPackage {
    param([Parameter(Mandatory = $true)][string]$PackagePath)
    $repositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
    $validator = Join-Path $repositoryRoot 'scripts\validate-admin-package.mjs'
    if (-not (Test-Path -LiteralPath $validator -PathType Leaf)) { throw 'TRUSTED_PACKAGE_VALIDATOR_NOT_FOUND' }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'NODE_RUNTIME_NOT_FOUND' }
    $previousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& node $validator --package (Resolve-AdminPackagePath -PackagePath $PackagePath) 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousErrorAction }
    if ($exitCode -ne 0) {
        $detail = ($output | ForEach-Object { [string]$_ }) -join "`n"
        throw "PACKAGE_VALIDATION_FAILED`n$detail"
    }
}

function Assert-FreshAdminPackage {
    param(
        [Parameter(Mandatory = $true)][string]$BaseCommitSha,
        [Parameter(Mandatory = $true)][string]$CurrentMainSha
    )
    if ($CurrentMainSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_CURRENT_MAIN_SHA' }
    if ($BaseCommitSha -cne $CurrentMainSha) {
        throw "STALE_PACKAGE`nThe website changed after this package was prepared.`nPlease refresh Admin and prepare a new publish package."
    }
}

function Get-AdminStagingBranch {
    param([Parameter(Mandatory = $true)][string]$UpdateId)
    $branch = "admin-staging/$UpdateId"
    if ($branch -notmatch '^admin-staging/[A-Za-z0-9._-]+$') { throw 'INVALID_STAGING_BRANCH' }
    return $branch
}

function Get-AdminUpdateSummary {
    param([Parameter(Mandatory = $true)]$Package)
    switch ([string]$Package.updateType) {
        'add_member' { return [pscustomobject]@{ Type = 'Add Member'; Subject = [string]$Package.content.draft.name; Page = 'pages/group.html' } }
        'add_publication' { return [pscustomobject]@{ Type = 'Add Publication'; Subject = [string]$Package.content.draft.title; Page = 'pages/publication.html' } }
        'member_status' {
            $status = (Get-Culture).TextInfo.ToTitleCase(([string]$Package.content.status).ToLowerInvariant())
            return [pscustomobject]@{ Type = 'Member Status'; Subject = "$($Package.content.id) -> $status"; Page = 'pages/group.html' }
        }
        default { throw 'UNSUPPORTED_UPDATE_TYPE' }
    }
}

function Get-AdminGitHubContext {
    Assert-AdminGhAuthentication
    $user = ConvertFrom-AdminGhJson -Arguments @('api', 'user') -FailureCode 'GITHUB_IDENTITY_UNAVAILABLE'
    if ([string]$user.login -cne $script:AdminTargetOwner) { throw "WRONG_GITHUB_USER: expected $($script:AdminTargetOwner)." }
    $repository = ConvertFrom-AdminGhJson -Arguments @('api', "repos/$($script:AdminTargetRepository)") -FailureCode 'REPOSITORY_PERMISSION_UNAVAILABLE'
    if ([string]$repository.full_name -cne $script:AdminTargetRepository -or -not [bool]$repository.permissions.push) { throw 'REPOSITORY_WRITE_PERMISSION_REQUIRED' }
    $mainRef = ConvertFrom-AdminGhJson -Arguments @('api', "repos/$($script:AdminTargetRepository)/git/ref/heads/$($script:AdminTargetBranch)") -FailureCode 'REMOTE_MAIN_UNAVAILABLE'
    $mainSha = [string]$mainRef.object.sha
    if ($mainSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_REMOTE_MAIN_SHA' }
    return [pscustomobject]@{ GitHubUser = [string]$user.login; Repository = $script:AdminTargetRepository; Branch = $script:AdminTargetBranch; MainSha = $mainSha }
}

function Get-AdminStagingBranchSha {
    param([Parameter(Mandatory = $true)][string]$StagingBranch)
    if ($StagingBranch -notmatch '^admin-staging/[A-Za-z0-9._-]+$') { throw 'INVALID_STAGING_BRANCH' }
    $updateId = $StagingBranch.Substring('admin-staging/'.Length)
    $refs = ConvertFrom-AdminGhJson -Arguments @('api', "repos/$($script:AdminTargetRepository)/git/matching-refs/heads/admin-staging/$updateId") -FailureCode 'STAGING_BRANCH_CHECK_FAILED'
    $matches = @($refs | Where-Object { [string]$_.ref -ceq "refs/heads/$StagingBranch" })
    if ($matches.Count -eq 0) { return '' }
    if ($matches.Count -ne 1) { throw 'STAGING_BRANCH_CHECK_FAILED' }
    $sha = [string]$matches[0].object.sha
    if ($sha -notmatch '^[a-f0-9]{40}$') { throw 'STAGING_BRANCH_SHA_INVALID' }
    return $sha
}

function Test-AdminStagingBranchExists {
    param([Parameter(Mandatory = $true)][string]$StagingBranch)
    return -not [string]::IsNullOrEmpty((Get-AdminStagingBranchSha -StagingBranch $StagingBranch))
}

function Test-AdminPublishPreflight {
    param([Parameter(Mandatory = $true)]$Package, [Parameter(Mandatory = $true)]$GitHubContext)
    Assert-AdminPackageEnvelope -Package $Package
    Assert-FreshAdminPackage -BaseCommitSha ([string]$Package.baseCommitSha) -CurrentMainSha ([string]$GitHubContext.MainSha)
    $branch = Get-AdminStagingBranch -UpdateId ([string]$Package.updateId)
    if (Test-AdminStagingBranchExists -StagingBranch $branch) { throw "STAGING_BRANCH_EXISTS: $branch" }
    return [pscustomobject]@{ StagingBranch = $branch; MainSha = [string]$GitHubContext.MainSha }
}

function Get-AdminStagedPackage {
    param([Parameter(Mandatory = $true)][string]$CommitSha)
    if ($CommitSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_STAGING_COMMIT_SHA' }
    $encodedRef = [Uri]::EscapeDataString($CommitSha)
    $file = ConvertFrom-AdminGhJson -Arguments @('api', "repos/$($script:AdminTargetRepository)/contents/.admin-staging/update.json?ref=$encodedRef") -FailureCode 'STAGING_PACKAGE_VERIFY_FAILED'
    try {
        $content = ([string]$file.content) -replace '\s', ''
        $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($content))
        return $json | ConvertFrom-Json
    }
    catch { throw 'STAGING_PACKAGE_VERIFY_FAILED' }
}

function Remove-AdminStagingBranch {
    param(
        [Parameter(Mandatory = $true)][string]$StagingBranch,
        [Parameter(Mandatory = $true)][string]$ExpectedCommitSha
    )
    if ($StagingBranch -notmatch '^admin-staging/[A-Za-z0-9._-]+$') { throw 'INVALID_STAGING_BRANCH' }
    if ($ExpectedCommitSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_STAGING_COMMIT_SHA' }
    $actualSha = Get-AdminStagingBranchSha -StagingBranch $StagingBranch
    if (-not $actualSha) { return }
    if ($actualSha -cne $ExpectedCommitSha) { throw 'STAGING_BRANCH_CHANGED' }
    Invoke-AdminGhDelete -Endpoint "repos/$($script:AdminTargetRepository)/git/refs/heads/$StagingBranch" -FailureCode 'STAGING_CLEANUP_FAILED'
}

function New-AdminRemoteStaging {
    param(
        [Parameter(Mandatory = $true)][string]$PackagePath,
        [Parameter(Mandatory = $true)]$Package,
        [Parameter(Mandatory = $true)][string]$CurrentMainSha
    )
    $preflight = Test-AdminPublishPreflight -Package $Package -GitHubContext ([pscustomobject]@{ MainSha = $CurrentMainSha })
    $branch = $preflight.StagingBranch
    $created = $false
    $expectedBranchSha = $CurrentMainSha
    try {
        $null = Invoke-AdminGhJsonRequest -Method POST -Endpoint "repos/$($script:AdminTargetRepository)/git/refs" -Body ([ordered]@{ ref = "refs/heads/$branch"; sha = $CurrentMainSha }) -FailureCode 'STAGING_REF_CREATE_FAILED'
        $created = $true
        $bytes = [IO.File]::ReadAllBytes((Resolve-AdminPackagePath -PackagePath $PackagePath))
        $response = Invoke-AdminGhJsonRequest -Method PUT -Endpoint "repos/$($script:AdminTargetRepository)/contents/.admin-staging/update.json" -Body ([ordered]@{
            message = "admin-stage: $($Package.updateId)"
            content = [Convert]::ToBase64String($bytes)
            branch = $branch
        }) -FailureCode 'STAGING_PACKAGE_UPLOAD_FAILED'
        $stagingCommitSha = [string]$response.commit.sha
        if ($stagingCommitSha -notmatch '^[a-f0-9]{40}$') { throw 'STAGING_COMMIT_SHA_INVALID' }
        $expectedBranchSha = $stagingCommitSha
        if ((Get-AdminStagingBranchSha -StagingBranch $branch) -cne $stagingCommitSha) { throw 'STAGING_REF_VERIFY_FAILED' }
        $staged = Get-AdminStagedPackage -CommitSha $stagingCommitSha
        if ([string]$staged.updateId -cne [string]$Package.updateId -or [string]$staged.baseCommitSha -cne $CurrentMainSha) { throw 'STAGING_PACKAGE_VERIFY_FAILED' }
        return [pscustomobject]@{ Branch = $branch; CommitSha = $stagingCommitSha }
    }
    catch {
        $primary = $_
        if ($created) {
            try { Remove-AdminStagingBranch -StagingBranch $branch -ExpectedCommitSha $expectedBranchSha }
            catch { Write-Warning "STAGING_CLEANUP_FAILED: $branch" }
        }
        throw $primary
    }
}

function Start-AdminPublishWorkflow {
    param(
        [Parameter(Mandatory = $true)][string]$UpdateId,
        [Parameter(Mandatory = $true)][string]$StagingCommitSha
    )
    $branch = Get-AdminStagingBranch -UpdateId $UpdateId
    if ($StagingCommitSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_STAGING_COMMIT_SHA' }
    $dispatchedAt = (Get-Date).ToUniversalTime()
    $result = Invoke-AdminGhCommand -Arguments @('workflow', 'run', 'admin-publish.yml', '--repo', $script:AdminGhRepository, '--ref', 'main', '-f', "staging_branch=$branch", '-f', "update_id=$UpdateId", '-f', "staging_commit_sha=$StagingCommitSha")
    Assert-AdminGhSuccess -Result $result -FailureCode 'PUBLISH_WORKFLOW_DISPATCH_FAILED'
    return [pscustomobject]@{ DispatchedAt = $dispatchedAt; ExpectedTitle = "Admin Publish $UpdateId" }
}

function Start-AdminRollbackWorkflow {
    param([Parameter(Mandatory = $true)][string]$ExpectedHeadSha)
    if ($ExpectedHeadSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_ROLLBACK_SHA' }
    $shortSha = $ExpectedHeadSha.Substring(0, 7)
    $dispatchedAt = (Get-Date).ToUniversalTime()
    $result = Invoke-AdminGhCommand -Arguments @('workflow', 'run', 'admin-rollback.yml', '--repo', $script:AdminGhRepository, '--ref', 'main', '-f', "expected_head_sha=$ExpectedHeadSha", '-f', "rollback_id=$shortSha")
    Assert-AdminGhSuccess -Result $result -FailureCode 'ROLLBACK_WORKFLOW_DISPATCH_FAILED'
    return [pscustomobject]@{ DispatchedAt = $dispatchedAt; ExpectedTitle = "Admin Rollback $shortSha" }
}

function Find-AdminWorkflowRun {
    param(
        [Parameter(Mandatory = $true)]$Runs,
        [Parameter(Mandatory = $true)][string]$ExpectedTitle,
        [Parameter(Mandatory = $true)][datetime]$DispatchedAt
    )
    $minimumTime = $DispatchedAt.ToUniversalTime().AddSeconds(-15)
    $matches = @($Runs | Where-Object {
        [string]$_.displayTitle -ceq $ExpectedTitle -and ([datetime]$_.createdAt).ToUniversalTime() -ge $minimumTime
    } | Sort-Object { [datetime]$_.createdAt } -Descending | Select-Object -First 1)
    if ($matches.Count -eq 0) { return $null }
    return $matches[0]
}

function Wait-AdminWorkflowRun {
    param(
        [Parameter(Mandatory = $true)][string]$Workflow,
        [Parameter(Mandatory = $true)][string]$ExpectedTitle,
        [Parameter(Mandatory = $true)][datetime]$DispatchedAt,
        [int]$TimeoutSeconds = 90
    )
    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)
    while ((Get-Date).ToUniversalTime() -lt $deadline) {
        $runs = ConvertFrom-AdminGhCommandJson -Arguments @('run', 'list', '--repo', $script:AdminGhRepository, '--workflow', $Workflow, '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,displayTitle,createdAt,status,conclusion,url') -FailureCode 'WORKFLOW_RUN_LIST_FAILED'
        $run = Find-AdminWorkflowRun -Runs @($runs) -ExpectedTitle $ExpectedTitle -DispatchedAt $DispatchedAt
        if ($null -ne $run) { return $run }
        Start-Sleep -Seconds 2
    }
    throw "WORKFLOW_RUN_NOT_FOUND`nhttps://github.com/$($script:AdminTargetRepository)/actions"
}

function Assert-AdminWorkflowExitCode {
    param([int]$ExitCode, [string]$Operation, [long]$RunId, [string]$RunUrl)
    if ($ExitCode -ne 0) { throw "$($Operation)_STATUS=FAILED`nRUN_ID=$RunId`nRUN_URL=$RunUrl" }
}

function Watch-AdminWorkflowRun {
    param(
        [Parameter(Mandatory = $true)]$Run,
        [Parameter(Mandatory = $true)][string]$Operation,
        [int]$TimeoutSeconds = 900
    )
    $watchResult = Invoke-AdminGhCommand -Arguments @('run', 'watch', [string]$Run.databaseId, '--repo', $script:AdminGhRepository, '--exit-status') -PassThru
    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)
    $lastReadError = $null
    do {
        try {
            $state = ConvertFrom-AdminGhCommandJson -Arguments @('run', 'view', [string]$Run.databaseId, '--repo', $script:AdminGhRepository, '--json', 'status,conclusion,url') -FailureCode 'WORKFLOW_RUN_VIEW_FAILED'
            $lastReadError = $null
            if ([string]$state.status -ceq 'completed') {
                $succeeded = [string]$state.conclusion -ceq 'success'
                return [pscustomobject]@{
                    Succeeded = $succeeded
                    ExitCode = if ($succeeded) { 0 } else { 1 }
                    Conclusion = [string]$state.conclusion
                    Operation = $Operation
                    RunId = [long]$Run.databaseId
                    RunUrl = if ([string]$state.url) { [string]$state.url } else { [string]$Run.url }
                    WatchExitCode = [int]$watchResult.ExitCode
                }
            }
        }
        catch { $lastReadError = $_ }
        if ($TimeoutSeconds -le 0) { break }
        Start-Sleep -Seconds 3
    } while ((Get-Date).ToUniversalTime() -lt $deadline)
    $detail = if ($null -ne $lastReadError) { "`n$($lastReadError.Exception.Message)" } else { '' }
    throw "WORKFLOW_COMPLETION_UNCONFIRMED`nRUN_ID=$([long]$Run.databaseId)`nRUN_URL=$([string]$Run.url)$detail"
}

function Get-AdminCommit {
    param([Parameter(Mandatory = $true)][string]$Sha)
    if ($Sha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_COMMIT_SHA' }
    $commit = ConvertFrom-AdminGhJson -Arguments @('api', "repos/$($script:AdminTargetRepository)/git/commits/$Sha") -FailureCode 'COMMIT_LOOKUP_FAILED'
    return [pscustomobject]@{ sha = [string]$commit.sha; message = [string]$commit.message; parents = @($commit.parents) }
}

function Assert-AdminCommitParent {
    param(
        [Parameter(Mandatory = $true)]$Commit,
        [Parameter(Mandatory = $true)][string]$ExpectedParentSha
    )
    if ($ExpectedParentSha -notmatch '^[a-f0-9]{40}$') { throw 'INVALID_EXPECTED_PARENT_SHA' }
    $parents = @($Commit.parents)
    if ($parents.Count -ne 1 -or [string]$parents[0].sha -cne $ExpectedParentSha) { throw 'UNEXPECTED_COMMIT_PARENT' }
}

function Assert-AdminRollbackEligible {
    param([Parameter(Mandatory = $true)]$Commit)
    $subject = ([string]$Commit.message -split "`r?`n")[0]
    if (@($Commit.parents).Count -ne 1 -or $subject -cnotmatch '^admin:' -or $subject -cmatch '^admin: rollback') { throw 'ROLLBACK_AVAILABLE=NO' }
}

function Invoke-AdminWebRequest {
    param([Parameter(Mandatory = $true)][string]$Url)
    if ($null -ne $script:AdminWebInvoker) { return & $script:AdminWebInvoker $Url }
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20 -Headers @{ 'Cache-Control' = 'no-cache' }
        return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Content = [string]$response.Content }
    }
    catch { return [pscustomobject]@{ StatusCode = 0; Content = '' } }
}

function Wait-AdminPreviewDeployment {
    param(
        [Parameter(Mandatory = $true)][string]$ExpectedMainSha,
        [Parameter(Mandatory = $true)][string]$Page,
        [int]$TimeoutSeconds = 300
    )
    $deadline = (Get-Date).ToUniversalTime().AddSeconds($TimeoutSeconds)
    do {
        $cacheKey = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $build = Invoke-AdminWebRequest -Url "$($script:AdminPreviewSite)_preview-build.json?admin_check=$cacheKey"
        $pageResult = Invoke-AdminWebRequest -Url "$($script:AdminPreviewSite)${Page}?admin_check=$cacheKey"
        if ($build.StatusCode -eq 200 -and $pageResult.StatusCode -eq 200) {
            try {
                $metadata = $build.Content | ConvertFrom-Json
                if ([string]$metadata.mainSha -ceq $ExpectedMainSha) { return [pscustomobject]@{ Status = 'DEPLOYED'; Website = $script:AdminPreviewSite } }
            }
            catch { }
        }
        if ($TimeoutSeconds -le 0) { break }
        Start-Sleep -Seconds 5
    } while ((Get-Date).ToUniversalTime() -lt $deadline)
    return [pscustomobject]@{ Status = 'COMMIT_SUCCESS_PAGES_PENDING'; Website = $script:AdminPreviewSite }
}

function Confirm-AdminOperation {
    param([Parameter(Mandatory = $true)][string]$Prompt)
    $answer = Read-Host "$Prompt [Y/N]"
    return $answer -match '^(?i:y|yes)$'
}
