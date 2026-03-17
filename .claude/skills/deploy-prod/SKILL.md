---
name: deploy-prod
description: Production deployment checklist — verify, merge develop to main, and push
user-invocable: true
disable-model-invocation: true
---

# Deploy to Production

You are deploying to production (`cranial-trading.web.app`) by merging `develop` into `main`.

**This is a production deployment. Follow every step carefully. Stop on any failure.**

## Step 1: Confirm User Intent

Ask the user: "Are you sure you want to deploy to production? This will merge `develop` into `main` and auto-deploy to `cranial-trading.web.app`."

Wait for explicit confirmation before proceeding.

## Step 2: Verify Branch State

Run these checks:
1. `git branch --show-current` — must be on `develop`
2. `git status` — working tree must be clean (no uncommitted changes). If dirty, **STOP** and tell the user to commit or stash first.
3. `git fetch origin` then `git log develop..origin/develop --oneline` — local develop must be up to date with remote

## Step 3: Run Production Checklist

Run each check and report results:

### 3a. Tests Pass
Run `npm run test:unit`. All tests must pass. **STOP** on failure.

### 3b. Build Succeeds
Run `npx vite build`. Must succeed. **STOP** on failure.

### 3c. Version Check
Read `package.json` version. Show it to the user and ask: "Is v{version} the correct version for this production release?"

Wait for confirmation.

### 3d. Dev Verification
Ask the user: "Have you verified these changes work correctly on `cranial-trading-dev.web.app`?"

Wait for explicit confirmation. Do NOT proceed without it.

## Step 4: Merge to Main

```
git checkout main
git pull origin main
git merge develop
```

If there are merge conflicts, **STOP** and report them. Do not attempt to resolve automatically.

## Step 5: Push to Production

Run `git push origin main`.

## Step 6: Return to Develop

Run `git checkout develop` to return to the development branch.

## Step 7: Report

Tell the user:
- Version deployed
- That CI will run and auto-deploy to `cranial-trading.web.app`
- Remind them to monitor the deployment and verify on production