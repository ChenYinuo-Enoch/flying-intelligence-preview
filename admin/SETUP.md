# Flying Intelligence Admin setup

## Access model

The configured `flying-admin` password hash is a client-side convenience gate only. It is not the publishing security boundary. Publishing requires a locally authenticated GitHub CLI account with write access to `ChenYinuo-Enoch/flying-intelligence-preview` and an explicit PowerShell confirmation.

Never store or enter a GitHub PAT, repository token, Firebase credential, Cloudflare credential, or plaintext Admin password in this repository or in the browser Admin.

## Preview and package flow

1. Open `/admin/`, sign in, and prepare Add Publication, Add Member, or Manage Members content.
2. Select `Validate & Preview`, then `Preview Update`.
3. Select `Prepare GitHub Publish` and download the JSON package.
4. From the repository root, run `.\Publish-Admin-Update.ps1`.
5. Review the fixed target and update summary, then enter `Y`. The script stages the package through the GitHub API, runs the trusted workflow, waits for it, and verifies Preview Pages.

Downloading a package does not publish it. Do **not** create a Pull Request for an `admin-staging/*` branch. Use `.\Publish-Admin-Update.ps1 -DryRun` to validate the package and GitHub access without any remote write.

## Fixed publishing target

- Owner: `ChenYinuo-Enoch`
- Repository: `flying-intelligence-preview`
- Branch: `main`
- Staging prefix: `admin-staging/`

The scripts and workflows reject any other user, repository, main target, package type, or changed path. The formal `Flying-Intelligence/flying-intelligence.github.io` repository is read-only and is never a publishing target.

## Supported updates

- `add_member`
- `add_publication`
- `member_status` (`current` or `former`)

Images must be JPG, PNG, or WebP and at most 5 MiB. A Former member cannot retain `present` in the Time field. Delete Member, arbitrary file updates, raw patches, and shell commands are unsupported.

## Rollback

Run `.\Rollback-Admin-Update.ps1` to inspect and confirm rollback of the latest eligible Admin commit. The script dispatches and waits for the trusted rollback workflow. Rollback creates a new `admin: rollback ...` revert commit; it never resets or force-pushes history. Use `-DryRun` to check eligibility without a remote write.

The legacy `functions/` and Firebase configuration files remain in repository history and are not used by this GitHub-only Admin runtime.
