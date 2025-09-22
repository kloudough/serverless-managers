# Node.js Application Constitution (Minimal)

## Core Principles

### 1) Keep It Simple
- Prefer small, composable modules over frameworks unless needed.
- Avoid premature abstraction and configuration. Choose the simplest working solution first.

### 2) Deterministic Builds
- Support Node.js LTS (>= 18.x). Pin engines in `package.json`.
- Use npm with a committed `package-lock.json`. Install with `npm ci` in CI.

### 3) Explicit Runtime Configuration
- Configuration comes from environment variables with sane defaults.
- Mandatory vars: `NODE_ENV` (development|test|production), `PORT` (if an HTTP server is exposed).

### 4) Basic Observability
- Log to stdout/stderr using structured, single-line logs where possible.
- Provide a simple health signal: either a `/health` HTTP route or a startup/ready log line.

### 5) Safe Startup and Shutdown
- Handle process signals: `SIGINT`, `SIGTERM` to close servers, timers, and child processes gracefully.

## Minimal Technical Requirements

- Node.js: 18.x LTS or newer (engines field enforced).
- Package manager: npm (lockfile committed).
- Required files:
	- `package.json` with scripts: `start`, `test` (if tests exist).
	- Entry point at `index.js` or `src/index.js`.
	- `.gitignore` including `node_modules/` and logs.
- Networked apps must read `PORT` and bind to `0.0.0.0` (not localhost) for containerization.
- No secret values committed to the repo; use env vars or secret managers.

Example `package.json` (minimal):

```json
{
	"name": "app",
	"version": "0.1.0",
	"private": true,
	"type": "commonjs",
	"engines": { "node": ">=18" },
	"scripts": {
		"start": "node index.js",
		"test": "node -e 'console.log(\"No tests\")'"
	},
	"dependencies": {},
	"devDependencies": {}
}
```

## Minimal Development Workflow and Quality Gates

1) Install: `npm ci` (or `npm install` for local dev).
2) Run: `npm start`.
3) Test: `npm test` (ok to be a no-op initially, but present).
4) Linting/formatting optional; if added, wire as npm scripts and keep zero-config where possible.

Release/Distribution (if applicable):
- Libraries publish as semver; apps produce Docker images with a minimal base (e.g., `node:18-alpine`).

## Governance

- This constitution sets the baseline. Add extras (lint, types, CI) incrementally and document them.
- Changes to these minimal rules must be recorded in this file and acknowledged in PR review.

Version: 1.0.0 | Ratified: 2025-09-22 | Last Amended: 2025-09-22