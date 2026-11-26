/** Interactive, source-mapped Parse Tree / AST viewer rendered as a real node-link diagram. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useIde } from '../state/IdeContext';
import type { SourceSpan, TreeNode } from '../api/types';

const NODE_W = 148;
const NODE_H = 44;
const H_GAP = 20;
const V_GAP = 64;
const PADDING = 24;

function isNode(value: unknown): value is TreeNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  // Parse-tree nodes carry symbol/node_kind; nested AST nodes are dataclasses
  // serialised without `kind` but always keep their source span.
  return (
    typeof record.kind === 'string' ||
    typeof record.symbol === 'string' ||
    typeof record.node_kind === 'string' ||
    'span' in record
  );
}

function nodeChildren(node: TreeNode): TreeNode[] {
  if (Array.isArray(node.children)) {
    return node.children.filter(isNode);
  }
  const found: TreeNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'span' || key === 'kind' || key === 'symbol') continue;
    if (isNode(value)) found.push(value);
    else if (Array.isArray(value)) found.push(...value.filter(isNode));
  }
  return found;
}

function labelOf(node: TreeNode): string {
  if (node.symbol) return String(node.symbol);
  if (node.kind) return String(node.kind);
  // Nested AST nodes are plain field dicts; name them from their real fields.
  if (typeof node.type_name === 'string' && typeof node.name === 'string') {
    return `Decl(${node.name}: ${node.type_name})`;
  }
  if (typeof node.name === 'string') return `Ref(${node.name})`;
  if ('target' in node) return 'Assignment';
  if ('expression' in node) return 'Print';
  if (typeof node.operator === 'string') return `Binary(${node.operator})`;
  if (typeof node.literal_type === 'string') return String(node.literal_type);
  if ('condition' in node) return 'Condition';
  if (node.node_kind) return String(node.node_kind);
  if (node.lexeme) return String(node.lexeme);
  return 'node';
}

function detailOf(node: TreeNode): string {
  if (node.production) return String(node.production);
  if (node.node_kind) return String(node.node_kind);
  const details = Object.entries(node)
    .filter(([key]) => !['span', 'kind', 'symbol', 'node_kind', 'lexeme', 'name', 'type_name', 'operator', 'literal_type'].includes(key))
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => `${key}=${value}`);
  return details.join(' ');
}

function filterTree(node: TreeNode, query: string): TreeNode | null {
  if (!query) return node;
  const needle = query.toLowerCase();
  const label = `${labelOf(node)} ${detailOf(node)}`.toLowerCase();
  const children = nodeChildren(node)
    .map((child) => filterTree(child, query))
    .filter((child): child is TreeNode => child !== null);
  if (label.includes(needle) || children.length > 0) {
    return { ...node, children };
  }
  return null;
}

function spanText(span?: SourceSpan): string {
  if (!span) return '';
  if (span.start_line === span.end_line) {
    return `${span.start_line}:${span.start_column}-${span.end_column}`;
  }
  return `${span.start_line}:${span.start_column} → ${span.end_line}:${span.end_column}`;
}

interface PlacedNode {
  node: TreeNode;
  path: string;
  x: number;
  y: number;
  label: string;
  detail: string;
  span: string;
  terminal: boolean;
  hasChildren: boolean;
  collapsed: boolean;
}

interface Edge {
  from: string;
  to: string;
}

interface Layout {
  nodes: PlacedNode[];
  edges: Edge[];
  byPath: Map<string, PlacedNode>;
  width: number;
  height: number;
}

/** Tidy top-to-bottom tree layout: depth sets Y, leaves are spread along X. */
function layoutTree(root: TreeNode, collapsed: Set<string>): Layout {
  const nodes: PlacedNode[] = [];
  const edges: Edge[] = [];
  let leafIndex = 0;
  let maxDepth = 0;

  const walk = (node: TreeNode, path: string, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const allChildren = nodeChildren(node);
    const showChildren = collapsed.has(path) ? [] : allChildren;
    let x: number;

    if (showChildren.length === 0) {
      x = PADDING + leafIndex * (NODE_W + H_GAP);
      leafIndex += 1;
    } else {
      const childXs = showChildren.map((child, index) =>
        walk(child, `${path}.${index}`, depth + 1),
      );
      x = (childXs[0] + childXs[childXs.length - 1]) / 2;
      showChildren.forEach((_, index) => {
        edges.push({ from: path, to: `${path}.${index}` });
      });
    }

    nodes.push({
      node,
      path,
      x,
      y: PADDING + depth * (NODE_H + V_GAP),
      label: labelOf(node),
      detail: detailOf(node),
      span: spanText(node.span),
      terminal: node.node_kind === 'terminal',
      hasChildren: allChildren.length > 0,
      collapsed: collapsed.has(path),
    });
    return x;
  };

  walk(root, 'root', 0);
  nodes.sort((a, b) => a.y - b.y || a.x - b.x);

  return {
    nodes,
    edges,
    byPath: new Map(nodes.map((item) => [item.path, item])),
    width: Math.max(NODE_W + PADDING * 2, PADDING * 2 + leafIndex * (NODE_W + H_GAP) - H_GAP),
    height: PADDING * 2 + maxDepth * (NODE_H + V_GAP) + NODE_H,
  };
}

