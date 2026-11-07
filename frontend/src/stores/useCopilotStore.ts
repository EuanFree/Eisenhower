/**
 * CoPilot Zustand Store
 *
 * Manages the CoPilot chat state: conversation messages, streaming state,
 * context, panel state, and provider information.
 *
 * Uses SSE (Server-Sent Events) for streaming responses from the backend.
 */

import { create } from 'zustand';
import { getAuthToken } from '../services/api';
import type {
  CopilotMessage,
  CopilotContext,
  StreamingState,
  PanelState,
  ProviderInfo,
  ToolInfo,
  ToolCall,
  ToolCallStatus,
} from '../types/copilot';

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const defaultStreaming: StreamingState = {
  isStreaming: false,
  currentContent: '',
  currentToolCalls: [],
};

const defaultContext: CopilotContext = {
  view_type: '',
};

const defaultPanel: PanelState = {
  isOpen: false,
  width: 380,
  isResizing: false,
};

const defaultProviderInfo: ProviderInfo = {
  configured: false,
};

// ---------------------------------------------------------------------------
// Helper: generate unique message ID
// ---------------------------------------------------------------------------

let messageIdCounter = 0;
const generateMessageId = () => `msg-${Date.now()}-${++messageIdCounter}`;

// ---------------------------------------------------------------------------
// Store definition
// ---------------------------------------------------------------------------

interface CopilotStore {
  // State
  messages: CopilotMessage[];
  streaming: StreamingState;
  context: CopilotContext;
  isContextEnabled: boolean;
  panel: PanelState;
  providerInfo: ProviderInfo;
  availableTools: ToolInfo[];

  // Abort controller for active streaming request
  _abortController: AbortController | null;

