import React, { useState, useEffect, useCallback } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import DataSourceBadge from '../components/DataSourceBadge';
import { ExportButton, exportToCsv } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATUS_COLORS = {
  PENDING:           { bg: 'rgba(245,158,11,.12)', color: '#b45309', label: 'Pending' },
  APPROVED:          { bg: 'rgba(22,163,74,.12)',  color: '#15803d', label: 'Approved' },
  REJECTED:          { bg: 'rgba(220,38,38,.12)',  color: '#dc2626', label: 'Rejected' },
  CONVERTED:         { bg: 'rgba(99,102,241,.12)', color: '#6366f1', label: 'Converted' },
  PARTIAL_CONVERTED: { bg: 'rgba(8,145,178,.12)',  color: '#0891b2', label: 'Partial' },
  CANCELLED:         { bg: 'rgba(107,114,128,.12)',color: '#6b7280', label: 'Cancelled' },
};

const PO_STATUS_BADGE = {
  DRAFT:          { bg: 'rgba(107,114,128,.1)', color: '#6b7280' },
  OPEN:           { bg: 'rgba(37,99,235,.1)',   color: '#2563eb' },
  PARTIAL:        { bg: 'rgba(245,158,11,.1)',  color: '#b45309' },
  RECEIVED:       { bg: 'rgba(22,163,74,.1)',   color: '#15803d' },
  FULLY_RECEIVED: { bg: 'rgba(22,163,74,.1)',   color: '#15803d' },
  COMPLETE:       { bg: 'rgba(22,163,74,.15)',  color: '#14532d' },
  CLOSED:         { bg: 'rgba(107,114,128,.12)',color: '#475569' },
  RETURNED:       { bg: 'rgba(124,58,237,.1)',  color: '#7c3aed' },
  OVERDUE:        { bg: 'rgba(220,38,38,.1)',   color: '#dc2626' },
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

const PR_BADGE_CLS = { PENDING: 'ba', APPROVED: 'bg', REJECTED: 'br', CONVERTED: 'bi', PARTIAL_CONVERTED: 'bt', CANCELLED: 'bsl' };
function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
  return <span className={`bdg ${PR_BADGE_CLS[status] || 'bsl'}`}>{s.label}</span>;
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
  const [linkedPos, setLinkedPos] = useState([]);
  const [linkedPosLoading, setLinkedPosLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    requested_by: pr.requested_by || '',
    department: pr.department || 'Stores',
    required_by: pr.required_by ? pr.required_by.split('T')[0] : '',
    priority: pr.priority || 'NORMAL',
    notes: pr.notes || '',
  });

  useEffect(() => {
    if (!pr?.pr_id) return;
    setLinkedPosLoading(true);
    fetch(`/api/pr/${pr.pr_id}/linked-pos`)
      .then(r => r.json())
      .then(d => setLinkedPos(d.linked_pos || []))
      .catch(() => {})
      .finally(() => setLinkedPosLoading(false));
  }, [pr?.pr_id]);

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

  // Derive preferred supplier from first PR item that has one set
  const derivedSupplier = pr.items?.find(it => it.preferred_supplier)?.preferred_supplier || '';
  const [poSupplier, setPoSupplier] = useState(derivedSupplier);

  const handleConvertToPO = async () => {
    if (!poSupplier.trim()) { setMsg({ type: 'error', text: 'Supplier name is required to create a PO.' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/pr/${pr.pr_id}/to-po`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_name: poSupplier.trim(),
          notes: `Converted from ${pr.pr_number}`,
          operation_type: poOpType,
        }),
      });
      const data = await res.json();
      setMsg({ type: 'success', text: `PO ${data.po_number} created (${poOpType}). Visible in PO & GRN → Open POs.` });
      setTimeout(() => { onAction(); onClose(); }, 2000);
    } catch { setMsg({ type: 'error', text: 'Conversion failed. Please retry.' }); }
    finally { setSaving(false); }
  };

  const handleEditSave = async () => {
    if (!editForm.requested_by.trim()) { setMsg({ type: 'error', text: 'Requested By is required.' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/pr/${pr.pr_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requested_by: editForm.requested_by.trim(),
          department:   editForm.department,
          required_by:  editForm.required_by || null,
          priority:     editForm.priority,
          notes:        editForm.notes.trim() || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Save failed'); }
      setMsg({ type: 'success', text: 'PR updated successfully.' });
      setEditMode(false);
      setTimeout(() => { onAction(); onClose(); }, 1500);
    } catch (err) { setMsg({ type: 'error', text: err.message || 'Save failed. Please retry.' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="pr-overlay" onClick={onClose}>
      <div className="pr-modal" onClick={e => e.stopPropagation()}>
        <div className="pr-modal-hdr">
          <div>
            <div className="pr-modal-title">{pr.pr_number}</div>
            <div className="pr-modal-sub">{editMode ? 'Editing PR' : `${pr.department} · ${pr.requested_by}`}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={pr.status} />
            {pr.status === 'PENDING' && (
              <button
                className="btn-secondary"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => { setEditMode(m => !m); setMsg(null); }}
              >
                {editMode ? '← Back' : '✎ Edit'}
              </button>
            )}
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
              {pr.converted_po_numbers && pr.converted_po_numbers !== pr.converted_po_number && (
                <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 8 }}>
                  (all: {pr.converted_po_numbers})
                </span>
              )}
            </div>
          )}
          {pr.rejection_reason && (
            <div className="pr-rejection-note">Rejection reason: {pr.rejection_reason}</div>
          )}

          {/* Inline Edit Form (PENDING only) */}
          {editMode && (
            <div className="pr-action-area" style={{ marginBottom: 16 }}>
              <div className="pr-section-title">Edit PR Details</div>
              <div className="pr-form-grid">
                <div className="pr-form-field">
                  <label className="pr-form-lbl">Requested By *</label>
                  <input className="pr-form-input" value={editForm.requested_by}
                    onChange={e => setEditForm(f => ({ ...f, requested_by: e.target.value }))} />
                </div>
                <div className="pr-form-field">
                  <label className="pr-form-lbl">Department</label>
                  <select className="pr-form-input" value={editForm.department}
                    onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}>
                    {['Stores','Production','PPC','Purchase','Maintenance','Admin'].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="pr-form-field">
                  <label className="pr-form-lbl">Required By</label>
                  <input className="pr-form-input" type="date" value={editForm.required_by}
                    onChange={e => setEditForm(f => ({ ...f, required_by: e.target.value }))} />
                </div>
                <div className="pr-form-field">
                  <label className="pr-form-lbl">Priority</label>
                  <select className="pr-form-input" value={editForm.priority}
                    onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}>
                    {['LOW','NORMAL','HIGH','URGENT'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="pr-form-field pr-form-full">
                  <label className="pr-form-lbl">Notes</label>
                  <textarea className="pr-form-input pr-form-textarea" rows={2} value={editForm.notes}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Reason for requisition…" />
                </div>
              </div>
              <div className="pr-action-btns" style={{ marginTop: 12 }}>
                <button className="pr-btn-approve" disabled={saving} onClick={handleEditSave}>
                  {saving ? 'Saving…' : '✓ Save Changes'}
                </button>
                <button className="pr-btn-cancel" onClick={() => setEditMode(false)}>Discard</button>
              </div>
            </div>
          )}

          {/* Linked POs Section */}
          {(linkedPos.length > 0 || linkedPosLoading) && (
            <div style={{ marginBottom: 16 }}>
              <div className="pr-section-title" style={{ marginBottom: 8 }}>Linked Purchase Orders</div>
              {linkedPosLoading ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Loading linked POs…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {linkedPos.map(lpo => {
                    const poBadge = PO_STATUS_BADGE[lpo.status] || PO_STATUS_BADGE.DRAFT;
                    const displayStatus = lpo.status === 'PARTIAL' ? 'PARTIALLY RECEIVED'
                      : lpo.status === 'RECEIVED' || lpo.status === 'FULLY_RECEIVED' ? 'FULLY RECEIVED'
                      : lpo.status;
                    return (
                      <div key={lpo.po_number} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: '#2563eb' }}>{lpo.po_number}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: poBadge.bg, color: poBadge.color }}>{displayStatus}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
                          <strong>{lpo.supplier}</strong>
                          {lpo.expected_date && <span style={{ color: 'var(--text3)', marginLeft: 8 }}>· ETA: {lpo.expected_date}</span>}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 11 }}>
                          {[
                            ['Ordered',  lpo.qty_ordered],
                            ['Received', lpo.qty_received],
                            ['Accepted', lpo.accepted_qty],
                            ['Rejected', lpo.rejected_qty],
                            ['Returned', lpo.qty_returned],
                            ['Pending',  lpo.pending_qty],
                            ['Fill %',   `${lpo.fill_pct}%`],
                            ['Value',    lpo.total_value ? `₹${parseFloat(lpo.total_value).toLocaleString('en-IN')}` : '—'],
                          ].map(([label, val]) => (
                            <div key={label} style={{ textAlign: 'center', background: 'var(--surface)', borderRadius: 6, padding: '5px 4px' }}>
                              <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{label}</div>
                              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12,
                                color: label === 'Rejected' && val > 0 ? '#dc2626' : label === 'Fill %' && parseFloat(val) >= 100 ? '#15803d' : 'var(--text)' }}>
                                {val ?? '—'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
                  Supplier Name *
                </label>
                <input
                  list="pr-to-po-supplier-list"
                  value={poSupplier}
                  onChange={e => setPoSupplier(e.target.value)}
                  placeholder="Type or select supplier…"
                  style={{ width: '100%', padding: '8px 11px', border: `1px solid ${!poSupplier.trim() ? '#fca5a5' : 'var(--border)'}`, borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                />
                <datalist id="pr-to-po-supplier-list">
                  {(pr.items || []).filter(it => it.preferred_supplier).map((it, i) => (
                    <option key={i} value={it.preferred_supplier} />
                  ))}
                </datalist>
                {!poSupplier.trim() && (
                  <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3, fontFamily: 'var(--mono)' }}>
                    Required — enter the supplier who will fulfill this PO
                  </div>
                )}
              </div>
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
              <button className="pr-btn-approve" disabled={saving || !poSupplier.trim()} onClick={handleConvertToPO} style={{ width: 'fit-content', opacity: !poSupplier.trim() ? 0.5 : 1 }}>
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

function CreatePRModal({ onClose, onSuccess, onGoChat }) {
  const [form, setForm] = useState({
    requested_by: '', department: 'Stores', required_by: '', priority: 'NORMAL', notes: '',
  });
  const [items, setItems] = useState([
    { sku_name: '', category: '', qty_required: 1, unit: 'pcs', estimated_price: '', purpose: '', preferred_supplier: '' },
  ]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [suppliers, setSuppliers]       = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Load catalog products and supplier list for datalists
  useEffect(() => {
    fetch('/api/pr/products')
      .then(r => r.json())
      .then(d => { if (d?.products?.length) setCatalogItems(d.products); })
      .catch(() => {});
    fetch('/api/procurement/suppliers')
      .then(r => r.json())
      .then(d => {
        const names = (d?.suppliers || []).map(s => s.name).filter(Boolean);
        if (names.length) setSuppliers(names);
      })
      .catch(() => {});
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setItem  = (i, k, v) => setItems(arr => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem  = () => setItems(arr => [...arr, { sku_name: '', category: '', qty_required: 1, unit: 'pcs', estimated_price: '', purpose: '', preferred_supplier: '' }]);
  const removeItem = (i) => setItems(arr => arr.filter((_, idx) => idx !== i));

  // When user selects a catalog item, auto-fill category and unit
  const handleSkuChange = (i, value) => {
    const match = catalogItems.find(p => p.sku_name === value);
    if (match) {
      setItems(arr => arr.map((it, idx) => idx === i
        ? { ...it, sku_name: value, category: match.category || it.category, unit: match.unit || it.unit }
        : it
      ));
    } else {
      setItem(i, 'sku_name', value);
    }
  };

  const handleSupplierAnalysis = () => {
    const skuList = items.filter(it => it.sku_name.trim()).map(it => it.sku_name).join(', ');
    onGoChat?.(`Analyze suppliers for these items: ${skuList || 'the items in my current PR'}. Which supplier offers the best price, lead time, and reliability? Recommend the preferred supplier for each item.`);
    onClose();
  };

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

          {/* Catalog datalists — hidden, referenced by inputs below */}
          <datalist id="pr-sku-list">
            {catalogItems.map(p => <option key={p.sku_name} value={p.sku_name} />)}
          </datalist>
          <datalist id="pr-supplier-list">
            {suppliers.map(s => <option key={s} value={s} />)}
          </datalist>

          <div className="pr-section-title" style={{ marginTop: 20 }}>
            Line Items
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {onGoChat && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={handleSupplierAnalysis}
                  title="Let AI recommend the best supplier for these items"
                >
                  ✨ AI Supplier Analysis
                </button>
              )}
              <button className="pr-add-item-btn" onClick={addItem}>+ Add Item</button>
            </div>
          </div>
          {items.map((it, i) => (
            <div key={i} className="pr-item-row">
              <input
                className="pr-form-input"
                style={{ flex: 2 }}
                list="pr-sku-list"
                placeholder="SKU / Item Name *"
                value={it.sku_name}
                onChange={e => handleSkuChange(i, e.target.value)}
              />
              <input className="pr-form-input" style={{ flex: 1 }} placeholder="Category" value={it.category} onChange={e => setItem(i, 'category', e.target.value)} />
              <input className="pr-form-input" style={{ width: 70 }} type="number" min="0.01" step="0.01" placeholder="Qty" value={it.qty_required} onChange={e => setItem(i, 'qty_required', e.target.value)} />
              <input
                className="pr-form-input"
                style={{ width: 80 }}
                placeholder="Unit"
                value={it.unit}
                onChange={e => setItem(i, 'unit', e.target.value)}
              />
              <input className="pr-form-input" style={{ width: 100 }} type="number" min="0" step="0.01" placeholder="Est. Price" value={it.estimated_price} onChange={e => setItem(i, 'estimated_price', e.target.value)} />
              <input
                className="pr-form-input"
                style={{ flex: 1 }}
                list="pr-supplier-list"
                placeholder="Preferred Supplier"
                value={it.preferred_supplier}
                onChange={e => setItem(i, 'preferred_supplier', e.target.value)}
              />
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
  const [selected, setSelected]         = useState(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [successMsg, setSuccessMsg]     = useState('');
  const [duplicatingId, setDuplicatingId] = useState(null);
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

  const handleDuplicate = async (e, pr) => {
    e.stopPropagation();
    if (duplicatingId) return;
    setDuplicatingId(pr.pr_id);
    try {
      const res = await fetch(`/api/pr/${pr.pr_id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicated_by: 'Admin' }),
      });
      const data = await res.json();
      setSuccessMsg(`PR duplicated → ${data.new_pr_number || 'new PR'} created (PENDING).`);
      fetchData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setSuccessMsg('Duplication failed. Please retry.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setDuplicatingId(null);
    }
  };

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
    { label: 'Pending Approval', value: kpis?.pending           ?? prs.filter(p => p.status === 'PENDING').length,           cls: 'sa' },
    { label: 'Approved',          value: kpis?.approved          ?? prs.filter(p => p.status === 'APPROVED').length,          cls: 'sg' },
    { label: 'Converted to PO',   value: kpis?.converted         ?? prs.filter(p => p.status === 'CONVERTED').length,         cls: 'sb' },
    { label: 'Partial Converted', value: kpis?.partial_converted ?? prs.filter(p => p.status === 'PARTIAL_CONVERTED').length, cls: 'st' },
    { label: 'Total Est. Value',  value: kpis?.total_value ? fmtCurrency(kpis.total_value) : fmtCurrency(prs.reduce((s,p) => s + (parseFloat(p.estimated_value)||0), 0)), cls: 'sp' },
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
          {onGoChat && (
            <button onClick={() => onGoChat('Analyse my purchase requisitions — which departments have the most pending PRs, what is the total estimated value awaiting approval, and flag any urgent or overdue requests that need immediate action.')}
              style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1.5px solid rgba(139,92,246,.35)', background: 'rgba(139,92,246,.09)', color: '#8b5cf6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              ✨ AI Brief
            </button>
          )}
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

      {/* AI Opportunity Chips */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '⏳', text: `${kpiCards[0].value} PRs pending approval — which are urgent and overdue?`, q: `I have ${kpiCards[0].value} purchase requisitions pending approval. Which departments submitted them, what is the total estimated value at risk, and which ones have passed their required-by date? Give me a prioritised action list for approvals today.` },
            { icon: '🔄', text: 'Consolidate PRs from same department into fewer POs — save 20%', q: 'Analyse my open purchase requisitions and identify which items from the same department or same supplier can be consolidated into a single purchase order. What is the estimated cost saving from consolidation vs splitting into multiple small POs?' },
            { icon: '🏭', text: 'Which department raises the most emergency PRs? Fix the root cause', q: 'Looking at my purchase requisitions, which departments have the highest rate of URGENT or high-priority PRs with short lead times? What root causes typically create emergency procurement and what process changes will reduce rush buying costs?' },
            { icon: '💰', text: `Total est. value ${kpiCards[4].value} awaiting PO conversion — budget impact?`, q: `My purchase requisitions have an estimated value of ${kpiCards[4].value} awaiting conversion to purchase orders. What is the cash flow impact of releasing all of them at once vs staggering by priority? Which items are most time-sensitive?` },
            { icon: '📊', text: 'Partial conversions stuck — how to complete PO coverage for open PRs', q: 'I have purchase requisitions that are partially converted to POs — meaning some items have POs but others do not. What is the best process for managing partially converted PRs? How do I ensure no items get forgotten and all demand is fulfilled?' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="pr-filters">
        <input className="pr-search-input" placeholder="Search PR#, department, requester…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="pr-status-tabs">
          {['', 'PENDING', 'APPROVED', 'REJECTED', 'CONVERTED', 'PARTIAL_CONVERTED', 'CANCELLED'].map(s => (
            <button key={s} className={`pr-stab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
              {s === 'PARTIAL_CONVERTED' ? 'Partial' : (s || 'All')}
              {s && <span className="pr-stab-count">{prs.filter(p => p.status === s).length}</span>}
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
              <th>Items</th><th>Est. Value</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
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
                <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px', opacity: duplicatingId === pr.pr_id ? 0.6 : 1 }}
                    disabled={!!duplicatingId}
                    onClick={e => handleDuplicate(e, pr)}
                    title="Duplicate this PR — creates a new PENDING copy"
                  >
                    {duplicatingId === pr.pr_id ? '…' : '⧉ Duplicate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <PRDetailModal pr={selected} onClose={() => setSelected(null)} onAction={fetchData} />
      )}
      {showCreate && (
        <CreatePRModal onClose={() => setShowCreate(false)} onSuccess={handleCreateSuccess} onGoChat={onGoChat} />
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
