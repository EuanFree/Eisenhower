---
sessionId: session-261025-190748-19cf
---

# Requirements

### Overview & Goals

Build a **CoPilot** feature that embeds an AI chat interface as a docked side panel in the GUI. The CoPilot connects to configurable LLM backends (OpenAI, Anthropic, or OpenAI-compatible endpoints) and uses the existing MCP tools (47 tools) to query and interact with the Eisenhower system. The CoPilot is context-aware, showing the user what context it has access to, with the ability to clear or modify that context.

### User Stories

- As a **project manager**, I want to ask the CoPilot "what is blocking delivery?" and receive a summary of active blockers with their impact, so I can prioritize resolution.
- As a **team lead**, I want to ask "show me resource utilization for this week" and get a chart-ready response, so I can spot overallocation quickly.
- As a **schedule analyst**, I want to simulate "what if task X is delayed by 2 weeks?" and see the resulting finish slip on milestones, without running manual calculations.
- As a **user**, I want the CoPilot to know which project and view I am working in, so I do not have to repeat context in every message.
- As a **user**, I want to see what context the CoPilot has and clear it when needed, so I maintain trust and control over data exposure.

### Functional Requirements

#### CoPilot Chat Interface
- **Docked side panel** — A collapsible panel (280-400px wide) docking to the right of the workspace, toggleable via a button in the toolbar.
- **Chat messages** — User messages (right-aligned) and AI responses (left-aligned) with timestamps.
- **Streaming responses** — AI responses stream in real-time as tokens are generated.
- **Markdown rendering** — AI responses support markdown (bold, lists, code blocks, tables).
- **Tool call visualization** — When the CoPilot calls an MCP tool, show a collapsible "Thinking..." indicator with the tool name and parameters.
- **Conversation history** — Messages persist within the session; new conversations can be started.

#### Context Awareness
- **Current view context** — The CoPilot knows the active workspace tab type and any parameters (project ID, node ID, etc.).
- **Context display** — A "Context" section shows what the CoPilot knows (e.g., "Project: Falcon", "View: Dashboard", "Selected Node: WP-0042").
- **Context controls** — User can clear context, add manual context, or toggle context sharing on/off.
- **Automatic parameter injection** — When the CoPilot calls tools, it pre-fills parameters like `project_id` from the current context.

#### LLM Provider Configuration
- **Provider selection** — Admin can configure the LLM provider: OpenAI, Anthropic, or OpenAI-compatible endpoint.
- **API key management** — API keys stored in environment variables or encrypted database settings.
- **Model selection** — Configurable model name (e.g., gpt-4o, claude-sonnet-4, or custom model).
- **Fallback handling** — Graceful error messages when the LLM is unavailable.

#### MCP Tool Integration
- **All 47 MCP tools** available to the CoPilot via function calling.
- **Tool results** are returned to the LLM, which generates a natural-language response.
- **Error handling** — Tool errors (e.g., insufficient clearance) are communicated to the user.

### Non-Functional Requirements
- CoPilot panel should open within 200ms of clicking the toggle button.
- Streaming responses should begin within 2 seconds of sending a message.
- Tool calls should complete within 10 seconds (with timeout and retry).
- Conversation history is session-only (not persisted to database) unless explicitly saved.

### Out of Scope
- Multi-turn conversation memory across sessions (can be added later).
- CoPilot-generated dashboard/widget creation (can use existing MCP tools but no UI automation).
- Voice input/output.
- CoPilot access to external data sources beyond MCP tools.

# Technical Design

### Current Implementation

The project is a **FastAPI + React** application with:
- **Backend**: FastAPI routers under `/api/v1/*`, MCP server at `app/services/mcp_server.py` with 47 tools, SSE transport via `app/routers/mcp.py` at `/api/v1/mcp/sse` and `/api/v1/mcp/messages/`.
- **Frontend**: React 18 + Tailwind CSS + Zustand stores. Workspace uses tab-based system (`useWorkspaceStore.ts`). Docked panels follow the pattern of `AppSidebar.tsx` (collapsible rail).
- **MCP**: The `mcp` Python package (>=1.0.0) is installed. The MCP server exposes tools but has **no LLM backend** — it is a pure tools server. The SSE transport is a custom implementation in `app/routers/mcp.py`.

### Key Decisions

1. **Multi-provider LLM backend** — New `app/services/llm_provider.py` with an abstract `LLMProvider` interface and concrete implementations for OpenAI, Anthropic, and OpenAI-compatible endpoints. Configured via environment variables.
2. **Streaming chat endpoint** — New `app/routers/copilot.py` with a `POST /api/v1/copilot/chat` endpoint that streams LLM responses using Server-Sent Events (SSE). The LLM uses function calling to invoke MCP tools.
3. **Context injection** — The frontend sends current context (view type, project ID, selected node) with each chat message. The backend injects this context into the system prompt.
4. **Docked side panel** — New `CopilotPanel` component that docks to the right of the workspace, similar to VS Code Chat view. Toggled via a button in the main toolbar.
5. **Zustand store** — `useCopilotStore.ts` manages conversation history, streaming state, and context.

