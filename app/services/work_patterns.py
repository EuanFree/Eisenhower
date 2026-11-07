"""Work pattern template management service.

This module provides the business logic for managing work pattern templates,
resource-to-pattern assignments, and effective pattern calculations.

Work Pattern Architecture
~~~~~~~~~~~~~~~~~~~~~~~~~

The work pattern system allows administrators to define reusable working
schedules that can be applied to any number of resources.  Each template
defines per-day-of-week hours, start times, and end times.

Key Concepts
~~~~~~~~~~~~

1. **WorkPatternTemplate** — A reusable, named work pattern definition
   with per-day-of-week hours.  Templates are categorized (STANDARD,
   SHIFT, PART_TIME, OVERTIME, CUSTOM) and can be marked as the default
   for their category.

2. **WorkPatternDay** — Per-day-of-week definition within a template.
   Each template has exactly seven WorkPatternDay records (Monday–Sunday).

3. **ResourceWorkPattern** — Assignment of a template to a specific
   resource with an effective date range and optional hour overrides.

4. **Effective Pattern** — The actual working hours for a resource,
   combining the template's per-day hours with any resource-specific
   overrides.

Service Methods
~~~~~~~~~~~~~~~

- **create_template** — Create a new work pattern template with per-day
  definitions.  If marked as default, clears the default flag on other
  templates in the same category.

- **update_template** — Update an existing template's metadata and/or
  per-day definitions.  Increments the version number.

- **delete_template** — Soft-delete a template by deactivating it.
  Prevents deletion if resources are still assigned.

- **get_template** — Retrieve a single template with its per-day definitions.

- **list_templates** — List all templates, optionally filtered by category.

- **set_default_template** — Set a template as the default for its category.

- **assign_pattern_to_resource** — Assign a work pattern template to a
  resource with an effective date range and optional overrides.

- **remove_pattern_from_resource** — Remove or expire a resource's pattern
  assignment.

- **get_resource_effective_pattern** — Calculate the effective working
  hours for a resource, combining template hours with overrides.

- **get_resource_assignments** — List all pattern assignments for a resource.

- **get_default_template_for_category** — Find the default template for
  a given category.

- **apply_default_pattern_to_resource** — Apply the default pattern for
  a category to a resource that has no pattern assigned.

Usage Examples
~~~~~~~~~~~~~~

Create a standard office hours template::

    service = WorkPatternService()
    template = service.create_template(
        db,
        code="WP_STANDARD",
        name="Standard Office Hours",
        category="STANDARD",
        days=[
            {"day_of_week": 0, "hours": 8.0, "start_time": "09:00", "end_time": "17:00"},
            {"day_of_week": 1, "hours": 8.0, "start_time": "09:00", "end_time": "17:00"},
            {"day_of_week": 2, "hours": 8.0, "start_time": "09:00", "end_time": "17:00"},
            {"day_of_week": 3, "hours": 8.0, "start_time": "09:00", "end_time": "17:00"},
            {"day_of_week": 4, "hours": 7.5, "start_time": "09:00", "end_time": "16:30"},
            {"day_of_week": 5, "hours": 0.0},
            {"day_of_week": 6, "hours": 0.0},
        ],
        is_default=True,
        user_id=1,
    )

Assign the template to a resource::

    service.assign_pattern_to_resource(
        db,
        resource_node_id=resource.id,
        template_id=template.id,
        effective_from=date.today(),
        user_id=1,
    )

Get the effective pattern for a resource::

    effective = service.get_resource_effective_pattern(db, resource.id)
    print(effective.weekly_hours)  # 39.5
"""
from datetime import date, timezone, datetime, time as time_type
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.models import (
    ResourceNode,
    ResourceWorkPattern,
    User,
    WorkPatternCategory,
    WorkPatternDay,
    WorkPatternTemplate,
)


