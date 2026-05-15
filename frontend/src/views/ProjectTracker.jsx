import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import Pagination from '../components/Pagination';

const fmt  = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL = (n) => { const v = Number(n); return v >= 100000 ? `₹${(v / 100000).toFixed(2)}L` : fmt(v); };

const STAGE_CONFIG = {
  INQUIRY:       { label: 'Inquiry',       color: '#6b7280', bg: '#f3f4f6', icon: '📩' },
  QUOTE_SENT:    { label: 'Quote Sent',    color: '#2563eb', bg: '#dbeafe', icon: '📋' },
  NEGOTIATING:   { label: 'Negotiating',   color: '#d97706', bg: '#fef3c7', icon: '🤝' },
  WON:           { label: 'Won',           color: '#15803d', bg: '#dcfce7', icon: '🏆' },
  LOST:          { label: 'Lost',          color: '#dc2626', bg: '#fee2e2', icon: '❌' },
  IN_PRODUCTION: { label: 'In Production', color: '#0e7490', bg: '#cffafe', icon: '🏭' },
  DISPATCHED:    { label: 'Dispatched',    color: '#7c3aed', bg: '#f3e8ff', icon: '🚚' },
  DELIVERED:     { label: 'Delivered',     color: '#15803d', bg: '#d1fae5', icon: '✅' },
  INVOICED:      { label: 'Invoiced',      color: '#374151', bg: '#e5e7eb', icon: '📄' },
};

const PRIORITY_CONFIG = {
  CRITICAL: { label: 'Critical', color: '#dc2626', bg: '#fee2e2' },
  HIGH:     { label: 'High',     color: '#d97706', bg: '#fef3c7' },
  MEDIUM:   { label: 'Medium',   color: '#2563eb', bg: '#dbeafe' },
  LOW:      { label: 'Low',      color: '#6b7280', bg: '#f3f4f6' },
};

const KANBAN_STAGES = ['INQUIRY', 'QUOTE_SENT', 'NEGOTIATING', 'WON', 'IN_PRODUCTION', 'DISPATCHED', 'DELIVERED', 'INVOICED'];
const ACTIVE_STAGES = KANBAN_STAGES.filter(s => s !== 'LOST');

function StageBadge({ stage }) {
  const cfg = STAGE_CONFIG[stage] || { label: stage, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.MEDIUM;
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>
      {priority}
    </span>
  );
}

function ProgressBar({ pct, stage }) {
  const color = stage === 'WON' || stage === 'DELIVERED' || stage === 'INVOICED' ? '#15803d'
    : stage === 'LOST' ? '#dc2626' : stage === 'IN_PRODUCTION' || stage === 'DISPATCHED' ? '#0e7490' : '#2563eb';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: '#e5e7eb', borderRadius: 99 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: '.4s' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color, minWidth: 28 }}>{pct}%</span>
    </div>
  );
}

// ── Project card (kanban) ──────────────────────────────────────────────────────
function KanbanCard({ project, onClick }) {
  const isOverdue = project.expected_close &&
    project.stage !== 'INVOICED' && project.stage !== 'LOST' &&
    new Date(project.expected_close) < new Date();
  const daysLeft = project.expected_close
    ? Math.ceil((new Date(project.expected_close) - new Date()) / 86400000) : null;

  return (
    <div className="pt-card" onClick={() => onClick(project)} style={{ borderLeft: `3px solid ${STAGE_CONFIG[project.stage]?.color || '#e5e7eb'}` }}>
      <div className="pt-card-top">
        <div className="pt-card-num">{project.project_number}</div>
        <PriorityBadge priority={project.priority} />
      </div>
      <div className="pt-card-name">{project.project_name}</div>
      <div className="pt-card-client">{project.client_name} · {project.client_type}</div>
      {project.category && <div className="pt-card-cat">{project.category}</div>}

      <div className="pt-card-val">{fmtL(project.confirmed_value || project.estimated_value)}</div>

      {project.margin_pct !== null && project.margin_pct !== undefined && (
        <div style={{ fontSize: 11, color: project.margin_pct >= 18 ? 'var(--green)' : 'var(--amber)', marginBottom: 6 }}>
          Margin: {project.margin_pct}%
        </div>
      )}

      <ProgressBar pct={project.completion_pct} stage={project.stage} />

      {project.expected_close && (
        <div style={{ marginTop: 5, fontSize: 10, color: isOverdue ? '#dc2626' : daysLeft <= 7 ? '#d97706' : '#9ca3af' }}>
          {isOverdue ? `⚠ Overdue by ${Math.abs(daysLeft)}d` : daysLeft !== null ? `Close: ${daysLeft}d` : ''}
        </div>
      )}
    </div>
  );
}

