/** Branding, menu bar and compile/run/debug toolbar. */

import { useEffect, useRef, useState } from 'react';
import { useIde } from '../state/IdeContext';

type MenuName = 'File' | 'View' | 'Run' | 'Debug' | 'Help';

export function TitleBar() {
  const { state, compile, run, startDebug, debugAction, stopDebug, saveFile, dispatch } = useIde();
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const patch = (key: keyof typeof state.settings, value: boolean | string | number) =>
    dispatch({ type: 'patchSettings', patch: { [key]: value } });

  const runCommand = (command: () => void | Promise<void>) => {
    setOpenMenu(null);
    void command();
  };

  const menus: Record<MenuName, { label: string; action: () => void }[]> = {
    File: [
      { label: 'New MiniLang file', action: () => runCommand(() => dispatch({ type: 'newFile' })) },
      { label: 'Save to PC/Desktop (Ctrl+S)', action: () => runCommand(saveFile) },
      { label: 'Open baseline.min', action: () => runCommand(() => dispatch({ type: 'openFile', name: 'baseline.min' })) },
      { label: 'Open functions.min', action: () => runCommand(() => dispatch({ type: 'openFile', name: 'functions.min' })) },
    ],
    View: [
      { label: state.settings.showSideBar ? 'Hide Explorer' : 'Show Explorer', action: () => runCommand(() => patch('showSideBar', !state.settings.showSideBar)) },
      { label: state.settings.showRightPanel ? 'Hide Analysis' : 'Show Analysis', action: () => runCommand(() => patch('showRightPanel', !state.settings.showRightPanel)) },
      { label: state.settings.showBottomPanel ? 'Hide Bottom Panel' : 'Show Bottom Panel', action: () => runCommand(() => patch('showBottomPanel', !state.settings.showBottomPanel)) },
      { label: `Switch to ${state.settings.theme === 'dark' ? 'light' : 'dark'} theme`, action: () => runCommand(() => patch('theme', state.settings.theme === 'dark' ? 'light' : 'dark')) },
      { label: `Use ${state.settings.density === 'compact' ? 'comfortable' : 'compact'} density`, action: () => runCommand(() => patch('density', state.settings.density === 'compact' ? 'comfortable' : 'compact')) },
    ],
    Run: [
      { label: 'Compile (Ctrl+B)', action: () => runCommand(compile) },
      { label: 'Run (Ctrl+Enter)', action: () => runCommand(run) },
    ],
    Debug: [
      { label: 'Start Debug Session (F5)', action: () => runCommand(startDebug) },
      { label: 'Step Into (F11)', action: () => runCommand(() => debugAction('step')) },
      { label: 'Step Over (F10)', action: () => runCommand(() => debugAction('step_over')) },
      { label: 'Step Out (Shift+F11)', action: () => runCommand(() => debugAction('step_out')) },
      { label: 'Continue (F5)', action: () => runCommand(() => debugAction('continue')) },
      { label: 'Stop Debug Session', action: () => runCommand(stopDebug) },
    ],
    Help: [
      { label: 'Command Palette (Ctrl+Shift+P)', action: () => runCommand(() => dispatch({ type: 'setPalette', open: true })) },
      { label: 'About LexiCore', action: () => runCommand(() => dispatch({ type: 'setError', error: 'LexiCore — Visual Compiler and Execution Studio for MiniLang v1.0.' })) },
    ],
  };

  return (
    <div className="title-stack" ref={barRef}>
      <div className="menu-bar">
        <div className="brand">
          <span className="brand-mark">LX</span>
          <span className="brand-name">LexiCore</span>
          <span className="brand-sub">Visual Compiler Studio</span>
        </div>
        <nav className="menus" aria-label="Main menu">
          {(Object.keys(menus) as MenuName[]).map((name) => (
            <div className="menu-wrap" key={name}>
              <button
                className={`menu-button ${openMenu === name ? 'active' : ''}`}
                onClick={() => setOpenMenu(openMenu === name ? null : name)}
                aria-expanded={openMenu === name}
              >
                {name}
              </button>
              {openMenu === name && (
                <div className="menu-dropdown" role="menu">
                  {menus[name].map((item) => (
                    <button key={item.label} role="menuitem" onClick={item.action}>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="menu-spacer" />
        <div className={`backend-chip ${state.backendReady ? 'ready' : 'offline'}`}>
          <span className="status-dot" />
          {state.backendReady ? `Backend v${state.backendVersion}` : 'Backend offline'}
        </div>
      </div>

      <div className="toolbar">
        <button className="tool-button primary" onClick={() => void compile()} disabled={state.busy !== null}>
          Compile <kbd>Ctrl+B</kbd>
        </button>
        <button className="tool-button" onClick={() => void run()} disabled={state.busy !== null}>
          Run <kbd>Ctrl+Enter</kbd>
        </button>
        <span className="tool-separator" />
        <button className="tool-button" onClick={() => void startDebug()} disabled={state.busy !== null}>
          Debug
        </button>
        <button className="tool-button icon" title="Step Into (F11)" onClick={() => void debugAction('step')}>↓</button>
        <button className="tool-button icon" title="Step Over (F10)" onClick={() => void debugAction('step_over')}>↷</button>
        <button className="tool-button icon" title="Continue (F5)" onClick={() => void debugAction('continue')}>▶</button>
        <button className="tool-button icon" title="Stop" onClick={() => void stopDebug()}>■</button>
        <span className="tool-separator" />
        <button
          className="tool-button icon"
          title="Toggle command palette"
          onClick={() => dispatch({ type: 'setPalette', open: true })}
        >
          ⌘
        </button>
        <div className="toolbar-spacer" />
        {state.busy && <span className="busy-pill">{state.busy}…</span>}
        <span className="filename-pill">{state.activeFile}{state.stale ? ' • stale' : ''}</span>
      </div>
    </div>
  );
}
