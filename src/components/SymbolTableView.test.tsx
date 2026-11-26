/** Symbol table must be readable as a table and show real runtime values. */

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SymbolTableView } from './SymbolTableView';
import type { RuntimeStateData, SymbolTableData } from '../api/types';

const span = { start_line: 2, start_column: 3, end_line: 2, end_column: 12 };

const table: SymbolTableData = {
  global_scope: {
    name: 'global',
    kind: 'global',
    depth: 0,
    symbols: [
      {
        name: 'count',
        category: 'variable',
        declared_type: 'INT',
        scope: 'global',
        declaration_span: span,
        parameters: [],
        array_size: null,
        has_initializer: true,
        runtime_value: null,
        has_runtime_value: false,
      },
    ],
    children: [
      {
        name: 'add',
        kind: 'function',
        depth: 1,
        symbols: [
          {
            name: 'a',
            category: 'parameter',
            declared_type: 'INT',
            scope: 'add',
            declaration_span: span,
            parameters: [],
            array_size: null,
            has_initializer: false,
            runtime_value: null,
            has_runtime_value: false,
          },
        ],
        children: [],
      },
    ],
  },
};

const runtimeState: RuntimeStateData = {
  variables: [
    { name: 'count', scope: 'global', type_name: 'INT', value: 10, initialized: true },
    { name: 'a', scope: 'add', type_name: 'INT', value: null, initialized: false },
  ],
  arrays: [],
  temps: {},
  output: [],
  call_stack: [],
  steps: 4,
  halted: true,
};

describe('SymbolTableView', () => {
  it('renders declarations grouped by scope instead of raw JSON', () => {
    render(<SymbolTableView table={table} runtimeState={null} emptyMessage="No symbols." />);

    expect(screen.getAllByRole('columnheader', { name: 'Name' })).toHaveLength(2);
    expect(screen.getByText('global')).toBeInTheDocument();
    expect(screen.getByText('add')).toBeInTheDocument();
    expect(screen.getAllByText('L2:3')).toHaveLength(2);
    expect(screen.queryByText(/"name": "count"/)).not.toBeInTheDocument();
  });

  it('overlays real runtime values and marks uninitialized variables', () => {
    render(<SymbolTableView table={table} runtimeState={runtimeState} emptyMessage="No symbols." />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('uninitialized')).toBeInTheDocument();
    expect(screen.getByText('values from last Run/Debug')).toBeInTheDocument();
  });

  it('keeps raw JSON available behind an explicit toggle', () => {
    render(<SymbolTableView table={table} runtimeState={null} emptyMessage="No symbols." />);

    expect(screen.queryByText(/"name": "count"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Raw JSON' }));
    expect(screen.getByText(/"name": "count"/)).toBeInTheDocument();
  });
});
