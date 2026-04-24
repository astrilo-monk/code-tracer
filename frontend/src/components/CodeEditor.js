import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import useTraceStore from '@/store/traceStore';

const CodeEditor = () => {
  const editorRef = useRef(null);
  const decorationsRef = useRef([]);
  const language = useTraceStore((s) => s.language);
  const setLanguage = useTraceStore((s) => s.setLanguage);
  const code = useTraceStore((s) => s.code);
  const setCode = useTraceStore((s) => s.setCode);
  const steps = useTraceStore((s) => s.steps);
  const currentStep = useTraceStore((s) => s.currentStep);
  const isTracing = useTraceStore((s) => s.isTracing);
  const compilationError = useTraceStore((s) => s.compilationError);

  const currentState = steps[currentStep] || null;
  const activeLine = currentState?.line || 0;

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Define custom theme
    monaco.editor.defineTheme('ctrace-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A737D' },
        { token: 'keyword', foreground: '3B82F6' },
        { token: 'string', foreground: '10B981' },
        { token: 'number', foreground: 'F59E0B' },
        { token: 'type', foreground: '8B5CF6' },
      ],
      colors: {
        'editor.background': '#0C0C0E',
        'editor.foreground': '#FAFAFA',
        'editor.lineHighlightBackground': '#18181B',
        'editor.selectionBackground': '#3B82F633',
        'editorCursor.foreground': '#3B82F6',
        'editorLineNumber.foreground': '#52525B',
        'editorLineNumber.activeForeground': '#A1A1AA',
        'editor.inactiveSelectionBackground': '#27272A',
      },
    });
    monaco.editor.setTheme('ctrace-dark');
  };

  // Highlight active line
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const monaco = window.monaco;
    if (!monaco) return;

    if (activeLine <= 0) {
      // Clear decorations when no trace
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      return;
    }

    const newDecorations = [
      {
        range: new monaco.Range(activeLine, 1, activeLine, 1),
        options: {
          isWholeLine: true,
          className: 'active-line-decoration',
          glyphMarginClassName: 'active-line-glyph',
        },
      },
    ];

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );

    // Scroll to active line
    editor.revealLineInCenter(activeLine);
  }, [activeLine]);

  return (
    <div data-testid="code-editor-panel" className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-zinc-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-plex tracking-[0.2em] uppercase text-zinc-500">
            Source Code
          </span>
          {isTracing && (
            <span className="text-[10px] font-plex text-amber-400 animate-pulse">Tracing...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            data-testid="language-selector"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={isTracing}
            className="bg-zinc-900/70 border border-zinc-700/50 rounded px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 outline-none"
          >
            <option value="c">C</option>
            <option value="java">Java</option>
          </select>
          <span className="text-[10px] font-mono text-zinc-600">
            {language === 'java' ? 'Main.java' : 'program.c'}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language === 'java' ? 'java' : 'c'}
          value={code}
          onChange={(val) => setCode(val || '')}
          onMount={handleEditorDidMount}
          options={{
            fontSize: window.innerWidth < 768 ? 11 : 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            padding: { top: 8 },
            renderLineHighlight: 'none',
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'hidden',
            },
            readOnly: isTracing,
            wordWrap: 'on',
            automaticLayout: true,
          }}
          loading={
            <div className="h-full flex items-center justify-center text-zinc-600 text-sm font-plex">
              Loading editor...
            </div>
          }
        />
      </div>
    </div>
  );
};

export default CodeEditor;