function edgePath(from: PlacedNode, to: PlacedNode): string {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;
  const middle = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] ?? character,
  );
}

function svgMarkup(layout: Layout): string {
  const edges = layout.edges
    .map(({ from, to }) => {
      const source = layout.byPath.get(from);
      const target = layout.byPath.get(to);
      return source && target
        ? `<path d="${edgePath(source, target)}" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.85"/>`
        : '';
    })
    .join('\n');

  const boxes = layout.nodes
    .map((item) => {
      const isChild = item.terminal;
      const fill = isChild ? '#059669' : '#2563eb';
      const stroke = isChild ? '#6ee7b7' : '#93c5fd';
      const labelFill = '#ffffff';
      const metaFill = isChild ? '#d1fae5' : '#dbeafe';
      const meta = item.span || item.detail;
      return [
        `<g>`,
        `<rect x="${item.x}" y="${item.y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
        `<text x="${item.x + 10}" y="${item.y + 19}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="700" fill="${labelFill}">${escapeXml(item.label.slice(0, 18))}</text>`,
        meta
          ? `<text x="${item.x + 10}" y="${item.y + 34}" font-family="Consolas, monospace" font-size="9" fill="${metaFill}">${escapeXml(meta.slice(0, 22))}</text>`
          : '',
        `</g>`,
      ].join('');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
<rect width="100%" height="100%" fill="#0b1220"/>
${edges}
${boxes}
</svg>`;
}

interface BoxProps {
  item: PlacedNode;
  selected: boolean;
  toggle: (path: string) => void;
  select: (node: TreeNode, path: string) => void;
}

function TreeBox({ item, selected, toggle, select }: BoxProps) {
  return (
    <div
      className={`tree-row tree-box ${item.terminal ? 'terminal' : ''} ${selected ? 'selected' : ''}`}
      style={{ left: item.x, top: item.y, width: NODE_W, height: NODE_H }}
      title={item.detail || item.label}
      onClick={() => select(item.node, item.path)}
    >
      <span className="tree-label" title={item.label}>{item.label}</span>
      {item.hasChildren && (
        <button
          className="tree-toggle"
          aria-label={item.collapsed ? 'Expand node' : 'Collapse node'}
          title={item.collapsed ? 'Expand node' : 'Collapse node'}
          onClick={(event) => {
            event.stopPropagation();
            toggle(item.path);
          }}
        >
          {item.collapsed ? '+' : '−'}
        </button>
      )}
      <span className="tree-node-meta">
        {item.detail && <span className="tree-detail" title={item.detail}>{item.detail}</span>}
        {item.span && <span className="tree-span">{item.span}</span>}
      </span>
    </div>
  );
}

interface Props {
  title: string;
  root: TreeNode | null;
  emptyMessage?: string;
}

export function TreeView({ title, root, emptyMessage = 'Compile to generate this tree.' }: Props) {
  const { state, dispatch, compile } = useIde();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useMemo(() => ({ active: false, x: 0, y: 0 }), []);

  const visible = useMemo(() => (root ? filterTree(root, query.trim()) : null), [root, query]);
  const layout = useMemo(
    () => (visible ? layoutTree(visible, collapsed) : null),
    [visible, collapsed],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const selected = state.selectedNode;

  useEffect(() => {
    setCollapsed(new Set());
    setSelectedPath(null);
  }, [root]);

  const fitToView = () => {
    const canvas = canvasRef.current;
    const current = layoutRef.current;
    if (!canvas || !current) return;
    const availableWidth = Math.max(1, canvas.clientWidth - PADDING * 2);
    const availableHeight = Math.max(1, canvas.clientHeight - PADDING * 2);
    const scale = Math.min(2, Math.max(0.1, Math.min(availableWidth / current.width, availableHeight / current.height)));
    setZoom(scale);
    setPan({ x: PADDING, y: PADDING });
  };

  useEffect(() => {
    if (layout) fitToView();
    // Refit only when a new tree arrives; user zoom is preserved while filtering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const select = (node: TreeNode, path: string) => {
    setSelectedPath(path);
    dispatch({ type: 'selectNode', node });
  };

  const download = (content: string, mime: string, filename: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    if (!root) return;
    download(
      JSON.stringify(root, null, 2),
      'application/json',
      `${title.toLowerCase().replace(/\s+/g, '-')}.json`,
    );
  };

  const exportSvg = () => {
    if (!layout) return;
    download(svgMarkup(layout), 'image/svg+xml', `${title.toLowerCase().replace(/\s+/g, '-')}.svg`);
  };

  const gotoSource = () => {
    if (selected?.span) {
      window.dispatchEvent(
        new CustomEvent<number>('lexicore:goto-line', { detail: selected.span.start_line }),
      );
    }
  };

  return (
    <div className="tree-view">
      <div className="tree-toolbar">
        <input
          className="tree-filter"
          placeholder="Filter nodes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="mini-button" title="Fit to view" onClick={fitToView}>⛶</button>
        <button className="mini-button" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.1, z - 0.15))}>−</button>
        <button className="mini-button" title="Zoom in" onClick={() => setZoom((z) => Math.min(2, z + 0.15))}>＋</button>
        <button className="mini-button" title="Export SVG" onClick={exportSvg}>⤓</button>
        <button className="mini-button" title="Export JSON" onClick={exportJson}>⇩</button>
      </div>
      <div
        className="tree-canvas"
        ref={canvasRef}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((z) => Math.min(2, Math.max(0.1, z - event.deltaY * 0.001)));
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          // Never steal clicks from nodes or controls rendered inside the canvas.
          if (target.closest('.tree-row') || target.closest('button') || target.closest('.empty-state')) return;
          drag.active = true;
          drag.x = event.clientX;
          drag.y = event.clientY;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.active) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          drag.x = event.clientX;
          drag.y = event.clientY;
          setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        }}
        onPointerUp={() => { drag.active = false; }}
        onPointerCancel={() => { drag.active = false; }}
      >
        {layout ? (
          <div
            className="tree-content"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg className="tree-edges" width={layout.width} height={layout.height}>
              {layout.edges.map(({ from, to }) => {
                const source = layout.byPath.get(from);
                const target = layout.byPath.get(to);
                return source && target ? (
                  <path key={`${from}-${to}`} className="tree-edge" d={edgePath(source, target)} />
                ) : null;
              })}
            </svg>
            {layout.nodes.map((item) => (
              <TreeBox
                key={item.path}
                item={item}
                selected={selectedPath === item.path}
                toggle={toggle}
                select={select}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div>{emptyMessage}</div>
            {!root && (
              <button className="mini-button empty-action" onClick={() => void compile()}>
                Compile now
              </button>
            )}
          </div>
        )}
      </div>
      {selected && (
        <div className="node-inspector">
          <div className="inspector-head">
            <strong>{labelOf(selected)}</strong>
            {selected.span && <span className="inspector-span">{spanText(selected.span)}</span>}
            <button className="mini-button" onClick={gotoSource}>Go to source</button>
          </div>
          <pre>{JSON.stringify(selected, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
