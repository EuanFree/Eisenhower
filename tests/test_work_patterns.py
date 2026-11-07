"""Unit tests for the work pattern template management service.

Tests cover template CRUD, resource assignments, effective pattern
calculations, default template management, and edge cases.
"""
import pytest
from datetime import date, time
from decimal import Decimal
from uuid import uuid4

from app.models.models import (
    ResourceWorkPattern,
    User,
    WorkPatternCategory,
    WorkPatternDay,
    WorkPatternTemplate,
)
from app.services.work_patterns import WorkPatternService


@pytest.fixture
def user(db_session):
    """Test user."""
    u = User(username="testuser", email="test@test.com", hashed_password="hashed", is_active=True)
    db_session.add(u)
    db_session.commit()
    return u


@pytest.fixture
def service():
    """Work pattern service instance."""
    return WorkPatternService()


class TestCreateTemplate:
    def test_create_basic_template(self, db_session, service, user):
        days = [
            {"day_of_week": i, "hours": 8.0, "start_time": "09:00", "end_time": "17:00"}
            for i in range(5)
        ] + [{"day_of_week": i, "hours": 0.0} for i in range(5, 7)]
        tpl = service.create_template(
            db=db_session, code="WP_TEST", name="Test Pattern",
            category="STANDARD", days=days, user_id=user.id,
        )
        assert tpl.code == "WP_TEST"
        assert len(tpl.days) == 7
        assert tpl.days[0].hours == Decimal("8.0")
        assert tpl.days[5].hours == Decimal("0.0")

    def test_create_duplicate_code_raises(self, db_session, service, user):
        service.create_template(db_session, code="WP_DUP", name="Dup", user_id=user.id)
        with pytest.raises(ValueError, match="already exists"):
            service.create_template(db_session, code="WP_DUP", name="Dup2", user_id=user.id)

    def test_create_sets_default(self, db_session, service, user):
        t1 = service.create_template(db_session, code="WP_A", name="A", category="STANDARD", is_default=True, user_id=user.id)
        t2 = service.create_template(db_session, code="WP_B", name="B", category="STANDARD", is_default=True, user_id=user.id)
        db_session.refresh(t1)
        assert t1.is_default is False
        assert t2.is_default is True

    def test_create_with_time_parsing(self, db_session, service, user):
        days = [{"day_of_week": 0, "hours": 8.0, "start_time": "08:30", "end_time": "17:30"}]
        tpl = service.create_template(db_session, code="WP_TIME", name="Time", days=days, user_id=user.id)
        assert tpl.days[0].start_time == time(8, 30)
        assert tpl.days[0].end_time == time(17, 30)


class TestUpdateTemplate:
    def test_update_name(self, db_session, service, user):
        tpl = service.create_template(db_session, code="WP_UPD", name="Old", user_id=user.id)
        updated = service.update_template(db_session, tpl.id, name="New")
        assert updated.name == "New"
        assert updated.version == 2

    def test_update_days_replaces_all(self, db_session, service, user):
        days = [{"day_of_week": i, "hours": 8.0} for i in range(7)]
        tpl = service.create_template(db_session, code="WP_DAYS", name="Days", days=days, user_id=user.id)
        new_days = [{"day_of_week": i, "hours": 4.0} for i in range(7)]
        updated = service.update_template(db_session, tpl.id, days=new_days)
        for d in updated.days:
            assert d.hours == Decimal("4.0")

    def test_update_nonexistent_raises(self, db_session, service):
        with pytest.raises(ValueError, match="not found"):
            service.update_template(db_session, uuid4(), name="X")


class TestDeleteTemplate:
    def test_deactivate_template(self, db_session, service, user):
        tpl = service.create_template(db_session, code="WP_DEL", name="Del", user_id=user.id)
        service.delete_template(db_session, tpl.id)
        db_session.refresh(tpl)
        assert tpl.is_active is False

    def test_cannot_delete_with_active_assignments(self, db_session, service, user, test_resource_node):
        tpl = service.create_template(db_session, code="WP_USED", name="Used", user_id=user.id)
        service.assign_pattern_to_resource(
            db_session, test_resource_node.id, tpl.id, effective_from=date.today(), user_id=user.id
        )
        with pytest.raises(ValueError, match="active resource assignments"):
            service.delete_template(db_session, tpl.id)

    def test_delete_nonexistent_raises(self, db_session, service):
        with pytest.raises(ValueError, match="not found"):
            service.delete_template(db_session, uuid4())


class TestListTemplates:
    def test_list_all_templates(self, db_session, service, user):
        service.create_template(db_session, code="WP_1", name="One", user_id=user.id)
        service.create_template(db_session, code="WP_2", name="Two", user_id=user.id)
        templates = service.list_templates(db_session)
        assert len(templates) == 2

    def test_list_filtered_by_category(self, db_session, service, user):
        service.create_template(db_session, code="WP_STD", name="Std", category="STANDARD", user_id=user.id)
        service.create_template(db_session, code="WP_SHF", name="Shf", category="SHIFT", user_id=user.id)
        std = service.list_templates(db_session, category="STANDARD")
        assert len(std) == 1

    def test_list_excludes_inactive(self, db_session, service, user):
        tpl = service.create_template(db_session, code="WP_INA", name="Ina", user_id=user.id)
        service.delete_template(db_session, tpl.id)
        templates = service.list_templates(db_session)
        assert len(templates) == 0


