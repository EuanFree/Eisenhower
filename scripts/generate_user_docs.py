"""Automatic User Documentation Generator for Eisenhower Portfolio Manager.

This script introspects the FastAPI application to extract all routers,
endpoints, and their docstrings, then generates novice-friendly user
documentation in reStructuredText format for Sphinx.

The generated documentation is organised by feature area rather than by
API endpoint, making it accessible to non-technical users such as
project managers, programme managers, and defence stakeholders.

Usage
~~~~~

    python scripts/generate_user_docs.py

Output
~~~~~~

Generated files are written to ``docs/user_guide/``:

- ``index.rst`` — User guide landing page with feature overview
- ``getting-started.rst`` — First steps for new users
- ``features/`` — Per-feature user guides (one file per router tag group)
- ``roles.rst`` — Role permissions reference
- ``glossary.rst`` — Terms and definitions

Design Principles
~~~~~~~~~~~~~~~~~

1. **Auto-generated** — Run this script whenever code changes to keep
   documentation in sync with the application.
2. **Novice-friendly** — Translate technical API descriptions into plain
   English explanations of what users can do.
3. **Role-aware** — Indicate which user roles can perform each action.
4. **No manual maintenance** — All content is derived from code docstrings
   and schema descriptions.
"""

import ast
import importlib
import inspect
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
APP_DIR = PROJECT_ROOT / "app"
DOCS_DIR = PROJECT_ROOT / "docs"
USER_GUIDE_DIR = DOCS_DIR / "user_guide"
FEATURES_DIR = USER_GUIDE_DIR / "features"

# ---------------------------------------------------------------------------
# Feature categorisation — maps router tag prefixes to user-friendly
# feature areas and descriptions
# ---------------------------------------------------------------------------

