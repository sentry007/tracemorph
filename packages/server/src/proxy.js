import express from 'express';
import { createRun, getRun, addStep, addToolCall, updateStep, updateRunStatus } from './db.js';

export const proxyRouter = express.Router();

// Helper to get or create active run for incoming proxy requests
const activeProxyRuns = new Map(); // sessionId -> runId

function getOrCreateRun(req, defaultName = 'CLI Agent Session') {
  const customRunId = req.headers['x-tracemorph-run-id'];
  if (customRunId) {
    const existing = getRun(customRunId);
    if (existing) return existing;
    return createRun({ id: customRunId, name: req.headers['x-tracemorph-run-name'] || defaultName });
  }

  const sessionKey = req.headers['x-session-id'] || req.ip || 'default_cli';
  let runId = activeProxyRuns.get(sessionKey);
  let run = runId ? getRun(runId) : null;

  if (!run || run.status === 'completed' || run.status === 'failed') {
    const model = req.body?.model || 'unknown-model';
    run = createRun({
      name: `${defaultName} (${model})`,
      metadata: {
        source: 'reverse_proxy',
        model,
        client: req.headers['user-agent'] || 'unknown-cli'
      }
    });
    activeProxyRuns.set(sessionKey, run.id);
  }

  return run;
}

// -------------------------------------------------------------
// 1. Anthropic Messages API Proxy (/v1/messages) - Used by Claude Code
// -------------------------------------------------------------
proxyRouter.post('/messages', async (req, res) => {
  const startTime = Date.now();
  const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY;
  const authHeader = req.headers['authorization'];
  const anthropicVersion = req.headers['anthropic-version'] || '2023-06-01';
  const upstreamUrl = process.env.ANTHROPIC_BASE_URL_UPSTREAM || 'https://api.anthropic.com/v1/messages';

  const isStream = Boolean(req.body?.stream);
  const run = getOrCreateRun(req, 'Claude CLI Agent');

  // Format prompt context from Anthropic messages array
  const systemPrompt = typeof req.body.system === 'string' ? req.body.system : JSON.stringify(req.body.system || '');
  const messagesSummary = (req.body.messages || []).map(m => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${m.role.toUpperCase()}: ${content}`;
  }).join('\n\n');
  const promptContext = systemPrompt ? `SYSTEM:\n${systemPrompt}\n\n${messagesSummary}` : messagesSummary;
  const estimatedInputTokens = Math.round(promptContext.length / 4);

  // If mock/test mode is requested
  if (apiKey === 'test' || apiKey === 'mock') {
    const mockResponse = {
      id: `msg_mock_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: req.body.model || 'claude-3-7-sonnet-20250219',
      content: [
        { type: 'text', text: 'TraceMorph reverse proxy connection verified for Claude Code!' }
      ],
      usage: { input_tokens: estimatedInputTokens, output_tokens: 12 }
    };
    const stepId = addStep({
      runId: run.id,
      stepType: 'thought',
      promptContext,
      promptTokens: estimatedInputTokens,
      completionText: 'TraceMorph reverse proxy connection verified for Claude Code!',
      completionTokens: 12,
      latencyMs: Date.now() - startTime
    });
    if (req.app.get('broadcast')) {
      req.app.get('broadcast')('step_recorded', { runId: run.id, stepId, run: getRun(run.id) });
    }
    return res.json(mockResponse);
  }

  // If neither x-api-key nor authorization is provided
  if (!apiKey && !authHeader) {
    return res.status(401).json({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'No Anthropic API key or Authorization header provided. Pass x-api-key, Authorization: Bearer, or set ANTHROPIC_API_KEY environment variable.'
      }
    });
  }

  try {
    const upstreamHeaders = {
      'content-type': 'application/json',
      'anthropic-version': anthropicVersion
    };
    if (apiKey) upstreamHeaders['x-api-key'] = apiKey;
    if (authHeader) upstreamHeaders['authorization'] = authHeader;
    if (req.headers['anthropic-beta']) upstreamHeaders['anthropic-beta'] = req.headers['anthropic-beta'];

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(req.body)
    });

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      return res.status(upstreamRes.status).send(errorText);
    }

    // A. Streaming Mode
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullCompletion = '';
      const toolCalls = [];
      let currentTool = null;
      let inputTokens = estimatedInputTokens;
      let outputTokens = 0;

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk); // Instant pass-through to CLI client
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const event = JSON.parse(dataStr);
            if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = event.message.usage.input_tokens || inputTokens;
            } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
              currentTool = {
                id: event.content_block.id,
                tool_name: event.content_block.name,
                input_json: ''
              };
            } else if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta') {
                fullCompletion += event.delta.text;
              } else if (event.delta?.type === 'input_json_delta' && currentTool) {
                currentTool.input_json += event.delta.partial_json;
              }
            } else if (event.type === 'content_block_stop' && currentTool) {
              try {
                currentTool.input_args = JSON.parse(currentTool.input_json || '{}');
              } catch {
                currentTool.input_args = { raw: currentTool.input_json };
              }
              toolCalls.push(currentTool);
              currentTool = null;
            } else if (event.type === 'message_delta' && event.usage) {
              outputTokens = event.usage.output_tokens || outputTokens;
            }
          } catch {
            // Ignore partial SSE JSON parse errors
          }
        }
      }

      res.end();

      // Record step in SQLite
      const latencyMs = Date.now() - startTime;
      const stepType = toolCalls.length > 0 ? 'tool_call' : fullCompletion ? 'thought' : 'output';
      const stepId = addStep({
        runId: run.id,
        stepType,
        promptContext,
        promptTokens: inputTokens,
        completionText: fullCompletion || (toolCalls.length > 0 ? `Invoked ${toolCalls.map(t => t.tool_name).join(', ')}` : ''),
        completionTokens: outputTokens || Math.round(fullCompletion.length / 4),
        latencyMs
      });

      for (const tc of toolCalls) {
        addToolCall({
          stepId,
          toolName: tc.tool_name,
          inputArgs: tc.input_args || {},
          outputResult: { status: 'pending_execution' },
          status: 'success',
          executionTimeMs: Math.round(latencyMs / (toolCalls.length || 1))
        });
      }

      if (req.app.get('broadcast')) {
        req.app.get('broadcast')('step_recorded', { runId: run.id, stepId, run: getRun(run.id) });
      }
      return;
    }

    // B. Non-Streaming Mode
    const data = await upstreamRes.json();
    res.json(data);

    const latencyMs = Date.now() - startTime;
    let completionText = '';
    const toolCalls = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') completionText += block.text;
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            tool_name: block.name,
            input_args: block.input || {}
          });
        }
      }
    }

    const stepType = toolCalls.length > 0 ? 'tool_call' : 'thought';
    const stepId = addStep({
      runId: run.id,
      stepType,
      promptContext,
      promptTokens: data.usage?.input_tokens || estimatedInputTokens,
      completionText: completionText || (toolCalls.length > 0 ? `Invoked ${toolCalls.map(t => t.tool_name).join(', ')}` : ''),
      completionTokens: data.usage?.output_tokens || Math.round(completionText.length / 4),
      latencyMs
    });

    for (const tc of toolCalls) {
      addToolCall({
        stepId,
        toolName: tc.tool_name,
        inputArgs: tc.input_args,
        outputResult: { status: 'invoked' },
        status: 'success',
        executionTimeMs: latencyMs
      });
    }

    if (req.app.get('broadcast')) {
      req.app.get('broadcast')('step_recorded', { runId: run.id, stepId, run: getRun(run.id) });
    }
  } catch (err) {
    console.error('[TraceMorph Proxy Error - /v1/messages]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// -------------------------------------------------------------
// 2. OpenAI Chat Completions Proxy (/v1/chat/completions) - Used by Aider, Cline, etc.
// -------------------------------------------------------------
proxyRouter.post('/chat/completions', async (req, res) => {
  const startTime = Date.now();
  const authHeader = req.headers['authorization'] || `Bearer ${process.env.OPENAI_API_KEY || ''}`;
  const upstreamBase = process.env.OPENAI_BASE_URL_UPSTREAM || 'https://api.openai.com/v1';
  const upstreamUrl = `${upstreamBase.replace(/\/$/, '')}/chat/completions`;

  const isStream = Boolean(req.body?.stream);
  const run = getOrCreateRun(req, 'OpenAI / Aider CLI Agent');

  const messagesSummary = (req.body.messages || []).map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n');
  const promptContext = messagesSummary;
  const estimatedInputTokens = Math.round(promptContext.length / 4);

  // Mock/Test bypass for local testing
  if (authHeader.includes('mock') || authHeader.includes('test')) {
    const mockResponse = {
      id: `chatcmpl_mock_${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: req.body.model || 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'TraceMorph OpenAI/Aider proxy connection verified!'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: estimatedInputTokens,
        completion_tokens: 10,
        total_tokens: estimatedInputTokens + 10
      }
    };
    const stepId = addStep({
      runId: run.id,
      stepType: 'thought',
      promptContext,
      promptTokens: estimatedInputTokens,
      completionText: 'TraceMorph OpenAI/Aider proxy connection verified!',
      completionTokens: 10,
      latencyMs: Date.now() - startTime
    });
    if (req.app.get('broadcast')) {
      req.app.get('broadcast')('step_recorded', { runId: run.id, stepId, run: getRun(run.id) });
    }
    return res.json(mockResponse);
  }

  // Replay Cache Check: If client provides x-tracemorph-resume-from or resume query
  const resumeStepId = req.headers['x-tracemorph-resume-from'] || req.query.resume_from;
  if (resumeStepId) {
    const historicalRun = getRun(run.id);
    const cachedStep = historicalRun?.steps?.find(s => s.id === resumeStepId);
    if (cachedStep) {
      const cachedResponse = {
        id: `chatcmpl_cached_${cachedStep.id}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: req.body.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: cachedStep.completion_text
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: cachedStep.prompt_tokens,
          completion_tokens: cachedStep.completion_tokens,
          total_tokens: cachedStep.prompt_tokens + cachedStep.completion_tokens
        }
      };
      return res.json(cachedResponse);
    }
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': authHeader
      },
      body: JSON.stringify(req.body)
    });

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      return res.status(upstreamRes.status).send(errorText);
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullContent = '';
      const toolCallsMap = new Map();
      let inputTokens = estimatedInputTokens;
      let outputTokens = 0;

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) fullContent += delta.content;

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, { tool_name: tc.function?.name || 'tool', args_str: '' });
                }
                const existing = toolCallsMap.get(idx);
                if (tc.function?.name) existing.tool_name = tc.function.name;
                if (tc.function?.arguments) existing.args_str += tc.function.arguments;
              }
            }

            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || inputTokens;
              outputTokens = parsed.usage.completion_tokens || outputTokens;
            }
          } catch {
            // Ignore chunk parse errors
          }
        }
      }

      res.end();

      const toolCalls = Array.from(toolCallsMap.values()).map(tc => {
        let inputArgs = {};
        try { inputArgs = JSON.parse(tc.args_str); } catch { inputArgs = { raw: tc.args_str }; }
        return { tool_name: tc.tool_name, input_args: inputArgs };
      });

      const latencyMs = Date.now() - startTime;
      const stepType = toolCalls.length > 0 ? 'tool_call' : 'thought';
      const stepId = addStep({
        runId: run.id,
        stepType,
        promptContext,
        promptTokens: inputTokens,
        completionText: fullContent,
        completionTokens: outputTokens || Math.round(fullContent.length / 4),
        latencyMs
      });

      for (const tc of toolCalls) {
        addToolCall({
          stepId,
          toolName: tc.tool_name,
          inputArgs: tc.input_args,
          outputResult: { status: 'streamed_call' },
          status: 'success',
          executionTimeMs: latencyMs
        });
      }

      if (req.app.get('broadcast')) {
        req.app.get('broadcast')('step_recorded', { runId: run.id, stepId, run: getRun(run.id) });
      }
      return;
    }

    // Non-Streaming
    const data = await upstreamRes.json();
    res.json(data);

    const latencyMs = Date.now() - startTime;
    const choice = data.choices?.[0]?.message;
    const completionText = choice?.content || '';
    const rawToolCalls = choice?.tool_calls || [];

    const toolCalls = rawToolCalls.map(tc => {
      let inputArgs = {};
      try { inputArgs = JSON.parse(tc.function?.arguments || '{}'); } catch { inputArgs = { raw: tc.function?.arguments }; }
      return { tool_name: tc.function?.name || 'unknown_tool', input_args: inputArgs };
    });

    const stepType = toolCalls.length > 0 ? 'tool_call' : 'output';
    const stepId = addStep({
      runId: run.id,
      stepType,
      promptContext,
      promptTokens: data.usage?.prompt_tokens || estimatedInputTokens,
      completionText,
      completionTokens: data.usage?.completion_tokens || Math.round(completionText.length / 4),
      latencyMs
    });

    for (const tc of toolCalls) {
      addToolCall({
        stepId,
        toolName: tc.tool_name,
        inputArgs: tc.input_args,
        outputResult: { status: 'completed_call' },
        status: 'success',
        executionTimeMs: latencyMs
      });
    }

    if (req.app.get('broadcast')) {
      req.app.get('broadcast')('step_recorded', { runId: run.id, stepId, run: getRun(run.id) });
    }
  } catch (err) {
    console.error('[TraceMorph Proxy Error - /v1/chat/completions]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});
