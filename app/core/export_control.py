"""Export control compliance middleware for automated foreign disclosure gating.

This module enforces export control regulations by verifying user authorisation
before allowing access to controlled work packages or committing procurement
transactions.  It implements three core checks:

1. **Export Control Compliance** — Verifies a user's nationality and employer
   CAGE code against active licences attached to a work package.

2. **Foreign Disclosure Gate** — Blocks foreign nationals from accessing
   sovereign-controlled nodes unless an active, non-expired licence explicitly
   authorises their nationality.

3. **Monetary Drawdown Interlock** — Prevents procurement orders from exceeding
   the authorised monetary ceiling on a licence.

Workflow
--------

Before any action on an export-controlled node:

1. Read the node's ``export_control_regime`` (ITAR, EAR_ECCN, UK_MILITARY_LIST,
   etc.).
2. If the regime is ``NOT_CONTROLLED`` or ``OPEN_GENERAL``, access is granted.
3. Otherwise, look up active ``ExportControlLicense`` records for the node.
4. Verify the caller's nationality and employer CAGE against licence authorisations.
5. If unauthorised, abort with HTTP 403 and log an
   ``EXPORT_CONTROL_BREACH_ATTEMPT`` audit event.

Monetary Drawdown
-----------------

When committing a procurement purchase order or supplier milestone:

1. Look up the active licence for the work package.
2. Check if ``current_drawn_value + transaction_value <= monetary_ceiling``.
3. If the ceiling would be exceeded, reject the transaction.
4. On success, increment ``current_drawn_value`` atomically.

Functions
---------

- :func:`verify_export_control_compliance` — Gate access to controlled nodes.
- :func:`check_monetary_drawdown` — Validate procurement against licence ceiling.
- :func:`draw_down_license` — Atomically increment the drawn value.
- :func:`_log_breach_attempt` — Record unauthorised access attempts.
"""

from datetime import date
from decimal import Decimal
from typing import Optional, List
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from app.models.models import (
    PortfolioNode,
    ExportControlLicense,
    ExportControlLicenseType,
    IssuingAuthority,
    ExportControlRegime,
    User,
    ForensicAuditLog,
    AuditActionType,
)


class ExportControlViolationException(Exception):
    """Raised when a user attempts to access export-controlled data without authorisation.

    This exception signals an immediate access denial.  The caller should
    return HTTP 403 with the violation details.

    Attributes
    ----------
    user_id : int
        ID of the user who triggered the violation.
    node_id : UUID
        ID of the controlled node that was accessed.
    reason : str
        Human-readable explanation of the violation.
    status_code : int
        HTTP status code (403).
    headers : dict
        HTTP headers including violation flag.
    detail : str
        Detail message for the violation.
    """

    status_code = 403
    headers = {"X-Export-Control-Violation": "true"}

    def __init__(self, reason: str):
        self.reason = reason
        self.detail = reason
        super().__init__(reason)


def _get_user_nationalities(user: User) -> List[str]:
    """Extract all nationality codes for a user.

    Combines primary citizenship and any dual citizenships into a single
    list of ISO 3166-1 alpha-2 country codes.

    Parameters
    ----------
    user : User
        The user whose nationalities are being extracted.

    Returns
    -------
    list of str
        List of country codes, e.g., ``['US', 'GB']``.
    """
    nationalities: List[str] = []
    if user.primary_citizenship:
        nationalities.append(user.primary_citizenship)
    if user.dual_citizenships:
        nationalities.extend(user.dual_citizenships)
    return nationalities


def _get_active_licenses_for_node(
    db: Session,
    node_id: UUID,
    as_of_date: Optional[date] = None,
) -> List[ExportControlLicense]:
    """Retrieve all active, non-expired licences for a given node.

    A licence is considered active if:

    1. Its ``effective_date`` is on or before the check date.
    2. Its ``expiration_date`` is on or after the check date.
    3. It is linked to the specified ``portfolio_node_id``.

    Parameters
    ----------
    db : Session
        Active database session.
    node_id : UUID
        ID of the portfolio node.
    as_of_date : date or None
        Date to check against.  Defaults to today.

    Returns
    -------
    list of ExportControlLicense
        Active licences covering the node.
    """
    if as_of_date is None:
        as_of_date = date.today()

    stmt = (
        select(ExportControlLicense)
        .where(
            and_(
                ExportControlLicense.portfolio_node_id == node_id,
                ExportControlLicense.effective_date <= as_of_date,
                ExportControlLicense.expiration_date >= as_of_date,
            )
        )
    )
    return list(db.execute(stmt).scalars().all())