class TestDefaultTemplate:
    def test_set_default(self, db_session, service, user):
        tpl = service.create_template(db_session, code="WP_DEF", name="Def", category="CUSTOM", user_id=user.id)
        result = service.set_default_template(db_session, tpl.id)
        assert result.is_default is True

    def test_set_default_clears_others(self, db_session, service, user):
        t1 = service.create_template(db_session, code="WP_D1", name="D1", category="STANDARD", is_default=True, user_id=user.id)
        t2 = service.create_template(db_session, code="WP_D2", name="D2", category="STANDARD", user_id=user.id)
        service.set_default_template(db_session, t2.id)
        db_session.refresh(t1)
        db_session.refresh(t2)
        assert t1.is_default is False
        assert t2.is_default is True

    def test_get_default_for_category(self, db_session, service, user):
        tpl = service.create_template(db_session, code="WP_GD", name="GD", category="SHIFT", is_default=True, user_id=user.id)
        result = service.get_default_template_for_category(db_session, "SHIFT")
        assert result is not None
        assert result.code == "WP_GD"

    def test_get_default_returns_none_when_missing(self, db_session, service):
        result = service.get_default_template_for_category(db_session, "OVERTIME")
        assert result is None


class TestAssignPattern:
    def test_assign_pattern_to_resource(self, db_session, service, user, test_resource_node):
        tpl = service.create_template(db_session, code="WP_ASS", name="Ass", user_id=user.id)
        assignment = service.assign_pattern_to_resource(
            db_session, test_resource_node.id, tpl.id, effective_from=date.today(), user_id=user.id
        )
        assert assignment.resource_node_id == test_resource_node.id
        assert assignment.template_id == tpl.id

    def test_assign_with_override_hours(self, db_session, service, user, test_resource_node):
        tpl = service.create_template(db_session, code="WP_OVR", name="Ovr", user_id=user.id)
        overrides = {"0": 6.0, "1": 6.0, "2": 6.0, "3": 6.0, "4": 4.0}
        assignment = service.assign_pattern_to_resource(
            db_session, test_resource_node.id, tpl.id, effective_from=date.today(),
            override_hours=overrides, user_id=user.id,
        )
        assert assignment.override_hours_json == overrides

    def test_assign_nonexistent_resource_raises(self, db_session, service, user):
        tpl = service.create_template(db_session, code="WP_BAD", name="Bad", user_id=user.id)
        with pytest.raises(ValueError, match="Resource node.*not found"):
            service.assign_pattern_to_resource(db_session, uuid4(), tpl.id, effective_from=date.today())


class TestRemovePattern:
    def test_remove_pattern_expires_assignment(self, db_session, service, user, test_resource_node):
        tpl = service.create_template(db_session, code="WP_RMV", name="Rmv", user_id=user.id)
        assignment = service.assign_pattern_to_resource(
            db_session, test_resource_node.id, tpl.id, effective_from=date.today(), user_id=user.id
        )
        service.remove_pattern_from_resource(db_session, assignment.id)
        db_session.refresh(assignment)
        assert assignment.effective_to == date.today()


class TestEffectivePattern:
    def test_effective_pattern_with_template(self, db_session, service, user, test_resource_node):
        days = [
            {"day_of_week": i, "hours": 8.0, "start_time": "09:00", "end_time": "17:00"}
            for i in range(5)
        ] + [{"day_of_week": i, "hours": 0.0} for i in range(5, 7)]
        tpl = service.create_template(db_session, code="WP_EFF", name="Eff", days=days, user_id=user.id)
        service.assign_pattern_to_resource(
            db_session, test_resource_node.id, tpl.id, effective_from=date.today(), user_id=user.id
        )
        effective = service.get_resource_effective_pattern(db_session, test_resource_node.id)
        assert effective["resource_name"] == "Test Engineer"
        assert effective["template_name"] == "Eff"
        assert effective["weekly_hours"] == 40.0
        assert len(effective["effective_days"]) == 7

    def test_effective_pattern_with_overrides(self, db_session, service, user, test_resource_node):
        days = [{"day_of_week": i, "hours": 8.0} for i in range(7)]
        tpl = service.create_template(db_session, code="WP_OVE", name="Ove", days=days, user_id=user.id)
        overrides = {"0": 4.0, "1": 4.0, "2": 4.0, "3": 4.0, "4": 2.0}
        service.assign_pattern_to_resource(
            db_session, test_resource_node.id, tpl.id, effective_from=date.today(),
            override_hours=overrides, user_id=user.id,
        )
        effective = service.get_resource_effective_pattern(db_session, test_resource_node.id)
        assert effective["effective_days"][0]["hours"] == 4.0
        assert effective["effective_days"][4]["hours"] == 2.0
        assert effective["weekly_hours"] == 34.0

    def test_effective_pattern_no_assignment(self, db_session, service, test_resource_node):
        effective = service.get_resource_effective_pattern(db_session, test_resource_node.id)
        assert effective["template_id"] is None
        assert effective["weekly_hours"] == 0.0


class TestApplyDefault:
    def test_apply_default_pattern(self, db_session, service, user, test_resource_node):
        tpl = service.create_template(
            db_session, code="WP_DEF2", name="Def2", category="STANDARD", is_default=True, user_id=user.id
        )
        assignment = service.apply_default_pattern_to_resource(
            db_session, test_resource_node.id, category="STANDARD", user_id=user.id
        )
        assert assignment is not None
        assert assignment.template_id == tpl.id

    def test_apply_default_no_default_template(self, db_session, service, test_resource_node):
        result = service.apply_default_pattern_to_resource(db_session, test_resource_node.id, category="OVERTIME")
        assert result is None


class TestParseTime:
    def test_parse_valid_time(self):
        assert WorkPatternService._parse_time("09:00") == time(9, 0)

    def test_parse_none(self):
        assert WorkPatternService._parse_time(None) is None

    def test_parse_invalid(self):
        assert WorkPatternService._parse_time("invalid") is None
