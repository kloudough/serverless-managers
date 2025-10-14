# 🚀 GitHub Actions Quick Start Guide

**Get your CI/CD pipeline running in 5 minutes!**

---

## ⚡ TL;DR - Fastest Setup

```bash
# 1. Push to GitHub
git add .
git commit -m "feat: Add GitHub Actions pipeline"
git push origin main

# 2. Go to repository Settings → Actions → General
#    - Allow all actions
#    - Enable read/write permissions

# 3. Done! View results in Actions tab
```

That's it! Your pipeline is now running. 🎉

---

## 📋 5-Minute Setup Checklist

### ✅ Step 1: Push Code (30 seconds)

```bash
git add .
git commit -m "feat: Add GitHub Actions CI/CD pipeline"
git push origin main
```

### ✅ Step 2: Enable Actions (1 minute)

1. Go to your repository on GitHub
2. Click **Settings** (top right)
3. Click **Actions** → **General** (left sidebar)
4. Under "Actions permissions":
   - Select **"Allow all actions and reusable workflows"**
5. Under "Workflow permissions":
   - Select **"Read and write permissions"**
   - Check **"Allow GitHub Actions to create and approve pull requests"**
6. Click **Save**

### ✅ Step 3: Verify It Works (30 seconds)

1. Click **Actions** tab (top menu)
2. You should see "CI" workflow running
3. Wait ~2 minutes for completion
4. See green checkmark ✅

### ✅ Done! 🎉

Your CI/CD pipeline is now active and will:
- ✅ Test every push and PR
- ✅ Scan for security issues weekly
- ✅ Create releases on version tags

---

## 🔧 Optional: Enhanced Setup (3 minutes)

### Add Code Coverage (Optional)

**Why?** Track how much of your code is tested.

1. Go to https://codecov.io
2. Sign in with GitHub
3. Add your repository
4. Copy the token
5. In GitHub: **Settings** → **Secrets and variables** → **Actions**
6. Click **New repository secret**
   - Name: `CODECOV_TOKEN`
   - Value: `<paste-token-here>`
7. Click **Add secret**

Now coverage reports will appear on PRs! 📊

### Protect Main Branch (Recommended)

**Why?** Prevent direct pushes, require reviews and passing tests.

1. **Settings** → **Branches** → **Add branch protection rule**
2. Branch name pattern: `main`
3. Check these boxes:
   - ✅ **Require a pull request before merging**
   - ✅ **Require approvals: 1**
   - ✅ **Require status checks to pass before merging**
   - Search and add: `Test on Node.js 18.x`, `20.x`, `22.x`, `Build check`
   - ✅ **Require conversation resolution before merging**
4. Click **Create**

Now main branch is protected! 🛡️

---

## 🎯 What You Get Out of the Box

### Automatic Testing
- ✅ Tests run on Node.js 18, 20, and 22
- ✅ All 169 tests must pass
- ✅ Runs on every push and PR
- ✅ Results in ~2 minutes

### Security Scanning
- ✅ CodeQL scans for vulnerabilities
- ✅ npm audit checks dependencies
- ✅ Dependency review on PRs
- ✅ Weekly automated scans

### Release Automation
- ✅ Create releases with one command: `git tag v1.0.0 && git push --tags`
- ✅ Automatic changelog generation
- ✅ GitHub release created automatically

---

## 📱 Using the Pipeline

### Make a Change

```bash
# 1. Create branch
git checkout -b feature/my-feature

# 2. Make changes
# ... edit files ...

# 3. Commit and push
git add .
git commit -m "feat: Add my feature"
git push origin feature/my-feature

# 4. Create PR
gh pr create --base main
# or use GitHub web UI
```

### Create a Release

```bash
# 1. Update version
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0

# 2. Push with tags
git push --follow-tags

# 3. Done! Check Releases tab for new release
```

### View Results

```bash
# Using GitHub CLI
gh run list           # See recent runs
gh run view           # View latest run
gh run watch          # Watch in real-time

# Or visit in browser
# https://github.com/kloudough/serverless-managers/actions
```

---

## 🐛 Troubleshooting

### Tests Failing?

**Check locally first:**
```bash
npm test
```

If passing locally but failing in CI:
- Check Node.js version (`node --version`)
- Try clean install: `rm -rf node_modules && npm install`

### Workflow Not Running?

**Check Actions are enabled:**
1. Settings → Actions → General
2. Ensure "Allow all actions" is selected

**Check branch name:**
- Workflow triggers on `main` and `develop`
- If using `master`, edit workflow files

### Coverage Not Uploading?

**Check CODECOV_TOKEN:**
1. Settings → Secrets → Actions
2. Verify `CODECOV_TOKEN` exists
3. If not, follow "Add Code Coverage" steps above

---

## 📚 Learn More

### Documentation
- 📖 [Complete CI/CD Guide](../CICD_SETUP.md) - Full documentation
- 📊 [Pipeline Architecture](./PIPELINE_ARCHITECTURE.md) - Visual diagrams
- ✅ [Setup Checklist](./SETUP_CHECKLIST.md) - Detailed checklist
- 📝 [Workflow README](./workflows/README.md) - Workflow details

### Templates
- 🐛 [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md)
- ✨ [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md)
- 📖 [Documentation](.github/ISSUE_TEMPLATE/documentation.md)
- 📋 [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md)

---

## 💡 Pro Tips

### Use Commit Conventions

```bash
feat: Add new feature      # New feature
fix: Fix bug              # Bug fix
docs: Update docs         # Documentation
test: Add tests           # Tests
refactor: Refactor code   # Refactoring
perf: Performance         # Performance
```

Benefits:
- Clear history
- Automatic changelog
- Easy to understand

### Test Locally with Act

```bash
# Install act
brew install act     # macOS
choco install act    # Windows

# Run workflows locally
act push            # Run CI
act -j test         # Run test job
```

### Monitor Your Pipeline

Add badges to README:

```markdown
![CI](https://github.com/kloudough/serverless-managers/workflows/CI/badge.svg)
```

Result: ![CI](https://img.shields.io/badge/CI-passing-brightgreen)

---

## 🎉 Success Criteria

You're all set when:
- ✅ Green checkmark on Actions tab
- ✅ All 169 tests passing
- ✅ Security scan completed
- ✅ No vulnerability alerts

---

## 🆘 Need Help?

- 📫 [Open an Issue](https://github.com/kloudough/serverless-managers/issues/new/choose)
- 📖 [Read Full Documentation](../CICD_SETUP.md)
- 💬 [GitHub Discussions](https://github.com/kloudough/serverless-managers/discussions)

---

## 🎓 Next Steps

1. ✅ **Set up branch protection** (5 min) - Protect your main branch
2. ✅ **Add Codecov** (5 min) - Track test coverage
3. ✅ **Invite collaborators** - Share with your team
4. ✅ **Create your first PR** - Test the workflow
5. ✅ **Create a release** - Tag v1.0.0

---

## 🏆 Achievement Unlocked

**You now have:**
- ✅ Professional CI/CD pipeline
- ✅ Automated testing on 3 Node.js versions
- ✅ Security scanning
- ✅ Automated releases
- ✅ PR templates
- ✅ Issue templates

**Time invested:** 5 minutes  
**Value gained:** Enterprise-grade automation 🚀

---

**Happy Coding!** 🎉

*Questions? Check the [full documentation](../CICD_SETUP.md) or [open an issue](https://github.com/kloudough/serverless-managers/issues/new/choose).*
