import React from 'react';
import {
  GitBranch,
  GitFork,
  Sparkles,
  AlertTriangle,
  Coins,
  FastForward
} from 'lucide-react';
import type { Run, Step } from '../types';

interface HeaderProps {
  runs: Run[];
  activeRunId: string | null;
  setActiveRunId: (id: string) => void;
  activeRun: Run | null;
  wsConnected: boolean;
  totalTokens: number;
  firstErrorStepIndex: number;
  setCurrentStepIndex: (idx: number | ((prev: number) => number)) => void;
  handleResumeExecution: () => void;
  isResuming: boolean;
  handleSeedDemo: () => void;
  isSeeding: boolean;
  currentStep?: Step;
  openForkModal: (step: Step, toolName?: string, defaultOutput?: any, defaultSteering?: string) => void;
}

function estimateCost(tokens: number): string {
  const cost = (tokens / 1000) * 0.005;
  if (cost < 0.001) return '< $0.001';
  return `$${cost.toFixed(4)}`;
}

export const Header: React.FC<HeaderProps> = ({
  runs,
  activeRunId,
  setActiveRunId,
  activeRun,
  wsConnected,
  totalTokens,
  firstErrorStepIndex,
  setCurrentStepIndex,
  handleResumeExecution,
  isResuming,
  handleSeedDemo,
  isSeeding,
  currentStep,
  openForkModal
}) => {
  return (
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
  );
};
