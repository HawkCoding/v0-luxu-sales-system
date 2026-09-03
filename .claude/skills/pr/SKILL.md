---
name: pr
description: Stage, commit, push, and open a PR for all current work on this branch — runs lint/typecheck/test:ci first, bumps APP_VERSION if needed, generates commit message and PR body from the diff, and creates the PR against dev via gh. Use when the user says "ship this", "open a PR", "commit and PR", or invokes /pr.
---

Follow the shared project skill at `skills/pr/SKILL.md`.

If this file is loaded directly, use these core rules:

- Never target `main` as the PR base — always `dev`.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test:ci` first; hard-stop on any failure, even in auto-run mode.
- Bump `APP_VERSION` via `pnpm app:version:bump` if code changed and it isn't already bumped this session.
- Stage named files only (never `git add -A`/`.`); exclude `.env*`/secrets.
- One Conventional Commits commit, then `git push -u origin HEAD`, then `gh pr create --base dev` using `.github/pull_request_template.md` (skip only if an **OPEN** PR already exists for the branch — just report its URL; a `MERGED`/`CLOSED` PR is stale and does not get new commits, open a new one).
- Never force-push, skip hooks, or use interactive git flags.
- Nothing to ship → report and stop, don't open an empty PR.