FEATURE_CATEGORIES = {
    "Authentication": {
        "area": "account",
        "title": "Account & Sign-In",
        "description": (
            "Manage your account, sign in, and control your session. "
            "Learn how to log in, change your password, and view your profile."
        ),
    },
    "Users": {
        "area": "account",
        "title": "User Management",
        "description": (
            "Administrators can manage system users, assign roles, and "
            "configure clearance levels."
        ),
    },
    "Cockpit": {
        "area": "daily-work",
        "title": "Daily Cockpit",
        "description": (
            "Your personal landing page shows today's tasks, priorities, "
            "and blockers at a glance. Use it to track progress and "
            "quickly update task status."
        ),
    },
    "WBS": {
        "area": "planning",
        "title": "Work Breakdown Structure",
        "description": (
            "Organise work hierarchically using the Work Breakdown Structure. "
            "Create programmes, projects, and tasks in a tree view that "
            "reflects how work is broken down."
        ),
    },
    "Schedule": {
        "area": "planning",
        "title": "Schedule Management",
        "description": (
            "Plan and track project timelines using the Critical Path Method. "
            "Set dependencies between tasks, identify critical paths, and "
            "analyse schedule risk with Monte Carlo simulations."
        ),
    },
    "Baseline": {
        "area": "governance",
        "title": "Baseline Governance",
        "description": (
            "Capture and manage project baselines. Track changes against "
            "approved baselines and request baseline change approvals."
        ),
    },
    "EVM": {
        "area": "reporting",
        "title": "Earned Value Management",
        "description": (
            "Track project performance using Earned Value Management metrics. "
            "Monitor cost and schedule variance, and forecast final costs."
        ),
    },
    "Costing": {
        "area": "planning",
        "title": "Cost Management",
        "description": (
            "Plan and track project costs. Set budgets, record actual costs, "
            "and roll up cost data across the project hierarchy."
        ),
    },
    "Resource": {
        "area": "resources",
        "title": "Resource Management",
        "description": (
            "Manage people, facilities, and equipment. Assign resources to "
            "tasks and track availability."
        ),
    },
    "Requisition": {
        "area": "resources",
        "title": "Resource Requisitions",
        "description": (
            "Request resources for your projects. Submit requisitions, "
            "track approval status, and manage allocations."
        ),
    },
    "Procurement": {
        "area": "procurement",
        "title": "Procurement Tracking",
        "description": (
            "Track supply chain activities, purchase orders, and delivery "
            "milestones for procured items."
        ),
    },
    "Contract": {
        "area": "procurement",
        "title": "Contract Deliverables",
        "description": (
            "Manage contract deliverables (CDRLs) and verification & "
            "validation (V&V) test cases."
        ),
    },
    "Supplier": {
        "area": "procurement",
        "title": "Supplier Portal",
        "description": (
            "External suppliers use this portal to submit deliverables "
            "and communicate with contract managers."
        ),
    },
    "Subcontractor": {
        "area": "procurement",
        "title": "Subcontractor Management",
        "description": (
            "Manage subcontractor schedules and submissions. Ingest and "
            "reconcile subcontractor data."
        ),
    },
    "Report": {
        "area": "reporting",
        "title": "Reports",
        "description": (
            "Generate and export project reports including IPMR, CPR, "
            "and executive briefing decks."
        ),
    },
    "Briefing": {
        "area": "reporting",
        "title": "Executive Briefings",
        "description": (
            "Create PowerPoint briefing decks for executive reviews "
            "with automated data from your projects."
        ),
    },
    "IPMR": {
        "area": "reporting",
        "title": "IPMR Reports",
        "description": (
            "Generate Integrated Program Management Report (IPMR) "
            "documents for programme oversight."
        ),
    },
    "Notification": {
        "area": "collaboration",
        "title": "Notifications",
        "description": (
            "Configure alerts and webhook notifications to stay informed "
            "about project changes."
        ),
    },
    "Template": {
        "area": "planning",
        "title": "Templates",
        "description": (
            "Create and reuse project templates to standardise "
            "project setup across the organisation."
        ),
    },
    "Sandbox": {
        "area": "planning",
        "title": "Sandbox Scenarios",
        "description": (
            "Test what-if scenarios in an isolated sandbox without "
            "affecting the live project data."
        ),
    },
    "Airgap": {
        "area": "security",
        "title": "Air-Gap Data Exchange",
        "description": (
            "Securely transfer data between air-gapped environments "
            "using encrypted data packages."
        ),
    },
    "Programme": {
        "area": "governance",
        "title": "Programme Management",
        "description": (
            "Manage programme lifecycle from initiation through closeout. "
            "Archive completed programmes for long-term storage."
        ),
    },
    "Reserve": {
        "area": "governance",
        "title": "Management Reserves",
        "description": (
            "Track and govern management reserve budgets. Request "
            "drawdowns and monitor remaining reserves."
        ),
    },
    "Clash": {
        "area": "planning",
        "title": "Schedule Clashes",
        "description": (
            "Detect and resolve schedule conflicts between overlapping "
            "projects and resource assignments."
        ),
    },
    "Leveling": {
        "area": "planning",
        "title": "Resource Leveling",
        "description": (
            "Automatically balance resource allocation to avoid "
            "over-allocation and optimise utilisation."
        ),
    },
    "Risk": {
        "area": "planning",
        "title": "Schedule Risk Analysis",
        "description": (
            "Run Monte Carlo simulations to quantify schedule risk "
            "and determine confidence levels for completion dates."
        ),
    },
    "Artifact": {
        "area": "documents",
        "title": "Document Vault",
        "description": (
            "Store and retrieve project documents in a secure vault "
            "with version control and access restrictions."
        ),
    },
    "Spatial": {
        "area": "resources",
        "title": "Location Tracking",
        "description": (
            "Track resource locations and manage facility assignments."
        ),
    },
    "Facility": {
        "area": "resources",
        "title": "Facility Management",
        "description": (
            "Reserve and manage facility usage. Track chamber telemetry "
            "and environmental conditions."
        ),
    },
    "Audit": {
        "area": "security",
        "title": "Audit Trail",
        "description": (
            "View the immutable audit trail of all data changes. "
            "Verify chain integrity and investigate modifications."
        ),
    },
    "Admin": {
        "area": "administration",
        "title": "System Administration",
        "description": (
            "System-wide administration tasks including security "
            "configuration, database health, and maintenance."
        ),
    },
    "Display": {
        "area": "account",
        "title": "Display Settings",
        "description": (
            "Customise your display preferences including theme, density, "
            "and colour accessibility options."
        ),
    },
    "MCP": {
        "area": "ai",
        "title": "AI Assistant (MCP)",
        "description": (
            "Use the AI assistant to query project data and perform "
            "actions through natural language."
        ),
    },
    "Copilot": {
        "area": "ai",
        "title": "CoPilot AI",
        "description": (
            "Chat with the CoPilot AI assistant to get help with "
            "project management tasks and data queries."
        ),
    },
    "Preview": {
        "area": "daily-work",
        "title": "Quick Previews",
        "description": (
            "Hover over items to see quick previews without navigating "
            "away from your current view."
        ),
    },
    "Merkle": {
        "area": "security",
        "title": "Data Synchronisation",
        "description": (
            "Synchronise data across multiple sites using Merkle tree "
            "verification to ensure data integrity."
        ),
    },
    "WebSocket": {
        "area": "collaboration",
        "title": "Real-Time Collaboration",
        "description": (
            "See live updates from other users working on the same "
            "project data."
        ),
    },
    "View": {
        "area": "daily-work",
        "title": "Views & Presets",
        "description": (
            "Save and share custom views of your project data. "
            "Import and export view configurations."
        ),
    },
    "Preset": {
        "area": "daily-work",
        "title": "Multi-View Presets",
        "description": (
            "Create presets that combine multiple views for "
            "comprehensive project dashboards."
        ),
    },
    "Equipment": {
        "area": "resources",
        "title": "Equipment Management",
        "description": (
            "Track equipment calibration schedules and maintenance "
            "requirements."
        ),
    },
    "Engineering": {
        "area": "governance",
        "title": "Engineering Governance",
        "description": (
            "Manage engineering concessions, design assurance levels, "
            "and gate reviews."
        ),
    },
    "Commercial": {
        "area": "governance",
        "title": "Commercial Governance",
        "description": (
            "Manage contracts, fiscal caps, and commercial acceptance "
            "processes."
        ),
    },
    "Material": {
        "area": "resources",
        "title": "Materials Management",
        "description": (
            "Track perishable materials and their clearance lifecycle."
        ),
    },
    "Quarantine": {
        "area": "governance",
        "title": "Schedule Quarantine",
        "description": (
            "Quarantine schedules that fail integrity checks and "
            "remediate issues before they affect the live plan."
        ),
    },
    "Lease": {
        "area": "collaboration",
        "title": "Check-Out Leases",
        "description": (
            "Check out sections of the project tree for exclusive "
            "editing to prevent conflicts."
        ),
    },
    "Backup": {
        "area": "administration",
        "title": "Database Backup",
        "description": (
            "Manage database backups and restore operations."
        ),
    },
    "Dashboard": {
        "area": "daily-work",
        "title": "Dashboard",
        "description": (
            "View aggregated project statistics, summaries, and "
            "activity feeds."
        ),
    },
    "Export": {
        "area": "reporting",
        "title": "Data Export",
        "description": (
            "Export project data to various formats including Excel, "
            "Primavera P6, and Microsoft Project."
        ),
    },
    "Delegation": {
        "area": "resources",
        "title": "Delegation Management",
        "description": (
            "Delegate tasks and responsibilities to team members. "
            "Track delegation status and handover progress."
        ),
    },
    "Leave": {
        "area": "resources",
        "title": "Leave Management",
        "description": (
            "Request and manage leave. Line managers can approve "
            "leave requests and view team availability."
        ),
    },
    "Line Manager": {
        "area": "resources",
        "title": "Line Manager Dashboard",
        "description": (
            "Overview of team workload, skills, and availability "
            "for line managers."
        ),
    },
    "Calendar": {
        "area": "planning",
        "title": "Working Calendars",
        "description": (
            "Define working calendars that control which days are "
            "considered working days for schedule calculations."
        ),
    },
    "Currency": {
        "area": "planning",
        "title": "Currency Exchange",
        "description": (
            "Manage multi-currency cost tracking with exchange rate "
            "conversions."
        ),
    },
    "Oracle": {
        "area": "integration",
        "title": "Oracle Integration",
        "description": (
            "Integrate with Oracle ERP for timesheet and financial data."
        ),
    },
    "Clash": {
        "area": "planning",
        "title": "Schedule Clashes",
        "description": (
            "Detect and resolve schedule conflicts between overlapping "
            "projects and resource assignments."
        ),
    },
    "Leveling": {
        "area": "planning",
        "title": "Resource Leveling",
        "description": (
            "Automatically balance resource allocation to avoid "
            "over-allocation and optimise utilisation."
        ),
    },
    "Risk": {
        "area": "planning",
        "title": "Schedule Risk Analysis",
        "description": (
            "Run Monte Carlo simulations to quantify schedule risk "
            "and determine confidence levels for completion dates."
        ),
    },
    "Facility": {
        "area": "resources",
        "title": "Facility Management",
        "description": (
            "Reserve and manage facility usage. Track chamber telemetry "
            "and environmental conditions."
        ),
    },
    "Line Manager": {
        "area": "resources",
        "title": "Line Manager Dashboard",
        "description": (
            "Overview of team workload, skills, and availability "
            "for line managers."
        ),
    },
    "Leave": {
        "area": "resources",
        "title": "Leave Management",
        "description": (
            "Request and manage leave. Line managers can approve "
            "leave requests and view team availability."
        ),
    },
    "Quarantine": {
        "area": "governance",
        "title": "Schedule Quarantine",
        "description": (
            "Quarantine schedules that fail integrity checks and "
            "remediate issues before they affect the live plan."
        ),
    },
    "Preset": {
        "area": "daily-work",
        "title": "Multi-View Presets",
        "description": (
            "Create presets that combine multiple views for "
            "comprehensive project dashboards."
        ),
    },
    "Other": {
        "area": "daily-work",
        "title": "Other Features",
        "description": (
            "Additional features and utilities."
        ),
    },
}  # noqa: E501


