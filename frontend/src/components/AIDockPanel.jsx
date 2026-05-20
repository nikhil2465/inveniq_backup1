import React, { useState, useRef, useCallback, useEffect } from 'react';

const MODES = [
  { id: 'ask',     label: 'Ask',     icon: '💬', desc: 'Instant answers from your inventory data' },
  { id: 'explain', label: 'Explain', icon: '🔍', desc: 'Root-cause analysis and deep explanations' },
  { id: 'act',     label: 'Act',     icon: '⚡', desc: 'Action plans and step-by-step strategies' },
];

const QUICK_PROMPTS = [
  { label: 'Stock status',    text: 'Which SKUs need immediate reorder right now?' },
  { label: 'Top receivables', text: 'Show me top 5 overdue receivables and recovery steps.' },
  { label: 'Revenue insight', text: 'What is my revenue this month vs target?' },
  { label: 'Business health', text: 'Give me a complete business health check and priorities.' },
];

// Lightweight inline markdown: bold, code, line-breaks
function renderText(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--s3);padding:1px 4px;border-radius:3px;font-family:var(--mono);font-size:11px">$1</code>')
    .replace(/\n/g, '<br/>');
}

export default function AIDockPanel({
  open,
  minimized,
  onClose,
  onMinimize,
  onExpand,
  pendingQuery,
  onPendingQueryConsumed,
}) {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode]           = useState('ask');

  const abortRef  = useRef(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const msgIdRef  = useRef(0);

  // Auto-scroll on new messages
  useEffect(() => {
    if (open && !minimized && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, minimized]);

  // Focus input when panel opens / expands
  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open, minimized]);

  // Abort in-flight stream when panel closes
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [open]);

  // Auto-send pending query when panel opens with a pre-composed prompt
  useEffect(() => {
    if (pendingQuery && pendingQuery.trim() && open && !minimized && !streaming) {
      const q = pendingQuery.trim();
      onPendingQueryConsumed?.();
      sendMessage(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuery, open, minimized]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || streaming) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setStreaming(true);

    const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
    const id = ++msgIdRef.current;
    setMessages(prev => [...prev, { id, role: 'assistant', content: '', streaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, mode, history }),
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
          } catch { /* malformed SSE — skip */ }
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
  }, [input, messages, streaming, mode]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const unreadCount = messages.filter(m => m.role === 'assistant').length;

  // ── Floating toggle button (shown only when panel is closed entirely) ─────────
  if (!open) {
    return (
      <button
        className="ai-dock-toggle"
        onClick={onExpand}
        title="Open AI Assistant"
        aria-label="Open AI Assistant panel"
      >
        <svg viewBox="0 0 20 20" fill="none">
          <rect x="1.5" y="2.5" width="17" height="11.5" rx="2.5" stroke="currentColor" strokeWidth="1.8" opacity=".95"/>
          <path d="M5.5 16.5l2-2.5H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".75"/>
          <circle cx="6.5" cy="8.25" r="1.3" fill="currentColor" opacity=".85"/>
          <circle cx="10" cy="8.25" r="1.3" fill="currentColor" opacity=".85"/>
          <circle cx="13.5" cy="8.25" r="1.3" fill="currentColor" opacity=".85"/>
        </svg>
        <span className="ai-dock-toggle-label">AI</span>
        {unreadCount > 0 && (
          <span className="ai-dock-unread">{unreadCount}</span>
        )}
      </button>
    );
  }

  // ── Minimized strip ───────────────────────────────────────────────────────────
  if (minimized) {
    return (
      <div
        className="ai-side-panel sp-open sp-min"
        role="complementary"
        aria-label="AI Assistant minimized"
      >
        <div className="asp-min-strip" onClick={onExpand} title="Expand AI Assistant">
          <div className="asp-min-logo">
            <svg viewBox="0 0 20 20" fill="none" style={{ width: 18, height: 18 }}>
              <rect x="1.5" y="2.5" width="17" height="11.5" rx="2.5" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M5.5 16.5l2-2.5H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="6.5" cy="8.25" r="1.2" fill="currentColor"/>
              <circle cx="10" cy="8.25" r="1.2" fill="currentColor"/>
              <circle cx="13.5" cy="8.25" r="1.2" fill="currentColor"/>
            </svg>
          </div>
          <span className="asp-min-label">AI</span>
          {unreadCount > 0 && (
            <span className="asp-min-badge">{unreadCount}</span>
          )}
        </div>
      </div>
    );
  }

  // ── Full side panel ───────────────────────────────────────────────────────────
  return (
    <div
      className="ai-side-panel sp-open"
      role="complementary"
      aria-label="AI Assistant panel"
    >
      {/* Header */}
      <div className="asp-header">
        <div className="asp-title">
          <div className="asp-title-icon">
            <svg viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M4.5 13.5l1.5-2H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="5" cy="6.75" r="1" fill="currentColor"/>
              <circle cx="8" cy="6.75" r="1" fill="currentColor"/>
              <circle cx="11" cy="6.75" r="1" fill="currentColor"/>
            </svg>
          </div>
          <span>InvenIQ AI</span>
          {streaming && <span className="asp-live">●</span>}
        </div>
        <div className="asp-header-actions">
          <button
            className="asp-btn"
            onClick={() => setMessages([])}
            title="Clear conversation"
            style={{ opacity: messages.length ? 1 : 0.4, pointerEvents: messages.length ? 'auto' : 'none' }}
          >
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="asp-btn" onClick={onMinimize} title="Minimize panel">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M10 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="asp-btn" onClick={onClose} title="Close AI panel">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="asp-modes">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`asp-mode${mode === m.id ? ' active' : ''}`}
            onClick={() => setMode(m.id)}
            title={m.desc}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="asp-messages">
        {messages.length === 0 ? (
          <div className="asp-welcome">
            <div className="asp-welcome-icon">
              <svg viewBox="0 0 32 32" fill="none">
                <rect x="2" y="4" width="28" height="19" rx="4" stroke="currentColor" strokeWidth="2" opacity=".9"/>
                <path d="M8 27l3.5-4H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".7"/>
                <circle cx="10" cy="13.5" r="2" fill="currentColor" opacity=".8"/>
                <circle cx="16" cy="13.5" r="2" fill="currentColor" opacity=".8"/>
                <circle cx="22" cy="13.5" r="2" fill="currentColor" opacity=".8"/>
              </svg>
            </div>
            <div className="asp-welcome-title">InvenIQ AI Assistant</div>
            <p className="asp-welcome-text">
              Ask about inventory, sales, demand, procurement, or anything about your business.
              Switch modes for different response styles.
            </p>
            <div className="asp-quick-prompts">
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q.label}
                  className="asp-qp"
                  onClick={() => sendMessage(q.text)}
                >
                  <strong style={{ marginRight: 5, color: 'var(--green)' }}>{q.label}</strong>
                  {q.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.id ?? i} className={`asp-msg ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="asp-msg-avatar">AI</div>
              )}
              {msg.role === 'assistant' ? (
                msg.content ? (
                  <div
                    className="asp-msg-body"
                    dangerouslySetInnerHTML={{ __html: renderText(msg.content) }}
                  />
                ) : msg.streaming ? (
                  <div className="asp-msg-body">
                    <span className="asp-typing"><span/><span/><span/></span>
                  </div>
                ) : (
                  <div className="asp-msg-body" />
                )
              ) : (
                <div className="asp-msg-body">{msg.content}</div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="asp-input-row">
        <textarea
          ref={inputRef}
          className="asp-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${MODES.find(m => m.id === mode)?.desc ?? 'Ask anything…'} (Enter to send, Shift+Enter for new line)`}
          rows={2}
          disabled={streaming}
        />
        <button
          className="asp-send"
          onClick={() => sendMessage()}
          disabled={!input.trim() || streaming}
          title="Send (Enter)"
        >
          {streaming ? (
            <span className="asp-spin"/>
          ) : (
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
