# Secure Admin Publish and Rollback Design

## Scope and safety boundary

This change extends the verified Preview site without changing its public academic content or visual system, except for the requested `Former Members` section. All repository writes are hard-locked in server code to:

- owner: `ChenYinuo-Enoch`
- repository: `flying-intelligence-preview`
- branch: `main`

The upstream `Flying-Intelligence/flying-intelligence.github.io` repository is never a write target. The browser cannot supply or override the owner, repository, branch, or data-file path.

## Architecture

The browser keeps the existing Admin forms and preview experience. Authentication and every remote write move to a Cloudflare Worker:

1. The browser submits the visible account label and password to `POST /auth/login`.
2. The Worker maps the fixed label `flying-admin` to the secret `ADMIN_FIREBASE_EMAIL`, calls Firebase Email/Password REST authentication, and accepts the result only when `localId` exactly matches secret `ADMIN_FIREBASE_UID`.
3. The Worker returns a short-lived HMAC-SHA-256 session token. The browser stores only this token in `sessionStorage` and sends it as a Bearer token.
4. `GET /state` reads the exact current `main` ref and the two source files through GitHub's REST API.
5. `POST /publish` validates a strict payload, re-reads `main`, checks optimistic concurrency against `baseCommitSha`, validates and generates the requested files, then creates blobs/tree/commit and fast-forwards `main` with `force: false`.
6. `POST /rollback` is allowed only when current `main` is the latest Worker-authored publish commit. It creates a new commit whose tree matches the publish commit's parent and fast-forwards `main`; it never rewrites history.

The Worker uses only Web APIs and does not require Firebase Functions, Blaze, a database, or a paid Cloudflare feature.

## Content model

Every existing member receives only `status: "current"`. The server accepts only `current` or `former`.

- Existing advisor/year groupings remain unchanged for current members.
- Former members render after all current sections and only when at least one member is former.
- `status` is independent of `type` and `year`.
- A member cannot be published as former while their time text contains `present` (case-insensitive). The server does not invent an end date.
- Manage Members exposes only Status and Time for existing records; it does not add delete or arbitrary edit behavior.

## Validation and security controls

- Exact CORS allowlist: Preview Pages plus the two approved port-8127 loopback origins. No wildcard.
- Strict methods, content type, body-size limits, JSON object schemas, and unknown-field rejection.
- Short-lived signed sessions, constant-time signature comparison, expiry checks, and no client-side authorization flag.
- Server-side author markup allowlist; safe URL/path checks; text length limits.
- Images limited to JPG/PNG/WebP, five MB, matching extension/MIME and binary signature; SVG/HTML/JS rejected.
- GitHub credential, Firebase email/UID, and HMAC secret live only in Worker secrets.
- Git writes use a base tree and one commit per Admin update. Ref update always uses `force: false`.
- A stale base produces HTTP 409 and requires reloading current data.
- Commit messages contain a dedicated Worker marker used by the rollback gate.
- Responses and logs omit passwords, Firebase tokens, GitHub tokens, and secret values.

## Browser behavior

The existing `Validate & Preview` and `Preview Update` steps remain. After preview approval, `Publish Update` requires confirmation, disables while pending, and reports the new short commit SHA. Rollback shows the eligible last Admin publish and requires confirmation. A state refresh after publish/rollback updates the base commit and member list.

The client-side SHA gate is no longer loaded or accepted for authorization. Existing Simple Auth source can remain for historical comparison, but it has no runtime write authority.

## Deployment and staged acceptance

Wrangler is pinned as a local development dependency under `admin-worker/`. Secrets are entered interactively by the user with `wrangler secret put`; they are never supplied in chat or written to committed files. Implementation is first committed and pushed only to the feature branch. `main` promotion and real publish/rollback tests occur only after the user's explicit later approvals.

## Verification

Automated tests cover sessions, CORS, Firebase UID enforcement, strict schemas, content validation, optimistic concurrency, atomic Git object writes, target locking, rollback eligibility, and member status rendering/serialization. Static-site regressions verify page/content counts, links/assets, duplicate IDs, and JavaScript syntax. Browser verification covers Admin sign-in states, preview, Manage Members, keyboard interaction, responsive layouts, and public Group rendering.

