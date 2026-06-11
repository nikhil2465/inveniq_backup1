import React, { useState, useRef, useEffect } from 'react';

const PERIODS = ['Today', 'MTD', 'QTD', 'YTD'];

const SEVERITY_COLOR = {
  critical: { left: '#dc2626', bg: '#fef2f2', badge: '#dc2626' },
  warning:  { left: '#d97706', bg: '#fffbeb', badge: '#d97706' },
  info:     { left: '#2563eb', bg: '#eff6ff', badge: '#2563eb' },
};

const QUICK_SEARCH_SUGGESTIONS = [
  { label: 'Low stock alerts',      view: 'inventory',   query: 'Which products are running low on stock?' },
  { label: 'Revenue this month',    view: 'sales',       query: 'What is my revenue this month vs target?' },
  { label: 'Pending orders',        view: 'orders',      query: 'Show me all pending orders needing action' },
  { label: 'Dead stock recovery',   view: 'deadstock',   query: 'What is my dead stock value and recovery plan?' },
  { label: 'Top customers',         view: 'customers',   query: 'Who are my top 5 customers this month?' },
  { label: 'Cash flow status',      view: 'finance',     query: 'What is my current cash flow and working capital?' },
  { label: 'Demand forecast',       view: 'demand',      query: 'What are the demand forecasts for next month?' },
  { label: 'Supplier performance',  view: 'procurement', query: 'How are my suppliers performing this month?' },
  { label: 'Credit risk accounts',  view: 'credit',      query: 'Which customers are at or over their credit limit? Show me utilisation and overdue aging.' },
  { label: 'Bounced PDCs',          view: 'credit',      query: 'Are there any bounced post-dated cheques? Show me amounts and next steps.' },
  { label: 'Counter POS today',     view: 'pos',         query: 'What are today\'s counter sales — total revenue, top products, and transaction count?' },
  { label: 'Supplier schemes',      view: 'schemes',     query: 'Which supplier schemes am I at risk of missing? Show me target gaps and payout amounts.' },
  { label: 'Grow my business',      view: null,          query: 'How can I grow my revenue by 30% this quarter? Give me a specific action plan.' },
  { label: 'Pricing optimisation',  view: 'discounts',   query: 'Which products am I underpricing? Show me discount leakage and pricing recommendations.' },
  { label: 'Overdue collections',   view: 'customers',   query: 'Give me a prioritised collections call list with recovery scripts for overdue payments.' },
  { label: 'Quote win rate',        view: 'quotes',      query: 'What is my quotation win rate and which quotes should I follow up on this week?' },
  { label: 'Expiring quotes',       view: 'quotes',      query: 'Which quotes are expiring this week? Give me the contact details and a follow-up script for each.' },
  { label: 'Overdue invoices',      view: 'invoices',    query: 'Which customer invoices are overdue and by how many days? Show me the total outstanding and draft a follow-up message for the top 3 accounts.' },
  { label: 'Sales MIS report',      view: 'reports',     query: 'Give me a sales summary for this month — total revenue, top customers, GST collected, and key trends vs last month.' },
  { label: 'Design quote pipeline', view: 'designquote', query: 'What is the status of my design quotation and architect fee proposal pipeline — value of won vs pending vs lost, and which proposals need follow-up this week?' },
  { label: 'Pending requisitions',  view: 'pr',          query: 'How many purchase requisitions are pending approval? Show departments, total estimated value, and flag any urgent or overdue requests.' },
  { label: 'Business health check', view: null,          query: 'Give me a complete business health check and top priorities for this week.' },
];