def _log_breach_attempt(
    db: Session,
    user: User,
    node_id: UUID,
    action_type: str,
    reason: str,
) -> None:
    """Record an export control breach attempt in the forensic audit log.

    Creates a new audit entry with action type ``EXPORT_CONTROL_BREACH_ATTEMPT``
    containing details about the unauthorised access attempt.

    Parameters
    ----------
    db : Session
        Active database session.
    user : User
        User who attempted the unauthorised access.
    node_id : UUID
        ID of the controlled node.
    action_type : str
        Description of the action attempted (e.g., "VIEW", "CREATE_ORDER").
    reason : str
        Why the access was denied.
    """
    from uuid import uuid4

    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=uuid4(),
        user_upn=user.email if user.email else f"user:{user.id}",
        client_ip=None,
        action_type=AuditActionType.EXPORT_CONTROL_BREACH_ATTEMPT,
        entity_type="PortfolioNode",
        entity_id=node_id,
        json_diff={
            "attempted_action": action_type,
            "reason": reason,
            "user_nationalities": _get_user_nationalities(user),
            "user_cage": user.assigned_vendor_cage,
        },
        security_marking="OFFICIAL",
    )
    db.add(audit_entry)
    db.flush()


def verify_export_control_compliance(
    db: Session,
    node_id: UUID,
    user: User,
    action_type: str = "VIEW",
) -> bool:
    """Verify export control compliance before allowing access to a controlled node.

    This is the primary gate function called before any action on an
    export-controlled work package.  It performs the following checks:

    1. **Regime Check** — Reads the node's ``export_control_regime``.
       If ``NOT_CONTROLLED`` or ``OPEN_GENERAL``, access is immediately granted.

    2. **Nationality Check** — For controlled regimes (ITAR, EAR_ECCN,
       UK_MILITARY_LIST), verifies the user's nationality against the node's
       ``authorized_nationalities`` and any active licences.

    3. **CAGE Code Check** — If the user has an ``assigned_vendor_cage``,
       verifies it against the authorised contractor CAGEs on active licences.

    4. **Foreign Disclosure Gate** — If the user's nationality is outside
       the home territory (e.g., a US citizen accessing a UK sovereign node),
       asserts that an active, non-expired licence explicitly authorises that
       nationality.

    If any check fails, an ``ExportControlViolationException`` is raised
    and an ``EXPORT_CONTROL_BREACH_ATTEMPT`` audit event is logged.

    Parameters
    ----------
    db : Session
        Active database session.
    node_id : UUID
        ID of the target portfolio node.
    user : User
        The user attempting the action.
    action_type : str
        Description of the action being attempted (e.g., "VIEW", "EDIT",
        "CREATE_ORDER").  Used in audit logging.

    Returns
    -------
    bool
        ``True`` if the user is authorised to access the node.

    Raises
    ------
    ExportControlViolationException
        If the user is not authorised.  The exception contains the reason
        for denial and triggers an audit log entry.
    """
    # Load the target node
    node = db.execute(select(PortfolioNode).where(PortfolioNode.id == node_id)).scalar_one_or_none()
    if node is None:
        raise ExportControlViolationException("Target node not found")

    # NOT_CONTROLLED and OPEN_GENERAL regimes do not require licensing
    regime = node.export_control_regime
    if regime in (ExportControlRegime.NOT_CONTROLLED, ExportControlRegime.OPEN_GENERAL):
        return True

    user_nationalities = _get_user_nationalities(user)
    user_cage = user.assigned_vendor_cage

    # Check node-level authorized_nationalities if set
    if node.authorized_nationalities:
        # User must have at least one matching nationality
        if not any(n in node.authorized_nationalities for n in user_nationalities):
            _log_breach_attempt(
                db, user, node_id, action_type,
                f"Nationality {user_nationalities} not in node authorized_nationalities {node.authorized_nationalities}",
            )
            raise ExportControlViolationException(
                f"Nationality {user_nationalities} not authorised for regime {regime.value}. "
                f"Authorised nationalities: {node.authorized_nationalities}"
            )

    # For ITAR, only US persons can access without a specific licence
    if regime == ExportControlRegime.ITAR:
        us_nationalities = {"US", "USA"}
        has_us_nationality = any(n in us_nationalities for n in user_nationalities)

        if not has_us_nationality:
            # Foreign national accessing ITAR data — must have an active licence
            active_licenses = _get_active_licenses_for_node(db, node_id)

            if not active_licenses:
                _log_breach_attempt(
                    db, user, node_id, action_type,
                    f"Foreign national {user_nationalities} accessing ITAR node without active licence",
                )
                raise ExportControlViolationException(
                    "ITAR-controlled data requires US person status or active export licence. "
                    f"User nationalities: {user_nationalities}"
                )

            # Check if any active licence authorises the user's nationality
            authorised = False
            for license in active_licenses:
                lic_nations = license.authorized_foreign_nations or []
                if any(n in lic_nations for n in user_nationalities):
                    # If user has a CAGE, it must also be authorised
                    if user_cage and license.authorized_contractor_cages:
                        if user_cage in license.authorized_contractor_cages:
                            authorised = True
                            break
                    else:
                        authorised = True
                        break

            if not authorised:
                _log_breach_attempt(
                    db, user, node_id, action_type,
                    f"Foreign national {user_nationalities} accessing ITAR node — no licence authorises this nationality",
                )
                raise ExportControlViolationException(
                    "No active export licence authorises your nationality for this ITAR-controlled node"
                )

    # For UK_MILITARY_LIST, check UK nationality or active licence
    if regime == ExportControlRegime.UK_MILITARY_LIST:
        uk_nationalities = {"GB", "GBR", "UK"}
        has_uk_nationality = any(n in uk_nationalities for n in user_nationalities)

        if not has_uk_nationality:
            active_licenses = _get_active_licenses_for_node(db, node_id)

            if not active_licenses:
                _log_breach_attempt(
                    db, user, node_id, action_type,
                    f"Non-UK national {user_nationalities} accessing UK military list node without licence",
                )
                raise ExportControlViolationException(
                    "UK military-list data requires UK nationality or active export licence. "
                    f"User nationalities: {user_nationalities}"
                )

            authorised = False
            for license in active_licenses:
                lic_nations = license.authorized_foreign_nations or []
                if any(n in lic_nations for n in user_nationalities):
                    if user_cage and license.authorized_contractor_cages:
                        if user_cage in license.authorized_contractor_cages:
                            authorised = True
                            break
                    else:
                        authorised = True
                        break

            if not authorised:
                _log_breach_attempt(
                    db, user, node_id, action_type,
                    f"Non-UK national {user_nationalities} — no licence authorises access",
                )
                raise ExportControlViolationException(
                    "No active export licence authorises your nationality for this UK military-list node"
                )

    # For EAR_ECCN, check authorised nationalities or active licence
    if regime == ExportControlRegime.EAR_ECCN:
        if node.authorized_nationalities is None:
            # No explicit nationality list on node — check for active licence
            active_licenses = _get_active_licenses_for_node(db, node_id)
            if active_licenses:
                authorised = False
                for license in active_licenses:
                    lic_nations = license.authorized_foreign_nations or []
                    if any(n in lic_nations for n in user_nationalities):
                        authorised = True
                        break
                if not authorised and user_nationalities:
                    _log_breach_attempt(
                        db, user, node_id, action_type,
                        f"Nationality {user_nationalities} not authorised by any active EAR licence",
                    )
                    raise ExportControlViolationException(
                        "No active EAR licence authorises your nationality for this node"
                    )

    return True


