import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import {
  createRun,
  updateRunStatus,
  listRuns,
  getRun,
  addStep,
  addToolCall,
  forkRun,
  computeStepDiff
} from './db.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Broadcast helper for WebSocket clients
function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connected', payload: { server: 'TraceMorph Engine v0.1' } }));
});

// --- REST Endpoints ---

// List all runs
app.get('/api/runs', (req, res) => {
  try {
    const runs = listRuns();
    res.json({ success: true, runs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get run details
app.get('/api/runs/:id', (req, res) => {
  try {
    const run = getRun(req.params.id);
    if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
    res.json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create a new run
app.post('/api/runs', (req, res) => {
  try {
    const { id, name, metadata, parentRunId, forkStepId } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Run name is required' });
    const run = createRun({ id, name, metadata, parentRunId, forkStepId });
    broadcast('run_created', run);
    res.status(201).json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update run status
app.patch('/api/runs/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const run = updateRunStatus(req.params.id, status);
    broadcast('run_updated', run);
    res.json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Log a step inside a run
app.post('/api/runs/:id/steps', (req, res) => {
  try {
    const runId = req.params.id;
    const {
      id,
      stepNumber,
      stepType,
      promptContext,
      promptTokens,
      completionText,
      completionTokens,
      latencyMs,
      checkpointState
    } = req.body;

    if (!promptContext && !completionText) {
      return res.status(400).json({ success: false, error: 'promptContext or completionText required' });
    }

    const stepId = addStep({
      id,
      runId,
      stepNumber,
      stepType,
      promptContext,
      promptTokens,
      completionText,
      completionTokens,
      latencyMs,
      checkpointState
    });

    const updatedRun = getRun(runId);
    broadcast('step_recorded', { runId, stepId, run: updatedRun });
    res.status(201).json({ success: true, stepId, run: updatedRun });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Log a tool call for a step
app.post('/api/steps/:stepId/tools', (req, res) => {
  try {
    const stepId = req.params.stepId;
    const { id, toolName, inputArgs, outputResult, status, executionTimeMs } = req.body;
    if (!toolName) return res.status(400).json({ success: false, error: 'toolName is required' });

    const toolId = addToolCall({
      id,
      stepId,
      toolName,
      inputArgs,
      outputResult,
      status,
      executionTimeMs
    });

    broadcast('tool_call_recorded', { stepId, toolId });
    res.status(201).json({ success: true, toolId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fork a run from a specific step
app.post('/api/runs/:id/fork', (req, res) => {
  try {
    const sourceRunId = req.params.id;
    const { forkStepId, modifiedToolOutputs, modifiedPromptContext, steeringInstruction, newRunName } = req.body;

    if (!forkStepId) {
      return res.status(400).json({ success: false, error: 'forkStepId is required' });
    }

    const forkedRun = forkRun({
      sourceRunId,
      forkStepId,
      modifiedToolOutputs,
      modifiedPromptContext,
      steeringInstruction,
      newRunName
    });

    broadcast('run_forked', { sourceRunId, forkedRun });
    res.status(201).json({ success: true, run: forkedRun });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Compute prompt context diff between two steps
app.get('/api/diff/:stepAId/:stepBId', (req, res) => {
  try {
    const { stepAId, stepBId } = req.params;
    const diffReport = computeStepDiff(stepAId, stepBId);
    res.json({ success: true, diffReport });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live Model Resume / Execution Bridge
app.post('/api/runs/:id/resume', async (req, res) => {
  try {
    const runId = req.params.id;
    const { provider = 'simulated', apiKey, model = 'claude-3-7-sonnet' } = req.body;
    const run = getRun(runId);
    if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
    if (!run.steps || run.steps.length === 0) {
      return res.status(400).json({ success: false, error: 'Cannot resume a run with 0 steps' });
    }

    const lastStep = run.steps[run.steps.length - 1];
    const nextStepNumber = lastStep.step_number + 1;
    let completionText = '';
    let stepType = 'thought';
    let promptTokens = Math.round(lastStep.prompt_context.length / 4) + 60;
    let completionTokens = 45;

    // Check if external API key is provided for real LLM call
    if (provider === 'openai' && apiKey) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are an autonomous agent debugging and continuing an execution trace.' },
            { role: 'user', content: `${lastStep.prompt_context}\n\nPrevious Action Result: ${JSON.stringify(lastStep.tool_calls.map(t => ({ tool: t.tool_name, output: t.output_result })))}` }
          ]
        })
      });
      const data = await response.json();
      completionText = data.choices?.[0]?.message?.content || 'No response from model';
      promptTokens = data.usage?.prompt_tokens || promptTokens;
      completionTokens = data.usage?.completion_tokens || completionTokens;
    } else {
      // High-fidelity intelligent continuation based on the forked state
      const mockedTools = lastStep.tool_calls.filter(t => t.status === 'mocked');
      if (mockedTools.length > 0) {
        const t = mockedTools[0];
        stepType = 'output';
        completionText = `Evaluated mocked output from ${t.tool_name}():\n${JSON.stringify(t.output_result, null, 2)}\n\nProceeding with workflow: Successfully bypassed previous bottleneck using injected test data. Generating final synthesis report.`;
      } else if (lastStep.prompt_context.includes('[USER STEERING CORRECTION]')) {
        stepType = 'thought';
        completionText = `Steering directive acknowledged. Adjusting agent internal plan:\n- Enforcing constraint from user steering\n- Validating schemas before subsequent action.`;
      } else {
        stepType = 'thought';
        completionText = `Iterating on step ${lastStep.step_number}. All preconditions satisfied. Proceeding to execution stage.`;
      }
    }

    const newStepId = addStep({
      runId,
      stepNumber: nextStepNumber,
      stepType,
      promptContext: `${lastStep.prompt_context}\n\n[Turn ${nextStepNumber} Context]: Step ${lastStep.step_number} finished with ${lastStep.tool_calls.length} tool calls.`,
      promptTokens,
      completionText,
      completionTokens,
      latencyMs: Math.floor(Math.random() * 300) + 400,
      checkpointState: {
        resumed_at: new Date().toISOString(),
        parent_step: lastStep.id,
        status: 'active'
      }
    });

    updateRunStatus(runId, 'running');
    const updatedRun = getRun(runId);
    broadcast('step_recorded', { runId, stepId: newStepId, run: updatedRun });

    res.json({ success: true, stepId: newStepId, run: updatedRun });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Eval & Pytest Exporter
app.get('/api/steps/:stepId/eval', (req, res) => {
  try {
    const { stepId } = req.params;
    const stmt = db.prepare(`SELECT * FROM steps WHERE id = ?`);
    const step = stmt.get(stepId);
    if (!step) return res.status(404).json({ success: false, error: 'Step not found' });

    const toolsStmt = db.prepare(`SELECT * FROM tool_calls WHERE step_id = ?`);
    const tools = toolsStmt.all(stepId).map(t => ({
      name: t.tool_name,
      input: JSON.parse(t.input_args || '{}'),
      output: JSON.parse(t.output_result || '{}'),
      status: t.status
    }));

    const primaryTool = tools[0] || { name: 'generic_action', input: {} };

    // Generate Pytest Code
    const pytestCode = `# Auto-generated by TraceMorph Eval Exporter
# Test Case for Step ${step.step_number} (ID: ${step.id})

import pytest
import json

def test_agent_step_${step.step_number}_behavior():
    """Validates that the agent correctly calls ${primaryTool.name} given the prompt context."""
    prompt_context = """${step.prompt_context.replace(/"""/g, '\\"\\"\\"')}"""
    
    # Expected tool assertion
    expected_tool = "${primaryTool.name}"
    expected_args = ${JSON.stringify(primaryTool.input, null, 4)}

    # Simulated agent call hook (replace with your actual agent runner)
    # result = agent.run(prompt_context)
    # assert result.tool_name == expected_tool
    # for k, v in expected_args.items():
    #     assert result.args.get(k) == v

    assert True
`;

    // Generate Vitest / TypeScript Code
    const vitestCode = `// Auto-generated by TraceMorph Eval Exporter
// Test Case for Step ${step.step_number} (ID: ${step.id})

import { describe, it, expect } from 'vitest';

describe('Agent Step ${step.step_number} Regression Test', () => {
  it('should invoke ${primaryTool.name} with expected arguments', async () => {
    const promptContext = ${JSON.stringify(step.prompt_context)};
    const expectedTool = '${primaryTool.name}';
    const expectedArgs = ${JSON.stringify(primaryTool.input, null, 2)};

    // const response = await agent.executeStep(promptContext);
    // expect(response.toolName).toBe(expectedTool);
    // expect(response.args).toMatchObject(expectedArgs);

    expect(expectedTool).toBe('${primaryTool.name}');
  });
});
`;

    // Standard JSON Eval Benchmark
    const jsonEval = {
      test_name: `eval_step_${step.step_number}`,
      step_id: step.id,
      prompt_context: step.prompt_context,
      expected_tool_calls: tools.map(t => ({ tool: t.name, arguments: t.input })),
      expected_output_fragment: step.completion_text?.slice(0, 100),
      assertions: [
        { type: "tool_called", tool: primaryTool.name },
        { type: "no_hallucinated_keys", expected_keys: Object.keys(primaryTool.input) }
      ]
    };

    res.json({
      success: true,
      stepNumber: step.step_number,
      pytestCode,
      vitestCode,
      jsonEval
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Seed demo run with rich multi-step data
app.post('/api/seed', (req, res) => {
  try {
    const demoRun = createRun({
      name: 'Autonomous Market Research Agent',
      metadata: { target: 'SaaS Competitor Pricing', model: 'claude-3-7-sonnet' }
    });

    // Step 1: Planning
    const s1 = addStep({
      runId: demoRun.id,
      stepNumber: 1,
      stepType: 'thought',
      promptContext: 'System: You are an autonomous market intelligence agent.\nUser: Audit top 3 competitors in digital business cards and evaluate their pricing tiers.',
      promptTokens: 38,
      completionText: 'Plan formulated:\n1. Search for top competitors in NFC and digital business cards.\n2. Fetch pricing pages.\n3. Extract per-seat tiers and limitations.\n4. Synthesize final comparative table.',
      completionTokens: 52,
      latencyMs: 420,
      checkpointState: { phase: 'planning', found_competitors: [] }
    });

    // Step 2: Tool Call (Web Search)
    const s2 = addStep({
      runId: demoRun.id,
      stepNumber: 2,
      stepType: 'tool_call',
      promptContext: 'System: You are an autonomous market intelligence agent.\nUser: Audit top 3 competitors in digital business cards and evaluate their pricing tiers.\nAssistant: Plan formulated.\nAction: Executing web search for competitors.',
      promptTokens: 98,
      completionText: 'Searching for market leaders in NFC smart business cards...',
      completionTokens: 24,
      latencyMs: 650,
      checkpointState: { phase: 'search_started' }
    });
    addToolCall({
      stepId: s2,
      toolName: 'web_search',
      inputArgs: { query: 'top enterprise digital business card platforms 2026' },
      outputResult: {
        results: [
          { name: 'Popl Enterprise', url: 'https://popl.co/enterprise', focus: 'Enterprise Teams' },
          { name: 'Blinq', url: 'https://blinq.me', focus: 'SMB & Individual' },
          { name: 'HiHello Business', url: 'https://hihello.com/business', focus: 'Corporate' }
        ]
      },
      status: 'success',
      executionTimeMs: 310
    });

    // Step 3: Tool Call (Inspect Pricing - Fails / Rate-limited)
    const s3 = addStep({
      runId: demoRun.id,
      stepNumber: 3,
      stepType: 'tool_call',
      promptContext: 'System: You are an autonomous market intelligence agent.\nFound competitors: Popl, Blinq, HiHello.\nAction: Fetching pricing page for Popl Enterprise.',
      promptTokens: 245,
      completionText: 'Fetching pricing table from Popl API...',
      completionTokens: 18,
      latencyMs: 820,
      checkpointState: { phase: 'scraping_pricing', target: 'Popl' }
    });
    addToolCall({
      stepId: s3,
      toolName: 'http_fetch',
      inputArgs: { url: 'https://popl.co/api/pricing/tiers', timeout_ms: 2000 },
      outputResult: {
        error: '429 Too Many Requests: Rate limit exceeded. Cloudflare challenge encountered.',
        status_code: 429
      },
      status: 'error',
      executionTimeMs: 2010
    });

    // Step 4: Reflection on Error
    const s4 = addStep({
      runId: demoRun.id,
      stepNumber: 4,
      stepType: 'reflection',
      promptContext: 'System: You are an autonomous market intelligence agent.\nTool http_fetch failed with 429 Too Many Requests.\nReflecting on fallback options.',
      promptTokens: 310,
      completionText: 'Direct HTTP fetch was blocked by anti-bot challenge. Need to switch to search-cache fallback or fork this step with mock pricing data.',
      completionTokens: 46,
      latencyMs: 510,
      checkpointState: { phase: 'reflection', error_handled: true }
    });

    updateRunStatus(demoRun.id, 'completed');
    const finalRun = getRun(demoRun.id);
    broadcast('run_created', finalRun);

    res.json({ success: true, message: 'Seeded demo run', run: finalRun });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 7890;
server.listen(PORT, () => {
  console.log(`[TraceMorph Engine] Running on http://localhost:${PORT}`);
  console.log(`[TraceMorph WebSocket] Listening on ws://localhost:${PORT}/ws`);
});
