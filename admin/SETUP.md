# Flying Intelligence Admin setup

## Access model

The configured `flying-admin` password hash is a client-side convenience gate only. It is not the publishing security boundary. Publishing requires a GitHub account with write access to `ChenYinuo-Enoch/flying-intelligence-preview` and a manual GitHub Actions confirmation.

Never store or enter a GitHub PAT, repository token, Firebase credential, Cloudflare credential, or plaintext Admin password in this repository or in the browser Admin.

## Preview and package flow

1. Open `/admin/`, sign in, and prepare Add Publication, Add Member, or Manage Members content.
2. Select `Validate & Preview`, then `Preview Update`.
3. Select `Prepare GitHub Publish` and download the JSON package.
4. From a clean local checkout whose `origin` is the personal Preview repository, run the displayed `tools/stage-admin-update.ps1` command.
5. Open GitHub Actions and manually run **Admin Publish Preview Update** with the reported staging branch.

Downloading or staging a package does not publish it. Do **not** create a Pull Request for an `admin-staging/*` branch.

## Fixed publishing target

- Owner: `ChenYinuo-Enoch`
- Repository: `flying-intelligence-preview`
- Branch: `main`
- Staging prefix: `admin-staging/`

The staging helper and workflows reject any other user, repository, main target, package type, or changed path. The formal `Flying-Intelligence/flying-intelligence.github.io` repository is read-only and is never a publishing target.

## Supported updates

- `add_member`
- `add_publication`
- `member_status` (`current` or `former`)

Images must be JPG, PNG, or WebP and at most 5 MiB. A Former member cannot retain `present` in the Time field. Delete Member, arbitrary file updates, raw patches, and shell commands are unsupported.

## Rollback

The publish workflow summary reports `ROLLBACK_EXPECTED_SHA`. To roll back, manually run **Admin Rollback Last Update** with that exact SHA. Rollback creates a new `admin: rollback ...` revert commit; it never resets or force-pushes history.

The legacy `functions/` and Firebase configuration files remain in repository history and are not used by this GitHub-only Admin runtime.
