# TraceMorph — AI Agent Time-Travel Debugger & State Forking Replayer

> **Zero-Cloud, Local-First Observability, Replay Caching & State Branching for Autonomous CLI & IDE AI Agents**

---

## 1. Executive Summary

**TraceMorph** is a local-first time-travel debugger, streaming reverse proxy, and state-forking replayer built specifically for autonomous CLI and IDE-based AI agents (**Claude Code**, **Codex CLI**, **Aider**, **Cline / Roo Code**, and custom Python/TypeScript agent loops).

While standard web-chat interfaces execute single turns and rarely spawn complex tool loops, **CLI and IDE agents execute 10 to 40 autonomous turns** (running shell commands, modifying codebases, executing tests, searching files). When an agent fails at Step 14, developers currently have no way to inspect the opaque terminal context or fork execution—forcing them to abort, restart from Step 1, burn thousands of tokens, and wait several minutes.

TraceMorph replaces opaque terminal logs and heavy cloud APMs with a fast, deterministic cockpit that allows developers to scrub through agent thought chains, inspect token-level prompt diffs, detect context bloat, break infinite doom loops, and **fork execution branches** from any historical step without re-running early steps.

```
                            DEVELOPER WORKSPACE (100% LOCAL)
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │  CLI / IDE Agents: Claude Code, Aider, Cline, Python / TS Custom Loops      │
 │                     │                                   │                   │
 │      Zero-Code Proxy: /v1/messages, /v1/chat/completions │ MCP Gateway: stdio│
 │                     ▼                                   ▼                   │
 │   ┌─────────────────────────────────────────────────────────────────────┐   │
 │   │            TraceMorph Engine & Replay Daemon (Port 7890)            │   │
 │   │  • SSE Streaming Reverse Proxy (Anthropic & OpenAI protocols)       │   │
 │   │  • SQLite WAL Ledger (Runs, Steps, Tool Calls, Checkpoints)         │   │
 │   │  • Replay Cache (Serves cached steps 1..K-1 at 0 cost / 0ms)        │   │
 │   │  • Live Model Continuation (Anthropic, OpenAI, Local Ollama)        │   │
 │   │  • MCP Stdio Tool Interceptor                                       │   │
 │   └──────────────────────────────────┬──────────────────────────────────┘   │
 └──────────────────────────────────────┼──────────────────────────────────────┘
                                        │ ws://localhost:7890/ws
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                Developer Cockpit UI (http://localhost:5173)                 │
 │   • Horizontal Sequencer with Error Jumps, Playback & Type Filters          │
 │   • Context Surge Alerts & Doom Loop / Stagnation Warning Badges            │
 │   • Word-Level Prompt Context Diff Viewer                                   │
 │   • Interactive Lineage DAG & Side-by-Side Run Delta Comparison             │
 │   • State Forking Modal with Prompt Steering & Mock Injections              │
 │   • 1-Click Pytest, Vitest, & JSON Eval Exporter                            │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frictionless Integration Modes

TraceMorph supports three integration tiers designed to fit existing developer workflows with zero friction:

### Mode 1: Zero-Code Reverse Proxy (Universal for CLI tools)
Intercept any CLI agent simply by setting environment variables in your terminal:

```bash
# For Anthropic Claude Code CLI:
export ANTHROPIC_BASE_URL=http://localhost:7890/v1
claude "Refactor auth middleware to use JWT"