# ---------------------------------------------------------------------------
# Role definitions
# ---------------------------------------------------------------------------

ROLES = {
    "Admin": {
        "description": "Full system access. Can manage all users, configure security, and perform administrative tasks.",
        "can": [
            "Manage all users and their roles",
            "Configure system-wide security settings",
            "Access all data regardless of clearance",
            "Perform database maintenance and backups",
            "View and manage audit trails",
        ],
    },
    "Manager": {
        "description": "Can create and manage portfolios, projects, and tasks. Can assign team members and manage resources.",
        "can": [
            "Create and edit portfolios and projects",
            "Assign tasks to team members",
            "Manage resource allocations",
            "View reports and generate briefings",
            "Approve baseline changes",
        ],
    },
    "Member": {
        "description": "Can create and edit tasks within assigned portfolios. Can update progress and report blockers.",
        "can": [
            "Create and edit tasks in assigned portfolios",
            "Update task progress and status",
            "Report blockers and impediments",
            "View assigned resources and schedules",
            "Submit resource requisitions",
        ],
    },
    "Viewer": {
        "description": "Read-only access to data for which they have clearance. Cannot modify any data.",
        "can": [
            "View portfolios, projects, and tasks (read-only)",
            "View schedules and reports",
            "Access documents within clearance level",
        ],
    },
}


