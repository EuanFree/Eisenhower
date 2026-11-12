# Automated Health Check System

Comprehensive automated checking system that verifies the health of all Eisenhower application utilities without requiring human interaction.

## Overview

The system runs **three layers of checks**:

| Layer | What It Checks | Checks |
|-------|---------------|--------|
| **API Health** | All backend endpoints respond correctly | 66 endpoint checks |
| **View Rendering** | All frontend views load without errors | 5 checks |
| **Interactive Controls** | Key UI components function correctly | 8 checks |

## Quick Start

### Run All Checks
```bash
python scripts/run_health_check.py
```

### Run Specific Category
```bash
python scripts/run_health_check.py --api        # API endpoints only
python scripts/run_health_check.py --views      # View rendering only
python scripts/run_health_check.py --controls   # UI controls only
```

### Generate JSON Report
```bash
python scripts/run_health_check.py --json
```
Saves `health_report.json` in the project root.

### Run via pytest
```bash
# All E2E tests
pytest tests/e2e/ -v

# Specific category
pytest tests/e2e/test_health_check.py -v -k views
pytest tests/e2e/test_health_check.py -v -k controls
pytest tests/e2e/test_health_check.py -v -k api
```

## Check Details

### API Health Checks (66 checks)
Verifies every backend API endpoint responds with the expected HTTP status code:
- `PASS` — Endpoint returned expected status
- `SKIP` — Endpoint requires authentication (401/403)
- `FAIL` — Endpoint returned unexpected status (404, 500, etc.)
- `ERROR` — Connection failed (server not running)

### View Rendering Checks (5 checks)
| Check | Description |
|-------|-------------|
| ViewResolver Coverage | All ViewTypes have switch-case branches |
| View File Exports | All view files have valid React exports |
| View Metadata Completeness | VIEW_METADATA entries exist |
| TypeScript Compilation | `tsc --noEmit` passes (requires Node.js) |
| Vite Build | `vite build` succeeds (requires Node.js) |

### Interactive Control Checks (8 checks)
| Check | Description |
|-------|-------------|
| Ribbon Actions | Ribbon action definitions exist |
| Action Registry | builtInActions.ts has action definitions |
| Workspace Store | Required store actions present |
| Schedule Store | Required store actions present |
| Kanban Components | MiniKanban features present |
| WBS Table Components | WbsTable features present |
| Store Persistence | Zustand stores have persistence |
| Component File Integrity | All .tsx files have valid structure |

## CI/CD Integration

Add to your CI pipeline:
```yaml
- name: Run Health Checks
  run: |
    python scripts/run_health_check.py --json
    pytest tests/e2e/ -v --tb=short
```

The script exits with code `0` if all checks pass, `1` if any fail.

## Output Format

### Console Output
```
============================================================
  EISENHOWER HEALTH CHECK REPORT
  2026-11-08T20:56:50.689785
============================================================
  Total Checks:  71
  Passed:        22  ✓
  Failed:        45  ✗
  Skipped:       4  ⊘
  Errors:        0  ⚠
  Pass Rate:     31.0%
  Duration:      5.25s
============================================================
```

### JSON Report (`health_report.json`)
```json
{
  "timestamp": "2026-11-08T20:56:50.689785",
  "duration_seconds": 5.25,
  "summary": {
    "total": 71,
    "passed": 22,
    "failed": 45,
    "skipped": 4,
    "errors": 0,
    "pass_rate": 0.31
  },
  "results": [
    {
      "name": "Health Check",
      "category": "api",
      "status": "PASS",
      "message": "HTTP 200 in 12ms",
      "duration_ms": 12.5,
      "details": {"url": "/health", "status": 200}
    }
  ]
}
```

## Notes

- **API checks** require the backend server running on `http://localhost:8000`
- **View/Control checks** run locally without a server
- **TypeScript/Vite checks** require Node.js and `npm install` in `frontend/`
- API endpoints returning 404 indicate the URL path doesn't match the actual route — this is the system correctly identifying missing or misconfigured endpoints
