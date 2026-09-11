import React from 'react';
import {
  AlertTriangle,
  TestTube2,
  Clock
} from 'lucide-react';
import type { Step } from '../types';

interface StepDetailCardProps {
  currentStep: Step;
  prevStep: Step | null | undefined;
  hasContextSurge: boolean;
  isRepetitiveCall: boolean;
  openForkModal: (step: Step, toolName?: string, defaultOutput?: any, defaultSteering?: string) => void;
  handleOpenEvalModal: (stepId: string) => void;
}

export const StepDetailCard: React.FC<StepDetailCardProps> = ({
  currentStep,
  prevStep,
  hasContextSurge,
  isRepetitiveCall,
  openForkModal,
  handleOpenEvalModal
}) => {
  return (
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
    </>
  );
};
