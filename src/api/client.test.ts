/** Verify the frontend client calls the real Phase 8 endpoints with typed payloads. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, LexiCoreApi } from './client';
import type { ApiResponse } from './types';

function envelope<T>(phase: string, data: T, status: ApiResponse<T>['status'] = 'ok'): ApiResponse<T> {
  return {
    success: status === 'ok',
    status,
    phase,
    diagnostics: [],
    data,
    message: null,
    program_id: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LexiCoreApi', () => {
  it('posts source to every single-phase compiler endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => envelope('compiler', { ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = new LexiCoreApi('http://test:8000');
    const request = { source: 'START\nSTOP\n', filename: 'test.min' };

    await api.lex(request);
    await api.parse(request);
    await api.semantic(request);
    await api.optimize(request);
    await api.compile({ ...request, optimize: true });

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      'http://test:8000/api/compiler/lex',
      'http://test:8000/api/compiler/parse',
      'http://test:8000/api/compiler/semantic',
      'http://test:8000/api/compiler/optimize',
      'http://test:8000/api/compiler/compile',
    ]);
    for (const call of fetchMock.mock.calls) {
      expect(call[1].method).toBe('POST');
      expect(JSON.parse(call[1].body)).toMatchObject(request);
    }
  });

  it('sends source and options to the run endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        envelope('compiler', {
          execution: {
            output: ['30'],
            diagnostics: [],
            steps: 12,
            halted: false,
            success: true,
            state: { variables: [], arrays: [], temps: {}, output: ['30'], call_stack: [], steps: 12, halted: false },
          },
          compile_success: true,
          compile: {
            phases: {
              syntax: { status: 'success', diagnostics: [], data: { parse_tree: { symbol: 'program' }, ast: { kind: 'Program' } }, reason: null },
            },
            success: true,
            blocked: false,
            diagnostics: [],
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = new LexiCoreApi();

    const result = await api.run({ source: 'START\nPRINT 30;\nSTOP\n', inputs: ['4'], optimize: true });

    expect(result.data.compile.phases.syntax.data.parse_tree).toEqual({ symbol: 'program' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/compiler/run');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      source: 'START\nPRINT 30;\nSTOP\n',
      inputs: ['4'],
      optimize: true,
    });
  });

  it('creates, steps, retrieves and deletes a debug session through real endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => envelope('debug', { session: { snapshots: [], final_result: null, status: 'paused', breakpoints_hit: 0 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const api = new LexiCoreApi();

    await api.createDebugSession({ source: 'START\nSTOP\n', breakpoints: [2], inputs: ['1'] });
    await api.debugAction('sess-1', 'step_over');
    await api.debugContinue('sess-1');
    await api.getDebugSession('sess-1');
    await api.addBreakpoint('sess-1', { source_line: 3 });
    await api.removeBreakpoint('sess-1', { source_line: 3 });
    await api.deleteDebugSession('sess-1');

    const calls = fetchMock.mock.calls;
    expect(calls[0][0]).toBe('http://127.0.0.1:8000/api/debug/sessions');
    expect(JSON.parse(calls[0][1].body)).toEqual({ source: 'START\nSTOP\n', breakpoints: [2], inputs: ['1'] });
    expect(calls[1][0]).toBe('http://127.0.0.1:8000/api/debug/sessions/sess-1/step');
    expect(JSON.parse(calls[1][1].body)).toEqual({ action: 'step_over' });
    expect(calls[2][0]).toBe('http://127.0.0.1:8000/api/debug/sessions/sess-1/continue');
    expect(calls[3][0]).toBe('http://127.0.0.1:8000/api/debug/sessions/sess-1');
    expect(calls[3][1].method).toBeUndefined();
    expect(calls[4][0]).toBe('http://127.0.0.1:8000/api/debug/sessions/sess-1/breakpoints');
    expect(calls[5][0]).toContain('source_line=3');
    expect(calls[5][1].method).toBe('DELETE');
    expect(calls[6][0]).toBe('http://127.0.0.1:8000/api/debug/sessions/sess-1');
    expect(calls[6][1].method).toBe('DELETE');
  });

  it('raises ApiError with a helpful message when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const api = new LexiCoreApi('http://test:8000');

    await expect(api.health()).rejects.toBeInstanceOf(ApiError);
    await expect(api.health()).rejects.toThrow('Cannot reach the LexiCore backend');
  });

  it('raises ApiError with the backend detail on HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Debug session not found.' }),
    }));
    const api = new LexiCoreApi();

    await expect(api.getDebugSession('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Debug session not found.',
    });
  });
});
