export interface ToolCall {
  id: string;
  tool_name: string;
  input_args: any;
  output_result: any;
  status: 'success' | 'error' | 'mocked';
  execution_time_ms: number;
}

export interface Step {
  id: string;
  step_number: number;
  step_type: 'thought' | 'tool_call' | 'reflection' | 'output';
  prompt_context: string;
  prompt_tokens: number;
  completion_text: string;
  completion_tokens: number;
  latency_ms: number;
  tool_calls: ToolCall[];
  checkpoint: any;
}

export interface Run {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'forked';
  parent_run_id: string | null;
  fork_step_id: string | null;
  metadata: any;
  created_at: string;
  steps: Step[];
  step_count?: number;
  total_tokens?: number;
}

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface DiffReport {
  stepA: { id: string; number: number };
  stepB: { id: string; number: number };
  stats: { addedWords: number; removedWords: number; partsCount: number };
  diff: DiffPart[];
}

export interface EvalData {
  stepNumber: number;
  pytestCode: string;
  vitestCode: string;
  jsonEval: any;
}
