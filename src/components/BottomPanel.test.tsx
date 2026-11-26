/** Terminal commands must call the real IDE actions, not a shell. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  state: {
    files: [{ name: 'baseline.min', description: 'Baseline', source: 'START\nSTOP\n', dirty: false }],
    activeFile: 'baseline.min',
    source: 'START\nSTOP\n',
    busy: null,
    backendReady: true,
    backendVersion: '0.1.0',
    compileData: null,
    runResult: null,
    debugSessionId: null,
    debugSession: null,
    log: [],
    bottomTab: 'terminal',
    settings: { showBottomPanel: true },
  },
  dispatch: vi.fn(),
  compile: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue(undefined),
  startDebug: vi.fn().mockResolvedValue(undefined),
  debugAction: vi.fn().mockResolvedValue(undefined),
  stopDebug: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../state/IdeContext', () => ({
  useIde: () => mocks,
}));

import { BottomPanel } from './BottomPanel';

function submit(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);
}

describe('Terminal commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('echoes typed commands and shows help without executing host code', () => {
    render(<BottomPanel />);
    const input = screen.getByRole('textbox', { name: 'Terminal command' }) as HTMLInputElement;

    submit(input, 'help');

    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'log',
      entry: { command: '❯', detail: 'help', level: 'input' },
    });
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'log',
      entry: expect.objectContaining({ command: 'help', level: 'info' }),
    });
  });

  it('runs the active file through the real run action and keeps the terminal open', async () => {
    render(<BottomPanel />);
    const input = screen.getByRole('textbox', { name: 'Terminal command' }) as HTMLInputElement;

    submit(input, 'run');

    await waitFor(() =>
      expect(mocks.run).toHaveBeenCalledWith({ keepTerminal: true, filename: undefined }),
    );
  });

  it('supports running a named project file', async () => {
    render(<BottomPanel />);
    const input = screen.getByRole('textbox', { name: 'Terminal command' }) as HTMLInputElement;

    submit(input, 'run baseline.min');

    await waitFor(() =>
      expect(mocks.run).toHaveBeenCalledWith({ keepTerminal: true, filename: 'baseline.min' }),
    );
  });

  it('reports unknown commands as errors', () => {
    render(<BottomPanel />);
    const input = screen.getByRole('textbox', { name: 'Terminal command' }) as HTMLInputElement;

    submit(input, 'rm -rf /');

    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'log',
      entry: expect.objectContaining({
        command: 'rm',
        level: 'error',
        detail: expect.stringContaining('Unknown command'),
      }),
    });
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