### Backend Service: LLM Provider

**New file: `app/services/llm_provider.py`**

```
LLMProvider (ABC)
  - chat(messages, tools, stream=True) -> AsyncGenerator[ChatChunk]
  - chat_completion(messages, tools) -> ChatCompletion

OpenAIProvider(LLMProvider)
  - Uses openai.AsyncOpenAI client
  - Supports function calling via openai.ChatCompletionTool

AnthropicProvider(LLMProvider)
  - Uses anthropic.AsyncAnthropic client
  - Supports tool use via anthropic.MessagesTool

OpenAICompatProvider(LLMProvider)
  - Uses openai.AsyncOpenAI with custom base_url
  - For Ollama, LM Studio, vLLM, etc.
```

Configuration via environment variables:
- `COPILOT_PROVIDER`: `openai`, `anthropic`, or `compat`
- `COPILOT_API_KEY`: API key
- `COPILOT_MODEL`: Model name (e.g., `gpt-4o`, `claude-sonnet-4`)
- `COPILOT_BASE_URL`: Base URL (for compat provider)

### Backend Router: CoPilot Chat

**New file: `app/routers/copilot.py`**

Endpoints at `/api/v1/copilot`:
- `POST /copilot/chat` — Streaming chat endpoint (SSE). Accepts message, context, and conversation history. Returns streamed tokens and tool call events.
- `POST /copilot/stop` — Stop the current streaming response.
- `GET /copilot/tools` — List available MCP tools (for the frontend to display).

The chat endpoint:
1. Validates the user JWT token.
2. Constructs a system prompt with context (current view, project, selected node).
3. Calls the LLM with MCP tools as function calling tools.
4. When the LLM requests a tool call, executes the corresponding MCP tool.
5. Streams tokens back to the frontend via SSE.

### Backend: Context Builder

**New file: `app/services/copilot_context.py`**

- `build_system_prompt(context: CopilotContext) -> str`: Constructs the system prompt including:
  - Role definition (Eisenhower CoPilot assistant)
  - Current user context (project, view, selected node)
  - Available tools summary
  - Security reminders (clearance-aware responses)
- `CopilotContext` dataclass: view_type, project_id, node_id, dashboard_id, selected_items, user_clearance

### Frontend Components

**New directory: `frontend/src/components/copilot/`**

- `CopilotPanel.tsx` — Docked side panel (280-400px) with header, context bar, message list, and input area.
- `CopilotHeader.tsx` — Panel header with title, provider indicator, and close button.
- `CopilotContextBar.tsx` — Displays current context (project, view, node) with clear/toggle controls.
- `CopilotMessageList.tsx` — Scrollable message list with user/AI messages.
- `CopilotMessage.tsx` — Individual message component with markdown rendering.
- `CopilotToolCall.tsx` — Collapsible indicator showing tool name, parameters, and result.
- `CopilotInput.tsx` — Text input with send button, stop button (during streaming), and keyboard shortcuts.
- `CopilotTypingIndicator.tsx` — Animated dots while waiting for the first token.

**New store: `frontend/src/stores/useCopilotStore.ts`**

Zustand store managing:
- Conversation messages (array of Message objects)
- Streaming state (is_streaming, current_stream_content)
- Context (view_type, project_id, node_id, is_context_enabled)
- Panel state (is_open, width)

**New types: `frontend/src/types/copilot.ts`**

TypeScript interfaces for Message, ToolCall, CopilotContext, and SSE events.

### Frontend Integration

- **Toolbar button** — Add a CoPilot toggle button to the main toolbar (next to existing controls).
- **Context synchronization** — The `CopilotContextBar` subscribes to `useWorkspaceStore` to automatically update context when the active tab changes.
- **Keyboard shortcut** — `Ctrl+J` (or `Cmd+J` on Mac) to toggle the CoPilot panel.

### Architecture Diagram

``` mermaid
graph LR
  subgraph Frontend
    CP[CopilotPanel]
    CB[CopilotContextBar]
    ML[CopilotMessageList]
    CI[CopilotInput]
    CS[useCopilotStore]
    WS[useWorkspaceStore]
  end

  subgraph Backend
    CR[copilot.py router]
    LP[llm_provider.py]
    CC[copilot_context.py]
    MS[mcp_server.py]
  end

  subgraph External
    LLM[(LLM API)]
  end

  CP --> CB
  CP --> ML
  CP --> CI
  CP --> CS
  CB --> WS
  CS --> CR
  CR --> CC
  CR --> LP
  LP --> LLM
  LP --> MS
```

### Risks

