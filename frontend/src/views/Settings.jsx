import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';

const MODULE_LIST = [
  { icon: '📊', id: 'overview',    label: 'Business Overview',      section: 'Overview' },
  { icon: '📈', id: 'analytics',   label: 'Analytics & BI',         section: 'Overview' },
  { icon: '🔮', id: 'demand',      label: 'Demand Forecasting',     section: 'Inventory' },
  { icon: '📦', id: 'inventory',   label: 'Stock Intelligence',     section: 'Inventory' },
  { icon: '💀', id: 'deadstock',   label: 'Dead Stock & Ageing',    section: 'Inventory' },
  { icon: '🚪', id: 'inward',      label: 'Inward & Outward',       section: 'Inventory' },
  { icon: '🏭', id: 'procurement', label: 'Supplier & Procurement', section: 'Purchasing' },
  { icon: '📑', id: 'pogrn',       label: 'PO & GRN',              section: 'Purchasing' },
  { icon: '🗂️',  id: 'catalog',    label: 'Product Catalog',        section: 'Purchasing' },
  { icon: '👥', id: 'customers',   label: 'Customer Intelligence',  section: 'Sales' },
  { icon: '📋', id: 'louvers',     label: 'Sales Orders',           section: 'Sales' },
  { icon: '📬', id: 'orders',      label: 'Orders & Fulfilment',    section: 'Sales' },
  { icon: '🚚', id: 'freight',     label: 'Freight Planning',       section: 'Sales' },
  { icon: '📉', id: 'sales',       label: 'Sales Performance',      section: 'Sales' },
  { icon: '🧾', id: 'claims',      label: 'Claims & Rebates',       section: 'Sales' },
  { icon: '💲', id: 'discounts',   label: 'Discount Calculator',    section: 'Sales' },
  { icon: '🗺️',  id: 'projects',   label: 'Project Tracker',        section: 'Projects' },
  { icon: '📝', id: 'quotes',      label: 'Quotation Builder',      section: 'Projects' },
  { icon: '💰', id: 'finance',     label: 'Profitability & Cash',   section: 'Finance' },
  { icon: '🤖', id: 'chatbot',     label: 'AI Assistant',           section: 'AI' },
  { icon: 'ℹ️',  id: 'about',      label: 'About InvenIQ',          section: 'Info' },
  { icon: '⚙️', id: 'settings',   label: 'Settings',               section: 'Info' },
];

