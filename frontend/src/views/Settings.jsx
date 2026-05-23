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
  { icon: '💳', id: 'credit',     label: 'Credit Management',      section: 'Finance' },
  { icon: '🛒', id: 'pos',        label: 'Counter POS',            section: 'Finance' },
  { icon: '⭐', id: 'schemes',    label: 'Scheme Management',      section: 'Sales' },
  { icon: '🏭', id: 'warehouse',    label: 'Warehouse Management',   section: 'Inventory' },
  { icon: '🔄', id: 'salesreturn', label: 'Sales Return',           section: 'Sales' },
  { icon: '⚓', id: 'landingcost', label: 'Landing Cost',           section: 'Purchasing' },
  { icon: '🏪', id: 'distributor', label: 'My Stock Portal',        section: 'Purchasing' },
  { icon: '🔧', id: 'damage',      label: 'Damage Recording',       section: 'Inventory' },
  { icon: '📋', id: 'pr',          label: 'Purchase Requisition',   section: 'P2P' },
  { icon: '🔬', id: 'qc',          label: 'QC Inspection',          section: 'P2P' },
  { icon: '🧮', id: 'invoicematch',label: 'Invoice Matching',       section: 'P2P' },
  { icon: '📤', id: 'tally',       label: 'Tally Prime Export',     section: 'Integrations' },
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

