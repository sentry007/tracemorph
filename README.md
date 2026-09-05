# TraceMorph — AI Agent Time-Travel Debugger & State Forking Replayer

> **Zero-Cloud, Local-First Developer Observability & Execution Branching for Multi-Step AI Agents**

---

## 1. Executive Summary

**TraceMorph** is a local-first time-travel debugger and state-forking replayer built specifically for autonomous AI agents and tool-calling workflows. It replaces opaque terminal logs and heavy cloud APMs with a fast, deterministic cockpit that allows developers to scrub through agent thought chains, inspect token-level prompt diffs, detect context bloat, and **fork execution branches** from any historical step without re-running early steps.

```
┌─────────────────────────┐      ┌─────────────────────────┐
│  AI Agent / Agent Loop  │ ───> │  TraceMorph Client SDK  │
│ (LangGraph / Custom SLM)│      │  (TypeScript / Python)  │
└─────────────────────────┘      └────────────┬────────────┘
                                              │ HTTP / WebSocket
                                              ▼
                                 ┌─────────────────────────┐
                                 │   TraceMorph Engine     │
                                 │  - SQLite Event Ledger  │
                                 │  - Prompt Diff Engine   │
                                 │  - State Forking Core   │
                                 └────────────┬────────────┘
                                              │ ws://localhost:7890/ws
                                              ▼
                                 ┌─────────────────────────┐
                                 │  Visual Time-Travel UI  │
                                 │  (Linear-style Cockpit) │
                                 └─────────────────────────┘
```

---

## 2. The Problems TraceMorph Solves

1. **The Step 7 Hallucination**:
   - An agent runs 6 steps correctly, but hallucinates arguments at Step 7. Fixing the prompt or tool output previously meant restarting the whole run, waiting minutes and burning thousands of tokens.
   - *TraceMorph Solution*: Select Step 7, edit the tool output or prompt instruction, and click **"Fork Step"**. TraceMorph clones the predecessor steps and launches a child branch instantly.
2. **Context Window Bloat & Cost Leaks**:
   - Prompts expand by thousands of tokens with each turn as tools inject raw HTML, search snippets, and JSON dumps.
   - *TraceMorph Solution*: Real-time token tracking, USD cost estimation, and automated **Context Surge Alerts** (flags steps where context jumped $>50\%$).
3. **Infinite Retry / Doom Loops**:
   - Agents get stuck calling `search("term")` $\rightarrow$ getting empty results $\rightarrow$ calling `search("term")` again until hitting token limits.
   - *TraceMorph Solution*: Built-in **Stagnation & Doom Loop Detector** that automatically flags identical tool calls across consecutive steps.
4. **Data Privacy & Cloud Costs**:
   - Cloud telemetry platforms (LangSmith, Braintrust, Phoenix) send proprietary codebase context and customer data to third-party clouds.
   - *TraceMorph Solution*: 100% local. Runs on embedded SQLite (`tracemorph.sqlite` in WAL mode). Zero data ever leaves your computer.

---

## 3. Core Capabilities

### A. Horizontal Time-Travel Sequencer
- Scrub back and forth through execution turns using keyboard arrow keys (`←` / `→`) or playback buttons (`Spacebar`).
- High-contrast, always-visible step pills showing step type (`Thought`, `Tool Call`, `Reflection`, `Output`), latency, and error badges.
- **Jump to Error Button**: When a failure occurs, a one-click button takes you directly to the offending step.
- Step filters: Toggle between `All Steps`, `Tools Only`, and `Errors Only`.

### B. Tool Invocation Inspector (No Cramped Scrolling)
- Clean, responsive cards for each tool call.
- Text wraps automatically (`word-break: break-word`) so long URLs and JSON error messages span cleanly without forcing horizontal scrolling.
- View modes: Toggle between **Side-by-Side Columns** and **Stacked View**.
- One-click copy buttons for Input Arguments and Output Results with visual confirmation.

### C. Context Window & Token Delta Diffing
- Side-by-side or inline prompt diff comparing Step $N$ against Step $N-1$.
- Color-coded text spans highlighting newly injected context (green) and pruned context (red), with summary statistics (`+42 words / -0 words`).

