# GitHub Actions Pipeline Architecture

## 📊 Visual Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SERVERLESS-MANAGERS CI/CD PIPELINE                   │
└─────────────────────────────────────────────────────────────────────────┘

                                ┌─────────────┐
                                │   DEVELOPER  │
                                └──────┬──────┘
                                       │
                        ┌──────────────┼──────────────┐
                        │              │              │
                   ┌────▼────┐    ┌───▼────┐    ┌───▼────┐
                   │  PUSH   │    │   PR    │    │  TAG   │
                   │  main   │    │ create  │    │ v*.*.* │
                   └────┬────┘    └────┬────┘    └───┬────┘
                        │              │              │
        ┌───────────────┼──────────────┼──────────────┘
        │               │              │
┌───────▼───────┐  ┌───▼──────┐  ┌───▼──────────┐  ┌─────────────┐
│   CI WORKFLOW  │  │ CodeQL   │  │ Dependency   │  │  RELEASE    │
│   (ci.yml)     │  │ (codeql) │  │ Review       │  │ (release)   │
└───────┬───────┘  └────┬─────┘  └──────┬───────┘  └──────┬──────┘
        │               │                │                  │
        ├───────────────┴────────────────┴──────────────────┘
        │
        │  ┌──────────────────────────────────────────────────────────┐
        └─►│                    CI WORKFLOW JOBS                       │
           ├──────────────────────────────────────────────────────────┤
           │                                                           │
           │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
           │  │ Node 18  │  │ Node 20  │  │ Node 22  │  │  Lint   │    │
           │  │ ✅ Test  │  │ ✅ Test  │  │ ✅ Test  │  │ (Ready) │    │
           │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │
           │                                                           │
           │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
           │  │Security │  │  Build   │  │  Test   │  │ Notify  │    │
           │  │ npm     │  │ Verify   │  │ Integ.  │  │ Status  │    │
           │  │ audit   │  │ Project  │  │(Docker) │  │Summary  │    │
           │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │
           │                                                           │
           └───────────────────────────┬───────────────────────────────┘
                                       │
                                 ┌─────▼─────┐
                                 │  SUCCESS   │
                                 │    or      │
                                 │  FAILURE   │
                                 └─────┬─────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
         ┌──────▼──────┐      ┌───────▼──────┐      ┌───────▼──────┐
         │   Codecov    │      │   Security   │      │   GitHub     │
         │   Coverage   │      │    Alerts    │      │   Checks     │
         │   Report     │      │   (if any)   │      │   Status     │
         └─────────────┘      └──────────────┘      └──────────────┘
```

---

## 🔄 Workflow Trigger Diagram

```
TRIGGER EVENTS                  WORKFLOWS                    ACTIONS

┌──────────────┐
│ Push to main │─────────────┐
└──────────────┘             │
                             ├──────►  CI Workflow
┌──────────────┐             │         ├─ Test (3 Node versions)
│ Push to dev  │─────────────┤         ├─ Lint
└──────────────┘             │         ├─ Security Audit
                             │         ├─ Build Check
┌──────────────┐             │         └─ Notify
│ Pull Request │─────────────┘
└──────────────┘             │
                             ├──────►  CodeQL Workflow
┌──────────────┐             │         ├─ Initialize CodeQL
│ Push to main │─────────────┤         ├─ Autobuild
└──────────────┘             │         └─ Analyze
                             │
┌──────────────┐             │
│ Pull Request │─────────────┘
└──────────────┘             │
                             ├──────►  Dependency Review
┌──────────────┐             │         ├─ Review Dependencies
│ Pull Request │─────────────┤         ├─ Check Vulnerabilities
└──────────────┘             │         └─ Comment on PR
                             │
┌──────────────┐             │
│ Git Tag      │             │
│ v*.*.*       │─────────────┴──────►  Release Workflow
└──────────────┘                       ├─ Test
                                       ├─ Create GitHub Release
                                       └─ Publish to npm (disabled)

