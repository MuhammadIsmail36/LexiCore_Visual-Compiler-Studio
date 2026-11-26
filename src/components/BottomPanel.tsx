/** Bottom panel: Problems, Output, Terminal and Debug Console. */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useIde, type BottomTab, type LogEntry } from '../state/IdeContext';
import type { DebugAction, DebugSnapshotData, Diagnostic } from '../api/types';

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'debug', label: 'Debug Console' },
];

function gotoLine(line: number) {
  window.dispatchEvent(new CustomEvent<number>('lexicore:goto-line', { detail: line }));
}

export function BottomPanel() {
  const { state, dispatch, compile, run, startDebug, debugAction, stopDebug } = useIde();
  const [selectedSnapshot, setSelectedSnapshot] = useState<number | null>(null);
  const [terminalInput, setTerminalInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const terminalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.bottomTab === 'terminal') terminalRef.current?.focus();
  }, [state.bottomTab]);

  const appendLog = (command: string, detail: string, level: LogEntry['level'] = 'info') => {
    dispatch({ type: 'log', entry: { command, detail, level } });
  };

  const executeCommand = async (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    if (line.toLowerCase() !== 'clear') appendLog('❯', line, 'input');
    setHistory((previous) => [...previous, line]);
    setHistoryCursor(null);
    setTerminalInput('');

    const [commandRaw, ...args] = line.split(/\s+/);
    const command = commandRaw.toLowerCase();
    const filename = args[0];

    switch (command) {
      case 'help':
        appendLog(
          'help',
          'compile [file] · run [file] · debug [file] · debug step|over|out|continue|stop · open <file> · files · output · status · clear',
        );
        break;
      case 'clear':
        dispatch({ type: 'clearLog' });
        break;
      case 'compile':
        await compile({ keepTerminal: true, filename });
        break;
      case 'run':
        await run({ keepTerminal: true, filename });
        break;
      case 'debug': {
        const first = args[0]?.toLowerCase();
        if (!first) {
          await startDebug({ keepTerminal: true });
        } else if (['step', 'over', 'out', 'continue', 'stop'].includes(first)) {
          if (first === 'stop') {
            await stopDebug();
          } else {
            const action = (first === 'over' ? 'step_over' : first === 'out' ? 'step_out' : first) as DebugAction;
            await debugAction(action);
          }
        } else if (args.length === 1) {
          await startDebug({ keepTerminal: true, filename: args[0] });
        } else {
          appendLog('debug', `Unknown debug arguments: ${line}`, 'error');
        }
        break;
      }
      case 'open': {
        const file = args.length
          ? state.files.find((item) => item.name.toLowerCase() === args.join(' ').toLowerCase())
          : undefined;
        if (!file) {
          appendLog('open', `File not found: ${args.join(' ') || '(none)'}`, 'error');
        } else {
          dispatch({ type: 'openFile', name: file.name });
          appendLog('open', file.name, 'success');
        }
        break;
      }
      case 'files':
        appendLog('files', state.files.map((file) => file.name).join('  ·  '));
        break;
      case 'output':
        if (!state.runResult) {
          appendLog('output', 'No run output yet. Run a program first.');
        } else if (!state.runResult.output.length) {
          appendLog('output', 'Last run produced no output.');
        } else {
          state.runResult.output.forEach((text, index) => appendLog(`out ${index + 1}`, text));
        }
        break;
      case 'status':
        appendLog(
          'status',
          `backend ${state.backendVersion} (${state.backendReady ? 'ready' : 'offline'}) · ${state.activeFile} · ${state.files.length} files · ${state.debugSessionId ? 'debug session active' : 'no debug session'} · ${state.busy ?? 'idle'}`,
        );
        break;
      default:
        appendLog(commandRaw, `Unknown command '${commandRaw}'. Type 'help' for available commands.`, 'error');
    }

    dispatch({ type: 'setBottomTab', tab: 'terminal' });
  };

  const handleTerminalKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      const next = historyCursor === null ? history.length - 1 : Math.max(0, historyCursor - 1);
      setHistoryCursor(next);
      setTerminalInput(history[next]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyCursor === null) return;
      const next = historyCursor + 1;
      if (next >= history.length) {
        setHistoryCursor(null);
        setTerminalInput('');
      } else {
        setHistoryCursor(next);
        setTerminalInput(history[next]);
      }
    }
  };

  const diagnostics: Diagnostic[] = [
    ...(state.compileData?.diagnostics ?? []),
    ...(state.runResult?.diagnostics ?? []),
  ];
  const errors = diagnostics.filter((item) => item.severity === 'error').length;
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length;
  const snapshots = state.debugSession?.snapshots ?? [];
  const active = snapshots.find((item) => item.index === selectedSnapshot) ?? snapshots.at(-1);

  return (
    <div className="bottom-panel">
      <div className="bottom-head">
        <div className="panel-tabs" role="tablist" aria-label="Bottom panel views">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={state.bottomTab === tab.id}
              className={state.bottomTab === tab.id ? 'active' : ''}
              onClick={() => dispatch({ type: 'setBottomTab', tab: tab.id })}
            >
              {tab.label}
              {tab.id === 'problems' && diagnostics.length > 0 && (
                <span className="tab-count">{errors + warnings}</span>
              )}
            </button>
          ))}
        </div>
        <div className="bottom-head-spacer" />
        {state.bottomTab === 'terminal' && (
          <button className="mini-button" onClick={() => dispatch({ type: 'clearLog' })}>Clear</button>
        )}
        {state.bottomTab === 'debug' && (
          <div className="debug-mini-controls">
            <button className="mini-button" onClick={() => void debugAction('step')}>Into</button>
            <button className="mini-button" onClick={() => void debugAction('step_over')}>Over</button>
            <button className="mini-button" onClick={() => void debugAction('step_out')}>Out</button>
            <button className="mini-button" onClick={() => void debugAction('continue')}>Continue</button>
            <button className="mini-button" onClick={() => void stopDebug()}>Stop</button>
          </div>
        )}
        <button
          className="mini-button"
          title="Hide panel"
          onClick={() => dispatch({ type: 'patchSettings', patch: { showBottomPanel: false } })}
        >
          ×
        </button>
      </div>

      <div className="bottom-body">
        {state.bottomTab === 'problems' && (
          diagnostics.length ? (
            <table className="data-table problems-table">
              <thead>
                <tr><th>Severity</th><th>Code</th><th>Message</th><th>Phase</th><th>Location</th></tr>
              </thead>
              <tbody>
                {diagnostics.map((item, index) => (
                  <tr key={`${item.code}-${index}`} onClick={() => gotoLine(item.span.start_line)}>
                    <td><span className={`sev ${item.severity}`}>●</span> {item.severity}</td>
                    <td><code>{item.code}</code></td>
                    <td>
                      {item.message}
                      {item.hint && <span className="hint-text"> — {item.hint}</span>}
                    </td>
                    <td>{item.phase}</td>
                    <td>
                      <button className="link-button" onClick={(event) => { event.stopPropagation(); gotoLine(item.span.start_line); }}>
                        {item.span.start_line}:{item.span.start_column}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              {state.compileData ? 'No problems detected.' : 'Compile to see diagnostics.'}
            </div>
          )
        )}

        {state.bottomTab === 'output' && (
          state.runResult ? (
            <div className="output-view">
              <div className="output-meta">
                {state.runResult.halted ? 'Program halted' : 'Program stopped'} · {state.runResult.steps} steps ·
                {state.runResult.success ? ' success' : ' with errors'}
              </div>
              {state.runResult.output.length ? (
                <pre className="output-lines">
                  {state.runResult.output.map((line, index) => (
                    <div key={index}><span className="output-index">{index + 1}</span>{line}</div>
                  ))}
                </pre>
              ) : (
                <div className="empty-state">Program produced no output.</div>
              )}
            </div>
          ) : (
            <div className="empty-state">Run a compiled program to see its output.</div>
          )
        )}

        {state.bottomTab === 'terminal' && (
          <div className="terminal-view">
            {state.log.length === 0 && (
              <div className="terminal-line muted">
                LexiCore terminal ready. Type <code>help</code> for commands, or <code>run</code> to execute the active file.
              </div>
            )}
            {state.log.map((entry) =>
              entry.level === 'input' ? (
                <div className="terminal-line input" key={entry.id}>
                  <span className="terminal-time">[{entry.time}]</span>
                  <span className="terminal-prompt-inline">lexi&gt;</span>
                  <span>{entry.detail}</span>
                </div>
              ) : (
                <div className={`terminal-line ${entry.level}`} key={entry.id}>
                  <span className="terminal-time">[{entry.time}]</span>
                  <span className="terminal-command">lexi {entry.command}</span>
                  <span>{entry.detail}</span>
                </div>
              ),
            )}
            <form
              className="terminal-input-row"
              onSubmit={(event) => {
                event.preventDefault();
                void executeCommand(terminalInput);
              }}
            >
              <span className="terminal-prompt-inline">lexi&gt;</span>
              <input
                ref={terminalRef}
                aria-label="Terminal command"
                value={terminalInput}
                onChange={(event) => setTerminalInput(event.target.value)}
                onKeyDown={handleTerminalKeys}
                disabled={state.busy !== null}
                placeholder={state.busy ? `${state.busy}…` : "Type 'help' and press Enter"}
                autoComplete="off"
                spellCheck={false}
              />
            </form>
          </div>
        )}

        {state.bottomTab === 'debug' && (
          snapshots.length ? (
            <div className="debug-console">
              <table className="data-table snapshots-table">
                <thead>
                  <tr><th>#</th><th>Event</th><th>pc</th><th>Opcode</th><th>Line</th><th>Depth</th><th>Steps</th></tr>
                </thead>
                <tbody>
                  {snapshots.map((snap: DebugSnapshotData) => (
                    <tr
                      key={snap.index}
                      className={active?.index === snap.index ? 'selected' : ''}
                      onClick={() => setSelectedSnapshot(snap.index)}
                    >
                      <td>{snap.index}</td>
                      <td>{snap.event}</td>
                      <td>{snap.pc}</td>
                      <td><code>{snap.opcode ?? '—'}</code></td>
                      <td>
                        {snap.span ? (
                          <button className="link-button" onClick={(event) => { event.stopPropagation(); gotoLine(snap.span!.start_line); }}>
                            {snap.span.start_line}
                          </button>
                        ) : '—'}
                      </td>
                      <td>{snap.call_depth}</td>
                      <td>{snap.state.steps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {active && (
                <div className="debug-state-pane">
                  <div className="section-label">
                    SNAPSHOT {active.index} STATE
                    <span className="count-chip">output: {active.state.output.join(' | ') || '—'}</span>
                  </div>
                  <pre className="json-view">{JSON.stringify(active.state, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">Start a debug session to see real interpreter snapshots.</div>
          )
        )}
      </div>
    </div>
  );
}
