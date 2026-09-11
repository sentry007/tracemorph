import React from 'react';
import {
  Terminal,
  SplitSquareVertical,
  Columns,
  GitFork,
  Copy,
  Check
} from 'lucide-react';
import type { Step } from '../types';

interface ToolInspectorProps {
  currentStep: Step;
  toolLayout: 'columns' | 'stacked';
  setToolLayout: (layout: 'columns' | 'stacked' | ((prev: 'columns' | 'stacked') => 'columns' | 'stacked')) => void;
  openForkModal: (step: Step, toolName?: string, defaultOutput?: any, defaultSteering?: string) => void;
  copiedKey: string | null;
  copyToClipboard: (text: string, key: string) => void;
}

export const ToolInspector: React.FC<ToolInspectorProps> = ({
  currentStep,
  toolLayout,
  setToolLayout,
  openForkModal,
  copiedKey,
  copyToClipboard
}) => {
  return (
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
  );
};
