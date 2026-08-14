# Secure administrator setup

The administrator UI is intentionally inactive until a verified Firebase project is connected. Do not add passwords, administrator UIDs, or repository credentials to browser files.

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