- **LLM API costs**: Streaming responses with tool calls can be expensive. Mitigated by configurable model selection and conversation length limits.
- **Tool call latency**: Some MCP tools query the database directly. Mitigated by 10-second timeouts and async execution.
- **Security**: The CoPilot inherits the user clearance via JWT. Tool results are already filtered by ABAC. No additional security layer needed beyond what MCP tools already enforce.
- **Streaming reliability**: SSE connections can be interrupted. Mitigated by reconnection logic and message buffering in the store.
- **Air-gapped environments**: OpenAI/Anthropic require internet. The OpenAI-compatible provider supports local models (Ollama, LM Studio) for air-gapped use.

# Testing

### Validation Approach

The CoPilot feature will be validated through component tests, integration tests, and manual verification of the chat flow.

### Key Scenarios

1. **Basic chat**: User opens the CoPilot panel, types "hello", and receives a greeting from the LLM.
2. **Tool-assisted query**: User asks "what are the active blockers?" and the CoPilot calls `query_active_blockers`, then summarizes the results.
3. **Context-aware query**: User has a project open, asks "show me the critical path", and the CoPilot automatically includes the project ID in the tool call.
4. **Context display**: The context bar shows the current project and view; user can clear context.
5. **Streaming**: Response tokens appear incrementally, not all at once.
6. **Multi-provider**: Switching between OpenAI and a local Ollama instance works via config.

### Edge Cases

- **LLM unavailable**: CoPilot shows an error message and suggests checking the provider configuration.
- **Tool call failure**: If a tool returns an error (e.g., insufficient clearance), the CoPilot communicates this to the user.
- **Empty context**: CoPilot works without context, asking the user for parameters.
- **Long conversations**: After a certain number of messages, older messages are trimmed to stay within token limits.
- **Panel resize**: The panel can be resized and the chat adapts to the new width.
- **Concurrent conversations**: Only one active conversation at a time; sending a new message while streaming stops the current stream.

### Test Changes

- Add unit tests for `llm_provider.py` with mock LLM responses.
- Add unit tests for `copilot_context.py` prompt building.
- Add integration tests for the `/copilot/chat` endpoint with a mock LLM.
- Add component tests for `CopilotPanel` (open/close, message display, streaming).
- Add component tests for `CopilotContextBar` (context display, clear).

# Delivery Steps

### ✓ Step 1: Create LLM provider service and CoPilot backend router

### ✓ Step 2: Build CoPilot store, types, and chat UI components
Create the Zustand store, TypeScript types, and core chat components for the CoPilot panel.

- Created `frontend/src/types/copilot.ts` with interfaces for Message, ToolCall, CopilotContext, SSE events, and streaming states.
- Created `frontend/src/stores/useCopilotStore.ts` with conversation messages, streaming state, context, panel state, and SSE connection management.
- Created `frontend/src/components/copilot/CopilotPanel.tsx` — docked resizable side panel (280-600px).
- Created `frontend/src/components/copilot/CopilotHeader.tsx` — panel header with provider badge and close button.
- Created `frontend/src/components/copilot/CopilotContextBar.tsx` — context display with toggle and clear controls.

### ✓ Step 3: Build message list, input, and streaming components
Create the message display, input area, tool call visualization, and streaming indicator.

- Created `frontend/src/components/copilot/CopilotMessageList.tsx` — scrollable message list with auto-scroll and welcome screen.
- Created `frontend/src/components/copilot/CopilotMessage.tsx` — individual message with markdown-like rendering.
- Created `frontend/src/components/copilot/CopilotToolCall.tsx` — collapsible tool call visualization.
- Created `frontend/src/components/copilot/CopilotInput.tsx` — auto-resize textarea with keyboard shortcuts.
- Created `frontend/src/components/copilot/CopilotTypingIndicator.tsx` — animated loading dots.

### ✓ Step 4: Integrate CoPilot into the workspace layout and toolbar
Wire the CoPilot panel into the main workspace layout, add the toggle button, and connect context synchronization.

- Updated `AppShell.tsx` — CoPilot panel docked to right of workspace, toggle button in nav bar.
- Updated `AppSidebar.tsx` — CoPilot nav item under "Risk & Analytics", Ctrl+J keyboard shortcut.
- Updated `builtInActions.ts` — `nav-copilot` action for command palette access.
- Updated `useWorkspaceStore.ts` — Added `COPILOT` view type and metadata.

### ✓ Step 5: Fix SSE streaming to use fetch with ReadableStream
Fixed critical bug where `sendMessage` used `EventSource` (GET-only) for a POST endpoint.

- Replaced `EventSource` with `fetch()` + `ReadableStream` for proper POST-based SSE streaming.
- Replaced `_eventSource` field with `_abortController` for request cancellation.
- Inlined SSE event parsing (token, tool_call_start, tool_call_end, error, done) within the fetch loop.
- Updated `stopStreaming` and `clearConversation` to use `AbortController.abort()`.