### D. State Forking & Prompt Steering
- Click **"Fork Step"** on any step or tool call.
- Inject a **Prompt Steering Directive** (e.g., *"Ensure price is returned as float without currency symbol"*).
- Inject a **Modified Tool Output** (e.g., simulate a database error, rate limit, or mock pricing JSON).
- Generates a new child branch (`run_name (Branch @ Step N)`) visible in the Lineage tree.

---

## 4. Project Structure

```
tracemorph/
├── README.md                      # Project documentation (this file)
├── IDEA.md                        # Product rationale & feature specs
├── ARCHITECTURE.md                # System topology & SQLite schema
├── package.json                   # Monorepo root manifest
│
├── packages/
│   ├── server/                    # Local Event Engine & SQLite Store
│   │   ├── src/index.js           # Express REST API & WebSocket Server (port 7890)
│   │   ├── src/db.js              # SQLite WAL schema, state forking, & diff engine
│   │   └── package.json
│   │
│   ├── sdk/                       # Zero-dependency Instrumentation Client
│   │   ├── src/index.js           # TraceMorph TypeScript/Node SDK
│   │   └── package.json
│   │
│   └── ui/                        # Minimal Sleek Developer Cockpit
│       ├── src/App.tsx            # Sequencer, Tool Inspector, Context Diff, Fork Modal
│       ├── src/index.css          # Minimalist design tokens (Geist typography)
│       └── package.json
│
└── examples/
    └── demo-agent.js              # Multi-step B2B Lead Qualifier simulation
```

---

## 5. Quickstart Guide

### 1. Start the Local Engine Daemon
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

### 3. Run the Demo Agent Simulation
```bash
node examples/demo-agent.js
```
The new agent execution streams live into the Cockpit via WebSocket in real time.

---

## 6. SDK Usage Example

Instrumenting any agent loop requires only a few lines of code:

```javascript
import { TraceMorph } from '@tracemorph/sdk';

const tracer = new TraceMorph({
  endpoint: 'http://localhost:7890',
  runName: 'Autonomous Competitor Auditor',
  metadata: { model: 'claude-3-7-sonnet' }
});

// Step 1: Planning
const step1 = await tracer.startStep({
  stepType: 'thought',
  promptContext: 'System: You are an intelligence agent.\nUser: Audit top competitors.',
  promptTokens: 42
});
await step1.finish({
  completionText: 'Plan: 1. Search competitors. 2. Fetch pricing.',
  completionTokens: 28
});

// Step 2: Tool Call
const step2 = await tracer.startStep({
  stepType: 'tool_call',
  promptContext: 'Plan formulated. Action: Search competitors.',
  promptTokens: 110
});

// Record external tool execution
await step2.recordToolCall({
  toolName: 'web_search',
  inputArgs: { query: 'digital business cards enterprise' },
  outputResult: { competitors: ['Popl', 'Blinq'] },
  status: 'success',
  executionTimeMs: 310
});

await step2.finish({
  completionText: 'Competitors found: Popl, Blinq.',
  completionTokens: 20
});

// Mark run complete
await tracer.complete();
```

---

## 7. REST API Reference

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/runs` | List all recorded runs with step counts and token totals. |
| `GET` | `/api/runs/:id` | Fetch full run graph, steps, tool calls, and checkpoints. |
| `POST` | `/api/runs` | Create a new run session (`{ name, metadata }`). |
| `POST` | `/api/runs/:id/steps` | Log an execution step (`{ promptContext, completionText, latencyMs }`). |
| `POST` | `/api/steps/:stepId/tools` | Log a tool call (`{ toolName, inputArgs, outputResult, status }`). |
| `POST` | `/api/runs/:id/fork` | Fork run at step (`{ forkStepId, modifiedToolOutputs, steeringInstruction }`). |
| `GET` | `/api/diff/:stepA/:stepB` | Compute word-level prompt diff between two steps. |
| `POST` | `/api/seed` | Seed a sample multi-step run with realistic errors and reflections. |

---

## 8. License
MIT — Built as part of Frontier Lab.
