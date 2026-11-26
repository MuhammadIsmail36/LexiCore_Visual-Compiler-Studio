/** Status bar with backend, compiler, diagnostics and editor state. */

import { useIde } from '../state/IdeContext';

export function StatusBar() {
  const { state, dispatch } = useIde();
  const diagnostics = [
    ...(state.compileData?.diagnostics ?? []),
    ...(state.runResult?.diagnostics ?? []),
  ];
  const errors = diagnostics.filter((item) => item.severity === 'error').length;
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length;
  const phaseStatus = state.compileData
    ? state.compileData.success
      ? 'compiled'
      : state.compileData.blocked
        ? 'blocked'
        : 'errors'
    : 'not compiled';

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className={`status-item ${state.backendReady ? 'ok' : 'bad'}`}>
          ● {state.backendReady ? 'Backend ready' : 'Backend offline'}
        </span>
        <span className={`status-item ${phaseStatus === 'compiled' ? 'ok' : phaseStatus === 'not compiled' ? '' : 'bad'}`}>
          ◇ {phaseStatus}
        </span>
        <button className="status-item link" onClick={() => dispatch({ type: 'setBottomTab', tab: 'problems' })}>
          ✕ {errors} <span className="muted">⚠ {warnings}</span>
        </button>
        {state.busy && <span className="status-item active">◌ {state.busy}</span>}
      </div>
      <div className="status-right">
        <button className="status-item link" onClick={() => dispatch({ type: 'setPalette', open: true })}>
          ⌘ Commands
        </button>
        <span className="status-item">Ln {state.cursor.line}, Col {state.cursor.column}</span>
        <span className="status-item">Spaces: 4</span>
        <span className="status-item">UTF-8</span>
        <span className="status-item">MiniLang v1.0</span>
        <button
          className="status-item link"
          title="Toggle theme"
          onClick={() => dispatch({ type: 'patchSettings', patch: { theme: state.settings.theme === 'dark' ? 'light' : 'dark' } })}
        >
          {state.settings.theme === 'dark' ? '◐ Dark' : '◑ Light'}
        </button>
        <button
          className="status-item link"
          title="Toggle density"
          onClick={() => dispatch({ type: 'patchSettings', patch: { density: state.settings.density === 'compact' ? 'comfortable' : 'compact' } })}
        >
          {state.settings.density === 'compact' ? '▤ Compact' : '▥ Comfortable'}
        </button>
      </div>
    </div>
  );
}
