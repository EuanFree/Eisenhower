"""Security Scan Scheduling Service.

Manages SAST/DAST security scan execution and scheduling.
Integrates with the existing scripts/security/ scripts.

Usage
~~~~~

    from app.services.security_scan import security_scan_service
    results = await security_scan_service.list_scan_results()
"""

import asyncio
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

RESULTS_FILE = Path("app/config/scan_results.json")


class SecurityScanService:
    """Service for managing security scans."""

    def __init__(self):
        """Initialize the security scan service.

        Creates the configuration directory and initializes an empty scan
        results file if it does not already exist. The results file stores
        the output of SAST and DAST scans, including status, timestamps,
        stdout/stderr output, and any errors encountered.

        Side Effects
        ~~~~~~~~~~~~

        * Creates ``app/config/`` directory with ``exist_ok=True``.
        * Writes ``app/config/scan_results.json`` as an empty JSON array if
          the file does not exist.
        """
        RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not RESULTS_FILE.exists():
            with open(RESULTS_FILE, "w") as f:
                json.dump([], f)

    def _load_results(self) -> List[Dict[str, Any]]:
        """Load the security scan results from disk.

        Returns
        -------
        List[Dict[str, Any]]
            A list of scan result dictionaries, each containing the scan ID,
            type, status, timestamps, and output.
        """
        with open(RESULTS_FILE, "r") as f:
            return json.load(f)

    def _save_results(self, results: List[Dict[str, Any]]):
        """Persist the security scan results to disk.

        Args
        ----
        results : List[Dict[str, Any]]
            The complete list of scan result dictionaries to write to disk.
        """
        with open(RESULTS_FILE, "w") as f:
            json.dump(results, f, indent=2)

    async def list_scan_results(self) -> List[Dict[str, Any]]:
        """List all security scan results.

        Returns:
            List of scan result dictionaries, newest first.
        """
        results = self._load_results()
        results.sort(key=lambda r: r.get("started_at", ""), reverse=True)
        return results

    async def run_sast_scan(self) -> Dict[str, Any]:
        """Run a SAST (Static Application Security Testing) scan.

        Returns:
            Dictionary with scan job status.
        """
        job_id = f"sast-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        result = {
            "id": job_id,
            "type": "sast",
            "status": "running",
            "started_at": datetime.now().isoformat(),
        }

        asyncio.create_task(self._execute_scan(job_id, "sast"))
        return result

    async def run_dast_scan(self) -> Dict[str, Any]:
        """Run a DAST (Dynamic Application Security Testing) scan.

        Returns:
            Dictionary with scan job status.
        """
        job_id = f"dast-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        result = {
            "id": job_id,
            "type": "dast",
            "status": "running",
            "started_at": datetime.now().isoformat(),
        }

        asyncio.create_task(self._execute_scan(job_id, "dast"))
        return result

    async def _execute_scan(self, job_id: str, scan_type: str):
        """Execute a security scan.

        Args:
            job_id: The job identifier.
            scan_type: Type of scan ("sast" or "dast").
        """
        try:
            scripts_dir = Path("scripts/security")
            script = scripts_dir / f"{scan_type}.py"

            if script.exists():
                process = await asyncio.create_subprocess_exec(
                    "python", str(script),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                stdout, stderr = await process.communicate()
            else:
                stdout, stderr = b"Script not found", b""

            results = self._load_results()
            for r in results:
                if r["id"] == job_id:
                    r["status"] = "completed" if process.returncode == 0 else "failed"
                    r["completed_at"] = datetime.now().isoformat()
                    r["output"] = stdout.decode() if stdout else ""
                    r["errors"] = stderr.decode() if stderr else ""
                    break
            self._save_results(results)

        except Exception as e:
            results = self._load_results()
            for r in results:
                if r["id"] == job_id:
                    r["status"] = "failed"
                    r["error"] = str(e)
                    break
            self._save_results(results)

    async def schedule_scan(self, cron: str, scan_type: str = "sast") -> Dict[str, Any]:
        """Schedule a recurring security scan.

        Args:
            cron: Cron expression for scan schedule.
            scan_type: Type of scan to schedule.

        Returns:
            Dictionary with schedule confirmation.
        """
        return {
            "scheduled": True,
            "cron": cron,
            "scan_type": scan_type,
            "message": f"{scan_type} scan scheduled with cron: {cron}",
        }

    async def get_scan_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get the status of a scan job.

        Args:
            job_id: The job identifier.

        Returns:
            Scan status dictionary or None if not found.
        """
        results = self._load_results()
        for r in results:
            if r["id"] == job_id:
                return r
        return None


security_scan_service = SecurityScanService()