┌──────────────┐
│ Weekly       │
│ Schedule     │─────────────────────►  CodeQL Workflow
│ Sunday 00:00 │                        └─ Weekly Security Scan
└──────────────┘
```

---

## 🧪 Test Execution Flow

```
                          ┌─────────────────┐
                          │  npm ci install  │
                          └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │   npm test       │
                          │                  │
                          │  169 Tests Run   │
                          └────────┬─────────┘
                                   │
                   ┌───────────────┼───────────────┐
                   │               │               │
          ┌────────▼────────┐ ┌───▼───────┐ ┌────▼────────┐
          │ Worker Manager  │ │  Process  │ │   Docker    │
          │   41 tests      │ │  Manager  │ │  Manager    │
          │      ✅         │ │ 33 tests  │ │  37 tests   │
          └─────────────────┘ │    ✅     │ │     ✅      │
                              └───────────┘ └─────────────┘
                                   │
                              ┌────▼────────┐
                              │ K8s Manager │
                              │  58 tests   │
                              │     ✅      │
                              └────┬────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Coverage Report  │
                          │  (Node 20 only)   │
                          └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Upload Codecov  │
                          │    (optional)    │
                          └──────────────────┘
```

---

## 🔐 Security Scanning Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      SECURITY SCANNING                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  Code Changes   │
└────────┬────────┘
         │
         ├──────────────────┬──────────────────┬──────────────────┐
         │                  │                  │                  │
    ┌────▼────┐        ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
    │ CodeQL  │        │   npm   │       │Dependency│       │ License │
    │Analysis │        │  audit  │       │  Review  │       │  Check  │
    └────┬────┘        └────┬────┘       └────┬────┘       └────┬────┘
         │                  │                  │                  │
    ┌────▼────────────┐┌────▼──────────┐ ┌────▼──────────┐ ┌────▼────────┐
    │ - SQL Injection ││ - Known CVEs  │ │ - New deps    │ │ - GPL-2.0   │
    │ - XSS           ││ - Severity    │ │ - Severity    │ │ - GPL-3.0   │
    │ - Path Traversal││ - Fix avail.  │ │ - Maintainer  │ │ - Compliance│
    │ - Code Quality  ││               │ │               │ │             │
    └────┬────────────┘└────┬──────────┘ └────┬──────────┘ └────┬────────┘
         │                  │                  │                  │
         └──────────────────┼──────────────────┼──────────────────┘
                            │
                       ┌────▼────┐
                       │ Security │
                       │  Report  │
                       └────┬────┘
                            │
                ┌───────────┼───────────┐
                │           │           │
           ┌────▼────┐ ┌───▼────┐ ┌───▼────┐
           │ GitHub  │ │   PR    │ │  Email │
           │Security │ │Comments │ │Notif.  │
           │  Tab    │ │         │ │        │
           └─────────┘ └─────────┘ └────────┘
```

---

## 📦 Release Creation Flow

```
DEVELOPER                  GITHUB ACTIONS              OUTPUTS

┌──────────────┐
│ npm version  │
│   patch      │
└──────┬───────┘
       │
┌──────▼───────┐
│ git push     │
│ --follow-tags│
└──────┬───────┘
       │
       │ v1.0.0
       │
┌──────▼────────────────────────────────────────────────┐
│              RELEASE WORKFLOW                         │
├───────────────────────────────────────────────────────┤
│                                                       │
│  STEP 1: Pre-Release Tests                           │
│  ┌──────────────────────────────────┐                │
│  │ npm ci                            │                │
│  │ npm test (all 169 tests)          │                │
│  │ ✅ All tests pass                 │                │
│  └──────────────────────────────────┘                │
│                  │                                    │
│                  ▼                                    │
│  STEP 2: Generate Changelog                          │
│  ┌──────────────────────────────────┐                │
│  │ git log --pretty=format          │                │
│  │ - Extract commit messages         │ ───────────┐  │
│  │ - Format with bullets             │            │  │
│  └──────────────────────────────────┘            │  │
│                  │                                │  │
│                  ▼                                │  │
│  STEP 3: Create GitHub Release                   │  │
│  ┌──────────────────────────────────┐            │  │
│  │ - Release name: v1.0.0            │            │  │
│  │ - Tag: v1.0.0                     │            │  │
│  │ - Body: Changelog + instructions  │◄───────────┘  │
│  │ - Draft: false                    │                │
│  │ - Prerelease: false               │                │
│  └──────────────────────────────────┘                │
│                  │                                    │
│                  ▼                                    │
│  STEP 4: npm Publish (disabled)                      │
│  ┌──────────────────────────────────┐                │
│  │ if: false (enable when ready)     │                │
│  │ npm publish                       │                │
│  └──────────────────────────────────┘                │
│                                                       │
└───────────────────────────┬───────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ GitHub Release │
                    │    Created     │
                    └───────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
       ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
       │ Release  │    │ Assets  │    │  Email  │
       │  Notes   │    │  (none) │    │ Notif.  │
       │          │    │         │    │         │
       └──────────┘    └─────────┘    └─────────┘
```