// ── Category options (hardware + sanitary + louvers profile) ──────────────────
const CATEGORIES = [
  'Aluminium Louvers', 'HPL Exterior Cladding + ACP', 'Compact Laminate',
  'Acrylic Laminate', 'Hardware Fittings', 'Sanitary CP Fittings',
  'Kitchen Systems', 'Door Hardware', 'Soft Furnishings & Accessories', 'Other',
];
const CLIENT_TYPES = ['Developer', 'Interior Firm', 'Contractor', 'End User', 'Architect', 'Institutional'];

// ── New Project Modal ─────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreated }) {
  const blank = {
    project_name: '', client_name: '', client_type: 'Developer',
    architect_name: '', site_location: '', category: '', estimated_value: '',
    priority: 'MEDIUM', expected_close: '', notes: '',
  };
  const [form, setForm]       = useState(blank);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.project_name.trim() || !form.client_name.trim() || !form.site_location.trim() || !form.category || !form.estimated_value) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        estimated_value: parseFloat(form.estimated_value),
        architect_name: form.architect_name || null,
        expected_close: form.expected_close || null,
        notes: form.notes || null,
      };
      const res  = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create project');
      onCreated(data.project_number);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="qb-modal-overlay" onClick={onClose}>
      <div className="pt-new-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-new-modal-header">
          <div>
            <div className="pt-new-modal-title">New Project</div>
            <div className="pt-new-modal-sub">Create a new project in the pipeline</div>
          </div>
          <button className="qb-close-btn" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="pt-new-form">
          <div className="pt-new-form-grid">
            {/* Row 1 */}
            <div className="pt-fg pt-fg-full">
              <label>Project Name *</label>
              <input type="text" value={form.project_name} onChange={e => set('project_name', e.target.value)} placeholder="e.g. Prestige Skyrise Tower A — Hardware Fitout" required />
            </div>
            {/* Row 2 */}
            <div className="pt-fg">
              <label>Client Name *</label>
              <input type="text" value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="e.g. Prestige Developers" required />
            </div>
            <div className="pt-fg">
              <label>Client Type *</label>
              <select value={form.client_type} onChange={e => set('client_type', e.target.value)}>
                {CLIENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            {/* Row 3 */}
            <div className="pt-fg">
              <label>Architect / Consultant</label>
              <input type="text" value={form.architect_name} onChange={e => set('architect_name', e.target.value)} placeholder="e.g. Sikka & Associates" />
            </div>
            <div className="pt-fg">
              <label>Site Location *</label>
              <input type="text" value={form.site_location} onChange={e => set('site_location', e.target.value)} placeholder="e.g. Whitefield, Bangalore" required />
            </div>
            {/* Row 4 */}
            <div className="pt-fg">
              <label>Category *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} required>
                <option value="">— Select category —</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="pt-fg">
              <label>Estimated Value (₹) *</label>
              <input type="number" min="1000" step="1000" value={form.estimated_value} onChange={e => set('estimated_value', e.target.value)} placeholder="e.g. 500000" required />
            </div>
            {/* Row 5 */}
            <div className="pt-fg">
              <label>Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div className="pt-fg">
              <label>Expected Close Date</label>
              <input type="date" value={form.expected_close} onChange={e => set('expected_close', e.target.value)} />
            </div>
            {/* Notes */}
            <div className="pt-fg pt-fg-full">
              <label>Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Key requirements, specifications, special instructions…" />
            </div>
          </div>
          {error && <div className="pt-new-error">{error}</div>}
          <div className="pt-new-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Creating…' : '+ Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Procurement tab inside ProjectDetail ──────────────────────────────────────
