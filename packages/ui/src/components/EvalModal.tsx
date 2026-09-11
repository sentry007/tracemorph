import React from 'react';
import { TestTube2, X, Copy, Check } from 'lucide-react';
import type { EvalData } from '../types';

interface EvalModalProps {
  evalModalOpen: boolean;
  setEvalModalOpen: (open: boolean) => void;
  evalData: EvalData | null;
  evalTab: 'pytest' | 'vitest' | 'json';
  setEvalTab: (tab: 'pytest' | 'vitest' | 'json') => void;
  isLoadingEval: boolean;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}

export const EvalModal: React.FC<EvalModalProps> = ({
  evalModalOpen,
  setEvalModalOpen,
  evalData,
  evalTab,
  setEvalTab,
  isLoadingEval,
  copiedKey,
  copyToClipboard
}) => {
  if (!evalModalOpen) return null;

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
  );
};
