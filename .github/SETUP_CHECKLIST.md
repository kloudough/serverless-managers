# GitHub Actions Setup Checklist

Use this checklist to set up the CI/CD pipeline for your serverless-managers repository.

---

## ✅ Pre-Commit Checklist

Before pushing to GitHub:

- [ ] All 169 tests passing locally (`npm test`)
- [ ] No uncommitted changes
- [ ] All new files added to git

```bash
npm test                    # Verify all tests pass
git status                  # Check for uncommitted files
git add .                   # Stage all changes
git commit -m "feat: Add GitHub Actions CI/CD pipeline"
```

---

## ✅ Initial Push

- [ ] Push code to GitHub

```bash
git push origin main
```

---

## ✅ GitHub Repository Configuration

### 1. Enable GitHub Actions

- [ ] Go to repository **Settings**
- [ ] Click **Actions** → **General**
- [ ] Under "Actions permissions":
  - [ ] Select **"Allow all actions and reusable workflows"**
- [ ] Under "Workflow permissions":
  - [ ] Select **"Read and write permissions"**
  - [ ] Check **"Allow GitHub Actions to create and approve pull requests"**
- [ ] Click **Save**

### 2. Verify Workflows Are Active

- [ ] Go to **Actions** tab
- [ ] Verify you see 4 workflows:
  - [ ] CI
  - [ ] Release
  - [ ] CodeQL
  - [ ] Dependency Review
- [ ] Check that CI workflow is running (first push should trigger it)

---

## ✅ Configure Secrets (Optional but Recommended)

### Option A: Codecov Integration (Optional)

- [ ] Go to https://codecov.io
- [ ] Sign in with GitHub
- [ ] Add your repository
- [ ] Copy the Codecov token
- [ ] In GitHub: **Settings** → **Secrets and variables** → **Actions**
- [ ] Click **New repository secret**
  - Name: `CODECOV_TOKEN`
  - Value: `<your-codecov-token>`
- [ ] Click **Add secret**

### Option B: npm Publishing (Optional, for future)

- [ ] Go to https://npmjs.com
- [ ] Sign in or create account
- [ ] Go to **Account** → **Access Tokens**
- [ ] Click **Generate New Token**
  - Type: **Automation**
- [ ] Copy the token
- [ ] In GitHub: **Settings** → **Secrets and variables** → **Actions**
- [ ] Click **New repository secret**
  - Name: `NPM_TOKEN`
  - Value: `<your-npm-token>`
- [ ] Click **Add secret**
- [ ] Edit `.github/workflows/release.yml`:
  - Find `publish-npm` job
  - Change `if: false` to `if: true`
- [ ] Commit and push changes

---

## ✅ Configure Branch Protection (Recommended)

### Main Branch Protection

- [ ] Go to **Settings** → **Branches**
- [ ] Click **Add branch protection rule**

#### Branch name pattern
- [ ] Enter: `main`

#### Protect matching branches

**Require a pull request before merging**
- [ ] ✅ Enable
- [ ] ✅ Require approvals: **1**
- [ ] ✅ Dismiss stale pull request approvals when new commits are pushed

**Require status checks to pass before merging**
- [ ] ✅ Enable
- [ ] ✅ Require branches to be up to date before merging
- [ ] Search and add these status checks:
  - [ ] `Test on Node.js 18.x`
  - [ ] `Test on Node.js 20.x`
  - [ ] `Test on Node.js 22.x`
  - [ ] `Build check`

**Require conversation resolution before merging**
- [ ] ✅ Enable

**Do not allow bypassing the above settings**
- [ ] ✅ Include administrators (recommended for team projects)
- [ ] Leave unchecked for personal projects (easier solo development)

- [ ] Click **Create** or **Save changes**

---

## ✅ Test the Pipeline

### Test 1: CI Workflow

- [ ] Make a small change (e.g., update README)
- [ ] Commit and push:
  ```bash
  git add .
  git commit -m "test: Verify CI pipeline"
  git push origin main
  ```
- [ ] Go to **Actions** tab
- [ ] Click on the running workflow
- [ ] Verify all jobs pass:
  - [ ] Test on Node.js 18.x ✅
  - [ ] Test on Node.js 20.x ✅
  - [ ] Test on Node.js 22.x ✅
  - [ ] Lint code ✅
  - [ ] Security audit ✅
  - [ ] Build check ✅

### Test 2: Pull Request Workflow

- [ ] Create a feature branch:
  ```bash
  git checkout -b test/pr-workflow
  ```
- [ ] Make a change
- [ ] Commit and push:
  ```bash
  git add .
  git commit -m "test: Verify PR workflow"
  git push origin test/pr-workflow
  ```
- [ ] Create PR via GitHub UI or CLI:
  ```bash
  gh pr create --base main --head test/pr-workflow
  ```
