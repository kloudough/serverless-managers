# GitHub Actions CI/CD Setup

## Overview

This project uses GitHub Actions for continuous integration and deployment. The CI/CD pipeline includes automated testing, code quality checks, security scanning, and release automation.

## Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

**Purpose:** Continuous Integration for every push and pull request

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Jobs:**

#### Test Matrix
- Tests on Node.js versions: 18.x, 20.x, 22.x
- Ensures compatibility across supported Node versions
- Generates code coverage report

#### Lint
- Code quality checks
- Ready for ESLint integration (currently placeholder)

#### Security Audit
- Runs `npm audit` to check for vulnerabilities
- Non-blocking (continues on error)

#### Build Check
- Verifies project structure integrity
- Validates all required files exist
- Checks for manager files

#### Integration Tests
- Runs on `main` branch only
- Placeholder for Docker/Kubernetes integration tests
- Future: Full integration testing with actual containers/pods

#### Notification
- Summarizes all job results
- Reports overall pipeline status

**Usage:**
```bash
# Automatically runs on push
git push origin main

# Or on pull request creation
gh pr create
```

---

### 2. Release Workflow (`.github/workflows/release.yml`)

**Purpose:** Automated release creation and npm publishing

**Triggers:**
- Git tags matching pattern `v*.*.*` (e.g., v1.0.0, v2.1.3)

**Jobs:**

#### Pre-Release Tests
- Full test suite execution
- Coverage report generation
- Validates code before release

#### GitHub Release Creation
- Automatically generates changelog from commits
- Includes test results summary
- Provides installation instructions
- Marks release as stable

#### npm Publishing (Disabled by Default)
- Ready for npm package publishing
- Requires `NPM_TOKEN` secret
- Enable by changing `if: false` to `if: true`

**Usage:**
```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0

# Or use npm version
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
git push --follow-tags
```

---

### 3. CodeQL Workflow (`.github/workflows/codeql.yml`)

**Purpose:** Advanced security vulnerability scanning

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Weekly schedule (Sunday at 00:00 UTC)

**Features:**
- Analyzes JavaScript code for security issues
- Detects common vulnerabilities (SQL injection, XSS, etc.)
- Provides detailed security reports
- Runs security-and-quality queries

**Usage:**
- Automatic on every push/PR
- View results in Security tab → Code scanning alerts

---

### 4. Dependency Review Workflow (`.github/workflows/dependency-review.yml`)

**Purpose:** Review dependencies in pull requests

**Triggers:**
- Pull requests to `main` or `develop` branches

**Features:**
- Checks for known vulnerabilities in dependencies
- Fails on moderate or higher severity issues
- Denies GPL-2.0 and GPL-3.0 licenses
- Comments security findings directly on PR

**Usage:**
- Automatic on PR creation
- Review comments on the PR for dependency issues

---

## GitHub Secrets Configuration

### Required Secrets

1. **GITHUB_TOKEN** (automatically provided)
   - Used for: Creating releases, commenting on PRs
   - No configuration needed

2. **CODECOV_TOKEN** (optional)
   - Used for: Uploading coverage reports to Codecov
   - Get from: https://codecov.io
   - Setup:
     ```
     Repository Settings → Secrets and variables → Actions → New repository secret
     Name: CODECOV_TOKEN
     Value: <your-codecov-token>
     ```

3. **NPM_TOKEN** (optional, for npm publishing)
   - Used for: Publishing to npm registry
   - Get from: https://www.npmjs.com/settings/your-username/tokens
   - Setup:
     ```
     Repository Settings → Secrets and variables → Actions → New repository secret
     Name: NPM_TOKEN
     Value: <your-npm-token>
     ```

---

## Branch Protection Rules

Recommended settings for `main` branch:

```
Repository Settings → Branches → Add rule

Branch name pattern: main

✅ Require a pull request before merging
  ✅ Require approvals: 1
  ✅ Dismiss stale pull request approvals when new commits are pushed

✅ Require status checks to pass before merging
  ✅ Require branches to be up to date before merging
  Status checks required:
    - Test on Node.js 18.x
    - Test on Node.js 20.x
    - Test on Node.js 22.x
    - Lint code
    - Build check

✅ Require conversation resolution before merging
✅ Include administrators
```

---

## Issue Templates

Three issue templates are provided:

### 1. Bug Report (`.github/ISSUE_TEMPLATE/bug_report.md`)
For reporting bugs and issues

### 2. Feature Request (`.github/ISSUE_TEMPLATE/feature_request.md`)
For suggesting new features

### 3. Documentation Issue (`.github/ISSUE_TEMPLATE/documentation.md`)
For documentation improvements

**Usage:**
```
Issues → New issue → Choose template
```

