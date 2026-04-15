import React from 'react';
import '@/App.css';
import CodeEditor from '@/components/CodeEditor';
import ExplanationPanel from '@/components/ExplanationPanel';
import MemoryVisualization from '@/components/MemoryVisualization';
import StepTimeline from '@/components/StepTimeline';
import PlaybackControls from '@/components/PlaybackControls';
import useTraceStore from '@/store/traceStore';
import { Terminal, Warning, GraduationCap, Info } from '@phosphor-icons/react';

const ErrorBanner = () => {
  const compilationError = useTraceStore((s) => s.compilationError);
  const traceError = useTraceStore((s) => s.traceError);
  const error = compilationError || traceError;
  if (!error) return null;

  // Parse line numbers from GCC/Javac errors
  const lines = error.split('\n').filter(Boolean);

  return (
    <div data-testid="error-banner" className="fixed top-0 left-0 right-0 z-50 bg-red-950/95 border-b border-red-500/30 backdrop-blur-sm">
      <div className="px-4 py-2 max-h-40 overflow-y-auto">
        <div className="flex items-center gap-2 mb-1">
          <Warning size={14} className="text-red-400 shrink-0" weight="fill" />
          <span className="text-[10px] font-plex tracking-[0.15em] uppercase text-red-400">
            {compilationError ? 'Compilation Error' : 'Trace Error'}
          </span>
        </div>
        {lines.map((line, i) => {
          const match = line.match(/(?:program\.c|[A-Za-z_][A-Za-z0-9_]*\.java):(\d+)(?::\d+)?:\s*(error|warning):\s*(.*)/);
          if (match) {
            return (
              <div key={i} className="flex items-start gap-2 py-0.5">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                  match[2] === 'error' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  Line {match[1]}
                </span>
                <span className="text-xs font-mono text-red-300">{match[3]}</span>
              </div>
            );
          }
          return <pre key={i} className="text-xs font-mono text-red-300/70">{line}</pre>;
        })}
      </div>
    </div>
  );
};

const SupportedFeatures = () => (
  <div data-testid="supported-features" className="flex items-center gap-3 text-[10px] font-plex text-zinc-600">
    <Info size={12} className="text-zinc-600 shrink-0" />
    <span>Supports C + Java tracing (core control flow, stack, locals)</span>
  </div>
);

function App() {
  const beginnerMode = useTraceStore((s) => s.beginnerMode);
  const toggleBeginnerMode = useTraceStore((s) => s.toggleBeginnerMode);

  return (
    <div className="app-root dark">
      <ErrorBanner />

      {/* Header */}
      <header data-testid="app-header" className="app-header">
        <div className="flex items-center gap-2.5">
          <Terminal size={18} weight="bold" className="text-blue-400" />
          <h1 className="text-sm font-cabinet font-bold tracking-tight text-zinc-100">
            Code Tracer
          </h1>
          <SupportedFeatures />
        </div>
        <div className="flex items-center gap-3">
          <PlaybackControls />
          {/* Beginner mode toggle */}
          <button
            data-testid="beginner-mode-toggle"
            onClick={toggleBeginnerMode}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-plex font-medium transition-all duration-200 ${
              beginnerMode
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/30 hover:text-zinc-300 hover:border-zinc-600'
            }`}
          >
            <GraduationCap size={12} weight={beginnerMode ? 'fill' : 'regular'} />
            {beginnerMode ? 'Beginner' : 'Normal'}
          </button>
        </div>
      </header>

      {/* 4-Quadrant Grid: Editor | Memory, Explanation | Timeline */}
      <main data-testid="main-grid" className="app-grid">
        <div className="quadrant border-r border-b border-zinc-800/60">
          <CodeEditor />
        </div>
        <div className="quadrant border-b border-zinc-800/60">
          <MemoryVisualization />
        </div>
        <div className="quadrant border-r border-zinc-800/60">
          <ExplanationPanel />
        </div>
        <div className="quadrant">
          <StepTimeline />
        </div>
      </main>
    </div>
  );
}

export default App;