---

## 🌳 Branch Protection Workflow

```
DEVELOPER                    GITHUB                    REVIEWERS

┌──────────────┐
│Create feature│
│   branch     │
└──────┬───────┘
       │
┌──────▼───────┐
│Make changes  │
│ + commit     │
└──────┬───────┘
       │
┌──────▼───────┐
│Push + create │
│     PR       │───────────►┌────────────────────┐
└──────────────┘            │  PR Template       │
                            │  Auto-loaded       │
                            └────────┬───────────┘
                                     │
                            ┌────────▼───────────┐
                            │ Status Checks Run  │
                            │ - Test Node 18 ✅  │
                            │ - Test Node 20 ✅  │
                            │ - Test Node 22 ✅  │
                            │ - Build Check  ✅  │
                            │ - CodeQL       ✅  │
                            │ - Dep Review   ✅  │
                            └────────┬───────────┘
                                     │
                            ┌────────▼───────────┐
                            │ All Checks Pass?   │
                            │                    │
                            │  YES ─┐    NO ─┐   │
                            └───────┼────────┼───┘
                                    │        │
                                    │   ┌────▼─────────┐
                                    │   │Cannot Merge  │
                                    │   │Fix Required  │
                                    │   └──────────────┘
                                    │
                            ┌───────▼────────────┐
                            │ Ready for Review   │────────►┌──────────────┐
                            └────────────────────┘         │  Reviewer    │
                                     │                     │  Approves    │
                                     │◄────────────────────└──────────────┘
                                     │
                            ┌────────▼────────────┐
                            │  Merge to main      │
                            │  (squash/merge)     │
                            └────────┬────────────┘
                                     │
                            ┌────────▼────────────┐
                            │  CI Runs Again      │
                            │  on main branch     │
                            └─────────────────────┘
```

---

## 🎯 Job Dependencies

```
CI WORKFLOW JOB FLOW

         ┌──────────────────────────────────────────┐
         │            TRIGGERED ON PUSH              │
         └──────────────────┬───────────────────────┘
                            │
      ┌─────────────────────┼─────────────────────┐
      │                     │                     │
┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
│Test Node18│         │Test Node20│         │Test Node22│
│           │         │  +Coverage│         │           │
└─────┬─────┘         └─────┬─────┘         └─────┬─────┘
      │                     │                     │
      └──────────┬──────────┴──────────┬──────────┘
                 │                     │
           ┌─────▼─────┐         ┌─────▼─────┐
           │   Lint    │         │ Security  │
           │           │         │ npm audit │
           └─────┬─────┘         └─────┬─────┘
                 │                     │
                 └──────────┬──────────┘
                            │
                      ┌─────▼─────┐
                      │   Build   │
                      │   Check   │
                      └─────┬─────┘
                            │
                      ┌─────▼─────┐
                      │   Test    │
                      │ Integration│
                      │(main only)│
                      └─────┬─────┘
                            │
                      ┌─────▼─────┐
                      │  Notify   │
                      │  Summary  │
                      └───────────┘

RELEASE WORKFLOW JOB FLOW

         ┌──────────────────────────────────────────┐
         │         TRIGGERED ON TAG v*.*.*           │
         └──────────────────┬───────────────────────┘
                            │
                      ┌─────▼─────┐
                      │   Test    │
                      │  Full     │
                      │  Suite    │
                      └─────┬─────┘
                            │
                ┌───────────┴───────────┐
                │                       │
          ┌─────▼─────┐          ┌─────▼─────┐
          │  Create   │          │ Publish   │
          │  GitHub   │          │   npm     │
          │  Release  │          │(disabled) │
          └───────────┘          └───────────┘
```

