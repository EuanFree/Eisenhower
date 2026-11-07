/**
 * CoPilot Header Component
 *
 * Panel header with title, provider indicator, and close button.
 */

import { X, Bot } from 'lucide-react';
import { useCopilotStore } from '../../stores/useCopilotStore';

export const CopilotHeader = () => {
  const { closePanel, providerInfo } = useCopilotStore();

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
      <div className="flex items-center gap-2">
        <Bot className="w-5 h-5 text-blue-400" />
        <h2 className="text-sm font-semibold text-gray-100">CoPilot</h2>
        {providerInfo.configured && providerInfo.model && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900 text-blue-300">
            {providerInfo.model}
          </span>
        )}
      </div>
      <button
        onClick={closePanel}
        className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
        aria-label="Close CoPilot panel"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default CopilotHeader;
