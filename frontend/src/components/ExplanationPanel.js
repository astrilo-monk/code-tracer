import React, { useMemo } from 'react';
import useTraceStore from '@/store/traceStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, Code } from '@phosphor-icons/react';

function humanizeOperators(expr) {
  if (!expr) return '';
  return expr
    .replace(/>=/g, ' is greater than or equal to ')
    .replace(/<=/g, ' is less than or equal to ')
    .replace(/==/g, ' is equal to ')
    .replace(/!=/g, ' is not equal to ')
    .replace(/&&/g, ' and ')
    .replace(/\|\|/g, ' or ')
    .replace(/>/g, ' is greater than ')
    .replace(/</g, ' is less than ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSimpleNumber(value) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function evaluateSimpleCondition(condition, variables) {
  const m = condition.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const leftName = m[1];
  const op = m[2];
  const right = Number(m[3]);

  const leftVar = variables.find((v) => v.name === leftName);
  const left = leftVar ? parseSimpleNumber(leftVar.value) : null;
  if (left === null) return null;

  if (op === '>') return left > right;
  if (op === '<') return left < right;
  if (op === '>=') return left >= right;
  if (op === '<=') return left <= right;
  if (op === '==') return left === right;
  if (op === '!=') return left !== right;
  return null;
}

function getLoopOrConditionContext(lineText, variables) {
  const ifMatch = lineText.match(/^if\s*\((.*)\)/);
  if (ifMatch) {
    const condition = ifMatch[1].trim();
    const result = evaluateSimpleCondition(condition, variables);
    return {
      kind: 'if',
      raw: condition,
      readable: humanizeOperators(condition),
      result,
    };
  }

  const whileMatch = lineText.match(/^while\s*\((.*)\)/);
  if (whileMatch) {
    const condition = whileMatch[1].trim();
    const result = evaluateSimpleCondition(condition, variables);
    return {
      kind: 'while',
      raw: condition,
      readable: humanizeOperators(condition),
      result,
    };
  }

  const forMatch = lineText.match(/^for\s*\(([^;]*);([^;]*);([^)]*)\)/);
  if (forMatch) {
    const init = forMatch[1].trim();
    const condition = forMatch[2].trim();
    const step = forMatch[3].trim();
    const result = evaluateSimpleCondition(condition, variables);
    return {
      kind: 'for',
      init,
      raw: condition,
      readable: humanizeOperators(condition),
      step,
      result,
    };
  }

  return null;
}

