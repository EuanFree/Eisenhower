"""Multi-provider LLM service for the CoPilot chat feature.

This module provides an abstract interface for interacting with large
language models (LLMs) from different providers. It supports:

- **OpenAI** — GPT-4o, GPT-4 Turbo, etc.
- **Anthropic** — Claude Sonnet, Claude Opus, etc.
- **OpenAI-compatible** — Ollama, LM Studio, vLLM, and other
  OpenAI-compatible endpoints for air-gapped or on-premises use.

Configuration
~~~~~~~~~~~~~

The provider is selected via environment variables:

- ``COPILOT_PROVIDER`` — One of ``openai``, ``anthropic``, or ``compat``.
- ``COPILOT_API_KEY`` — API key for the selected provider.
- ``COPILOT_MODEL`` — Model name (e.g., ``gpt-4o``, ``claude-sonnet-4``).
- ``COPILOT_BASE_URL`` — Base URL (required for ``compat`` provider).

Usage
~~~~~

The factory function ``create_provider()`` reads the environment variables
and returns a configured ``LLMProvider`` instance ready for use::

    provider = create_provider()
    async for chunk in provider.chat(messages, tools):
        print(chunk.content, end="")
"""
import json
import os
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional

from pydantic import BaseModel


# ============================================================================
# Data models for chat interactions
# ============================================================================


class ChatMessage(BaseModel):
    """A single message in a chat conversation."""
    role: str  # "system", "user", or "assistant"
    content: str


class ToolCall(BaseModel):
    """A tool (function) call requested by the LLM."""
    id: str
    name: str
    arguments: Dict[str, Any]


class ToolResult(BaseModel):
    """The result of executing a tool call."""
    tool_call_id: str
    content: str


class ChatChunk(BaseModel):
    """A streamed chunk of LLM output."""
    content: str
    finish_reason: Optional[str] = None


class ChatCompletion(BaseModel):
    """A non-streamed LLM completion."""
    content: str
    tool_calls: List[ToolCall] = []
    finish_reason: Optional[str] = None


class ToolDefinition(BaseModel):
    """A tool definition for function calling."""
    name: str
    description: str
    parameters: Dict[str, Any]


# ============================================================================
# Abstract base class
# ============================================================================


class LLMProvider(ABC):
    """Abstract interface for LLM providers.

    Subclasses implement the actual API calls to different LLM providers
    (OpenAI, Anthropic, etc.) while presenting a unified interface to
    the CoPilot chat endpoint.
    """

    @abstractmethod
    async def chat(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        stream: bool = True,
    ) -> AsyncGenerator[ChatChunk, None]:
        """Stream a chat completion with optional tool calling.

        Parameters
        ----------
        messages : list[ChatMessage]
            The conversation history including system prompt.
        tools : list[ToolDefinition], optional
            Tool definitions for function calling.
        stream : bool
            Whether to stream tokens (default True).

        Yields
        ------
        ChatChunk
            Streamed tokens with optional finish reason.
        """

    @abstractmethod
    async def chat_completion(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
    ) -> ChatCompletion:
        """Get a non-streamed chat completion.

        Parameters
        ----------
        messages : list[ChatMessage]
            The conversation history.
        tools : list[ToolDefinition], optional
            Tool definitions for function calling.

        Returns
        -------
        ChatCompletion
            The full response with content and any tool calls.
        """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the human-readable provider name (e.g., 'OpenAI')."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the configured model name."""


# ============================================================================
# OpenAI Provider
# ============================================================================


class OpenAIProvider(LLMProvider):
    """LLM provider using the OpenAI API.

    Supports GPT-4o, GPT-4 Turbo, and other OpenAI models with
    native function calling support.
    """

    def __init__(self, api_key: str, model: str = "gpt-4o"):
        """Initialize the OpenAI provider.

        Parameters
        ----------
        api_key : str
            OpenAI API key.
        model : str
            Model name (default: gpt-4o).
        """
        self._api_key = api_key
        self._model = model
        self._client = None

    @property
    def _client_instance(self):
        """Lazy-load the OpenAI async client."""
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self._api_key)
        return self._client

    @property
    def provider_name(self) -> str:
        """Return the name of the LLM provider.

        Returns
        -------
        str
            The string ``"OpenAI"``.
        """
        return "OpenAI"

    @property
    def model_name(self) -> str:
        """Return the configured model name.

        Returns
        -------
        str
            The OpenAI model identifier (e.g., ``"gpt-4o"``).
        """
        return self._model

    async def chat(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        stream: bool = True,
    ) -> AsyncGenerator[ChatChunk, None]:
        """Stream chat completion from OpenAI."""
        client = self._client_instance
        api_messages = [_to_openai_message(m) for m in messages]
        api_tools = [_to_openai_tool(t) for t in tools] if tools else None

        response = await client.chat.completions.create(
            model=self._model,
            messages=api_messages,
            tools=api_tools,
            stream=True,
        )

        content = ""
        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta.content:
                content += delta.content
                yield ChatChunk(content=delta.content)
            if chunk.choices[0].finish_reason:
                yield ChatChunk(
                    content="",
                    finish_reason=chunk.choices[0].finish_reason,
                )

    async def chat_completion(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
    ) -> ChatCompletion:
        """Get a non-streamed completion from OpenAI."""
        client = self._client_instance
        api_messages = [_to_openai_message(m) for m in messages]
        api_tools = [_to_openai_tool(t) for t in tools] if tools else None

        response = await client.chat.completions.create(
            model=self._model,
            messages=api_messages,
            tools=api_tools,
            stream=False,
        )

        message = response.choices[0].message
        content = message.content or ""
        tool_calls = []

        if message.tool_calls:
            for tc in message.tool_calls:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=args,
                ))

        return ChatCompletion(
            content=content,
            tool_calls=tool_calls,
            finish_reason=response.choices[0].finish_reason,
        )