def check_monetary_drawdown(
    db: Session,
    license_id: UUID,
    transaction_value: Decimal,
) -> bool:
    """Check if a procurement transaction would exceed the licence monetary ceiling.

    Before committing a purchase order or supplier milestone, this function
    verifies that adding the transaction value to the current drawn amount
    would not exceed the authorised monetary ceiling.

    Parameters
    ----------
    db : Session
        Active database session.
    license_id : UUID
        ID of the export control licence.
    transaction_value : Decimal
        Value of the proposed transaction.

    Returns
    -------
    bool
        ``True`` if the transaction is within the ceiling.

    Raises
    ------
    ValueError
        If the transaction would exceed the monetary ceiling.
        The error message includes the remaining available amount.
    """
    license = db.execute(
        select(ExportControlLicense).where(ExportControlLicense.id == license_id)
    ).scalar_one_or_none()

    if license is None:
        raise ValueError(f"Export control licence {license_id} not found")

    # If no monetary ceiling is set, the licence has no monetary restriction
    if license.monetary_ceiling is None:
        return True

    ceiling = Decimal(str(license.monetary_ceiling))
    current_drawn = Decimal(str(license.current_drawn_value))
    remaining = ceiling - current_drawn

    if transaction_value > remaining:
        raise ValueError(
            f"Transaction value {transaction_value} exceeds remaining licence ceiling. "
            f"Ceiling: {ceiling}, Drawn: {current_drawn}, Remaining: {remaining}"
        )

    return True


def draw_down_license(
    db: Session,
    license_id: UUID,
    transaction_value: Decimal,
) -> Decimal:
    """Atomically increment the drawn value on a licence after a procurement commit.

    This function first validates the drawdown via ``check_monetary_drawdown``,
    then increments ``current_drawn_value`` by the transaction amount.

    Parameters
    ----------
    db : Session
        Active database session.
    license_id : UUID
        ID of the export control licence.
    transaction_value : Decimal
        Value to draw down from the licence ceiling.

    Returns
    -------
    Decimal
        The new ``current_drawn_value`` after the drawdown.

    Raises
    ------
    ValueError
        If the transaction would exceed the monetary ceiling.
    """
    check_monetary_drawdown(db, license_id, transaction_value)

    license = db.execute(
        select(ExportControlLicense).where(ExportControlLicense.id == license_id)
    ).scalar_one_or_none()

    if license is None:
        raise ValueError(f"Export control licence {license_id} not found")

    current_drawn = Decimal(str(license.current_drawn_value))
    new_value = current_drawn + transaction_value
    license.current_drawn_value = new_value
    db.flush()

    return new_value


