/**
 * Widget Palette Component
 *
 * Sidebar with draggable widget type icons. Clicking a widget type adds it
 * to the current dashboard canvas.
 */

import React from 'react';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Gauge,
  TrendingDown,
  ScatterChart,
  Hash,
  Table,
} from 'lucide-react';
import { useDashboardStore, WIDGET_TYPE_INFO } from '../../stores/useDashboardStore';
import type { WidgetType } from '../../types/dashboard';

const ICON_MAP: Record<WidgetType, React.ElementType> = {
  COLUMN_CHART: BarChart3,
  LINE_CHART: TrendingUp,
  AREA_CHART: Activity,
  GAUGE: Gauge,
  BURNDOWN: TrendingDown,
  SCATTER: ScatterChart,
  NUMBER_CARD: Hash,
  TABLE: Table,
};

const WidgetPalette: React.FC = () => {
  const { addWidget, isEditMode } = useDashboardStore();

  return (
    <div className="w-56 bg-surface-ops-sidebar border-r border-border-ops-subtle flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-border-ops-subtle">
        <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
          Widgets
        </h3>
      </div>

      <div className="p-3 space-y-2">
        {WIDGET_TYPE_INFO.map((info) => {
          const Icon = ICON_MAP[info.type];
          return (
            <button
              key={info.type}
              onClick={() => isEditMode && addWidget(info.type)}
              disabled={!isEditMode}
              title={info.description}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                transition-colors duration-100
                ${isEditMode
                  ? 'hover:bg-surface-ops-hover cursor-pointer text-text-ops-primary'
                  : 'opacity-40 cursor-not-allowed text-text-ops-muted'
                }
              `}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{info.label}</p>
                <p className="text-xs text-text-ops-muted truncate">{info.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {!isEditMode && (
        <div className="mt-4 px-3 pb-3">
          <p className="text-xs text-text-ops-muted italic">
            Enable edit mode to add widgets
          </p>
        </div>
      )}
    </div>
  );
};

export default WidgetPalette;
