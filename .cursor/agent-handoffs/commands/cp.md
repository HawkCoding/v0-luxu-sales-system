# Commit & Push (Smart Conventional Commit)

**Purpose:** Stage all changes, generate an excellent conventional commit message using AI analysis of the diff, commit, then push to origin. Ready for /pr afterwards.

**Do exactly the following:**

1. **Preconditions**
   - Verify we are in a Git repo: `git rev-parse --is-inside-work-tree`
   - If not, stop with **"Not a git repository."**

2. **Check for changes**
   - Run: `git status --porcelain=v1`
   - If no output: stop with **"Nothing to commit. Working tree clean."**

3. **Stage changes**
   - Run: `git add -A`
   - Output: **"All changes staged."**

4. **Generate smart commit message**
   - Run: `git diff --cached --name-only` and `git diff --cached` (short version) to understand changes
   - Analyze the diff and file types to determine the best conventional commit type:
     - `feat:` for new features
     - `fix:` for bug fixes
     - `refactor:` for code changes that neither fix nor add
     - `chore:`, `docs:`, `style:`, `test:`, `perf:`, `ci:`, etc. as appropriate
   - Generate a **single-line** subject (≤ 72 chars) + optional body
   - Propose:  
     **"Proposed commit message:**  
     `feat: add user login form`  
     (body if needed)"**
   - Ask the user: **"Reply with your own message, edit the one above, or type 'ok' to use it."**

5. **Commit**
   - Once user approves (or provides) the message, run:  
     `git commit -m "<exact message user approved>"`
   - Show the commit hash: `git log -1 --pretty=oneline`

6. **Push**
   - Determine current branch: `git rev-parse --abbrev-ref HEAD`
   - Run: `git push -u origin HEAD`
   - If successful: **"✅ Committed and pushed successfully!"**
   - If first push and it fails due to upstream, it will have set `-u` automatically.

7. **Final message**
   - Print:  
     **"All done!  
     Next step: type /pr to create a high-quality Pull Request."**