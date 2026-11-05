---
name: meowave-ship
description: Use when a batch of Meowave work is ready to hand over — commit, push to the private beta repository, update PR #1 and the brain/ notes, then explain to the owner how to update.
---

# Shipping a Meowave beta round

1. **Checks green**: `meowave-rust-check` (if Rust changed), `meowave-ui-verify` (if UI changed).
2. **Brain** (`brain/`, Russian): add the request with statuses to `Log/Requests.md`, the work to `Log/Worklog.md`, decisions to `Decisions.md`, limitations to `Known issues.md`, feature notes under `Features/` and links in `Home.md`.
3. **Commit** with explicit paths (`git add <files>`), never `src/_t/`, never secrets. New files must be added explicitly too.
4. **Push** branch `beta-redesign` to `kotar1223/meowave-beta` (and `main` when the owner asks for both). Since round 8 the owner wants the token kept, not deleted after the push: it lives outside the repository in a private file (mode 600) read by a git credential helper. It never goes into the repo, the brain, a commit message or a chat reply; the owner revokes it when he decides to. Workflow files (`.github/workflows/`) need a token with the Workflows permission — leave them alone otherwise.
5. **CI**: wait for the run of the pushed commit (`GET /repos/kotar1223/meowave-beta/actions/runs?head_sha=<sha>`). A commit pushed to several branches is tested once: the `gate` job in `ci.yml` skips the jobs when an earlier run for the same commit passed or is still running, so a run with skipped jobs points at that earlier run for the result. Commits that only touch `brain/**` or `*.md` start no CI at all. If every job fails within seconds with no steps and no runner, the private repository's Actions minutes are used up (it happened on 2026-11-05, see `brain/Known issues.md`): run the same checks locally, say so in the report, and do not wait for CI.
6. **PR #1**: update the body (Russian): what changed, how to check, what the owner must do (for example a new SQL migration in Supabase).
7. **Tell the owner** how to update locally: the update button in Settings → About (git pull, then the interface build, then `tauri dev` restarts the window), or by hand `git pull` (or `git checkout -f -B beta-redesign origin/beta-redesign` if the branch is detached from origin), then `npm run dev`. Both install changed dependencies themselves (`scripts/web.mjs --install`: `npm install --no-save` when package-lock.json changed), so `npm install` is only needed when that fails (no network). Node.js 20.19+ or 22.12+ is required.
