# GitHub-only Admin publishing implementation plan

1. Preserve the Worker-era WIP on a timestamped backup branch and create an isolated GitHub-only feature branch.
2. Restore the Simple Admin gate and replace remote publish/rollback calls with local package generation, download, copy-command, and GitHub Actions instructions.
3. Keep Manage Members, Current/Former rendering, content validation, and public Group behavior unchanged.
4. Add a trusted Node package validator/applier with fixed update types, derived paths, image checks, duplicate checks, exact diff allowlists, and optimistic concurrency.
5. Add the PowerShell staging helper with fixed identity/origin, temporary-worktree isolation, non-force staging push, and explicit no-PR guidance.
6. Add publish, rollback, and Pages workflows with fixed repository/branch targets, minimal permissions, manual confirmation, single-commit updates, direct Pages deployment, and rollback by revert.
7. Add and run unit, security, PowerShell, workflow, public-content, browser, and responsive regressions.
8. Review the complete diff, remove Worker-only runtime files, commit, and push only the feature branch.
9. Start a verified local preview and stop for `GitHub-only Admin 本地测试通过` before any promotion or live workflow action.
