/**
 * CoPilot Input Component
 *
 * Textarea with auto-resize, send button, stop button, and keyboard shortcuts.
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { useCopilotStore } from '../../stores/useCopilotStore';

export const CopilotInput = () => {
  const [input, setInput] = useState('');
  const { sendMessage, stopStreaming, streaming } = useCopilotStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming.isStreaming) return;
    sendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && streaming.isStreaming) {
      e.preventDefault();
      stopStreaming();
    }
  };

  return (
    <div className="p-3 border-t border-gray-700 bg-gray-800">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask CoPilot anything..."
            rows={1}
            className="w-full resize-none rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={streaming.isStreaming}
          />
        </div>

        {streaming.isStreaming ? (
          <button
            onClick={stopStreaming}
            className="flex-shrink-0 p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            title="Stop generating"
            aria-label="Stop generating"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="flex-shrink-0 p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white transition-colors"
            title="Send message"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Enter to send • Shift+Enter for newline • Escape to stop
      </p>
    </div>
  );
};

export default CopilotInput;
