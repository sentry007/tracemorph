import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  GitFork,
  GitBranch,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Terminal,
  Clock,
  Layers,
  FileCode,
  SlidersHorizontal,
  X,
  AlertTriangle,
  Coins,
  SplitSquareVertical,
  Columns,
  TestTube2,
  FastForward,
  Filter
} from 'lucide-react';

interface ToolCall {
  id: string;
  tool_name: string;
  input_args: any;
  output_result: any;
  status: 'success' | 'error' | 'mocked';
  execution_time_ms: number;
}

interface Step {
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

interface Run {
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

interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

interface DiffReport {
  stepA: { id: string; number: number };
  stepB: { id: string; number: number };
  stats: { addedWords: number; removedWords: number; partsCount: number };
  diff: DiffPart[];
}

interface EvalData {
  stepNumber: number;
  pytestCode: string;
  vitestCode: string;
  jsonEval: any;
}

import { FALLBACK_RUNS } from './fallbackData';

const API_BASE = 'http://localhost:7890';

function estimateCost(tokens: number): string {
  const cost = (tokens / 1000) * 0.005;
  if (cost < 0.001) return '< $0.001';
  return `$${cost.toFixed(4)}`;
}

export default function App() {
  const [runs, setRuns] = useState<Run[]>(FALLBACK_RUNS as any);
  const [activeRunId, setActiveRunId] = useState<string | null>(FALLBACK_RUNS[0].id);
  const [activeRun, setActiveRun] = useState<Run | null>(FALLBACK_RUNS[0] as any);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [inspectorTab, setInspectorTab] = useState<'diff' | 'raw' | 'memory' | 'branches'>('diff');
  const [diffReport, setDiffReport] = useState<DiffReport | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filters & Views
  const [stepFilter, setStepFilter] = useState<'all' | 'tools' | 'errors'>('all');
  const [selectedToolFilter, setSelectedToolFilter] = useState<string>('all');
  const [toolLayout, setToolLayout] = useState<'columns' | 'stacked'>('columns');

  // Resume Execution State
  const [isResuming, setIsResuming] = useState<boolean>(false);

  // Eval Modal State
  const [evalModalOpen, setEvalModalOpen] = useState<boolean>(false);
  const [evalData, setEvalData] = useState<EvalData | null>(null);
  const [evalTab, setEvalTab] = useState<'pytest' | 'vitest' | 'json'>('pytest');
  const [isLoadingEval, setIsLoadingEval] = useState<boolean>(false);

  // Fork Modal State
  const [forkModalOpen, setForkModalOpen] = useState<boolean>(false);
  const [forkStep, setForkStep] = useState<Step | null>(null);
  const [forkToolName, setForkToolName] = useState<string>('');
  const [forkPayload, setForkPayload] = useState<string>('');
  const [forkSteering, setForkSteering] = useState<string>('');
  const [forkRunName, setForkRunName] = useState<string>('');
  const [isForking, setIsForking] = useState<boolean>(false);

  const playIntervalRef = useRef<any>(null);

  // 1. Fetch runs (with offline fallback for GitHub Pages)
  const fetchRuns = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/runs`);
      const data = await res.json();
      if (data.success && data.runs && data.runs.length > 0) {
        setRuns(data.runs);
        if (!activeRunId) {
          setActiveRunId(data.runs[0].id);
        }
        return;
      }
    } catch {
      // Offline fallback: Use bundled demo runs
      setRuns(FALLBACK_RUNS as any);
      if (!activeRunId) {
        setActiveRunId(FALLBACK_RUNS[0].id);
        setActiveRun(FALLBACK_RUNS[0] as any);
      }
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  // 2. Fetch active run details (with offline fallback)
  useEffect(() => {
    if (!activeRunId) return;
    const fetchRunDetails = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/runs/${activeRunId}`);
        const data = await res.json();
        if (data.success && data.run) {
          setActiveRun(data.run);
          setCurrentStepIndex(prev =>
            data.run.steps.length > 0 ? Math.min(prev, data.run.steps.length - 1) : 0
          );
          return;
        }
      } catch {
        const fallback = (runs || FALLBACK_RUNS).find(r => r.id === activeRunId);
        if (fallback) {
          setActiveRun(fallback as any);
        }
      }
    };
    fetchRunDetails();
  }, [activeRunId, runs]);

  // 3. WebSocket listener
  useEffect(() => {
    let ws: WebSocket;
    const connect = () => {
      ws = new WebSocket('ws://localhost:7890/ws');
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connect, 2500);
      };
      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'run_created' || msg.type === 'run_forked') {
            fetchRuns();
          } else if (msg.type === 'step_recorded' && msg.payload.runId === activeRunId) {
            setActiveRun(msg.payload.run);
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };
    };
    connect();
    return () => ws && ws.close();
  }, [activeRunId]);

  // 4. Calculate diff between step N-1 and step N
  useEffect(() => {
    if (!activeRun || !activeRun.steps || activeRun.steps.length < 2 || currentStepIndex === 0) {
      setDiffReport(null);
      return;
    }

    const stepA = activeRun.steps[currentStepIndex - 1];
    const stepB = activeRun.steps[currentStepIndex];

    const fetchDiff = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/diff/${stepA.id}/${stepB.id}`);
        const data = await res.json();
        if (data.success) {
          setDiffReport(data.diffReport);
        }
      } catch (e) {
        console.error('Diff error:', e);
      }
    };
    fetchDiff();
  }, [activeRun, currentStepIndex]);

  // 5. Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        return;
      }
      if (e.key === 'ArrowLeft') {
        setCurrentStepIndex(p => Math.max(0, p - 1));
      } else if (e.key === 'ArrowRight') {
        if (activeRun) {
          setCurrentStepIndex(p => Math.min(activeRun.steps.length - 1, p + 1));
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRun, currentStepIndex]);

  // 6. Playback scrubber
  useEffect(() => {
    if (isPlaying && activeRun && activeRun.steps.length > 0) {
      playIntervalRef.current = setInterval(() => {
        setCurrentStepIndex(prev => {
          if (prev >= activeRun.steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1400);
    } else {
      clearInterval(playIntervalRef.current);
    }
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying, activeRun]);

  const handleSeedDemo = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch(`${API_BASE}/api/seed`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.run) {
        await fetchRuns();
        setActiveRunId(data.run.id);
        setCurrentStepIndex(0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSeeding(false);
    }
  };

  // Feature: Live Model Resume / Step Generation
  const handleResumeExecution = async () => {
    if (!activeRun) return;
    setIsResuming(true);
    try {
      const res = await fetch(`${API_BASE}/api/runs/${activeRun.id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'simulated', model: 'claude-3-7-sonnet' })
      });
      const data = await res.json();
      if (data.success && data.run) {
        setActiveRun(data.run);
        setCurrentStepIndex(data.run.steps.length - 1);
        await fetchRuns();
      }
    } catch (e) {
      console.error('Resume error:', e);
    } finally {
      setIsResuming(false);
    }
  };

  // Feature: Eval & Pytest Exporter
  const handleOpenEvalModal = async (stepId: string) => {
    setIsLoadingEval(true);
    setEvalModalOpen(true);
    try {
      const res = await fetch(`${API_BASE}/api/steps/${stepId}/eval`);
      const data = await res.json();
      if (data.success) {
        setEvalData(data);
      }
    } catch (e) {
      console.error('Eval error:', e);
    } finally {
      setIsLoadingEval(false);
    }
  };

  const openForkModal = (step: Step, toolName?: string, defaultOutput?: any, defaultSteering?: string) => {
    setForkStep(step);
    const targetTool = toolName || step.tool_calls[0]?.tool_name || 'custom_tool';
    setForkToolName(targetTool);
    setForkPayload(
      defaultOutput ? JSON.stringify(defaultOutput, null, 2) : JSON.stringify({ mock_data: 'override_value' }, null, 2)
    );
    setForkSteering(defaultSteering || '');
    setForkRunName(`${activeRun?.name} (Branch @ Step ${step.step_number})`);
    setForkModalOpen(true);
  };

  const handleExecuteFork = async () => {
    if (!activeRun || !forkStep) return;
    setIsForking(true);
    try {
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(forkPayload);
      } catch {
        parsedPayload = forkPayload;
      }

      const res = await fetch(`${API_BASE}/api/runs/${activeRun.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forkStepId: forkStep.id,
          modifiedToolOutputs: { [forkToolName]: parsedPayload },
          steeringInstruction: forkSteering.trim() ? forkSteering.trim() : null,
          newRunName: forkRunName
        })
      });
      const data = await res.json();
      if (data.success && data.run) {
        await fetchRuns();
        setActiveRunId(data.run.id);
        setCurrentStepIndex(data.run.steps.length - 1);
        setForkModalOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsForking(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const currentStep = activeRun?.steps?.[currentStepIndex];

  // Distinct tool names in active run
  const availableTools = Array.from(
    new Set((activeRun?.steps || []).flatMap(s => s.tool_calls.map(t => t.tool_name)))
  );

  // Filtered steps
  const filteredSteps = (activeRun?.steps || []).filter(step => {
    if (stepFilter === 'tools' && step.tool_calls.length === 0) return false;
    if (stepFilter === 'errors' && !step.tool_calls.some(t => t.status === 'error')) return false;
    if (selectedToolFilter !== 'all' && !step.tool_calls.some(t => t.tool_name === selectedToolFilter)) return false;
    return true;
  });

  const firstErrorStepIndex = activeRun?.steps?.findIndex(s => s.tool_calls.some(t => t.status === 'error')) ?? -1;
  const totalTokens = activeRun?.steps?.reduce((acc, s) => acc + (s.prompt_tokens + s.completion_tokens), 0) || 0;

  // Context surge detection
  const prevStep = currentStepIndex > 0 ? activeRun?.steps?.[currentStepIndex - 1] : null;
  const hasContextSurge = prevStep && currentStep && currentStep.prompt_tokens > prevStep.prompt_tokens * 1.5 && (currentStep.prompt_tokens - prevStep.prompt_tokens) > 50;

  // Doom loop / repetitive tool call detection
  const isRepetitiveCall = Boolean(
    prevStep &&
    currentStep &&
    prevStep.tool_calls.length > 0 &&
    currentStep.tool_calls.length > 0 &&
    prevStep.tool_calls[0].tool_name === currentStep.tool_calls[0].tool_name &&
    JSON.stringify(prevStep.tool_calls[0].input_args) === JSON.stringify(currentStep.tool_calls[0].input_args)
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* --- Top Navigation Header --- */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 30
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', letterSpacing: '-0.01em', color: 'var(--text-main)' }}>
              TraceMorph
            </span>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: wsConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)'
              }}
              title={wsConnected ? 'Connected to local engine' : 'Engine offline'}
            />
          </div>

          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

          {/* Run Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={14} color="var(--text-muted)" />
            <select
              value={activeRunId || ''}
              onChange={e => setActiveRunId(e.target.value)}
              style={{
                background: 'var(--bg-subtle)',
                color: 'var(--text-main)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
                minWidth: '260px'
              }}
            >
              {runs.map(r => (
                <option key={r.id} value={r.id}>
                  {r.parent_run_id ? `↳ ${r.name}` : r.name} ({r.step_count || r.steps?.length || 0} steps)
                </option>
              ))}
            </select>
          </div>

          {/* Token Accounting Metric */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            <Coins size={13} color="var(--accent-amber)" />
            <span>{totalTokens.toLocaleString()} tokens</span>
            <span style={{ color: 'var(--text-dim)' }}>•</span>
            <span style={{ color: 'var(--accent-emerald)' }}>{estimateCost(totalTokens)} est.</span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {firstErrorStepIndex !== -1 && (
            <button
              className="btn"
              style={{ background: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.3)', color: '#fb7185' }}
              onClick={() => setCurrentStepIndex(firstErrorStepIndex)}
              title="Jump directly to the failed step"
            >
              <AlertTriangle size={13} />
              <span>Jump to Error (Step {activeRun?.steps[firstErrorStepIndex].step_number})</span>
            </button>
          )}

          {/* Feature: Live Model Resume / Step Continuation */}
          <button
            className="btn btn-primary"
            onClick={handleResumeExecution}
            disabled={isResuming || !activeRun}
            title="Generate the next step using model reasoning"
          >
            <FastForward size={13} />
            <span>{isResuming ? 'Resuming...' : 'Generate Next Step'}</span>
          </button>

          <button className="btn btn-ghost" onClick={handleSeedDemo} disabled={isSeeding}>
            <Sparkles size={13} />
            <span>{isSeeding ? 'Seeding...' : 'Seed Sample'}</span>
          </button>

          {currentStep && (
            <button
              className="btn"
              onClick={() => openForkModal(currentStep, currentStep.tool_calls[0]?.tool_name, currentStep.tool_calls[0]?.output_result)}
              title="Fork and steer this execution branch"
            >
              <GitFork size={13} />
              <span>Fork Step {currentStep.step_number}</span>
            </button>
          )}
        </div>
      </header>

      {/* --- Horizontal Scrubber Rail --- */}
      <section
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}
      >
        {/* Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="btn-icon"
            onClick={() => setCurrentStepIndex(0)}
            disabled={!activeRun || currentStepIndex === 0}
            title="First step"
          >
            <RotateCcw size={13} />
          </button>
          <button
            className="btn-icon"
            onClick={() => setCurrentStepIndex(p => Math.max(0, p - 1))}
            disabled={!activeRun || currentStepIndex === 0}
            title="Previous step (←)"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            className="btn"
            style={{ padding: '4px 10px', height: '30px' }}
            onClick={() => setIsPlaying(p => !p)}
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            <span style={{ fontSize: '0.75rem' }}>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            className="btn-icon"
            onClick={() => activeRun && setCurrentStepIndex(p => Math.min(activeRun.steps.length - 1, p + 1))}
            disabled={!activeRun || currentStepIndex >= (activeRun.steps.length - 1)}
            title="Next step (→)"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

        {/* Filters: Step Types & Tool Specific Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className={`btn ${stepFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '2px 8px', height: '24px', fontSize: '0.7rem' }}
            onClick={() => setStepFilter('all')}
          >
            All
          </button>
          <button
            className={`btn ${stepFilter === 'tools' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '2px 8px', height: '24px', fontSize: '0.7rem' }}
            onClick={() => setStepFilter('tools')}
          >
            Tools
          </button>
          <button
            className={`btn ${stepFilter === 'errors' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '2px 8px', height: '24px', fontSize: '0.7rem' }}
            onClick={() => setStepFilter('errors')}
          >
            Errors
          </button>

          {availableTools.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '6px' }}>
              <Filter size={11} color="var(--text-muted)" style={{ marginRight: '4px' }} />
              <select
                value={selectedToolFilter}
                onChange={e => setSelectedToolFilter(e.target.value)}
                style={{
                  background: 'var(--bg)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">Any Tool</option>
                {availableTools.map(t => (
                  <option key={t} value={t}>{t}()</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

        {/* Step Nodes Track (Always High-Contrast & Crisp) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            padding: '4px 2px'
          }}
        >
          {filteredSteps.map((step) => {
            const actualIndex = activeRun?.steps.findIndex(s => s.id === step.id) ?? 0;
            const isActive = actualIndex === currentStepIndex;
            const hasError = step.tool_calls.some(t => t.status === 'error');
            const hasMocked = step.tool_calls.some(t => t.status === 'mocked');

            let badgeType = 'badge-default';
            if (step.step_type === 'tool_call') badgeType = 'badge-blue';
            if (step.step_type === 'reflection') badgeType = 'badge-purple';
            if (step.step_type === 'output') badgeType = 'badge-emerald';
            if (hasError) badgeType = 'badge-rose';
            if (hasMocked) badgeType = 'badge-amber';

            return (
              <div
                key={step.id}
                className={`timeline-step ${isActive ? 'active' : ''}`}
                onClick={() => setCurrentStepIndex(actualIndex)}
                style={{
                  border: isActive ? '1.5px solid #ffffff' : '1px solid #3f3f46',
                  background: isActive ? '#27272a' : 'var(--bg-subtle)',
                  boxShadow: isActive ? '0 0 0 1px #ffffff' : 'none'
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  {step.step_number}
                </span>
                <span className={`badge ${badgeType}`}>
                  {hasError ? 'ERROR' : hasMocked ? 'MOCKED' : step.step_type.replace('_', ' ')}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {step.latency_ms}ms
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
          <span>{currentStep ? `${currentStep.step_number} of ${activeRun?.steps?.length || 0}` : '0 of 0'}</span>
        </div>
      </section>

      {/* --- Main Workspace Split Layout --- */}
      <main
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: '16px',
          padding: '16px 20px',
          overflow: 'hidden'
        }}
      >
        {/* Left Column: Active Step Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {currentStep ? (
            <>
              {/* Context Surge Alert */}
              {hasContextSurge && (
                <div
                  className="card"
                  style={{
                    padding: '10px 14px',
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    background: 'rgba(245, 158, 11, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.8rem',
                    color: '#fbbf24'
                  }}
                >
                  <AlertTriangle size={15} />
                  <span>
                    <strong>Context Surge:</strong> Prompt size jumped from {prevStep?.prompt_tokens} to {currentStep.prompt_tokens} tokens (+{Math.round(((currentStep.prompt_tokens - prevStep!.prompt_tokens) / prevStep!.prompt_tokens) * 100)}%).
                  </span>
                </div>
              )}

              {/* Repetitive Call Warning (Doom Loop Detector) */}
              {isRepetitiveCall && (
                <div
                  className="card"
                  style={{
                    padding: '10px 14px',
                    borderColor: 'rgba(244, 63, 94, 0.4)',
                    background: 'rgba(244, 63, 94, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    fontSize: '0.8rem',
                    color: '#fb7185'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={15} />
                    <span>
                      <strong>Doom Loop Warning:</strong> Tool <code>{currentStep.tool_calls[0].tool_name}</code> was invoked with identical input as Step {prevStep?.step_number}.
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 8px', fontSize: '0.72rem', borderColor: '#fb7185', color: '#fb7185' }}
                    onClick={() => openForkModal(currentStep, currentStep.tool_calls[0].tool_name, currentStep.tool_calls[0].output_result, `Break Loop: Stop calling ${currentStep.tool_calls[0].tool_name} with repeated arguments. Switch to alternate strategy.`)}
                  >
                    Break Loop & Steer
                  </button>
                </div>
              )}

              {/* Step Overview Card */}
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Step {currentStep.step_number}</span>
                    <span className="badge badge-default" style={{ textTransform: 'capitalize' }}>
                      {currentStep.step_type.replace('_', ' ')}
                    </span>
                    {currentStep.tool_calls.some(t => t.status === 'mocked') && (
                      <span className="badge badge-amber">Forked / Mocked</span>
                    )}
                    {currentStep.prompt_context.includes('[USER STEERING CORRECTION]') && (
                      <span className="badge badge-purple">Steered</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Feature: Export as Eval / Unit Test */}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                      onClick={() => handleOpenEvalModal(currentStep.id)}
                      title="Export this step as an automated test case"
                    >
                      <TestTube2 size={12} color="var(--accent-emerald)" />
                      <span>Export as Eval</span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> {currentStep.latency_ms}ms
                      </span>
                      <span>{currentStep.prompt_tokens + currentStep.completion_tokens} tokens</span>
                    </div>
                  </div>
                </div>

                {/* Agent Reasoning */}
                <div>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>
                    Agent Reasoning & Plan
                  </div>
                  <div
                    className="code-block"
                    style={{
                      fontSize: '0.84rem',
                      lineHeight: 1.6,
                      color: 'var(--text-main)'
                    }}
                  >
                    {currentStep.completion_text || '(No completion recorded for this step)'}
                  </div>
                </div>
              </div>

              {/* Tool Calls Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Tool Invocations ({currentStep.tool_calls.length})
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      className="btn-icon"
                      style={{ width: '24px', height: '24px' }}
                      onClick={() => setToolLayout(l => l === 'columns' ? 'stacked' : 'columns')}
                      title={toolLayout === 'columns' ? 'Switch to Stacked View' : 'Switch to Side-by-Side'}
                    >
                      {toolLayout === 'columns' ? <SplitSquareVertical size={13} /> : <Columns size={13} />}
                    </button>

                    {currentStep.tool_calls.length > 0 && (
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                        onClick={() => openForkModal(currentStep, currentStep.tool_calls[0].tool_name, currentStep.tool_calls[0].output_result)}
                      >
                        <GitFork size={12} />
                        Fork Tool Result
                      </button>
                    )}
                  </div>
                </div>

                {currentStep.tool_calls.length === 0 ? (
                  <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No external tools invoked in this step
                  </div>
                ) : (
                  currentStep.tool_calls.map(tool => (
                    <div key={tool.id} className="card" style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Terminal size={14} color="var(--text-secondary)" />
                          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                            {tool.tool_name}()
                          </span>
                          <span
                            className={`badge ${
                              tool.status === 'error'
                                ? 'badge-rose'
                                : tool.status === 'mocked'
                                ? 'badge-amber'
                                : 'badge-emerald'
                            }`}
                          >
                            {tool.status}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {tool.execution_time_ms}ms
                        </span>
                      </div>

                      {/* Tool Args and Output (No side-scrolling; wrap cleanly) */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: toolLayout === 'columns' ? '1fr 1fr' : '1fr',
                          gap: '10px'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                              Input Arguments
                            </span>
                            <button
                              className="btn-icon"
                              style={{ width: '20px', height: '20px', border: 'none' }}
                              onClick={() => copyToClipboard(JSON.stringify(tool.input_args, null, 2), `in_${tool.id}`)}
                            >
                              {copiedKey === `in_${tool.id}` ? <Check size={11} color="var(--accent-emerald)" /> : <Copy size={11} />}
                            </button>
                          </div>
                          <pre className="code-block" style={{ maxHeight: toolLayout === 'stacked' ? '200px' : '160px', overflowY: 'auto' }}>
                            {JSON.stringify(tool.input_args, null, 2)}
                          </pre>
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                              Output Result
                            </span>
                            <button
                              className="btn-icon"
                              style={{ width: '20px', height: '20px', border: 'none' }}
                              onClick={() => copyToClipboard(JSON.stringify(tool.output_result, null, 2), `out_${tool.id}`)}
                            >
                              {copiedKey === `out_${tool.id}` ? <Check size={11} color="var(--accent-emerald)" /> : <Copy size={11} />}
                            </button>
                          </div>
                          <pre
                            className="code-block"
                            style={{
                              maxHeight: toolLayout === 'stacked' ? '260px' : '160px',
                              overflowY: 'auto',
                              color: tool.status === 'error' ? 'var(--accent-rose)' : 'var(--text-main)'
                            }}
                          >
                            {JSON.stringify(tool.output_result, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a run to view execution details.
            </div>
          )}
        </div>

        {/* Right Column: Clean Inspector Tabs */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* Tab Rail */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
              padding: '0 8px',
              background: 'var(--bg-subtle)'
            }}
          >
            <button
              className={`tab-btn ${inspectorTab === 'diff' ? 'active' : ''}`}
              onClick={() => setInspectorTab('diff')}
            >
              <SlidersHorizontal size={13} />
              Context Diff
            </button>
            <button
              className={`tab-btn ${inspectorTab === 'raw' ? 'active' : ''}`}
              onClick={() => setInspectorTab('raw')}
            >
              <FileCode size={13} />
              Raw Prompt
            </button>
            <button
              className={`tab-btn ${inspectorTab === 'memory' ? 'active' : ''}`}
              onClick={() => setInspectorTab('memory')}
            >
              <Layers size={13} />
              Memory State
            </button>
            <button
              className={`tab-btn ${inspectorTab === 'branches' ? 'active' : ''}`}
              onClick={() => setInspectorTab('branches')}
            >
              <GitBranch size={13} />
              Lineage
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ flex: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {inspectorTab === 'diff' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Step {currentStep?.step_number} prompt delta vs predecessor:</span>
                  {diffReport && (
                    <div style={{ display: 'flex', gap: '8px', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ color: 'var(--accent-emerald)' }}>+{diffReport.stats.addedWords} words</span>
                      <span style={{ color: 'var(--accent-rose)' }}>-{diffReport.stats.removedWords} words</span>
                    </div>
                  )}
                </div>

                {diffReport ? (
                  <div className="code-block" style={{ flex: 1, overflowY: 'auto' }}>
                    {diffReport.diff.map((part, index) => {
                      if (part.added) {
                        return <span key={index} className="diff-ins">{part.value}</span>;
                      }
                      if (part.removed) {
                        return <span key={index} className="diff-del">{part.value}</span>;
                      }
                      return <span key={index} style={{ color: 'var(--text-muted)' }}>{part.value}</span>;
                    })}
                  </div>
                ) : (
                  <div className="code-block" style={{ flex: 1, color: 'var(--text-muted)' }}>
                    {currentStep?.prompt_context || '(Initial step: no previous prompt to diff against)'}
                  </div>
                )}
              </>
            )}

            {inspectorTab === 'raw' && (
              <div className="code-block" style={{ flex: 1, overflowY: 'auto' }}>
                {currentStep?.prompt_context || '(No prompt context recorded)'}
              </div>
            )}

            {inspectorTab === 'memory' && (
              <pre className="code-block" style={{ flex: 1, overflowY: 'auto' }}>
                {JSON.stringify(currentStep?.checkpoint || { notice: 'No checkpoint memory snapshot recorded' }, null, 2)}
              </pre>
            )}

            {inspectorTab === 'branches' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Execution Lineage & Branches:
                </div>
                {runs.map(r => (
                  <div
                    key={r.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: r.id === activeRunId ? 'var(--bg-active)' : 'var(--bg)',
                      border: `1px solid ${r.id === activeRunId ? 'var(--border-focus)' : 'var(--border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                    onClick={() => setActiveRunId(r.id)}
                  >
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {r.parent_run_id ? <GitFork size={13} color="var(--accent-amber)" /> : <GitBranch size={13} />}
                        <span>{r.name}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {r.id}
                      </div>
                    </div>
                    <span className="badge badge-default">{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- Eval / Pytest Exporter Modal --- */}
      {evalModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
        >
          <div
            className="card"
            style={{
              width: '640px',
              maxHeight: '85vh',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TestTube2 size={16} color="var(--accent-emerald)" />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  Export Step {evalData?.stepNumber} as Automated Eval Test
                </span>
              </div>
              <button
                className="btn-icon"
                style={{ width: '24px', height: '24px', border: 'none' }}
                onClick={() => setEvalModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            {/* Eval Language Tabs */}
            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              <button
                className={`btn ${evalTab === 'pytest' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                onClick={() => setEvalTab('pytest')}
              >
                Pytest (Python)
              </button>
              <button
                className={`btn ${evalTab === 'vitest' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                onClick={() => setEvalTab('vitest')}
              >
                Vitest / Jest (TS)
              </button>
              <button
                className={`btn ${evalTab === 'json' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                onClick={() => setEvalTab('json')}
              >
                JSON Benchmark
              </button>
            </div>

            {isLoadingEval ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Generating test suite...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: '260px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Paste this into your test directory to prevent regressions:
                  </span>
                  <button
                    className="btn"
                    style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                    onClick={() => {
                      const textToCopy =
                        evalTab === 'pytest'
                          ? evalData?.pytestCode
                          : evalTab === 'vitest'
                          ? evalData?.vitestCode
                          : JSON.stringify(evalData?.jsonEval, null, 2);
                      copyToClipboard(textToCopy || '', 'eval_copy');
                    }}
                  >
                    {copiedKey === 'eval_copy' ? <Check size={12} color="var(--accent-emerald)" /> : <Copy size={12} />}
                    <span>{copiedKey === 'eval_copy' ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                </div>

                <pre
                  className="code-block"
                  style={{
                    flex: 1,
                    maxHeight: '340px',
                    overflowY: 'auto',
                    color: 'var(--text-main)'
                  }}
                >
                  {evalTab === 'pytest'
                    ? evalData?.pytestCode
                    : evalTab === 'vitest'
                    ? evalData?.vitestCode
                    : JSON.stringify(evalData?.jsonEval, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button className="btn" onClick={() => setEvalModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- State Forking & Prompt Steering Modal --- */}
      {forkModalOpen && forkStep && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
        >
          <div
            className="card"
            style={{
              width: '540px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitFork size={16} />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Fork Execution Branch</span>
              </div>
              <button
                className="btn-icon"
                style={{ width: '24px', height: '24px', border: 'none' }}
                onClick={() => setForkModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Branching from <strong>Step {forkStep.step_number}</strong>. You can inject modified tool data AND add a steering directive to correct the agent's behavior.
            </p>

            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Branch Name
              </label>
              <input
                type="text"
                value={forkRunName}
                onChange={e => setForkRunName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '5px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-sans)',
                  outline: 'none'
                }}
              />
            </div>

            {/* Prompt Steering Input */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Prompt Steering Directive (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Do not hallucinate; ensure price is explicitly parsed as float"
                value={forkSteering}
                onChange={e => setForkSteering(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '5px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-sans)',
                  outline: 'none'
                }}
              />
            </div>

            {/* Tool Override */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Tool to Override: <code>{forkToolName}</code>
                </label>
              </div>
              <textarea
                value={forkPayload}
                onChange={e => setForkPayload(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '5px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button className="btn" onClick={() => setForkModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleExecuteFork} disabled={isForking}>
                {isForking ? 'Forking...' : 'Create Steered Branch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
