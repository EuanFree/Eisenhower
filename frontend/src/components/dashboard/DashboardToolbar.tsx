/**
 * Dashboard Toolbar Component
 *
 * Save, share, refresh, and edit-mode toggle buttons.
 * Dashboard name display and switcher dropdown.
 */

import React, { useState } from 'react';
import {
  Save,
  RefreshCw,
  Edit3,
  Eye,
  Plus,
  Share2,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { useDashboardStore } from '../../stores/useDashboardStore';

const DashboardToolbar: React.FC = () => {
  const {
    currentDashboard,
    dashboards,
    isEditMode,
    toggleEditMode,
    loadWidgetData,
    loadDashboard,
    createDashboard,
    updateDashboard,
    deleteDashboard,
  } = useDashboardStore();

  const [showMenu, setShowMenu] = useState(false);
  const [newName, setNewName] = useState(currentDashboard?.name || '');

  const handleSave = async () => {
    if (!currentDashboard) return;
    const payload = {
      name: newName,
      layout_config: {
        widgets: currentDashboard.widgets.map((w) => ({
          id: w.id,
          position: w.position,
        })),
        canvasWidth: useDashboardStore.getState().canvasWidth,
        canvasHeight: useDashboardStore.getState().canvasHeight,
      },
    };
    await updateDashboard(currentDashboard.id, payload);
  };

  const handleCreateNew = async () => {
    const dashboard = await createDashboard({
      name: `Dashboard ${dashboards.length + 1}`,
      sharing_scope: 'PRIVATE',
    });
    loadDashboard(dashboard.id);
  };

  const handleDelete = async () => {
    if (!currentDashboard) return;
    if (confirm(`Delete "${currentDashboard.name}"?`)) {
      await deleteDashboard(currentDashboard.id);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface-ops-sidebar border-b border-border-ops-subtle">
      {/* Left side — dashboard name and switcher */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-ops-hover"
          >
            <span className="text-sm font-semibold text-text-ops-primary">
              {currentDashboard?.name || 'No Dashboard'}
            </span>
            <ChevronDown className="w-4 h-4 text-text-ops-muted" />
          </button>

          {showMenu && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-surface-ops-panel border border-border-ops-border rounded-lg shadow-xl z-50">
              <div className="p-2 border-b border-border-ops-subtle">
                <button
                  onClick={() => { handleCreateNew(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-surface-ops-hover text-text-ops-primary"
                >
                  <Plus className="w-4 h-4" />
                  New Dashboard
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {dashboards.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { loadDashboard(d.id); setShowMenu(false); }}
                    className={`
                      w-full flex items-center justify-between px-3 py-2 text-sm rounded
                      ${d.id === currentDashboard?.id
                        ? 'bg-surface-ops-active text-text-ops-primary'
                        : 'hover:bg-surface-ops-hover text-text-ops-muted'
                      }
                    `}
                  >
                    <span className="truncate">{d.name}</span>
                    {d.sharing_scope !== 'PRIVATE' && (
                      <Share2 className="w-3 h-3 flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {currentDashboard && (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleSave}
            className="px-2 py-1 text-sm bg-transparent border border-transparent hover:border-border-ops-border focus:border-blue-500 rounded outline-none text-text-ops-primary"
          />
        )}
      </div>

      {/* Right side — actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={loadWidgetData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-surface-ops-hover text-text-ops-muted hover:text-text-ops-primary"
          title="Refresh data"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>

        {currentDashboard && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-red-500/10 text-text-ops-muted hover:text-red-400"
            title="Delete dashboard"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={toggleEditMode}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors
            ${isEditMode
              ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
              : 'hover:bg-surface-ops-hover text-text-ops-muted hover:text-text-ops-primary'
            }
          `}
          title={isEditMode ? 'Exit edit mode' : 'Enter edit mode'}
        >
          {isEditMode ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
          {isEditMode ? 'View' : 'Edit'}
        </button>
      </div>
    </div>
  );
};

export default DashboardToolbar;
