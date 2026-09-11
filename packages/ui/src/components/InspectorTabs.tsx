import React from 'react';
import {
  SlidersHorizontal,
  FileCode,
  Layers,
  GitBranch
} from 'lucide-react';
import type { Step, DiffReport, Run } from '../types';
import { LineageTree } from './LineageTree';

interface InspectorTabsProps {
  inspectorTab: 'diff' | 'raw' | 'memory' | 'branches';
  setInspectorTab: (tab: 'diff' | 'raw' | 'memory' | 'branches') => void;
  currentStep?: Step;
  diffReport: DiffReport | null;
  runs: Run[];
  activeRunId: string | null;
  setActiveRunId: (id: string) => void;
}

export const InspectorTabs: React.FC<InspectorTabsProps> = ({
  inspectorTab,
  setInspectorTab,
  currentStep,
  diffReport,
  runs,
  activeRunId,
  setActiveRunId
}) => {
  return (
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
          <LineageTree
            runs={runs}
            activeRunId={activeRunId}
            setActiveRunId={setActiveRunId}
          />
        )}
      </div>
    </div>
  );
};
