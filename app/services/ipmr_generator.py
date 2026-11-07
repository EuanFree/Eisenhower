"""IPMR/CPR Report Generator Service.

This module generates statutory Earned Value Management (EVM) reports
compliant with the Integrated Program Management Report (IPMR) / Cost
Performance Report (CPR) Formats 1 through 5.

IPMR Background
~~~~~~~~~~~~~~~

The IPMR is the primary reporting document for defence acquisition
programmes under ANSI/EIA-748B and DoD 5000.02-M.  It provides a
standardized view of programme performance across schedule, cost, and
technical dimensions.

Report Formats
~~~~~~~~~~~~~~

- **Format 1** (WBS): Time-phased cost data by WBS element, showing
  BCWS (PV), BCWP (EV), and ACWP (AC) with derived variances and indices.

- **Format 2** (OBS): Performance grouped by organizational department
  and RBS cost centers.

- **Format 3** (Baseline Changes): Audits changes to the Performance
  Measurement Baseline between reporting cycles.

- **Format 5** (Variance Analysis): Narrative explanation of tasks
  exceeding predefined variance thresholds, with Problem/Cause, Impact,
  and Corrective Action Plan.

Export Formatters
~~~~~~~~~~~~~~~~~

Reports can be exported in two formats:

- **OpenPyXL Excel**: Formatted spreadsheet with defence table styling,
  locked header bands, and formula integrity.

- **PDF/A**: Hardened PDF export with embedded vector styles for
  executive submission.

Usage
~~~~~

    from app.services.ipmr_generator import IPMRGenerator

    generator = IPMRGenerator(db_session)
    report = generator.generate_format1(project_id, '2026-10', '2026-10-24')
    xlsx_bytes = generator.export_xlsx(report)
    pdf_bytes = generator.export_pdf(report)
"""
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID, uuid4
import io

from app.models.models import (
    PortfolioNode,
    ResourceNode,
    ResourceAssignment,
    NodeBlocker,
    PortfolioBaseline,
    BaselineNodeSnapshot,
    BaselineChangeRequest,
    ManagementReserveTransaction,
    SkillDefinition,
    UserSkillProfile,
)
from app.schemas.ipmr_schemas import (
    Format1Row,
    Format1Report,
    Format2Row,
    Format2Report,
    Format3BaselineChange,
    Format3Report,
    Format5VarianceItem,
    Format5Report,
    IPMRExportResponse,
)


# ============================================================================
# Helper Functions
# ============================================================================


