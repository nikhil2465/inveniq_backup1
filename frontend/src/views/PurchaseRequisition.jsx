import React, { useState, useEffect, useCallback } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import DataSourceBadge from '../components/DataSourceBadge';
import { ExportButton, exportToCsv } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATUS_COLORS = {
  PENDING:   { bg: 'rgba(245,158,11,.12)', color: '#b45309', label: 'Pending' },
  APPROVED:  { bg: 'rgba(22,163,74,.12)',  color: '#15803d', label: 'Approved' },
  REJECTED:  { bg: 'rgba(220,38,38,.12)',  color: '#dc2626', label: 'Rejected' },
  CONVERTED: { bg: 'rgba(99,102,241,.12)', color: '#6366f1', label: 'Converted' },
  CANCELLED: { bg: 'rgba(107,114,128,.12)',color: '#6b7280', label: 'Cancelled' },
};
const PRIORITY_COLORS = {
  LOW:    '#6b7280', NORMAL: '#2563eb',
  HIGH:   '#ea580c', URGENT: '#dc2626',
};

function fmtCurrency(v) {
  const n = parseFloat(v) || 0;
  return n >= 100000 ? `₹${(n/100000).toFixed(2)}L` : `₹${n.toLocaleString('en-IN')}`;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
  return (
    <span className="pr-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

const PR_OPERATION_TYPES = [
  'Regular Purchase', 'Emergency Purchase', 'Import Purchase',
  'Project Purchase', 'Sample Purchase', 'Capital Purchase', 'Inter-branch Transfer',
];

function PRDetailModal({ pr, onClose, onAction }) {
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [poOpType, setPoOpType] = useState('Project Purchase');

  const handleAction = async (newStatus) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/pr/${pr.pr_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, approved_by: 'Admin', rejection_reason: reason }),
      });
      const data = await res.json();
      setMsg({ type: 'success', text: `PR ${newStatus.toLowerCase()} successfully.` });
      setTimeout(() => { onAction(); onClose(); }, 1200);
    } catch { setMsg({ type: 'error', text: 'Action failed. Please retry.' }); }
    finally { setSaving(false); }
  };

  const handleConvertToPO = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/pr/${pr.pr_id}/to-po`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: pr.preferred_supplier || 'TBD',
          notes: 'Converted from PR',
          operation_type: poOpType,
        }),
      });
      const data = await res.json();
      setMsg({ type: 'success', text: `PO ${data.po_number} created (${poOpType}). Complete it in PO & GRN.` });
      setTimeout(() => { onAction(); onClose(); }, 1800);
    } catch { setMsg({ type: 'error', text: 'Conversion failed. Please retry.' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="pr-overlay" onClick={onClose}>
      <div className="pr-modal" onClick={e => e.stopPropagation()}>
        <div className="pr-modal-hdr">
          <div>
            <div className="pr-modal-title">{pr.pr_number}</div>
            <div className="pr-modal-sub">{pr.department} · {pr.requested_by}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={pr.status} />
            <button className="pr-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="pr-modal-body">
          <div className="pr-info-grid">
            <div className="pr-info-item"><span className="pr-info-lbl">PR Date</span><span>{fmtDate(pr.pr_date)}</span></div>
            <div className="pr-info-item"><span className="pr-info-lbl">Required By</span><span>{fmtDate(pr.required_by)}</span></div>
            <div className="pr-info-item"><span className="pr-info-lbl">Priority</span>
              <span style={{ color: PRIORITY_COLORS[pr.priority], fontWeight: 700 }}>{pr.priority}</span>
            </div>
            <div className="pr-info-item"><span className="pr-info-lbl">Est. Value</span>
              <span style={{ fontWeight: 700 }}>{fmtCurrency(pr.estimated_value)}</span>
            </div>
          </div>
          {pr.notes && <div className="pr-notes">{pr.notes}</div>}
          {pr.converted_po_number && (
            <div className="pr-converted-note">
              Converted to PO: <strong>{pr.converted_po_number}</strong>
            </div>
          )}
          {pr.rejection_reason && (
            <div className="pr-rejection-note">Rejection reason: {pr.rejection_reason}</div>
          )}

          {/* Items Table */}
          <div className="pr-section-title">Line Items ({pr.items?.length || 0})</div>
          <div className="pr-items-table-wrap">
            <table className="pr-items-table">
              <thead><tr>
                <th>SKU / Item Name</th><th>Category</th><th>Qty</th><th>Unit</th>
                <th>Est. Price</th><th>Preferred Supplier</th><th>Purpose</th>
              </tr></thead>
              <tbody>
                {(pr.items || []).map((it, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{it.sku_name}</td>
                    <td>{it.category || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{it.qty_required}</td>
                    <td>{it.unit}</td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>
                      {it.estimated_price ? `₹${parseFloat(it.estimated_price).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td>{it.preferred_supplier || '—'}</td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{it.purpose || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action area for PENDING PRs */}
          {pr.status === 'PENDING' && (
            <div className="pr-action-area">
              <div className="pr-section-title">Action</div>
              <textarea
                className="pr-reason-input"
                placeholder="Rejection reason (required if rejecting)…"
                value={reason} onChange={e => setReason(e.target.value)}
              />
              <div className="pr-action-btns">
                <button className="pr-btn-approve" disabled={saving} onClick={() => handleAction('APPROVED')}>
                  {saving ? 'Processing…' : '✓ Approve PR'}
                </button>
                <button className="pr-btn-reject" disabled={saving || !reason.trim()} onClick={() => handleAction('REJECTED')}>
                  ✗ Reject
                </button>
                <button className="pr-btn-cancel" disabled={saving} onClick={() => handleAction('CANCELLED')}>
                  Cancel PR
                </button>
              </div>
            </div>
          )}

          {/* Convert to PO for APPROVED PRs */}
          {pr.status === 'APPROVED' && (
            <div className="pr-action-area">
              <div className="pr-section-title">Convert to Purchase Order</div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>
                  Operation Type
                </label>
                <select
                  value={poOpType}
                  onChange={e => setPoOpType(e.target.value)}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                >
                  {PR_OPERATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button className="pr-btn-approve" disabled={saving} onClick={handleConvertToPO} style={{ width: 'fit-content' }}>
                {saving ? 'Creating PO…' : '→ Convert to PO'}
              </button>
            </div>
          )}

          {msg && (
            <div className={`pr-msg ${msg.type}`}>{msg.text}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreatePRModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    requested_by: '', department: 'Stores', required_by: '', priority: 'NORMAL', notes: '',
  });
  const [items, setItems] = useState([
    { sku_name: '', category: '', qty_required: 1, unit: 'pcs', estimated_price: '', purpose: '', preferred_supplier: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setItem  = (i, k, v) => setItems(arr => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem  = () => setItems(arr => [...arr, { sku_name: '', category: '', qty_required: 1, unit: 'pcs', estimated_price: '', purpose: '', preferred_supplier: '' }]);
  const removeItem = (i) => setItems(arr => arr.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!form.requested_by.trim()) { setError('Requested by is required.'); return; }
    if (!items.some(it => it.sku_name.trim())) { setError('At least one item is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        required_by: form.required_by || null,
        items: items.filter(it => it.sku_name.trim()).map(it => ({
          ...it,
          qty_required: parseFloat(it.qty_required) || 1,
          estimated_price: it.estimated_price ? parseFloat(it.estimated_price) : null,
        })),
      };
      const res = await fetch('/api/pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      onSuccess(data.pr_number);
    } catch { setError('Failed to create PR. Please retry.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="pr-overlay" onClick={onClose}>
      <div className="pr-modal pr-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="pr-modal-hdr">
          <div>
            <div className="pr-modal-title">New Purchase Requisition</div>
            <div className="pr-modal-sub">Raise a material request for approval</div>
          </div>
          <button className="pr-close" onClick={onClose}>×</button>
        </div>
        <div className="pr-modal-body">
          <div className="pr-form-grid">
            <div className="pr-form-field">
              <label className="pr-form-lbl">Requested By *</label>
              <input className="pr-form-input" value={form.requested_by} onChange={e => setField('requested_by', e.target.value)} placeholder="Your name" />
            </div>
            <div className="pr-form-field">
              <label className="pr-form-lbl">Department</label>
              <select className="pr-form-input" value={form.department} onChange={e => setField('department', e.target.value)}>
                {['Stores','Production','PPC','Purchase','Maintenance','Admin'].map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="pr-form-field">
              <label className="pr-form-lbl">Required By</label>
              <input className="pr-form-input" type="date" value={form.required_by} onChange={e => setField('required_by', e.target.value)} />
            </div>
            <div className="pr-form-field">
              <label className="pr-form-lbl">Priority</label>
              <select className="pr-form-input" value={form.priority} onChange={e => setField('priority', e.target.value)}>
                {['LOW','NORMAL','HIGH','URGENT'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="pr-form-field pr-form-full">
              <label className="pr-form-lbl">Notes</label>
              <textarea className="pr-form-input pr-form-textarea" rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Reason for requisition…" />
            </div>
          </div>

          <div className="pr-section-title" style={{ marginTop: 20 }}>
            Line Items
            <button className="pr-add-item-btn" onClick={addItem}>+ Add Item</button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="pr-item-row">
              <input className="pr-form-input" style={{ flex: 2 }} placeholder="SKU / Item Name *" value={it.sku_name} onChange={e => setItem(i, 'sku_name', e.target.value)} />
              <input className="pr-form-input" style={{ flex: 1 }} placeholder="Category" value={it.category} onChange={e => setItem(i, 'category', e.target.value)} />
              <input className="pr-form-input" style={{ width: 70 }} type="number" min="0.01" step="0.01" placeholder="Qty" value={it.qty_required} onChange={e => setItem(i, 'qty_required', e.target.value)} />
              <select className="pr-form-input" style={{ width: 70 }} value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)}>
                {['pcs','kg','mtr','box','set','roll','ltr','bag'].map(u => <option key={u}>{u}</option>)}
              </select>
              <input className="pr-form-input" style={{ width: 100 }} type="number" min="0" step="0.01" placeholder="Est. Price" value={it.estimated_price} onChange={e => setItem(i, 'estimated_price', e.target.value)} />
              <input className="pr-form-input" style={{ flex: 1 }} placeholder="Preferred Supplier" value={it.preferred_supplier} onChange={e => setItem(i, 'preferred_supplier', e.target.value)} />
              {items.length > 1 && (
                <button className="pr-remove-item-btn" onClick={() => removeItem(i)} title="Remove">×</button>
              )}
            </div>
          ))}

          {error && <div className="pr-msg error">{error}</div>}

          <div className="pr-modal-footer">
            <button className="pr-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="pr-btn-approve" disabled={saving} onClick={handleSubmit}>
              {saving ? 'Submitting…' : 'Submit PR'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseRequisition({ onGoChat, dbStatus, period }) {
  const [loading, setLoading]       = useState(true);
  const [kpis, setKpis]             = useState(null);
  const [prs, setPrs]               = useState([]);
  const [filter, setFilter]         = useState('');
  const [search, setSearch]         = useState('');
  const [dataSource, setDataSource] = useState('demo');
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const fetchData = useCallback(async () => {
    try {
      const [kpiRes, prRes] = await Promise.all([
        fetch('/api/pr/kpis'),
        fetch(`/api/pr?limit=100`),
      ]);
      const [kpiData, prData] = await Promise.all([kpiRes.json(), prRes.json()]);
      setKpis(kpiData);
      setPrs(prData.prs || []);
      setDataSource(prData.data_source || 'demo');
    } catch {
      setPrs([
        { pr_id: 1, pr_number: 'PR-2026-001', requested_by: 'Stores Manager', department: 'Stores',
          pr_date: '2026-05-18', required_by: '2026-05-25', status: 'PENDING', priority: 'HIGH',
          item_count: 3, estimated_value: 42500, created_at: '2026-05-18 09:30:00' },
        { pr_id: 2, pr_number: 'PR-2026-002', requested_by: 'Production Head', department: 'Production',
          pr_date: '2026-05-19', required_by: '2026-05-28', status: 'APPROVED', priority: 'NORMAL',
          item_count: 5, estimated_value: 87200, created_at: '2026-05-19 10:00:00' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60 * 1000);

  const openDetail = async (pr) => {
    try {
      const res  = await fetch(`/api/pr/${pr.pr_id}`);
      const data = await res.json();
      setSelected(data.pr || pr);
    } catch { setSelected(pr); }
  };

  const handleCreateSuccess = (prNumber) => {
    setShowCreate(false);
    setSuccessMsg(`PR ${prNumber} submitted for approval.`);
    fetchData();
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const filtered = prs.filter(p => {
    const matchStatus = !filter || p.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || p.pr_number?.toLowerCase().includes(q)
      || p.requested_by?.toLowerCase().includes(q)
      || p.department?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const kpiCards = [
    { label: 'Pending Approval', value: kpis?.pending ?? filtered.filter(p => p.status === 'PENDING').length, cls: 'sa', icon: '⏳' },
    { label: 'Approved',          value: kpis?.approved ?? filtered.filter(p => p.status === 'APPROVED').length, cls: 'sg', icon: '✓' },
    { label: 'Converted to PO',   value: kpis?.converted ?? filtered.filter(p => p.status === 'CONVERTED').length, cls: 'sb', icon: '→' },
    { label: 'Total Est. Value',  value: kpis?.total_value ? fmtCurrency(kpis.total_value) : fmtCurrency(prs.reduce((s,p) => s + (parseFloat(p.estimated_value)||0), 0)), cls: 'sp', icon: '₹' },
  ];

  if (loading) return <SkeletonLoader type="full" />;

  return (
    <div className="pr-wrap">
      {/* Header */}
      <div className="pr-header">
        <div>
          <h1 className="pr-title">Purchase Requisition</h1>
          <p className="pr-subtitle">Material requests · Approval workflow · PO conversion</p>
        </div>
        <div className="pr-header-actions">
          <DataSourceBadge source={dataSource} />
          <ExportButton onClick={() => exportToCsv(filtered.map(p => ({
            PR_Number: p.pr_number, Department: p.department, Requested_By: p.requested_by,
            PR_Date: p.pr_date, Required_By: p.required_by, Status: p.status,
            Priority: p.priority, Items: p.item_count, Est_Value: p.estimated_value,
          })), `purchase_requisitions_${period}`)} label="Export" />
          <button className="pr-btn-primary" onClick={() => setShowCreate(true)}>+ New PR</button>
        </div>
      </div>

      {successMsg && <div className="pr-success-banner">{successMsg}</div>}

      {/* KPI strip */}
      <div className="pr-kpi-strip">
        {kpiCards.map((k, i) => (
          <div key={i} className={`kpi-card ${k.cls}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="pr-filters">
        <input className="pr-search-input" placeholder="Search PR#, department, requester…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="pr-status-tabs">
          {['', 'PENDING', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED'].map(s => (
            <button key={s} className={`pr-stab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
              {s || 'All'} {s && <span className="pr-stab-count">{prs.filter(p => p.status === s).length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="pr-table-wrap">
        <table className="pr-table">
          <thead>
            <tr>
              <th>PR Number</th><th>Department</th><th>Requested By</th>
              <th>PR Date</th><th>Required By</th><th>Priority</th>
              <th>Items</th><th>Est. Value</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
                No purchase requisitions found.
              </td></tr>
            )}
            {filtered.map(pr => (
              <tr key={pr.pr_id} className="pr-row" onClick={() => openDetail(pr)}>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--brand)' }}>{pr.pr_number}</td>
                <td>{pr.department}</td>
                <td>{pr.requested_by}</td>
                <td>{fmtDate(pr.pr_date)}</td>
                <td style={{ color: pr.required_by && new Date(pr.required_by) < new Date() ? 'var(--r2)' : undefined }}>
                  {fmtDate(pr.required_by)}
                </td>
                <td>
                  <span style={{ color: PRIORITY_COLORS[pr.priority] || '#333', fontWeight: 700, fontSize: 12 }}>
                    {pr.priority}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{pr.item_count ?? '—'}</td>
                <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{fmtCurrency(pr.estimated_value)}</td>
                <td><StatusBadge status={pr.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <PRDetailModal pr={selected} onClose={() => setSelected(null)} onAction={fetchData} />
      )}
      {showCreate && (
        <CreatePRModal onClose={() => setShowCreate(false)} onSuccess={handleCreateSuccess} />
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Analyse purchase requisitions — which departments or projects raise the most emergency PRs? Identify items that could be consolidated into planned purchase cycles to reduce rush procurement costs and improve supplier lead times.')}>
          <span>✨</span>
          <span>Ask AI: Identify PR patterns — emergency vs planned purchases, consolidation opportunities, approval bottlenecks →</span>
        </div>
      )}
    </div>
  );
}
