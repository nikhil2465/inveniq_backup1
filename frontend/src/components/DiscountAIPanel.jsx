import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Simple markdown renderer (bold, inline code, headers, lists, newlines) ─────
function MdLine({ text }) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith('**')) parts.push(<strong key={m.index}>{raw.slice(2, -2)}</strong>);
    else parts.push(<code key={m.index} className="dap-inline-code">{raw.slice(1, -1)}</code>);
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function renderMd(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const nodes = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) { nodes.push(<br key={i} />); i++; continue; }

    // Heading
    const hm = line.match(/^(#{1,3})\s+(.*)/);
    if (hm) {
      const Tag = `h${hm[1].length + 2}`; // h3/h4/h5
      nodes.push(<Tag key={i} className="dap-md-h"><MdLine text={hm[2]} /></Tag>);
      i++; continue;
    }

    // Bullet list — collect consecutive bullets
    if (/^[-•*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-•*]\s/.test(lines[i])) {
        items.push(<li key={i}><MdLine text={lines[i].slice(2)} /></li>);
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="dap-md-ul">{items}</ul>);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i}><MdLine text={lines[i].replace(/^\d+\.\s/, '')} /></li>);
        i++;
      }
      nodes.push(<ol key={`ol-${i}`} className="dap-md-ol">{items}</ol>);
      continue;
    }

    // Normal paragraph line
    nodes.push(<p key={i} className="dap-md-p"><MdLine text={line} /></p>);
    i++;
  }

  return nodes;
}

// ── Typing indicator ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="dap-typing">
      <span /><span /><span />
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function DiscountAIPanel({ isOpen, onClose, initialMessage }) {
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [streaming,   setStreaming]   = useState(false);
  const [mode,        setMode]        = useState('ask');
  const [followUps,   setFollowUps]   = useState([]);
  const [toolsUsed,   setToolsUsed]   = useState([]);

  const bottomRef  = useRef(null);
  const abortRef   = useRef(null);
  const sentRef    = useRef('');
  const textareaRef = useRef(null);

  // Auto-send when initialMessage changes (context-triggered from page)
  useEffect(() => {
    if (initialMessage && initialMessage !== sentRef.current && isOpen) {
      sentRef.current = initialMessage;
      setFollowUps([]);
      setToolsUsed([]);
      doSend(initialMessage);
    }
  }, [initialMessage, isOpen]); // eslint-disable-line

  // Reset sent sentinel when panel closes
  useEffect(() => {
    if (!isOpen) {
      sentRef.current = '';
      abortRef.current?.abort();
    }
  }, [isOpen]);

  // Scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 300);
  }, [isOpen]);

  // Build history from current messages for multi-turn context
  const buildHistory = useCallback(() => {
    return messages.slice(-12).map(m => ({ role: m.role, content: m.content }));
  }, [messages]);

  const doSend = useCallback(async (text) => {
    const query = (text ?? input).trim();
    if (!query || streaming) return;

    setInput('');
    setFollowUps([]);
    setStreaming(true);

    const userMsg = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);

    const history = buildHistory();

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Placeholder for streaming AI response
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    let aiText = '';
    let tools  = [];

    try {
      const res = await fetch('/api/chat/stream', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: query, mode, history }),
        signal:  ctrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));

            if (ev.type === 'meta') {
              tools = ev.tools_used || [];
              setToolsUsed(tools);
            }

            if (ev.type === 'token') {
              aiText += ev.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: aiText, streaming: true };
                return updated;
              });
            }

            if (ev.type === 'done') {
              setFollowUps(ev.follow_ups || []);
            }

            if (ev.type === 'error') {
              aiText = `⚠️ ${ev.message}`;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: aiText, streaming: false };
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        aiText = '⚠️ Could not reach AI. Make sure the backend is running on port 8000.';
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: aiText, streaming: false };
          return updated;
        });
      }
    } finally {
      // Mark streaming done
      setMessages(prev => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[updated.length - 1] = { ...updated[updated.length - 1], streaming: false };
        }
        return updated;
      });
      setStreaming(false);
    }
  }, [input, mode, streaming, buildHistory]); // eslint-disable-line

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setFollowUps([]);
    setToolsUsed([]);
    setStreaming(false);
    sentRef.current = '';
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && <div className="dap-overlay" onClick={onClose} />}

      {/* Panel */}
      <div className={`dap-panel${isOpen ? ' dap-open' : ''}`} role="dialog" aria-label="Discount AI Assistant">

        {/* ── Header ── */}
        <div className="dap-header">
          <div className="dap-header-left">
            <span className="dap-header-dot" />
            <span className="dap-header-title">Discount AI</span>
            {toolsUsed.length > 0 && (
              <span className="dap-tools-pill">📊 Live data</span>
            )}
          </div>
          <div className="dap-header-right">
            {messages.length > 0 && (
              <button className="dap-icon-btn" onClick={clearChat} title="Clear chat">↺</button>
            )}
            <button className="dap-icon-btn dap-close-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* ── Mode selector ── */}
        <div className="dap-mode-bar">
          {['ask', 'explain', 'act'].map(m => (
            <button
              key={m}
              className={`dap-mode-btn${mode === m ? ' active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'ask' ? '💬 Ask' : m === 'explain' ? '🔍 Explain' : '⚡ Act'}
            </button>
          ))}
          <span className="dap-mode-hint">
            {mode === 'ask' ? 'Quick answer' : mode === 'explain' ? 'Root cause analysis' : 'Action plan'}
          </span>
        </div>

        {/* ── Messages ── */}
        <div className="dap-messages">
          {messages.length === 0 && (
            <div className="dap-empty-state">
              <div className="dap-empty-icon">🧮</div>
              <div className="dap-empty-title">Discount Intelligence</div>
              <div className="dap-empty-sub">
                Ask about rules, margins, quotes, or segment strategy. Click any ✨ button on the page for instant context.
              </div>
              <div className="dap-starter-chips">
                {[
                  'Why is my margin below floor?',
                  'Which segment gives best margins?',
                  'How do I optimise discount strategy?',
                ].map(s => (
                  <button key={s} className="dap-starter-chip" onClick={() => doSend(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`dap-msg dap-msg-${m.role}`}>
              {m.role === 'assistant' && (
                <div className="dap-msg-label">AI</div>
              )}
              <div className={`dap-bubble dap-bubble-${m.role}`}>
                {m.role === 'assistant'
                  ? (m.content
                      ? <div className="dap-md">{renderMd(m.content)}{m.streaming && <span className="dap-cursor">▋</span>}</div>
                      : <TypingDots />)
                  : <span>{m.content}</span>
                }
              </div>
            </div>
          ))}

          {/* Follow-up chips */}
          {!streaming && followUps.length > 0 && (
            <div className="dap-followups">
              {followUps.slice(0, 3).map((f, i) => (
                <button key={i} className="dap-followup-chip" onClick={() => doSend(f)}>{f}</button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div className="dap-input-area">
          <div className="dap-input-box">
            <textarea
              ref={textareaRef}
              className="dap-textarea"
              rows={2}
              placeholder={`Ask in ${mode} mode… (Shift+Enter for newline)`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
            />
            <button
              className="dap-send-btn"
              onClick={() => doSend()}
              disabled={streaming || !input.trim()}
              title="Send (Enter)"
            >
              {streaming ? <span className="dap-spin">⟳</span> : '↑'}
            </button>
          </div>
          <div className="dap-footer-line">
            GPT-4o · Discount Intelligence · {streaming ? 'Thinking…' : 'Ready'}
          </div>
        </div>
      </div>
    </>
  );
}