export default function Topbar({ title, period, onPeriodChange, alerts = [], onGoChat, onNavigate, dbStatus, onToggleSidebar, onLogout, currentUser, allowedModules = null, aiPanelOpen = false, aiPanelMin = false }) {
  // canNav: returns true if the user is allowed to navigate to a given module.
  // null allowedModules = admin/unrestricted = all modules accessible.
  const canNav = (v) => !allowedModules || allowedModules.includes(v);
  const [alertOpen, setAlertOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal, setSearchVal]   = useState('');
  const [darkMode, setDarkMode]     = useState(() => document.documentElement.classList.contains('dark-mode'));
  const [readIds, setReadIds]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('inviq-read-alerts') || '[]'); }
    catch { return []; }
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const alertRef   = useRef(null);
  const profileRef = useRef(null);
  const searchRef  = useRef(null);
  const searchInputRef = useRef(null);

  const unreadAlerts   = alerts.filter(a => !readIds.includes(a.id));
  const criticalCount  = unreadAlerts.filter(a => a.severity === 'critical').length;
  const totalCount     = unreadAlerts.length;

  const markAllRead = () => {
    const ids = alerts.map(a => a.id);
    setReadIds(ids);
    localStorage.setItem('inviq-read-alerts', JSON.stringify(ids));
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (alertRef.current   && !alertRef.current.contains(e.target))   setAlertOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (searchRef.current  && !searchRef.current.contains(e.target))  { setSearchOpen(false); setSearchVal(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Ctrl+K / Cmd+K opens search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setSearchVal(''); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Broadcast channel for theme sync across tabs
  const _themeCh = useRef(null);
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    _themeCh.current = new BroadcastChannel('inveniq-theme');
    _themeCh.current.onmessage = (ev) => {
      if (ev.data?.type === 'theme') {
        const next = ev.data.dark;
        setDarkMode(next);
        document.documentElement.classList.toggle('dark-mode', next);
        document.documentElement.classList.toggle('light-mode', !next);
      }
    };
    return () => _themeCh.current?.close();
  }, []);

  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark-mode', next);
    document.documentElement.classList.toggle('light-mode', !next);
    localStorage.setItem('inviq-theme', next ? 'dark' : 'light');
    _themeCh.current?.postMessage({ type: 'theme', dark: next });
  };

  // '?' key opens shortcuts modal (when not typing in an input)
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if (e.target?.contentEditable === 'true') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setShortcutsOpen(o => !o); }
      if (e.key === 'Escape') setShortcutsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleAskAI = (query, view) => {
    setAlertOpen(false);
    setSearchOpen(false);
    setSearchVal('');
    if (view) onNavigate?.(view);
    onGoChat?.(query);
    if (!view) onNavigate?.('chatbot');
  };

  // Derive display values from JWT user payload (falls back to sensible defaults)
  const displayName = currentUser?.display_name || currentUser?.username || 'Admin';
  const displayEmail = currentUser?.email || '';
  const displayRole = currentUser?.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'User';
  const avatarInitials = displayName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'IQ';

  const filteredSuggestions = searchVal.trim()
    ? QUICK_SEARCH_SUGGESTIONS.filter(s => s.label.toLowerCase().includes(searchVal.toLowerCase()))
    : QUICK_SEARCH_SUGGESTIONS;

  const KBD = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5,
    padding: '2px 7px', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
    color: 'var(--b2)', whiteSpace: 'nowrap', flexShrink: 0, minWidth: 70,
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchVal.trim()) {
      handleAskAI(searchVal.trim());
    }
  };

  return (
    <div className={`topbar${aiPanelOpen ? ' sp-open' : ''}${aiPanelMin ? ' sp-min' : ''}`}>
      {/* Hamburger for mobile sidebar toggle */}
      <button className="hamburger" onClick={onToggleSidebar} title="Toggle sidebar" aria-label="Toggle navigation">
        <svg viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
      </button>

      {/* Left: Title area */}
      <div className="tl">
        <div className="tc">InvenIQ · Business Intelligence Platform</div>
        <div className="tt">{title}</div>
      </div>

      {/* Global Search */}
      <div className="tb-search-wrap" ref={searchRef}>
        <button
          className="tb-search-btn"
          onClick={() => { setSearchOpen(o => !o); setTimeout(() => searchInputRef.current?.focus(), 50); }}
          title="Global Search (Ctrl+K)"
        >
          <svg viewBox="0 0 16 16" fill="none" width="13" height="13">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="tb-search-label">Search anything…</span>
          <span className="tb-search-kbd">⌘K</span>
        </button>
        {searchOpen && (
          <div className="tb-search-dropdown">
            <form onSubmit={handleSearchSubmit}>
              <div className="tb-search-input-row">
                <svg viewBox="0 0 16 16" fill="none" width="14" height="14" style={{flexShrink:0,color:'var(--text3)'}}>
                  <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  ref={searchInputRef}
                  className="tb-search-input"
                  placeholder="Ask AI anything about your business…"
                  value={searchVal}
                  onChange={e => setSearchVal(e.target.value)}
                  autoComplete="off"
                />
                {searchVal && (
                  <button type="submit" className="tb-search-go">Ask AI →</button>
                )}
              </div>
            </form>
            <div className="tb-search-divider">Quick actions</div>
            <div className="tb-search-list">
              {filteredSuggestions.map((s, i) => (
                <button key={i} className="tb-search-item" onClick={() => handleAskAI(s.query, s.view)}>
                  <svg viewBox="0 0 16 16" fill="none" width="12" height="12" style={{flexShrink:0,opacity:.4}}>
                    <path d="M2 8h12M8 2l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>{s.label}</span>
                  <span className="tb-search-item-tag">{s.view}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Period Tabs */}
      <div className="ptabs">
        {PERIODS.map(p => (
          <button
            key={p}
            className={`pt${period === p ? ' active' : ''}`}
            onClick={() => onPeriodChange(p)}
          >{p}</button>
        ))}
      </div>

      {/* Alert Notification Bell */}
      <div className="tb-alert-wrap" ref={alertRef}>
        <button
          className={`tb-alert-btn${criticalCount > 0 ? ' critical' : totalCount > 0 ? ' has-alerts' : ''}`}
          onClick={() => setAlertOpen(o => !o)}
          title={totalCount > 0 ? `${totalCount} business alerts` : 'No active alerts'}
        >
          <span className="tb-bell-icon">🔔</span>
          {totalCount > 0 && (
            <span className={`tb-alert-badge${criticalCount > 0 ? ' critical' : ''}`}>
              {criticalCount > 0 ? criticalCount : totalCount}
            </span>
          )}
        </button>

        {alertOpen && (
          <div className="tb-alert-dropdown">
            <div className="tb-ad-header">
              <span className="tb-ad-title">Business Alerts</span>
              <div className="tb-ad-counts">
                {criticalCount > 0 && (
                  <span className="tb-ad-cnt tb-cnt-critical">{criticalCount} critical</span>
                )}
                <span className="tb-ad-cnt tb-cnt-total">{totalCount} unread</span>
                {alerts.length > 0 && totalCount > 0 && (
                  <button className="tb-ad-mark-read" onClick={markAllRead} title="Mark all as read">✓ All read</button>
                )}
              </div>
            </div>
            <div className="tb-ad-list">
              {alerts.length === 0 ? (
                <div className="tb-ad-empty">✅ No active alerts right now</div>
              ) : (
                alerts.map(alert => {
                  const s = SEVERITY_COLOR[alert.severity] || SEVERITY_COLOR.info;
                  return (
                    <div
                      key={alert.id}
                      className={`tb-ad-item tb-sev-${alert.severity}`}
                      style={{ borderLeftColor: s.left }}
                    >
                      <div className="tb-ad-row">
                        <span className="tb-ad-icon">{alert.icon}</span>
                        <div className="tb-ad-body">
                          <div className="tb-ad-item-title">{alert.title}</div>
                          <div className="tb-ad-item-desc">{alert.desc}</div>
                        </div>
                      </div>
                      <div className="tb-ad-footer">
                        {alert.impact && (
                          <span className={`tb-ad-impact tb-impact-${alert.severity}`}>
                            {alert.impact}
                          </span>
                        )}
                        {onGoChat && (
                          <button
                            className="tb-ad-ask"
                            onClick={() => handleAskAI(alert.ai_query)}
                          >
                            Ask AI →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="tb-ad-cta">
              <button
                className="tb-ad-cta-btn"
                onClick={() => handleAskAI("Show me all business alerts and today's priorities")}
              >
                💡 Full insights in AI Chat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dark Mode Toggle */}
      <button className="theme-toggle" onClick={toggleDark} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle dark mode">
        {darkMode
          ? <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="4.5" stroke="currentColor" strokeWidth="1.6"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          : <svg viewBox="0 0 20 20" fill="none"><path d="M17.5 11.5A7.5 7.5 0 018.5 2.5a7.5 7.5 0 100 15 7.5 7.5 0 009-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
        }
      </button>

      {/* Status badges — admin only */}
      {!allowedModules && (
        <>
          {dbStatus?.status === 'live'
            ? <div className="conn-badge"><span className="dot dg"></span>Live Data</div>
            : dbStatus?.status === 'checking'
              ? <div className="conn-badge" style={{opacity:.6}}><span className="dot" style={{background:'#9ca3af'}}></span>Connecting…</div>
              : <div className="conn-badge" style={{opacity:.75}}><span className="dot da"></span>Demo Mode</div>
          }
          <div className="ai-badge"><span className="dot dg"></span>AI Active</div>
        </>
      )}

      {/* Keyboard Shortcuts Help */}
      <button
        className="theme-toggle"
        onClick={() => setShortcutsOpen(o => !o)}
        title="Keyboard shortcuts (?)"
        aria-label="Show keyboard shortcuts"
        style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: shortcutsOpen ? 'var(--b2)' : undefined }}
      >?</button>

      {shortcutsOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.55)', zIndex: 9000, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShortcutsOpen(false)}>
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '28px 32px', minWidth: 540, maxWidth: 680, maxHeight: '80vh',
            overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.4)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Keyboard Shortcuts</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>Press <kbd style={KBD}>g</kbd> then a letter to jump to any module</div>
              </div>
              <button onClick={() => setShortcutsOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
              {[
                ['g + h', 'Business Overview'],    ['g + i', 'Stock Intelligence'],
                ['g + s', 'Sales Performance'],     ['g + c', 'Customer Intelligence'],
                ['g + f', 'Finance & Cash'],         ['g + d', 'Demand Forecasting'],
                ['g + p', 'Procurement'],            ['g + u', 'PO & GRN'],
                ['g + l', 'Sales Orders'],           ['g + q', 'Quotation Builder'],
                ['g + t', 'Project Tracker'],        ['g + k', 'Credit Management'],
                ['g + v', 'Counter POS'],            ['g + y', 'Schemes'],
                ['g + b', 'Product Catalog'],        ['g + a', 'Analytics & BI'],
                ['g + n', 'Discount Calculator'],    ['g + m', 'Claims & Rebates'],
                ['g + w', 'Inward & Outward'],       ['g + z', 'Dead Stock'],
                ['g + r', 'Freight Planning'],       ['g + e', 'Settings'],
                ['g + x', 'AI Assistant'],           ['g + j', 'About InvenIQ'],
                ['g + g', 'Warehouse'],              ['g + 1', 'Tally Export'],
                ['g + 2', 'Sales Return'],           ['g + 3', 'Landing Cost'],
                ['g + 4', 'Distributor Portal'],     ['g + 5', 'Damage Recording'],
                ['g + 6', 'Purchase Requisition'],   ['g + 7', 'QC Inspection'],
                ['g + 8', 'Invoice Matching'],       ['g + 9', 'Sales Invoices'],
                ['g + 0', 'Reports & MIS'],          ['g + -', 'Design Quote Studio'],
                ['Ctrl + K', 'Global search'],       ['?', 'This shortcuts panel'],
                ['Esc', 'Close / cancel'],
              ].map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <kbd style={KBD}>{key}</kbd>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              Press <strong>g</strong> to activate navigation mode (2-second window), then press the letter. Shortcuts are disabled when typing in inputs.
            </div>
          </div>
        </div>
      )}

      {/* User Profile */}
      <div className="upro-wrap" ref={profileRef}>
        <button className="upro-btn" onClick={() => setProfileOpen(o => !o)} title="User Profile">
          <div className="ava">{avatarInitials}</div>
          <svg viewBox="0 0 10 6" fill="none" width="9" height="9" style={{color:'var(--text3)',transition:'transform .2s',transform:profileOpen?'rotate(180deg)':'none'}}>
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {profileOpen && (
          <div className="upro-dropdown">
            <div className="upro-header">
              <div className="upro-avatar">{avatarInitials}</div>
              <div>
                <div className="upro-name">{displayName}</div>
                {displayEmail && <div className="upro-email">{displayEmail}</div>}
                <div className="upro-role">{displayRole}</div>
              </div>
            </div>
            <div className="upro-divider" />
            <div className="upro-menu">
              {canNav('overview') && (
                <button className="upro-item" onClick={() => { setProfileOpen(false); onNavigate?.('overview'); }}>
                  <span className="upro-item-icon">🏠</span> Dashboard
                </button>
              )}
              {canNav('chatbot') && (
                <button className="upro-item" onClick={() => { setProfileOpen(false); onNavigate?.('chatbot'); }}>
                  <span className="upro-item-icon">🤖</span> AI Assistant
                </button>
              )}
              {canNav('finance') && (
                <button className="upro-item" onClick={() => { setProfileOpen(false); onNavigate?.('finance'); }}>
                  <span className="upro-item-icon">📊</span> Financial Reports
                </button>
              )}
              {canNav('chatbot') && (
                <button className="upro-item" onClick={() => { setProfileOpen(false); handleAskAI('How can I grow my revenue by 30% this quarter?'); }}>
                  <span className="upro-item-icon">📈</span> Growth Strategy
                </button>
              )}
              {canNav('settings') && (
                <button className="upro-item" onClick={() => { setProfileOpen(false); onNavigate?.('settings'); }}>
                  <span className="upro-item-icon">⚙️</span> Settings & Status
                </button>
              )}
            </div>
            <div className="upro-divider" />
            <div className="upro-meta">
              <div className="upro-meta-row">
                <span>Version</span><strong>InvenIQ v3.7</strong>
              </div>
              <div className="upro-meta-row">
                <span>Build</span><strong>June 2026</strong>
              </div>
            </div>
            <div className="upro-divider" />
            <div className="upro-menu">
              <button
                className="upro-item upro-logout"
                onClick={() => { setProfileOpen(false); onLogout?.(); }}
              >
                <span className="upro-item-icon">🚪</span> Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
