/** LexiCore IDE shell: menu/toolbar, activity bar, editor, analysis, terminal, status bar. */

import { useEffect } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ActivityBar } from './components/ActivityBar';
import { BottomPanel } from './components/BottomPanel';
import { CommandPalette } from './components/CommandPalette';
import { EditorArea } from './components/EditorArea';
import { SideBar } from './components/SideBar';
import { Splitter } from './components/Splitter';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { useIde } from './state/IdeContext';

export default function App() {
  const { state, dispatch, compile, run, debugAction, toggleBreakpoint } = useIde();
  const { settings } = state;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        dispatch({ type: 'setPalette', open: true });
        return;
      }
      if (ctrl && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        void compile();
        return;
      }
      if (ctrl && event.key === 'Enter') {
        event.preventDefault();
        void run();
        return;
      }
      switch (event.key) {
        case 'F5':
          event.preventDefault();
          void debugAction('continue');
          break;
        case 'F9':
          event.preventDefault();
          void toggleBreakpoint(state.cursor.line);
          break;
        case 'F10':
          event.preventDefault();
          void debugAction('step_over');
          break;
        case 'F11':
          event.preventDefault();
          if (event.shiftKey) void debugAction('step_out');
          else void debugAction('step');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compile, run, debugAction, toggleBreakpoint, dispatch, state.cursor.line]);

  const resizeSide = (delta: number) =>
    dispatch({
      type: 'patchSettings',
      patch: { sideBarWidth: Math.min(520, Math.max(160, settings.sideBarWidth + delta)) },
    });
  const resizeRight = (delta: number) =>
    dispatch({
      type: 'patchSettings',
      patch: { rightPanelWidth: Math.min(720, Math.max(240, settings.rightPanelWidth - delta)) },
    });
  const resizeBottom = (delta: number) =>
    dispatch({
      type: 'patchSettings',
      patch: { bottomPanelHeight: Math.min(600, Math.max(120, settings.bottomPanelHeight - delta)) },
    });

  return (
    <div className="ide" data-theme={settings.theme} data-density={settings.density}>
      <TitleBar />
      <div className="ide-main">
        <ActivityBar />
        {settings.showSideBar && (
          <>
            <aside className="side-bar" style={{ width: settings.sideBarWidth }}>
              <SideBar />
            </aside>
            <Splitter orientation="vertical" onResize={resizeSide} label="Resize explorer" />
          </>
        )}
        <main className="center-area">
          <EditorArea />
          {settings.showBottomPanel && (
            <>
              <Splitter orientation="horizontal" onResize={resizeBottom} label="Resize bottom panel" />
              <section className="bottom-area" style={{ height: settings.bottomPanelHeight }}>
                <BottomPanel />
              </section>
            </>
          )}
        </main>
        {settings.showRightPanel && (
          <>
            <Splitter orientation="vertical" onResize={resizeRight} label="Resize analysis panel" />
            <aside className="right-bar" style={{ width: settings.rightPanelWidth }}>
              <AnalysisPanel />
            </aside>
          </>
        )}
      </div>
      <StatusBar />
      <CommandPalette />
      {state.error && (
        <div className="error-toast" role="alert">
          <span className="toast-icon">!</span>
          <span>{state.error}</span>
          <button onClick={() => dispatch({ type: 'setError', error: null })}>×</button>
        </div>
      )}
    </div>
  );
}