function ProjectProcurementTab({ projectId, onNavigate }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/procurement`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const fmtV = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const statusColor = s =>
    s === 'GRN_DONE'   ? { bg: '#dcfce7', color: '#15803d' }
    : s === 'IN_TRANSIT' ? { bg: '#dbeafe', color: '#1e40af' }
    : s === 'ORDERED'    ? { bg: '#fef3c7', color: '#92400e' }
    : { bg: '#f3f4f6', color: '#6b7280' };

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading procurement…</div>;

  const pos = data?.purchase_orders || [];
  const summary = data?.summary || {};

  return (
    <div className="pt-proc-wrap">
      {/* Summary row */}
      <div className="pt-proc-summary">
        <div className="pt-proc-kpi">
          <div className="pt-proc-kpi-label">Total POs</div>
          <div className="pt-proc-kpi-val">{summary.total_pos || 0}</div>
        </div>
        <div className="pt-proc-kpi">
          <div className="pt-proc-kpi-label">Total Value</div>
          <div className="pt-proc-kpi-val">{fmtV(summary.total_value || 0)}</div>
        </div>
        <div className="pt-proc-kpi">
          <div className="pt-proc-kpi-label">Received</div>
          <div className="pt-proc-kpi-val" style={{ color: 'var(--green)' }}>{fmtV(summary.received_value || 0)}</div>
        </div>
        <div className="pt-proc-kpi">
          <div className="pt-proc-kpi-label">Pending</div>
          <div className="pt-proc-kpi-val" style={{ color: (summary.pending_value || 0) > 0 ? 'var(--amber)' : 'var(--text3)' }}>{fmtV(summary.pending_value || 0)}</div>
        </div>
      </div>

      {pos.length === 0 ? (
        <div className="pt-proc-empty">
          <svg viewBox="0 0 40 40" fill="none"><rect x="5" y="3" width="30" height="34" rx="3" stroke="currentColor" strokeWidth="1.5" opacity=".3"/><path d="M13 13h14M13 19h10M13 25h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".3"/></svg>
          <div>No purchase orders raised for this project yet.</div>
          {onNavigate && <button className="btn-primary" style={{ fontSize: 12, marginTop: 10 }} onClick={() => onNavigate('pogrn')}>Raise PO in PO & GRN →</button>}
        </div>
      ) : (
        <>
          <div className="pt-proc-list">
            {pos.map((po, i) => {
              const sc = statusColor(po.status);
              return (
                <div key={i} className="pt-proc-row">
                  <div className="pt-proc-row-left">
                    <div className="pt-proc-po-num">{po.po_number}</div>
                    <div className="pt-proc-supplier">{po.supplier}</div>
                    <div className="pt-proc-items">{po.items}</div>
                  </div>
                  <div className="pt-proc-row-right">
                    <div className="pt-proc-value">{fmtV(po.value)}</div>
                    <span className="pt-proc-status" style={{ background: sc.bg, color: sc.color }}>
                      {po.status.replace('_', ' ')}
                    </span>
                    {po.expected_delivery && (
                      <div className="pt-proc-date">Due: {po.expected_delivery}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {onNavigate && (
            <button className="pt-proc-add-btn" onClick={() => onNavigate('pogrn')}>
              + Raise New PO in PO &amp; GRN
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Project detail panel ───────────────────────────────────────────────────────
function ProjectDetail({ project, onClose, onGoChat, onNavigate }) {
  const [tab, setTab] = useState('details');
  const stages = ['INQUIRY', 'QUOTE_SENT', 'NEGOTIATING', 'WON', 'IN_PRODUCTION', 'DISPATCHED', 'DELIVERED', 'INVOICED'];
  const currentIdx = stages.indexOf(project.stage);

  return (
    <div className="qb-modal-overlay" onClick={onClose}>
      <div className="pt-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pt-detail-header">
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 2 }}>{project.project_number}</div>
            <div className="pt-detail-title">{project.project_name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <StageBadge stage={project.stage} />
              <PriorityBadge priority={project.priority} />
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Tab bar */}
        <div className="pt-detail-tabs">
          <button className={`pt-detail-tab${tab === 'details' ? ' active' : ''}`} onClick={() => setTab('details')}>Details</button>
          <button className={`pt-detail-tab${tab === 'milestones' ? ' active' : ''}`} onClick={() => setTab('milestones')}>Milestones</button>
          <button className={`pt-detail-tab${tab === 'procurement' ? ' active' : ''}`} onClick={() => setTab('procurement')}>Procurement</button>
        </div>

        {tab === 'procurement' && (
          <ProjectProcurementTab projectId={project.project_id} onNavigate={onNavigate} />
        )}

        {tab !== 'procurement' && (
        <div className="pt-detail-body">
          {/* Left — Details */}
          <div className="pt-detail-left">
            {/* Client info */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Client Details</div>
              <div className="pc-spec-table">
                <div className="pc-spec-item"><span>Client</span><strong>{project.client_name}</strong></div>
                <div className="pc-spec-item"><span>Type</span><strong>{project.client_type}</strong></div>
                {project.architect_name && <div className="pc-spec-item"><span>Architect</span><strong>{project.architect_name}</strong></div>}
                <div className="pc-spec-item"><span>Site</span><strong>{project.site_location}</strong></div>
                <div className="pc-spec-item"><span>Category</span><strong>{project.category}</strong></div>
              </div>
            </div>

            {/* Financials */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Financials</div>
              <div className="pc-pricing-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="pc-pricing-cell">
                  <div className="pc-pricing-cell-label">Est. Value</div>
                  <div className="pc-pricing-cell-val">{fmtL(project.estimated_value)}</div>
                </div>
                {project.confirmed_value && (
                  <div className="pc-pricing-cell">
                    <div className="pc-pricing-cell-label">Confirmed</div>
                    <div className="pc-pricing-cell-val pc-sell">{fmtL(project.confirmed_value)}</div>
                  </div>
                )}
                {project.margin_pct && (
                  <div className="pc-pricing-cell">
                    <div className="pc-pricing-cell-label">Margin</div>
                    <div className="pc-pricing-cell-val" style={{ color: project.margin_pct >= 18 ? 'var(--green)' : 'var(--amber)' }}>
                      {project.margin_pct}%
                    </div>
                  </div>
                )}
              </div>
              {project.quote_number && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>Quote: {project.quote_number}</div>
              )}
              {project.order_number && (
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>Order: {project.order_number}</div>
              )}
            </div>

            {/* Notes */}
            {project.notes && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Notes</div>
                <div className="pc-install-note">{project.notes}</div>
              </div>
            )}

            {onGoChat && (
              <div className="pc-ai-cta-box" onClick={() => { onClose(); onGoChat(`Project ${project.project_number} — ${project.project_name} with ${project.client_name}. What is the best strategy to move this project forward from ${STAGE_CONFIG[project.stage]?.label} stage to closing?`); }}>
                <div className="pc-ai-cta-icon">✨</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Ask AI: Close this project</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Get strategy to advance from current stage</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 18, color: 'var(--text3)' }}>→</div>
              </div>
            )}
          </div>

          {/* Right — milestones */}
          <div className="pt-detail-right">
            {/* Stage progress */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Stage Progress</div>
              <div className="pt-stage-progress">
                {stages.map((s, i) => {
                  const cfg = STAGE_CONFIG[s];
                  const done = i < currentIdx || (project.stage === s && s === 'INVOICED');
                  const current = project.stage === s;
                  return (
                    <div key={s} className={`pt-stage-step${current ? ' pt-stage-current' : done ? ' pt-stage-done' : ''}`}>
                      <div className="pt-stage-dot" style={{
                        background: current ? cfg.color : done ? '#15803d' : '#e5e7eb',
                        borderColor: current ? cfg.color : done ? '#15803d' : '#d1d5db',
                      }}>
                        {done ? '✓' : current ? cfg.icon : (i + 1)}
                      </div>
                      <div className="pt-stage-label" style={{ color: current ? cfg.color : done ? '#15803d' : '#9ca3af' }}>
                        {cfg.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Milestones */}
            {(project.milestones || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Milestone Timeline</div>
                <div className="pt-milestones">
                  {project.milestones.map((m, i) => (
                    <div key={i} className={`pt-milestone${m.done ? ' pt-ml-done' : ''}`}>
                      <div className="pt-ml-dot">{m.done ? '✓' : '○'}</div>
                      <div className="pt-ml-body">
                        <div className="pt-ml-name">{m.name}</div>
                        <div className="pt-ml-date">{m.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// ── Main ProjectTracker View ───────────────────────────────────────────────────
export default function ProjectTracker({ onGoChat, dbStatus, onNavigate }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('kanban');
  const [selected, setSelected]   = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [stageFilter, setStageFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const fetchData = useCallback(() => {
    fetch('/api/projects').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);
  useEffect(() => { setPage(1); }, [stageFilter, view]);

  if (loading) return <PageLoader />;

  const projects = data?.projects || [];
  const kpis     = data?.kpis || {};

  const filteredProjects = stageFilter === 'ALL' ? projects.filter(p => p.stage !== 'LOST')
    : stageFilter === 'LOST' ? projects.filter(p => p.stage === 'LOST')
    : projects.filter(p => p.stage === stageFilter);
  const pagedProjects = filteredProjects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kanbanCols = ACTIVE_STAGES.map(stage => ({
    stage,
    projects: projects.filter(p => p.stage === stage),
  }));

  return (
    <div className="view">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Project Tracker</div>
          <div className="psub">Full project pipeline — Inquiry → Quote → Order → Production → Delivery → Invoice</div>
        </div>
        <div className="ph-actions">
          <DataSourceBadge source={data?.data_source} />
          <button className="btn-secondary" onClick={() => setShowNewProject(true)}>+ New Project</button>
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('What is my current project pipeline value and which projects need immediate attention to close this month?')}>
              ✨ AI Pipeline Analysis
            </button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="kg g5">
        <div className="kc sb" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`My active project pipeline is ${fmtL(kpis.pipeline_value || 0)} across ${kpis.total_projects || 0} projects. Which projects are closest to closing and what actions should I take to convert them?`)}>
          <div className="kt"><span className="kl">Active Pipeline</span></div>
          <div className="kv">{fmtL(kpis.pipeline_value || 0)}</div>
          <div className="ks">{kpis.total_projects || 0} projects</div>
        </div>
        <div className="kc sg" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I've won ${fmtL(kpis.won_ytd || 0)} in projects YTD with a ${kpis.win_rate_pct || 0}% win rate. What are the key factors driving my wins and how can I replicate them for lost projects?`)}>
          <div className="kt"><span className="kl">Won (YTD)</span></div>
          <div className="kv">{fmtL(kpis.won_ytd || 0)}</div>
          <div className="ks">Win rate: {kpis.win_rate_pct || 0}%</div>
        </div>
        <div className="kc sr" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I've lost ${fmtL(kpis.lost_ytd || 0)} in project value YTD. What are the most common reasons for project losses and how should I adjust my pricing and strategy?`)}>
          <div className="kt"><span className="kl">Lost (YTD)</span></div>
          <div className="kv">{fmtL(kpis.lost_ytd || 0)}</div>
          <div className="ks">Review pricing →</div>
        </div>
        <div className="kc sr" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I have ${kpis.critical_count || 0} critical priority projects that need immediate attention. List each one and what specific action should I take today to move them forward.`)}>
          <div className="kt"><span className="kl">Critical Priority</span></div>
          <div className="kv" style={{ color: kpis.critical_count > 0 ? 'var(--red)' : undefined }}>
            {kpis.critical_count || 0} projects
          </div>
          <div className="ks">Act today</div>
        </div>
        <div className="kc sa" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I have ${kpis.overdue_count || 0} projects past their expected close date. What's the best approach to recover overdue projects and prevent further slippage?`)}>
          <div className="kt"><span className="kl">Overdue</span></div>
          <div className="kv" style={{ color: kpis.overdue_count > 0 ? 'var(--amber)' : undefined }}>
            {kpis.overdue_count || 0} projects
          </div>
          <div className="ks">Past expected close</div>
        </div>
      </div>

      {/* View switch + stage filter */}
      <div className="filter-bar">
        <div className="vswitch">
          <button className={`vswitch-btn${view === 'kanban' ? ' active' : ''}`} onClick={() => setView('kanban')}>⊞ Kanban</button>
          <button className={`vswitch-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>☰ List</button>
        </div>
        {view === 'list' && (
          <>
            <div className="stabs">
              {['ALL', ...ACTIVE_STAGES, 'LOST'].map(s => (
                <button key={s} className={`stab${stageFilter === s ? ' active' : ''}`} onClick={() => setStageFilter(s)}>
                  {s === 'ALL' ? 'All' : STAGE_CONFIG[s]?.label || s}
                  {s !== 'ALL' && <span className="stab-cnt">{projects.filter(p => p.stage === s).length}</span>}
                </button>
              ))}
            </div>
            <ExportButton rows={filteredProjects} filename="projects" columns={[
              { key: 'project_id', label: 'ID' }, { key: 'project_name', label: 'Project' },
              { key: 'client_name', label: 'Client' }, { key: 'category', label: 'Category' },
              { key: 'estimated_value', label: 'Value (₹)' }, { key: 'margin_pct', label: 'Margin %' },
              { key: 'stage', label: 'Stage' }, { key: 'priority', label: 'Priority' },
              { key: 'expected_close_date', label: 'Close Date' },
            ]} />
          </>
        )}
      </div>

      {/* Kanban board */}
      {view === 'kanban' && (
        <div className="pt-kanban">
          {kanbanCols.map(col => {
            const cfg = STAGE_CONFIG[col.stage];
            const colVal = col.projects.reduce((s, p) => s + (p.confirmed_value || p.estimated_value), 0);
            return (
              <div key={col.stage} className="pt-kanban-col">
                <div className="pt-col-header" style={{ borderTop: `3px solid ${cfg.color}` }}>
                  <span className="pt-col-icon">{cfg.icon}</span>
                  <span className="pt-col-label" style={{ color: cfg.color }}>{cfg.label}</span>
                  <span className="pt-col-count">{col.projects.length}</span>
                </div>
                {colVal > 0 && <div className="pt-col-val">{fmtL(colVal)}</div>}
                <div className="pt-col-cards">
                  {col.projects.map(p => (
                    <KanbanCard key={p.project_id} project={p} onClick={setSelected} />
                  ))}
                  {col.projects.length === 0 && (
                    <div className="pt-col-empty">No projects</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <>
        <div className="card-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th><th>Client</th><th>Category</th>
                <th>Value</th><th>Margin</th><th>Stage</th><th>Priority</th>
                <th>Close Date</th><th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {pagedProjects.map(p => {
                const isOverdue = p.expected_close && p.stage !== 'INVOICED' && p.stage !== 'LOST' && new Date(p.expected_close) < new Date();
                return (
                  <tr key={p.project_id} style={{ cursor: 'pointer' }} onClick={() => setSelected(p)}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.project_name.slice(0, 35)}{p.project_name.length > 35 ? '…' : ''}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.project_number}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div>{p.client_name}</div>
                      <div style={{ color: 'var(--text3)' }}>{p.client_type}</div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.category}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtL(p.confirmed_value || p.estimated_value)}</td>
                    <td>{p.margin_pct != null ? <span style={{ color: p.margin_pct >= 18 ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>{p.margin_pct}%</span> : '—'}</td>
                    <td><StageBadge stage={p.stage} /></td>
                    <td><PriorityBadge priority={p.priority} /></td>
                    <td style={{ fontSize: 12, color: isOverdue ? '#dc2626' : 'inherit' }}>
                      {p.expected_close || '—'} {isOverdue && '⚠'}
                    </td>
                    <td style={{ minWidth: 100 }}><ProgressBar pct={p.completion_pct} stage={p.stage} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={filteredProjects.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}

      {/* Project detail */}
      {selected && (
        <ProjectDetail project={selected} onClose={() => setSelected(null)}
          onGoChat={onGoChat ? (q) => { setSelected(null); onGoChat(q); } : null}
          onNavigate={onNavigate} />
      )}

      {/* New Project modal */}
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={(projectNumber) => {
            setShowNewProject(false);
            fetchData();
          }}
        />
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Show me my project pipeline — which projects are at risk, what is the total pipeline value, and which ones need follow-up this week?')}>
          <span>✨</span>
          <span>Ask AI: Project pipeline health, risks & follow-up priorities →</span>
        </div>
      )}
    </div>
  );
}
