---
name: deploy-dev
description: Run tests, bump version, commit, and push to develop branch for dev deployment
user-invocable: true
disable-model-invocation: true
---

# Deploy to Dev Environment

You are deploying changes to the `develop` branch, which auto-deploys to `cranial-trading-dev.web.app`.

Follow these steps in order. Stop and report if any step fails.

## Step 1: Verify Branch

Run `git branch --show-current` and confirm you are on `develop`. If not, **STOP** and tell the user to switch branches first. Do NOT checkout automatically.

## Step 2: Run Tests

Run `npm run test:unit`. If any tests fail, **STOP** and report the failures. Do not proceed.

## Step 3: Build

Run `npx vite build`. If the build fails, **STOP** and report the error. Do not proceed.

## Step 4: Check for Changes

Run `git status`. If there are no staged or unstaged changes (working tree clean), tell the user there's nothing to deploy and **STOP**.

## Step 5: Bump Version

Ask the user which version bump is needed:
- **patch** (x.y.Z): bug fixes, minor tweaks
- **minor** (x.Y.0): new features, new screens
- **major** (X.0.0): breaking changes

Wait for their answer, then run: `npm version <patch|minor|major> --no-git-tag-version`

## Step 6: Stage and Commit

- Stage all relevant changed files (be specific — don't use `git add -A`)
- Stage the updated `package.json` and `package-lock.json` from the version bump
- Create a commit. Ask the user for a commit message summary, or propose one based on the staged changes
- The commit message should follow the project's existing style (see recent `git log --oneline -10`)

## Step 7: Push

Run `git push origin develop`.

## Step 8: Report

Tell the user:
- What version was deployed (from package.json)
- That it will auto-deploy to `cranial-trading-dev.web.app` once CI passes
- Remind them to verify on the dev environment before deploying to production