# For Aider, Cline, or OpenAI-compatible CLI tools:
export OPENAI_BASE_URL=http://localhost:7890/v1
aider --model gpt-4o
```
- **Zero latency overhead**: Requests are streamed directly to Anthropic or OpenAI via Server-Sent Events (SSE).
- **Zero code changes**: The agent script, CLI tool, or IDE extension runs normally while TraceMorph automatically logs every thought, tool call, token count, and latency into the local SQLite database.

### Mode 2: Transparent MCP (Model Context Protocol) Gateway
Intercept tool invocations from Claude Code, Cursor, or Windsurf over `stdio`:

```bash
node packages/server/src/mcp-gateway.js --target "npx @modelcontextprotocol/server-filesystem ./src"
```
TraceMorph intercepts JSON-RPC `tools/call` and `tools/list` messages, recording execution times and arguments without adding latency.

### Mode 3: Zero-Dependency Client SDKs
For developers coding custom autonomous agent loops in TypeScript or Python:
- **TypeScript**: `@tracemorph/sdk` (Node.js 18+)
- **Python**: `tracemorph` (Python 3.9+, standard library only)

---

## 3. Core Capabilities

### A. Horizontal Time-Travel Sequencer
- Scrub back and forth through execution turns using keyboard arrow keys (`←` / `→`) or auto-playback (`Spacebar`).
- High-contrast step pills showing step type (`Thought`, `Tool Call`, `Reflection`, `Output`), latency, and error badges.
- **Jump to Error Button**: When a failure occurs, a one-click button takes you directly to the offending step.
- Step filters: Filter by `All Steps`, `Tools Only`, `Errors Only`, or a specific tool name.

### B. Tool Invocation Inspector
- Clean, responsive cards for each tool call with automatic word-wrapping (`word-break: break-word`) to prevent horizontal scrolling.
- View modes: Toggle between **Side-by-Side Columns** and **Stacked View**.
- One-click copy buttons for Input Arguments and Output Results with visual confirmation.

### C. Context Window Diffing & Bloat Alerts
- Word-level prompt diff comparing Step $N$ against Step $N-1$ (`+42 words / -0 words`).
- **Context Surge Alert**: Flags steps where prompt size jumped $>50\%$ and $>50$ tokens.
- **Doom Loop Detector**: Detects identical tool names and arguments across consecutive turns with a one-click **"Break Loop & Steer"** button.

### D. State Forking & Replay Caching
- **In-Cockpit Steering Sandbox**: Select Step $K$, inject a steering directive or mock tool output, and click **"Generate Next Step"** to test model continuation (via Claude, GPT-4o, or local Ollama).
- **CLI Replay Cache**: Re-run your CLI agent with `?resume_from=<stepId>` or header `x-tracemorph-resume-from`. TraceMorph serves cached responses for steps $1 \dots K-1$ directly from SQLite ($0 cost, 0ms latency) and executes live from step $K$.

### E. Interactive Branch Lineage DAG
- Visual graph showing root runs and child forked branches.
- **Run Delta Comparison**: Select any two runs to compare step counts, token usage, latencies, and outcomes side by side.

### F. 1-Click Automated Eval Exporter
- Export any recorded step into ready-to-run regression tests:
  - **Pytest** (Python)
  - **Vitest / Jest** (TypeScript)
  - **JSON Benchmark** (LLM eval assertions)

---

## 4. Project Structure

```
tracemorph/
├── README.md                      # Project documentation (this file)
├── ARCHITECTURE.md                # System topology & schema specifications
├── package.json                   # Monorepo root manifest
│
├── packages/
│   ├── server/                    # Local Event Engine, SQLite Store & Proxy
│   │   ├── src/index.js           # Express REST & WebSocket Server (port 7890)
│   │   ├── src/db.js              # SQLite WAL schema, state forking & diff engine
│   │   ├── src/proxy.js           # Zero-code streaming reverse proxy (/v1/messages, /v1/chat/completions)
│   │   ├── src/mcp-gateway.js     # Transparent MCP stdio proxy gateway
│   │   └── package.json
│   │
│   ├── sdk/                       # Zero-dependency TypeScript SDK
│   │   ├── src/index.js           # TraceMorph TypeScript/Node Client
│   │   └── package.json
│   │
│   ├── sdk-python/                # Zero-dependency Python SDK (tracemorph-py)
│   │   ├── tracemorph/client.py   # TraceMorph Python Client & @trace_step decorator
│   │   ├── pyproject.toml
│   │   └── README.md
│   │
│   └── ui/                        # Modular Developer Cockpit (React 19 + Vite)
│       ├── src/App.tsx            # Main Cockpit orchestrator
│       ├── src/components/        # Modular UI components
│       │   ├── Header.tsx         # Navigation, token metrics, error jump, resume button
│       │   ├── SequencerBar.tsx   # Timeline scrubber & playback controls
│       │   ├── StepDetailCard.tsx # Reasoning card, context surge & doom loop alerts
│       │   ├── ToolInspector.tsx  # Responsive tool cards with copy actions
│       │   ├── InspectorTabs.tsx  # Context diff, raw prompt, memory snapshot
│       │   ├── LineageTree.tsx    # Interactive execution DAG & run comparison
│       │   ├── ForkModal.tsx      # State forking & prompt steering modal
│       │   └── EvalModal.tsx      # Pytest / Vitest / JSON eval exporter
│       ├── src/types.ts           # Centralized TypeScript definitions
│       ├── src/index.css          # Dark-mode design system (Geist typography)
│       └── package.json
│
└── examples/
    ├── demo-agent.js              # Node.js B2B Lead Qualifier simulation
    └── test_python_agent.py       # Python DevOps Assistant simulation
