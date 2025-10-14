# GitHub Actions Workflows

This directory contains CI/CD workflows for the Serverless Managers project.

## Workflows

### 1. CI (ci.yml)
**Trigger:** Push to main/develop, Pull Requests

**Jobs:**
- **test**: Runs tests on Node.js 18, 20, and 22
  - Installs dependencies
  - Runs test suite
  - Generates coverage report (Node 20 only)
  - Uploads to Codecov

- **lint**: Code quality checks
  - Placeholder for ESLint (add when configured)

- **security**: Security audit
  - Runs npm audit
  - Continues on error (non-blocking)

- **build**: Verify project structure
  - Checks for required directories
  - Validates all manager files exist

- **test-integration**: Integration tests
  - Only runs on main branch
  - Placeholder for Docker/K8s integration tests

- **notify**: Status summary
  - Reports results of all jobs

### 2. Release (release.yml)
**Trigger:** Git tags matching `v*.*.*`

**Jobs:**
- **test**: Pre-release validation
  - Runs full test suite
  - Generates coverage

- **release**: Create GitHub Release
  - Generates changelog from commits
  - Creates release with test results
  - Includes installation instructions

- **publish-npm**: Publish to npm (disabled by default)
  - Uncomment when ready to publish
  - Requires NPM_TOKEN secret

### 3. CodeQL (codeql.yml)
**Trigger:** Push, Pull Request, Weekly schedule

**Jobs:**
- **analyze**: Security analysis
  - Runs CodeQL security scanning
  - Analyzes JavaScript code
  - Reports security vulnerabilities

### 4. Dependency Review (dependency-review.yml)
**Trigger:** Pull Requests

**Jobs:**
- **dependency-review**: Review dependencies
  - Checks for vulnerable dependencies
  - Fails on moderate+ severity
  - Denies GPL licenses
  - Comments results on PR

## Configuration

### Required Secrets
- `CODECOV_TOKEN`: (Optional) For coverage reporting
- `NPM_TOKEN`: (Optional) For npm publishing
- `GITHUB_TOKEN`: Automatically provided by GitHub

### Branch Protection
Recommended settings for `main` branch:
- Require pull request reviews
- Require status checks to pass
- Require CI workflow to pass
- Require up-to-date branches

## Local Testing

Test workflows locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
choco install act  # Windows

# Run CI workflow
act -j test

# Run specific job
act -j lint

# Run with secrets
act -j test --secret-file .secrets
```

## Adding New Workflows

1. Create new `.yml` file in this directory
2. Define trigger events
3. Add jobs and steps
4. Test locally with act
5. Commit and push

## Badges

Add to README.md:

```markdown
![CI](https://github.com/kloudough/serverless-managers/workflows/CI/badge.svg)
![CodeQL](https://github.com/kloudough/serverless-managers/workflows/CodeQL/badge.svg)
[![codecov](https://codecov.io/gh/kloudough/serverless-managers/branch/main/graph/badge.svg)](https://codecov.io/gh/kloudough/serverless-managers)
```

## Troubleshooting

### Tests failing in CI but passing locally
- Check Node.js version matches
- Ensure dependencies are installed with `npm ci`
- Check for environment-specific issues

### Coverage upload failing
- Verify CODECOV_TOKEN is set
- Check Codecov project is configured
- Review Codecov upload action logs

### Release workflow not triggering
- Ensure tag format is `v*.*.*` (e.g., v1.0.0)
- Push tags with `git push --tags`
- Check workflow permissions

## Future Enhancements

- [ ] Add ESLint configuration and enable lint job
- [ ] Set up Codecov project and add token
- [ ] Configure npm publishing when ready
- [ ] Add Docker/K8s integration tests
- [ ] Add performance benchmarking
- [ ] Add automated changelog generation
- [ ] Add release notes automation
- [ ] Add deployment workflows
