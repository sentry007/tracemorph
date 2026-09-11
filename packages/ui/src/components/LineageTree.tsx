import React, { useState } from 'react';
import { GitBranch, GitFork } from 'lucide-react';
import type { Run } from '../types';

interface LineageTreeProps {
  runs: Run[];
  activeRunId: string | null;
  setActiveRunId: (id: string) => void;
}

export const LineageTree: React.FC<LineageTreeProps> = ({
  runs,
  activeRunId,
  setActiveRunId
}) => {
  const [compareRunId, setCompareRunId] = useState<string | null>(null);

  // Group into root runs and child branches
  const rootRuns = runs.filter(r => !r.parent_run_id);
  const getChildren = (parentId: string) => runs.filter(r => r.parent_run_id === parentId);

  const activeRun = runs.find(r => r.id === activeRunId);
  const compareRun = runs.find(r => r.id === compareRunId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Interactive Execution Lineage & Branching DAG:
        </div>
        {compareRunId && (
          <button
            className="btn btn-ghost"
            style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--accent-rose)' }}
            onClick={() => setCompareRunId(null)}
          >
            Clear Compare
          </button>
        )}
      </div>

      {/* Side-by-Side Comparison Card if 2 runs are selected */}
      {activeRun && compareRun && activeRun.id !== compareRun.id && (
        <div
          className="card"
          style={{
            padding: '12px',
            borderColor: 'var(--accent-amber)',
            background: 'rgba(245, 158, 11, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-amber)' }}>
            <span>⚡ Run Delta Comparison</span>
            <span>{activeRun.name} vs {compareRun.name}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{activeRun.name}</div>
              <div>Steps: {activeRun.step_count || activeRun.steps?.length || 0}</div>
              <div>Tokens: {activeRun.total_tokens?.toLocaleString() || 0}</div>
              <div>Status: {activeRun.status}</div>
            </div>
            <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{compareRun.name}</div>
              <div>Steps: {compareRun.step_count || compareRun.steps?.length || 0}</div>
              <div>Tokens: {compareRun.total_tokens?.toLocaleString() || 0}</div>
              <div>Status: {compareRun.status}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tree Visualization */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {rootRuns.map(root => {
          const children = getChildren(root.id);
          const isRootActive = root.id === activeRunId;
          const isRootComparing = root.id === compareRunId;

          return (
            <div key={root.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Root Node */}
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: isRootActive ? 'var(--bg-active)' : 'var(--bg)',
                  border: `1.5px solid ${isRootActive ? 'var(--border-focus)' : 'var(--border)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setActiveRunId(root.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <GitBranch size={15} color="var(--accent-blue)" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {root.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {root.id} • {root.step_count || root.steps?.length || 0} steps • {root.total_tokens || 0} tokens
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '0.68rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCompareRunId(root.id);
                    }}
                    title="Compare with active run"
                  >
                    {isRootComparing ? 'Comparing' : 'Compare'}
                  </button>
                  <span
                    className={`badge ${
                      root.status === 'completed'
                        ? 'badge-emerald'
                        : root.status === 'failed'
                        ? 'badge-rose'
                        : 'badge-default'
                    }`}
                  >
                    {root.status}
                  </span>
                </div>
              </div>

              {/* Children Branches */}
              {children.length > 0 && (
                <div style={{ paddingLeft: '24px', borderLeft: '2px dashed var(--border-focus)', marginLeft: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {children.map(child => {
                    const isChildActive = child.id === activeRunId;
                    const isChildComparing = child.id === compareRunId;

                    return (
                      <div
                        key={child.id}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: isChildActive ? 'var(--bg-active)' : 'var(--bg-subtle)',
                          border: `1px solid ${isChildActive ? 'var(--accent-amber)' : 'var(--border)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setActiveRunId(child.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <GitFork size={13} color="var(--accent-amber)" />
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-main)' }}>
                              {child.name}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {child.id} • Forked from {root.id.slice(0, 10)}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '1px 6px', fontSize: '0.68rem' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompareRunId(child.id);
                            }}
                          >
                            {isChildComparing ? 'Comparing' : 'Compare'}
                          </button>
                          <span className="badge badge-amber">{child.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
