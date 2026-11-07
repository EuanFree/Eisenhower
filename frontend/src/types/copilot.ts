/**
 * TypeScript types for the CoPilot AI chat feature.
 *
 * These types define the data structures used by the CoPilot panel,
 * including messages, tool calls, context, and SSE events.
 */

/**
 * Role of a chat message sender.
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Status of a tool call execution.
 */
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error';

/**
 * A tool (function) call made by the LLM.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
  error?: string;
}

/**
 * A single message in the CoPilot conversation.
 */
export interface CopilotMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

/**
 * Current UI context sent to the backend with each message.
 */
export interface CopilotContext {
  view_type: string;
  project_id?: string;
  project_name?: string;
  node_id?: string;
  node_name?: string;
  dashboard_id?: string;
  selected_items?: string[];
}

/**
 * SSE event types from the backend.
 */
export type SSEEventType =
  | 'start'
  | 'token'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'error'
  | 'done';

/**
 * Data payload for an SSE event.
 */
export interface SSEEvent {
  type: SSEEventType;
  data: string | Record<string, unknown>;
}

/**
 * Streaming state for the current chat response.
 */
export interface StreamingState {
  isStreaming: boolean;
  currentContent: string;
  currentToolCalls: ToolCall[];
  provider?: string;
  model?: string;
}

/**
 * LLM provider information.
 */
export interface ProviderInfo {
  configured: boolean;
  provider?: string;
  model?: string;
  error?: string;
}

/**
 * Available MCP tool information.
 */
export interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Panel state for the CoPilot docked panel.
 */
export interface PanelState {
  isOpen: boolean;
  width: number;
  isResizing: boolean;
}

/**
 * Full CoPilot store state.
 */
export interface CopilotStoreState {
  // Conversation
  messages: CopilotMessage[];
  streaming: StreamingState;

  // Context
  context: CopilotContext;
  isContextEnabled: boolean;

  // Panel
  panel: PanelState;

  // Provider
  providerInfo: ProviderInfo;
  availableTools: ToolInfo[];

  // Actions
  sendMessage: (message: string) => void;
  stopStreaming: () => void;
  clearConversation: () => void;
  updateContext: (context: Partial<CopilotContext>) => void;
  toggleContext: () => void;
  clearContext: () => void;
  togglePanel: () => void;
  closePanel: () => void;
  openPanel: () => void;
  setPanelWidth: (width: number) => void;
  startResizing: () => void;
  stopResizing: () => void;
  fetchProviderInfo: () => Promise<void>;
  fetchAvailableTools: () => Promise<void>;
  addToolCall: (toolCall: ToolCall) => void;
  updateToolCall: (id: string, updates: Partial<ToolCall>) => void;
}
