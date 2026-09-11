import { useState, useEffect, useRef } from 'react';
import type { Run, Step, DiffReport, EvalData } from './types';
import { FALLBACK_RUNS } from './fallbackData';
import { Header } from './components/Header';
import { SequencerBar } from './components/SequencerBar';
import { StepDetailCard } from './components/StepDetailCard';
import { ToolInspector } from './components/ToolInspector';
import { InspectorTabs } from './components/InspectorTabs';
import { ForkModal } from './components/ForkModal';
import { EvalModal } from './components/EvalModal';

const API_BASE = 'http://localhost:7890';

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
  const hasContextSurge = Boolean(
    prevStep &&
    currentStep &&
    currentStep.prompt_tokens > prevStep.prompt_tokens * 1.5 &&
    (currentStep.prompt_tokens - prevStep.prompt_tokens) > 50
  );

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
      <Header
        runs={runs}
        activeRunId={activeRunId}
        setActiveRunId={setActiveRunId}
        activeRun={activeRun}
        wsConnected={wsConnected}
        totalTokens={totalTokens}
        firstErrorStepIndex={firstErrorStepIndex}
        setCurrentStepIndex={setCurrentStepIndex}
        handleResumeExecution={handleResumeExecution}
        isResuming={isResuming}
        handleSeedDemo={handleSeedDemo}
        isSeeding={isSeeding}
        currentStep={currentStep}
        openForkModal={openForkModal}
      />

      {/* --- Horizontal Scrubber Rail --- */}
      <SequencerBar
        activeRun={activeRun}
        currentStepIndex={currentStepIndex}
        setCurrentStepIndex={setCurrentStepIndex}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        stepFilter={stepFilter}
        setStepFilter={setStepFilter}
        selectedToolFilter={selectedToolFilter}
        setSelectedToolFilter={setSelectedToolFilter}
        availableTools={availableTools}
        filteredSteps={filteredSteps}
        currentStep={currentStep}
      />

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
        {/* Left Column: Active Step Details & Tools */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {currentStep ? (
            <>
              <StepDetailCard
                currentStep={currentStep}
                prevStep={prevStep}
                hasContextSurge={hasContextSurge}
                isRepetitiveCall={isRepetitiveCall}
                openForkModal={openForkModal}
                handleOpenEvalModal={handleOpenEvalModal}
              />

              <ToolInspector
                currentStep={currentStep}
                toolLayout={toolLayout}
                setToolLayout={setToolLayout}
                openForkModal={openForkModal}
                copiedKey={copiedKey}
                copyToClipboard={copyToClipboard}
              />
            </>
          ) : (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a run to view execution details.
            </div>
          )}
        </div>

        {/* Right Column: Clean Inspector Tabs */}
        <InspectorTabs
          inspectorTab={inspectorTab}
          setInspectorTab={setInspectorTab}
          currentStep={currentStep}
          diffReport={diffReport}
          runs={runs}
          activeRunId={activeRunId}
          setActiveRunId={setActiveRunId}
        />
      </main>

      {/* --- Eval / Pytest Exporter Modal --- */}
      <EvalModal
        evalModalOpen={evalModalOpen}
        setEvalModalOpen={setEvalModalOpen}
        evalData={evalData}
        evalTab={evalTab}
        setEvalTab={setEvalTab}
        isLoadingEval={isLoadingEval}
        copiedKey={copiedKey}
        copyToClipboard={copyToClipboard}
      />

      {/* --- State Forking & Prompt Steering Modal --- */}
      <ForkModal
        forkModalOpen={forkModalOpen}
        setForkModalOpen={setForkModalOpen}
        forkStep={forkStep}
        forkToolName={forkToolName}
        forkPayload={forkPayload}
        setForkPayload={setForkPayload}
        forkSteering={forkSteering}
        setForkSteering={setForkSteering}
        forkRunName={forkRunName}
        setForkRunName={setForkRunName}
        handleExecuteFork={handleExecuteFork}
        isForking={isForking}
      />
    </div>
  );
}
