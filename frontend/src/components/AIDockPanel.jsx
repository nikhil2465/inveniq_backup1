import React, { useState, useRef, useCallback, useEffect } from 'react';

const QUICK_PROMPTS = [
  'What needs reorder now?',
  'Top 5 overdue receivables?',
  'Which SKUs are overstocked?',
];

export default function AIDockPanel({ onNavigateToChat, activeView }) {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef  = useRef(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const msgIdRef  = useRef(0);

  // Auto-scroll to latest message
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // Abort any in-flight stream when panel closes
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || streaming) return;

    setInput('');
    const userMsg = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
    const id = ++msgIdRef.current;
    setMessages(prev => [...prev, { id, role: 'assistant', content: '', streaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, mode: 'ask', history }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'token') {
              setMessages(prev => prev.map(m =>
                m.id === id ? { ...m, content: m.content + evt.content } : m
              ));
            } else if (evt.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === id ? { ...m, streaming: false } : m
              ));
            }
          } catch { /* malformed SSE line — skip */ }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === id
            ? { ...m, content: m.content || 'Something went wrong. Please try again.', streaming: false }
            : m
        ));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const handleExpandToFull = useCallback(() => {
    setOpen(false);
    onNavigateToChat();
  }, [onNavigateToChat]);

  // Hide the entire dock when user is already in the chatbot view
  if (activeView === 'chatbot') return null;

  return (
    <>
      {/* Floating toggle button */}
      <button
        className={`ai-dock-toggle${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={open ? 'Close AI panel' : 'Open AI Assistant'}
        aria-label="AI Assistant dock"
      >
        {open ? (
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="none">
              <rect x="1.5" y="2.5" width="17" height="11.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" opacity=".95"/>
              <path d="M5.5 16.5l2-2.5H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".75"/>
              <circle cx="6.5" cy="8.25" r="1.3" fill="currentColor" opacity=".85"/>
              <circle cx="10" cy="8.25" r="1.3" fill="currentColor" opacity=".85"/>
              <circle cx="13.5" cy="8.25" r="1.3" fill="currentColor" opacity=".85"/>
            </svg>
            <span className="ai-dock-toggle-label">AI</span>
          </>
        )}
        {!open && messages.length > 0 && (
          <span className="ai-dock-unread">{messages.filter(m => m.role === 'assistant').length}</span>
        )}
      </button>

      {/* Dock panel */}
      {open && (
        <div className="ai-dock-panel" role="dialog" aria-label="AI Assistant">
          {/* Header */}
          <div className="ai-dock-header">
            <div className="ai-dock-title">
              <svg viewBox="0 0 16 16" fill="none" style={{ width: 15, height: 15 }}>
                <rect x="1" y="2" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.5" opacity=".9"/>
                <path d="M4.5 13.5l1.5-2H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
                <circle cx="5" cy="6.75" r="1" fill="currentColor" opacity=".8"/>
                <circle cx="8" cy="6.75" r="1" fill="currentColor" opacity=".8"/>
                <circle cx="11" cy="6.75" r="1" fill="currentColor" opacity=".8"/>
              </svg>
              InvenIQ AI
              {streaming && <span className="ai-dock-live">●</span>}
            </div>
            <div className="ai-dock-actions">
              <button onClick={handleExpandToFull} className="ai-dock-expand" title="Open full AI view">
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M9 2h5v5M7 9L14 2M2 7v7h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} className="ai-dock-clear" title="Clear chat">
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <button onClick={() => setOpen(false)} className="ai-dock-close" title="Close">
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="ai-dock-messages">
            {messages.length === 0 ? (
              <div className="ai-dock-welcome">
                <div className="ai-dock-welcome-icon">
                  <svg viewBox="0 0 32 32" fill="none">
                    <rect x="2" y="4" width="28" height="19" rx="4" stroke="currentColor" strokeWidth="2" opacity=".9"/>
                    <path d="M8 27l3.5-4H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".7"/>
                    <circle cx="10" cy="13.5" r="2" fill="currentColor" opacity=".8"/>
                    <circle cx="16" cy="13.5" r="2" fill="currentColor" opacity=".8"/>
                    <circle cx="22" cy="13.5" r="2" fill="currentColor" opacity=".8"/>
                  </svg>
                </div>
                <p className="ai-dock-welcome-text">Ask anything about your inventory, sales, or business.</p>
                <div className="ai-dock-quick-prompts">
                  {QUICK_PROMPTS.map(q => (
                    <button key={q} className="ai-dock-qp" onClick={() => sendMessage(q)}>{q}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={msg.id ?? i} className={`ai-dock-msg ${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <div className="ai-dock-msg-avatar">AI</div>
                  )}
                  <div className="ai-dock-msg-body">
                    {msg.content || (msg.streaming ? '' : '')}
                    {msg.streaming && msg.content === '' && (
                      <span className="ai-dock-typing"><span/><span/><span/></span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="ai-dock-input-row">
            <textarea
              ref={inputRef}
              className="ai-dock-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything… (Enter to send)"
              rows={2}
              disabled={streaming}
            />
            <button
              className="ai-dock-send"
              onClick={() => sendMessage()}
              disabled={!input.trim() || streaming}
              title="Send (Enter)"
            >
              {streaming ? (
                <span className="ai-dock-spin"/>
              ) : (
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
