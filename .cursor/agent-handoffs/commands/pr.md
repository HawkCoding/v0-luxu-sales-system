# Create PR (Good PR, Uses Template If Present)

**Purpose:** Create a high-quality Pull Request using the repo’s PR template if it exists; otherwise, generate a best-practice PR body with clear sections (Overview, Context, Changes, Tests, Screenshots, Risks, Rollback, Related Issues, Checklist). Assign reviewers, add labels, and link issues. Uses `gh` CLI.

**Do exactly the following:**

1. **Preconditions & tooling**
   - Verify Git is available: `git --version`
   - Verify GitHub CLI is available: `gh --version`
   - Verify you’re authenticated with GitHub: `gh auth status`
   - If not authenticated, stop and output: **"GitHub CLI not authenticated. Run: gh auth login"**

2. **Detect repo & branch state**
   - Ensure we are inside a Git repo; if not, stop with **"Not a git repository."**
   - Determine the current branch: `git rev-parse --abbrev-ref HEAD` (call this `$BRANCH`)
   - If `$BRANCH` equals `main` or `master`, warn: **"You are on $BRANCH. PRs should come from a feature branch."** and continue only if the user replies exactly `ok`
   - Check for uncommitted changes: `git status --porcelain=v1 -z`
     - If there are unstaged/unstashed changes, ask: **"There are local changes. Reply 'stash' to stash, 'commit' to continue after committing, or 'cancel' to abort."**
     - If `stash`, run `git stash -u -m "temp-pr-stash"` and continue
     - If `commit`, stop with **"Please commit and re-run the command."**
     - If `cancel`, stop
   - Check if the branch is ahead/behind remote:
     - Fetch: `git fetch -q`
     - If branch has no upstream, set upstream when pushing in step 3

3. **Push branch if needed**
   - If not pushed: `git push -u origin "$BRANCH"`; on error, stop and report the error
   - If behind remote, prompt: **"Your branch is behind remote. Reply 'merge' to merge main, 'rebase' to rebase on main, or 'skip' to continue."**
     - For `merge`: `git fetch origin main && git merge --no-edit origin/main`
     - For `rebase`: `git fetch origin main && git rebase origin/main`
     - For `skip`: continue

4. **Determine target base branch**
   - Default base is `main` if it exists, else `master`
   - Detect with: `git show-ref --verify --quiet refs/remotes/origin/main` then `refs/remotes/origin/master`
   - Call this `$BASE`

5. **Collect metadata for the PR**
   - Propose a PR title:
     - Prefer the latest conventional commit subject if it exists: `git log -1 --pretty=%s`
     - Else, format from branch name by replacing `-` and `/` with spaces and title-casing (e.g., `feat/user-login` → `feat: user login`)
     - Ask the user: **"Proposed title: '<title>'. Reply with a new title or 'ok' to accept."**
   - Using Conventional Commit recommendation, draft a short, one-line **Overview** derived from recent commits (last 10): `git log --pretty=format:"- %s" -n 10`
   - Detect linked issues in branch or commits (e.g., `ABC-123`, `#123`):
     - Grep branch name and last 20 commit messages for patterns: `#[0-9]+` and `[A-Z]{2,}-[0-9]+`
     - Build a `Relates/Closes` footer suggestion: e.g., `Closes #123` if an issue reference is present
   - Suggest default reviewers and labels:
     - Reviewers (from `CODEOWNERS` if present): look up file `.github/CODEOWNERS`; map to GitHub usernames (strip `@`); de-duplicate
     - Labels: if repo has labels matching `feature`, `bug`, `chore`, `docs`, `refactor`, `ci`, `build`, `perf`, choose based on dominant change type inferred from modified paths (src, tests, docs, ci, etc.). Otherwise, none

6. **Detect and load a PR template (preferred)**
   - Search for templates in this order (first match wins):
     1. `.github/PULL_REQUEST_TEMPLATE.md`
     2. `PULL_REQUEST_TEMPLATE.md` at repo root
     3. `.github/PULL_REQUEST_TEMPLATE/*.md` (if multiple, prefer one named `default.md`; if multiple without a default, choose the first alphabetically)
   - If a template file is found:
     - Use it “as is” as the base PR body (do not modify headings)
     - Prepare a temporary working copy (call it `$BODYFILE`) and append a **Context** block with auto-generated bullet points (Overview, linked issues, etc.) beneath the first heading
   - If no template exists, generate a **best-practice PR body** into `$BODYFILE` with the following markdown sections (keep headings exactly; leave empty subsections out):