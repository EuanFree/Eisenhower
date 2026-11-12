#!/usr/bin/env python3
"""
Convenience script to run the automated health check system.

Usage:
    python scripts/run_health_check.py                  # Run all checks
    python scripts/run_health_check.py --api            # API checks only
    python scripts/run_health_check.py --views          # View checks only
    python scripts/run_health_check.py --controls       # Control checks only
    python scripts/run_health_check.py --json           # Save JSON report
    python scripts/run_health_check.py --all --json     # All checks + JSON report
"""

import sys
import argparse
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from tests.e2e.health_check import HealthCheckOrchestrator


def main():
    parser = argparse.ArgumentParser(
        description="Eisenhower Automated Health Check System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/run_health_check.py              Run all checks
  python scripts/run_health_check.py --api        API checks only
  python scripts/run_health_check.py --views      View checks only
  python scripts/run_health_check.py --controls   Control checks only
  python scripts/run_health_check.py --json       Save JSON report
  python scripts/run_health_check.py --all --json All checks + JSON report
        """
    )
    parser.add_argument("--api", action="store_true", help="Run API checks only")
    parser.add_argument("--views", action="store_true", help="Run view checks only")
    parser.add_argument("--controls", action="store_true", help="Run control checks only")
    parser.add_argument("--all", action="store_true", help="Run all checks (default)")
    parser.add_argument("--json", action="store_true", help="Save JSON report")
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Backend API base URL (default: http://localhost:8000)"
    )

    args = parser.parse_args()

    # Determine categories
    if args.api:
        categories = ["api"]
    elif args.views:
        categories = ["views"]
    elif args.controls:
        categories = ["controls"]
    else:
        categories = None  # All

    # Auto-detect frontend directory
    frontend_dir = str(project_root / "frontend")

    orchestrator = HealthCheckOrchestrator(args.base_url, frontend_dir)
    report = orchestrator.run(categories)

    # Save JSON report if requested
    if args.json:
        import json
        report_path = project_root / "health_report.json"
        report_data = {
            "timestamp": report.timestamp,
            "duration_seconds": report.duration_seconds,
            "summary": {
                "total": report.total_checks,
                "passed": report.passed,
                "failed": report.failed,
                "skipped": report.skipped,
                "errors": report.errors,
                "pass_rate": report.pass_rate
            },
            "results": report.results
        }
        report_path.write_text(json.dumps(report_data, indent=2))
        print(f"\nJSON report saved to: {report_path}")

    # Exit code based on results
    if report.failed > 0 or report.errors > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