# ============================================================================
# Anthropic Provider
# ============================================================================


class AnthropicProvider(LLMProvider):
    """LLM provider using the Anthropic API.

    Supports Claude models with native tool use support.
    """

    def __init__(self, api_key: str, model: str = "claude-sonnet-4"):
        """Initialize the Anthropic provider.

        Parameters
        ----------
        api_key : str
            Anthropic API key.
        model : str
            Model name (default: claude-sonnet-4).
        """
        self._api_key = api_key
        self._model = model
        self._client = None

    @property
    def _client_instance(self):
        """Lazy-load the Anthropic async client."""
        if self._client is None:
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=self._api_key)
        return self._client

    @property
    def provider_name(self) -> str:
        """Return the name of the LLM provider.

        Returns
        -------
        str
            The string ``"Anthropic"``.
        """
        return "Anthropic"

    @property
    def model_name(self) -> str:
        """Return the configured model name.

        Returns
        -------
        str
            The Anthropic model identifier (e.g., ``"claude-sonnet-4"``).
        """
        return self._model

    async def chat(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        stream: bool = True,
    ) -> AsyncGenerator[ChatChunk, None]:
        """Stream chat completion from Anthropic."""
        client = self._client_instance
        system_msg, user_messages = _split_system_message(messages)
        api_messages = [_to_anthropic_message(m) for m in user_messages]
        api_tools = [_to_anthropic_tool(t) for t in tools] if tools else None

        kwargs: Dict[str, Any] = {
            "model": self._model,
            "messages": api_messages,
            "max_tokens": 4096,
            "stream": True,
        }
        if system_msg:
            kwargs["system"] = system_msg
        if api_tools:
            kwargs["tools"] = api_tools

        response = client.messages.create(**kwargs)
        async for event in response:
            if event.type == "content_block_delta":
                if hasattr(event.delta, "text") and event.delta.text:
                    yield ChatChunk(content=event.delta.text)
            elif event.type == "message_delta":
                if event.delta.stop_reason:
                    yield ChatChunk(
                        content="",
                        finish_reason=event.delta.stop_reason,
                    )

    async def chat_completion(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
    ) -> ChatCompletion:
        """Get a non-streamed completion from Anthropic."""
        client = self._client_instance
        system_msg, user_messages = _split_system_message(messages)
        api_messages = [_to_anthropic_message(m) for m in user_messages]
        api_tools = [_to_anthropic_tool(t) for t in tools] if tools else None

        kwargs: Dict[str, Any] = {
            "model": self._model,
            "messages": api_messages,
            "max_tokens": 4096,
        }
        if system_msg:
            kwargs["system"] = system_msg
        if api_tools:
            kwargs["tools"] = api_tools

        response = client.messages.create(**kwargs)
        content = ""
        tool_calls = []

        for block in response.content:
            if block.type == "text":
                content += block.text
            elif block.type == "tool_use":
                args = block.input if isinstance(block.input, dict) else {}
                tool_calls.append(ToolCall(
                    id=block.id,
                    name=block.name,
                    arguments=args,
                ))

        return ChatCompletion(
            content=content,
            tool_calls=tool_calls,
            finish_reason=response.stop_reason,
        )


# ============================================================================
# OpenAI-Compatible Provider (Ollama, LM Studio, vLLM, etc.)
# ============================================================================