# ---------------------------------------------------------------------------
# Glossary terms extracted from the codebase
# ---------------------------------------------------------------------------

GLOSSARY_TERMS = {
    "ABAC": "Attribute-Based Access Control — a security model that restricts data access based on user clearance levels and security caveats.",
    "BCR": "Baseline Change Request — a formal request to modify an approved project baseline.",
    "CDRL": "Contract Data Requirement List — a list of deliverables required by a contract.",
    "CPM": "Critical Path Method — a scheduling algorithm that identifies the longest sequence of dependent tasks, determining the minimum project duration.",
    "CPI": "Cost Performance Index — a measure of cost efficiency (EV/AC). Values below 1.0 indicate over-budget performance.",
    "CPR": "Cost Performance Report — a standard defence reporting format for programme cost data.",
    "DCMA 14-Point": "A 14-point schedule integrity checklist used by the Defence Contract Management Agency to validate project schedules.",
    "EAC": "Estimate at Completion — the predicted total cost of a project based on current performance.",
    "EVM": "Earned Value Management — a project management technique that integrates scope, schedule, and cost to measure performance.",
    "EV": "Earned Value — the value of work performed, expressed in monetary terms.",
    "Float": "The amount of time a task can be delayed without affecting the project completion date.",
    "IPMR": "Integrated Program Management Report — a comprehensive defence programme report combining scope, schedule, and cost data.",
    "ltree": "A PostgreSQL extension for storing and querying tree-structured data, used for the hierarchical project model.",
    "PV": "Planned Value — the authorised budget for work scheduled to be completed by a given date.",
    "SCIF": "Sensitive Compartmented Information Facility — a secure room where classified information is handled.",
    "SPI": "Schedule Performance Index — a measure of schedule efficiency (EV/PV). Values below 1.0 indicate behind-schedule performance.",
    "UBN": "Universal Breakdown Node — the core data model that unifies work, resource, and location hierarchies.",
    "V&V": "Verification and Validation — the process of confirming that deliverables meet requirements.",
    "VAC": "Variance at Completion — the predicted total cost variance at project completion.",
    "WBS": "Work Breakdown Structure — a hierarchical decomposition of the total scope of work.",
    "WORM": "Write Once, Read Many — a storage model that prevents data modification after initial write, used for archival.",
    "defpack": "The encrypted data package format used for air-gap transfers between secure environments.",
}


# ---------------------------------------------------------------------------
# Introspection helpers
# ---------------------------------------------------------------------------

def _classify_tag(tag: str) -> str:
    """Map a FastAPI router tag to a feature category key.

    Uses prefix matching against FEATURE_CATEGORIES keys.
    """
    # Normalise — strip trailing whitespace and special chars
    tag = tag.strip()

    # Direct match
    for key in FEATURE_CATEGORIES:
        if tag.lower().startswith(key.lower()):
            return key

    # Fuzzy — check if any category key appears in the tag
    for key in FEATURE_CATEGORIES:
        if key.lower() in tag.lower():
            return key

    return "Other"


def _extract_router_info_ast(module_path: str) -> list[dict[str, Any]]:
    """Extract router info using static AST analysis (no import needed).

    This is the fallback when the module cannot be imported (e.g., missing
    dependencies in the doc-build environment). It parses the Python source
    to find router declarations and decorated endpoint functions.

    Returns a list of dicts with keys:
        tag, prefix, module_doc, endpoints (list of {path, methods, summary, doc})
    """
    results = []
    try:
        source = Path(module_path).read_text(encoding="utf-8")
        tree = ast.parse(source, filename=module_path)
    except Exception:
        return results

    # Module docstring
    module_doc = ast.get_docstring(tree) or ""

    # Find router = APIRouter(...) call
    tags: list[str] = []
    prefix = ""
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "router":
                    if isinstance(node.value, ast.Call):
                        call = node.value
                        for kw in call.keywords:
                            if kw.arg == "tags" and isinstance(kw.value, ast.List):
                                tags = [
                                    cst.value
                                    for cst in kw.value.elts
                                    if isinstance(cst, ast.Constant)
                                ]
                            elif kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                                prefix = kw.value.value

    # If no tags found from APIRouter call, derive from module name
    if not tags:
        module_name = Path(module_path).stem
        tags = [module_name]

    # Find endpoint functions — look for @router.get(), @router.post(), etc.
    endpoints = []
    http_methods = {"get", "post", "put", "patch", "delete"}

    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue

        for decorator in node.decorator_list:
            # Match @router.get("/path") etc.
            if (
                isinstance(decorator, ast.Call)
                and isinstance(decorator.func, ast.Attribute)
                and isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "router"
                and decorator.func.attr in http_methods
            ):
                method = decorator.func.attr.upper()

                # Extract path from first positional argument
                path = "/"
                if decorator.args and isinstance(decorator.args[0], ast.Constant):
                    path = decorator.args[0].value

                # Extract summary/description keyword args
                summary = ""
                description = ""
                for kw in decorator.keywords:
                    if kw.arg == "summary" and isinstance(kw.value, ast.Constant):
                        summary = kw.value.value
                    elif kw.arg == "description" and isinstance(kw.value, ast.Constant):
                        description = kw.value.value

                # Function docstring
                func_doc = ast.get_docstring(node) or ""

                # If no explicit summary, use first line of docstring
                if not summary and func_doc:
                    summary = func_doc.split("\n")[0]

                endpoints.append({
                    "path": path,
                    "methods": [method],
                    "summary": summary,
                    "doc": func_doc,
                    "description": description,
                })

    results.append({
        "tag": tags[0] if tags else "Unknown",
        "prefix": prefix,
        "module_doc": module_doc,
        "endpoints": endpoints,
    })

    return results


