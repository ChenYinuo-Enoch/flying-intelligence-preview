# One-command GitHub-only Admin publishing implementation plan

1. Preserve the verified `origin/main` with a pushed backup and work only in the isolated feature worktree.
2. Add failing PowerShell and Node regression tests for package selection, Unicode paths, GitHub API staging, workflow correlation, rollback eligibility, fixed-target safety, and simplified Admin instructions.
3. Add the shared PowerShell implementation with fixed repository constants, fail-fast `gh` calls, existing-validator reuse, remote staging, workflow wait, Pages checks, and cleanup guards.
4. Add root Publish and Rollback commands and convert the old staging helper to the shared remote implementation.
5. Add `update_id` and deterministic run names to the workflows without weakening existing publish/rollback guards.
6. Simplify only the Admin publish instructions and command copy text.
7. Run the full Node/PowerShell suite, Unicode fixture tests, real-package Dry Run, YAML parsing, public regressions, diff checks, and secret scan.
8. Commit and push only the feature branch, then stop for the user's Dry Run verification.
