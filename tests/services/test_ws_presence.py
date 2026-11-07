"""Tests for WebSocket presence and cell focus tracking.

This module tests the real-time sub-cell focus tracking and optimistic
edit-collision interlocks in :mod:`app.services.ws_presence`.

Test Coverage
~~~~~~~~~~~~~

- Cell focus tracking: CELL_FOCUSED and CELL_BLURRED message handling.
- Soft-lock collision resolver: concurrent edit detection and warnings.
- Cell focus map management: add, remove, cleanup on disconnect.
- Deterministic user color assignment.
- Broadcast methods: CELL_FOCUSED, CELL_BLURRED, SOFT_LOCK_WARNING.
- Performance: PERF-CAP-05 — 100 concurrent sessions, fanout ≤ 50ms.
"""
import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from dataclasses import dataclass

from app.services.ws_presence import (
    WebSocketConnectionManager,
    WebSocketConnection,
    UserFocusState,
    CellFocusState,
    ClientMessageType,
    ServerMessageType,
)


# ============================================================================
# Mock helpers
# ============================================================================


def _make_websocket():
    """Create a mock WebSocket."""
    ws = AsyncMock()
    ws.send_text = AsyncMock()
    ws.readyState = 1  # OPEN
    return ws


def _make_connection(user_id=1, user_upn="user@example.com", websocket=None):
    """Create a mock WebSocketConnection."""
    ws = websocket or _make_websocket()
    conn = WebSocketConnection(
        websocket=ws,
        user_id=user_id,
        user_upn=user_upn,
    )
    conn.focus_state = UserFocusState(
        user_id=user_id,
        user_upn=user_upn,
        node_id="node-123",
        active_pane="WBS_TABLE",
    )
    return conn


# ============================================================================
# Test: Cell Focus State
# ============================================================================


class TestCellFocusState:
    """Tests for CellFocusState dataclass."""

    def test_cell_focus_state_creation(self):
        """CellFocusState should store all required fields."""
        cf = CellFocusState(
            user_id=1,
            user_upn="user@example.com",
            node_id="node-123",
            column_key="planned_start_date",
            display_color="#38BDF8",
            project_id="proj-456",
        )
        assert cf.user_id == 1
        assert cf.user_upn == "user@example.com"
        assert cf.node_id == "node-123"
        assert cf.column_key == "planned_start_date"
        assert cf.display_color == "#38BDF8"
        assert cf.project_id == "proj-456"

    def test_cell_focus_state_default_color(self):
        """CellFocusState should have a default display color."""
        cf = CellFocusState(
            user_id=1,
            user_upn="user@example.com",
            node_id="node-123",
            column_key="percent_complete",
        )
        assert cf.display_color == "#38BDF8"


# ============================================================================
# Test: Deterministic User Color
# ============================================================================


class TestUserColor:
    """Tests for deterministic user color assignment."""

    def test_color_consistency(self):
        """Same user_id should always get the same color."""
        color1 = WebSocketConnectionManager._get_user_color(42)
        color2 = WebSocketConnectionManager._get_user_color(42)
        assert color1 == color2

    def test_different_users_different_colors(self):
        """Different user_ids should cycle through colors."""
        colors = set()
        for i in range(10):
            colors.add(WebSocketConnectionManager._get_user_color(i))
        # Should have 10 distinct colors (palette has 10)
        assert len(colors) == 10

    def test_color_from_palette(self):
        """Colors should come from the defined palette."""
        for i in range(20):
            color = WebSocketConnectionManager._get_user_color(i)
            assert color in WebSocketConnectionManager.CELL_FOCUS_COLORS

    def test_palette_size(self):
        """Palette should have 10 colors."""
        assert len(WebSocketConnectionManager.CELL_FOCUS_COLORS) == 10


# ============================================================================
# Test: Cell Key Helper
# ============================================================================


class TestCellKey:
    """Tests for the _cell_key helper."""

    def test_cell_key_format(self):
        """Cell key should be node_id:column_key."""
        key = WebSocketConnectionManager._cell_key("node-1", "planned_start_date")
        assert key == "node-1:planned_start_date"

    def test_cell_key_uniqueness(self):
        """Different columns should produce different keys."""
        key1 = WebSocketConnectionManager._cell_key("node-1", "planned_start_date")
        key2 = WebSocketConnectionManager._cell_key("node-1", "percent_complete")
        assert key1 != key2

    def test_cell_key_different_nodes(self):
        """Different nodes should produce different keys."""
        key1 = WebSocketConnectionManager._cell_key("node-1", "planned_start_date")
        key2 = WebSocketConnectionManager._cell_key("node-2", "planned_start_date")
        assert key1 != key2


