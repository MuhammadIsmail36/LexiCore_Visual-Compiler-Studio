/** Editor tabs and the real Monaco editor with MiniLang highlighting. */

import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';
import { useIde } from '../state/IdeContext';

export function EditorArea() {
  const { state, dispatch, toggleBreakpoint } = useIde();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsRef.current = editor.createDecorationsCollection();

    editor.onDidChangeCursorPosition((event) => {
      dispatch({
        type: 'setCursor',
        line: event.position.lineNumber,
        column: event.position.column,
      });
    });

    editor.onMouseDown((event) => {
      if (
        event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
        event.target.position
      ) {
        void toggleBreakpoint(event.target.position.lineNumber);
      }
    });
  };

  // Reflect real breakpoint and debug state as editor decorations.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const decorations = decorationsRef.current;
    if (!editor || !monaco || !decorations) return;

    const items: Monaco.editor.IModelDeltaDecoration[] = state.breakpoints.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'bp-glyph',
        glyphMarginHoverMessage: { value: `Breakpoint at line ${line}` },
      },
    }));

    const last = state.debugSession?.snapshots.at(-1);
    if (last?.span) {
      items.push({
        range: new monaco.Range(
          last.span.start_line,
          1,
          last.span.start_line,
          1,
        ),
        options: {
          isWholeLine: true,
          className: 'debug-line-highlight',
          linesDecorationsClassName: 'debug-line-arrow',
          glyphMarginClassName: 'debug-glyph',
          hoverMessage: { value: `Next: ${last.opcode ?? '—'} (pc ${last.pc})` },
        },
      });
    }
    decorations.set(items);
  }, [state.breakpoints, state.debugSession]);

  // Diagnostics -> squiggles on real source spans.
  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    const markers = (state.compileData?.diagnostics ?? []).map((item) => ({
      severity:
        item.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : item.severity === 'warning'
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
      message: `${item.code}: ${item.message}`,
      startLineNumber: item.span.start_line,
      startColumn: item.span.start_column,
      endLineNumber: Math.max(item.span.end_line, item.span.start_line),
      endColumn: Math.max(item.span.end_column, item.span.start_column + 1),
    }));
    monaco.editor.setModelMarkers(model, 'lexicore', markers);
  }, [state.compileData]);

  useEffect(() => {
    const goto = (event: Event) => {
      const line = (event as CustomEvent<number>).detail;
      editorRef.current?.revealLineInCenter(line);
      editorRef.current?.setPosition({ lineNumber: line, column: 1 });
      editorRef.current?.focus();
    };
    window.addEventListener('lexicore:goto-line', goto);
    return () => window.removeEventListener('lexicore:goto-line', goto);
  }, []);

  return (
    <div className="editor-area">
      <div className="tab-bar" role="tablist" aria-label="Open files">
        {state.files.map((file) => (
          <div
            key={file.name}
            role="tab"
            tabIndex={0}
            aria-selected={state.activeFile === file.name}
            className={`editor-tab ${state.activeFile === file.name ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'openFile', name: file.name })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                dispatch({ type: 'openFile', name: file.name });
              }
            }}
            title={file.description}
          >
            <span className="tab-icon">◆</span>
            <span className="tab-name">{file.name}</span>
            {file.dirty && <span className="dirty-dot">•</span>}
            <button
              type="button"
              className="tab-close"
              title={`Delete ${file.name}`}
              aria-label={`Delete ${file.name}`}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: 'deleteFile', name: file.name });
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-add" title="New file" onClick={() => dispatch({ type: 'newFile' })}>＋</button>
      </div>
      <div className="breadcrumbs">
        MINILANG PROJECT <span>›</span> {state.activeFile}
        {state.stale && <span className="stale-chip">results stale — recompile</span>}
      </div>
      <div className="editor-host">
        <Editor
          height="100%"
          language="minilang"
          path={state.activeFile}
          value={state.source}
          theme={state.settings.theme === 'dark' ? 'lexicore-dark' : 'lexicore-light'}
          onMount={onMount}
          onChange={(value) => dispatch({ type: 'setSource', source: value ?? '' })}
          loading={<div className="editor-loading">Loading editor…</div>}
          options={{
            fontSize: state.settings.fontSize,
            fontFamily: 'Consolas, "Cascadia Code", "Courier New", monospace',
            fontLigatures: true,
            wordWrap: state.settings.wordWrap ? 'on' : 'off',
            minimap: { enabled: false },
            glyphMargin: true,
            lineNumbers: 'on',
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            renderLineHighlight: 'all',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            padding: { top: 8, bottom: 8 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}
