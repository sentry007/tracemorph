import React from 'react';
import { GitFork, X } from 'lucide-react';
import type { Step } from '../types';

interface ForkModalProps {
  forkModalOpen: boolean;
  setForkModalOpen: (open: boolean) => void;
  forkStep: Step | null;
  forkToolName: string;
  forkPayload: string;
  setForkPayload: (p: string) => void;
  forkSteering: string;
  setForkSteering: (s: string) => void;
  forkRunName: string;
  setForkRunName: (n: string) => void;
  handleExecuteFork: () => void;
  isForking: boolean;
}

export const ForkModal: React.FC<ForkModalProps> = ({
  forkModalOpen,
  setForkModalOpen,
  forkStep,
  forkToolName,
  forkPayload,
  setForkPayload,
  forkSteering,
  setForkSteering,
  forkRunName,
  setForkRunName,
  handleExecuteFork,
  isForking
}) => {
  if (!forkModalOpen || !forkStep) return null;

  return (
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
  );
};
