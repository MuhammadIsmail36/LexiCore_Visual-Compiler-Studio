/** Typed HTTP client for the real LexiCore backend (Phase 9). */

import type {
  ApiResponse,
  CompileData,
  DebugAction,
  DebugSessionData,
  HealthData,
  RunPayload,
  RunResultData,
  SourceRequest,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

export class LexiCoreApi {
  readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
      });
    } catch (cause) {
      throw new ApiError(
        `Cannot reach the LexiCore backend at ${this.baseUrl}. Start it with: python -m uvicorn lexicore.api:app --port 8000`,
        0,
        cause,
      );
    }

    const payload = (await response.json()) as ApiResponse<T>;
    if (!response.ok) {
      const detail = (payload as unknown as { detail?: string })?.detail;
      throw new ApiError(detail ?? `Request failed (${response.status})`, response.status, payload);
    }
    return payload;
  }

  private post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
  }

  health(): Promise<ApiResponse<HealthData>> {
    return this.request<HealthData>('/api/health');
  }

  lex(request: SourceRequest): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/api/compiler/lex', request);
  }

  parse(request: SourceRequest): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/api/compiler/parse', request);
  }

  semantic(request: SourceRequest): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/api/compiler/semantic', request);
  }

  compile(request: SourceRequest & { optimize?: boolean }): Promise<ApiResponse<CompileData>> {
    return this.post('/api/compiler/compile', request);
  }

  optimize(request: SourceRequest): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/api/compiler/optimize', request);
  }

  run(request: RunPayload): Promise<ApiResponse<RunResultData>> {
    return this.post('/api/compiler/run', request);
  }

  createDebugSession(
    request: SourceRequest & {
      inputs?: string[];
      breakpoints?: number[];
      source_lines?: number[];
    },
  ): Promise<ApiResponse<{ session: DebugSessionData }>> {
    return this.post('/api/debug/sessions', request);
  }

  debugAction(
    sessionId: string,
    action: DebugAction,
  ): Promise<ApiResponse<{ session: DebugSessionData }>> {
    return this.post(`/api/debug/sessions/${encodeURIComponent(sessionId)}/step`, { action });
  }

  debugContinue(sessionId: string): Promise<ApiResponse<{ session: DebugSessionData }>> {
    return this.request(`/api/debug/sessions/${encodeURIComponent(sessionId)}/continue`, {
      method: 'POST',
      body: '{}',
    });
  }

  getDebugSession(sessionId: string): Promise<ApiResponse<{ session: DebugSessionData }>> {
    return this.request(`/api/debug/sessions/${encodeURIComponent(sessionId)}`);
  }

  addBreakpoint(
    sessionId: string,
    breakpoint: { source_line?: number; pc?: number },
  ): Promise<ApiResponse<{ breakpoints: number[]; source_lines: number[] }>> {
    return this.post(
      `/api/debug/sessions/${encodeURIComponent(sessionId)}/breakpoints`,
      breakpoint,
    );
  }

  removeBreakpoint(
    sessionId: string,
    breakpoint: { source_line?: number; pc?: number },
  ): Promise<ApiResponse<{ breakpoints: number[]; source_lines: number[] }>> {
    const params = new URLSearchParams();
    if (breakpoint.source_line !== undefined) {
      params.set('source_line', String(breakpoint.source_line));
    }
    if (breakpoint.pc !== undefined) {
      params.set('pc', String(breakpoint.pc));
    }
    return this.request(
      `/api/debug/sessions/${encodeURIComponent(sessionId)}/breakpoints?${params.toString()}`,
      { method: 'DELETE' },
    );
  }

  deleteDebugSession(sessionId: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request(`/api/debug/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }
}
