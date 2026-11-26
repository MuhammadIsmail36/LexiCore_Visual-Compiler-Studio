/** Verify the tree viewer renders real parser output and supports interaction. */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TreeView } from './TreeView';
import { IdeProvider } from '../state/IdeContext';
import type { TreeNode } from '../api/types';

// Real parse-tree / AST shapes produced by the backend parser for `START STOP`.
const parseTree: TreeNode = {
  symbol: 'program',
  node_kind: 'nonterminal',
  production: 'program -> START stmt_list STOP',
  span: { start_line: 1, start_column: 1, end_line: 2, end_column: 5 },
  children: [
    {
      symbol: 'START',
      node_kind: 'terminal',
      token_kind: 'START',
      lexeme: 'START',
      span: { start_line: 1, start_column: 1, end_line: 1, end_column: 6 },
      children: [],
    },
    {
      symbol: 'stmt_list',
      node_kind: 'nonterminal',
      production: 'stmt_list -> ε',
      span: { start_line: 2, start_column: 1, end_line: 2, end_column: 1 },
      children: [],
    },
  ],
};

const ast: TreeNode = {
  kind: 'Program',
  span: { start_line: 1, start_column: 1, end_line: 2, end_column: 5 },
  body: [],
};

function renderTree(title: string, root: TreeNode | null) {
  return render(
    <IdeProvider>
      <TreeView title={title} root={root} />
    </IdeProvider>,
  );
}

describe('TreeView', () => {
  it('renders real parse tree nodes, productions and source spans', () => {
    renderTree('Parse Tree', parseTree);

    expect(screen.getByText('program')).toBeInTheDocument();
    expect(screen.getByText('program -> START stmt_list STOP')).toBeInTheDocument();
    expect(screen.getByText('START')).toBeInTheDocument();
    expect(screen.getByText('stmt_list')).toBeInTheDocument();
    // 1-based, end-exclusive source span from the real parser.
    expect(screen.getByText('1:1-6')).toBeInTheDocument();
  });

  it('renders a node-link diagram with positioned boxes and connector edges', () => {
    const { container } = renderTree('Parse Tree', parseTree);

    const boxes = Array.from(container.querySelectorAll('.tree-box')) as HTMLElement[];
    expect(boxes).toHaveLength(3);
    expect(container.querySelector('.tree-edges')).toBeInTheDocument();
    expect(container.querySelectorAll('.tree-edge')).toHaveLength(2);

    // Vertical (top-to-bottom) layout: root at depth 0 is topmost and centered over children.
    const rootBox = boxes[0];
    expect(rootBox.style.top).toBe('24px');
    expect(rootBox.style.left).toBe('108px');
    const childBoxes = boxes.slice(1);
    expect(childBoxes.every((box) => parseFloat(box.style.top) > parseFloat(rootBox.style.top))).toBe(true);

    expect(screen.getByTitle('Fit to view')).toBeInTheDocument();
    expect(screen.getByTitle('Export SVG')).toBeInTheDocument();
  });

  it('renders a distinct logical AST, not the parse tree', () => {
    renderTree('AST', ast);

    expect(screen.getByText('Program')).toBeInTheDocument();
    expect(screen.queryByText('program -> START stmt_list STOP')).not.toBeInTheDocument();
    expect(screen.queryByText('stmt_list')).not.toBeInTheDocument();
  });

  it('renders nested AST nodes that have only a span (real backend serialization)', () => {
    // Backend `to_json_value` strips `kind` from nested AST dataclasses.
    const realAst: TreeNode = {
      kind: 'Program',
      span: { start_line: 1, start_column: 1, end_line: 3, end_column: 5 },
      statements: [
        {
          name: 'a',
          type_name: 'INT',
          initializer: {
            value: 10,
            literal_type: 'INT',
            span: { start_line: 2, start_column: 9, end_line: 2, end_column: 11 },
          },
          array_size: null,
          span: { start_line: 2, start_column: 1, end_line: 2, end_column: 12 },
        },
      ],
    };

    renderTree('AST', realAst);

    expect(screen.getByText('Program')).toBeInTheDocument();
    expect(screen.getByText('Decl(a: INT)')).toBeInTheDocument();
    expect(screen.getByText('INT')).toBeInTheDocument();
    expect(screen.getByText('2:1-12')).toBeInTheDocument();
  });

  it('collapses and expands nodes', () => {
    renderTree('Parse Tree', parseTree);

    const programRow = screen.getByText('program').closest('.tree-row') as HTMLElement;
    const toggle = within(programRow).getByRole('button', { name: 'Collapse node' });
    fireEvent.click(toggle);

    expect(screen.queryByText('START')).not.toBeInTheDocument();

    const collapsed = screen.getByText('program').closest('.tree-row') as HTMLElement;
    fireEvent.click(within(collapsed).getByRole('button', { name: 'Expand node' }));
    expect(screen.getByText('START')).toBeInTheDocument();
  });

  it('filters nodes and shows the empty state when nothing compiles yet', () => {
    const { rerender } = renderTree('Parse Tree', parseTree);
    const filter = screen.getByPlaceholderText('Filter nodes') as HTMLInputElement;
    fireEvent.change(filter, { target: { value: 'stmt_list' } });
    expect(screen.queryByText('START')).not.toBeInTheDocument();
    expect(screen.getByText('stmt_list')).toBeInTheDocument();

    rerender(
      <IdeProvider>
        <TreeView title="Parse Tree" root={null} />
      </IdeProvider>,
    );
    expect(screen.getByText('Compile to generate this tree.')).toBeInTheDocument();
  });

  it('selects a node, inspects it and maps it back to source', () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');
    renderTree('Parse Tree', parseTree);

    fireEvent.click(screen.getByText('program'));
    expect(screen.getByText('Go to source')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Go to source'));
    const event = dispatchEvent.mock.calls
      .map((call) => call[0])
      .find((candidate) => candidate.type === 'lexicore:goto-line') as CustomEvent<number> | undefined;
    expect(event?.detail).toBe(1);
    dispatchEvent.mockRestore();
  });
});