class WorkPatternService:
    """Service for managing work pattern templates and resource assignments.

    Provides CRUD operations for templates, assignment management,
    and effective pattern calculations.
    """

    def __init__(self):
        """Initialize the work pattern service.

        No external state is required — all data is read from and written
        to the database via SQLAlchemy sessions.
        """
        pass

    # ------------------------------------------------------------------
    # Template CRUD
    # ------------------------------------------------------------------

    def create_template(
        self,
        db: Session,
        code: str,
        name: str,
        description: Optional[str] = None,
        category: str = "CUSTOM",
        days: Optional[List[Dict[str, Any]]] = None,
        is_default: bool = False,
        user_id: Optional[int] = None,
    ) -> WorkPatternTemplate:
        """Create a new work pattern template.

        Args
        ----
        db : Session
            Database session.
        code : str
            Unique machine-readable code.
        name : str
            Human-readable name.
        description : str, optional
            Detailed description.
        category : str, optional
            Category classification (default ``"CUSTOM"``).
        days : list[dict], optional
            Per-day-of-week definitions.
        is_default : bool, optional
            Whether this is the default for its category.
        user_id : int, optional
            User who created the template.

        Returns
        -------
        WorkPatternTemplate
            The newly created template.

        Raises
        ------
        ValueError
            If a template with the same code already exists.
        """
        existing = db.query(WorkPatternTemplate).filter(WorkPatternTemplate.code == code).first()
        if existing:
            raise ValueError(f"Work pattern template with code '{code}' already exists")

        template = WorkPatternTemplate(
            id=uuid4(),
            code=code,
            name=name,
            description=description,
            category=category,
            is_default=is_default,
            is_active=True,
            created_by_user_id=user_id,
        )
        db.add(template)
        db.flush()

        # If marked as default, clear default on others in same category
        if is_default:
            db.query(WorkPatternTemplate).filter(
                and_(
                    WorkPatternTemplate.category == category,
                    WorkPatternTemplate.id != template.id,
                    WorkPatternTemplate.is_default == True,
                )
            ).update({"is_default": False})

        # Create per-day definitions
        if days:
            for day_data in days:
                day = WorkPatternDay(
                    id=uuid4(),
                    template_id=template.id,
                    day_of_week=day_data["day_of_week"],
                    hours=Decimal(str(day_data.get("hours", 0.0))),
                    start_time=self._parse_time(day_data.get("start_time")),
                    end_time=self._parse_time(day_data.get("end_time")),
                )
                db.add(day)

        db.commit()
        db.refresh(template)
        return template

    def update_template(
        self,
        db: Session,
        template_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        is_default: Optional[bool] = None,
        is_active: Optional[bool] = None,
        days: Optional[List[Dict[str, Any]]] = None,
    ) -> WorkPatternTemplate:
        """Update an existing work pattern template.

        Args
        ----
        db : Session
            Database session.
        template_id : UUID
            Template to update.
        name : str, optional
            Updated name.
        description : str, optional
            Updated description.
        category : str, optional
            Updated category.
        is_default : bool, optional
            Updated default flag.
        is_active : bool, optional
            Updated active flag.
        days : list[dict], optional
            Updated per-day definitions (replaces all existing days).

        Returns
        -------
        WorkPatternTemplate
            The updated template.

        Raises
        ------
        ValueError
            If the template does not exist.
        """
        template = db.query(WorkPatternTemplate).filter(WorkPatternTemplate.id == template_id).first()
        if not template:
            raise ValueError(f"Work pattern template {template_id} not found")

        if name is not None:
            template.name = name
        if description is not None:
            template.description = description
        if category is not None:
            template.category = category
        if is_default is not None:
            template.is_default = is_default
            if is_default:
                db.query(WorkPatternTemplate).filter(
                    and_(
                        WorkPatternTemplate.category == template.category,
                        WorkPatternTemplate.id != template.id,
                        WorkPatternTemplate.is_default == True,
                    )
                ).update({"is_default": False})
        if is_active is not None:
            template.is_active = is_active

        # Update per-day definitions if provided
        if days is not None:
            db.query(WorkPatternDay).filter(WorkPatternDay.template_id == template.id).delete()
            for day_data in days:
                day = WorkPatternDay(
                    id=uuid4(),
                    template_id=template.id,
                    day_of_week=day_data["day_of_week"],
                    hours=Decimal(str(day_data.get("hours", 0.0))),
                    start_time=self._parse_time(day_data.get("start_time")),
                    end_time=self._parse_time(day_data.get("end_time")),
                )
                db.add(day)

        template.version += 1
        template.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(template)
        return template

    def delete_template(self, db: Session, template_id: UUID) -> bool:
        """Soft-delete a template by deactivating it.

        Args
        ----
        db : Session
            Database session.
        template_id : UUID
            Template to deactivate.

        Returns
        -------
        bool
            True if the template was deactivated.

        Raises
        ------
        ValueError
            If the template does not exist or still has active resource assignments.
        """
        template = db.query(WorkPatternTemplate).filter(WorkPatternTemplate.id == template_id).first()
        if not template:
            raise ValueError(f"Work pattern template {template_id} not found")

        # Check for active assignments
        active_assignments = db.query(ResourceWorkPattern).filter(
            and_(
                ResourceWorkPattern.template_id == template_id,
                or_(
                    ResourceWorkPattern.effective_to.is_(None),
                    ResourceWorkPattern.effective_to >= date.today(),
                ),
            )
        ).count()

        if active_assignments > 0:
            raise ValueError(
                f"Cannot delete template: {active_assignments} active resource assignments exist"
            )

        template.is_active = False
        template.updated_at = datetime.now(timezone.utc)
        db.commit()
        return True

    def get_template(self, db: Session, template_id: UUID) -> Optional[WorkPatternTemplate]:
        """Retrieve a single template with its per-day definitions.

        Args
        ----
        db : Session
            Database session.
        template_id : UUID
            Template to retrieve.

        Returns
        -------
        WorkPatternTemplate or None
            The template or None if not found.
        """
        return db.query(WorkPatternTemplate).filter(WorkPatternTemplate.id == template_id).first()

    def list_templates(
        self,
        db: Session,
        category: Optional[str] = None,
        active_only: bool = True,
    ) -> List[WorkPatternTemplate]:
        """List all templates, optionally filtered by category.

        Args
        ----
        db : Session
            Database session.
        category : str, optional
            Filter by category.
        active_only : bool, optional
            Only return active templates (default ``True``).

        Returns
        -------
        list[WorkPatternTemplate]
            List of templates ordered by category and name.
        """
        query = db.query(WorkPatternTemplate)
        if category:
            query = query.filter(WorkPatternTemplate.category == category)
        if active_only:
            query = query.filter(WorkPatternTemplate.is_active == True)
        return query.order_by(WorkPatternTemplate.is_default.desc(), WorkPatternTemplate.category, WorkPatternTemplate.name).all()

    def set_default_template(self, db: Session, template_id: UUID) -> WorkPatternTemplate:
        """Set a template as the default for its category.

        Args
        ----
        db : Session
            Database session.
        template_id : UUID
            Template to set as default.

        Returns
        -------
        WorkPatternTemplate
            The updated template.

        Raises
        ------
        ValueError
            If the template does not exist.
        """
        template = db.query(WorkPatternTemplate).filter(WorkPatternTemplate.id == template_id).first()
        if not template:
            raise ValueError(f"Work pattern template {template_id} not found")

        # Clear default on others in same category
        db.query(WorkPatternTemplate).filter(
            and_(
                WorkPatternTemplate.category == template.category,
                WorkPatternTemplate.id != template.id,
                WorkPatternTemplate.is_default == True,
            )
        ).update({"is_default": False})

        template.is_default = True
        template.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(template)
        return template

    def get_default_template_for_category(
        self, db: Session, category: str
    ) -> Optional[WorkPatternTemplate]:
        """Find the default template for a given category.

        Args
        ----
        db : Session
            Database session.
        category : str
            Category to search.

        Returns
        -------
        WorkPatternTemplate or None
            The default template or None if not found.
        """
        return db.query(WorkPatternTemplate).filter(
            and_(
                WorkPatternTemplate.category == category,
                WorkPatternTemplate.is_default == True,
                WorkPatternTemplate.is_active == True,
            )
        ).first()

    # ------------------------------------------------------------------
    # Resource Assignments
    # ------------------------------------------------------------------

    def assign_pattern_to_resource(
        self,
        db: Session,
        resource_node_id: UUID,
        template_id: UUID,
        effective_from: date,
        effective_to: Optional[date] = None,
        override_hours: Optional[Dict[str, float]] = None,
        priority: int = 0,
        notes: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> ResourceWorkPattern:
        """Assign a work pattern template to a resource.

        Args
        ----
        db : Session
            Database session.
        resource_node_id : UUID
            Resource to assign the pattern to.
        template_id : UUID
            Template to assign.
        effective_from : date
            Start date when the pattern becomes active.
        effective_to : date, optional
            End date when the pattern expires.
        override_hours : dict, optional
            Per-day hour overrides.
        priority : int, optional
            Priority for resolving overlaps (default ``0``).
        notes : str, optional
            Assignment notes.
        user_id : int, optional
            User who created the assignment.

        Returns
        -------
        ResourceWorkPattern
            The new assignment record.

        Raises
        ------
        ValueError
            If the resource or template does not exist.
        """
        resource = db.query(ResourceNode).filter(ResourceNode.id == resource_node_id).first()
        if not resource:
            raise ValueError(f"Resource node {resource_node_id} not found")

        template = db.query(WorkPatternTemplate).filter(WorkPatternTemplate.id == template_id).first()
        if not template:
            raise ValueError(f"Work pattern template {template_id} not found")

        assignment = ResourceWorkPattern(
            id=uuid4(),
            resource_node_id=resource_node_id,
            template_id=template_id,
            effective_from=effective_from,
            effective_to=effective_to,
            override_hours_json=override_hours,
            priority=priority,
            notes=notes,
            assigned_by_user_id=user_id,
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return assignment

    def remove_pattern_from_resource(
        self, db: Session, assignment_id: UUID
    ) -> bool:
        """Remove a resource's pattern assignment.

        Args
        ----
        db : Session
            Database session.
        assignment_id : UUID
            Assignment to remove.

        Returns
        -------
        bool
            True if the assignment was removed.

        Raises
        ------
        ValueError
            If the assignment does not exist.
        """
        assignment = db.query(ResourceWorkPattern).filter(
            ResourceWorkPattern.id == assignment_id
        ).first()
        if not assignment:
            raise ValueError(f"Resource work pattern assignment {assignment_id} not found")

        # Expire the assignment instead of deleting
        assignment.effective_to = date.today()
        db.commit()
        return True

    def get_resource_assignments(
        self, db: Session, resource_node_id: UUID, active_only: bool = True
    ) -> List[ResourceWorkPattern]:
        """List all pattern assignments for a resource.

        Args
        ----
        db : Session
            Database session.
        resource_node_id : UUID
            Resource to query.
        active_only : bool, optional
            Only return currently active assignments (default ``True``).

        Returns
        -------
        list[ResourceWorkPattern]
            List of assignments ordered by priority (descending).
        """
        query = db.query(ResourceWorkPattern).filter(
            ResourceWorkPattern.resource_node_id == resource_node_id
        )
        if active_only:
            query = query.filter(
                or_(
                    ResourceWorkPattern.effective_to.is_(None),
                    ResourceWorkPattern.effective_to >= date.today(),
                )
            )
        return query.order_by(ResourceWorkPattern.priority.desc()).all()

    def get_resource_effective_pattern(
        self, db: Session, resource_node_id: UUID
    ) -> Dict[str, Any]:
        """Calculate the effective working hours for a resource.

        Combines the template's per-day hours with any resource-specific
        overrides to produce the actual working hours for each day.

        Args
        ----
        db : Session
            Database session.
        resource_node_id : UUID
            Resource to calculate the pattern for.

        Returns
        -------
        dict
            Dictionary containing:
            - resource_node_id: str
            - resource_name: str
            - template_id: str or None
            - template_name: str or None
            - effective_days: list[dict] with day_of_week, hours, start_time, end_time
            - weekly_hours: float
        """
        resource = db.query(ResourceNode).filter(ResourceNode.id == resource_node_id).first()
        if not resource:
            raise ValueError(f"Resource node {resource_node_id} not found")

        # Find the highest-priority active assignment
        assignments = self.get_resource_assignments(db, resource_node_id, active_only=True)
        if not assignments:
            return {
                "resource_node_id": str(resource_node_id),
                "resource_name": resource.name,
                "template_id": None,
                "template_name": None,
                "effective_days": [],
                "weekly_hours": 0.0,
            }

        assignment = assignments[0]  # Highest priority
        template = db.query(WorkPatternTemplate).filter(
            WorkPatternTemplate.id == assignment.template_id
        ).first()

        if not template:
            return {
                "resource_node_id": str(resource_node_id),
                "resource_name": resource.name,
                "template_id": str(assignment.template_id),
                "template_name": None,
                "effective_days": [],
                "weekly_hours": 0.0,
            }

        # Get template days
        template_days = {
            d.day_of_week: d
            for d in db.query(WorkPatternDay).filter(
                WorkPatternDay.template_id == template.id
            ).all()
        }

        # Apply overrides
        override_hours = assignment.override_hours_json or {}
        effective_days = []
        weekly_hours = 0.0

        for day_of_week in range(7):
            day_def = template_days.get(day_of_week)
            hours = float(day_def.hours) if day_def else 0.0
            start_time = day_def.start_time.strftime("%H:%M") if day_def and day_def.start_time else None
            end_time = day_def.end_time.strftime("%H:%M") if day_def and day_def.end_time else None

            # Apply override if present
            day_key = str(day_of_week)
            if day_key in override_hours:
                hours = float(override_hours[day_key])

            effective_days.append({
                "day_of_week": day_of_week,
                "hours": hours,
                "start_time": start_time,
                "end_time": end_time,
            })
            weekly_hours += hours

        return {
            "resource_node_id": str(resource_node_id),
            "resource_name": resource.name,
            "template_id": str(template.id),
            "template_name": template.name,
            "effective_days": effective_days,
            "weekly_hours": weekly_hours,
        }

    def apply_default_pattern_to_resource(
        self,
        db: Session,
        resource_node_id: UUID,
        category: str = "STANDARD",
        user_id: Optional[int] = None,
    ) -> Optional[ResourceWorkPattern]:
        """Apply the default pattern for a category to a resource.

        Args
        ----
        db : Session
            Database session.
        resource_node_id : UUID
            Resource to apply the pattern to.
        category : str, optional
            Category of the default pattern (default ``"STANDARD"``).
        user_id : int, optional
            User who applied the pattern.

        Returns
        -------
        ResourceWorkPattern or None
            The new assignment or None if no default template exists.
        """
        default_template = self.get_default_template_for_category(db, category)
        if not default_template:
            return None

        return self.assign_pattern_to_resource(
            db=db,
            resource_node_id=resource_node_id,
            template_id=default_template.id,
            effective_from=date.today(),
            user_id=user_id,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_time(time_str: Optional[str]) -> Optional[time_type]:
        """Parse a time string in HH:MM format to a time object.

        Args
        ----
        time_str : str, optional
            Time string (e.g., "09:00") or None.

        Returns
        -------
        time or None
            Parsed time object or None.
        """
        if time_str is None:
            return None
        try:
            parts = time_str.split(":")
            return time_type(int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            return None