- [ ] Verify PR template appears
- [ ] Fill out PR template
- [ ] Verify CI checks run on PR
- [ ] Verify dependency review runs (if dependencies changed)
- [ ] Merge or close PR

### Test 3: Release Workflow

- [ ] Ensure you're on main branch with latest code
- [ ] Create a version tag:
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
- [ ] Go to **Actions** tab
- [ ] Verify "Release" workflow runs
- [ ] After completion, go to **Releases**
- [ ] Verify new release "v1.0.0" was created
- [ ] Check release notes include:
  - [ ] Changelog (list of commits)
  - [ ] Installation instructions
  - [ ] Test results summary

### Test 4: CodeQL Workflow

- [ ] Go to **Actions** tab
- [ ] Verify "CodeQL" workflow ran (triggers on push)
- [ ] Go to **Security** tab → **Code scanning**
- [ ] Verify CodeQL analysis completed
- [ ] Check for any security alerts (should be none)

---

## ✅ Update Repository Badges (Optional)

### Get Badge URLs

Replace `YOUR_USERNAME` and `serverless-managers` with your actual values:

#### CI Badge
```markdown
![CI](https://github.com/kloudough/serverless-managers/workflows/CI/badge.svg)
```

#### CodeQL Badge
```markdown
![CodeQL](https://github.com/kloudough/serverless-managers/workflows/CodeQL/badge.svg)
```

#### Codecov Badge (if configured)
```markdown
[![codecov](https://codecov.io/gh/kloudough/serverless-managers/branch/main/graph/badge.svg)](https://codecov.io/gh/kloudough/serverless-managers)
```

### Update README.md

- [ ] Edit `README.md`
- [ ] Update badge URLs with your username
- [ ] Commit and push:
  ```bash
  git add README.md
  git commit -m "docs: Update badge URLs"
  git push origin main
  ```
- [ ] Verify badges show correct status

---

## ✅ Configure Issue Templates

- [ ] Go to **Issues** tab
- [ ] Click **New issue**
- [ ] Verify templates appear:
  - [ ] 🐛 Bug Report
  - [ ] ✨ Feature Request
  - [ ] 📖 Documentation
- [ ] Test one template to verify format

---

## ✅ Set Up Local Testing with Act (Optional)

For testing workflows locally before pushing:

### Install Act

**macOS:**
```bash
brew install act
```

**Windows:**
```bash
choco install act
```

**Linux:**
```bash
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

### Test Workflows Locally

- [ ] List available workflows:
  ```bash
  act -l
  ```
- [ ] Run CI workflow:
  ```bash
  act push
  ```
- [ ] Run specific job:
  ```bash
  act -j test
  ```

---

## ✅ Post-Setup Tasks

### Documentation

- [ ] Review [CICD_SETUP.md](../CICD_SETUP.md) for complete guide
- [ ] Review [workflows/README.md](./workflows/README.md) for workflow details
- [ ] Review [GITHUB_ACTIONS_SUMMARY.md](../GITHUB_ACTIONS_SUMMARY.md) for overview

### Monitoring

- [ ] Bookmark GitHub Actions page for quick access
- [ ] Enable email notifications for workflow failures:
  - Go to **Settings** → **Notifications**
  - Check **Actions** section

### Team Communication

- [ ] Share CI/CD documentation with team
- [ ] Document any custom secrets added
- [ ] Review PR template with team
- [ ] Establish review process for PRs

---

## ✅ Troubleshooting

If you encounter issues:

### CI Tests Failing

- [ ] Check workflow logs in Actions tab
- [ ] Verify tests pass locally: `npm test`
- [ ] Check Node.js version mismatch
- [ ] Review error messages in job logs

### Secrets Not Working

- [ ] Verify secret names match exactly (case-sensitive)
- [ ] Re-create secrets if needed
- [ ] Check workflow permissions

### Workflows Not Triggering

- [ ] Verify Actions are enabled (Settings → Actions)
- [ ] Check workflow trigger conditions
- [ ] Verify branch names match (main vs master)

### Badge Not Showing

- [ ] Verify badge URL is correct
- [ ] Replace YOUR_USERNAME with actual username
- [ ] Wait a few minutes for cache to update

---

## 🎉 Setup Complete!

When all items are checked, your CI/CD pipeline is fully configured and operational.

### Quick Reference

- **CI runs on**: Every push and PR
- **Releases created on**: Git tags `v*.*.*`
- **Security scans**: Weekly + every push/PR
- **View results**: Actions tab
- **View security**: Security tab → Code scanning

### Next Steps

- Start using feature branches for development
- Create PRs for all changes
- Use semantic versioning for releases
- Monitor Actions tab for workflow status

---

**Questions?** Check the [full CI/CD documentation](../CICD_SETUP.md) or [open an issue](https://github.com/kloudough/serverless-managers/issues/new/choose).
