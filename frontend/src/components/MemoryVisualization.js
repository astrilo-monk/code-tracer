import React, { useMemo } from 'react';
import useTraceStore from '@/store/traceStore';

function getChangedVarNames(steps, currentStep) {
  if (steps.length === 0 || currentStep === 0) return new Set();
  const curr = steps[currentStep];
  const prev = steps[currentStep - 1];
  if (!curr || !prev) return new Set();
  const prevMap = {};
  for (const v of prev.variables) prevMap[v.name] = v.value;
  const changed = new Set();
  for (const v of curr.variables) {
    if (prevMap[v.name] === undefined || prevMap[v.name] !== v.value) changed.add(v.name);
  }
  return changed;
}

const MemoryVisualization = () => {
  const steps = useTraceStore((s) => s.steps);
  const currentStep = useTraceStore((s) => s.currentStep);
  const currentState = steps[currentStep] || null;

  const changedVars = useMemo(() => getChangedVarNames(steps, currentStep), [steps, currentStep]);

  const variables = currentState?.variables || [];
  const heap = currentState?.heap || [];

  // Build pointer map: variable name -> address it points to
  const pointerTargets = useMemo(() => {
    const map = {};
    for (const v of variables) {
      if (v.type === 'pointer' && v.value && v.value !== '0x0') {
        map[v.name] = v.value;
      }
    }
    return map;
  }, [variables]);

  if (steps.length === 0) {
    return (
      <div data-testid="memory-visualization" className="h-full flex flex-col">
        <div className="px-4 py-2 border-b border-zinc-800/60">
          <span className="text-[10px] font-plex tracking-[0.2em] uppercase text-zinc-500">Memory</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-600 font-plex">
          Run code to visualize memory
        </div>
      </div>
    );
  }

  return (
    <div data-testid="memory-visualization" className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-zinc-800/60 flex items-center justify-between">
        <span className="text-[10px] font-plex tracking-[0.2em] uppercase text-zinc-500">Memory</span>
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Stack
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Pointer
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="flex gap-10">
          {/* Stack column */}
          <div className="flex-1">
            <div className="text-[10px] font-plex tracking-[0.2em] uppercase text-zinc-600 mb-3">Stack</div>
            <div className="space-y-2">
              {variables.map((v, i) => {
                const isChanged = changedVars.has(v.name);
                const isPointer = v.type === 'pointer';
                const targetAddr = pointerTargets[v.name];
                return (
                  <div
                    key={`${v.name}-${i}`}
                    data-testid={`mem-var-${v.name}`}
                    className={`mem-block transition-all duration-300 ${
                      isChanged ? 'mem-block-changed' : ''
                    } ${isPointer ? 'mem-block-pointer' : 'mem-block-normal'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="mem-block-name">{v.name}</span>
                        <span className="mem-block-type">{v.type}</span>
                      </div>
                      <span className={`mem-block-value ${isChanged ? 'mem-value-changed' : ''}`}>
                        {v.value || '?'}
                      </span>
                    </div>
                    {isPointer && targetAddr && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-500/70 font-mono">
                        <svg width="16" height="8" className="shrink-0">
                          <line x1="0" y1="4" x2="12" y2="4" stroke="#F59E0B" strokeWidth="1.5" opacity="0.6"/>
                          <polygon points="10,1 16,4 10,7" fill="#F59E0B" opacity="0.6"/>
                        </svg>
                        <span className="truncate">{targetAddr}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Heap column */}
          {heap.length > 0 && (
            <div className="flex-1">
              <div className="text-[10px] font-plex tracking-[0.2em] uppercase text-zinc-600 mb-3">Heap</div>
              <div className="space-y-2">
                {heap.map((h, i) => (
                  <div
                    key={`heap-${h.address}-${i}`}
                    data-testid={`mem-heap-${h.address}`}
                    className="mem-block mem-block-heap"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono text-emerald-400">{h.address}</span>
                      <span className="text-[9px] font-plex text-zinc-600">{h.type}</span>
                    </div>
                    {(h.fields || []).map((f, fi) => (
                      <div key={fi} className="flex items-center justify-between text-xs font-mono py-0.5 border-t border-zinc-800/30">
                        <span className="text-zinc-500">{f.name}</span>
                        <span className={f.value?.startsWith('0x') ? 'text-amber-400' : 'text-zinc-200'}>
                          {f.value || '?'}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemoryVisualization;
