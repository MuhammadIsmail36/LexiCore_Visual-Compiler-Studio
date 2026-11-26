/** IDE state, real API orchestration and persisted layout preferences. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { ApiError, LexiCoreApi } from '../api/client';
import type {
  CompileData,
  DebugAction,
  DebugSessionData,
  ExecutionResultData,
  TreeNode,
} from '../api/types';
import { SAMPLES, type SampleFile } from '../data/samples';

const FILES_STORAGE_KEY = 'lexicore.projectFiles';

export type Theme = 'dark' | 'light';
export type Density = 'compact' | 'comfortable';
export type BottomTab = 'problems' | 'output' | 'terminal' | 'debug';
export type RightTab = 'parse' | 'ast' | 'tokens' | 'symbols' | 'tac' | 'optimization';
export type Activity = 'explorer' | 'search' | 'compiler' | 'debug' | 'settings';

export interface Settings {
  theme: Theme;
  density: Density;
  fontSize: number;
  wordWrap: boolean;
  showSideBar: boolean;
  showRightPanel: boolean;
  showBottomPanel: boolean;
  sideBarWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  apiBaseUrl: string;
}

export interface ProjectFile extends SampleFile {
  dirty: boolean;
}

export interface LogEntry {
  id: number;
  time: string;
  command: string;
  detail: string;
  level: 'info' | 'success' | 'error' | 'input';
}

export interface IdeState {
  files: ProjectFile[];
  activeFile: string;
  source: string;
  cursor: { line: number; column: number };
  busy: string | null;
  backendReady: boolean;
  backendVersion: string;
  compileData: CompileData | null;
  runResult: ExecutionResultData | null;
  debugSessionId: string | null;
  debugSession: DebugSessionData | null;
  breakpoints: number[];
  inputs: string;
  bottomTab: BottomTab;
  rightTab: RightTab;
  activity: Activity;
  log: LogEntry[];
  searchQuery: string;
  paletteOpen: boolean;
  selectedNode: TreeNode | null;
  error: string | null;
  stale: boolean;
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  density: 'compact',
  fontSize: 13,
  wordWrap: false,
  showSideBar: true,
  showRightPanel: true,
  showBottomPanel: true,
  sideBarWidth: 240,
  rightPanelWidth: 360,
  bottomPanelHeight: 220,
  apiBaseUrl: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('lexicore.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // ignore malformed persisted settings
  }
  return DEFAULT_SETTINGS;
}

interface PersistedProject {
  files: ProjectFile[];
  activeFile: string;
}

function loadProjectFiles(): { files: ProjectFile[]; activeFile: string; source: string } {
  const bundled = SAMPLES.map((sample) => ({ ...sample, dirty: false }));
  const fallback = { files: bundled, activeFile: bundled[0].name, source: bundled[0].source };
  try {
    const raw = localStorage.getItem(FILES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedProject>;
      const saved = Array.isArray(parsed.files) ? parsed.files : [];
      const files: ProjectFile[] = [];
      const seen = new Set<string>();
      // Use the saved project list as-is so user edits, additions, and deletions are respected.
      for (const item of saved) {
        if (!item || typeof item.name !== 'string' || seen.has(item.name)) continue;
        if (typeof item.source !== 'string') continue;
        files.push({
          name: item.name,
          source: item.source,
          description: typeof item.description === 'string' ? item.description : 'MiniLang file',
          dirty: Boolean(item.dirty),
        });
        seen.add(item.name);
      }
      if (files.length > 0) {
        const activeName =
          typeof parsed.activeFile === 'string' && files.some((file) => file.name === parsed.activeFile)
            ? parsed.activeFile
            : files[0].name;
        const active = files.find((file) => file.name === activeName) ?? files[0];
        return { files, activeFile: active.name, source: active.source };
      }
      // Saved project was empty/invalid; keep a usable file.
      return { files: fallback.files, activeFile: fallback.activeFile, source: fallback.source };
    }
  } catch {
    // ignore malformed persisted project files
  }
  return fallback;
}

const initialProject = loadProjectFiles();

const initialState: IdeState = {
  files: initialProject.files,
  activeFile: initialProject.activeFile,
  source: initialProject.source,
  cursor: { line: 1, column: 1 },
  busy: null,
  backendReady: false,
  backendVersion: '-',
  compileData: null,
  runResult: null,
  debugSessionId: null,
  debugSession: null,
  breakpoints: [],
  inputs: '',
  bottomTab: 'problems',
  rightTab: 'parse',
  activity: 'explorer',
  log: [],
  searchQuery: '',
  paletteOpen: false,
  selectedNode: null,
  error: null,
  stale: false,
  settings: loadSettings(),
};

type Action =
  | { type: 'setSource'; source: string }
  | { type: 'openFile'; name: string }
  | { type: 'newFile' }
  | { type: 'deleteFile'; name: string }
  | { type: 'markSaved'; name: string }
  | { type: 'setCursor'; line: number; column: number }
  | { type: 'setBusy'; busy: string | null }
  | { type: 'setBackend'; ready: boolean; version: string }
  | { type: 'setCompile'; data: CompileData | null }
  | { type: 'setRun'; data: ExecutionResultData | null }
  | { type: 'setDebug'; id: string | null; session: DebugSessionData | null }
  | { type: 'setDebugSession'; session: DebugSessionData }
  | { type: 'toggleBreakpoint'; line: number }
  | { type: 'setBottomTab'; tab: BottomTab }
  | { type: 'setRightTab'; tab: RightTab }
  | { type: 'setActivity'; activity: Activity }
  | { type: 'patchSettings'; patch: Partial<Settings> }
  | { type: 'log'; entry: Omit<LogEntry, 'id' | 'time'> }
  | { type: 'clearLog' }
  | { type: 'setError'; error: string | null }
  | { type: 'setPalette'; open: boolean }
  | { type: 'selectNode'; node: TreeNode | null }
  | { type: 'setInputs'; inputs: string }
  | { type: 'setSearch'; query: string };

let logSequence = 0;

function reducer(state: IdeState, action: Action): IdeState {
  switch (action.type) {
    case 'setSource':
      return {
        ...state,
        source: action.source,
        stale: true,
        files: state.files.map((file) =>
          file.name === state.activeFile ? { ...file, source: action.source, dirty: true } : file,
        ),
      };
    case 'openFile': {
      const file = state.files.find((item) => item.name === action.name);
      if (!file) return state;
      return { ...state, activeFile: file.name, source: file.source, stale: true };
    }
    case 'newFile': {
      let index = state.files.length + 1;
      while (state.files.some((file) => file.name === `untitled-${index}.min`)) index += 1;
      const name = `untitled-${index}.min`;
      const file: ProjectFile = { name, description: 'New MiniLang file', source: 'START\n\nSTOP\n', dirty: true };
      return { ...state, files: [...state.files, file], activeFile: name, source: file.source, stale: true };
    }
    case 'deleteFile': {
      const remaining = state.files.filter((file) => file.name !== action.name);
      let files = remaining;
      if (files.length === 0) {
        let index = 1;
        while (files.some((file) => file.name === `untitled-${index}.min`)) index += 1;
        files = [{ name: `untitled-${index}.min`, description: 'New MiniLang file', source: 'START\n\nSTOP\n', dirty: true }];
      }
      let activeFile = state.activeFile;
      let source = state.source;
      if (!files.some((file) => file.name === activeFile)) {
        const active = files[0];
        activeFile = active.name;
        source = active.source;
      } else {
        const active = files.find((file) => file.name === activeFile) ?? files[0];
        activeFile = active.name;
        source = active.source;
      }
      return { ...state, files, activeFile, source, stale: true, selectedNode: null };
    }
    case 'markSaved':
      return {
        ...state,
        files: state.files.map((file) =>
          file.name === action.name ? { ...file, dirty: false } : file,
        ),
      };
    case 'setCursor':
      return { ...state, cursor: { line: action.line, column: action.column } };
    case 'setBusy':
      return { ...state, busy: action.busy };
    case 'setBackend':
      return { ...state, backendReady: action.ready, backendVersion: action.version };
    case 'setCompile':
      return { ...state, compileData: action.data, selectedNode: null, stale: false };
    case 'setRun':
      return { ...state, runResult: action.data };
    case 'setDebug':
      return { ...state, debugSessionId: action.id, debugSession: action.session };
    case 'setDebugSession':
      return { ...state, debugSession: action.session };
    case 'toggleBreakpoint':
      return {
        ...state,
        breakpoints: state.breakpoints.includes(action.line)
          ? state.breakpoints.filter((line) => line !== action.line)
          : [...state.breakpoints, action.line].sort((a, b) => a - b),
      };
    case 'setBottomTab':
      return { ...state, bottomTab: action.tab, settings: { ...state.settings, showBottomPanel: true } };
    case 'setRightTab':
      return { ...state, rightTab: action.tab, settings: { ...state.settings, showRightPanel: true } };
    case 'setActivity':
      return { ...state, activity: action.activity };
    case 'patchSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'log':
      logSequence += 1;
      return {
        ...state,
        log: [
          ...state.log,
          {
            ...action.entry,
            id: logSequence,
            time: new Date().toLocaleTimeString(),
          },
        ],
      };
    case 'clearLog':
      return { ...state, log: [] };
    case 'setError':
      return { ...state, error: action.error };
    case 'setPalette':
      return { ...state, paletteOpen: action.open };
    case 'selectNode':
      return { ...state, selectedNode: action.node };
    case 'setInputs':
      return { ...state, inputs: action.inputs };
    case 'setSearch':
      return { ...state, searchQuery: action.query };
    default:
      return state;
  }
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

interface CommandOptions {
  /** Terminal commands keep the Terminal tab active instead of switching views. */
  keepTerminal?: boolean;
  /** Run/compile a specific project file instead of the current editor source. */
  filename?: string;
}

