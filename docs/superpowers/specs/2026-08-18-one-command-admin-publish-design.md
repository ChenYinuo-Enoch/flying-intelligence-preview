# One-command GitHub-only Admin publishing design

## Scope

Phase A replaces the manual local-Git staging path with two human-facing PowerShell commands. It does not publish a real update, promote the feature branch to `main`, run a GitHub Actions workflow, or modify public academic content.

The write target is immutable:

- owner: `ChenYinuo-Enoch`
- repository: `flying-intelligence-preview`
- branch: `main`
- staging prefix: `admin-staging/`

The formal `Flying-Intelligence/flying-intelligence.github.io` repository remains read-only.

## Architecture

`Publish-Admin-Update.ps1` discovers or accepts a package, validates it through the existing trusted package validator, verifies the active GitHub CLI account and repository write permission, compares the package base SHA with the live GitHub `main` ref, and asks for explicit confirmation. After confirmation it creates a remote staging ref and one staging commit through the GitHub REST API, binds the workflow to that exact commit SHA, dispatches `admin-publish.yml`, correlates the exact run by update ID and dispatch time, confirms its final state through `gh run view`, verifies the resulting `main` commit lineage and Pages availability, and verifies staging cleanup.

`Rollback-Admin-Update.ps1` verifies that the current live `main` commit is a single-parent, non-rollback `admin:` commit, asks for explicit confirmation, dispatches `admin-rollback.yml`, correlates and watches the exact run, verifies the new rollback commit, and checks Pages availability.

`tools/admin-github-common.ps1` owns the fixed target, GitHub CLI fail-fast wrapper, package discovery and validation, REST staging, workflow correlation, Pages polling, and rollback eligibility. `tools/stage-admin-update.ps1` becomes a compatibility entry point backed by the same remote staging implementation; it no longer creates a local worktree or calls `git -C`.

## Safety and failure behavior

- No owner/repository/branch command-line override exists.
- GitHub authentication comes only from the existing github.com `gh auth` session; token environment variables are rejected without reading or printing their values.
- API and workflow commands are pinned to github.com. Native-command failures are checked before output processing; a disrupted workflow watch is followed by authoritative status polling instead of being misreported as a completed workflow failure.
- Dry Run performs identity, permission, package, live-main, and branch-existence checks only. It never creates a ref, uploads content, dispatches a workflow, or deletes a ref.
- Stale packages, an existing staging ref, the wrong GitHub user, missing write permission, workflow failure, or unexpected commit metadata stop the operation.
- Staging cleanup may delete only the exact `admin-staging/<validated-update-id>` ref while it still points to the verified staging commit.
- Rollback creates a new commit through the existing workflow; no reset or force push is used.

## Windows path handling

Package paths are resolved with `Resolve-Path -LiteralPath` and read with .NET UTF-8 APIs. Downloads discovery uses the Windows Known Folder registry value with a `$HOME\Downloads` fallback. The remote staging operation never passes a repository absolute path to Git and never uses `cmd.exe`.

## User interface

The Admin retains `Prepare GitHub Publish`. Its instructions become two steps: download the package, then run `.\Publish-Admin-Update.ps1`. Rollback help names `.\Rollback-Admin-Update.ps1`. The browser still does not claim to publish directly.

## Verification

Tests cover package discovery, explicit and Unicode paths, multiple packages, invalid/stale packages, fixed account and permission, remote staging API requests, existing refs, Dry Run no-write behavior, workflow run correlation and failure, Pages pending behavior, cleanup constraints, rollback eligibility and workflow behavior, workflow YAML guards, Admin instructions, public content counts, secret scanning, and the complete existing Node/PowerShell suite.
