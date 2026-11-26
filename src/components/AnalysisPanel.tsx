/** Right analysis explorer: trees, tokens, symbols, TAC and optimization. */

import { useState } from 'react';
import { useIde, type RightTab } from '../state/IdeContext';
import type { PhaseRecordData, TACLineData, TokenData, TreeNode } from '../api/types';
import { TreeView } from './TreeView';
import { SymbolTableView } from './SymbolTableView';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'parse', label: 'Parse Tree' },
  { id: 'ast', label: 'AST' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'symbols', label: 'Symbols' },
  { id: 'tac', label: 'TAC / IR' },
  { id: 'optimization', label: 'Optimize' },
];

function phaseData(
  phases: Record<string, PhaseRecordData> | undefined,
  name: string,
): Record<string, unknown> | null {
  return phases?.[name]?.data ?? null;
}

function EmptyAnalysis({ message }: { message: string }) {
  const { compile } = useIde();
  return (
    <div className="empty-state">
      <div>{message}</div>
      <button className="mini-button empty-action" onClick={() => void compile()}>
        Compile now
      </button>
    </div>
  );
}

function TacList({ lines }: { lines: TACLineData[] }) {
  return (
    <div className="tac-list">
      {lines.map((line) => (
        <div className="tac-row" key={line.index}>
          <span className="tac-index">{line.index}</span>
          <code>{line.text}</code>
          <span className="tac-span">L{line.span.start_line}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalysisPanel() {
  const { state, dispatch } = useIde();
  const [tokenFilter, setTokenFilter] = useState('');
  const phases = state.compileData?.phases;

  const syntax = phaseData(phases, 'syntax');
  const lexical = phaseData(phases, 'lexical');
  const semantic = phaseData(phases, 'semantic');
  const intermediate = phaseData(phases, 'intermediate');
  const optimization = phaseData(phases, 'optimization');

  const parseTree = (syntax?.parse_tree as TreeNode | null) ?? null;
  const ast = (syntax?.ast as TreeNode | null) ?? null;
  const tokens = (lexical?.tokens as TokenData[] | undefined) ?? [];
  const filteredTokens = tokenFilter
    ? tokens.filter((token) =>
        `${token.kind} ${token.lexeme}`.toLowerCase().includes(tokenFilter.toLowerCase()),
      )
    : tokens;
  const originalTac = (intermediate?.tac as TACLineData[] | undefined) ?? [];
  const optimizedTac = (optimization?.tac as TACLineData[] | undefined) ?? [];
  const stats = optimization?.stats as Record<string, number> | undefined;
  const snapshots = state.debugSession?.snapshots ?? [];
  const runtimeState =
    state.runResult?.state ?? snapshots[snapshots.length - 1]?.state ?? null;

  return (
    <div className="analysis-panel">
      <div className="panel-tabs" role="tablist" aria-label="Compiler analysis views">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={state.rightTab === tab.id}
            className={state.rightTab === tab.id ? 'active' : ''}
            onClick={() => dispatch({ type: 'setRightTab', tab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {state.rightTab === 'parse' && (
          <TreeView title="Parse Tree" root={parseTree} emptyMessage="Run does not produce trees. Compile to generate the concrete Parse Tree." />
        )}
        {state.rightTab === 'ast' && (
          <TreeView title="AST" root={ast} emptyMessage="Run does not produce trees. Compile to generate the logical AST." />
        )}
        {state.rightTab === 'tokens' && (
          <div className="data-panel">
            <div className="data-toolbar">
              <input
                placeholder="Filter tokens"
                value={tokenFilter}
                onChange={(event) => setTokenFilter(event.target.value)}
              />
              <span className="count-chip">{filteredTokens.length} tokens</span>
            </div>
            {filteredTokens.length ? (
              <table className="data-table">
                <thead>
                  <tr><th>#</th><th>Kind</th><th>Lexeme</th><th>Value</th><th>Line</th></tr>
                </thead>
                <tbody>
                  {filteredTokens.map((token, index) => (
                    <tr key={`${token.kind}-${index}`}>
                      <td>{index + 1}</td>
                      <td><code>{token.kind}</code></td>
                      <td>{token.lexeme || <em>ε</em>}</td>
                      <td>{token.value === null ? '—' : String(token.value)}</td>
                      <td>{token.span.start_line}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyAnalysis message="Run does not produce compiler artifacts. Compile to generate real tokens." />
            )}
          </div>
        )}
        {state.rightTab === 'symbols' && (
          <div className="data-panel">
            {semantic?.symbol_table ? (
              <SymbolTableView
                table={semantic.symbol_table as Record<string, unknown>}
                runtimeState={runtimeState}
                emptyMessage="No symbols were declared in this program."
              />
            ) : (
              <EmptyAnalysis message="Run does not produce compiler artifacts. Compile to inspect the scoped symbol table." />
            )}
          </div>
        )}
        {state.rightTab === 'tac' && (
          <div className="data-panel">
            <div className="section-label">BEFORE OPTIMIZATION</div>
            {originalTac.length ? <TacList lines={originalTac} /> : <EmptyAnalysis message="Run does not produce compiler artifacts. Compile to generate IR/TAC." />}
            {optimizedTac.length > 0 && (
              <>
                <div className="section-label">AFTER OPTIMIZATION</div>
                <TacList lines={optimizedTac} />
              </>
            )}
          </div>
        )}
        {state.rightTab === 'optimization' && (
          <div className="data-panel">
            {stats ? (
              <>
                <div className="stats-grid">
                  {Object.entries(stats).map(([key, value]) => (
                    <div className="stat-card" key={key}>
                      <span>{key.replace(/_/g, ' ')}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="section-label">OPTIMIZED TAC</div>
                <TacList lines={optimizedTac} />
              </>
            ) : (
              <EmptyAnalysis message="Run does not produce compiler artifacts. Compile to see optimizer statistics." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
