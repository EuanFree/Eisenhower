/**
 * CoPilot Context Bar Component
 *
 * Displays current context items (project, view, node) as removable tags.
 * Provides toggle for enabling/disabling context sharing and clear button.
 */

import { Eye, EyeOff, Trash2, X } from 'lucide-react';
import { useCopilotStore } from '../../stores/useCopilotStore';

export const CopilotContextBar = () => {
  const { context, isContextEnabled, toggleContext, clearContext, updateContext } =
    useCopilotStore();

  const contextItems = [
    { key: 'view_type' as const, label: 'View', value: context.view_type },
    { key: 'project_name' as const, label: 'Project', value: context.project_name },
    { key: 'node_name' as const, label: 'Node', value: context.node_name },
    { key: 'dashboard_id' as const, label: 'Dashboard', value: context.dashboard_id },
  ].filter((item) => item.value);

  const removeItem = (key: string) => {
    updateContext({ [key]: undefined });
  };

  return (
    <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400">Context</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleContext}
            className={`p-1 rounded transition-colors ${
              isContextEnabled
                ? 'text-blue-400 hover:text-blue-300'
                : 'text-gray-500 hover:text-gray-400'
            }`}
            title={isContextEnabled ? 'Context sharing enabled' : 'Context sharing disabled'}
            aria-label="Toggle context sharing"
          >
            {isContextEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          {contextItems.length > 0 && (
            <button
              onClick={clearContext}
              className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors"
              title="Clear all context"
              aria-label="Clear all context"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!isContextEnabled && (
        <p className="text-xs text-gray-500 italic">Context sharing is disabled</p>
      )}

      {isContextEnabled && contextItems.length === 0 && (
        <p className="text-xs text-gray-500 italic">No context available</p>
      )}

      {isContextEnabled && contextItems.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contextItems.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300"
            >
              <span className="text-gray-500">{item.label}:</span>
              <span>{item.value}</span>
              <button
                onClick={() => removeItem(item.key)}
                className="ml-0.5 text-gray-500 hover:text-gray-300"
                aria-label={`Remove ${item.label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default CopilotContextBar;
