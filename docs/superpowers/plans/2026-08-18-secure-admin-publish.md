# Secure Admin Publish and Rollback Implementation Plan

> Execute in the isolated worktree on `feature/secure-admin-publish-20260818-160030`. Never write upstream or `main` during this phase. Use test-driven development for every behavior change.

## Task 1: Lock down dependencies and secret hygiene

1. Add `admin-worker/package.json` with exact Wrangler, Workers types, TypeScript, Vitest, and Workers Vitest pool development versions.
2. Add `admin-worker/wrangler.jsonc` with the fixed Worker name, compatibility date, public Firebase metadata, and required secret names only.
3. Extend `.gitignore` for `admin-worker/node_modules/`, `.wrangler/`, `.dev.vars`, `.env`, and local reports.
4. Install from the lockfile and verify `npm audit --omit=dev` has no production dependency surface.
5. Run `npx wrangler whoami`; if unauthenticated, stop at `CLOUDFLARE_LOGIN_REQUIRED` without deploying.

## Task 2: Member status content model

1. Add failing tests for status parsing, serialization, current/former validation, the `present` guard, and exact member source updates.
2. Implement the minimal content helpers in `functions/lib/content.js` and keep existing tests green.
3. Add `status: "current"` to exactly the 13 current member records.
4. Add failing DOM-independent rendering tests for current grouping and conditional Former Members output.
5. Update `js/group-members.js` to render only current records in advisor/year sections and append Former Members when non-empty.
6. Verify unchanged member count and unchanged non-status field snapshots.

## Task 3: Worker session and HTTP boundary

1. Add failing tests for the exact origin allowlist, OPTIONS handling, strict routes/methods, missing secrets, body-size limits, and unknown fields.
2. Add failing tests for HMAC session issue/verify, expiry, tampering, and missing authorization.
3. Implement the smallest Worker HTTP/session modules that pass these tests.
4. Add failing Firebase login tests for fixed account mapping, wrong account, wrong Firebase UID, and secret-safe errors.
5. Implement Firebase Email/Password REST login without returning Firebase tokens to the browser.

## Task 4: Worker GitHub read and atomic write layer

1. Add failing tests proving owner/repository/branch are constants and cannot be overridden.
2. Add failing tests for ref/commit/tree/blob requests, GitHub errors, and secret-safe messages.
3. Implement a dependency-injected GitHub client.
4. Add failing tests for publication/member/member-status publish, path generation, duplicate rejection, stale `baseCommitSha`, and `force: false` ref updates.
5. Implement one-tree/one-commit publication and member updates against the latest base tree.
6. Add failing rollback tests for Worker marker, current-HEAD equality, parent-tree restore, stale HEAD, and second rollback rejection.
7. Implement rollback as a new fast-forward commit.

## Task 5: Secure Admin client integration

1. Add client module tests for Worker URL validation, session token storage, state requests, publish requests, and sign-out.
2. Replace runtime Simple Auth authorization in `admin/admin.js` with the Worker API client while preserving existing forms and previews.
3. Add Manage Members markup and styles with Current/Former lists and editable Status/Time only.
4. Add Publish Update and Rollback controls, confirmation, pending/failure/success states, commit SHA feedback, and reload-on-409 behavior.
5. Remove Simple Auth scripts from `admin/index.html`; do not expose the Worker secrets or Firebase administrator identity.
6. Update `admin/SETUP.md` for Worker secrets and phased deployment.

## Task 6: Full local verification

1. Run Worker unit/integration tests, existing Functions content tests, Admin tests, and JavaScript syntax checks.
2. Run secret scans and confirm no secret value, token, password, or `.dev.vars` file is tracked.
3. Dynamically enumerate public HTML, links, assets, duplicate IDs, paper/member counts, and content snapshots.
4. Start the static site on port 8127 and Worker locally with a user-created untracked `.dev.vars` only after secrets are available.
5. Browser-test Home, Publication, Group, Resource, a Person page, and Admin at required desktop/mobile viewports; inspect console and network failures.

## Task 7: Worker deployment and feature delivery

1. Deploy only `flying-intelligence-preview-admin` on the Cloudflare Workers Free plan after Cloudflare login and all four user-entered secrets are confirmed by name.
2. Record the Worker URL without printing secret values.
3. Set the public Admin Worker endpoint and rerun local production-origin tests.
4. Review `git diff`, `git diff --check`, and staged files; verify no public content drift beyond member statuses and Former Members behavior.
5. Commit using scoped messages, push only the feature branch to origin, and verify the remote SHA.
6. Keep `main` unchanged and pause at `CURRENT_STEP=VERIFY_SECURE_ADMIN_LOCAL` for the user's manual local Admin test.
