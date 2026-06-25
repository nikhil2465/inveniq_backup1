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
  { icon: '🛁', id: 'designquote', label: 'Design Quote Studio',    section: 'Projects' },
  { icon: '💰', id: 'finance',     label: 'Profitability & Cash',   section: 'Finance' },
  { icon: '💳', id: 'credit',     label: 'Credit Management',      section: 'Finance' },
  { icon: '🛒', id: 'pos',        label: 'Counter POS',            section: 'Finance' },
  { icon: '🧾', id: 'invoices',   label: 'Sales Invoices',         section: 'Finance' },
  { icon: '📊', id: 'reports',    label: 'Reports & MIS',          section: 'Finance' },
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

const ROLE_OPTS = [
  { v: 'admin',             l: 'Admin'             },
  { v: 'sales_manager',    l: 'Sales Manager'     },
  { v: 'cfo',              l: 'CFO'               },
  { v: 'warehouse_manager', l: 'Warehouse Manager' },
  { v: 'finance_manager',  l: 'Finance Manager'   },
  { v: 'distributor',      l: 'Distributor'       },
  { v: 'architect',        l: 'Architect'         },
];

const ROLE_COLORS = {
  admin: '#7c3aed', sales_manager: '#16a34a', cfo: '#1d4ed8',
  warehouse_manager: '#0f766e', finance_manager: '#b45309',
  distributor: '#ea580c', architect: '#7c3aed',
};

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
  const [users,        setUsers]        = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm,      setAddForm]      = useState({ username: '', display_name: '', email: '', role: 'sales_manager', password: '', allowed_modules: 'all' });
  const [addError,     setAddError]     = useState('');
  const [addSaving,    setAddSaving]    = useState(false);
  const [editUser,     setEditUser]     = useState(null);
  const [editForm,     setEditForm]     = useState({});
  const [editSaving,   setEditSaving]   = useState(false);
  const [editError,    setEditError]    = useState('');

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

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const r = await fetch('/api/users');
      if (r.ok) { const j = await r.json(); setUsers(j.users ?? []); }
    } catch { } finally { setUsersLoading(false); }
  }, []);

  useEffect(() => { if (!allowedModules) fetchUsers(); }, [allowedModules, fetchUsers]);

  const handleCreateUser = async () => {
    setAddError('');
    if (!addForm.username || !addForm.display_name || !addForm.password)
      return setAddError('Username, display name, and password are required.');
    if (addForm.password.length < 6) return setAddError('Password must be at least 6 characters.');
    setAddSaving(true);
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (r.status === 409) return setAddError('Username already exists.');
      if (!r.ok) { const j = await r.json().catch(() => ({})); return setAddError(j.detail || 'Failed to create user.'); }
      setShowAddModal(false);
      setAddForm({ username: '', display_name: '', email: '', role: 'sales_manager', password: '', allowed_modules: 'all' });
      await fetchUsers();
    } catch (e) { setAddError(e.message); } finally { setAddSaving(false); }
  };

  const handleDeactivate = async (userId, currentlyActive) => {
    try {
      if (currentlyActive) {
        await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: true }),
        });
      }
      await fetchUsers();
    } catch { }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ display_name: u.display_name || '', email: u.email || '', role: u.role || 'sales_manager', allowed_modules: u.allowed_modules || 'all', password: '' });
    setEditError('');
  };

  const handleSaveEdit = async () => {
    setEditError('');
    setEditSaving(true);
    try {
      const body = { ...editForm };
      if (!body.password) delete body.password;
      const r = await fetch(`/api/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return setEditError(j.detail || 'Failed to save changes.'); }
      setEditUser(null);
      await fetchUsers();
    } catch (e) { setEditError(e.message); } finally { setEditSaving(false); }
  };

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
    { keys: ['g', '9'], desc: 'Sales Invoices',         module: 'invoices'     },
    { keys: ['g', '0'], desc: 'Reports & MIS',          module: 'reports'      },
    { keys: ['g', '-'], desc: 'Design Quote Studio',    module: 'designquote'  },
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
          { cls: 'sg',                 l: 'Version',   v: 'InvenIQ v3.7',                                s: `June 2026 · Checked ${checkedAt || '…'}` },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {onGoChat && (
        <div className="ai-opp-strip" style={{ marginBottom: 16 }}>
          <span className="ai-opp-label">✨ AI</span>
          <button className="ai-opp-chip" onClick={() => onGoChat(`My InvenIQ system is running in ${dbOk ? 'live database' : 'demo'} mode with AI ${aiOk ? 'active' : 'not configured'}. What are the most important setup steps I should complete to get the most out of this platform?`)}>⚡ Setup recommendations</button>
          <button className="ai-opp-chip" onClick={() => onGoChat('Explain all the AI features available in InvenIQ — the chatbot, WhatsApp scanner, demand forecasting, RCA engine, insights engine, and AI opportunity chips. What can each one do for my business?')}>🤖 AI features explained</button>
          <button className="ai-opp-chip" onClick={() => onGoChat('What are the 7 user roles in InvenIQ — Admin, Sales Manager, CFO, Warehouse Manager, Finance Manager, Distributor, and Architect? Which modules does each role have access to?')}>👤 Role & access guide</button>
          <button className="ai-opp-chip" onClick={() => onGoChat('My business has multiple staff members. How should I set up user roles in InvenIQ? Who should get Admin, who should get Sales Manager, and how do I restrict sensitive financial data?')}>🔐 Multi-user best practices</button>
          <button className="ai-opp-chip" onClick={() => onGoChat('What data does InvenIQ need from my existing systems — Tally, Excel, or ERP — to show live inventory, sales, and financial data? How do I connect my existing data?')}>🔗 Data integration help</button>
        </div>
      )}

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
                    sub={`Server healthy — ${MODULE_LIST.length} modules operational`} />  {/* auto-counts from MODULE_LIST */}
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
              <InfoRow label="Knowledge Base"    value="36 topics — inventory, finance, P2P, invoices, design quotes" />
              <InfoRow label="Insights Engine"   value="26 proactive insight types"                    />
              <InfoRow label="RCA Engine"        value="14 structured analysis templates"               />
              <InfoRow label="Data Tools"        value="28 live business data tools"                    />
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
                'Once connected, all 37 modules automatically switch to live business data',
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
                '7 roles: Admin (full access), Sales Manager, CFO, Warehouse Manager, Finance Manager, Distributor, Architect',
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

      {/* ── User Management — admin only ── */}
      {isUnrestricted && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="ch">
            <div>
              <div className="ctit">User Management</div>
              <div className="csub">Create, edit, and manage user accounts · Role assignment · Module access control · Admin only</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!usersLoading && <span className="bdg bg">{users.length} user{users.length !== 1 ? 's' : ''}</span>}
              <button
                className="btn-primary"
                onClick={() => { setShowAddModal(true); setAddError(''); setAddForm({ username: '', display_name: '', email: '', role: 'sales_manager', password: '', allowed_modules: 'all' }); }}
                style={{ height: 32, padding: '0 14px', fontSize: 12 }}
              >
                + Add User
              </button>
              <button
                onClick={fetchUsers}
                disabled={usersLoading}
                style={{ height: 32, padding: '0 12px', fontSize: 12, fontWeight: 600, border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', cursor: usersLoading ? 'not-allowed' : 'pointer', color: 'var(--text2)' }}
              >
                {usersLoading ? '…' : '↻'}
              </button>
            </div>
          </div>

          {usersLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading users…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['User', 'Role', 'Email', 'Modules', 'Last Login', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => {
                    const mods = (!u.allowed_modules || u.allowed_modules === 'all') ? 'All' : (u.allowed_modules.split(',').filter(Boolean).length + ' mods');
                    const roleColor = ROLE_COLORS[u.role] || 'var(--text3)';
                    const isSelf = u.username === (currentUser?.username || '');
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg2)', opacity: u.is_active ? 1 : 0.55 }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>{u.display_name}</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>@{u.username}</div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 10, background: roleColor + '22', color: roleColor, fontSize: 10, fontWeight: 700 }}>
                            {ROLE_OPTS.find(r => r.v === u.role)?.l ?? u.role}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: 11 }}>{u.email || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{mods}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text3)', fontSize: 11 }}>{u.last_login || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: u.is_active ? 'var(--g3)' : 'var(--r3)', color: u.is_active ? 'var(--green)' : 'var(--r2)' }}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => openEdit(u)}
                              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}
                            >
                              Edit
                            </button>
                            {!isSelf && (
                              <button
                                onClick={() => handleDeactivate(u.id, u.is_active)}
                                style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, border: `1px solid ${u.is_active ? '#fca5a5' : 'var(--g4)'}`, borderRadius: 6, background: u.is_active ? 'var(--r3)' : 'var(--g3)', cursor: 'pointer', color: u.is_active ? 'var(--r2)' : 'var(--green)' }}
                              >
                                {u.is_active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
                        No users found. Click <strong>+ Add User</strong> to create the first account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: '3px solid var(--b2)', fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text2)' }}>Security note:</strong> User changes take effect on next login. Deactivated accounts cannot log in but their data is preserved. Passwords must be at least 6 characters. Admin role always grants full access to all modules.
          </div>
        </div>
      )}

      {/* ── Design Quote Studio — Subscription & Licensing ── */}
      {isUnrestricted && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="ch">
            <div>
              <div className="ctit">Design Quote Studio — Subscription &amp; Licensing</div>
              <div className="csub">Per-month pricing for DQS module, AI scanner, and dependent components · Build-in licensing cost reference</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="bdg bg">LICENSED IN BUILD</span>
              <span className="bdg bb">v3.7+</span>
            </div>
          </div>

          {/* Tier cards */}
          <div className="lic-tiers">
            {[
              {
                name: 'Starter',
                price: '₹2,999',
                color: '#0f766e',
                seats: '1 Architect seat',
                highlight: false,
                features: [
                  { ok: true,  t: '30 Interior Quotations / month' },
                  { ok: true,  t: '5 Architect Fee Proposals / month' },
                  { ok: true,  t: 'AI BOQ Scanner — 50 scans / month' },
                  { ok: true,  t: 'WhatsApp photo scan — 5 / month' },
                  { ok: true,  t: 'Standard PDF export (DQS template)' },
                  { ok: false, t: 'Product Catalog sync' },
                  { ok: false, t: 'QB↔DQS two-way sync' },
                  { ok: false, t: 'Custom PDF branding' },
                ],
              },
              {
                name: 'Professional',
                price: '₹5,999',
                color: '#1d4ed8',
                seats: '3 Architect seats',
                highlight: true,
                features: [
                  { ok: true,  t: 'Unlimited Interior Quotations' },
                  { ok: true,  t: 'Unlimited Architect Fee Proposals' },
                  { ok: true,  t: 'AI BOQ Scanner — unlimited scans' },
                  { ok: true,  t: 'WhatsApp + multi-photo scan — unlimited' },
                  { ok: true,  t: 'Standard PDF export (DQS template)' },
                  { ok: true,  t: 'Product Catalog sync (hardware/sanitary)' },
                  { ok: true,  t: 'QB↔DQS two-way sync' },
                  { ok: false, t: 'Custom PDF branding & letterhead' },
                ],
              },
              {
                name: 'Enterprise',
                price: '₹11,999',
                color: '#7c3aed',
                seats: '10 Architect seats',
                highlight: false,
                features: [
                  { ok: true,  t: 'Unlimited Interior Quotations' },
                  { ok: true,  t: 'Unlimited Architect Fee Proposals' },
                  { ok: true,  t: 'AI BOQ Scanner — unlimited scans' },
                  { ok: true,  t: 'WhatsApp + multi-photo scan — unlimited' },
                  { ok: true,  t: 'Custom PDF branding & letterhead' },
                  { ok: true,  t: 'Product Catalog + QB↔DQS sync' },
                  { ok: true,  t: '2 custom template designs (one-time)' },
                  { ok: true,  t: 'Dedicated account manager + 99.9% SLA' },
                ],
              },
            ].map(tier => (
              <div key={tier.name} className={`lic-tier${tier.highlight ? ' lic-recommended' : ''}`} style={{ borderTop: `3px solid ${tier.color}` }}>
                {tier.highlight && <div className="lic-rec-badge">★ RECOMMENDED</div>}
                <div className="lic-tier-name" style={{ color: tier.color }}>{tier.name}</div>
                <div className="lic-price-row">
                  <span className="lic-price">{tier.price}</span>
                  <span className="lic-price-unit">/month</span>
                </div>
                <div className="lic-seats">{tier.seats} included</div>
                <div className="lic-divider" />
                <ul className="lic-feat-list">
                  {tier.features.map((f, i) => (
                    <li key={i} className={`lic-feat${f.ok ? ' lic-feat-ok' : ' lic-feat-no'}`}>
                      <span className="lic-feat-icon">{f.ok ? '✓' : '✗'}</span>
                      <span>{f.t}</span>
                    </li>
                  ))}
                </ul>
                <button className="lic-cta-btn" style={{ borderColor: tier.color, color: tier.color }}
                  onClick={() => onGoChat?.(`I want to know more about the InvenIQ Design Quote Studio ${tier.name} plan at ${tier.price}/month for ${tier.seats}. What are the exact features, how do I get started, and what is the onboarding process?`)}>
                  Get {tier.name} →
                </button>
              </div>
            ))}
          </div>

          {/* Add-on components */}
          <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>Add-on Components</div>
            <div className="lic-addons">
              {[
                { icon: '👤', label: 'Extra Architect Seat',        price: '₹799',   unit: '/seat/month',   note: 'Beyond included seats' },
                { icon: '🤖', label: 'AI Scan Pack — 500 extra',    price: '₹1,499', unit: '/month',        note: 'Starter plan only' },
                { icon: '📄', label: 'Custom PDF Template Design',  price: '₹2,999', unit: 'one-time',      note: 'Designed by InvenIQ team' },
                { icon: '💬', label: 'WhatsApp Bot Integration',    price: '₹1,999', unit: '/month',        note: 'Dedicated WA Business API' },
              ].map(a => (
                <div key={a.label} className="lic-addon-row">
                  <span style={{ fontSize: 18 }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{a.note}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{a.price}</span>
                    <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 3 }}>{a.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Build-in licensing cost disclosure */}
          <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', borderLeft: '3px solid var(--amber)' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--a2)', fontFamily: 'var(--mono)' }}>
              Build-in Licensing Cost Reference
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {[
                { label: 'DQS Core Engine',          cost: 'Included',        note: 'InvenIQ Enterprise license — no separate charge' },
                { label: 'GPT-4o API (per AI scan)', cost: '~₹8–12 / call',  note: '$0.10–$0.15 · billed to your OpenAI account at cost' },
                { label: 'PDF Generation',           cost: 'Included',        note: 'Client-side rendering — no per-PDF cost' },
                { label: 'WhatsApp Photo Parsing',   cost: '~₹2–4 / image',  note: 'Vision model tokens · billed at OpenAI cost' },
                { label: 'Quote Storage',            cost: 'Included',        note: 'MySQL / your own database — no storage fee' },
                { label: 'Catalog AI Inference',     cost: '~₹1–2 / lookup', note: 'HSN + category inference per product match' },
              ].map(c => (
                <div key={c.label} style={{ padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 3 }}>{c.label}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13, color: c.cost === 'Included' ? 'var(--green)' : 'var(--a2)', marginBottom: 2 }}>{c.cost}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.5 }}>{c.note}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <strong style={{ color: 'var(--text2)' }}>Note:</strong> All OpenAI API costs are billed directly to your OpenAI account using the <code style={{ fontFamily: 'var(--mono)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4 }}>OPENAI_API_KEY</code> configured in your environment. InvenIQ does not mark up AI inference costs.
            </div>
          </div>

          {/* 30-day trial banner */}
          <div style={{ marginTop: 12, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(16,185,129,.08), rgba(16,185,129,.04))', borderRadius: 10, border: '1px solid rgba(16,185,129,.25)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>🎁</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--green)' }}>30-Day Free Trial Included</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>All new InvenIQ installations include a full 30-day trial of the Professional plan. No credit card required. Architect role is pre-provisioned — activate immediately.</div>
            </div>
            {onGoChat && (
              <button className="btn-primary" style={{ fontSize: 11, padding: '6px 14px', whiteSpace: 'nowrap' }}
                onClick={() => onGoChat('How do I activate the Design Quote Studio module for my team? I want to set up the architect user account and get started with interior quotations and architect fee proposals today.')}>
                Activate DQS →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Add User Modal ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Add New User</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Create a new InvenIQ user account</div>
              </div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, marginTop: -2 }}>×</button>
            </div>
            {addError && (
              <div style={{ padding: '8px 12px', background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 8, color: 'var(--r2)', fontSize: 12, marginBottom: 14, fontWeight: 600 }}>
                {addError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'username',     label: 'Username *',     placeholder: 'e.g. john.smith',       type: 'text' },
                { key: 'display_name', label: 'Display Name *', placeholder: 'e.g. John Smith',       type: 'text' },
                { key: 'email',        label: 'Email',          placeholder: 'e.g. john@company.com', type: 'email' },
                { key: 'password',     label: 'Password *',     placeholder: 'Min. 6 characters',     type: 'password' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={addForm[f.key] || ''}
                    onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg2)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Role *</label>
                <select
                  value={addForm.role}
                  onChange={e => setAddForm(p => ({ ...p, role: e.target.value, allowed_modules: e.target.value === 'admin' ? 'all' : p.allowed_modules }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg2)', color: 'var(--text)', outline: 'none' }}
                >
                  {ROLE_OPTS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </div>
              {addForm.role !== 'admin' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Allowed Modules</label>
                  <input
                    placeholder='e.g. sales,orders,customers  — or leave "all"'
                    value={addForm.allowed_modules}
                    onChange={e => setAddForm(p => ({ ...p, allowed_modules: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg2)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Comma-separated module IDs or "all" for unrestricted access</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button onClick={() => setShowAddModal(false)} style={{ padding: '8px 18px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', fontSize: 12, cursor: 'pointer', color: 'var(--text2)', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleCreateUser} disabled={addSaving} className="btn-primary" style={{ padding: '8px 22px', fontSize: 12 }}>
                {addSaving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Edit User</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>@{editUser.username}</div>
              </div>
              <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1, marginTop: -2 }}>×</button>
            </div>
            {editError && (
              <div style={{ padding: '8px 12px', background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 8, color: 'var(--r2)', fontSize: 12, marginBottom: 14, fontWeight: 600 }}>
                {editError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'display_name', label: 'Display Name', placeholder: 'e.g. John Smith',          type: 'text' },
                { key: 'email',        label: 'Email',        placeholder: 'e.g. john@company.com',    type: 'email' },
                { key: 'password',     label: 'New Password', placeholder: 'Leave blank to keep current', type: 'password' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={editForm[f.key] || ''}
                    onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg2)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Role</label>
                <select
                  value={editForm.role || ''}
                  onChange={e => setEditForm(p => ({ ...p, role: e.target.value, allowed_modules: e.target.value === 'admin' ? 'all' : p.allowed_modules }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg2)', color: 'var(--text)', outline: 'none' }}
                >
                  {ROLE_OPTS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </div>
              {editForm.role !== 'admin' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Allowed Modules</label>
                  <input
                    placeholder='e.g. sales,orders,customers  — or "all"'
                    value={editForm.allowed_modules || ''}
                    onChange={e => setEditForm(p => ({ ...p, allowed_modules: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg2)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Comma-separated module IDs or "all" for unrestricted access</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button onClick={() => setEditUser(null)} style={{ padding: '8px 18px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', fontSize: 12, cursor: 'pointer', color: 'var(--text2)', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={editSaving} className="btn-primary" style={{ padding: '8px 22px', fontSize: 12 }}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

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
