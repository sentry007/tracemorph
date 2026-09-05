import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import * as diff from 'diff';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../tracemorph.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT CHECK(status IN ('running', 'completed', 'failed', 'forked')) DEFAULT 'running',
    parent_run_id TEXT,
    fork_step_id TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    step_type TEXT CHECK(step_type IN ('thought', 'tool_call', 'reflection', 'output')) DEFAULT 'thought',
    prompt_context TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_text TEXT,
    completion_tokens INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    input_args TEXT NOT NULL,
    output_result TEXT,
    status TEXT CHECK(status IN ('success', 'error', 'mocked')) DEFAULT 'success',
    execution_time_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    step_id TEXT NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
    serialized_state TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_steps_run_id ON steps(run_id);
  CREATE INDEX IF NOT EXISTS idx_tool_calls_step_id ON tool_calls(step_id);
`);

export function createRun({ id, name, metadata = {}, parentRunId = null, forkStepId = null }) {
  const runId = id || `run_${uuidv4().slice(0, 8)}`;
  const stmt = db.prepare(`
    INSERT INTO runs (id, name, status, parent_run_id, fork_step_id, metadata)
    VALUES (?, ?, 'running', ?, ?, ?)
  `);
  stmt.run(runId, name, parentRunId, forkStepId, JSON.stringify(metadata));
  return getRun(runId);
}

export function updateRunStatus(runId, status) {
  const stmt = db.prepare(`UPDATE runs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  stmt.run(status, runId);
  return getRun(runId);
}

export function listRuns() {
  const stmt = db.prepare(`
    SELECT r.*, 
      (SELECT COUNT(*) FROM steps s WHERE s.run_id = r.id) AS step_count,
      (SELECT SUM(prompt_tokens + completion_tokens) FROM steps s WHERE s.run_id = r.id) AS total_tokens
    FROM runs r
    ORDER BY created_at DESC
  `);
  return stmt.all().map(r => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : {},
    total_tokens: r.total_tokens || 0
  }));
}

export function getRun(runId) {
  const runStmt = db.prepare(`SELECT * FROM runs WHERE id = ?`);
  const run = runStmt.get(runId);
  if (!run) return null;

  const stepsStmt = db.prepare(`SELECT * FROM steps WHERE run_id = ? ORDER BY step_number ASC`);
  const steps = stepsStmt.all(runId);

  const toolCallsStmt = db.prepare(`SELECT * FROM tool_calls WHERE step_id = ? ORDER BY created_at ASC`);
  const checkpointStmt = db.prepare(`SELECT serialized_state FROM checkpoints WHERE step_id = ?`);

  const populatedSteps = steps.map(step => {
    const tool_calls = toolCallsStmt.all(step.id).map(tc => ({
      ...tc,
      input_args: safeJsonParse(tc.input_args),
      output_result: safeJsonParse(tc.output_result)
    }));
    const cp = checkpointStmt.get(step.id);
    return {
      ...step,
      tool_calls,
      checkpoint: cp ? safeJsonParse(cp.serialized_state) : null
    };
  });

  return {
    ...run,
    metadata: safeJsonParse(run.metadata),
    steps: populatedSteps
  };
}