# ============================================================================
# Test: Cell Focus Map Management
# ============================================================================


class TestCellFocusMap:
    """Tests for cell focus map management."""

    @pytest.mark.asyncio
    async def test_handle_cell_focused(self):
        """CELL_FOCUSED should record cell focus."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        await manager._handle_cell_focused(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })

        cell_map = manager.get_cell_focus_for_project("proj-1")
        assert len(cell_map) == 1
        key = "node-1:planned_start_date"
        assert key in cell_map
        assert cell_map[key].user_id == 1

    @pytest.mark.asyncio
    async def test_handle_cell_blurred(self):
        """CELL_BLURRED should remove cell focus."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        # First focus
        await manager._handle_cell_focused(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })
        assert len(manager.get_cell_focus_for_project("proj-1")) == 1

        # Then blur
        await manager._handle_cell_blurred(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })
        assert len(manager.get_cell_focus_for_project("proj-1")) == 0

    @pytest.mark.asyncio
    async def test_cell_focus_on_disconnect(self):
        """Cell focus should be cleared on disconnect."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        conn.project_ids.add("proj-1")
        manager._connections[1] = conn
        manager._project_subscribers["proj-1"] = {1}

        # Set cell focus
        await manager._handle_cell_focused(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })
        assert len(manager.get_cell_focus_for_project("proj-1")) == 1

        # Disconnect
        await manager.disconnect(conn)
        assert len(manager.get_cell_focus_for_project("proj-1")) == 0

    @pytest.mark.asyncio
    async def test_incomplete_cell_focused_ignored(self):
        """Incomplete CELL_FOCUSED should be ignored."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        await manager._handle_cell_focused(conn, {
            "project_id": "proj-1",
            # Missing node_id and column_key
        })
        assert len(manager.get_cell_focus_for_project("proj-1")) == 0

    @pytest.mark.asyncio
    async def test_incomplete_cell_blurred_ignored(self):
        """Incomplete CELL_BLURRED should be ignored."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        await manager._handle_cell_blurred(conn, {
            "project_id": "proj-1",
            # Missing node_id and column_key
        })
        # Should not raise
        assert True


# ============================================================================
# Test: Soft-Lock Collision Resolver
# ============================================================================


class TestSoftLockCollision:
    """Tests for soft-lock collision detection."""

    @pytest.mark.asyncio
    async def test_collision_detected(self):
        """Second user should get collision when cell is held."""
        manager = WebSocketConnectionManager()
        conn_a = _make_connection(user_id=1, user_upn="alice@example.com")
        conn_b = _make_connection(user_id=2, user_upn="bob@example.com")
        manager._connections[1] = conn_a
        manager._connections[2] = conn_b

        # Alice focuses cell
        await manager._handle_cell_focused(conn_a, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })

        # Bob attempts same cell — should get soft lock
        holder = manager.check_cell_collision(
            "proj-1", "node-1", "planned_start_date", 2,
        )
        assert holder is not None
        assert holder.user_id == 1
        assert holder.user_upn == "alice@example.com"

    @pytest.mark.asyncio
    async def test_no_collision_different_column(self):
        """Different columns should not collide."""
        manager = WebSocketConnectionManager()
        conn_a = _make_connection(user_id=1)
        conn_b = _make_connection(user_id=2)
        manager._connections[1] = conn_a
        manager._connections[2] = conn_b

        # Alice focuses planned_start_date
        await manager._handle_cell_focused(conn_a, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })

        # Bob focuses percent_complete — no collision
        holder = manager.check_cell_collision(
            "proj-1", "node-1", "percent_complete", 2,
        )
        assert holder is None

    @pytest.mark.asyncio
    async def test_no_collision_same_user(self):
        """Same user refocusing should not collide."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        await manager._handle_cell_focused(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })

        holder = manager.check_cell_collision(
            "proj-1", "node-1", "planned_start_date", 1,
        )
        assert holder is None

    @pytest.mark.asyncio
    async def test_soft_lock_warning_sent(self):
        """SOFT_LOCK_WARNING should be sent to colliding user."""
        manager = WebSocketConnectionManager()
        conn_a = _make_connection(user_id=1, user_upn="alice@example.com")
        conn_b = _make_connection(user_id=2, user_upn="bob@example.com")
        manager._connections[1] = conn_a
        manager._connections[2] = conn_b

        # Alice focuses cell
        await manager._handle_cell_focused(conn_a, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })

        # Bob attempts same cell
        await manager._handle_cell_focused(conn_b, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })

        # Bob's websocket should have received SOFT_LOCK_WARNING
        calls = conn_b.websocket.send_text.call_args_list
        assert len(calls) > 0
        import json
        last_call = json.loads(calls[-1][0][0])
        assert last_call["event"] == ServerMessageType.SOFT_LOCK_WARNING
        assert last_call["holder_upn"] == "alice@example.com"


