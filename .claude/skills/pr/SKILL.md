---
name: pr
description: Create a pull request with standard format from current branch to develop or main
user-invocable: true
disable-model-invocation: true
---

# Create Pull Request

Create a well-formatted pull request for the current branch.

## Step 1: Analyze Context

Run these commands to understand the current state:
1. `git branch --show-current` — identify current branch
2. `git status` — check for uncommitted changes (warn if dirty)
3. `git log --oneline -20` — recent commits on this branch
4. Determine the base branch:
   - If on `develop`: base is `main`
   - If on a feature branch: base is `develop`
   - If unclear, ask the user
5. `git log <base>..HEAD --oneline` — commits that will be in the PR
6. `git diff <base>...HEAD --stat` — files changed summary

## Step 2: Draft PR Content

Based on the commits and diff:

- **Title**: Short (under 70 chars), describes the change (e.g., "Add binder allocation tracking" or "Fix deck stats calculation")
- **Body** using this format:

```markdown
## Summary
- <bullet 1: main change>
- <bullet 2: secondary change if any>
- <bullet 3: if needed>

## Test plan
- [ ] Unit tests pass (`npm run test:unit`)
- [ ] Build succeeds (`npx vite build`)
- [ ] <specific manual test steps relevant to the changes>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Show the draft to the user for approval before creating.

## Step 3: Push if Needed

If the current branch isn't pushed or is behind remote:
- `git push -u origin <branch-name>`

## Step 4: Create PR

Use `gh pr create`:

```bash
gh pr create --base <base-branch> --title "<title>" --body "$(cat <<'EOF'
<body content>
EOF
)"
```

## Step 5: Report

Show the user the PR URL and a brief summary of what was included.
