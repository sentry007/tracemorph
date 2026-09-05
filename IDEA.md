# TraceMorph — Product & Problem Specification

## 1. Executive Vision
**TraceMorph** is a zero-cloud, local-first time-travel debugger and state-forking replayer built specifically for multi-step AI agents and tool-calling workflows. It bridges the gap between opaque terminal logs and heavy enterprise cloud observability suites (like LangSmith or Braintrust), giving developers full deterministic inspection and branching control over their agent runs.

---

## 2. The Core Problem
When building autonomous agents (LangGraph, custom agent loops, or MCP tool orchestrators), developers frequently hit these failure modes:
1. **The Step 7 Hallucination**: The agent executes 6 steps correctly, but hallucinates arguments for tool 7. Fixing the prompt or tool output requires restarting the whole run, burning tokens and waiting minutes.
2. **Opaque Context Accumulation**: Prompts grow by thousands of tokens with each turn. Finding *why* an agent made a decision requires manually diffing enormous JSON objects to see what new information was injected into the prompt.
3. **Flaky External Tools**: Simulating an API failure, a database timeout, or a malformed response to test the agent's self-healing capabilities requires mocking code inside the tool rather than manipulating the execution stream.

---

## 3. Product Features & Capabilities

### Feature 1: Video-Scrubber Time-Travel Playback
- Visual horizontal timeline representing every agent thought, LLM call, and tool execution.
- Scrub back and forth to inspect exact system prompt, user prompt, and tool states at Step $T_N$.

### Feature 2: Token Delta & Context Window Diffing
- Side-by-side visual diff highlighting exactly what was appended, modified, or truncated in the prompt between Step $N-1$ and Step $N$.

### Feature 3: State-Forking & Branch Replay
- Click on any historical step (e.g. Step 3).
- Edit the tool return payload (e.g., inject a simulated error or change a mock value).
- Click **"Fork Execution"**: The engine creates a child branch `run_id-branch-1` and resumes execution from Step 4 using the modified state without re-running Steps 1 and 2.

### Feature 4: Local Zero-Cloud SQLite Ledger
- Complete offline privacy. No proprietary code or customer data leaves the developer's machine.
- Every run is stored as a lightweight relational graph in SQLite.

---

## 4. Competitive Differentiation
| Feature | TraceMorph | Cloud APMs (LangSmith, Phoenix) | Print/Terminal Logs |
| :--- | :--- | :--- | :--- |
| **Hosting** | 100% Local / Desktop | Cloud SaaS | Local |
| **State Forking & Branching** | ✅ Native | ❌ Static traces only | ❌ None |
| **Context Window Visual Diff** | ✅ Real-time token diff | ⚠️ Basic text compare | ❌ Raw text |
| **Privacy & Zero Cost** | ✅ Free & Offline | ❌ Paid per-trace | ✅ Free |
