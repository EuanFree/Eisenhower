/**
 * CoPilot Message Component
 *
 * Individual message with markdown-like rendering and timestamp.
 */

import type { CopilotMessage as CopilotMessageType } from '../../types/copilot';
import { CopilotToolCall } from './CopilotToolCall';

interface CopilotMessageProps {
  message: CopilotMessageType;
}

export const CopilotMessage = ({ message }: CopilotMessageProps) => {
  const isUser = message.role === 'user';

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Simple markdown-like rendering
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      // Code blocks
      if (line.startsWith('```')) {
        return null;
      }

      let processed = line;

      // Bold
      processed = processed.replace(
        /\*\*(.*?)\*\*/g,
        '<strong>$1</strong>',
      );

      // Inline code
      processed = processed.replace(
        /`(.*?)`/g,
        '<code class="px-1 py-0.5 bg-gray-700 rounded text-xs font-mono text-yellow-300">$1</code>',
      );

      // Links
      processed = processed.replace(
        /\[(.*?)\]\((.*?)\)/g,
        '<a href="$2" class="text-blue-400 underline" target="_blank" rel="noopener">$1</a>',
      );

      return (
        <span
          key={i}
          dangerouslySetInnerHTML={{ __html: processed }}
          className={line.startsWith('- ') ? 'ml-4 list-disc' : ''}
        />
      );
    });
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
          <span className="text-xs text-white">AI</span>
        </div>
      )}

      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-100'
        }`}
      >
        <div className="text-sm whitespace-pre-wrap break-words">
          {renderContent(message.content)}
        </div>

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc) => (
              <CopilotToolCall key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        <div
          className={`text-xs mt-1 ${
            isUser ? 'text-blue-200' : 'text-gray-500'
          }`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center">
          <span className="text-xs text-white">U</span>
        </div>
      )}
    </div>
  );
};