---

## Pull Request Template

Located at `.github/PULL_REQUEST_TEMPLATE.md`

**Features:**
- Standard PR description format
- Type of change checklist
- Testing checklist
- Manager-specific checklist
- Documentation checklist

**Usage:**
- Automatically loaded when creating a PR
- Fill out relevant sections

---

## Local Testing

### Using Act (GitHub Actions Locally)

Install act:
```bash
# macOS
brew install act

# Windows
choco install act

# Linux
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

Run workflows locally:
```bash
# Run CI workflow
act push

# Run specific job
act -j test

# Run with specific Node version
act -j test --matrix node-version:20.x

# List available workflows
act -l

# Dry run (don't execute)
act -n
```

---

## CI/CD Best Practices

### 1. Test Before Push
```bash
# Always run tests locally first
npm test

# Check coverage
npm run test:coverage
```

### 2. Semantic Versioning
```bash
# Patch: Bug fixes (1.0.0 -> 1.0.1)
npm version patch

# Minor: New features (1.0.0 -> 1.1.0)
npm version minor

# Major: Breaking changes (1.0.0 -> 2.0.0)
npm version major
```

### 3. Commit Message Convention
```
feat: Add new health check API
fix: Resolve memory leak in poolWatcher
docs: Update README with CI/CD setup
test: Add tests for round-robin selection
refactor: Extract helper method
perf: Optimize resource cleanup
```

### 4. PR Workflow
```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat: Add my feature"

# Push and create PR
git push origin feature/my-feature
gh pr create
```

---

## Monitoring and Badges

### Add CI Badge to README

```markdown
![CI](https://github.com/kloudough/serverless-managers/workflows/CI/badge.svg)
![CodeQL](https://github.com/kloudough/serverless-managers/workflows/CodeQL/badge.svg)
[![codecov](https://codecov.io/gh/kloudough/serverless-managers/branch/main/graph/badge.svg)](https://codecov.io/gh/kloudough/serverless-managers)
[![npm version](https://badge.fury.io/js/serverless-managers.svg)](https://www.npmjs.com/package/serverless-managers)
```

### View Workflow Status
```
Repository → Actions → Select workflow → View runs
```

---

## Troubleshooting

### CI Tests Failing

**Problem:** Tests pass locally but fail in CI

**Solutions:**
1. Check Node.js version mismatch:
   ```bash
   node --version  # Compare with CI matrix
   ```

2. Ensure clean install:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm test
   ```

3. Check for environment-specific issues:
   - Timezone differences
   - File path separators (Windows vs Linux)
   - Missing environment variables

### CodeQL Analysis Errors

**Problem:** CodeQL scan fails or reports false positives

**Solutions:**
1. Review CodeQL documentation: https://codeql.github.com/docs/
2. Add exclusions in workflow if needed
3. Check Security tab for detailed analysis

### Release Workflow Not Triggering

**Problem:** Tag pushed but release not created

**Solutions:**
1. Verify tag format (must be `v*.*.*`):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. Check workflow permissions:
   ```
   Repository Settings → Actions → General → Workflow permissions
   Ensure "Read and write permissions" is selected
   ```

3. View workflow logs in Actions tab

### Coverage Upload Failing

**Problem:** Codecov upload fails

**Solutions:**
1. Verify CODECOV_TOKEN is set correctly
2. Check Codecov project configuration
3. Review upload action logs
4. Temporarily set `fail_ci_if_error: false` (already done)

---

## Future Enhancements

### Planned Improvements

1. **ESLint Integration**
   - Add `.eslintrc.js` configuration
   - Enable lint job in CI workflow
   - Add `npm run lint` script

2. **Integration Tests**
   - Docker compose setup for testing
   - Kubernetes test cluster (kind/minikube)
   - Real container/pod testing

3. **Performance Benchmarking**
   - Automated performance tests
   - Track performance over time
   - Fail on regression

4. **Automated Changelog**
   - Conventional commits parsing
   - Automatic CHANGELOG.md generation
   - Include in releases

5. **npm Publishing**
   - Enable publish-npm job
   - Add version bump automation
   - Pre-publish validation

6. **Deployment**
   - Docker image publishing
   - Example app deployment
   - Documentation hosting

---

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [CodeQL Documentation](https://codeql.github.com/docs/)
- [Codecov Documentation](https://docs.codecov.com/)
- [npm Publishing Guide](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [Act Documentation](https://github.com/nektos/act)
- [Semantic Versioning](https://semver.org/)

---

## Support

For issues related to CI/CD:
1. Check this documentation
2. Review workflow logs in Actions tab
3. Consult GitHub Actions documentation
4. Open an issue using the appropriate template

---

**Last Updated:** October 2025