def _extract_router_info(module_path: str) -> list[dict[str, Any]]:
    """Extract router tag, prefix, and endpoint info from a module.

    Tries dynamic import first (most accurate), falls back to AST-based
    static analysis if the import fails (e.g., missing dependencies).

    Returns a list of dicts with keys:
        tag, prefix, module_doc, endpoints (list of {path, methods, summary, doc})
    """
    # Try dynamic import first
    try:
        rel = os.path.relpath(module_path, PROJECT_ROOT)
        rel = rel.replace(os.sep, ".").replace(".py", "")
        module = importlib.import_module(rel)

        module_doc = inspect.getdoc(module) or ""

        # Find the router object
        router_obj = None
        for name in dir(module):
            obj = getattr(module, name)
            if name == "router" and hasattr(obj, "routes"):
                router_obj = obj
                break

        if router_obj is None:
            return _extract_router_info_ast(module_path)

        # Extract tags from the router
        tags = getattr(router_obj, "tags", [])
        prefix = getattr(router_obj, "prefix", "")

        if not tags:
            tags = [module.__name__.split(".")[-1]]

        endpoints = []
        for route in router_obj.routes:
            if hasattr(route, "methods") and hasattr(route, "path"):
                endpoint_doc = inspect.getdoc(route.endpoint) or ""
                summary = getattr(route, "summary", "") or ""
                description = getattr(route, "description", "") or ""

                if not summary and endpoint_doc:
                    summary = endpoint_doc.split("\n")[0]

                endpoints.append({
                    "path": route.path,
                    "methods": list(route.methods),
                    "summary": summary,
                    "doc": endpoint_doc,
                    "description": description,
                })

        return [{
            "tag": tags[0] if tags else "Unknown",
            "prefix": prefix,
            "module_doc": module_doc,
            "endpoints": endpoints,
        }]

    except Exception:
        # Fall back to AST-based static analysis
        return _extract_router_info_ast(module_path)


