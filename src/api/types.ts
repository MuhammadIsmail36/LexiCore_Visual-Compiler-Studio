/** Types mirroring the FastAPI/Pydantic contracts (Phase 8). */

export type ApiStatus = 'ok' | 'error' | 'blocked';
export type PhaseStatus = 'success' | 'error' | 'blocked' | 'skipped';
export type DebugAction = 'step' | 'step_over' | 'step_out' | 'continue' | 'run_to_end';
export type Severity = 'error' | 'warning' | 'info';

export interface SourceSpan {
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
}

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  phase: string;
  span: SourceSpan;
  hint: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  status: ApiStatus;
  phase: string;
  diagnostics: Diagnostic[];
  data: T;
  message: string | null;
  program_id: string | null;
}

export interface HealthData {
  ready: boolean;
  version: string;
  compiler: string;
  language_version: string;
  phases: string[];
}

export interface TokenData {
  kind: string;
  lexeme: string;
  value: string | number | boolean | null;
  span: SourceSpan;
}

/** Generic tree node; concrete shape comes from the real parser's to_dict(). */
export interface TreeNode {
  kind?: string;
  symbol?: string;
  node_kind?: string;
  span?: SourceSpan;
  production?: string;
  children?: TreeNode[];
  [key: string]: unknown;
}

export interface SymbolParameterData {
  name: string;
  type_name: string;
  span: SourceSpan;
}

export interface SymbolData {
  name: string;
  category: string;
  declared_type: string;
  scope: string;
  declaration_span: SourceSpan;
  parameters: SymbolParameterData[];
  array_size: number | null;
  has_initializer: boolean;
  runtime_value: string | number | boolean | null;
  has_runtime_value: boolean;
}

export interface ScopeData {
  name: string;
  kind: string;
  depth: number;
  symbols: SymbolData[];
  children: ScopeData[];
}

export interface SymbolTableData {
  global_scope: ScopeData;
}

export interface TACLineData {
  index: number;
  text: string;
  opcode: string;
  span: SourceSpan;
}

export interface OptimizationStatsData {
  instructions_before: number;
  instructions_after: number;
  temps_before: number;
  temps_after: number;
  labels_before: number;
  labels_after: number;
  constants_folded: number;
  instructions_removed: number;
  passes: number;
  instructions_saved: number;
}

export interface PhaseRecordData {
  status: PhaseStatus;
  diagnostics: Diagnostic[];
  data: Record<string, unknown>;
  reason: string | null;
}

export interface CompileData {
  phases: Record<string, PhaseRecordData>;
  success: boolean;
  blocked: boolean;
  diagnostics: Diagnostic[];
}

export interface RuntimeVariable {
  name: string;
  scope: string;
  type_name: string;
  value: unknown;
  initialized: boolean;
}

export interface RuntimeArrayElement {
  type_name: string;
  value: string | number | boolean | null;
  initialized: boolean;
}

export interface RuntimeArrayData {
  name: string;
  scope: string;
  elements: RuntimeArrayElement[];
}

export interface RuntimeStateData {
  variables: RuntimeVariable[];
  arrays: RuntimeArrayData[];
  temps: Record<string, unknown>;
  output: string[];
  call_stack: unknown[];
  steps: number;
  halted: boolean;
}

export interface ExecutionResultData {
  output: string[];
  diagnostics: Diagnostic[];
  steps: number;
  state: RuntimeStateData;
  halted: boolean;
  success: boolean;
}

export interface DebugSnapshotData {
  index: number;
  pc: number;
  opcode: string | null;
  span: SourceSpan | null;
  event: string;
  state: RuntimeStateData;
  diagnostics: Diagnostic[];
  call_depth: number;
}

export interface DebugSessionData {
  snapshots: DebugSnapshotData[];
  final_result: ExecutionResultData | null;
  status: string;
  breakpoints_hit: number;
}

export interface SourceRequest {
  source: string;
  filename?: string;
}

export interface RunResultData {
  execution: ExecutionResultData;
  compile_success: boolean;
  /** Real compile pipeline produced internally by the run endpoint. */
  compile: CompileData;
}

export interface RunPayload extends SourceRequest {
  inputs?: string[];
  optimize?: boolean;
}

export interface DebugSessionPayload extends SourceRequest {
  inputs?: string[];
  breakpoints?: number[];
  source_lines?: number[];
}
