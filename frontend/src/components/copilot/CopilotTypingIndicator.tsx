/**
 * CoPilot Typing Indicator Component
 *
 * Animated dots while waiting for the first token from the LLM.
 */

export const CopilotTypingIndicator = () => {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
        <span className="text-xs text-white">AI</span>
      </div>
      <div className="flex items-center gap-1 py-2">
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  );
};

export default CopilotTypingIndicator;
