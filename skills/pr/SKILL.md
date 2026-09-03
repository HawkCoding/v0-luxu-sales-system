---
name: pr
description: Stage, commit, push, and open a PR for all current work on this branch — runs lint/typecheck/test:ci first, bumps APP_VERSION if needed, generates commit message and PR body from the diff, and creates the PR against dev via gh. Use when the user says "ship this", "open a PR", "commit and PR", or invokes /pr.
---

# pr

Ship all current work on this branch as a PR against `dev` — checks, commit, push, PR — in one invocation.

## Process

1. **Safety check** — run `git status` (never `-uall`). If the current branch is `main`, stop: this skill only ships feature work to `dev`. Promotion from `dev` to `main` is a separate, manual, human-approved step per `CLAUDE.md` PR Workflow — refuse and point the user there.

2. **Branch check** — if the current branch is `dev` (or `main`), create a new branch off it named `feat/<short-slug>`, where the slug is derived from the diff (e.g. dominant changed area or the user's stated intent). Otherwise, use the current branch as-is — don't create a new one just because work is uncommitted.

3. **Pre-flight checks** — run in sequence: `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`. If any fails, stop immediately, show the failing command's output, and do not commit. This is a hard gate — it applies even though the rest of this skill runs without pausing for confirmation.

4. **Version bump** — per `CLAUDE.md` App Versioning: if this invocation is committing code changes and `lib/version.ts` is not already part of the pending diff (i.e. not already bumped this session), run `pnpm app:version:bump`. Skip if `lib/version.ts` already differs from `origin/dev`.

5. **Stage & commit** — review `git status` output and stage the specific changed files that belong to this unit of work (never `git add -A` or `git add .`). Exclude `.env*` and anything that looks like a secret. Generate one Conventional Commits message from `git diff --staged` — infer type (`feat`/`fix`/`refactor`/`chore`/`test`) from the paths and nature of the change; add a body only when the "why" isn't obvious from the diff alone. Commit.

6. **Push** — `git push -u origin HEAD`.

7. **PR** — run `gh pr view --json state,url` for the current branch (or `gh pr list --head <branch> --state all --json number,state,url` if `gh pr view` finds nothing):
   - If a PR exists and its `state` is `OPEN`, the push already updated it — report its URL and stop.
   - If a PR exists but is `MERGED` or `CLOSED`, it is stale — a same-named branch pushed again after merge does NOT reopen or update it. Treat this as "none exists": create a new PR for the new commits.
   - If none exists (or only closed/merged ones do), run `gh pr create --base dev` using `.github/pull_request_template.md` as the body structure: a `## Summary` with 1-3 bullets from the commit(s), and the `## Test plan` checklist with items checked based on which pre-flight checks actually ran and passed. Leave the "CI passed on dev" box unchecked — that's for the dev→main promotion PR only.

8. Report the PR URL as the final output.

## Rules

- Never target `main` as the PR base — always `dev` (per `CLAUDE.md` PR Workflow).
- Never force-push, never skip hooks (`--no-verify`), never use interactive git flags (`-i`).
- Never `git add -A` / `git add .` — stage named files after reviewing `git status`.
- Pre-flight check failure is a hard stop — the one confirmation gate that survives auto-run mode.
- If there's nothing staged/unstaged and no unpushed commits, report "nothing to ship" and stop — don't open an empty PR.
- Never treat a `MERGED`/`CLOSED` PR as the target for new commits — check `state`, not just existence, before deciding to update vs. create.
- Bump `APP_VERSION` at most once per invocation; skip if the diff already touches `lib/version.ts`.
- Use `pnpm`, never `npm`/`yarn`, for any script invocation.