function getExplanation(step, prevStep, code, beginner) {
  const lines = code.split('\n');
  const lineText = (lines[step.line - 1] || '').trim();
  if (!lineText) return { short: 'Empty line', detail: '', changes: [] };
  const short = lineText;
  const changes = [];
  if (prevStep) {
    const prevMap = {};
    for (const v of prevStep.variables) prevMap[v.name] = v.value;
    for (const v of step.variables) {
      if (prevMap[v.name] !== undefined && prevMap[v.name] !== v.value) {
        changes.push({ name: v.name, from: prevMap[v.name], to: v.value });
      } else if (prevMap[v.name] === undefined) {
        changes.push({ name: v.name, from: null, to: v.value });
      }
    }
  }

  // Detect function transitions
  const funcChanged = prevStep && step.func !== prevStep.func;
  const isCall = funcChanged && (step.stack_frames?.length || 0) > (prevStep?.stack_frames?.length || 0);
  const isReturn = funcChanged && (step.stack_frames?.length || 0) < (prevStep?.stack_frames?.length || 0);
  const isRecursive = prevStep && step.func === prevStep.func && isCall;
  const depth = (step.stack_frames?.length || 1) - 1;
  const conditionContext = getLoopOrConditionContext(lineText, step.variables || []);

  if (!beginner) {
    let parts = [];
    if (isCall) parts.push(`Called ${step.func}()`);
    else if (isReturn) parts.push(`Returned to ${step.func}()`);
    if (conditionContext) {
      const outcome =
        conditionContext.result === null
          ? ''
          : (conditionContext.result ? ' (currently true)' : ' (currently false)');
      parts.push(`Condition: ${conditionContext.readable}${outcome}`);
    }
    if (changes.length > 0) {
      parts.push(changes.map(c => c.from === null ? `${c.name} = ${c.to}` : `${c.name}: ${c.from} -> ${c.to}`).join(', '));
    }
    const detail = parts.length > 0 ? parts.join(' | ') : 'No variable changes';
    return { short, detail, changes, funcChanged, isCall, isReturn, depth };
  }

  // Beginner mode
  let detail = '';
  if (isCall && !isRecursive) {
    detail = `Calling function "${step.func}()". The program jumps to this function's code. The current function is paused and will resume after "${step.func}" returns.`;
  } else if (isCall && isRecursive) {
    detail = `Recursive call! "${step.func}()" is calling itself again (depth: ${depth}). Each call creates a new set of local variables on the stack.`;
  } else if (isReturn) {
    detail = `Returning from a function call back to "${step.func}()". The previous function finished and its local variables are gone from the stack.`;
  } else if (lineText.includes('printf')) {
    detail = 'This line prints output to the console using printf.';
  } else if (lineText.includes('malloc')) {
    detail = 'Memory is being allocated on the heap using malloc. This memory persists until you call free().';
  } else if (lineText.includes('free(')) {
    detail = 'Memory is being freed/released back to the system. Using this pointer after free is a bug (dangling pointer).';
  } else if (lineText.includes('return')) {
    const retVal = step.variables.find(v => v.name === '__return__');
    detail = `The function "${step.func}()" returns${retVal ? ' the value ' + retVal.value : ''}. Execution goes back to wherever this function was called from.`;
  } else if (lineText.match(/^}\s*else/)) {
    detail = 'This is the else branch. It runs when the previous if-condition was false.';
  } else if (conditionContext?.kind === 'if') {
    const resultText =
      conditionContext.result === null
        ? ''
        : (conditionContext.result ? ' It is true right now, so the if-block runs.' : ' It is false right now, so the if-block is skipped.');
    detail = `A condition is being checked: "${conditionContext.readable}".${resultText}`;
  } else if (conditionContext?.kind === 'while') {
    const resultText =
      conditionContext.result === null
        ? ''
        : (conditionContext.result ? ' It is true right now, so the loop continues.' : ' It is false right now, so the loop stops.');
    detail = `A while-loop condition is being checked: "${conditionContext.readable}".${resultText}`;
  } else if (conditionContext?.kind === 'for') {
    const resultText =
      conditionContext.result === null
        ? ''
        : (conditionContext.result ? ' It is true right now, so this iteration continues.' : ' It is false right now, so the loop ends.');
    const initText = conditionContext.init ? ` Start: ${conditionContext.init}.` : '';
    const stepText = conditionContext.step ? ` Step update: ${conditionContext.step}.` : '';
    detail = `A for-loop is running.${initText} Condition: "${conditionContext.readable}".${stepText}${resultText}`;
  } else if (changes.length > 0) {
    detail = changes.map(c => {
      if (c.from === null) return `Variable "${c.name}" is created with initial value ${c.to}.`;
      return `Variable "${c.name}" changed from ${c.from} to ${c.to}.`;
    }).join(' ');
  } else if (lineText.includes('=')) {
    detail = 'A value is being assigned to a variable.';
  } else {
    detail = `Executing line ${step.line} inside function "${step.func}()".`;
  }

  if (depth > 0 && !funcChanged) {
    detail += ` (Call depth: ${depth})`;
  }

  return { short, detail, changes, funcChanged, isCall, isReturn, depth };
}

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

  const changedVars = useMemo(() => getChangedVarNames(steps, currentStep), [steps, currentStep]);

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
            {/* Function call/return banner */}
            {explanation?.isCall && (
              <div className="px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs font-plex text-emerald-300">
                Entering function <span className="font-mono font-semibold">{currentState.func}()</span>
                {explanation.depth > 0 && <span className="text-emerald-400/60"> (depth: {explanation.depth})</span>}
              </div>
            )}
            {explanation?.isReturn && (
              <div className="px-3 py-2 rounded bg-violet-500/10 border border-violet-500/20 text-xs font-plex text-violet-300">
                Returned to <span className="font-mono font-semibold">{currentState.func}()</span>
              </div>
            )}

            {/* Current line */}
            <div data-testid="explanation-code-line">
              <div className="flex items-center gap-2 mb-1.5">
                <Code size={14} className="text-amber-400" />
                <span className="text-[10px] font-plex tracking-[0.15em] uppercase text-zinc-500">
                  {currentState.func}() — Line {currentState.line}
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

            {/* Updated variables */}
            {currentState.variables.length > 0 && (
              <div data-testid="explanation-variables">
                <span className="text-[10px] font-plex tracking-[0.15em] uppercase text-zinc-500 mb-1.5 block">
                  Variables
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
