/** End-to-end UI wiring: Compile must drive both tree views from real API data. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { IdeProvider } from './state/IdeContext';
import type { ApiResponse, CompileData, HealthData } from './api/types';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (value: string) => void }) => (
    <textarea aria-label="code-editor" value={value} onChange={(event) => onChange?.(event.target.value)} />
  ),
}));

const parseTree = {
  symbol: 'program',
  node_kind: 'nonterminal',
  production: 'program -> START stmt_list STOP',
  span: { start_line: 1, start_column: 1, end_line: 7, end_column: 5 },
  children: [],
};
const ast = {
  kind: 'Program',
  span: { start_line: 1, start_column: 1, end_line: 7, end_column: 5 },
  body: [],
};

const health: ApiResponse<HealthData> = {
  success: true,
  status: 'ok',
  phase: 'health',
  diagnostics: [],
  data: {
    ready: true,
    version: '1.0.0',
    compiler: 'LexiCore',
    language_version: '1.0',
    phases: ['lexical', 'syntax', 'semantic', 'intermediate', 'optimization'],
  },
  message: null,
  program_id: null,
};

const compileData: CompileData = {
  success: true,
  blocked: false,
  diagnostics: [],
  phases: {
    lexical: { status: 'success', diagnostics: [], data: { tokens: [] }, reason: null },
    syntax: { status: 'success', diagnostics: [], data: { parse_tree: parseTree, ast }, reason: null },
    semantic: { status: 'success', diagnostics: [], data: { symbol_table: {} }, reason: null },
    intermediate: { status: 'success', diagnostics: [], data: { tac: [] }, reason: null },
    optimization: { status: 'success', diagnostics: [], data: { tac: [], stats: {} }, reason: null },
  },
};

const compileResponse: ApiResponse<CompileData> = {
  success: true,
  status: 'ok',
  phase: 'compile',
  diagnostics: [],
  data: compileData,
  message: null,
  program_id: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('IDE API integration', () => {
  it('drives Parse Tree and AST from the real compile endpoint, never static results', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.endsWith('/api/health') ? health : compileResponse),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <IdeProvider>
        <App />
      </IdeProvider>,
    );

    // Initial state must be empty: no fabricated trees before compiling.
    expect(screen.queryByText('program')).not.toBeInTheDocument();
    expect(screen.queryByText('Program')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Backend v1.0.0')).toBeInTheDocument());

    const compileButton = screen.getAllByRole('button', { name: /Compile/ })[0];
    fireEvent.click(compileButton);

    await waitFor(() => expect(screen.getByText('program')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((call) => call[0].endsWith('/api/compiler/compile'))).toBe(true);

    // Parse Tree and AST are separate views; switching tabs changes the tree.
    const astTab = screen.getByRole('tab', { name: 'AST' });
    fireEvent.click(astTab);
    await waitFor(() => expect(screen.getByText('Program')).toBeInTheDocument());
    expect(screen.queryByText('program -> START stmt_list STOP')).not.toBeInTheDocument();
  });

  it('shows a clear status when the backend is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    render(
      <IdeProvider>
        <App />
      </IdeProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend offline')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the LexiCore backend');
  });
});
