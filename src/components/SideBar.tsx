/** Side bar: explorer, search, pipeline, debug and preferences views. */

import { useIde, type RightTab } from '../state/IdeContext';

function gotoLine(line: number) {
  window.dispatchEvent(new CustomEvent<number>('lexicore:goto-line', { detail: line }));
}

export function SideBar() {
  const { state, dispatch, debugAction, stopDebug, toggleBreakpoint } = useIde();
  const { activity, settings } = state;

  if (activity === 'explorer') {
    return (
      <div className="side-view">
        <div className="side-header">
          <span>EXPLORER</span>
          <button className="mini-button" title="New file" onClick={() => dispatch({ type: 'newFile' })}>＋</button>
        </div>
        <div className="tree-folder">▾ MINILANG PROJECT</div>
        <ul className="file-list">
          {state.files.map((file) => (
            <li key={file.name} className="file-list-item">
              <button
                className={`file-item ${state.activeFile === file.name ? 'active' : ''}`}
                title={file.description}
                onClick={() => dispatch({ type: 'openFile', name: file.name })}
              >
                <span className="file-icon">◆</span>
                <span className="file-name">{file.name}</span>
                {file.dirty && <span className="dirty-dot">•</span>}
              </button>
              <button
                className="file-delete"
                title={`Delete ${file.name}`}
                aria-label={`Delete ${file.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  dispatch({ type: 'deleteFile', name: file.name });
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="side-section-title">GETTING STARTED</div>
        <p className="side-hint">1. Open or edit a .min file. 2. Compile to inspect every phase. 3. Run or debug the real compiled program. Add or delete files as you wish.</p>
      </div>
    );
  }

  if (activity === 'search') {
    const query = state.searchQuery.trim().toLowerCase();
    const lines = state.source.split('\n');
    const sourceMatches = query
      ? lines.flatMap((text, index) =>
          text.toLowerCase().includes(query) ? [{ line: index + 1, text: text.trim() }] : [],
        )
      : [];
    const diagnosticMatches = query
      ? state.compileData?.diagnostics.filter((item) =>
          `${item.code} ${item.message}`.toLowerCase().includes(query),
        ) ?? []
      : [];

    return (
      <div className="side-view">
        <div className="side-header"><span>SEARCH</span></div>
        <div className="search-box">
          <input
            value={state.searchQuery}
            placeholder="Search source and diagnostics"
            onChange={(event) => dispatch({ type: 'setSearch', query: event.target.value })}
          />
        </div>
        {query && (
          <>
            <div className="side-section-title">SOURCE ({sourceMatches.length})</div>
            <ul className="result-list">
              {sourceMatches.map((match) => (
                <li key={match.line}>
                  <button onClick={() => gotoLine(match.line)}>
                    <span className="result-line">{match.line}</span> {match.text || '(empty)'}
                  </button>
                </li>
              ))}
            </ul>
            <div className="side-section-title">PROBLEMS ({diagnosticMatches.length})</div>
            <ul className="result-list">
              {diagnosticMatches.map((item, index) => (
                <li key={`${item.code}-${index}`}>
                  <button onClick={() => gotoLine(item.span.start_line)}>
                    <span className={`sev ${item.severity}`}>●</span> {item.code} — {item.message}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  if (activity === 'compiler') {
    const phases = state.compileData?.phases;
    const target: Record<string, RightTab> = {
      lexical: 'tokens',
      syntax: 'parse',
      semantic: 'symbols',
      intermediate: 'tac',
      optimization: 'optimization',
    };
    return (
      <div className="side-view">
        <div className="side-header"><span>COMPILER PIPELINE</span></div>
        <p className="side-hint">Each stage runs the real compiler and is gated by the previous one. Click a stage to inspect its output.</p>
        <ul className="pipeline-list">
          {[
            ['lexical', 'Lexical analysis'],
            ['syntax', 'Parse Tree + AST'],
            ['semantic', 'Semantic analysis'],
            ['intermediate', 'IR / TAC'],
            ['optimization', 'Optimization'],
          ].map(([key, label]) => {
            const phase = phases?.[key];
            const status = phase?.status ?? 'idle';
            return (
              <li key={key}>
                <button onClick={() => dispatch({ type: 'setRightTab', tab: target[key] })}>
                  <span className={`phase-status ${status}`}>
                    {status === 'success' ? '✓' : status === 'error' ? '✕' : status === 'blocked' ? '⊘' : status === 'skipped' ? '–' : '○'}
                  </span>
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {state.compileData?.blocked && (
          <div className="blocked-note">Dependent phases were blocked by an earlier error.</div>
        )}
      </div>
    );
  }

  if (activity === 'debug') {
    const session = state.debugSession;
    const last = session?.snapshots.at(-1);
    return (
      <div className="side-view">
        <div className="side-header"><span>RUN AND DEBUG</span></div>
        <div className="debug-status-line">
          Session: <strong>{state.debugSessionId ? state.debugSessionId.slice(0, 8) : 'none'}</strong>
          <span className={`debug-state ${session?.status ?? 'idle'}`}>{session?.status ?? 'idle'}</span>
        </div>
        <div className="debug-tool-row">
          <button className="mini-button" onClick={() => void debugAction('step')}>Into</button>
          <button className="mini-button" onClick={() => void debugAction('step_over')}>Over</button>
          <button className="mini-button" onClick={() => void debugAction('step_out')}>Out</button>
          <button className="mini-button" onClick={() => void debugAction('continue')}>▶</button>
          <button className="mini-button" onClick={() => void stopDebug()}>■</button>
        </div>
        <div className="side-section-title">BREAKPOINTS ({state.breakpoints.length})</div>
        {state.breakpoints.length === 0 ? (
          <p className="side-hint">Click the gutter beside a line to add a breakpoint, or press F9 on the current line.</p>
        ) : (
          <ul className="result-list">
            {state.breakpoints.map((line) => (
              <li key={line}>
                <button onClick={() => void toggleBreakpoint(line)}>
                  <span className="bp-dot">●</span> Line {line} <span className="remove-hint">click to remove</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="side-section-title">STATE</div>
        <div className="kv-list">
          <div><span>pc</span><strong>{last?.pc ?? '-'}</strong></div>
          <div><span>opcode</span><strong>{last?.opcode ?? '-'}</strong></div>
          <div><span>call depth</span><strong>{last?.call_depth ?? 0}</strong></div>
          <div><span>steps</span><strong>{last?.state.steps ?? 0}</strong></div>
        </div>
        <div className="side-section-title">INPUT VALUES</div>
        <textarea
          className="inputs-area"
          placeholder="One INPUT value per line"
          value={state.inputs}
          onChange={(event) => dispatch({ type: 'setInputs', inputs: event.target.value })}
        />
      </div>
    );
  }

  const patch = (key: keyof typeof settings, value: boolean | string | number) =>
    dispatch({ type: 'patchSettings', patch: { [key]: value } as Partial<typeof settings> });

  return (
    <div className="side-view">
      <div className="side-header"><span>PREFERENCES</span></div>
      <div className="settings-form">
        <label>
          Theme
          <select value={settings.theme} onChange={(event) => patch('theme', event.target.value)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label>
          Density
          <select value={settings.density} onChange={(event) => patch('density', event.target.value)}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </label>
        <label>
          Font size
          <input
            type="number"
            min={10}
            max={22}
            value={settings.fontSize}
            onChange={(event) => patch('fontSize', Number(event.target.value))}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.wordWrap}
            onChange={(event) => patch('wordWrap', event.target.checked)}
          />
          Word wrap
        </label>
        <label>
          Backend URL
          <input
            value={settings.apiBaseUrl}
            onChange={(event) => patch('apiBaseUrl', event.target.value)}
          />
        </label>
        <div className="side-section-title">PANELS</div>
        <label className="check-row">
          <input type="checkbox" checked={settings.showSideBar} onChange={(e) => patch('showSideBar', e.target.checked)} />
          Explorer
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.showRightPanel} onChange={(e) => patch('showRightPanel', e.target.checked)} />
          Analysis
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.showBottomPanel} onChange={(e) => patch('showBottomPanel', e.target.checked)} />
          Bottom panel
        </label>
        <p className="side-hint">Layout preferences and your program files are stored inside this browser (in-IDE). Use File → Save (Ctrl+S) to save the active file to your PC/Desktop when you choose.</p>
      </div>
    </div>
  );
}
