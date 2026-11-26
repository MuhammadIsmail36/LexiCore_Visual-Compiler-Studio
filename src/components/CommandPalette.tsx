/** Searchable command palette (Ctrl+Shift+P). */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useIde } from '../state/IdeContext';

export function CommandPalette() {
  const { state, dispatch, compile, run, startDebug, debugAction, stopDebug, saveFile } = useIde();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(
    () => [
      { id: 'save', label: 'Save file to PC/Desktop', hint: 'Ctrl+S', run: () => void saveFile() },
      { id: 'compile', label: 'Compile program', hint: 'Ctrl+B', run: () => void compile() },
      { id: 'run', label: 'Run compiled program', hint: 'Ctrl+Enter', run: () => void run() },
      { id: 'debug', label: 'Start debug session', hint: 'F5', run: () => void startDebug() },
      { id: 'step', label: 'Debug: Step Into', hint: 'F11', run: () => void debugAction('step') },
      { id: 'over', label: 'Debug: Step Over', hint: 'F10', run: () => void debugAction('step_over') },
      { id: 'out', label: 'Debug: Step Out', hint: 'Shift+F11', run: () => void debugAction('step_out') },
      { id: 'continue', label: 'Debug: Continue', hint: 'F5', run: () => void debugAction('continue') },
      { id: 'stop', label: 'Debug: Stop session', hint: '', run: () => void stopDebug() },
      {
        id: 'theme',
        label: `Switch to ${state.settings.theme === 'dark' ? 'light' : 'dark'} theme`,
        hint: '',
        run: () => dispatch({ type: 'patchSettings', patch: { theme: state.settings.theme === 'dark' ? 'light' : 'dark' } }),
      },
      {
        id: 'density',
        label: `Use ${state.settings.density === 'compact' ? 'comfortable' : 'compact'} density`,
        hint: '',
        run: () => dispatch({ type: 'patchSettings', patch: { density: state.settings.density === 'compact' ? 'comfortable' : 'compact' } }),
      },
      { id: 'explorer', label: 'View: Show Explorer', hint: '', run: () => dispatch({ type: 'setActivity', activity: 'explorer' }) },
      { id: 'search', label: 'View: Search', hint: '', run: () => dispatch({ type: 'setActivity', activity: 'search' }) },
      { id: 'pipeline', label: 'View: Compiler Pipeline', hint: '', run: () => dispatch({ type: 'setActivity', activity: 'compiler' }) },
      { id: 'parse', label: 'View: Parse Tree', hint: '', run: () => dispatch({ type: 'setRightTab', tab: 'parse' }) },
      { id: 'ast', label: 'View: AST', hint: '', run: () => dispatch({ type: 'setRightTab', tab: 'ast' }) },
      { id: 'tac', label: 'View: TAC / IR', hint: '', run: () => dispatch({ type: 'setRightTab', tab: 'tac' }) },
      { id: 'problems', label: 'View: Problems', hint: '', run: () => dispatch({ type: 'setBottomTab', tab: 'problems' }) },
      { id: 'output', label: 'View: Output', hint: '', run: () => dispatch({ type: 'setBottomTab', tab: 'output' }) },
    ],
    [saveFile, compile, run, startDebug, debugAction, stopDebug, dispatch, state.settings.theme, state.settings.density],
  );

  const filtered = query
    ? commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  useEffect(() => {
    if (state.paletteOpen) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [state.paletteOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state.paletteOpen) {
        dispatch({ type: 'setPalette', open: false });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.paletteOpen, dispatch, saveFile]);

  if (!state.paletteOpen) return null;

  const choose = (runCommand: () => void) => {
    runCommand();
    dispatch({ type: 'setPalette', open: false });
  };

  return (
    <div className="palette-backdrop" onMouseDown={() => dispatch({ type: 'setPalette', open: false })}>
      <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          placeholder="Type a command…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filtered[0]) choose(filtered[0].run);
          }}
        />
        <ul>
          {filtered.map((command) => (
            <li key={command.id}>
              <button onClick={() => choose(command.run)}>
                <span>{command.label}</span>
                {command.hint && <kbd>{command.hint}</kbd>}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="empty-state">No matching commands.</li>}
        </ul>
      </div>
    </div>
  );
}
