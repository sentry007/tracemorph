# TraceMorph — System Architecture & Technical Design

## 1. System Topology

```
┌─────────────────────────────────────────────────────────────┐
│                       Developer Runtime                     │
│  ┌────────────────────────┐      ┌───────────────────────┐  │
│  │   Agent Script / Loop  │      │  TraceMorph SDK Hook  │  │
│  │  (LangGraph / Custom)  │ <──> │ (Python / TypeScript) │  │
│  └────────────────────────┘      └──────────┬────────────┘  │
└─────────────────────────────────────────────┼───────────────┘
                                              │ HTTP / IPC
                                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     TraceMorph Engine                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Embedded SQLite Event Store (WAL Mode)               │  │
│  │  - runs, steps, tool_calls, checkpoints, branches     │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │  WebSocket & REST Daemon (localhost:7890)             │  │
│  │  - Live Event Streaming, Diff Engine, Fork Runner     │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ Real-time WebSockets
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               TraceMorph Visual Cockpit (Web UI)            │
│  - Horizontal Timeline Scrubber                             │
│  - Execution DAG & Tool Call Inspector                      │
│  - Token-level Prompt Context Diff Viewer                   │
│  - State Forking & Branch Switcher                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Relational Data Schema (SQLite)

```sql
-- Execution Runs
CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT CHECK(status IN ('running', 'completed', 'failed', 'forked')),
    parent_run_id TEXT REFERENCES runs(id),
    fork_step_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Execution Steps (Thoughts / Iterations)
CREATE TABLE steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    step_number INTEGER NOT NULL,
    step_type TEXT CHECK(step_type IN ('thought', 'tool_call', 'reflection', 'output')),
    prompt_context TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_text TEXT,
    completion_tokens INTEGER,
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tool Calls & Results
CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY,
    step_id TEXT NOT NULL REFERENCES steps(id),
    tool_name TEXT NOT NULL,
    input_args TEXT NOT NULL,     -- JSON string
    output_result TEXT,           -- JSON string
    status TEXT CHECK(status IN ('success', 'error', 'mocked')),
    execution_time_ms INTEGER
);

-- Checkpoints for Instant State Forking
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    step_id TEXT NOT NULL REFERENCES steps(id),
    serialized_state TEXT NOT NULL -- Complete snapshot of agent memory
);
```

---

## 3. The State-Forking Algorithm
1. **Checkpointing**: At each step completion, the SDK/Proxy saves the snapshot of agent state (conversation history, tool memory, variables).
2. **User Fork Action in UI**:
   - User selects Step $K$ of Run $A$.
   - User edits `output_result` of Tool Call $M$ inside Step $K$.
   - User clicks **"Fork & Rerun"**.
3. **Branch Creation**:
   - Server creates a new `Run B` with `parent_run_id = Run A` and `fork_step_id = Step K`.
   - Copies steps $1 \dots K-1$ from Run $A$ into Run $B$.
   - Injects modified Tool Call $M$ into Step $K$.
4. **Execution Resumption**:
   - TraceMorph launches the agent worker initializing from the state checkpoint at Step $K$, running forward to completion under Run $B$.

---

## 4. Technology Stack
- **Engine / Server**: Node.js 22 / TypeScript + `better-sqlite3` (or Python FastAPI + SQLite).
- **Client SDKs**: TypeScript (`@tracemorph/sdk`) and Python (`tracemorph-py`).
- **Frontend Cockpit**: Next.js 15 / React 19 / Vite with Tailwind CSS, Lucide icons, and Canvas/SVG for DAG rendering.