```

---

## 5. Quickstart Guide

### 1. Start the TraceMorph Local Daemon
```bash
cd packages/server
npm install
npm run start
# Engine starts on http://localhost:7890 (WebSocket: ws://localhost:7890/ws)
```

### 2. Start the Developer Cockpit UI
```bash
cd packages/ui
npm install
npm run dev
# Cockpit opens on http://localhost:5173/
```

### 3. Run Claude Code CLI through TraceMorph
```bash
# Point Claude Code to TraceMorph's streaming reverse proxy
export ANTHROPIC_BASE_URL=http://localhost:7890/v1
claude "Audit top 3 competitors in digital business cards"
```
The entire autonomous execution, tool invocations, and prompt deltas will stream live into the TraceMorph Cockpit!

### 4. Run Example Agent Simulations

#### TypeScript Agent:
```bash
node examples/demo-agent.js
```

#### Python Agent:
```bash
python examples/test_python_agent.py
```

---

## 6. SDK Usage

### TypeScript SDK:
```typescript
import { TraceMorph } from '@tracemorph/sdk';

const tracer = new TraceMorph({
  endpoint: 'http://localhost:7890',
  runName: 'Competitor Auditor',
  metadata: { model: 'claude-3-7-sonnet' }
});

const step = await tracer.startStep({ stepType: 'tool_call', promptContext: 'Search competitors' });
await step.recordToolCall({
  toolName: 'web_search',
  inputArgs: { query: 'digital business cards' },
  outputResult: { competitors: ['Popl', 'Blinq'] },
  status: 'success',
  executionTimeMs: 250
});
await step.finish({ completionText: 'Identified 2 competitors.' });
await tracer.complete();
```

### Python SDK:
```python
from tracemorph import TraceMorph

tracer = TraceMorph(endpoint="http://localhost:7890", run_name="DevOps Agent")

# Method 1: Explicit Step
step = tracer.start_step(step_type="tool_call", prompt_context="Checking branches")
step.record_tool_call(tool_name="git_branch", input_args={"all": True}, output_result=["main", "dev"])
step.finish(completion_text="Audit complete.")
tracer.complete()

# Method 2: Decorator
@tracer.trace_step(step_type="tool_call")
def query_database(query: str):
    return {"rows": 42}
```

---

## 7. REST & Proxy API Reference

| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/v1/messages` | **Anthropic Reverse Proxy**: Streams SSE for Claude Code CLI and captures traces into SQLite. |
| `POST` | `/v1/chat/completions` | **OpenAI Reverse Proxy**: Streams SSE for Aider / Cline, supports Replay Caching via `?resume_from=`. |
| `GET` | `/api/runs` | List all recorded runs with step counts and token accounting. |
| `GET` | `/api/runs/:id` | Fetch full run execution graph, steps, tool calls, and checkpoints. |
| `POST` | `/api/runs` | Create a new run session (`{ name, metadata }`). |
| `PATCH` | `/api/runs/:id/status` | Update run status (`running`, `completed`, `failed`, `forked`). |
| `POST` | `/api/runs/:id/steps` | Log an execution step (`{ promptContext, completionText, latencyMs }`). |
| `PATCH` | `/api/steps/:id` | Update an existing step's completion text, tokens, or latency. |
| `POST` | `/api/steps/:stepId/tools` | Log a tool call (`{ toolName, inputArgs, outputResult, status }`). |
| `POST` | `/api/runs/:id/fork` | Fork run at step (`{ forkStepId, modifiedToolOutputs, steeringInstruction }`). |
| `POST` | `/api/runs/:id/resume` | Live model continuation via Claude, GPT-4o, or local Ollama. |
| `GET` | `/api/diff/:stepA/:stepB` | Compute word-level prompt diff between two steps. |
| `GET` | `/api/steps/:stepId/eval` | Export step as Pytest, Vitest, or JSON benchmark test suite. |

---

## 8. License
MIT — Built as part of Frontier Lab.