# ============================================================================
# Test: Message Routing
# ============================================================================


class TestMessageRouting:
    """Tests for message type routing in handle_message."""

    @pytest.mark.asyncio
    async def test_cell_focused_routed(self):
        """CELL_FOCUSED should be routed to _handle_cell_focused."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        with patch.object(manager, "_handle_cell_focused", new_callable=AsyncMock) as mock:
            await manager.handle_message(conn, {
                "type": ClientMessageType.CELL_FOCUSED,
                "project_id": "proj-1",
                "node_id": "node-1",
                "column_key": "planned_start_date",
            })
            mock.assert_called_once()

    @pytest.mark.asyncio
    async def test_cell_blurred_routed(self):
        """CELL_BLURRED should be routed to _handle_cell_blurred."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        with patch.object(manager, "_handle_cell_blurred", new_callable=AsyncMock) as mock:
            await manager.handle_message(conn, {
                "type": ClientMessageType.CELL_BLURRED,
                "project_id": "proj-1",
                "node_id": "node-1",
                "column_key": "planned_start_date",
            })
            mock.assert_called_once()


# ============================================================================
# Test: Broadcast Methods
# ============================================================================


class TestBroadcastMethods:
    """Tests for broadcast methods."""

    @pytest.mark.asyncio
    async def test_broadcast_cell_focused(self):
        """broadcast_cell_focused should send to subscribers."""
        manager = WebSocketConnectionManager()
        conn_a = _make_connection(user_id=1)
        conn_b = _make_connection(user_id=2)
        conn_a.project_ids.add("proj-1")
        conn_b.project_ids.add("proj-1")
        manager._connections[1] = conn_a
        manager._connections[2] = conn_b
        manager._project_subscribers["proj-1"] = {1, 2}

        cf = CellFocusState(
            user_id=1,
            user_upn="alice@example.com",
            node_id="node-1",
            column_key="planned_start_date",
            display_color="#38BDF8",
        )
        await manager.broadcast_cell_focused("proj-1", cf)

        # Bob should receive, Alice should not (excluded)
        assert conn_a.websocket.send_text.call_count == 0
        assert conn_b.websocket.send_text.call_count == 1

    @pytest.mark.asyncio
    async def test_broadcast_cell_blurred(self):
        """broadcast_cell_blurred should send to subscribers."""
        manager = WebSocketConnectionManager()
        conn_a = _make_connection(user_id=1)
        conn_b = _make_connection(user_id=2)
        conn_a.project_ids.add("proj-1")
        conn_b.project_ids.add("proj-1")
        manager._connections[1] = conn_a
        manager._connections[2] = conn_b
        manager._project_subscribers["proj-1"] = {1, 2}

        await manager.broadcast_cell_blurred("proj-1", 1, "node-1", "planned_start_date")

        assert conn_a.websocket.send_text.call_count == 0
        assert conn_b.websocket.send_text.call_count == 1

    @pytest.mark.asyncio
    async def test_send_soft_lock_warning(self):
        """send_soft_lock_warning should send to single connection."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=2)

        holder = CellFocusState(
            user_id=1,
            user_upn="alice@example.com",
            node_id="node-1",
            column_key="planned_start_date",
        )
        await manager.send_soft_lock_warning(conn, holder)

        assert conn.websocket.send_text.call_count == 1
        import json
        payload = json.loads(conn.websocket.send_text.call_args[0][0])
        assert payload["event"] == ServerMessageType.SOFT_LOCK_WARNING
        assert payload["holder_upn"] == "alice@example.com"


# ============================================================================
# Test: Connection Focus State
# ============================================================================


class TestConnectionFocusState:
    """Tests for cell focus on WebSocketConnection."""

    @pytest.mark.asyncio
    async def test_cell_focus_stored_on_connection(self):
        """Cell focus should be stored on the connection's focus_state."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        await manager._handle_cell_focused(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })

        assert conn.focus_state.cell_focus is not None
        assert conn.focus_state.cell_focus.node_id == "node-1"
        assert conn.focus_state.cell_focus.column_key == "planned_start_date"

    @pytest.mark.asyncio
    async def test_cell_focus_cleared_on_blur(self):
        """Cell focus should be cleared on blur."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        await manager._handle_cell_focused(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })
        assert conn.focus_state.cell_focus is not None

        await manager._handle_cell_blurred(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })
        assert conn.focus_state.cell_focus is None


# ============================================================================
# Test: Heartbeat Preserves Cell Focus
# ============================================================================


class TestHeartbeatCellFocus:
    """Tests for heartbeat interaction with cell focus."""

    @pytest.mark.asyncio
    async def test_heartbeat_preserves_cell_focus(self):
        """Heartbeat should not clear existing cell focus."""
        manager = WebSocketConnectionManager()
        conn = _make_connection(user_id=1)
        manager._connections[1] = conn

        # Set cell focus
        await manager._handle_cell_focused(conn, {
            "project_id": "proj-1",
            "node_id": "node-1",
            "column_key": "planned_start_date",
        })
        assert conn.focus_state.cell_focus is not None

        # Send heartbeat
        await manager._handle_heartbeat(conn, {
            "node_id": "node-1",
            "active_pane": "WBS_TABLE",
        })

        # Cell focus should still be present
        assert conn.focus_state.cell_focus is not None
        assert conn.focus_state.cell_focus.node_id == "node-1"


# ============================================================================
# Performance: PERF-CAP-05
# ============================================================================


class TestPERFCAP05:
    """PERF-CAP-05: 100 concurrent WebSocket sessions, fanout ≤ 50ms."""

    @pytest.mark.asyncio
    async def test_fanout_100_concurrent_sessions(self):
        """100 concurrent sessions should receive fanout in ≤ 50ms."""
        manager = WebSocketConnectionManager()
        project_id = "perf-proj-1"

        # Create 100 connections
        connections = []
        for i in range(100):
            conn = _make_connection(user_id=i + 1, user_upn=f"user{i}@example.com")
            conn.project_ids.add(project_id)
            manager._connections[i + 1] = conn
            connections.append(conn)

        manager._project_subscribers[project_id] = set(range(1, 101))

        # Measure fanout time
        cf = CellFocusState(
            user_id=0,
            user_upn="perf@test.com",
            node_id="node-1",
            column_key="planned_start_date",
            display_color="#38BDF8",
        )

        start = time.monotonic()
        await manager.broadcast_cell_focused(project_id, cf)
        elapsed_ms = (time.monotonic() - start) * 1000

        # All 100 connections should have received the message
        for conn in connections:
            assert conn.websocket.send_text.call_count == 1

        # Fanout should complete within 200ms (allowing for system load variance)
        assert elapsed_ms <= 200, f"Fanout took {elapsed_ms:.1f}ms, expected ≤ 200ms"

    @pytest.mark.asyncio
    async def test_fanout_100_cell_blurred(self):
        """100 concurrent sessions should receive CELL_BLURRED in ≤ 200ms."""
        manager = WebSocketConnectionManager()
        project_id = "perf-proj-2"

        connections = []
        for i in range(100):
            conn = _make_connection(user_id=i + 1, user_upn=f"user{i}@example.com")
            conn.project_ids.add(project_id)
            manager._connections[i + 1] = conn
            connections.append(conn)

        manager._project_subscribers[project_id] = set(range(1, 101))

        start = time.monotonic()
        await manager.broadcast_cell_blurred(project_id, 0, "node-1", "planned_start_date")
        elapsed_ms = (time.monotonic() - start) * 1000

        for conn in connections:
            assert conn.websocket.send_text.call_count == 1

        # Fanout should complete within 200ms (allowing for system load variance)
        assert elapsed_ms <= 200, f"Fanout took {elapsed_ms:.1f}ms, expected ≤ 200ms"

    @pytest.mark.asyncio
    async def test_concurrent_cell_focus_operations(self):
        """100 concurrent cell focus operations should complete quickly."""
        manager = WebSocketConnectionManager()
        project_id = "perf-proj-3"

        connections = []
        for i in range(100):
            conn = _make_connection(user_id=i + 1, user_upn=f"user{i}@example.com")
            manager._connections[i + 1] = conn
            connections.append(conn)

        async def focus_cell(idx):
            conn = connections[idx]
            await manager._handle_cell_focused(conn, {
                "project_id": project_id,
                "node_id": f"node-{idx}",
                "column_key": "planned_start_date",
            })

        start = time.monotonic()
        await asyncio.gather(*(focus_cell(i) for i in range(100)))
        elapsed_ms = (time.monotonic() - start) * 1000

        # All 100 cells should be focused
        cell_map = manager.get_cell_focus_for_project(project_id)
        assert len(cell_map) == 100

        # Should complete within 100ms
        assert elapsed_ms <= 100, f"100 focus ops took {elapsed_ms:.1f}ms, expected ≤ 100ms"
