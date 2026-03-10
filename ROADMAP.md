# Shanks Roadmap

This document outlines the future development roadmap for Shanks. These features are **not yet implemented** but the architecture has been designed to support them.

## v0.3 — Tool Execution

- Wire AI responses to the `ToolRegistry` for function calling.
- Implement `readFile`, `writeFile`, `listFiles` using `utils/workspace.ts`.
- Add user confirmation dialog before executing `writeFile` or `runTerminalCommand`.
- Display tool calls and their results in the chat UI.

## v0.4 — Project Awareness

- On activation, index workspace files using `listProjectFiles`.
- Provide the AI with a workspace summary in the system prompt.
- Allow the AI to reference open editor buffers.

## v0.5 — Vector Search (Semantic Code Search)

- Integrate a lightweight local vector DB:
  - **LanceDB** (Rust-based, embedded, fast) — preferred.
  - **ChromaDB** (Python server, richer ecosystem) — alternative.
- Embed file contents on workspace open.
- AI can semantically search the codebase: "Find all places that handle authentication."

## v0.6 — Multi-Agent Orchestration

- Add `AgentOrchestrator` that manages a chain of specialized agents:
  - **CodeGen Agent** — writes new code from a description.
  - **CodeReview Agent** — reviews a diff and flags issues.
  - **DocSearch Agent** — searches documentation.
  - **TestGen Agent** — generates unit tests for a given file.
- Implement using a lightweight graph execution model (inspired by LangGraph).

## v0.7 — MCP (Model Context Protocol)

- Support external tool plugins via MCP.
- Allow third-party tools to register with Shanks without code changes.
- Examples: GitHub, Jira, Confluence tool servers.

## v0.8 — Voice-First Coding Workflows

- Voice shortcut commands: "Open file X", "Run tests", "Show git diff".
- Wake-word detection (browser-side).
- Voice-powered Agent Mode: speak a task, Shanks plans and executes it.

## Architecture Notes for Contributors

The codebase is organized to make each of these additions incremental:

- `src/tools/` — add new tools here, register them in `builtins.ts`.
- `src/services/` — add new AI providers implementing `IAIClient`.
- `src/utils/` — add new workspace helpers here.
- `src/types/index.ts` — all shared types live here.
- `src/webview/App.tsx` — UI lives here, modes controlled by `InteractionMode`.
