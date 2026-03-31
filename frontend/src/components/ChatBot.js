import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatCircleDots, PaperPlaneTilt, X } from '@phosphor-icons/react';
import useTraceStore from '@/store/traceStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';

const STORAGE_KEY = 'ctrace-chat-history';
const API = "http://127.0.0.1:8000/api";

const ChatBot = () => {
  const chatOpen = useTraceStore((s) => s.chatOpen);
  const setChatOpen = useTraceStore((s) => s.setChatOpen);
  const steps = useTraceStore((s) => s.steps);
  const currentStep = useTraceStore((s) => s.currentStep);
  const code = useTraceStore((s) => s.code);

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch { /* ignore */ }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, chatOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [chatOpen]);

  const getCurrentExecutionState = useCallback(() => {
    if (steps.length === 0) return null;
    const state = steps[currentStep];
    if (!state) return null;
    return {
      step: state.step,
      line: state.line,
      func: state.func,
      variables: state.variables,
      stack_frames: state.stack_frames,
      heap: state.heap,
    };
  }, [steps, currentStep]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    // Add placeholder for AI
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const executionState = getCurrentExecutionState();
      const response = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          code: code || '',
          execution_state: executionState,
          history: messages.slice(-10),
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullText += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: fullText,
                  };
                  return updated;
                });
              }
              if (data.error) {
                fullText = 'Sorry, I encountered an error. Please try again.';
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: fullText,
                  };
                  return updated;
                });
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Connection error. Please check if the server is running.',
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, getCurrentExecutionState]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <>
      {/* FAB */}
      {!chatOpen && (
        <button
          data-testid="chat-fab"
          onClick={() => setChatOpen(true)}
          className="fixed bottom-20 right-6 z-50
            w-12 h-12 rounded-full
            bg-blue-600 hover:bg-blue-500
            text-white shadow-lg shadow-blue-600/30
            flex items-center justify-center
            transition-all duration-200 hover:scale-105"
        >
          <ChatCircleDots size={24} weight="fill" />
        </button>
      )}

      {/* Chat Window */}
      {chatOpen && (
        <div
          data-testid="chat-window"
          className="fixed bottom-20 right-6 z-50
            w-[380px] h-[520px]
            bg-zinc-950 border border-zinc-800
            rounded-lg shadow-2xl
            flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
            <div>
              <span className="text-[10px] font-plex tracking-[0.2em] uppercase text-zinc-500">
                AI Tutor
              </span>
              <p className="text-xs text-zinc-400 font-plex mt-0.5">
                Socratic guidance for your code
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                data-testid="clear-chat-button"
                variant="ghost"
                size="icon"
                onClick={clearHistory}
                className="h-7 w-7 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded"
              >
                <span className="text-[10px] font-mono">CLR</span>
              </Button>
              <Button
                data-testid="close-chat-button"
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(false)}
                className="h-7 w-7 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded"
              >
                <X size={14} />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <ChatCircleDots size={32} className="text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-500 font-plex">
                  Ask me about your code, pointers, or memory!
                </p>
                <p className="text-xs text-zinc-600 font-plex mt-1">
                  I can see the current execution state.
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                data-testid={`chat-message-${msg.role}-${i}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm font-plex leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'bg-blue-950/30 border border-blue-500/20 text-blue-50'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-zinc-900 [&_pre]:p-2 [&_pre]:rounded">
                      <ReactMarkdown>{msg.content || (isStreaming && i === messages.length - 1 ? '...' : '')}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-zinc-800 bg-zinc-950">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                data-testid="chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your code..."
                disabled={isStreaming}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2
                  text-sm font-plex text-zinc-100 placeholder:text-zinc-600
                  focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50
                  disabled:opacity-50"
              />
              <Button
                data-testid="send-message-button"
                variant="ghost"
                size="icon"
                onClick={sendMessage}
                disabled={isStreaming || !input.trim()}
                className="h-9 w-9 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300"
              >
                <PaperPlaneTilt size={16} weight="fill" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;