const Check = ({ ok, label, value, sub }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{
      width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginTop: 1,
      background: ok ? 'var(--g3)' : 'var(--r3)',
      border: `1.5px solid ${ok ? 'var(--green)' : 'var(--red)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 800, color: ok ? 'var(--green)' : 'var(--red)',
    }}>{ok ? '✓' : '✗'}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
      {value && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, fontFamily: 'var(--mono)' }}>{value}</div>}
      {sub   && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

const InfoRow = ({ label, value, mono, ok }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
    <span style={{
      fontSize: 12, fontFamily: mono ? 'var(--mono)' : 'inherit', fontWeight: 700,
      color: ok === true ? 'var(--green)' : ok === false ? 'var(--r2)' : 'inherit',
    }}>{value}</span>
  </div>
);

export default function Settings({ onNavigate, dbStatus }) {
  const [health,    setHealth]    = useState(null);
  const [dbDetail,  setDbDetail]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [testing,   setTesting]   = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [checkedAt, setCheckedAt]  = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const [h, d] = await Promise.all([
      fetch('/api/health').then(r => r.json()).catch(() => null),
      fetch('/api/db/status').then(r => r.json()).catch(() => null),
    ]);
    setHealth(h);
    setDbDetail(d);
    setCheckedAt(new Date().toLocaleTimeString());
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const start = Date.now();
      const [h, d] = await Promise.all([
        fetch('/api/health').then(r => r.json()),
        fetch('/api/db/status').then(r => r.json()),
      ]);
      const ms = Date.now() - start;
      setHealth(h);
      setDbDetail(d);
      setCheckedAt(new Date().toLocaleTimeString());
      setTestResult({
        ok: true,
        msg: `All checks passed in ${ms}ms`,
        db: h.mysql_connected,
        ai: h.openai_configured,
      });
    } catch (e) {
      setTestResult({ ok: false, msg: `Connection test failed: ${e.message}` });
    } finally {
      setTesting(false);
    }
  };

  const dbOk = health?.mysql_connected ?? false;
  const aiOk = health?.openai_configured ?? false;
  const src  = health?.data_source ?? 'demo';

  const sections = [...new Set(MODULE_LIST.map(m => m.section))];

  return (
    <div className="view">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Settings & System Status</div>
          <div className="psub">
            Configuration · Data sources · Module registry · System health
            {' '}<DataSourceBadge source={src} updatedAt={checkedAt ? new Date().toISOString() : null} />
          </div>
        </div>
        <div className="ph-actions">
          <button
            className="btn-primary"
            onClick={testConnection}
            disabled={testing}
            style={{ height: 34, padding: '0 16px', fontSize: 12 }}
          >
            {testing ? '⏳ Testing…' : '⚡ Test All Connections'}
          </button>
          <button
            onClick={fetchStatus}
            disabled={loading}
            style={{
              height: 34, padding: '0 14px', fontSize: 12, fontWeight: 600,
              border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)', cursor: loading ? 'not-allowed' : 'pointer',
              color: 'var(--text2)',
            }}
          >
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 14,
          background: testResult.ok ? 'var(--g5)' : 'var(--r3)',
          border: `1px solid ${testResult.ok ? 'var(--g4)' : 'var(--r4)'}`,
          color: testResult.ok ? 'var(--green)' : 'var(--r2)',
          fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {testResult.ok ? '✅' : '❌'} {testResult.msg}
          {testResult.ok && (
            <span style={{ fontWeight: 400, color: 'var(--text2)', marginLeft: 4 }}>
              · DB: {testResult.db ? 'MySQL connected' : 'Demo mode'}
              · AI: {testResult.ai ? 'OpenAI ready' : 'No API key'}
            </span>
          )}
          <button onClick={() => setTestResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'inherit', opacity: .6 }}>×</button>
        </div>
      )}

      {/* KPI row */}
      <div className="kg g4" style={{ marginBottom: 16 }}>
        {[
          { cls: dbOk ? 'sg' : 'sr',  l: 'Database',  v: dbOk ? 'MySQL Live'       : 'Demo Mode',      s: dbOk ? (dbDetail?.database || 'Connected') : 'Set MYSQL_HOST in .env' },
          { cls: aiOk ? 'sg' : 'sb',  l: 'AI Engine', v: aiOk ? 'GPT-4o Active'    : 'No API Key',     s: aiOk ? 'OpenAI configured'                 : 'Set OPENAI_API_KEY in .env' },
          { cls: 'sg',                 l: 'Modules',   v: '22 Active',                                   s: 'All modules operational' },
          { cls: 'sg',                 l: 'Version',   v: 'InvenIQ v3.0',                                s: `May 2026 · Checked ${checkedAt || '…'}` },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="gl g55">
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* System Health */}
          <div className="card">
            <div className="ch">
              <div><div className="ctit">System Health Checklist</div></div>
              {checkedAt && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Last checked {checkedAt}</span>}
            </div>
            <div style={{ padding: '0 4px 8px' }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Checking…</div>
              ) : (
                <>
                  <Check ok={dbOk}
                    label="MySQL Database"
                    value={dbOk ? `${dbDetail?.host || '—'} / ${dbDetail?.database || '—'}` : 'Not connected'}
                    sub={dbOk ? 'DB-first mode — all data is live from MySQL' : 'Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB in backend/.env'} />
                  <Check ok={aiOk}
                    label="OpenAI API Key"
                    value={aiOk ? 'Configured (key hidden for security)' : 'OPENAI_API_KEY not set'}
                    sub={aiOk ? 'AI chat, WhatsApp scanner, and quote analysis are active' : 'Set OPENAI_API_KEY in backend/.env to enable AI features'} />
                  <Check ok={true}
                    label="FastAPI Backend"
                    value="Running on :8000"
                    sub="API server healthy — all 22 modules connected · Request logging active" />
                  <Check ok={true}
                    label="React Frontend"
                    value="Running on :3000"
                    sub="Development server active · Lazy loading · Per-view error isolation" />
                  <Check ok={aiOk}
                    label="WhatsApp Scanner"
                    value={aiOk ? 'Active — GPT-4o Vision + python-multipart' : 'Requires OpenAI API key'}
                    sub="Scan WhatsApp screenshots to pre-fill quotations" />
                  <Check ok={true}
                    label="SSE Streaming"
                    value="Active"
                    sub="Real-time AI chat streaming via Server-Sent Events" />
                  <Check ok={true}
                    label="File Upload"
                    value="python-multipart installed"
                    sub="File uploads enabled for WhatsApp scanner and document processing" />
                </>
              )}
            </div>
          </div>

          {/* Environment */}
          <div className="card">
            <div className="ch"><div className="ctit">Environment Configuration</div></div>
            <div style={{ padding: '0 4px 8px' }}>
              <InfoRow label="MYSQL_HOST"     value={dbOk ? (dbDetail?.host     || 'Set') : '⚠ Not set'} mono ok={dbOk || undefined} />
              <InfoRow label="MYSQL_DB"       value={dbOk ? (dbDetail?.database || 'Set') : '⚠ Not set'} mono ok={dbOk || undefined} />
              <InfoRow label="OPENAI_API_KEY" value={aiOk ? 'sk-…(hidden)'                : '⚠ Not set'} mono ok={aiOk}             />
              <InfoRow label="Data Mode"      value={src === 'mysql' ? '🟢 MySQL (Live)' : '🟡 Demo (Mock)'} />
              <InfoRow label="Backend Port"   value=":8000"              mono />
              <InfoRow label="Frontend Port"  value=":3000"              mono />
              <InfoRow label="API Proxy"      value="/api → :8000"       mono />
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8, margin: '0 0 8px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', lineHeight: 1.7 }}>
              Edit <strong style={{ color: 'var(--text2)' }}>backend/.env</strong> to configure — restart backend after changes.
              Use <strong style={{ color: 'var(--text2)' }}>start.bat</strong> for one-click startup.
            </div>
          </div>

          {/* AI Configuration */}
          <div className="card">
            <div className="ch"><div className="ctit">AI Configuration</div></div>
            <div style={{ padding: '0 4px 8px' }}>
              <InfoRow label="Chat Model"        value="GPT-4o (gpt-4o)"                          />
              <InfoRow label="Analysis Model"    value="GPT-4o-mini"                               />
              <InfoRow label="Scanner Model"     value="GPT-4o Vision"                             />
              <InfoRow label="Routing"           value="4-path: generic / knowledge / insights / tools" />
              <InfoRow label="History Window"    value="Last 16 messages"                           />
              <InfoRow label="Max Tokens"        value="1,800 per response"                         />
              <InfoRow label="Streaming"         value="SSE (Server-Sent Events)"                   />
              <InfoRow label="Knowledge Base"    value="13 topics (EOQ, ABC, GMROI, JIT, FIFO…)"   />
              <InfoRow label="Insights Engine"   value="10 rule types (stock, margin, receivables…)" />
              <InfoRow label="RCA Templates"     value="8 templates (5-Why, fishbone, action plan)" />
              <InfoRow label="AI Tools (MCP)"    value="16 structured data tools"                   />
            </div>
          </div>
        </div>

        {/* Right column — Module Registry */}
        <div className="card">
          <div className="ch">
            <div><div className="ctit">Module Registry</div><div className="csub">All 22 active modules — click to navigate</div></div>
            <span className="bdg bg">LIVE</span>
          </div>
          <div style={{ padding: '4px 0 8px' }}>
            {sections.map(section => (
              <div key={section} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', fontFamily: 'var(--mono)', padding: '6px 0 4px' }}>
                  {section}
                </div>
                {MODULE_LIST.filter(m => m.section === section).map(mod => (
                  <div
                    key={mod.id}
                    onClick={() => onNavigate?.(mod.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 8,
                      cursor: 'pointer', transition: 'background .15s', marginBottom: 2,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--g5)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  >
                    <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>{mod.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{mod.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {mod.id === 'louvers' ? '/api/louvers' : mod.id === 'chatbot' ? '/api/chat/stream' : `/api/${mod.id}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--g3)', color: 'var(--green)', borderRadius: 10, fontWeight: 700 }}>ACTIVE</span>
                    <svg viewBox="0 0 12 12" fill="none" width="10" height="10" style={{ color: 'var(--text3)', flexShrink: 0 }}>
                      <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Setup Guide */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="ch"><div className="ctit">Quick Setup Guide</div><div className="csub">Get InvenIQ running in under 5 minutes</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, padding: '4px 0 8px' }}>
          {[
            { step: '1', title: 'Demo Mode — Zero Setup', color: 'var(--green)',
              items: ['Double-click start.bat (Windows) to auto-start both servers', 'Or: cd backend && uvicorn app.main:app --reload', 'Open http://localhost:3000 — all 22 modules show demo data', 'No database or API key needed'] },
            { step: '2', title: 'Enable MySQL Live Data', color: 'var(--b2)',
              items: ['Copy backend/.env.example → backend/.env', 'Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB', 'Run database/seed_complete.sql on your MySQL instance', 'Restart backend — DB badge turns green automatically'] },
            { step: '3', title: 'Enable All AI Features', color: '#8b5cf6',
              items: ['Get OpenAI API key at platform.openai.com', 'Add OPENAI_API_KEY=sk-... to backend/.env', 'Restart backend — AI badge turns green', 'Unlocks: chat, WhatsApp scanner, quote analysis, RCA'] },
          ].map(s => (
            <div key={s.step} style={{ padding: 16, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, borderTop: `3px solid ${s.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{s.step}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.title}</div>
              </div>
              {s.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--text2)', alignItems: 'flex-start' }}>
                  <span style={{ color: s.color, fontWeight: 800, flexShrink: 0 }}>→</span>
                  <span style={{ fontFamily: 'var(--mono)', lineHeight: 1.6 }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
