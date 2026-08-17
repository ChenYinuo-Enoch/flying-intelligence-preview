# Administrator setup

## Simple Admin Mode (current Spark-compatible mode)

The current page uses a **client-side convenience gate, not secure authentication**. The account and SHA-256 password hash are downloaded to every visitor's browser, so a determined visitor can inspect or bypass the gate. This mode does not protect secrets and must never use a password that is reused anywhere else.

1. Choose a unique, non-sensitive password that is used only for this temporary gate.
2. In an interactive terminal at the repository root, run `node tools/generate-admin-password-hash.mjs`. Input is hidden and the tool prints only the SHA-256 hash.
3. Replace `CHANGE_ME` in `admin/simple-auth-config.js` with the chosen account label and generated hash. Never store the plaintext password in this repository.
4. Reload `/admin/`. A successful sign-in stores only `adminUnlocked=true` in `sessionStorage`, so access ends when the browser tab is closed or Sign Out is selected.
5. `Prepare Update` keeps a local text draft on the page matching the current `papers-data.js` or `data/members.js` entry format for manual copy. It does not upload the selected image, edit a file, call GitHub, or publish anything.

This mode keeps the Firebase Web configuration and `functions/` source for a future migration, but it does not load Firebase modules or call `getAdminStatus`/`submitUpdate`.

## Server-backed mode (future)

The existing callable Functions source remains the secure design path. It requires deployment and server-side secrets; do not add administrator UIDs or repository credentials to browser files.

1. Install the Firebase CLI manually, sign in, and confirm the intended project with `firebase projects:list`.
2. Copy `.firebaserc.example` to `.firebaserc` and replace the placeholder with the verified project ID. `.firebaserc` is ignored to prevent accidental project targeting in this open repository.
3. Register a Firebase Web app. Copy its public Web configuration into `admin/firebase-config.js` as the `config` object.
4. In Firebase Authentication, enable Email/Password and create the administrator account in the Firebase console. This site intentionally has no sign-up flow. Enable email-enumeration protection.
5. Record the administrator account UID from Firebase Authentication. At Functions deployment, set `ADMIN_UIDS` to that UID (or a comma-separated server-side allowlist).
6. Set `TARGET_REPOSITORY` to `ChenYinuo-Enoch/flying-intelligence.github.io` and `TARGET_BASE_BRANCH` to the reviewed production base branch. The function rejects any other repository.
7. Create a fine-grained repository credential with access only to the fork and only the permissions needed to read contents, write content branches, and open pull requests. Store it with `firebase functions:secrets:set GITHUB_TOKEN`; never place it in a browser file or ordinary environment file.
8. From the repository root, run `npm --prefix functions install`, then `npm --prefix functions test`.
9. Deploy only the two functions with `firebase deploy --only functions:getAdminStatus,functions:submitUpdate`.
10. Add the GitHub Pages domain and local development domains to Firebase Authentication authorized domains, then verify signed-out, wrong-password, non-administrator, administrator, submit, and sign-out states.

The content function always reads the latest configured base commit, validates the submitted data and image again, creates a separate content branch with one atomic commit, and opens a pull request. It never commits directly to the base branch and never merges a pull request.