export function addStep({
  id,
  runId,
  stepNumber,
  stepType = 'thought',
  promptContext = '',
  promptTokens = 0,
  completionText = '',
  completionTokens = 0,
  latencyMs = 0,
  checkpointState = null
}) {
  const stepId = id || `step_${uuidv4().slice(0, 8)}`;
  
  // Auto-calculate step number if not provided
  let num = stepNumber;
  if (num === undefined) {
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM steps WHERE run_id = ?`);
    num = countStmt.get(runId).count + 1;
  }

  const insertStep = db.prepare(`
    INSERT INTO steps (id, run_id, step_number, step_type, prompt_context, prompt_tokens, completion_text, completion_tokens, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertStep.run(stepId, runId, num, stepType, promptContext, promptTokens, completionText, completionTokens, latencyMs);

  if (checkpointState) {
    const insertCp = db.prepare(`
      INSERT INTO checkpoints (id, step_id, serialized_state)
      VALUES (?, ?, ?)
    `);
    insertCp.run(`cp_${uuidv4().slice(0, 8)}`, stepId, JSON.stringify(checkpointState));
  }

  return stepId;
}

export function addToolCall({
  id,
  stepId,
  toolName,
  inputArgs = {},
  outputResult = null,
  status = 'success',
  executionTimeMs = 0
}) {
  const toolId = id || `tool_${uuidv4().slice(0, 8)}`;
  const stmt = db.prepare(`
    INSERT INTO tool_calls (id, step_id, tool_name, input_args, output_result, status, execution_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    toolId,
    stepId,
    toolName,
    typeof inputArgs === 'string' ? inputArgs : JSON.stringify(inputArgs),
    typeof outputResult === 'string' ? outputResult : JSON.stringify(outputResult),
    status,
    executionTimeMs
  );
  return toolId;
}

export function forkRun({
  sourceRunId,
  forkStepId,
  modifiedToolOutputs = {},
  modifiedPromptContext = null,
  steeringInstruction = null,
  newRunName
}) {
  const sourceRun = getRun(sourceRunId);
  if (!sourceRun) throw new Error(`Source run ${sourceRunId} not found`);

  const forkStepIndex = sourceRun.steps.findIndex(s => s.id === forkStepId);
  if (forkStepIndex === -1) throw new Error(`Fork step ${forkStepId} not found in run ${sourceRunId}`);

  const targetSteps = sourceRun.steps.slice(0, forkStepIndex + 1);
  const forkedRunId = `run_fork_${uuidv4().slice(0, 8)}`;
  const name = newRunName || `${sourceRun.name} (Fork @ Step ${targetSteps.length})`;

  const newRun = createRun({
    id: forkedRunId,
    name,
    metadata: {
      ...sourceRun.metadata,
      forked_from: sourceRunId,
      fork_step: forkStepId,
      has_steering: Boolean(steeringInstruction || modifiedPromptContext)
    },
    parentRunId: sourceRunId,
    forkStepId
  });

  // Replay steps into the new branch up to forkStepId
  for (let i = 0; i < targetSteps.length; i++) {
    const s = targetSteps[i];
    const isForkStep = s.id === forkStepId;
    const newStepId = `step_f_${uuidv4().slice(0, 8)}`;

    let promptContext = s.prompt_context;
    if (isForkStep) {
      if (modifiedPromptContext !== null && modifiedPromptContext !== undefined) {
        promptContext = modifiedPromptContext;
      }
      if (steeringInstruction) {
        promptContext = `${promptContext}\n\n[USER STEERING CORRECTION]: ${steeringInstruction}`;
      }
    }

    addStep({
      id: newStepId,
      runId: forkedRunId,
      stepNumber: s.step_number,
      stepType: s.step_type,
      promptContext,
      promptTokens: Math.round(promptContext.length / 4),
      completionText: isForkStep && steeringInstruction ? `[Steered Branch]: ${s.completion_text}` : s.completion_text,
      completionTokens: s.completion_tokens,
      latencyMs: s.latency_ms,
      checkpointState: s.checkpoint
    });

    for (const tc of s.tool_calls) {
      let finalOutput = tc.output_result;
      let finalStatus = tc.status;

      // Apply modification if specified for this tool call at the fork point
      if (isForkStep && modifiedToolOutputs[tc.tool_name] !== undefined) {
        finalOutput = modifiedToolOutputs[tc.tool_name];
        finalStatus = 'mocked';
      } else if (isForkStep && modifiedToolOutputs[tc.id] !== undefined) {
        finalOutput = modifiedToolOutputs[tc.id];
        finalStatus = 'mocked';
      }

      addToolCall({
        stepId: newStepId,
        toolName: tc.tool_name,
        inputArgs: tc.input_args,
        outputResult: finalOutput,
        status: finalStatus,
        executionTimeMs: tc.execution_time_ms
      });
    }
  }

  // Mark status as forked / ready for resumption
  updateRunStatus(forkedRunId, 'forked');

  return getRun(forkedRunId);
}

export function computeStepDiff(stepAId, stepBId) {
  const getStep = db.prepare(`SELECT prompt_context, step_number FROM steps WHERE id = ?`);
  const stepA = getStep.get(stepAId);
  const stepB = getStep.get(stepBId);

  if (!stepA || !stepB) throw new Error("One or both steps not found");

  const diffResult = diff.diffWordsWithSpace(stepA.prompt_context, stepB.prompt_context);

  let addedWords = 0;
  let removedWords = 0;
  diffResult.forEach(part => {
    if (part.added) addedWords += part.value.trim().split(/\s+/).filter(Boolean).length;
    if (part.removed) removedWords += part.value.trim().split(/\s+/).filter(Boolean).length;
  });

  return {
    stepA: { id: stepAId, number: stepA.step_number },
    stepB: { id: stepBId, number: stepB.step_number },
    stats: { addedWords, removedWords, partsCount: diffResult.length },
    diff: diffResult
  };
}

function safeJsonParse(val) {
  if (!val) return null;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}
