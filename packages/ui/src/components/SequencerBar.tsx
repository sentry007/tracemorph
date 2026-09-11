import React from 'react';
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Filter
} from 'lucide-react';
import type { Run, Step } from '../types';

interface SequencerBarProps {
  activeRun: Run | null;
  currentStepIndex: number;
  setCurrentStepIndex: (idx: number | ((prev: number) => number)) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
  stepFilter: 'all' | 'tools' | 'errors';
  setStepFilter: (filter: 'all' | 'tools' | 'errors') => void;
  selectedToolFilter: string;
  setSelectedToolFilter: (tool: string) => void;
  availableTools: string[];
  filteredSteps: Step[];
  currentStep?: Step;
}

export const SequencerBar: React.FC<SequencerBarProps> = ({
  activeRun,
  currentStepIndex,
  setCurrentStepIndex,
  isPlaying,
  setIsPlaying,
  stepFilter,
  setStepFilter,
  selectedToolFilter,
  setSelectedToolFilter,
  availableTools,
  filteredSteps,
  currentStep
}) => {
  return (
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

      {/* Step Nodes Track */}
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
  );
};