def get_license_remaining(
    db: Session,
    license_id: UUID,
) -> Optional[Decimal]:
    """Calculate the remaining monetary ceiling for a licence.

    Parameters
    ----------
    db : Session
        Active database session.
    license_id : UUID
        ID of the export control licence.

    Returns
    -------
    Decimal or None
        Remaining amount available under the licence, or ``None`` if the
        licence has no monetary ceiling or is not found.
    """
    license = db.execute(
        select(ExportControlLicense).where(ExportControlLicense.id == license_id)
    ).scalar_one_or_none()

    if license is None:
        return None

    if license.monetary_ceiling is None:
        return None

    ceiling = Decimal(str(license.monetary_ceiling))
    current_drawn = Decimal(str(license.current_drawn_value))
    return ceiling - current_drawn


def verify_nationality_compliance(
    user: User,
    node: PortfolioNode,
) -> Optional[str]:
    """Check whether a user's nationality is authorised for a controlled node.

    Returns ``None`` when the user is authorised, or a denial reason string
    when the user's citizenship does not match the node's authorised nationalities.

    Parameters
    ----------
    user : User
        The user whose nationality is being checked.
    node : PortfolioNode
        The target portfolio node.

    Returns
    -------
    str or None
        ``None`` if authorised, otherwise a human-readable denial reason.
    """
    regime = node.export_control_regime
    if regime in (ExportControlRegime.NOT_CONTROLLED, ExportControlRegime.OPEN_GENERAL):
        return None

    user_nationalities = _get_user_nationalities(user)
    if not user_nationalities:
        return "User has no citizenship recorded"

    authorized = node.authorized_nationalities
    if not authorized:
        return None

    if not any(n in authorized for n in user_nationalities):
        return (
            f"Nationality {user_nationalities} not authorised for regime {regime.value}. "
            f"Authorised nationalities: {authorized}"
        )
    return None


def verify_employer_licence(
    user: User,
    node: PortfolioNode,
) -> Optional[str]:
    """Check whether a user's employer holds an active licence for a controlled node.

    Returns ``None`` when the employer is authorised, or a denial reason string
    when the employer is not listed in the node's TAA/MLA reference.

    Parameters
    ----------
    user : User
        The user whose employer is being checked.
    node : PortfolioNode
        The target portfolio node.

    Returns
    -------
    str or None
        ``None`` if authorised, otherwise a human-readable denial reason.
    """
    regime = node.export_control_regime
    if regime in (ExportControlRegime.NOT_CONTROLLED, ExportControlRegime.OPEN_GENERAL):
        return None

    taa_ref = node.taa_mla_reference
    if not taa_ref:
        return f"No TAA/MLA licence reference set for regime {regime.value}"

    employer = user.employer_legal_entity
    if not employer:
        return "User has no employer legal entity recorded"

    if employer not in taa_ref:
        return (
            f"Employer '{employer}' is not an authorised licensee under "
            f"{taa_ref} for regime {regime.value}"
        )
    return None


def verify_foreign_disclosure_compliance(
    user: User,
    node: PortfolioNode,
    db: Optional[Session] = None,
    action_type: str = "VIEW",
) -> bool:
    """Verify foreign disclosure compliance before allowing access to a controlled node.

    This is a convenience wrapper around :func:`verify_export_control_compliance`
    that accepts a ``PortfolioNode`` instance instead of a node ID, matching the
    signature expected by the cockpit router.

    Parameters
    ----------
    user : User
        The user attempting the action.
    node : PortfolioNode
        The target portfolio node.
    db : Session or None
        Active database session (optional for lightweight checks).
    action_type : str
        Description of the action being attempted.

    Returns
    -------
    bool
        ``True`` if the user is authorised to access the node.

    Raises
    ------
    ExportControlViolationException
        If the user is not authorised.
    """
    # Run nationality check
    nationality_reason = verify_nationality_compliance(user, node)
    if nationality_reason is not None:
        raise ExportControlViolationException(nationality_reason)

    # Run employer licence check
    employer_reason = verify_employer_licence(user, node)
    if employer_reason is not None:
        raise ExportControlViolationException(employer_reason)

    # If db is available, run full compliance check
    if db is not None:
        return verify_export_control_compliance(
            db=db,
            node_id=node.id,
            user=user,
            action_type=action_type,
        )

    return True