---

## 📈 Monitoring & Reporting

```
┌───────────────────────────────────────────────────────────────────┐
│                    MONITORING DASHBOARD                           │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  GitHub Actions Tab                                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Recent Workflow Runs:                                    │    │
│  │ ✅ CI - #123 - feat: Add feature (2 min ago)            │    │
│  │ ✅ CodeQL - #122 - Scheduled scan (1 hour ago)          │    │
│  │ ✅ Release - #121 - v1.0.0 (1 day ago)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  Security Tab                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Code Scanning Alerts:                  0 alerts         │    │
│  │ Dependabot Alerts:                     0 alerts         │    │
│  │ Secret Scanning:                       0 alerts         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  Codecov Dashboard (external)                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Coverage: 95.2% ▆▆▆▆▆▆▆▆▆░                              │    │
│  │ Branches: 169/169 passing                                │    │
│  │ Files: 100% covered                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  npm Registry (if published)                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Latest Version: v1.0.0                                   │    │
│  │ Weekly Downloads: 0                                      │    │
│  │ Total Downloads: 0                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🔗 Integration Points

```
EXTERNAL SERVICES

┌─────────────┐          ┌──────────────┐          ┌──────────────┐
│   Codecov   │◄─────────│   GitHub     │─────────►│     npm      │
│             │  Upload  │   Actions    │ Publish  │   Registry   │
│  Coverage   │          │              │          │              │
│  Reports    │          │              │          │   Package    │
└─────────────┘          └──────┬───────┘          └──────────────┘
                                │
                    ┌───────────┼───────────┐
                    │                       │
          ┌─────────▼────────┐    ┌────────▼─────────┐
          │   GitHub         │    │   GitHub         │
          │   Security       │    │   Releases       │
          │                  │    │                  │
          │   - CodeQL       │    │   - Changelog    │
          │   - Dependabot   │    │   - Assets       │
          │   - Secret Scan  │    │   - Notes        │
          └──────────────────┘    └──────────────────┘
```

---

## 📊 Key Metrics

```
PIPELINE PERFORMANCE

┌─────────────────────────────────────────────┐
│ Metric              │ Value      │ Target   │
├─────────────────────┼────────────┼──────────┤
│ Test Execution Time │ ~2 minutes │ <5 min   │
│ Total Tests         │ 169        │ 169      │
│ Pass Rate           │ 100%       │ 100%     │
│ Code Coverage       │ ~95%       │ >90%     │
│ Security Issues     │ 0          │ 0        │
│ Failed Builds       │ 0%         │ <5%      │
│ Release Time        │ ~3 minutes │ <10 min  │
└─────────────────────────────────────────────┘

WORKFLOW FREQUENCY

CI Workflow:        Every push/PR (~10x/day)
CodeQL:             Push/PR + Weekly
Dependency Review:  Every PR (~5x/day)
Release:            On demand (tags)
```

---

## 🎓 Quick Reference

```
COMMAND CHEAT SHEET

# Trigger CI
git push origin main

# Create Release
git tag v1.0.0 && git push origin v1.0.0

# Create PR
gh pr create --base main

# View Workflow Status
gh run list
gh run view <run-id>

# Test Locally
act push                    # Run CI
act -j test                 # Run test job
act -j test --matrix node-version:20.x

# View Logs
gh run view <run-id> --log
```

---

**Legend:**
- ✅ Success
- ❌ Failure
- ⏳ In Progress
- 🔒 Secure
- 📦 Package
- 🔧 Configuration