interface IdeContextValue {
  state: IdeState;
  api: LexiCoreApi;
  refreshHealth: () => Promise<void>;
  compile: (options?: CommandOptions) => Promise<void>;
  run: (options?: CommandOptions) => Promise<void>;
  startDebug: (options?: CommandOptions) => Promise<void>;
  debugAction: (action: DebugAction) => Promise<void>;
  stopDebug: () => Promise<void>;
  saveFile: () => Promise<void>;
  toggleBreakpoint: (line: number) => Promise<void>;
  dispatch: React.Dispatch<Action>;
}

const IdeContext = createContext<IdeContextValue | null>(null);

export function IdeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const api = useMemo(() => new LexiCoreApi(state.settings.apiBaseUrl), [state.settings.apiBaseUrl]);

  useEffect(() => {
    try {
      localStorage.setItem('lexicore.settings', JSON.stringify(state.settings));
    } catch {
      // storage may be unavailable; preferences simply will not persist
    }
  }, [state.settings]);

  useEffect(() => {
    try {
      // Programs are stored inside the IDE (browser) and not saved to the PC/desktop.
      const payload: PersistedProject = { files: state.files, activeFile: state.activeFile };
      localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // storage may be unavailable; files remain available in-memory for this session
    }
  }, [state.files, state.activeFile]);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await api.health();
      dispatch({
        type: 'setBackend',
        ready: response.data.ready,
        version: response.data.version,
      });
      dispatch({ type: 'setError', error: null });
    } catch (error) {
      dispatch({ type: 'setBackend', ready: false, version: '-' });
      dispatch({ type: 'setError', error: describeError(error) });
    }
  }, [api]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const compile = useCallback(
    async (options?: CommandOptions) => {
      const target = options?.filename
        ? state.files.find((file) => file.name.toLowerCase() === options.filename!.toLowerCase())
        : undefined;
      if (options?.filename && !target) {
        dispatch({
          type: 'log',
          entry: { command: 'compile', detail: `File not found: ${options.filename}`, level: 'error' },
        });
        return;
      }
      const source = target?.source ?? state.source;
      const filename = target?.name ?? state.activeFile;
      dispatch({ type: 'setBusy', busy: 'Compiling' });
      try {
        const response = await api.compile({ source, filename, optimize: true });
        dispatch({ type: 'setCompile', data: response.data });
        if (!options?.keepTerminal) dispatch({ type: 'setBottomTab', tab: 'problems' });
        dispatch({
          type: 'log',
          entry: {
            command: 'compile',
            detail: `${filename} — ${response.status}`,
            level: response.success ? 'success' : 'error',
          },
        });
        dispatch({ type: 'setError', error: null });
      } catch (error) {
        const message = describeError(error);
        dispatch({ type: 'setError', error: message });
        dispatch({ type: 'log', entry: { command: 'compile', detail: message, level: 'error' } });
      } finally {
        dispatch({ type: 'setBusy', busy: null });
      }
    },
    [api, state.activeFile, state.files, state.source],
  );

  const run = useCallback(
    async (options?: CommandOptions) => {
      const target = options?.filename
        ? state.files.find((file) => file.name.toLowerCase() === options.filename!.toLowerCase())
        : undefined;
      if (options?.filename && !target) {
        dispatch({
          type: 'log',
          entry: { command: 'run', detail: `File not found: ${options.filename}`, level: 'error' },
        });
        return;
      }
      const source = target?.source ?? state.source;
      const filename = target?.name ?? state.activeFile;
      dispatch({ type: 'setBusy', busy: 'Running' });
      try {
        const response = await api.run({
          source,
          filename,
          inputs: state.inputs.split('\n').filter((line) => line.length > 0),
          optimize: true,
        });
        dispatch({ type: 'setRun', data: response.data.execution });
        // The run endpoint returns the real pipeline it already executed, so the
        // analysis views populate from the same request — no second compile call.
        if (response.data.compile) {
          dispatch({ type: 'setCompile', data: response.data.compile });
        }
        if (!options?.keepTerminal) dispatch({ type: 'setBottomTab', tab: 'output' });
        dispatch({
          type: 'log',
          entry: {
            command: 'run',
            detail: `${filename} — ${response.data.execution.steps} steps, ${response.data.execution.output.length} output lines`,
            level: response.success ? 'success' : 'error',
          },
        });
        dispatch({ type: 'setError', error: null });
      } catch (error) {
        const message = describeError(error);
        dispatch({ type: 'setError', error: message });
        dispatch({ type: 'log', entry: { command: 'run', detail: message, level: 'error' } });
      } finally {
        dispatch({ type: 'setBusy', busy: null });
      }
    },
    [api, state.activeFile, state.files, state.inputs, state.source],
  );

  const startDebug = useCallback(
    async (options?: CommandOptions) => {
      const target = options?.filename
        ? state.files.find((file) => file.name.toLowerCase() === options.filename!.toLowerCase())
        : undefined;
      if (options?.filename && !target) {
        dispatch({
          type: 'log',
          entry: { command: 'debug', detail: `File not found: ${options.filename}`, level: 'error' },
        });
        return;
      }
      const source = target?.source ?? state.source;
      const filename = target?.name ?? state.activeFile;
      dispatch({ type: 'setBusy', busy: 'Starting debugger' });
      try {
        const response = await api.createDebugSession({
          source,
          filename,
          inputs: state.inputs.split('\n').filter((line) => line.length > 0),
          source_lines: state.breakpoints,
        });
        dispatch({
          type: 'setDebug',
          id: response.program_id,
          session: response.data.session,
        });
        if (!options?.keepTerminal) dispatch({ type: 'setBottomTab', tab: 'debug' });
        dispatch({ type: 'setActivity', activity: 'debug' });
        dispatch({
          type: 'log',
          entry: { command: 'debug', detail: `session ${response.program_id?.slice(0, 8)}`, level: 'success' },
        });
      } catch (error) {
        const message = describeError(error);
        dispatch({ type: 'setError', error: message });
        dispatch({ type: 'log', entry: { command: 'debug', detail: message, level: 'error' } });
      } finally {
        dispatch({ type: 'setBusy', busy: null });
      }
    },
    [api, state.activeFile, state.breakpoints, state.files, state.inputs, state.source],
  );

  const debugAction = useCallback(
    async (action: DebugAction) => {
      if (!state.debugSessionId) {
        await startDebug();
        return;
      }
      dispatch({ type: 'setBusy', busy: `Debug ${action}` });
      try {
        const response =
          action === 'continue'
            ? await api.debugContinue(state.debugSessionId)
            : await api.debugAction(state.debugSessionId, action);
        dispatch({ type: 'setDebugSession', session: response.data.session });
        dispatch({
          type: 'log',
          entry: {
            command: `debug ${action}`,
            detail: `status ${response.data.session.status}`,
            level: 'info',
          },
        });
      } catch (error) {
        const message = describeError(error);
        dispatch({ type: 'setError', error: message });
        dispatch({ type: 'log', entry: { command: `debug ${action}`, detail: message, level: 'error' } });
      } finally {
        dispatch({ type: 'setBusy', busy: null });
      }
    },
    [api, state.debugSessionId, startDebug],
  );

  const stopDebug = useCallback(async () => {
    if (!state.debugSessionId) return;
    try {
      await api.deleteDebugSession(state.debugSessionId);
      dispatch({ type: 'log', entry: { command: 'debug stop', detail: 'session released', level: 'info' } });
    } catch (error) {
      dispatch({ type: 'setError', error: describeError(error) });
    } finally {
      dispatch({ type: 'setDebug', id: null, session: null });
    }
  }, [api, state.debugSessionId]);

  const saveFile = useCallback(async () => {
    const filename = state.activeFile;
    const content = state.source;
    try {
      const picker = (window as unknown as { showSaveFilePicker?: (options?: unknown) => Promise<unknown> }).showSaveFilePicker;
      if (typeof picker === 'function') {
        const handle = (await picker({
          suggestedName: filename,
          types: [{ description: 'MiniLang source', accept: { 'text/plain': ['.min', '.txt'] } }],
        })) as { createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> };
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      dispatch({ type: 'markSaved', name: filename });
      dispatch({ type: 'log', entry: { command: 'save', detail: `Saved ${filename}`, level: 'success' } });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = describeError(error);
      dispatch({ type: 'setError', error: message });
      dispatch({ type: 'log', entry: { command: 'save', detail: message, level: 'error' } });
    }
  }, [state.activeFile, state.source]);

  const toggleBreakpoint = useCallback(
    async (line: number) => {
      const removing = state.breakpoints.includes(line);
      dispatch({ type: 'toggleBreakpoint', line });
      if (state.debugSessionId) {
        try {
          if (removing) {
            await api.removeBreakpoint(state.debugSessionId, { source_line: line });
          } else {
            await api.addBreakpoint(state.debugSessionId, { source_line: line });
          }
        } catch (error) {
          dispatch({ type: 'setError', error: describeError(error) });
        }
      }
    },
    [api, state.breakpoints, state.debugSessionId],
  );

  const value = useMemo<IdeContextValue>(
    () => ({
      state,
      api,
      refreshHealth,
      compile,
      run,
      startDebug,
      debugAction,
      stopDebug,
      saveFile,
      toggleBreakpoint,
      dispatch,
    }),
    [state, api, refreshHealth, compile, run, startDebug, debugAction, stopDebug, saveFile, toggleBreakpoint],
  );

  return <IdeContext.Provider value={value}>{children}</IdeContext.Provider>;
}

export function useIde(): IdeContextValue {
  const context = useContext(IdeContext);
  if (!context) throw new Error('useIde must be used inside <IdeProvider>.');
  return context;
}
