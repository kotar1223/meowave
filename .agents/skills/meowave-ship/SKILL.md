---
name: meowave-ship
description: Use when a batch of Meowave work is ready to hand over — commit, push to the private beta repository, update PR #1 and the brain/ notes, then explain to the owner how to update.
---

# Shipping a Meowave beta round

1. **Checks green**: `meowave-rust-check` (if Rust changed), `meowave-ui-verify` (if UI changed).
2. **Brain** (`brain/`, Russian): add the request with statuses to `Log/Requests.md`, the work to `Log/Worklog.md`, decisions to `Decisions.md`, limitations to `Known issues.md`, feature notes under `Features/` and links in `Home.md`.
3. **Commit** with explicit paths (`git add <files>`), never `src/_t/`, never secrets. New files must be added explicitly too.
4. **Push** branch `beta-redesign` to `kotar1223/meowave-beta` (and `main` when the owner asks for both). Since round 8 the owner wants the token kept, not deleted after the push: it lives outside the repository in a private file (mode 600) read by a git credential helper. It never goes into the repo, the brain, a commit message or a chat reply; the owner revokes it when he decides to. Workflow files (`.github/workflows/`) need a token with the Workflows permission — leave them alone otherwise.
5. **PR #1**: update the body (Russian): what changed, how to check, what the owner must do (for example a new SQL migration in Supabase).
6. **Tell the owner** how to update locally: `git pull` (or `git checkout -f -B beta-redesign origin/beta-redesign` if the branch is detached from origin), then `npm install` if dependencies changed, then `npm run dev`.
