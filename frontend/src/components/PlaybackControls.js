import React, { useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ArrowCounterClockwise,
  Lightning,
} from '@phosphor-icons/react';
import useTraceStore from '@/store/traceStore';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import axios from 'axios';

const API = "http://127.0.0.1:8000/api";

const PlaybackControls = () => {
  const code = useTraceStore((s) => s.code);
  const steps = useTraceStore((s) => s.steps);
  const currentStep = useTraceStore((s) => s.currentStep);
  const isPlaying = useTraceStore((s) => s.isPlaying);
  const isTracing = useTraceStore((s) => s.isTracing);
  const playSpeed = useTraceStore((s) => s.playSpeed);
  const setSteps = useTraceStore((s) => s.setSteps);
  const setIsTracing = useTraceStore((s) => s.setIsTracing);
  const setTraceError = useTraceStore((s) => s.setTraceError);
  const setCompilationError = useTraceStore((s) => s.setCompilationError);
  const play = useTraceStore((s) => s.play);
  const pause = useTraceStore((s) => s.pause);
  const stepForward = useTraceStore((s) => s.stepForward);
  const stepBackward = useTraceStore((s) => s.stepBackward);
  const reset = useTraceStore((s) => s.reset);

  const intervalRef = useRef(null);

  // Run code
  const handleRun = useCallback(async () => {
    setIsTracing(true);
    setTraceError(null);
    setCompilationError(null);
    try {
      const res = await axios.post(`${API}/run`, { code }, { timeout: 30000 });
      if (res.data.compilation_error) {
        setSteps([], '');
        setCompilationError(res.data.compilation_error);
      } else if (res.data.error) {
        setSteps(res.data.steps || [], res.data.final_output || '');
        setTraceError(res.data.error);
      } else {
        setSteps(res.data.steps || [], res.data.final_output || '');
      }
    } catch (err) {
      setTraceError(err.message || 'Failed to run code');
    } finally {
      setIsTracing(false);
    }
  }, [code, setIsTracing, setTraceError, setCompilationError, setSteps]);

  // Playback loop
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        const state = useTraceStore.getState();
        if (state.currentStep >= state.steps.length - 1) {
          useTraceStore.getState().pause();
        } else {
          useTraceStore.getState().stepForward();
        }
      }, playSpeed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, playSpeed]);

  const hasSteps = steps.length > 0;
  const atStart = currentStep <= 0;
  const atEnd = steps.length <= 1 || currentStep >= steps.length - 1;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-testid="playback-controls"
        className="flex items-center gap-1 px-2 py-1 bg-zinc-800/60 border border-zinc-700/30 rounded-full"
      >
        {/* Run button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="run-button"
              variant="ghost"
              size="icon"
              onClick={handleRun}
              disabled={isTracing}
              className="h-7 w-7 rounded-full hover:bg-emerald-500/20 hover:text-emerald-400 text-zinc-400"
            >
              <Lightning size={14} weight="fill" className={isTracing ? 'animate-spin' : ''} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Run & Trace</TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-zinc-700/40" />

        {/* Reset */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="reset-button"
              variant="ghost"
              size="icon"
              onClick={reset}
              disabled={!hasSteps}
              className="h-6 w-6 rounded-full hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
            >
              <ArrowCounterClockwise size={12} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset</TooltipContent>
        </Tooltip>

        {/* Step Back */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="step-backward-button"
              variant="ghost"
              size="icon"
              onClick={stepBackward}
              disabled={!hasSteps || atStart}
              className="h-6 w-6 rounded-full hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
            >
              <SkipBack size={12} weight="fill" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Step Back</TooltipContent>
        </Tooltip>

        {/* Play / Pause */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="play-pause-button"
              variant="ghost"
              size="icon"
              onClick={isPlaying ? pause : play}
              disabled={!hasSteps || (!isPlaying && atEnd)}
              className="h-7 w-7 rounded-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300"
            >
              {isPlaying ? (
                <Pause size={14} weight="fill" />
              ) : (
                <Play size={14} weight="fill" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isPlaying ? 'Pause' : 'Play'}</TooltipContent>
        </Tooltip>

        {/* Step Forward */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="step-forward-button"
              variant="ghost"
              size="icon"
              onClick={stepForward}
              disabled={!hasSteps || atEnd}
              className="h-6 w-6 rounded-full hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200"
            >
              <SkipForward size={12} weight="fill" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Step Forward</TooltipContent>
        </Tooltip>

        {/* Step counter + speed */}
        {hasSteps && (
          <>
            <div className="w-px h-4 bg-zinc-700/40" />
            <span data-testid="step-counter" className="text-[10px] font-mono text-zinc-500 min-w-[40px] text-center">
              {currentStep + 1}/{steps.length}
            </span>
            <select
              data-testid="speed-selector"
              value={playSpeed}
              onChange={(e) => useTraceStore.getState().setPlaySpeed(Number(e.target.value))}
              className="bg-transparent text-[10px] font-mono text-zinc-500 outline-none cursor-pointer"
            >
              <option value={300} className="bg-zinc-900">Fast</option>
              <option value={700} className="bg-zinc-900">Normal</option>
              <option value={1200} className="bg-zinc-900">Slow</option>
            </select>
          </>
        )}
      </div>
    </TooltipProvider>
  );
};

export default PlaybackControls;