class OpenAICompatProvider(LLMProvider):
    """LLM provider for OpenAI-compatible endpoints.

    Supports Ollama, LM Studio, vLLM, and any other server that
    implements the OpenAI API protocol.
    """

    def __init__(self, api_key: str, model: str, base_url: str):
        """Initialize the OpenAI-compatible provider.

        Parameters
        ----------
        api_key : str
            API key (may be empty for local servers).
        model : str
            Model name.
        base_url : str
            Base URL of the compatible endpoint.
        """
        self._api_key = api_key or "not-needed"
        self._model = model
        self._base_url = base_url
        self._client = None

    @property
    def _client_instance(self):
        """Lazy-load the OpenAI async client with custom base URL."""
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                api_key=self._api_key,
                base_url=self._base_url,
            )
        return self._client

    @property
    def provider_name(self) -> str:
        """Return the name of the LLM provider.

        Returns
        -------
        str
            The string ``"OpenAI Compatible"``.
        """
        return "OpenAI Compatible"

    @property
    def model_name(self) -> str:
        """Return the configured model name.

        Returns
        -------
        str
            The model identifier for the OpenAI-compatible endpoint.
        """
        return self._model

    async def chat(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
        stream: bool = True,
    ) -> AsyncGenerator[ChatChunk, None]:
        """Stream chat completion from OpenAI-compatible endpoint."""
        client = self._client_instance
        api_messages = [_to_openai_message(m) for m in messages]
        api_tools = [_to_openai_tool(t) for t in tools] if tools else None

        response = await client.chat.completions.create(
            model=self._model,
            messages=api_messages,
            tools=api_tools,
            stream=True,
        )

        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta.content:
                yield ChatChunk(content=delta.content)
            if chunk.choices[0].finish_reason:
                yield ChatChunk(
                    content="",
                    finish_reason=chunk.choices[0].finish_reason,
                )

    async def chat_completion(
        self,
        messages: List[ChatMessage],
        tools: Optional[List[ToolDefinition]] = None,
    ) -> ChatCompletion:
        """Get a non-streamed completion from OpenAI-compatible endpoint."""
        client = self._client_instance
        api_messages = [_to_openai_message(m) for m in messages]
        api_tools = [_to_openai_tool(t) for t in tools] if tools else None

        response = await client.chat.completions.create(
            model=self._model,
            messages=api_messages,
            tools=api_tools,
            stream=False,
        )

        message = response.choices[0].message
        content = message.content or ""
        tool_calls = []

        if message.tool_calls:
            for tc in message.tool_calls:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=args,
                ))

        return ChatCompletion(
            content=content,
            tool_calls=tool_calls,
            finish_reason=response.choices[0].finish_reason,
        )


# ============================================================================
# Factory function
# ============================================================================


def create_provider() -> LLMProvider:
    """Create an LLM provider based on environment variables.

    Reads the following environment variables:
    - COPILOT_PROVIDER: "openai", "anthropic", or "compat"
    - COPILOT_API_KEY: API key
    - COPILOT_MODEL: Model name
    - COPILOT_BASE_URL: Base URL (for "compat" provider)

    Returns
    -------
    LLMProvider
        A configured provider instance.

    Raises
    ------
    ValueError
        If required environment variables are missing or the provider
        type is unknown.
    """
    provider_type = os.getenv("COPILOT_PROVIDER", "").lower()
    api_key = os.getenv("COPILOT_API_KEY", "")
    model = os.getenv("COPILOT_MODEL", "")

    if not provider_type:
        raise ValueError(
            "COPILOT_PROVIDER environment variable is not set. "
            "Choose 'openai', 'anthropic', or 'compat'."
        )

    if not api_key and provider_type != "compat":
        raise ValueError(
            "COPILOT_API_KEY environment variable is not set."
        )

    if not model:
        raise ValueError(
            "COPILOT_MODEL environment variable is not set."
        )

    if provider_type == "openai":
        return OpenAIProvider(api_key=api_key, model=model or "gpt-4o")
    elif provider_type == "anthropic":
        return AnthropicProvider(api_key=api_key, model=model or "claude-sonnet-4")
    elif provider_type == "compat":
        base_url = os.getenv("COPILOT_BASE_URL", "")
        if not base_url:
            raise ValueError(
                "COPILOT_BASE_URL environment variable is required "
                "for OpenAI-compatible provider."
            )
        return OpenAICompatProvider(
            api_key=api_key,
            model=model,
            base_url=base_url,
        )
    else:
        raise ValueError(
            f"Unknown COPILOT_PROVIDER: '{provider_type}'. "
            "Choose 'openai', 'anthropic', or 'compat'."
        )


# ============================================================================
# Message format conversion helpers
# ============================================================================


def _to_openai_message(msg: ChatMessage) -> Dict[str, Any]:
    """Convert a ChatMessage to OpenAI API format."""
    return {
        "role": msg.role,
        "content": msg.content,
    }


def _to_openai_tool(tool: ToolDefinition) -> Dict[str, Any]:
    """Convert a ToolDefinition to OpenAI function calling format."""
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
        },
    }


def _to_anthropic_message(msg: ChatMessage) -> Dict[str, Any]:
    """Convert a ChatMessage to Anthropic API format."""
    return {
        "role": msg.role,
        "content": msg.content,
    }


def _to_anthropic_tool(tool: ToolDefinition) -> Dict[str, Any]:
    """Convert a ToolDefinition to Anthropic tool format."""
    return {
        "name": tool.name,
        "description": tool.description,
        "input_schema": tool.parameters,
    }


def _split_system_message(
    messages: List[ChatMessage],
) -> tuple[str, List[ChatMessage]]:
    """Split system message from user/assistant messages for Anthropic.

    Anthropic uses a separate 'system' parameter instead of a system role
    in the messages array.

    Returns
    -------
    tuple[str, list[ChatMessage]]
        (system_message_text, non_system_messages)
    """
    system_msg = ""
    other_messages = []
    for msg in messages:
        if msg.role == "system":
            system_msg = msg.content
        else:
            other_messages.append(msg)
    return system_msg, other_messages
