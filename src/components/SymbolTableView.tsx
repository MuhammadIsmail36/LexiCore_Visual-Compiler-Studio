/** Human-readable scoped symbol table: declarations plus real runtime values. */

import { useState, type ReactNode } from 'react';
import type {
  RuntimeArrayData,
  RuntimeStateData,
  RuntimeVariable,
  ScopeData,
  SymbolData,
  SymbolTableData,
} from '../api/types';

function flattenScopes(scope: ScopeData | undefined): ScopeData[] {
  if (!scope) return [];
  return [scope, ...scope.children.flatMap(flattenScopes)];
}

function runtimeKey(scope: string, name: string): string {
  return `${scope}\u0000${name}`;
}

function Value({ value, initialized }: { value: unknown; initialized?: boolean }) {
  if (initialized === false) return <em className="hint-text">uninitialized</em>;
  if (value === null || value === undefined || value === '') return <span className="hint-text">—</span>;
  if (typeof value === 'boolean') return <code>{value ? 'true' : 'false'}</code>;
  if (typeof value === 'number') return <code>{String(value)}</code>;
  return <span>{String(value)}</span>;
}

function symbolDetails(
  symbol: SymbolData,
  array: RuntimeArrayData | undefined,
): ReactNode {
  const details: ReactNode[] = [];
  if (symbol.parameters.length > 0) {
    details.push(
      <span key="params">
        params: {symbol.parameters.map((parameter) => `${parameter.name}: ${parameter.type_name}`).join(', ')}
      </span>,
    );
  }
  if (symbol.array_size !== null) details.push(<span key="size">size: {symbol.array_size}</span>);
  if (array) {
    details.push(
      <span key="array">
        runtime: [{array.elements.map((element) => String(element.value ?? '—')).join(', ')}]
      </span>,
    );
  }
  if (symbol.has_initializer) details.push(<span key="initializer">has initializer</span>);
  return details.length ? (
    <div className="symbol-details">{details.map((detail, index) => (
      <span className="symbol-detail" key={index}>{detail}</span>
    ))}</div>
  ) : (
    <span className="hint-text">—</span>
  );
}

interface SymbolTableViewProps {
  table: SymbolTableData | Record<string, unknown> | undefined;
  runtimeState?: RuntimeStateData | null;
  emptyMessage: string;
}

export function SymbolTableView({ table, runtimeState, emptyMessage }: SymbolTableViewProps) {
  const [showRaw, setShowRaw] = useState(false);

  const globalScope = (table as SymbolTableData | undefined)?.global_scope;
  const scopes = flattenScopes(globalScope as ScopeData | undefined);
  const symbolCount = scopes.reduce((total, scope) => total + scope.symbols.length, 0);

  const variables = new Map<string, RuntimeVariable>(
    (runtimeState?.variables ?? []).map((variable) => [runtimeKey(variable.scope, variable.name), variable]),
  );
  const arrays = new Map<string, RuntimeArrayData>(
    (runtimeState?.arrays ?? []).map((array) => [runtimeKey(array.scope, array.name), array]),
  );

  if (symbolCount === 0) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="symbol-view">
      <div className="data-toolbar">
        <span className="count-chip">{symbolCount} symbols · {scopes.length} scopes</span>
        <span className="count-chip hint-text">
          {runtimeState ? 'values from last Run/Debug' : 'Run to show runtime values'}
        </span>
        <button className="mini-button" onClick={() => setShowRaw((visible) => !visible)}>
          {showRaw ? 'Hide JSON' : 'Raw JSON'}
        </button>
      </div>

      {scopes.map((scope) => (
        <section className="scope-block" key={scope.name}>
          <div className="scope-heading">
            <code>{scope.name}</code>
            <span>{scope.kind} · depth {scope.depth} · {scope.symbols.length} symbols</span>
          </div>
          <table className="data-table symbol-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Type</th>
                <th>Declared</th>
                <th>Value</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {scope.symbols.map((symbol) => {
                const key = runtimeKey(symbol.scope, symbol.name);
                const variable = variables.get(key);
                const array = arrays.get(key);
                const initialized = variable?.initialized ?? (symbol.has_runtime_value ? true : undefined);
                const value = variable?.value ?? (symbol.has_runtime_value ? symbol.runtime_value : null);
                return (
                  <tr key={`${symbol.scope}-${symbol.name}`}>
                    <td><code>{symbol.name}</code></td>
                    <td>{symbol.category}</td>
                    <td><code>{symbol.declared_type}</code></td>
                    <td>
                      L{symbol.declaration_span.start_line}:{symbol.declaration_span.start_column}
                    </td>
                    <td><Value value={value} initialized={initialized} /></td>
                    <td>{symbolDetails(symbol, array)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {showRaw && (
        <details className="symbol-raw" open>
          <summary>Raw API response</summary>
          <pre className="json-view">{JSON.stringify(table, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
