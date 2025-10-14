# Contributing to Serverless Managers

Thank you for your interest in contributing! 🎉

This document provides guidelines for contributing to the Serverless Managers project.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [License](#license)

---

## 📜 Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of:
- Age, body size, disability, ethnicity, gender identity and expression
- Level of experience, nationality, personal appearance, race, religion
- Sexual identity and orientation

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**
- Harassment, trolling, insulting/derogatory comments
- Public or private harassment
- Publishing others' private information without permission
- Other conduct inappropriate in a professional setting

### Enforcement

Project maintainers will enforce these standards fairly and consistently. Violations may result in temporary or permanent bans.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** (recommended: latest LTS)
- **npm 8+** or compatible package manager
- **Git** for version control
- **Docker** (optional, for integration tests)
- **Kubernetes cluster** (optional, for K8s integration tests)

### Fork and Clone

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/kloudough/serverless-managers.git
   cd serverless-managers
   ```
3. **Add upstream** remote:
   ```bash
   git remote add upstream https://github.com/kloudough/serverless-managers.git
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```

### Verify Setup

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run example server
node examples/server.js
```

If all tests pass, you're ready to contribute! ✅

---

## 🔄 Development Workflow

### 1. Create a Branch

```bash
# Sync with upstream
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch naming:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation only
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `chore/` - Maintenance tasks

### 2. Make Changes

- Write clean, well-documented code
- Follow existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test file
npm test test/worker.test.js

# Run with coverage
npm run test:coverage

# Ensure 100% of your new code is tested
```

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature"
```

See [Commit Guidelines](#commit-guidelines) below.

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub.

---

## 📝 Coding Standards

### JavaScript Style

- **Use ES6+ syntax** (const/let, arrow functions, async/await)
- **No semicolons** unless necessary (ASI-friendly)
- **2-space indentation**
- **Single quotes** for strings
- **Template literals** for string interpolation

### Code Organization

```javascript
// 1. Imports at top
const { spawn } = require('child_process');
const { getAvailablePort } = require('../utils/port');

// 2. Class definition
class MyManager {
    // 3. Constructor first
    constructor(options = {}) {
        this.prop = options.prop || 'default';
    }

    // 4. Public methods
    async publicMethod() {
        // Implementation
    }

    // 5. Private/helper methods last
    _privateHelper() {
        // Implementation
    }
}

// 6. Export
module.exports = MyManager;
```

### Documentation

- **JSDoc comments** for public methods
- **Inline comments** for complex logic
- **README updates** for new features

Example:
```javascript
/**
 * Creates a new worker in the pool
 * @param {string} scriptPath - Path to worker script
 * @param {number} port - Port number for worker
 * @returns {Promise<Object>} Worker information object
 * @throws {Error} If worker creation fails
 */
async createWorker(scriptPath, port) {
    // Implementation
}
```

### Error Handling

- **Always validate inputs**
- **Throw descriptive errors**
- **Clean up resources** on failure

```javascript
// ❌ Bad
async createWorker(scriptPath) {
    const worker = new Worker(scriptPath);
    return worker;
}

// ✅ Good
async createWorker(scriptPath) {
    if (!scriptPath || typeof scriptPath !== 'string') {
        throw new Error('scriptPath must be a non-empty string');
    }
    
    if (this.isShuttingDown) {
        throw new Error('Cannot create worker during shutdown');
    }
    
    try {
        const worker = new Worker(scriptPath);
        return worker;
    } catch (err) {
        console.error(`Failed to create worker: ${err.message}`);
        throw new Error(`Worker creation failed: ${err.message}`);
    }
}
```

---

## 🧪 Testing Requirements

### Test Coverage

- **All new code must have tests**
- **Aim for 100% code coverage** for new features
- **Existing coverage must not decrease**

### Test Structure

```javascript
describe('ManagerClass', () => {
    let manager;
    
    beforeEach(() => {
        jest.setTimeout(60000); // 1 minute timeout
        jest.clearAllMocks();
        manager = new ManagerClass();
    });
    
    afterEach(async () => {
        await manager.shutdown();
    });
    
    describe('methodName', () => {
        test('should do expected behavior', async () => {
            // Arrange
            const input = 'test';
            
            // Act
            const result = await manager.methodName(input);
            
            // Assert
            expect(result).toBe('expected');
        });
        
        test('should handle error case', async () => {
            // Test error handling
            await expect(manager.methodName(null))
                .rejects.toThrow('descriptive error');
        });
    });
});
```

### Mocking

- **Mock external dependencies** (Docker, K8s, child_process)
- **Don't mock internal methods** unless necessary
- **Clean up mocks** in afterEach

```javascript
jest.mock('child_process');
jest.mock('../lib/utils/port');

beforeEach(() => {
    jest.clearAllMocks();
    getAvailablePort.mockResolvedValue(8080);
});
```

### Running Tests

```bash
# All tests
npm test

# Specific file
npm test test/worker.test.js

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 💬 Commit Guidelines

We follow **Conventional Commits** for clear, semantic commit messages.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style (formatting, no logic change)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks
- `perf` - Performance improvements
- `ci` - CI/CD changes

### Examples

```bash
# Feature
git commit -m "feat(worker): add health check API"

# Bug fix
git commit -m "fix(docker): prevent memory leak in pool watcher"

# Documentation
git commit -m "docs: update README with new examples"

# Breaking change
git commit -m "feat(k8s)!: change pod naming convention

BREAKING CHANGE: Pod names now use timestamp instead of random suffix"
```

### Best Practices

- **Use imperative mood** ("add feature" not "added feature")
- **Keep subject under 72 characters**
- **Explain what and why**, not how
- **Reference issues** in footer (`Fixes #123`)

---

## 🔀 Pull Request Process

### Before Submitting

- [ ] All tests pass (`npm test`)
- [ ] Code coverage is maintained or improved
- [ ] Documentation is updated
- [ ] Commits follow conventional format
- [ ] Branch is up to date with main

### PR Title

Use conventional commit format:
```
feat(worker): add graceful shutdown
fix(docker): resolve container cleanup issue
```

### PR Description

Use the PR template (auto-filled). Include:
- **What** - What does this PR do?
- **Why** - Why is this change needed?
- **How** - How was it implemented?
- **Testing** - How was it tested?
- **Screenshots** - If UI changes (not applicable here)

### Review Process

1. **Automated checks** must pass (CI, tests, linting)
2. **At least one approval** from maintainers required
3. **Address feedback** promptly and professionally
4. **Squash commits** if requested
5. **Maintainers will merge** when approved

### After Merge

- Delete your feature branch
- Pull latest main:
  ```bash
  git checkout main
  git pull upstream main
  ```

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the **MIT License**.

This means:
- Your code can be used commercially
- Your code can be modified and redistributed
- You retain copyright to your contributions
- The project maintainers can use your contributions

See [LICENSE](../LICENSE) for full details.

### Contributor License Agreement (CLA)

**No formal CLA is required.** By submitting a pull request, you certify that:
1. You have the right to submit the contribution
2. You grant the project maintainers perpetual, worldwide, non-exclusive license to use your contribution
3. Your contribution is provided "as-is" with no warranties

---

## 🤝 Getting Help

### Questions?

- **Documentation:** Read the [README](../README.md) and [Quick Start](.github/QUICK_START.md)
- **Issues:** Search [existing issues](https://github.com/OWNER/serverless-managers/issues)
- **Discussions:** Start a [GitHub Discussion](https://github.com/OWNER/serverless-managers/discussions)

### Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md):
- Describe the bug clearly
- Include steps to reproduce
- Provide error messages/logs
- Specify your environment (Node.js version, OS)

### Suggesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md):
- Explain the use case
- Describe the proposed solution
- Consider alternatives
- Include examples if possible

---

## 🎉 Recognition

Contributors are recognized in:
- Git commit history
- GitHub contributors page
- Release notes (for significant contributions)

We appreciate all contributions, big and small! 💙

---

**Thank you for contributing to Serverless Managers!** 🚀