import React, { useMemo } from 'react';
import useTraceStore from '@/store/traceStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, Code, ArrowBendDownRight, ArrowBendUpLeft } from '@phosphor-icons/react';
import { getFrameScopedChanges, getExplanation, getTransitionMeta } from '@/lib/frameDiff';

const ExplanationPanel = () => {
  const steps = useTraceStore((s) => s.steps);
  const currentStep = useTraceStore((s) => s.currentStep);
  const beginnerMode = useTraceStore((s) => s.beginnerMode);
  const code = useTraceStore((s) => s.code);
  const currentState = steps[currentStep] || null;

  const explanation = useMemo(() => {
    if (!currentState) return null;
    const prev = currentStep > 0 ? steps[currentStep - 1] : null;
    return getExplanation(currentState, prev, code, beginnerMode);
  }, [currentState, currentStep, steps, code, beginnerMode]);

  const changedVars = useMemo(
    () => getFrameScopedChanges(steps, currentStep),
    [steps, currentStep],
  );

  const transition = useMemo(() => {
    if (!currentState) return null;
    const prev = currentStep > 0 ? steps[currentStep - 1] : null;
    return getTransitionMeta(currentState, prev);
  }, [currentState, currentStep, steps]);

  return (
    <div data-testid="explanation-panel" className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-zinc-800/60 flex items-center justify-between">
        <span className="text-[10px] font-plex tracking-[0.2em] uppercase text-zinc-500">
          {beginnerMode ? 'Explanation' : 'Step Details'}
        </span>
        {currentState && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">
              {currentState.func}()
            </span>
            <span className="text-[10px] font-mono text-zinc-600">
              L{currentState.line}
            </span>
            {(currentState.stack_frames?.length || 0) > 1 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">
                depth:{(currentState.stack_frames?.length || 1) - 1}
              </span>
            )}
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        {!currentState ? (
          <div className="p-4 text-sm text-zinc-600 font-plex flex flex-col items-center justify-center h-full gap-2">
            <BookOpen size={24} className="text-zinc-700" />
            Run code to see step-by-step explanations
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Function call banner */}
            {explanation?.isCall && (
              <div className="px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs font-plex text-emerald-300 flex items-center gap-2">
                <ArrowBendDownRight size={14} weight="bold" className="text-emerald-400 shrink-0" />
                <span>
                  Entering function <span className="font-mono font-semibold">{currentState.func}()</span>
                  {explanation.depth > 0 && <span className="text-emerald-400/60"> — depth {explanation.depth}</span>}
                  {transition?.isRecursive && <span className="text-emerald-400/60"> (recursive)</span>}
                </span>
              </div>
            )}

            {/* Function return banner */}
            {explanation?.isReturn && (
              <div className="px-3 py-2 rounded bg-violet-500/10 border border-violet-500/20 text-xs font-plex text-violet-300 flex items-center gap-2">
                <ArrowBendUpLeft size={14} weight="bold" className="text-violet-400 shrink-0" />
                <span>
                  Returned to <span className="font-mono font-semibold">{currentState.func}()</span>
                  <span className="text-violet-400/50"> — variables below are {currentState.func}()'s locals</span>
                </span>
              </div>
            )}

            {/* Current line — now clarifies "about to execute" */}
            <div data-testid="explanation-code-line">
              <div className="flex items-center gap-2 mb-1.5">
                <Code size={14} className="text-amber-400" />
                <span className="text-[10px] font-plex tracking-[0.15em] uppercase text-zinc-500">
                  {currentState.func}() — About to execute Line {currentState.line}
                </span>
              </div>
              <div className="bg-zinc-900/80 border border-zinc-800/50 rounded px-3 py-2">
                <code className="text-xs font-mono text-amber-300">
                  {explanation?.short || ''}
                </code>
              </div>
            </div>

            {/* Explanation */}
            {explanation?.detail && (
              <div data-testid="explanation-detail">
                <span className="text-[10px] font-plex tracking-[0.15em] uppercase text-zinc-500 mb-1.5 block">
                  {beginnerMode ? 'What Happens' : 'Changes'}
                </span>
                <p className="text-sm font-plex text-zinc-300 leading-relaxed">
                  {explanation.detail}
                </p>
              </div>
            )}

            {/* Updated variables — now frame-scoped */}
            {currentState.variables.length > 0 && (
              <div data-testid="explanation-variables">
                <span className="text-[10px] font-plex tracking-[0.15em] uppercase text-zinc-500 mb-1.5 block">
                  {explanation?.isCall ? `Variables (${currentState.func} scope)` :
                   explanation?.isReturn ? `Variables (restored ${currentState.func} scope)` :
                   'Variables'}
                </span>
                <div className="space-y-1">
                  {currentState.variables.map((v, i) => {
                    const isChanged = changedVars.has(v.name);
                    return (
                      <div
                        key={`${v.name}-${i}`}
                        data-testid={`explanation-var-${v.name}`}
                        className={`flex items-center justify-between px-3 py-1.5 rounded text-xs font-mono transition-all duration-300 ${
                          isChanged
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                            : 'bg-zinc-900/40 text-zinc-400'
                        }`}
                      >
                        <span className="text-blue-300">{v.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-600 text-[10px]">{v.type}</span>
                          <span className={isChanged ? 'text-amber-300 font-semibold' : 'text-zinc-300'}>
                            {v.value || '?'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default ExplanationPanel;
