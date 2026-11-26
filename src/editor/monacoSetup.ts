/** Local Monaco setup: MiniLang grammar, themes and worker configuration. */

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

// Bundle Monaco locally so the IDE works without a CDN.
self.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

loader.config({ monaco });

const KEYWORDS = [
  'START', 'STOP', 'IF', 'ELSE', 'ENDIF', 'WHILE', 'ENDWHILE',
  'FUNCTION', 'ENDFUNCTION', 'RETURN', 'PRINT', 'INPUT',
];

const TYPE_KEYWORDS = ['INT', 'FLOAT', 'STRING', 'BOOL'];

const LITERALS = ['TRUE', 'FALSE'];

const OPERATORS = ['AND', 'OR', 'NOT'];

let registered = false;

export function ensureMonacoReady(): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: 'minilang' });

  monaco.languages.setMonarchTokensProvider('minilang', {
    keywords: KEYWORDS,
    typeKeywords: TYPE_KEYWORDS,
    literals: LITERALS,
    logicalOperators: OPERATORS,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@blockcomment'],
        [/"/, 'string', '@quotedstring'],
        [/\b\d+\.\d+\b/, 'number.float'],
        [/\b\d+\b/, 'number'],
        [
          /[A-Za-z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@typeKeywords': 'type',
              '@literals': 'number.hex',
              '@logicalOperators': 'operator.keyword',
              '@default': 'identifier',
            },
          },
        ],
        [/[{}()[\]]/, '@brackets'],
        [/[=+\-*/%<>!]+/, 'operator'],
        [/[;,]/, 'delimiter'],
        [/\s+/, 'white'],
      ],
      blockcomment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
      quotedstring: [
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop'],
        [/./, 'string'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration('minilang', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  });

  monaco.languages.registerCompletionItemProvider('minilang', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions = [...KEYWORDS, ...TYPE_KEYWORDS, ...LITERALS, ...OPERATORS].map(
        (label) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: label,
          range,
        }),
      );
      return { suggestions };
    },
  });

  monaco.editor.defineTheme('lexicore-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'number.hex', foreground: '569CD6' },
      { token: 'operator.keyword', foreground: 'C586C0' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'string.escape', foreground: 'D7BA7D' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'number.float', foreground: 'B5CEA8' },
      { token: 'operator', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#0f141b',
      'editor.foreground': '#d7dce3',
      'editorLineNumber.foreground': '#4a5462',
      'editor.lineHighlightBackground': '#161d27',
      'editorCursor.foreground': '#4ea1ff',
      'editor.selectionBackground': '#264f78',
    },
  });

  monaco.editor.defineTheme('lexicore-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'AF00DB', fontStyle: 'bold' },
      { token: 'type', foreground: '267f99' },
      { token: 'number.hex', foreground: '0000ff' },
      { token: 'operator.keyword', foreground: 'AF00DB' },
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'string', foreground: 'a31515' },
      { token: 'string.escape', foreground: 'e50000' },
      { token: 'number', foreground: '098658' },
      { token: 'number.float', foreground: '098658' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1f2430',
      'editorLineNumber.foreground': '#9aa0aa',
    },
  });
}
