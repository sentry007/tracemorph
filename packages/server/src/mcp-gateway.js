#!/usr/bin/env node
import { spawn } from 'child_process';
import readline from 'readline';

/**
 * TraceMorph Transparent MCP Stdio Gateway
 *
 * Sits between an AI agent (Claude Code, Cursor, Windsurf) and any target MCP server.
 * Intercepts `tools/call` JSON-RPC requests & responses, tracking latency, inputs,
 * and outputs into the local TraceMorph event ledger without interrupting execution.
 *
 * Usage:
 *   node mcp-gateway.js --target "npx @modelcontextprotocol/server-filesystem /path/to/dir"
 */

const TRACEMORPH_ENDPOINT = (process.env.TRACEMORPH_ENDPOINT || 'http://localhost:7890').replace(/\/$/, '');
const targetCmd = process.argv.slice(2).join(' ').replace(/^--target\s*/, '').trim();

if (!targetCmd) {
  console.error('[TraceMorph MCP Gateway] Error: No target command specified. Example: node mcp-gateway.js --target "node server.js"');
  process.exit(1);
}

// Spawn child MCP server process
const child = spawn(targetCmd, {
  stdio: ['pipe', 'pipe', 'inherit'],
  shell: true
});

const pendingCalls = new Map(); // id -> { tool_name, input_args, start_time }
let activeRunId = null;

async function ensureRun() {
  if (activeRunId) return activeRunId;
  try {
    const res = await fetch(`${TRACEMORPH_ENDPOINT}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `MCP Tool Session (${cmd})`,
        metadata: { client: 'mcp_gateway', command: targetCmd }
      })
    });
    const data = await res.json();
    if (data.success && data.run) activeRunId = data.run.id;
  } catch {
    // Graceful offline fallback
  }
  return activeRunId;
}

// Intercept Stdin (from AI Agent / Claude Code / Cursor)
const stdinReader = readline.createInterface({ input: process.stdin, terminal: false });
stdinReader.on('line', line => {
  try {
    const msg = JSON.parse(line);
    if (msg.method === 'tools/call' && msg.params) {
      pendingCalls.set(msg.id, {
        tool_name: msg.params.name,
        input_args: msg.params.arguments || {},
        start_time: Date.now()
      });
    }
  } catch {
    // Non-JSON line, forward as-is
  }
  child.stdin.write(line + '\n');
});

// Intercept Stdout (from Target MCP Server back to Agent)
const stdoutReader = readline.createInterface({ input: child.stdout, terminal: false });
stdoutReader.on('line', async line => {
  // Always forward immediately to parent so no latency is introduced
  process.stdout.write(line + '\n');

  try {
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pendingCalls.has(msg.id)) {
      const callInfo = pendingCalls.get(msg.id);
      pendingCalls.delete(msg.id);

      const executionTimeMs = Date.now() - callInfo.start_time;
      const isError = Boolean(msg.error || msg.result?.isError);
      const outputResult = msg.error || msg.result || {};

      // Asynchronously log to TraceMorph SQLite engine
      const runId = await ensureRun();
      if (runId) {
        const stepRes = await fetch(`${TRACEMORPH_ENDPOINT}/api/runs/${runId}/steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stepType: 'tool_call',
            promptContext: `Agent invoked MCP tool: ${callInfo.tool_name}()`,
            completionText: `Executed in ${executionTimeMs}ms`,
            latencyMs: executionTimeMs
          })
        });
        const stepData = await stepRes.json();
        if (stepData.stepId) {
          await fetch(`${TRACEMORPH_ENDPOINT}/api/steps/${stepData.stepId}/tools`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolName: callInfo.tool_name,
              inputArgs: callInfo.input_args,
              outputResult,
              status: isError ? 'error' : 'success',
              executionTimeMs
            })
          });
        }
      }
    }
  } catch {
    // Non-JSON line, already forwarded
  }
});

child.on('exit', code => process.exit(code || 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
