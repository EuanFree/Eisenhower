/**
 * CoPilot Tool Call Component
 *
 * Collapsible card showing tool name, parameters, and result.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import type { ToolCall } from '../../types/copilot';

interface CopilotToolCallProps {
  toolCall: ToolCall;
}

export const CopilotToolCall = ({ toolCall }: CopilotToolCallProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusIcon = {
    pending: <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />,
    running: <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />,
    completed: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
    error: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
  }[toolCall.status];

  return (
    <div className="my-2 rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-700/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}
        {statusIcon}
        <span className="text-xs font-mono text-blue-300">{toolCall.name}</span>
        <span className="text-xs text-gray-500 truncate">
          {Object.keys(toolCall.arguments).join(', ')}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-700/50">
          <div className="pt-2">
            <span className="text-xs text-gray-500">Parameters:</span>
            <pre className="mt-1 text-xs font-mono text-gray-300 bg-gray-900 p-2 rounded overflow-x-auto">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>

          {toolCall.result && (
            <div>
              <span className="text-xs text-gray-500">Result:</span>
              <pre className="mt-1 text-xs font-mono text-green-300 bg-gray-900 p-2 rounded overflow-x-auto max-h-40">
                {typeof toolCall.result === 'string'
                  ? (() => {
                      try {
                        return JSON.stringify(JSON.parse(toolCall.result), null, 2);
                      } catch {
                        return toolCall.result;
                      }
                    })()
                  : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}

          {toolCall.error && (
            <div>
              <span className="text-xs text-gray-500">Error:</span>
              <pre className="mt-1 text-xs font-mono text-red-300 bg-gray-900 p-2 rounded overflow-x-auto">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CopilotToolCall;