def discover_routers() -> list[dict[str, Any]]:
    """Walk the app/routers directory and extract info from all router modules."""
    routers_dir = APP_DIR / "routers"
    all_info = []

    if not routers_dir.exists():
        return all_info

    for py_file in sorted(routers_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue
        info_list = _extract_router_info(str(py_file))
        all_info.extend(info_list)

    # Also check subdirectories (e.g. admin/)
    for py_file in sorted(routers_dir.rglob("*.py")):
        if py_file.name.startswith("_"):
            continue
        if py_file.parent == routers_dir:
            continue  # already processed
        info_list = _extract_router_info(str(py_file))
        all_info.extend(info_list)

    return all_info


# ---------------------------------------------------------------------------
# RST generation helpers
# ---------------------------------------------------------------------------

def _rst_title(text: str, char: str = "=") -> str:
    """Generate an RST section title."""
    return f"{text}\n{char * len(text)}\n"


def _rst_subtitle(text: str, char: str = "-") -> str:
    """Generate an RST subsection title."""
    return f"{text}\n{char * len(text)}\n"


def _rst_subsubtitle(text: str, char: str = "~") -> str:
    """Generate an RST sub-subsection title."""
    return f"{text}\n{char * len(text)}\n"


def _translate_endpoint_to_user_language(
    method: str, path: str, summary: str, doc: str
) -> str:
    """Translate a technical endpoint description into user-friendly language."""
    # Map HTTP methods to user actions
    action_map = {
        "GET": "View",
        "POST": "Create",
        "PUT": "Update",
        "PATCH": "Modify",
        "DELETE": "Delete",
    }

    action = action_map.get(method.upper(), method.upper())

    # Clean up the path — remove technical parameters
    clean_path = re.sub(r"\{[\w_]+\}", "item", path)

    # Build a user-friendly description
    if summary:
        # Use the summary, but make it more user-friendly
        desc = summary
        # Remove technical jargon
        desc = re.sub(r"\(API\)", "", desc, flags=re.IGNORECASE)
        desc = re.sub(r"endpoint", "", desc, flags=re.IGNORECASE)
        desc = desc.strip()
        if not desc.endswith("."):
            desc = desc + "."
        return f"* **{action}**: {desc}"
    else:
        return f"* **{action} {clean_path}**"


# ---------------------------------------------------------------------------
# Main generation functions
# ---------------------------------------------------------------------------

def generate_index(routers: list[dict]) -> str:
    """Generate the user guide index page."""
    lines = [
        _rst_title("Eisenhower Portfolio Manager — User Guide"),
        "",
        "Welcome to the Eisenhower Portfolio Manager user guide. This documentation",
        "is designed to help you get started and make the most of the system,",
        "regardless of your technical background.",
        "",
        "Who Is This Guide For?",
        "=======================",
        "",
        "This guide is for everyone who uses the Eisenhower system:",
        "",
        "- **Project Managers** — Plan and track defence programmes and projects.",
        "- **Team Members** — Manage your tasks, report progress, and collaborate.",
        "- **Programme Managers** — Oversee multiple projects and generate reports.",
        "- **System Administrators** — Configure and maintain the system.",
        "- **Viewers** — Access read-only information within your clearance level.",
        "",
        "Quick Start",
        "===========",
        "",
        "New to the system? Start here:",
        "",
        ".. toctree::",
        "   :maxdepth: 1",
        "",
        "   getting-started",
        "",
        "Features",
        "========",
        "",
        "Explore the system's capabilities by feature area:",
        "",
    ]

    # Group features by area — deduplicate by category_key
    areas: dict[str, set[str]] = {}
    for router in routers:
        tag = router["tag"]
        category_key = _classify_tag(tag)
        category = FEATURE_CATEGORIES.get(category_key)
        if category:
            area = category["area"]
            if area not in areas:
                areas[area] = set()
            areas[area].add(category_key)

    # Area display names
    area_names = {
        "account": "Account & Settings",
        "daily-work": "Daily Work",
        "planning": "Planning & Scheduling",
        "resources": "Resources & People",
        "governance": "Governance & Compliance",
        "reporting": "Reports & Export",
        "procurement": "Procurement & Contracts",
        "collaboration": "Collaboration",
        "security": "Security & Audit",
        "administration": "Administration",
        "documents": "Documents",
        "ai": "AI Assistant",
        "integration": "Integrations",
    }

    for area_key in sorted(areas.keys()):
        area_name = area_names.get(area_key, area_key.title())
        lines.append(_rst_subtitle(area_name))
        lines.append("")
        for category_key in sorted(areas[area_key]):
            category = FEATURE_CATEGORIES[category_key]
            slug = category_key.lower().replace(" ", "-")
            lines.append(f"   - :doc:`features/{slug}` — {category['title']}")
        lines.append("")

    lines.extend([
        "Reference",
        "=========",
        "",
        ".. toctree::",
        "   :maxdepth: 1",
        "",
        "   roles",
        "   glossary",
        "",
        "Indices and Tables",
        "==================",
        "",
        "* :ref:`genindex`",
        "* :ref:`search`",
        "",
    ])

    return "\n".join(lines)


def generate_getting_started() -> str:
    """Generate the getting started guide."""
    lines = [
        _rst_title("Getting Started"),
        "",
        "This guide will help you take your first steps with the Eisenhower",
        "Portfolio Manager system.",
        "",
        _rst_subtitle("1. Logging In"),
        "",
        "When you first access the system, you will see a login screen.",
        "Enter the username and password provided by your system administrator.",
        "",
        "After logging in for the first time, you will be prompted to change",
        "your password. Choose a strong password that you can remember.",
        "",
        _rst_subtitle("2. Understanding Your Role"),
        "",
        "Your system administrator assigns you a role that determines what you",
        "can do in the system. The available roles are:",
        "",
    ]

    for role, info in ROLES.items():
        lines.append(f"   **{role}**")
        lines.append(f"   {info['description']}")
        lines.append("")

    lines.extend([
        _rst_subtitle("3. Your Daily Cockpit"),
        "",
        "After logging in, you land on your **Daily Cockpit** — your personal",
        "dashboard. Here you will see:",
        "",
        "- **Active Tasks** — Tasks assigned to you that are not yet complete.",
        "- **Focus Queue** — Tasks prioritised by their position on the critical path.",
        "- **Claimable Tasks** — Placeholder tasks that you can volunteer to take on.",
        "- **Upcoming Deadlines** — Tasks due within the next 48 hours.",
        "- **Blockers** — Issues that are preventing progress on your tasks.",
        "",
        _rst_subtitle("4. Navigating the System"),
        "",
        "The main navigation menu on the left provides access to all features:",
        "",
        "- **Dashboard** — High-level project statistics and activity feed.",
        "- **Programmes** — Browse and manage programme hierarchies.",
        "- **Schedule** — View and edit project timelines.",
        "- **Resources** — Manage people, equipment, and facilities.",
        "- **Reports** — Generate and export reports.",
        "- **Settings** — Configure your display preferences.",
        "",
        _rst_subtitle("5. Understanding Security Classifications"),
        "",
        "The Eisenhower system handles classified data. Each piece of information",
        "carries a security classification:",
        "",
        "- **OFFICIAL** — Standard information.",
        "- **OFFICIAL-SENSITIVE** — Information that could cause damage if disclosed.",
        "- **SECRET** — Information that could cause serious damage if disclosed.",
        "- **TOP SECRET** — Information that could cause exceptionally grave damage.",
        "",
        "You can only see data at or below your clearance level. If you encounter",
        "a **ghost node** (shown with redacted data), it means you lack clearance",
        "for that item but have clearance for items beneath it.",
        "",
        _rst_subtitle("6. Getting Help"),
        "",
        "If you need help while using the system:",
        "",
        "- Use the **Help Center** (accessible from the navigation menu) for",
        "  quick reference guides on specific topics.",
        "- Contact your system administrator for account or access issues.",
        "- Refer to this user guide for detailed feature documentation.",
        "",
    ])

    return "\n".join(lines)


def generate_feature_docs(routers: list[dict]) -> dict[str, str]:
    """Generate per-feature documentation files.

    Multiple routers that map to the same feature category are merged
    into a single documentation file.

    Returns a dict mapping filename -> RST content.
    """
    # Group routers by feature category
    categories: dict[str, list[dict]] = {}
    for router in routers:
        tag = router["tag"]
        category_key = _classify_tag(tag)
        if category_key not in categories:
            categories[category_key] = []
        categories[category_key].append(router)

    files = {}

    for category_key, category_routers in sorted(categories.items()):
        category = FEATURE_CATEGORIES.get(category_key)
        if not category:
            continue

        slug = category_key.lower().replace(" ", "-")
        filename = f"{slug}.rst"

        lines = [
            _rst_title(category["title"]),
            "",
            category["description"],
            "",
        ]

        # Collect all endpoints across routers in this category
        all_get: list[dict] = []
        all_post: list[dict] = []
        all_put: list[dict] = []
        all_delete: list[dict] = []

        for router in category_routers:
            module_doc = router.get("module_doc", "")
            if module_doc:
                lines.append(_rst_subsubtitle(router["tag"]))
                lines.append("")
                # Format module doc as proper RST - each line must not be indented
                # unless it's part of a list or definition
                for line in module_doc.strip().split("\n"):
                    # Remove leading indentation that would cause RST errors
                    stripped = line.rstrip()
                    if stripped:
                        # If line starts with spaces but isn't a list item, it's invalid
                        if stripped.startswith("    ") or stripped.startswith("\t"):
                            # Treat as a continuation - add as a quoted block
                            lines.append(f"   {stripped.strip()}")
                        else:
                            lines.append(stripped)
                    else:
                        lines.append("")
                lines.append("")

            endpoints = router.get("endpoints", [])
            for ep in endpoints:
                if "GET" in ep["methods"]:
                    all_get.append(ep)
                if "POST" in ep["methods"]:
                    all_post.append(ep)
                if "PUT" in ep["methods"] or "PATCH" in ep["methods"]:
                    all_put.append(ep)
                if "DELETE" in ep["methods"]:
                    all_delete.append(ep)

        # Write consolidated "What You Can Do" section
        if any([all_get, all_post, all_put, all_delete]):
            lines.append("What You Can Do")
            lines.append("~~~~~~~~~~~~~~~")
            lines.append("")

            if all_get:
                lines.append("**Viewing Information**")
                lines.append("")
                for ep in all_get:
                    lines.append(
                        _translate_endpoint_to_user_language(
                            "GET", ep["path"], ep["summary"], ep["doc"]
                        )
                    )
                lines.append("")

            if all_post:
                lines.append("**Creating New Items**")
                lines.append("")
                for ep in all_post:
                    lines.append(
                        _translate_endpoint_to_user_language(
                            "POST", ep["path"], ep["summary"], ep["doc"]
                        )
                    )
                lines.append("")

            if all_put:
                lines.append("**Updating Information**")
                lines.append("")
                for ep in all_put:
                    lines.append(
                        _translate_endpoint_to_user_language(
                            "PUT", ep["path"], ep["summary"], ep["doc"]
                        )
                    )
                lines.append("")

            if all_delete:
                lines.append("**Removing Items**")
                lines.append("")
                for ep in all_delete:
                    lines.append(
                        _translate_endpoint_to_user_language(
                            "DELETE", ep["path"], ep["summary"], ep["doc"]
                        )
                    )
                lines.append("")

        files[filename] = "\n".join(lines)

    return files


def generate_roles() -> str:
    """Generate the roles reference page."""
    lines = [
        _rst_title("User Roles & Permissions"),
        "",
        "The Eisenhower system uses roles to control what actions each user",
        "can perform. Your system administrator assigns you a role when",
        "creating your account.",
        "",
        "Role Overview",
        "=============",
        "",
        "+----------------+----------------------------------------------------------+",
        "| Role           | Description                                              |",
        "+================+==========================================================+",
    ]

    for role, info in ROLES.items():
        # Truncate description for table
        desc = info["description"].split(".")[0]
        lines.append(f"| {role:<16} | {desc:<54} |")
    lines.append("+----------------+----------------------------------------------------------+")
    lines.append("")

    for role, info in ROLES.items():
        lines.append(_rst_subtitle(role))
        lines.append("")
        lines.append(info["description"])
        lines.append("")
        lines.append("   Permissions:")
        lines.append("")
        for perm in info["can"]:
            lines.append(f"   - {perm}")
        lines.append("")

    return "\n".join(lines)


def generate_glossary() -> str:
    """Generate the glossary page."""
    lines = [
        _rst_title("Glossary"),
        "",
        "This glossary defines the terms and acronyms used throughout the",
        "Eisenhower system and this documentation.",
        "",
        ".. glossary::",
        "",
    ]

    for term in sorted(GLOSSARY_TERMS.keys()):
        definition = GLOSSARY_TERMS[term]
        lines.append(f"   {term}")
        lines.append("")
        lines.append(f"      {definition}")
        lines.append("")

    lines.extend([
        "Quick Reference",
        "===============",
        "",
        "Common acronyms you will encounter:",
        "",
    ])

    # Group by category
    scheduling = ["CPM", "Float", "DCMA 14-Point"]
    evm = ["EVM", "PV", "EV", "AC", "CPI", "SPI", "EAC", "VAC"]
    security = ["ABAC", "SCIF", "WORM", "defpack"]
    reporting = ["IPMR", "CPR", "CDRL", "V&V"]
    general = ["WBS", "UBN", "BCR"]

    groups = {
        "Scheduling": scheduling,
        "Earned Value": evm,
        "Security": security,
        "Reporting": reporting,
        "General": general,
    }

    for group_name, terms in groups.items():
        lines.append(_rst_subtitle(group_name))
        lines.append("")
        for term in terms:
            if term in GLOSSARY_TERMS:
                # Short definition
                short = GLOSSARY_TERMS[term].split(" — ")[0] if " — " in GLOSSARY_TERMS[term] else GLOSSARY_TERMS[term][:80]
                lines.append(f"   - **{term}**: {short}")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    """Generate all user documentation files."""
    print("Discovering routers...")
    routers = discover_routers()
    print(f"   Found {len(routers)} routers")

    # Ensure output directories exist
    USER_GUIDE_DIR.mkdir(parents=True, exist_ok=True)
    FEATURES_DIR.mkdir(parents=True, exist_ok=True)

    # Generate index
    print("Generating user guide index...")
    index_content = generate_index(routers)
    (USER_GUIDE_DIR / "index.rst").write_text(index_content, encoding="utf-8")

    # Generate getting started
    print("Generating getting started guide...")
    gs_content = generate_getting_started()
    (USER_GUIDE_DIR / "getting-started.rst").write_text(gs_content, encoding="utf-8")

    # Generate feature docs
    print("Generating feature documentation...")
    feature_files = generate_feature_docs(routers)
    for filename, content in feature_files.items():
        (FEATURES_DIR / filename).write_text(content, encoding="utf-8")
    print(f"   Generated {len(feature_files)} feature files")

    # Generate roles reference
    print("Generating roles reference...")
    roles_content = generate_roles()
    (USER_GUIDE_DIR / "roles.rst").write_text(roles_content, encoding="utf-8")

    # Generate glossary
    print("Generating glossary...")
    glossary_content = generate_glossary()
    (USER_GUIDE_DIR / "glossary.rst").write_text(glossary_content, encoding="utf-8")

    # Generate conf.py snippet for user guide inclusion
    print("Updating Sphinx configuration...")
    _update_sphinx_conf()

    print(f"\nUser documentation generated in {USER_GUIDE_DIR}")
    print(f"Feature docs: {FEATURES_DIR}")
    print("\nTo build the full documentation:")
    print(f"   cd {DOCS_DIR} && sphinx-build -b html . _build/html")


def _update_sphinx_conf():
    """Update the Sphinx conf.py to include the user guide in the build."""
    conf_path = DOCS_DIR / "conf.py"
    if not conf_path.exists():
        return

    content = conf_path.read_text(encoding="utf-8")

    # Add sphinx.ext.ifconfig extension if not present
    if "'sphinx.ext.ifconfig'" not in content:
        content = content.replace(
            "'sphinx.ext.intersphinx',   # Link to other projects' documentation",
            "'sphinx.ext.intersphinx',   # Link to other projects' documentation\n    'sphinx.ext.ifconfig',      # Conditional content for user/dev docs",
        )

    conf_path.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
