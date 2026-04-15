import { create } from 'zustand';

const SAMPLE_CODE = `#include <stdio.h>

int add(int a, int b) {
    int sum = a + b;
    return sum;
}

int multiply(int a, int b) {
    int product = a * b;
    return product;
}

int main() {
    int x = 5;
    int y = 3;
    
    int sum = add(x, y);
    int prod = multiply(x, y);
    int total = add(sum, prod);
    
    printf("Result: %d\\n", total);
    return 0;
}`;

const useTraceStore = create((set, get) => ({
  code: SAMPLE_CODE,
  setCode: (code) => set({ code }),

  steps: [],
  finalOutput: '',
  currentStep: 0,
  isTracing: false,
  traceError: null,
  compilationError: null,

  isPlaying: false,
  playSpeed: 700,

  beginnerMode: false,
  toggleBeginnerMode: () => set((s) => ({ beginnerMode: !s.beginnerMode })),

  setSteps: (steps, finalOutput = '') => set({ steps, finalOutput, currentStep: 0, traceError: null, compilationError: null }),
  setCurrentStep: (step) => set({ currentStep: step }),
  setIsTracing: (isTracing) => set({ isTracing }),
  setTraceError: (error) => set({ traceError: error }),
  setCompilationError: (error) => set({ compilationError: error }),

  play: () => {
    const { steps, currentStep, isPlaying } = get();
    if (isPlaying || currentStep >= steps.length - 1) return;
    set({ isPlaying: true });
  },
  pause: () => set({ isPlaying: false }),
  stepForward: () => {
    const { steps, currentStep } = get();
    if (currentStep < steps.length - 1) set({ currentStep: currentStep + 1 });
  },
  stepBackward: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },
  reset: () => set({ currentStep: 0, isPlaying: false }),
  setPlaySpeed: (speed) => set({ playSpeed: speed }),
}));

export default useTraceStore;