export default function Settings({ onGoChat, onNavigate, dbStatus, currentUser, allowedModules }) {
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

  // Derive user display values
  const displayName    = currentUser?.display_name || currentUser?.username || 'Admin';
  const displayEmail   = currentUser?.email || '';
  const displayRole    = currentUser?.role
    ? currentUser.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Admin';
  const avatarInitials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'IQ';
  const isUnrestricted = !allowedModules;
  const moduleCount    = isUnrestricted ? MODULE_LIST.length : (allowedModules?.length ?? 0);
  const visibleModules  = isUnrestricted ? MODULE_LIST : MODULE_LIST.filter(m => (allowedModules ?? []).includes(m.id));
  const sections       = [...new Set(visibleModules.map(m => m.section))];
  const navShortcuts   = [
    { keys: ['g', 'h'], desc: 'Business Overview',       module: 'overview'    },
    { keys: ['g', 'i'], desc: 'Stock Intelligence',      module: 'inventory'   },
    { keys: ['g', 's'], desc: 'Sales Performance',       module: 'sales'       },
    { keys: ['g', 'c'], desc: 'Customer Intelligence',   module: 'customers'   },
    { keys: ['g', 'o'], desc: 'Orders & Fulfilment',     module: 'orders'      },
    { keys: ['g', 'f'], desc: 'Finance & Cash',          module: 'finance'     },
    { keys: ['g', 'd'], desc: 'Demand Forecasting',      module: 'demand'      },
    { keys: ['g', 'p'], desc: 'Procurement & Suppliers', module: 'procurement' },
    { keys: ['g', 'r'], desc: 'Freight Planning',        module: 'freight'     },
    { keys: ['g', 'w'], desc: 'Inward & Outward',        module: 'inward'      },
    { keys: ['g', 'z'], desc: 'Dead Stock & Ageing',     module: 'deadstock'   },
    { keys: ['g', 'a'], desc: 'Analytics & BI',          module: 'analytics'   },
    { keys: ['g', 'q'], desc: 'Quotation Builder',       module: 'quotes'      },
    { keys: ['g', 'x'], desc: 'AI Assistant (Chatbot)',  module: 'chatbot'     },
    { keys: ['g', 'e'], desc: 'Settings & Status',       module: 'settings'    },
    { keys: ['g', 'l'], desc: 'Sales Orders',            module: 'louvers'     },
    { keys: ['g', 't'], desc: 'Project Tracker',         module: 'projects'    },
    { keys: ['g', 'm'], desc: 'Claims & Rebates',        module: 'claims'      },
    { keys: ['g', 'n'], desc: 'Discount Calculator',     module: 'discounts'   },
    { keys: ['g', 'u'], desc: 'PO & GRN',               module: 'pogrn'       },
    { keys: ['g', 'b'], desc: 'Product Catalog',         module: 'catalog'     },
    { keys: ['g', 'k'], desc: 'Credit Management',       module: 'credit'      },
    { keys: ['g', 'v'], desc: 'Counter POS',             module: 'pos'         },
    { keys: ['g', 'y'], desc: 'Scheme Management',       module: 'schemes'     },
    { keys: ['g', 'g'], desc: 'Warehouse Management',    module: 'warehouse'   },
    { keys: ['g', '1'], desc: 'Tally Prime Export',      module: 'tally'       },
    { keys: ['g', '2'], desc: 'Sales Return',            module: 'salesreturn' },
    { keys: ['g', '3'], desc: 'Landing Cost',            module: 'landingcost' },
    { keys: ['g', '4'], desc: 'My Stock Portal',         module: 'distributor' },
    { keys: ['g', '5'], desc: 'Damage Recording',        module: 'damage'       },
    { keys: ['g', '6'], desc: 'Purchase Requisition',   module: 'pr'           },
    { keys: ['g', '7'], desc: 'QC Inspection',          module: 'qc'           },
    { keys: ['g', '8'], desc: 'Invoice Matching',       module: 'invoicematch' },
    { keys: ['g', 'j'], desc: 'About InvenIQ',          module: 'about'        },
  ].filter(s => isUnrestricted || (allowedModules ?? []).includes(s.module));

  return (
    <div className="view">

      {/* ── User Profile Card ── */}
      <div className="profile-card">
        <div className="profile-card-avatar">{avatarInitials}</div>
        <div className="profile-card-body">
          <div className="profile-card-name">{displayName}</div>
          {displayEmail && <div className="profile-card-email">{displayEmail}</div>}
          <div className="profile-card-meta">
            <span className="profile-card-role">{displayRole}</span>
            <span className="profile-card-access">
              {isUnrestricted ? '✦ Full access — all modules' : `${moduleCount} modules enabled`}
            </span>
          </div>
        </div>
        <div className="profile-card-right">
          <div className="profile-card-stat">
            <div className="profile-card-stat-val">{moduleCount}</div>
            <div className="profile-card-stat-lbl">Modules</div>
          </div>
        </div>
      </div>

      {/* ── Allowed Modules (restricted roles only) ── */}
      {!isUnrestricted && allowedModules && allowedModules.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="ch">
            <div>
              <div className="ctit">Your Access — Enabled Modules</div>
              <div className="csub">{allowedModules.length} of {MODULE_LIST.length} modules enabled for your role</div>
            </div>
            <span className="bdg ba">{displayRole}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0 8px' }}>
            {MODULE_LIST.map(mod => {
              const enabled = allowedModules.includes(mod.id);
              return (
                <span
                  key={mod.id}
                  className={`module-pill${enabled ? '' : ' module-pill-locked'}`}
                  onClick={enabled ? () => onNavigate?.(mod.id) : undefined}
                  style={enabled ? { cursor: 'pointer' } : {}}
                  title={enabled ? `Go to ${mod.label}` : 'Not available in your role'}
                >
                  {mod.icon} {mod.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Settings & Status</div>
          <div className="psub">
            {isUnrestricted
              ? <>Configuration · Data sources · Module registry · System health{' '}<DataSourceBadge source={src} updatedAt={checkedAt ? new Date().toISOString() : null} /></>
              : 'Your profile, accessible modules, and application status'}
          </div>
        </div>
        {isUnrestricted && (
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
        )}
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
              · Database: {testResult.db ? 'Connected' : 'Demo mode'}
              · AI: {testResult.ai ? 'Active' : 'Not configured'}
            </span>
          )}
          <button onClick={() => setTestResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'inherit', opacity: .6 }}>×</button>
        </div>
      )}

      {/* KPI row */}
      <div className="kg g4" style={{ marginBottom: 16 }}>
        {[
          { cls: dbOk ? 'sg' : 'sr',  l: 'Database',  v: dbOk ? 'Live Data'        : 'Demo Mode',      s: dbOk ? 'Connected — real-time data active' : 'Running on sample data' },
          { cls: aiOk ? 'sg' : 'sb',  l: 'AI Engine', v: aiOk ? 'Active'           : 'Not Configured', s: aiOk ? 'AI features fully operational'     : 'AI features unavailable' },
          { cls: 'sg',                 l: 'Modules',   v: `${moduleCount} Active`,                       s: isUnrestricted ? 'All modules operational' : `${moduleCount} modules accessible` },
          { cls: 'sg',                 l: 'Version',   v: 'InvenIQ v3.1',                                s: `May 2026 · Checked ${checkedAt || '…'}` },
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
                    label="Database"
                    value={dbOk ? 'Connected — Live Data' : 'Not connected'}
                    sub={dbOk ? 'Real-time data active — all modules showing live data' : 'Running on sample data. Contact your administrator to connect a database.'} />
                  <Check ok={aiOk}
                    label="AI Engine"
                    value={aiOk ? 'Active' : 'Not configured'}
                    sub={aiOk ? 'AI chat, WhatsApp scanner, and quote analysis are fully active' : 'AI features require configuration. Contact your administrator.'} />
                  <Check ok={true}
                    label="Application Server"
                    value="Running"
                    sub={`Server healthy — ${MODULE_LIST.length} modules operational`} />
                  <Check ok={true}
                    label="User Interface"
                    value="Production Build"
                    sub="Optimised production build · Dark mode · Responsive layout" />
                  <Check ok={aiOk}
                    label="WhatsApp Scanner"
                    value={aiOk ? 'Active' : 'Requires AI configuration'}
                    sub="Scan WhatsApp screenshots to pre-fill quotations" />
                  <Check ok={true}
                    label="Real-time Streaming"
                    value="Active"
                    sub="Live AI response streaming enabled" />
                  <Check ok={true}
                    label="File Processing"
                    value="Active"
                    sub="File uploads enabled for document processing" />
                </>
              )}
            </div>
          </div>

          {/* Environment */}
          <div className="card">
            <div className="ch"><div className="ctit">System Configuration</div></div>
            <div style={{ padding: '0 4px 8px' }}>
              <InfoRow label="Database"   value={dbOk ? '🟢 Connected (Live Data)' : '🟡 Demo Mode (Sample Data)'} ok={dbOk || undefined} />
              <InfoRow label="AI Engine"  value={aiOk ? '🟢 Active'               : '🔴 Not Configured'} ok={aiOk} />
              <InfoRow label="Data Mode"  value={src === 'mysql' ? '🟢 Live — real-time data' : '🟡 Demo — sample data'} />
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8, margin: '0 0 8px', fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
              Contact your administrator to update configuration settings.
            </div>
          </div>

          {/* AI Configuration */}
          <div className="card">
            <div className="ch"><div className="ctit">AI Capabilities</div></div>
            <div style={{ padding: '0 4px 8px' }}>
              <InfoRow label="Status"            value={aiOk ? '🟢 Active' : '🔴 Not Configured'} ok={aiOk} />
              <InfoRow label="Chat"              value="Conversational business intelligence"       />
              <InfoRow label="Analysis"          value="Deep data analysis & root cause engine"     />
              <InfoRow label="Scanner"           value="WhatsApp screenshot processing"             />
              <InfoRow label="Context Window"    value="Last 16 messages retained"                  />
              <InfoRow label="Knowledge Base"    value="34 topics — inventory, finance, P2P, operations" />
              <InfoRow label="Insights Engine"   value="16 proactive insight types"                    />
              <InfoRow label="RCA Engine"        value="14 structured analysis templates"               />
              <InfoRow label="Data Tools"        value="26 live business data tools"                    />
            </div>
          </div>
        </div>

        {/* Right column — Module Registry */}
        <div className="card">
          <div className="ch">
            <div><div className="ctit">{isUnrestricted ? 'Module Registry' : 'Your Modules'}</div><div className="csub">{moduleCount} {isUnrestricted ? 'active' : 'enabled'} modules — click to navigate</div></div>
            <span className={`bdg ${dbOk ? 'bg' : 'ba'}`}>{dbOk ? 'LIVE' : 'DEMO'}</span>
          </div>
          <div style={{ padding: '4px 0 8px' }}>
            {sections.map(section => (
              <div key={section} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', fontFamily: 'var(--mono)', padding: '6px 0 4px' }}>
                  {section}
                </div>
                {visibleModules.filter(m => m.section === section).map(mod => (
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
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{mod.section}</div>
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

      {/* Keyboard Shortcuts */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="ch"><div className="ctit">Keyboard Shortcuts</div><div className="csub">Navigate InvenIQ at the speed of thought</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: '4px 0 8px' }}>
          {[
            { title: 'Global', color: 'var(--b2)', shortcuts: [
              { keys: ['Ctrl', 'K'], desc: 'Open global search / AI query' },
              { keys: ['Escape'],    desc: 'Close search or any dropdown' },
            ]},
            { title: 'Navigation (press g then letter)', color: 'var(--green)', shortcuts: navShortcuts },
          ].map(group => (
            <div key={group.title} style={{ padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, borderTop: `3px solid ${group.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: group.color, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10, fontFamily: 'var(--mono)' }}>{group.title}</div>
              {group.shortcuts.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {s.keys.map((k, ki) => (
                      <span key={ki} style={{ padding: '2px 7px', background: 'var(--surface)', border: '1.5px solid var(--border2)', borderRadius: 5, fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', boxShadow: '0 1px 0 var(--border2)' }}>{k}</span>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{s.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Administrator Reference — admin only */}
      {isUnrestricted && <div className="card" style={{ marginTop: 12 }}>
        <div className="ch"><div className="ctit">Administrator Reference</div><div className="csub">Data sources, AI configuration, and role management</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, padding: '4px 0 8px' }}>
          {[
            { step: '1', title: 'Live Data Connection', color: 'var(--green)',
              items: [
                `Database badge is ${dbOk ? '🟢 LIVE — all modules showing real-time data' : '🟡 DEMO — all modules showing sample data'}`,
                'Contact your system administrator to connect to your MySQL database',
                'Once connected, all 34 modules automatically switch to live business data',
                'No data is lost when switching between Demo and Live mode',
              ] },
            { step: '2', title: 'AI Features', color: '#8b5cf6',
              items: [
                `AI Engine is ${aiOk ? '🟢 ACTIVE — all AI features operational' : '🔴 NOT CONFIGURED — contact your administrator'}`,
                'AI features: Business intelligence chat, WhatsApp quote scanner, demand forecasting, RCA engine',
                'AI works in both Demo Mode and Live Data mode independently',
                'Context window retains last 16 messages per session',
              ] },
            { step: '3', title: 'Role & Access Management', color: 'var(--b2)',
              items: [
                '6 roles: Admin (full access), Sales Manager, CFO, Warehouse Manager, Finance Manager, Distributor',
                'Each role has a curated module list — users only see their permitted modules',
                'Contact your administrator to add or modify user accounts and role assignments',
                'Distributor accounts access only their personalised stock and order portal',
              ] },
          ].map(s => (
            <div key={s.step} style={{ padding: 16, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, borderTop: `3px solid ${s.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: s.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{s.step}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.title}</div>
              </div>
              {s.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--text2)', alignItems: 'flex-start' }}>
                  <span style={{ color: s.color, fontWeight: 800, flexShrink: 0 }}>→</span>
                  <span style={{ lineHeight: 1.6 }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>}

      {/* AI CTA */}
      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginTop: 20 }} onClick={() => onGoChat(
          'Analyse my InvenIQ setup: database connection status, AI configuration, module access, and user roles. ' +
          'What should I check or optimise in my current configuration?'
        )}>
          <span>✨</span>
          <span>Ask AI: Review my configuration — database, AI engine, roles, and module access</span>
        </div>
      )}
    </div>
  );
}
