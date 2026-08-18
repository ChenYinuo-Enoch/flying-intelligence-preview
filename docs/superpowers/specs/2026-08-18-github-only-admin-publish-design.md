# GitHub-only Admin publishing design

## Scope and boundary

The Preview website remains a static GitHub Pages site. The browser Admin keeps its client-side convenience gate, content forms, previews, member status management, and local validation. It never receives a GitHub credential and never writes to GitHub.

Publishing has two explicit human-controlled steps after preview:

1. Admin exports one public JSON package containing one allowed content update.
2. A repository owner stages that package with the local PowerShell helper and manually runs the trusted GitHub Actions workflow.

Only `ChenYinuo-Enoch/flying-intelligence-preview` and its `main` branch are valid remote targets. The formal `Flying-Intelligence` repository is read-only and is never a workflow target.

## Components

- `admin/publish-package.js` creates schema-versioned packages for `add_member`, `add_publication`, and `member_status`. It includes no credentials and no remote target fields.
- `tools/stage-admin-update.ps1` verifies the GitHub user, origin URL, package shape, staging-branch uniqueness, and current `origin/main`. It uses a temporary worktree and pushes only `.admin-staging/update.json` to `admin-staging/<update-id>`.
- `scripts/lib/admin-update.js` is the trusted package validator and content applier. It reuses the existing content validators and derives all output paths itself.
- `.github/workflows/admin-publish.yml` checks the repository and staging allowlist, reads only the payload from the untrusted staging branch, validates freshness, applies one update, creates one commit, pushes without force, deploys the resulting main tree, and then attempts staging cleanup.
- `.github/workflows/admin-rollback.yml` reverts only the expected latest single-parent `admin:` commit, pushes normally, and deploys the new rollback commit.
- `.github/workflows/pages.yml` deploys ordinary `main` updates through GitHub Actions. Each deployment artifact includes `_preview-build.json` with the deployed main SHA so live Admin packages can bind to their actual source commit.

## Package and update rules

Packages use schema version `1`, target environment `preview`, the fixed Preview URL, a safe update ID, creation time, and the deployed `baseCommitSha`. Local previews may leave the SHA empty; the staging helper binds it to current `origin/main`. A staged package always contains a full SHA, and the publish workflow rejects any mismatch.

Images are limited to valid JPG, PNG, or WebP files up to 5 MiB. The package records the original filename, MIME type, byte length, and Base64 bytes. Output paths are generated from validated member names or paper titles; package input cannot select a repository path.

The apply layer permits only:

- `add_member`: `data/members.js` plus one file under `groups/`
- `add_publication`: `papers-data.js` plus one file under `files/images/`
- `member_status`: `data/members.js`

Workflow, authentication, script, and arbitrary-file edits are rejected.

## Concurrency, rollback, and failure behavior

The staging helper and publish workflow both compare `baseCommitSha` with current `origin/main`. The publish workflow checks again immediately before push; a race fails naturally as non-fast-forward and is never merged or rebased automatically.

One Admin action produces exactly one main commit. Rollback requires an exact expected head SHA and an eligible latest `admin:` commit. It uses `git revert`, producing a new commit and preserving history.

Any validation, identity, origin, repository, path, image, freshness, or race failure stops before a main push. The user's current worktree is not switched or modified by staging.

## Verification

Node tests cover package construction, schema rejection, content validation, image validation, path allowlists, atomic update sets, stale bases, and workflow security declarations. PowerShell tests cover the helper's pure identity/origin/freshness/branch gates. Existing Simple Gate, Admin UI, content, Group Current/Former, Recent Research, path, and public-page regressions remain required.

Phase A ends after the feature branch is pushed and a local Admin preview is available. It does not stage a package, modify `main`, change Pages settings, or run a real publish/rollback workflow.
