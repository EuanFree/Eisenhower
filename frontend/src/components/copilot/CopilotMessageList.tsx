/**
 * CoPilot Message List Component
 *
 * Scrollable message list with auto-scroll to bottom.
 * Renders user messages (right-aligned) and AI messages (left-aligned).
 * Handles streaming messages (appending tokens in real-time).
 */

import { useEffect, useRef } from 'react';
import { useCopilotStore } from '../../stores/useCopilotStore';
import { CopilotMessage } from './CopilotMessage';
import { CopilotTypingIndicator } from './CopilotTypingIndicator';

export const CopilotMessageList = () => {
  const { messages, streaming } = useCopilotStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streaming.currentContent]);

  // Build the list of messages including the streaming message
  const allMessages = [...messages];
  if (streaming.isStreaming && streaming.currentContent) {
    allMessages.push({
      id: 'streaming',
      role: 'assistant' as const,
      content: streaming.currentContent,
      timestamp: new Date(),
      toolCalls: streaming.currentToolCalls.length > 0
        ? streaming.currentToolCalls
        : undefined,
    });
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto py-2"
      style={{ minHeight: 0 }}
    >
      {allMessages.length === 0 && !streaming.isStreaming && (
        <div className="flex flex-col items-center justify-center h-full px-6 text-center">
          <div className="w-16 h-16 mb-4 rounded-full bg-gray-800 flex items-center justify-center">
            <span className="text-2xl">🤖</span>
          </div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Welcome to CoPilot
          </h3>
          <p className="text-xs text-gray-500 max-w-xs">
            Ask me anything about your projects, tasks, resources, or
            schedules. I can query real-time data to help you make decisions.
          </p>
          <div className="mt-4 w-full space-y-2">
            <p className="text-xs text-gray-400 font-medium">Try asking:</p>
            <div className="text-xs text-gray-500 space-y-1">
              <p>• "What are the active blockers?"</p>
              <p>• "Show me resource utilization"</p>
              <p>• "What's on the critical path?"</p>
            </div>
          </div>
        </div>
      )}

      {allMessages.map((msg) => (
        <CopilotMessage key={msg.id} message={msg} />
      ))}

      {streaming.isStreaming && !streaming.currentContent && (
        <CopilotTypingIndicator />
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default CopilotMessageList;