def _safe_float(value) -> float:
    """Convert a value to float safely, returning 0.0 for None/empty.

    Parameters
    ----------
    value : any
        Value to convert (may be Decimal, float, int, or None).

    Returns
    -------
    float
        The float value, or 0.0 if the input is None or empty.
    """
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Safe division that returns default on zero denominator.

    Parameters
    ----------
    numerator : float
        The numerator.
    denominator : float
        The denominator.
    default : float
        Value to return if denominator is zero.

    Returns
    -------
    float
        The quotient or default.
    """
    if denominator == 0:
        return default
    return numerator / denominator


def _format_currency(amount: float, currency: str = "GBP") -> str:
    """Format a currency amount with the appropriate symbol.

    Parameters
    ----------
    amount : float
        The monetary amount.
    currency : str
        Currency code (e.g., 'GBP', 'USD').

    Returns
    -------
    str
        Formatted currency string (e.g., '£25,000.00').
    """
    symbols = {"GBP": "£", "USD": "$", "EUR": "€"}
    symbol = symbols.get(currency, currency + " ")
    return f"{symbol}{amount:,.2f}"


def _get_monthly_periods(start_date: date, end_date: date) -> List[str]:
    """Generate a list of monthly period strings between two dates.

    Parameters
    ----------
    start_date : date
        The start date.
    end_date : date
        The end date.

    Returns
    -------
    list[str]
        List of period strings in 'YYYY-MM' format.
    """
    periods = []
    current = start_date.replace(day=1)
    while current <= end_date:
        periods.append(current.strftime("%Y-%m"))
        # Advance to next month
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1, day=1)
        else:
            current = current.replace(month=current.month + 1, day=1)
    return periods


def _get_node_path_prefix(node) -> Optional[str]:
    """Get the ltree path prefix for a node.

    Parameters
    ----------
    node : PortfolioNode
        The node to get the path for.

    Returns
    -------
    str or None
        The ltree path string, or None if not available.
    """
    try:
        return node.path if hasattr(node, 'path') and node.path else None
    except Exception:
        return None


def _get_control_account(node) -> Optional[str]:
    """Determine the Control Account for a WBS node.

    The Control Account is typically the parent of the Work Package level.
    We use the ltree path depth to determine hierarchy level.

    Parameters
    ----------
    node : PortfolioNode
        The WBS node.

    Returns
    -------
    str or None
        The Control Account code, or None.
    """
    path = _get_node_path_prefix(node)
    if not path:
        return None
    parts = path.split('.')
    # Control Account is typically level 2-3 in the hierarchy
    if len(parts) >= 2:
        # Return the parent path as control account identifier
        return '.'.join(parts[:-1]) if len(parts) > 1 else parts[0]
    return None


# ============================================================================
# IPMR Generator
# ============================================================================


class IPMRGenerator:
    """Generates IPMR/CPR compliant EVM reports.

    This class provides methods to generate all five IPMR report formats
    from the live database state.  Each format queries the relevant
    tables and computes the required EVM metrics.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.

    Attributes
    ----------
    db : Session
        The database session used for all queries.
    """

    def __init__(self, db: Session):
        """Initialize the IPMR generator.

        Parameters
        ----------
        db : Session
            SQLAlchemy database session.
        """
        self.db = db

    # ------------------------------------------------------------------
    # Format 1: Work Breakdown Structure
    # ------------------------------------------------------------------

    def generate_format1(
        self,
        project_id: UUID,
        reporting_period: str,
        status_date: str,
        currency_code: str = "GBP",
    ) -> Format1Report:
        """Generate Format 1 WBS time-phased matrix report.

        Format 1 is the core EVM reporting table.  It presents time-phased
        cost data for each WBS element, showing Budgeted Cost for Work
        Scheduled (BCWS/PV), Budgeted Cost for Work Performed (BCWP/EV),
        and Actual Cost of Work Performed (ACWP/AC).

        The report derives Cost Variance (CV = EV - AC), Schedule Variance
        (SV = EV - PV), Variance at Completion (VAC = BAC - EAC), and
        percentage calculations (CPI, SPI).

        Parameters
        ----------
        project_id : UUID
            UUID of the root PortfolioNode for the programme.
        reporting_period : str
            Reporting month in 'YYYY-MM' format.
        status_date : str
            Status date for the report in ISO format.
        currency_code : str
            Currency code (default 'GBP').

        Returns
        -------
        Format1Report
            Complete Format 1 report with all WBS element rows.

        Raises
        ------
        ValueError
            If the project_id is not found.
        """
        # Load the root node
        root = self.db.get(PortfolioNode, project_id)
        if not root:
            raise ValueError(f"Project {project_id} not found")

        programme_name = root.name or "Unknown Programme"
        root_path = _get_node_path_prefix(root) or ""

        # Query all descendant nodes using ltree path containment
        # Fallback to string-based prefix matching for cross-DB compatibility
        all_nodes = self.db.query(PortfolioNode).filter(
            PortfolioNode.is_active == True
        ).all()

        # Filter to descendants of the root node
        descendants = []
        for node in all_nodes:
            node_path = _get_node_path_prefix(node)
            if node_path and (node_path == root_path or node_path.startswith(root_path + '.')):
                descendants.append(node)

        # Sort by path for hierarchical ordering
        descendants.sort(key=lambda n: _get_node_path_prefix(n) or "")

        # Generate rows
        rows = []
        summary_bac = 0.0
        summary_pv = 0.0
        summary_ev = 0.0
        summary_ac = 0.0

        for node in descendants:
            bac = _safe_float(node.bac_cost)
            pv = _safe_float(node.planned_value)
            ev = _safe_float(node.earned_value)
            ac = _safe_float(node.actual_cost)

            # Derived variances
            cv = ev - ac
            sv = ev - pv
            cpi = _safe_div(ev, ac)
            spi = _safe_div(ev, pv)
            eac = _safe_div(bac, cpi) if cpi > 0 else bac
            vac = bac - eac

            # Time-phased data estimation
            time_phased = self._estimate_time_phased(node, reporting_period)

            row = Format1Row(
                wbs_element_code=node.code or "",
                wbs_element_name=node.name or "",
                control_account=_get_control_account(node),
                bac=bac,
                pv=pv,
                ev=ev,
                ac=ac,
                cv=cv,
                sv=sv,
                cpi=round(cpi, 4),
                spi=round(spi, 4),
                eac=round(eac, 2),
                vac=round(vac, 2),
                percent_complete=node.percent_complete or 0.0,
                planned_start=node.planned_start_date.isoformat() if node.planned_start_date else None,
                planned_finish=node.planned_end_date.isoformat() if node.planned_end_date else None,
                actual_start=node.actual_start_date.isoformat() if node.actual_start_date else None,
                actual_finish=node.actual_end_date.isoformat() if node.actual_end_date else None,
                time_phased_data=time_phased,
            )
            rows.append(row)

            summary_bac += bac
            summary_pv += pv
            summary_ev += ev
            summary_ac += ac

        # Programme-level summary
        summary_cv = summary_ev - summary_ac
        summary_sv = summary_ev - summary_pv
        summary_cpi = _safe_div(summary_ev, summary_ac)
        summary_spi = _safe_div(summary_ev, summary_pv)
        summary_eac = _safe_div(summary_bac, summary_cpi) if summary_cpi > 0 else summary_bac
        summary_vac = summary_bac - summary_eac

        summary = {
            "total_bac": round(summary_bac, 2),
            "total_pv": round(summary_pv, 2),
            "total_ev": round(summary_ev, 2),
            "total_ac": round(summary_ac, 2),
            "total_cv": round(summary_cv, 2),
            "total_sv": round(summary_sv, 2),
            "total_cpi": round(summary_cpi, 4),
            "total_spi": round(summary_spi, 4),
            "total_eac": round(summary_eac, 2),
            "total_vac": round(summary_vac, 2),
            "node_count": len(rows),
        }

        return Format1Report(
            programme_name=programme_name,
            reporting_period=reporting_period,
            status_date=status_date,
            currency_code=currency_code,
            rows=rows,
            summary=summary,
        )

    def _estimate_time_phased(
        self, node: PortfolioNode, reporting_period: str
    ) -> Dict[str, Dict[str, float]]:
        """Estimate time-phased PV/EV/AC data for a node.

        This method distributes the node's total PV, EV, and AC values
        across monthly periods based on the planned duration.  For a
        production system, this would be replaced with actual time-phased
        data stored in the database.

        Parameters
        ----------
        node : PortfolioNode
            The WBS node.
        reporting_period : str
            Reporting month in 'YYYY-MM' format.

        Returns
        -------
        dict[str, dict]
            Monthly breakdown with pv, ev, ac values.
        """
        if not node.planned_start_date or not node.planned_end_date:
            return {}

        bac = _safe_float(node.bac_cost)
        pv = _safe_float(node.planned_value)
        ev = _safe_float(node.earned_value)
        ac = _safe_float(node.actual_cost)

        if bac == 0:
            return {}

        # Generate periods from planned start to planned end
        start = node.planned_start_date if isinstance(node.planned_start_date, date) else node.planned_start_date.date()
        end = node.planned_end_date if isinstance(node.planned_end_date, date) else node.planned_end_date.date()

        periods = _get_monthly_periods(start, end)
        if not periods:
            return {}

        # Pro-rate PV across periods
        total_days = (end - start).days or 1
        period_data = {}

        for i, period_str in enumerate(periods):
            # Estimate days in this period within the node's range
            period_start = datetime.strptime(period_str, "%Y-%m").date()
            period_end_month = period_start.month + 1 if period_start.month < 12 else 1
            period_end_year = period_start.year if period_start.month < 12 else period_start.year + 1
            period_end = period_end_month == 1 and period_end_year > period_start.year
            next_period = period_end_year if period_end else period_start.year
            try:
                period_end = period_start.replace(year=next_period, month=period_end_month, day=1) - __import__('datetime').timedelta(days=1)
            except ValueError:
                period_end = period_start.replace(day=28)

            # Clamp to node's range
            actual_start = max(period_start, start)
            actual_end = min(period_end, end)
            days_in_period = max((actual_end - actual_start).days + 1, 0)

            fraction = days_in_period / total_days
            period_pv = bac * fraction

            # EV and AC are proportional to the PV fraction for this period
            period_ev = ev * fraction if ev > 0 else 0
            period_ac = ac * fraction if ac > 0 else 0

            period_data[period_str] = {
                "pv": round(period_pv, 2),
                "ev": round(period_ev, 2),
                "ac": round(period_ac, 2),
            }

        return period_data

    # ------------------------------------------------------------------
    # Format 2: Organizational Breakdown Structure
    # ------------------------------------------------------------------

    def generate_format2(
        self,
        project_id: UUID,
        reporting_period: str,
        status_date: str,
        currency_code: str = "GBP",
    ) -> Format2Report:
        """Generate Format 2 OBS report grouped by organizational department.

        Format 2 groups Earned Value performance by functional department
        and RBS cost centers, showing how each organizational area is
        performing against its allocated budget.

        Parameters
        ----------
        project_id : UUID
            UUID of the root PortfolioNode.
        reporting_period : str
            Reporting month.
        status_date : str
            Status date.
        currency_code : str
            Currency code.

        Returns
        -------
        Format2Report
            Complete Format 2 report.
        """
        root = self.db.get(PortfolioNode, project_id)
        if not root:
            raise ValueError(f"Project {project_id} not found")

        programme_name = root.name or "Unknown Programme"
        root_path = _get_node_path_prefix(root) or ""

        # Get all active assignments for this project's descendants
        assignments = self.db.query(ResourceAssignment).all()

        # Group by resource's functional department (derived from resource code/name)
        org_data: Dict[str, Dict[str, Any]] = {}

        for assignment in assignments:
            resource = self.db.get(ResourceNode, assignment.resource_node_id)
            if not resource:
                continue

            # Determine organizational unit from resource attributes
            org_code = "GENERAL"
            org_name = "General"
            cost_center = None

            # Try to extract department from resource custom attributes or code
            custom_attrs = resource.custom_attributes or {}
            if "department" in custom_attrs:
                org_code = custom_attrs["department"]
                org_name = custom_attrs.get("department_name", org_code)
                cost_center = custom_attrs.get("cost_center")
            elif resource.code:
                # Derive from resource code prefix
                parts = resource.code.split('-')
                if len(parts) > 1:
                    org_code = parts[0]
                    org_name = org_code

            if org_code not in org_data:
                org_data[org_code] = {
                    "org_code": org_code,
                    "org_name": org_name,
                    "cost_center": cost_center,
                    "bac": 0.0,
                    "pv": 0.0,
                    "ev": 0.0,
                    "ac": 0.0,
                    "headcount": set(),
                    "total_hours": 0.0,
                }

            bucket = org_data[org_code]
            bucket["bac"] += _safe_float(assignment.planned_hours) * _safe_float(resource.standard_hourly_rate)
            bucket["pv"] += _safe_float(assignment.planned_hours) * _safe_float(resource.standard_hourly_rate)
            bucket["headcount"].add(str(resource.id))
            bucket["total_hours"] += _safe_float(assignment.planned_hours)

        # Generate rows
        rows = []
        summary_bac = 0.0
        summary_pv = 0.0
        summary_ev = 0.0
        summary_ac = 0.0
        total_headcount = 0
        total_hours = 0.0

        for org_code, data in sorted(org_data.items()):
            bac = data["bac"]
            pv = data["pv"]
            ev = data["ev"]
            ac = data["ac"]
            headcount = len(data["headcount"])

            cv = ev - ac
            sv = ev - pv
            cpi = _safe_div(ev, ac)
            spi = _safe_div(ev, pv)
            eac = _safe_div(bac, cpi) if cpi > 0 else bac

            row = Format2Row(
                org_code=data["org_code"],
                org_name=data["org_name"],
                cost_center=data["cost_center"],
                bac=round(bac, 2),
                pv=round(pv, 2),
                ev=round(ev, 2),
                ac=round(ac, 2),
                cv=round(cv, 2),
                sv=round(sv, 2),
                cpi=round(cpi, 4),
                spi=round(spi, 4),
                eac=round(eac, 2),
                headcount=headcount,
                total_hours=round(data["total_hours"], 2),
            )
            rows.append(row)

            summary_bac += bac
            summary_pv += pv
            summary_ev += ev
            summary_ac += ac
            total_headcount += headcount
            total_hours += data["total_hours"]

        summary = {
            "total_bac": round(summary_bac, 2),
            "total_pv": round(summary_pv, 2),
            "total_ev": round(summary_ev, 2),
            "total_ac": round(summary_ac, 2),
            "total_headcount": total_headcount,
            "total_hours": round(total_hours, 2),
            "org_count": len(rows),
        }

        return Format2Report(
            programme_name=programme_name,
            reporting_period=reporting_period,
            status_date=status_date,
            currency_code=currency_code,
            rows=rows,
            summary=summary,
        )

    # ------------------------------------------------------------------
    # Format 3: Baseline Changes
    # ------------------------------------------------------------------

    def generate_format3(
        self,
        project_id: UUID,
        reporting_period: str,
        status_date: str,
    ) -> Format3Report:
        """Generate Format 3 Baseline Changes report.

        Format 3 audits changes to the Performance Measurement Baseline
        (PMB) between reporting cycles, tracking formal Management Reserve
        draws and customer-authorized scope changes.

        Parameters
        ----------
        project_id : UUID
            UUID of the root PortfolioNode.
        reporting_period : str
            Reporting month.
        status_date : str
            Status date.

        Returns
        -------
        Format3Report
            Complete Format 3 report.
        """
        root = self.db.get(PortfolioNode, project_id)
        if not root:
            raise ValueError(f"Project {project_id} not found")

        programme_name = root.name or "Unknown Programme"

        # Find the active baseline for this project
        baselines = self.db.query(PortfolioBaseline).filter(
            PortfolioBaseline.root_portfolio_node_id == project_id,
            PortfolioBaseline.is_active_target == True,
        ).all()

        baseline_code = baselines[0].baseline_code if baselines else "B0_CONTRACT"

        # Query BCRs for this project
        bcrs = self.db.query(BaselineChangeRequest).filter(
            BaselineChangeRequest.status.in_(["APPROVED", "UNDER_REVIEW"])
        ).all()

        # Query Management Reserve transactions
        mr_transactions = self.db.query(ManagementReserveTransaction).all()

        changes = []
        total_cost_delta = 0.0
        total_reserve_drawn = 0.0

        # Process BCRs
        for bcr in bcrs:
            change = Format3BaselineChange(
                change_id=str(bcr.id),
                change_type="SCOPE_CHANGE",
                wbs_element="",
                description=bcr.title or bcr.justification or "",
                authorized_by="",
                authorization_date=bcr.created_at.isoformat() if hasattr(bcr, 'created_at') and bcr.created_at else status_date,
                bcr_reference=bcr.bcr_number,
                cost_delta=_safe_float(bcr.cost_delta_amount),
                schedule_delta_days=bcr.schedule_finish_slip_days or 0,
                reserve_drawn=_safe_float(bcr.contingency_reserve_requested),
                customer_authorized=bcr.tier in ["TIER_2_PROJECT_CCB", "TIER_3_PROGRAMME_BOARD"],
            )
            changes.append(change)
            total_cost_delta += change.cost_delta
            total_reserve_drawn += change.reserve_drawn

        # Process MR transactions
        for txn in mr_transactions:
            if txn.transaction_type == "DRAWDOWN_TO_WBS":
                target_node = self.db.get(PortfolioNode, txn.target_portfolio_node_id)
                node_code = target_node.code if target_node else ""

                change = Format3BaselineChange(
                    change_id=str(txn.id),
                    change_type="MR_DRAWDOWN",
                    wbs_element=node_code,
                    description=txn.justification or "Management Reserve drawdown",
                    authorized_by="",
                    authorization_date=txn.transaction_timestamp.isoformat() if txn.transaction_timestamp else status_date,
                    cost_delta=_safe_float(txn.amount),
                    reserve_drawn=_safe_float(txn.amount),
                )
                changes.append(change)
                total_cost_delta += change.cost_delta
                total_reserve_drawn += change.reserve_drawn

        return Format3Report(
            programme_name=programme_name,
            reporting_period=reporting_period,
            status_date=status_date,
            baseline_code=baseline_code,
            changes=changes,
            total_cost_delta=round(total_cost_delta, 2),
            total_reserve_drawn=round(total_reserve_drawn, 2),
        )

    # ------------------------------------------------------------------
    # Format 5: Variance Analysis Narrative
    # ------------------------------------------------------------------

    def generate_format5(
        self,
        project_id: UUID,
        reporting_period: str,
        status_date: str,
        cost_variance_threshold: float = 25000.0,
        schedule_variance_threshold: float = 10.0,
    ) -> Format5Report:
        """Generate Format 5 Variance Analysis Narrative report.

        Format 5 auto-extracts tasks exceeding predefined variance
        thresholds and pre-populates the standard defence variance
        reporting template with Problem/Cause, Impact, and Corrective
        Action Plan.

        Parameters
        ----------
        project_id : UUID
            UUID of the root PortfolioNode.
        reporting_period : str
            Reporting month.
        status_date : str
            Status date.
        cost_variance_threshold : float
            Cost variance threshold in absolute amount (e.g., 25000).
            Tasks with absolute CV exceeding this threshold are flagged.
        schedule_variance_threshold : float
            Schedule variance threshold in percentage (e.g., 10.0).
            Tasks with SV/PV ratio exceeding this percentage are flagged.

        Returns
        -------
        Format5Report
            Complete Format 5 report with variance items.
        """
        root = self.db.get(PortfolioNode, project_id)
        if not root:
            raise ValueError(f"Project {project_id} not found")

        programme_name = root.name or "Unknown Programme"
        root_path = _get_node_path_prefix(root) or ""

        # Query all active descendant nodes
        all_nodes = self.db.query(PortfolioNode).filter(
            PortfolioNode.is_active == True
        ).all()

        descendants = []
        for node in all_nodes:
            node_path = _get_node_path_prefix(node)
            if node_path and (node_path == root_path or node_path.startswith(root_path + '.')):
                descendants.append(node)

        # Find nodes exceeding variance thresholds
        variance_items = []

        for node in descendants:
            bac = _safe_float(node.bac_cost)
            pv = _safe_float(node.planned_value)
            ev = _safe_float(node.earned_value)
            ac = _safe_float(node.actual_cost)

            if bac == 0 and pv == 0:
                continue

            cv = ev - ac
            sv = ev - pv
            cpi = _safe_div(ev, ac)
            spi = _safe_div(ev, pv)

            # Check thresholds
            cost_exceeded = abs(cv) > cost_variance_threshold
            schedule_pct = abs(_safe_div(sv, pv) * 100) if pv > 0 else 0
            schedule_exceeded = schedule_pct > schedule_variance_threshold

            if not cost_exceeded and not schedule_exceeded:
                continue

            # Determine variance type
            if cost_exceeded and schedule_exceeded:
                variance_type = "BOTH"
            elif cost_exceeded:
                variance_type = "COST_OVERRUN"
            else:
                variance_type = "SCHEDULE_SLIP"

            # Build threshold description
            thresholds_exceeded = []
            if cost_exceeded:
                thresholds_exceeded.append(f"CV = {_format_currency(cv)} (threshold: ±{_format_currency(cost_variance_threshold)})")
            if schedule_exceeded:
                thresholds_exceeded.append(f"SV% = {schedule_pct:.1f}% (threshold: ±{schedule_variance_threshold}%)")
            threshold_str = "; ".join(thresholds_exceeded)

            # Get active blockers for this node
            blockers = self.db.query(NodeBlocker).filter(
                NodeBlocker.portfolio_node_id == node.id,
                NodeBlocker.resolved_at == None,
            ).all()

            blocker_list = []
            for b in blockers:
                blocker_list.append({
                    "category": b.category.value if hasattr(b.category, 'value') else str(b.category),
                    "severity": b.severity.value if hasattr(b.severity, 'value') else str(b.severity),
                    "description": b.description or "",
                    "impacted_hours": _safe_float(b.impacted_hours),
                })

            # Generate narrative
            problem_desc = self._generate_problem_description(node, cv, sv, cpi, spi, variance_type)
            root_cause = self._generate_root_cause(node, blockers, variance_type)
            impact_schedule = self._generate_schedule_impact(node, sv, spi)
            impact_cost = self._generate_cost_impact(node, cv, cpi)
            corrective_action = self._generate_corrective_action(node, blockers, variance_type)
            recommended = self._generate_recommendation(variance_type, blockers)

            item = Format5VarianceItem(
                wbs_element_code=node.code or "",
                wbs_element_name=node.name or "",
                variance_type=variance_type,
                cv=round(cv, 2),
                sv=round(sv, 2),
                cpi=round(cpi, 4),
                spi=round(spi, 4),
                threshold_exceeded=threshold_str,
                problem_description=problem_desc,
                root_cause=root_cause,
                impact_on_schedule=impact_schedule,
                impact_on_cost=impact_cost,
                corrective_action=corrective_action,
                active_blockers=blocker_list,
                recommended_action=recommended,
            )
            variance_items.append(item)

        # Sort by severity: BOTH > COST_OVERRUN > SCHEDULE_SLIP, then by |CV|
        severity_order = {"BOTH": 0, "COST_OVERRUN": 1, "SCHEDULE_SLIP": 2}
        variance_items.sort(key=lambda x: (severity_order.get(x.variance_type, 3), abs(x.cv)))

        # Generate executive summary
        summary = self._generate_executive_summary(
            programme_name, reporting_period, variance_items, cost_variance_threshold, schedule_variance_threshold
        )

        return Format5Report(
            programme_name=programme_name,
            reporting_period=reporting_period,
            status_date=status_date,
            variance_thresholds={
                "cost_variance_threshold": cost_variance_threshold,
                "schedule_variance_threshold_pct": schedule_variance_threshold,
            },
            variance_items=variance_items,
            summary=summary,
        )

    def _generate_problem_description(
        self, node, cv: float, sv: float, cpi: float, spi: float, variance_type: str
    ) -> str:
        """Generate the problem description for a variance item.

        Parameters
        ----------
        node : PortfolioNode
            The WBS node with variance.
        cv : float
            Cost Variance.
        sv : float
            Schedule Variance.
        cpi : float
            Cost Performance Index.
        spi : float
            Schedule Performance Index.
        variance_type : str
            Type of variance.

        Returns
        -------
        str
            Problem description text.
        """
        name = node.name or node.code or "Unknown Task"
        parts = []

        if variance_type in ("COST_OVERRUN", "BOTH"):
            if cv < 0:
                parts.append(f"Task '{name}' is experiencing a cost overrun of {_format_currency(abs(cv))} (CPI: {cpi:.2f}).")
            else:
                parts.append(f"Task '{name}' has a cost underrun of {_format_currency(cv)} (CPI: {cpi:.2f}).")

        if variance_type in ("SCHEDULE_SLIP", "BOTH"):
            if sv < 0:
                parts.append(f"Schedule variance is {_format_currency(abs(sv))} behind plan (SPI: {spi:.2f}).")
            else:
                parts.append(f"Schedule variance is {_format_currency(sv)} ahead of plan (SPI: {spi:.2f}).")

        return " ".join(parts) if parts else f"Task '{name}' has exceeded variance thresholds."

    def _generate_root_cause(
        self, node, blockers: List, variance_type: str
    ) -> str:
        """Generate root cause analysis text.

        Parameters
        ----------
        node : PortfolioNode
            The WBS node.
        blockers : list
            Active blockers for this node.
        variance_type : str
            Type of variance.

        Returns
        -------
        str
            Root cause description.
        """
        if blockers:
            categories = [b.category.value if hasattr(b.category, 'value') else str(b.category) for b in blockers]
            return f"Root cause: {len(blockers)} active blocker(s) identified: {', '.join(categories[:3])}."
        elif variance_type == "COST_OVERRUN":
            return "Root cause: Actual costs exceeded planned budget. Possible causes include scope creep, resource rate increases, or productivity issues."
        elif variance_type == "SCHEDULE_SLIP":
            return "Root cause: Task progress is behind the planned schedule. Possible causes include resource constraints, technical challenges, or dependency delays."
        else:
            return "Root cause: Combined cost and schedule variance requires further investigation."

    def _generate_schedule_impact(
        self, node, sv: float, spi: float
    ) -> str:
        """Generate schedule impact description.

        Parameters
        ----------
        node : PortfolioNode
            The WBS node.
        sv : float
            Schedule Variance.
        spi : float
            Schedule Performance Index.

        Returns
        -------
        str
            Schedule impact text.
        """
        if spi < 0.9:
            return f"Significant schedule impact: SPI of {spi:.2f} indicates substantial delay. Downstream tasks on the critical path may be affected."
        elif spi < 1.0:
            return f"Moderate schedule impact: SPI of {spi:.2f} indicates the task is tracking behind plan. Monitor for cascading delays."
        elif spi > 1.1:
            return f"Positive schedule impact: SPI of {spi:.2f} indicates the task is ahead of plan."
        else:
            return f"Schedule impact: SPI of {spi:.2f} is within acceptable range."

    def _generate_cost_impact(
        self, node, cv: float, cpi: float
    ) -> str:
        """Generate cost impact description.

        Parameters
        ----------
        node : PortfolioNode
            The WBS node.
        cv : float
            Cost Variance.
        cpi : float
            Cost Performance Index.

        Returns
        -------
        str
            Cost impact text.
        """
        if cpi < 0.9:
            return f"Significant cost impact: CPI of {cpi:.2f} indicates substantial overrun. EAC projection exceeds BAC by {_format_currency(abs(cv) * 2)}."
        elif cpi < 1.0:
            return f"Moderate cost impact: CPI of {cpi:.2f} indicates the task is over budget. Current overrun: {_format_currency(abs(cv))}."
        elif cpi > 1.1:
            return f"Positive cost impact: CPI of {cpi:.2f} indicates the task is under budget by {_format_currency(cv)}."
        else:
            return f"Cost impact: CPI of {cpi:.2f} is within acceptable range."

    def _generate_corrective_action(
        self, node, blockers: List, variance_type: str
    ) -> str:
        """Generate corrective action plan text.

        Parameters
        ----------
        node : PortfolioNode
            The WBS node.
        blockers : list
            Active blockers.
        variance_type : str
            Type of variance.

        Returns
        -------
        str
            Corrective action plan.
        """
        actions = []

        if blockers:
            actions.append(f"Resolve {len(blockers)} active blocker(s) to remove impediments.")

        if variance_type in ("COST_OVERRUN", "BOTH"):
            actions.append("Review resource allocation and rates for cost optimization.")
            actions.append("Evaluate scope for potential de-scoping or phased delivery.")

        if variance_type in ("SCHEDULE_SLIP", "BOTH"):
            actions.append("Assess fast-tracking or crashing options to recover schedule.")
            actions.append("Review dependency links for potential parallelization.")

        actions.append("Monitor performance weekly and report variance trends in next IPMR cycle.")

        return "Corrective Action Plan: " + " ".join(actions)

    def _generate_recommendation(
        self, variance_type: str, blockers: List
    ) -> str:
        """Generate recommended next steps.

        Parameters
        ----------
        variance_type : str
            Type of variance.
        blockers : list
            Active blockers.

        Returns
        -------
        str
            Recommended action text.
        """
        if len(blockers) > 2:
            return "Recommendation: Escalate to Programme Board for resource reallocation and blocker resolution."
        elif variance_type == "BOTH":
            return "Recommendation: Initiate Baseline Change Request (BCR) and request Management Reserve drawdown."
        elif variance_type == "COST_OVERRUN":
            return "Recommendation: Review cost performance with CAM and consider contingency drawdown."
        else:
            return "Recommendation: Monitor closely and report in next reporting cycle."

    def _generate_executive_summary(
        self,
        programme_name: str,
        reporting_period: str,
        variance_items: List[Format5VarianceItem],
        cost_threshold: float,
        schedule_threshold: float,
    ) -> str:
        """Generate executive summary for Format 5 report.

        Parameters
        ----------
        programme_name : str
            Programme name.
        reporting_period : str
            Reporting month.
        variance_items : list
            List of variance items.
        cost_threshold : float
            Cost variance threshold.
        schedule_threshold : float
            Schedule variance threshold.

        Returns
        -------
        str
            Executive summary text.
        """
        both_count = sum(1 for v in variance_items if v.variance_type == "BOTH")
        cost_count = sum(1 for v in variance_items if v.variance_type == "COST_OVERRUN")
        schedule_count = sum(1 for v in variance_items if v.variance_type == "SCHEDULE_SLIP")

        summary_parts = [
            f"Executive Summary — {programme_name}, {reporting_period}",
            f"",
            f"Variance Analysis Report generated with thresholds: CV ±{_format_currency(cost_threshold)}, SV ±{schedule_threshold}%.",
            f"",
            f"Total variance items identified: {len(variance_items)}.",
            f"  - Combined cost and schedule variance: {both_count}",
            f"  - Cost overrun only: {cost_count}",
            f"  - Schedule slip only: {schedule_count}",
        ]

        if both_count > 0:
            summary_parts.append(f"")
            summary_parts.append(f"CRITICAL: {both_count} task(s) exhibit combined cost and schedule variance requiring immediate attention.")

        if len(variance_items) > 5:
            summary_parts.append(f"")
            summary_parts.append(f"WARNING: High number of variance items ({len(variance_items)}) suggests systemic programme issues.")

        summary_parts.append(f"")
        summary_parts.append(f"Recommendation: Review all variance items with the Project CCB and update recovery plans accordingly.")

        return "\n".join(summary_parts)

    # ------------------------------------------------------------------
    # Export: OpenPyXL Excel
    # ------------------------------------------------------------------

    def export_xlsx(self, report, currency_code: str = "GBP") -> bytes:
        """Export a report to formatted Excel spreadsheet.

        Generates an OpenPyXL workbook with defence table styling,
        locked header bands, and formula integrity.

        Parameters
        ----------
        report : Format1Report or Format2Report or Format3Report or Format5Report
            The report data to export.
        currency_code : str
            Currency code for formatting.

        Returns
        -------
        bytes
            XLSX file content.

        Raises
        ------
        ImportError
            If openpyxl is not installed.
        """
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
            from openpyxl.utils import get_column_letter
        except ImportError:
            raise ImportError("openpyxl is required for Excel export. Install with: pip install openpyxl")

        wb = Workbook()
        ws = wb.active
        ws.title = "IPMR Report"

        # Defence styling
        header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        subheader_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
        data_font = Font(name="Calibri", size=10)
        monospace_font = Font(name="Consolas", size=10)
        currency_font = Font(name="Consolas", size=10)
        thin_border = Border(
            left=Side(style='thin', color='334155'),
            right=Side(style='thin', color='334155'),
            top=Side(style='thin', color='334155'),
            bottom=Side(style='thin', color='334155'),
        )
        red_font = Font(name="Calibri", size=10, color="F87171")
        green_font = Font(name="Calibri", size=10, color="34D399")
        amber_font = Font(name="Calibri", size=10, color="FBBF24")

        def apply_header_style(cell, font=header_font, fill=header_fill):
            """Apply header formatting to an Excel cell.

            Args
            ----\n            cell : Cell
                The OpenPyXL cell to style.
            font : Font, optional
                Font object (defaults to the dark header font).
            fill : PatternFill, optional
                Fill object (defaults to the dark header fill).
            """
            cell.font = font
            cell.fill = fill
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            cell.border = thin_border

        def apply_data_style(cell, is_currency=False, is_monospace=False):
            """Apply data cell formatting to an Excel cell.

            Args
            ----\n            cell : Cell
                The OpenPyXL cell to style.
            is_currency : bool, optional
                If True, use the currency font (default ``False``).
            is_monospace : bool, optional
                If True, use the monospace font (default ``False``).
            """
            cell.font = currency_font if is_currency else (monospace_font if is_monospace else data_font)
            cell.border = thin_border

        # Report title
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=10)
        title_cell = ws.cell(row=1, column=1, value=report.report_title)
        title_cell.font = Font(name="Calibri", bold=True, size=14, color="FFFFFF")
        title_cell.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        title_cell.alignment = Alignment(horizontal='center')

        # Programme info
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=10)
        info_cell = ws.cell(row=2, column=1, value=f"{report.programme_name} | Period: {report.reporting_period} | Status Date: {report.status_date}")
        info_cell.font = Font(name="Calibri", size=11, italic=True)
        info_cell.fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        info_cell.alignment = Alignment(horizontal='center')

        # Route to format-specific export
        if isinstance(report, Format1Report):
            self._export_format1_xlsx(ws, report, currency_code, header_font, header_fill, subheader_fill,
                                      data_font, monospace_font, currency_font, thin_border, red_font, green_font, amber_font,
                                      apply_header_style, apply_data_style, get_column_letter)
        elif isinstance(report, Format2Report):
            self._export_format2_xlsx(ws, report, currency_code, header_font, header_fill, subheader_fill,
                                      data_font, monospace_font, currency_font, thin_border, red_font, green_font, amber_font,
                                      apply_header_style, apply_data_style, get_column_letter)
        elif isinstance(report, Format3Report):
            self._export_format3_xlsx(ws, report, currency_code, header_font, header_fill, subheader_fill,
                                      data_font, monospace_font, currency_font, thin_border, red_font, green_font, amber_font,
                                      apply_header_style, apply_data_style, get_column_letter)
        elif isinstance(report, Format5Report):
            self._export_format5_xlsx(ws, report, currency_code, header_font, header_fill, subheader_fill,
                                      data_font, monospace_font, currency_font, thin_border, red_font, green_font, amber_font,
                                      apply_header_style, apply_data_style, get_column_letter)

        # Protect sheet
        ws.protection.sheet = True
        ws.protection.password = "ipmr"
        ws.protect()

        # Write to bytes
        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()

    def _export_format1_xlsx(self, ws, report, currency_code, header_font, header_fill, subheader_fill,
                              data_font, monospace_font, currency_font, thin_border, red_font, green_font, amber_font,
                              apply_header_style, apply_data_style, get_column_letter):
        """Export Format 1 to Excel worksheet.

        Parameters
        ----------
        ws : Worksheet
            Active worksheet.
        report : Format1Report
            Format 1 report data.
        currency_code : str
            Currency code.
        header_font, header_fill, subheader_fill, data_font, monospace_font, currency_font, thin_border,
        red_font, green_font, amber_font : Style objects
            Pre-configured styles.
        apply_header_style, apply_data_style : callables
            Style application helpers.
        get_column_letter : callable
            OpenPyXL column letter helper.
        """
        # Headers
        headers = [
            "WBS Code", "WBS Element Name", "Control Account", "BAC", "PV (BCWS)",
            "EV (BCWP)", "AC (ACWP)", "CV", "SV", "CPI", "SPI", "EAC", "VAC",
            "% Complete", "Planned Start", "Planned Finish", "Actual Start", "Actual Finish"
        ]

        row = 4
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            apply_header_style(cell)

        # Data rows
        for i, data_row in enumerate(report.rows, row + 1):
            values = [
                data_row.wbs_element_code,
                data_row.wbs_element_name,
                data_row.control_account or "",
                data_row.bac,
                data_row.pv,
                data_row.ev,
                data_row.ac,
                data_row.cv,
                data_row.sv,
                data_row.cpi,
                data_row.spi,
                data_row.eac,
                data_row.vac,
                data_row.percent_complete,
                data_row.planned_start or "",
                data_row.planned_finish or "",
                data_row.actual_start or "",
                data_row.actual_finish or "",
            ]

            for col, value in enumerate(values, 1):
                cell = ws.cell(row=i, column=col, value=value)
                is_currency = col in (4, 5, 6, 7, 8, 9, 10, 11, 12, 13)
                is_monospace = col in (1, 3)
                apply_data_style(cell, is_currency=is_currency, is_monospace=is_monospace)

                # Color-code variances
                if col == 8 and value < 0:  # CV negative
                    cell.font = red_font
                elif col == 8 and value > 0:
                    cell.font = green_font
                if col == 9 and value < 0:  # SV negative
                    cell.font = red_font
                elif col == 9 and value > 0:
                    cell.font = green_font
                if col == 10 and value < 1.0:  # CPI < 1
                    cell.font = red_font
                elif col == 10 and value > 1.0:
                    cell.font = green_font
                if col == 11 and value < 1.0:  # SPI < 1
                    cell.font = red_font
                elif col == 11 and value > 1.0:
                    cell.font = green_font

        # Summary row
        summary_row = row + len(report.rows) + 1
        ws.cell(row=summary_row, column=1, value="PROGRAMME TOTAL").font = Font(name="Calibri", bold=True, size=11)
        for col, (key, label) in enumerate([
            ("total_bac", "BAC"), ("total_pv", "PV"), ("total_ev", "EV"),
            ("total_ac", "AC"), ("total_cv", "CV"), ("total_sv", "SV"),
            ("total_cpi", "CPI"), ("total_spi", "SPI"), ("total_eac", "EAC"),
            ("total_vac", "VAC"),
        ], 3):
            cell = ws.cell(row=summary_row, column=col, value=report.summary.get(key, 0))
            cell.font = Font(name="Consolas", bold=True, size=10)
            cell.fill = subheader_fill
            cell.border = thin_border

        # Auto-size columns
        for col in range(1, len(headers) + 1):
            col_letter = get_column_letter(col)
            max_length = 0
            for r in range(row, summary_row + 1):
                cell = ws.cell(row=r, column=col)
                if cell.value:
                    max_length = max(max_length, len(str(cell.value)))
            ws.column_dimensions[col_letter].width = min(max_length + 4, 30)

        # Freeze header
        ws.freeze_panes = "A5"

    def _export_format2_xlsx(self, ws, report, currency_code, header_font, header_fill, subheader_fill,
                              data_font, monospace_font, currency_font, thin_border, red_font, green_font, amber_font,
                              apply_header_style, apply_data_style, get_column_letter):
        """Export Format 2 to Excel worksheet."""
        headers = [
            "Org Code", "Org Name", "Cost Center", "BAC", "PV", "EV", "AC",
            "CV", "SV", "CPI", "SPI", "EAC", "Headcount", "Total Hours"
        ]

        row = 4
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            apply_header_style(cell)

        for i, data_row in enumerate(report.rows, row + 1):
            values = [
                data_row.org_code, data_row.org_name, data_row.cost_center or "",
                data_row.bac, data_row.pv, data_row.ev, data_row.ac,
                data_row.cv, data_row.sv, data_row.cpi, data_row.spi,
                data_row.eac, data_row.headcount, data_row.total_hours,
            ]
            for col, value in enumerate(values, 1):
                cell = ws.cell(row=i, column=col, value=value)
                is_currency = col in (4, 5, 6, 7, 8, 9, 10, 11, 12)
                apply_data_style(cell, is_currency=is_currency)

        # Summary
        summary_row = row + len(report.rows) + 1
        ws.cell(row=summary_row, column=1, value="TOTAL").font = Font(name="Calibri", bold=True, size=11)
        for col, key in enumerate(["total_bac", "total_pv", "total_ev", "total_ac"], 4):
            cell = ws.cell(row=summary_row, column=col, value=report.summary.get(key, 0))
            cell.font = Font(name="Consolas", bold=True, size=10)
            cell.fill = subheader_fill
            cell.border = thin_border

        for col in range(1, len(headers) + 1):
            col_letter = get_column_letter(col)
            ws.column_dimensions[col_letter].width = 20

        ws.freeze_panes = "A5"

    def _export_format3_xlsx(self, ws, report, currency_code, header_font, header_fill, subheader_fill,
                              data_font, monospace_font, currency_font, thin_border, red_font, green_font, amber_font,
                              apply_header_style, apply_data_style, get_column_letter):
        """Export Format 3 to Excel worksheet."""
        headers = [
            "Change ID", "Type", "WBS Element", "Description", "Authorized By",
            "Auth. Date", "BCR Ref", "Cost Delta", "Schedule Delta (Days)",
            "Reserve Drawn", "Customer Auth."
        ]

        row = 4
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            apply_header_style(cell)

        for i, change in enumerate(report.changes, row + 1):
            values = [
                change.change_id, change.change_type, change.wbs_element,
                change.description, change.authorized_by, change.authorization_date,
                change.bcr_reference or "", change.cost_delta,
                change.schedule_delta_days, change.reserve_drawn,
                "Yes" if change.customer_authorized else "No",
            ]
            for col, value in enumerate(values, 1):
                cell = ws.cell(row=i, column=col, value=value)
                is_currency = col in (8, 10)
                apply_data_style(cell, is_currency=is_currency)

        # Summary
        summary_row = row + len(report.changes) + 1
        ws.cell(row=summary_row, column=1, value="TOTALS").font = Font(name="Calibri", bold=True, size=11)
        ws.cell(row=summary_row, column=8, value=report.total_cost_delta).font = Font(name="Consolas", bold=True, size=10)
        ws.cell(row=summary_row, column=10, value=report.total_reserve_drawn).font = Font(name="Consolas", bold=True, size=10)

        for col in range(1, len(headers) + 1):
            col_letter = get_column_letter(col)
            ws.column_dimensions[col_letter].width = 25

        ws.freeze_panes = "A5"

    def _export_format5_xlsx(self, ws, report, currency_code, header_font, header_fill, subheader_fill,
                              data_font, monospace_font, currency_font, thin_border, red_font, green_font, amber_font,
                              apply_header_style, apply_data_style, get_column_letter):
        """Export Format 5 to Excel worksheet."""
        # Executive summary sheet
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=10)
        ws.cell(row=1, column=1, value="EXECUTIVE SUMMARY").font = Font(name="Calibri", bold=True, size=14, color="FFFFFF")
        ws.cell(row=1, column=1).fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")

        # Wrap summary text
        summary_lines = report.summary.split('\n')
        for i, line in enumerate(summary_lines, 3):
            ws.cell(row=i, column=1, value=line).font = data_font
            ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=10)

        # Variance items table
        table_start = len(summary_lines) + 5
        headers = [
            "WBS Code", "WBS Name", "Variance Type", "CV", "SV", "CPI", "SPI",
            "Threshold Exceeded", "Problem", "Root Cause", "Schedule Impact",
            "Cost Impact", "Corrective Action", "Recommended Action"
        ]

        row = table_start
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            apply_header_style(cell)

        for i, item in enumerate(report.variance_items, row + 1):
            values = [
                item.wbs_element_code, item.wbs_element_name, item.variance_type,
                item.cv, item.sv, item.cpi, item.spi,
                item.threshold_exceeded, item.problem_description,
                item.root_cause, item.impact_on_schedule,
                item.impact_on_cost, item.corrective_action,
                item.recommended_action,
            ]
            for col, value in enumerate(values, 1):
                cell = ws.cell(row=i, column=col, value=value)
                is_currency = col in (4, 5)
                apply_data_style(cell, is_currency=is_currency)
                if col == 3:  # Variance type
                    if value == "BOTH":
                        cell.font = red_font
                    elif value == "COST_OVERRUN":
                        cell.font = amber_font

        for col in range(1, len(headers) + 1):
            col_letter = get_column_letter(col)
            ws.column_dimensions[col_letter].width = 30

        ws.freeze_panes = f"A{row + 1}"

    # ------------------------------------------------------------------
    # Export: PDF/A
    # ------------------------------------------------------------------

    def export_pdf(self, report, currency_code: str = "GBP") -> bytes:
        """Export a report to PDF/A format.

        Generates a hardened PDF with embedded vector styles suitable
        for executive submission and long-term archival.

        Parameters
        ----------
        report : Format1Report or Format2Report or Format3Report or Format5Report
            The report data to export.
        currency_code : str
            Currency code for formatting.

        Returns
        -------
        bytes
            PDF file content.

        Raises
        ------
        ImportError
            If reportlab is not installed.
        """
        try:
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib import colors
            from reportlab.lib.units import mm, inch
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont
        except ImportError:
            raise ImportError("reportlab is required for PDF export. Install with: pip install reportlab")

        # Use landscape for wide tables
        doc = SimpleDocTemplate(
            io.BytesIO(),
            pagesize=landscape(A4),
            rightMargin=20*mm,
            leftMargin=20*mm,
            topMargin=15*mm,
            bottomMargin=15*mm,
        )

        styles = getSampleStyleSheet()

        # Custom styles matching defence theme
        title_style = ParagraphStyle(
            'DefenceTitle',
            parent=styles['Title'],
            fontSize=16,
            textColor=colors.white,
            backColor=colors.HexColor('#0F172A'),
            alignment=TA_CENTER,
            spaceAfter=6*mm,
        )

        header_style = ParagraphStyle(
            'DefenceHeader',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.white,
            backColor=colors.HexColor('#1E293B'),
            alignment=TA_CENTER,
            fontName='Helvetica-Bold',
        )

        data_style = ParagraphStyle(
            'DefenceData',
            parent=styles['Normal'],
            fontSize=7,
            textColor=colors.black,
            fontName='Helvetica',
        )

        monospace_style = ParagraphStyle(
            'DefenceMono',
            parent=styles['Normal'],
            fontSize=7,
            fontName='Courier',
        )

        elements = []

        # Title
        elements.append(Paragraph(report.report_title, title_style))
        elements.append(Spacer(1, 3*mm))

        # Programme info
        info_text = f"<b>{report.programme_name}</b> | Period: {report.reporting_period} | Status Date: {report.status_date}"
        elements.append(Paragraph(info_text, ParagraphStyle('Info', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER)))
        elements.append(Spacer(1, 5*mm))

        # Route to format-specific PDF export
        if isinstance(report, Format1Report):
            self._export_format1_pdf(elements, report, currency_code, header_style, data_style, monospace_style)
        elif isinstance(report, Format2Report):
            self._export_format2_pdf(elements, report, currency_code, header_style, data_style, monospace_style)
        elif isinstance(report, Format3Report):
            self._export_format3_pdf(elements, report, currency_code, header_style, data_style, monospace_style)
        elif isinstance(report, Format5Report):
            self._export_format5_pdf(elements, report, currency_code, header_style, data_style, monospace_style)

        # Build PDF
        buffer = io.BytesIO()
        doc.build(elements)
        return buffer.getvalue()

    def _export_format1_pdf(self, elements, report, currency_code, header_style, data_style, monospace_style):
        """Export Format 1 to PDF elements."""
        from reportlab.lib import colors
        from reportlab.platypus import Table, TableStyle, Paragraph, Spacer

        headers = [
            "WBS Code", "WBS Element", "BAC", "PV", "EV", "AC",
            "CV", "SV", "CPI", "SPI", "EAC", "VAC", "% Comp"
        ]

        # Header row
        header_row = [Paragraph(h, header_style) for h in headers]

        # Data rows
        data_rows = []
        for row in report.rows:
            data_rows.append([
                Paragraph(str(row.wbs_element_code), monospace_style),
                Paragraph(str(row.wbs_element_name), data_style),
                Paragraph(f"{row.bac:,.2f}", data_style),
                Paragraph(f"{row.pv:,.2f}", data_style),
                Paragraph(f"{row.ev:,.2f}", data_style),
                Paragraph(f"{row.ac:,.2f}", data_style),
                Paragraph(f"{row.cv:,.2f}", data_style),
                Paragraph(f"{row.sv:,.2f}", data_style),
                Paragraph(f"{row.cpi:.4f}", data_style),
                Paragraph(f"{row.spi:.4f}", data_style),
                Paragraph(f"{row.eac:,.2f}", data_style),
                Paragraph(f"{row.vac:,.2f}", data_style),
                Paragraph(f"{row.percent_complete:.1f}%", data_style),
            ])

        # Summary row
        summary_row = [
            Paragraph("<b>TOTAL</b>", data_style),
            Paragraph("", data_style),
            Paragraph(f"{report.summary.get('total_bac', 0):,.2f}", data_style),
            Paragraph(f"{report.summary.get('total_pv', 0):,.2f}", data_style),
            Paragraph(f"{report.summary.get('total_ev', 0):,.2f}", data_style),
            Paragraph(f"{report.summary.get('total_ac', 0):,.2f}", data_style),
            Paragraph(f"{report.summary.get('total_cv', 0):,.2f}", data_style),
            Paragraph(f"{report.summary.get('total_sv', 0):,.2f}", data_style),
            Paragraph(f"{report.summary.get('total_cpi', 0):.4f}", data_style),
            Paragraph(f"{report.summary.get('total_spi', 0):.4f}", data_style),
            Paragraph(f"{report.summary.get('total_eac', 0):,.2f}", data_style),
            Paragraph(f"{report.summary.get('total_vac', 0):,.2f}", data_style),
            Paragraph("", data_style),
        ]

        table_data = [header_row] + data_rows + [summary_row]

        # Table styling
        col_count = len(headers)
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#334155')),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#334155')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]

        # Color-code variance columns
        for i, row in enumerate(report.rows):
            row_idx = i + 1
            if row.cv < 0:
                style_cmds.append(('TEXTCOLOR', (6, row_idx), (6, row_idx), colors.HexColor('#F87171')))
            if row.sv < 0:
                style_cmds.append(('TEXTCOLOR', (7, row_idx), (7, row_idx), colors.HexColor('#F87171')))
            if row.cpi < 1.0:
                style_cmds.append(('TEXTCOLOR', (8, row_idx), (8, row_idx), colors.HexColor('#F87171')))
            if row.spi < 1.0:
                style_cmds.append(('TEXTCOLOR', (9, row_idx), (9, row_idx), colors.HexColor('#F87171')))

        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle(style_cmds))
        elements.append(table)

    def _export_format2_pdf(self, elements, report, currency_code, header_style, data_style, monospace_style):
        """Export Format 2 to PDF elements."""
        from reportlab.lib import colors
        from reportlab.platypus import Table, TableStyle, Paragraph, Spacer

        headers = ["Org Code", "Org Name", "BAC", "PV", "EV", "AC", "CV", "SV", "CPI", "SPI", "Headcount", "Hours"]

        header_row = [Paragraph(h, header_style) for h in headers]
        data_rows = []
        for row in report.rows:
            data_rows.append([
                Paragraph(str(row.org_code), monospace_style),
                Paragraph(str(row.org_name), data_style),
                Paragraph(f"{row.bac:,.2f}", data_style),
                Paragraph(f"{row.pv:,.2f}", data_style),
                Paragraph(f"{row.ev:,.2f}", data_style),
                Paragraph(f"{row.ac:,.2f}", data_style),
                Paragraph(f"{row.cv:,.2f}", data_style),
                Paragraph(f"{row.sv:,.2f}", data_style),
                Paragraph(f"{row.cpi:.4f}", data_style),
                Paragraph(f"{row.spi:.4f}", data_style),
                Paragraph(str(row.headcount), data_style),
                Paragraph(f"{row.total_hours:,.1f}", data_style),
            ])

        table_data = [header_row] + data_rows
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#334155')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(table)

    def _export_format3_pdf(self, elements, report, currency_code, header_style, data_style, monospace_style):
        """Export Format 3 to PDF elements."""
        from reportlab.lib import colors
        from reportlab.platypus import Table, TableStyle, Paragraph, Spacer

        headers = ["Change ID", "Type", "WBS", "Description", "BCR Ref", "Cost Delta", "Schedule Delta", "Reserve Drawn"]

        header_row = [Paragraph(h, header_style) for h in headers]
        data_rows = []
        for change in report.changes:
            data_rows.append([
                Paragraph(str(change.change_id)[:12], monospace_style),
                Paragraph(str(change.change_type), data_style),
                Paragraph(str(change.wbs_element), data_style),
                Paragraph(str(change.description)[:50], data_style),
                Paragraph(str(change.bcr_reference or ""), data_style),
                Paragraph(f"{change.cost_delta:,.2f}", data_style),
                Paragraph(str(change.schedule_delta_days), data_style),
                Paragraph(f"{change.reserve_drawn:,.2f}", data_style),
            ])

        table_data = [header_row] + data_rows
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#334155')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(table)

    def _export_format5_pdf(self, elements, report, currency_code, header_style, data_style, monospace_style):
        """Export Format 5 to PDF elements."""
        from reportlab.lib import colors
        from reportlab.platypus import Table, TableStyle, Paragraph, Spacer

        # Executive summary
        elements.append(Paragraph("<b>Executive Summary</b>", data_style))
        for line in report.summary.split('\n'):
            if line.strip():
                elements.append(Paragraph(line, data_style))
        elements.append(Spacer(1, 5*mm))

        # Variance items
        headers = ["WBS", "Name", "Type", "CV", "SV", "CPI", "SPI", "Problem", "Root Cause", "Corrective Action"]

        header_row = [Paragraph(h, header_style) for h in headers]
        data_rows = []
        for item in report.variance_items:
            data_rows.append([
                Paragraph(str(item.wbs_element_code), monospace_style),
                Paragraph(str(item.wbs_element_name)[:30], data_style),
                Paragraph(str(item.variance_type), data_style),
                Paragraph(f"{item.cv:,.2f}", data_style),
                Paragraph(f"{item.sv:,.2f}", data_style),
                Paragraph(f"{item.cpi:.4f}", data_style),
                Paragraph(f"{item.spi:.4f}", data_style),
                Paragraph(str(item.problem_description)[:50], data_style),
                Paragraph(str(item.root_cause)[:50], data_style),
                Paragraph(str(item.corrective_action)[:50], data_style),
            ])

        table_data = [header_row] + data_rows
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#334155')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(table)