  // Actions
  sendMessage: (message: string) => void;
  stopStreaming: () => void;
  clearConversation: () => void;
  updateContext: (ctx: Partial<CopilotContext>) => void;
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

export const useCopilotStore = create<CopilotStore>((set, get) => ({
  // Initial state
  messages: [],
  streaming: defaultStreaming,
  context: defaultContext,
  isContextEnabled: true,
  panel: defaultPanel,
  providerInfo: defaultProviderInfo,
  availableTools: [],
  _abortController: null,

  // -----------------------------------------------------------------------
  // Send a message to the backend
  // -----------------------------------------------------------------------
  sendMessage: (message: string) => {
    const { streaming, context, isContextEnabled, messages } = get();

    // Don't send if already streaming
    if (streaming.isStreaming) return;

    // Add user message
    const userMessage: CopilotMessage = {
      id: generateMessageId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      streaming: {
        ...defaultStreaming,
        isStreaming: true,
      },
    }));

    // Build conversation history (last 20 messages)
    const history = messages
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    // Build context payload
    const ctxPayload = isContextEnabled ? context : { view_type: '' };

    // Abort any existing streaming request
    const existing = get()._abortController;
    if (existing) {
      existing.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    set({ _abortController: abortController });

    // Prepare assistant message placeholder
    const assistantId = generateMessageId();
    let assistantContent = '';
    const toolCalls: ToolCall[] = [];

    const token = getAuthToken();

    // Use fetch with ReadableStream for POST-based SSE
    fetch('/api/v1/copilot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        context: ctxPayload,
        conversation_history: history,
      }),
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let eventType = 'message';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6).trim();
            } else if (line === '') {
              // Empty line signals end of SSE event — process it inline
              if (eventData) {
                switch (eventType) {
                  case 'start': {
                    try {
                      const data = JSON.parse(eventData);
                      set((state) => ({
                        streaming: {
                          ...state.streaming,
                          provider: data.provider,
                          model: data.model,
                        },
                      }));
                    } catch {
                      // Ignore parse errors
                    }
                    break;
                  }
                  case 'token': {
                    assistantContent += eventData;
                    set((state) => ({
                      streaming: {
                        ...state.streaming,
                        currentContent: assistantContent,
                      },
                    }));
                    break;
                  }
                  case 'tool_call_start': {
                    try {
                      const data = JSON.parse(eventData);
                      const toolCall: ToolCall = {
                        id: data.id,
                        name: data.name,
                        arguments: data.arguments || {},
                        status: 'running',
                      };
                      toolCalls.push(toolCall);
                      set((state) => ({
                        streaming: {
                          ...state.streaming,
                          currentToolCalls: [...toolCalls],
                        },
                      }));
                    } catch {
                      // Ignore parse errors
                    }
                    break;
                  }
                  case 'tool_call_end': {
                    try {
                      const data = JSON.parse(eventData);
                      set((state) => {
                        const updated = state.streaming.currentToolCalls.map((tc) =>
                          tc.id === data.id
                            ? { ...tc, status: 'completed' as ToolCallStatus, result: data.result }
                            : tc,
                        );
                        return {
                          streaming: { ...state.streaming, currentToolCalls: updated },
                        };
                      });
                    } catch {
                      // Ignore parse errors
                    }
                    break;
                  }
                  case 'error': {
                    try {
                      const data = JSON.parse(eventData);
                      const errorMessage =
                        typeof data === 'string' ? data : (data.message || 'An error occurred.');
                      assistantContent += `\n\n⚠️ ${errorMessage}`;
                      set((state) => ({
                        streaming: { ...state.streaming, currentContent: assistantContent },
                      }));
                    } catch {
                      // Ignore parse errors
                    }
                    break;
                  }
                  case 'done': {
                    // Finalization handled after the loop
                    break;
                  }
                }
              }
              eventType = 'message';
              eventData = '';
            }
          }
        }

        // Streaming complete — finalize message
        set((state) => {
          const hasContent = assistantContent.trim().length > 0;
          const finalMessage: CopilotMessage = {
            id: assistantId,
            role: 'assistant',
            content: hasContent ? assistantContent : 'No response generated.',
            timestamp: new Date(),
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          };
          return {
            messages: [...state.messages, finalMessage],
            streaming: defaultStreaming,
            _abortController: null,
          };
        });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('CoPilot chat error:', err);
        set((state) => {
          // If we have partial content, add it as a message
          if (assistantContent.trim().length > 0) {
            const partialMessage: CopilotMessage = {
              id: assistantId,
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date(),
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            };
            return {
              messages: [...state.messages, partialMessage],
              streaming: defaultStreaming,
              _abortController: null,
            };
          }
          return {
            streaming: defaultStreaming,
            _abortController: null,
            messages: [
              ...state.messages,
              {
                id: assistantId,
                role: 'assistant',
                content: `Failed to send message: ${err.message}. Please try again.`,
                timestamp: new Date(),
              },
            ],
          };
        });
      });
  },

  // -----------------------------------------------------------------------
  // Stop streaming
  // -----------------------------------------------------------------------
  stopStreaming: () => {
    const { _abortController } = get();
    if (_abortController) {
      _abortController.abort();
      set({ _abortController: null });
    }
    fetch('/api/v1/copilot/stop', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    }).catch(() => {
      // Ignore errors
    });
    set({ streaming: defaultStreaming });
  },

  // -----------------------------------------------------------------------
  // Clear conversation
  // -----------------------------------------------------------------------
  clearConversation: () => {
    const { _abortController } = get();
    if (_abortController) {
      _abortController.abort();
    }
    set({
      messages: [],
      streaming: defaultStreaming,
      _abortController: null,
    });
  },

  // -----------------------------------------------------------------------
  // Context management
  // -----------------------------------------------------------------------
  updateContext: (ctx: Partial<CopilotContext>) => {
    set((state) => ({
      context: { ...state.context, ...ctx },
    }));
  },

  toggleContext: () => {
    set((state) => ({ isContextEnabled: !state.isContextEnabled }));
  },

  clearContext: () => {
    set({ context: defaultContext });
  },

  // -----------------------------------------------------------------------
  // Panel management
  // -----------------------------------------------------------------------
  togglePanel: () => {
    set((state) => ({
      panel: { ...state.panel, isOpen: !state.panel.isOpen },
    }));
  },

  closePanel: () => {
    set((state) => ({
      panel: { ...state.panel, isOpen: false },
    }));
  },

  openPanel: () => {
    set((state) => ({
      panel: { ...state.panel, isOpen: true },
    }));
  },

  setPanelWidth: (width: number) => {
    set((state) => ({
      panel: { ...state.panel, width: Math.max(280, Math.min(600, width)) },
    }));
  },

  startResizing: () => {
    set((state) => ({
      panel: { ...state.panel, isResizing: true },
    }));
  },

  stopResizing: () => {
    set((state) => ({
      panel: { ...state.panel, isResizing: false },
    }));
  },

  // -----------------------------------------------------------------------
  // Provider info
  // -----------------------------------------------------------------------
  fetchProviderInfo: async () => {
    try {
      const token = getAuthToken();
      const response = await fetch('/api/v1/copilot/provider-info', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        set({ providerInfo: data });
      }
    } catch {
      set({ providerInfo: { configured: false, error: 'Failed to fetch provider info' } });
    }
  },

  fetchAvailableTools: async () => {
    try {
      const response = await fetch('/api/v1/copilot/tools');
      if (response.ok) {
        const data = await response.json();
        set({ availableTools: data.tools || [] });
      }
    } catch {
      // Ignore errors
    }
  },

  // -----------------------------------------------------------------------
  // Tool call management
  // -----------------------------------------------------------------------
  addToolCall: (toolCall: ToolCall) => {
    set((state) => ({
      streaming: {
        ...state.streaming,
        currentToolCalls: [...state.streaming.currentToolCalls, toolCall],
      },
    }));
  },

  updateToolCall: (id: string, updates: Partial<ToolCall>) => {
    set((state) => ({
      streaming: {
        ...state.streaming,
        currentToolCalls: state.streaming.currentToolCalls.map((tc) =>
          tc.id === id ? { ...tc, ...updates } : tc,
        ),
      },
    }));
  },
}));
