import React, { useState, useEffect, useCallback } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import DataSourceBadge from '../components/DataSourceBadge';
import { ExportButton, exportToCsv } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATUS_COLORS = {
  PENDING:     { bg: 'rgba(245,158,11,.12)', color: '#b45309', label: 'Pending' },
  IN_PROGRESS: { bg: 'rgba(59,130,246,.12)', color: '#2563eb', label: 'In Progress' },
  ACCEPTED:    { bg: 'rgba(22,163,74,.12)',  color: '#15803d', label: 'Accepted' },
  PARTIAL:     { bg: 'rgba(234,88,12,.12)',  color: '#c2410c', label: 'Partial' },
  REJECTED:    { bg: 'rgba(220,38,38,.12)',  color: '#dc2626', label: 'Rejected' },
};
const RESULT_STYLES = {
  PASS: { color: '#15803d', bg: 'rgba(22,163,74,.1)' },
  FAIL: { color: '#dc2626', bg: 'rgba(220,38,38,.1)' },
  NA:   { color: '#6b7280', bg: 'rgba(107,114,128,.08)' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtPct(n) { return `${parseFloat(n || 0).toFixed(1)}%`; }

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
  return <span className="qci-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}

function QCDetailModal({ qc, onClose, onAction }) {
  const [decisionMode, setDecisionMode] = useState(false);
  const [acceptQty, setAcceptQty]       = useState(qc.total_qty_inspected || 0);
  const [rejectQty, setRejectQty]       = useState(0);
  const [rejReason, setRejReason]       = useState('');
  const [initiateRtv, setInitiateRtv]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [msg, setMsg]                   = useState(null);

  const handleDecision = async () => {
    if (acceptQty + rejectQty <= 0) { setMsg({ type: 'error', text: 'Total qty must be > 0.' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/qc/${qc.qc_id}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accepted_qty: parseFloat(acceptQty) || 0,
          rejected_qty: parseFloat(rejectQty) || 0,
          rejection_reason: rejReason || null,
          initiate_rtv: initiateRtv,
        }),
      });
      const data = await res.json();
      const rate = data.acceptance_rate ?? 100;
      setMsg({ type: 'success', text: `Decision recorded. Acceptance rate: ${rate}%${initiateRtv ? ' · RTV initiated.' : ''}` });
      setTimeout(() => { onAction(); onClose(); }, 1800);
    } catch { setMsg({ type: 'error', text: 'Failed to record decision.' }); }
    finally { setSaving(false); }
  };

  const passCount = (qc.checklist || []).filter(c => c.result === 'PASS').length;
  const failCount = (qc.checklist || []).filter(c => c.result === 'FAIL').length;
  const total     = (qc.checklist || []).length;

  return (
    <div className="qci-overlay" onClick={onClose}>
      <div className="qci-modal" onClick={e => e.stopPropagation()}>
        <div className="qci-modal-hdr">
          <div>
            <div className="qci-modal-title">{qc.inspection_no}</div>
            <div className="qci-modal-sub">{qc.supplier_name} · {qc.category}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={qc.status} />
            <button className="qci-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="qci-modal-body">
          <div className="qci-info-grid">
            <div className="qci-info-item"><span className="qci-info-lbl">GRN Number</span><span style={{ fontFamily: 'var(--mono)' }}>{qc.grn_number || '—'}</span></div>
            <div className="qci-info-item"><span className="qci-info-lbl">PO Number</span><span style={{ fontFamily: 'var(--mono)' }}>{qc.po_number || '—'}</span></div>
            <div className="qci-info-item"><span className="qci-info-lbl">Inspector</span><span>{qc.inspector_name}</span></div>
            <div className="qci-info-item"><span className="qci-info-lbl">Insp. Date</span><span>{fmtDate(qc.inspection_date)}</span></div>
            <div className="qci-info-item"><span className="qci-info-lbl">Batch No.</span><span style={{ fontFamily: 'var(--mono)' }}>{qc.batch_no || '—'}</span></div>
            <div className="qci-info-item"><span className="qci-info-lbl">Total Qty</span><span style={{ fontWeight: 700 }}>{qc.total_qty_inspected}</span></div>
            <div className="qci-info-item"><span className="qci-info-lbl">Accepted</span><span style={{ color: 'var(--green)', fontWeight: 700 }}>{qc.accepted_qty}</span></div>
            <div className="qci-info-item"><span className="qci-info-lbl">Rejected</span><span style={{ color: 'var(--r2)', fontWeight: 700 }}>{qc.rejected_qty}</span></div>
          </div>

          {/* Pass/Fail Summary */}
          {total > 0 && (
            <div className="qci-checklist-summary">
              <span style={{ color: 'var(--green)' }}>✓ {passCount} Pass</span>
              <span style={{ color: 'var(--r2)' }}>✗ {failCount} Fail</span>
              <span style={{ color: 'var(--text3)' }}>{total - passCount - failCount} N/A</span>
            </div>
          )}

          {/* Checklist */}
          <div className="qci-section-title">QC Checklist ({total} parameters)</div>
          <div className="qci-checklist-wrap">
            <table className="qci-checklist-table">
              <thead><tr>
                <th>Parameter</th><th>Standard</th><th>Actual</th><th>Result</th><th>Remarks</th>
              </tr></thead>
              <tbody>
                {(qc.checklist || []).map((c, i) => {
                  const rs = RESULT_STYLES[c.result] || RESULT_STYLES.NA;
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{c.parameter}</td>
                      <td style={{ color: 'var(--text3)' }}>{c.standard_value || '—'}</td>
                      <td>{c.actual_value || '—'}</td>
                      <td>
                        <span className="qci-result-badge" style={{ background: rs.bg, color: rs.color }}>
                          {c.result}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text3)', fontSize: 12 }}>{c.remarks || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {qc.notes && <div className="qci-notes">{qc.notes}</div>}
          {qc.rejection_reason && <div className="qci-rejection-note">{qc.rejection_reason}</div>}

          {/* Decision area for active inspections */}
          {['PENDING', 'IN_PROGRESS'].includes(qc.status) && !decisionMode && (
            <div className="qci-action-area">
              <button className="qci-btn-primary" onClick={() => setDecisionMode(true)}>
                Record QC Decision
              </button>
            </div>
          )}
          {['PENDING', 'IN_PROGRESS'].includes(qc.status) && decisionMode && (
            <div className="qci-action-area">
              <div className="qci-section-title">Record Decision</div>
              <div className="qci-decision-grid">
                <div className="qci-form-field">
                  <label className="qci-form-lbl">Accepted Qty</label>
                  <input className="qci-form-input" type="number" min="0" step="1"
                    value={acceptQty} onChange={e => setAcceptQty(e.target.value)} />
                </div>
                <div className="qci-form-field">
                  <label className="qci-form-lbl">Rejected Qty</label>
                  <input className="qci-form-input" type="number" min="0" step="1"
                    value={rejectQty} onChange={e => setRejectQty(e.target.value)} />
                </div>
              </div>
              {parseFloat(rejectQty) > 0 && (
                <>
                  <textarea className="qci-reason-input" rows={2}
                    placeholder="Rejection reason (required)…"
                    value={rejReason} onChange={e => setRejReason(e.target.value)} />
                  <label className="qci-rtv-label">
                    <input type="checkbox" checked={initiateRtv} onChange={e => setInitiateRtv(e.target.checked)} />
                    <span>Initiate Return to Vendor (RTV)</span>
                  </label>
                </>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="qci-btn-primary" disabled={saving} onClick={handleDecision}>
                  {saving ? 'Saving…' : 'Submit Decision'}
                </button>
                <button className="qci-btn-cancel" onClick={() => setDecisionMode(false)}>Back</button>
              </div>
            </div>
          )}

          {msg && <div className={`qci-msg ${msg.type}`}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}

function CreateQCModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    grn_number: '', po_number: '', supplier_name: '', inspector_name: '',
    batch_no: '', category: 'Hardware Fittings', total_qty_inspected: 0, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.supplier_name.trim() || !form.inspector_name.trim()) {
      setError('Supplier and Inspector are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/qc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, total_qty_inspected: parseFloat(form.total_qty_inspected) || 0 }),
      });
      const data = await res.json();
      onSuccess(data.inspection_no);
    } catch { setError('Failed to create QC inspection.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="qci-overlay" onClick={onClose}>
      <div className="qci-modal" onClick={e => e.stopPropagation()}>
        <div className="qci-modal-hdr">
          <div><div className="qci-modal-title">New QC Inspection</div><div className="qci-modal-sub">Post-GRN quality check</div></div>
          <button className="qci-close" onClick={onClose}>×</button>
        </div>
        <div className="qci-modal-body">
          <div className="qci-form-grid">
            {[
              ['GRN Number',  'grn_number',          'text',   'GRN-20260520-001'],
              ['PO Number',   'po_number',            'text',   'PO-20260519-001'],
              ['Supplier *',  'supplier_name',        'text',   'Supplier name'],
              ['Inspector *', 'inspector_name',       'text',   'Inspector name'],
              ['Batch No.',   'batch_no',             'text',   'Batch identifier'],
              ['Total Qty',   'total_qty_inspected',  'number', '0'],
            ].map(([lbl, key, type, ph]) => (
              <div className="qci-form-field" key={key}>
                <label className="qci-form-lbl">{lbl}</label>
                <input className="qci-form-input" type={type} placeholder={ph}
                  value={form[key]} onChange={e => setField(key, e.target.value)} />
              </div>
            ))}
            <div className="qci-form-field">
              <label className="qci-form-lbl">Category</label>
              <select className="qci-form-input" value={form.category} onChange={e => setField('category', e.target.value)}>
                {['Hardware Fittings','Sanitary CP Fittings','Kitchen Systems','Door Hardware','Others'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="qci-form-field qci-form-full">
              <label className="qci-form-lbl">Notes</label>
              <textarea className="qci-form-input qci-form-textarea" rows={2}
                value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            Default QC checklist (7 parameters) will be auto-applied. You can update results in the detail view.
          </p>
          {error && <div className="qci-msg error">{error}</div>}
          <div className="qci-modal-footer">
            <button className="qci-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="qci-btn-primary" disabled={saving} onClick={handleSubmit}>
              {saving ? 'Creating…' : 'Create Inspection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QCInspection({ onGoChat, dbStatus, period }) {
  const [loading, setLoading]       = useState(true);
  const [kpis, setKpis]             = useState(null);
  const [items, setItems]           = useState([]);
  const [filter, setFilter]         = useState('');
  const [search, setSearch]         = useState('');
  const [dataSource, setDataSource] = useState('demo');
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const fetchData = useCallback(async () => {
    try {
      const [kpiRes, listRes] = await Promise.all([
        fetch('/api/qc/kpis'),
        fetch('/api/qc?limit=100'),
      ]);
      const [kpiData, listData] = await Promise.all([kpiRes.json(), listRes.json()]);
      setKpis(kpiData);
      setItems(listData.inspections || []);
      setDataSource(listData.data_source || 'demo');
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60 * 1000);

  const openDetail = async (qc) => {
    try {
      const res  = await fetch(`/api/qc/${qc.qc_id}`);
      const data = await res.json();
      setSelected(data.inspection || qc);
    } catch { setSelected(qc); }
  };

  const filtered = items.filter(q => {
    const matchStatus = !filter || q.status === filter;
    const s = search.toLowerCase();
    const matchSearch = !s || q.inspection_no?.toLowerCase().includes(s)
      || q.supplier_name?.toLowerCase().includes(s)
      || q.grn_number?.toLowerCase().includes(s);
    return matchStatus && matchSearch;
  });

  const kpiCards = [
    { label: 'Pending',     value: kpis?.pending      ?? 0, cls: 'sa' },
    { label: 'In Progress', value: kpis?.in_progress  ?? 0, cls: 'sb' },
    { label: 'Accepted',    value: kpis?.accepted     ?? 0, cls: 'sg' },
    { label: 'Acceptance Rate', value: `${fmtPct(kpis?.acceptance_rate)}`, cls: 'st' },
  ];

  if (loading) return <SkeletonLoader type="full" />;

  return (
    <div className="qci-wrap">
      <div className="qci-header">
        <div>
          <h1 className="qci-title">QC Inspection</h1>
          <p className="qci-subtitle">Post-GRN quality control · Accept to inventory or RTV</p>
        </div>
        <div className="qci-header-actions">
          <DataSourceBadge source={dataSource} />
          <ExportButton onClick={() => exportToCsv(filtered.map(q => ({
            Inspection_No: q.inspection_no, Supplier: q.supplier_name, GRN: q.grn_number,
            Date: q.inspection_date, Status: q.status, Category: q.category,
            Total_Qty: q.total_qty_inspected, Accepted: q.accepted_qty, Rejected: q.rejected_qty,
          })), `qc_inspections_${period}`)} label="Export" />
          <button className="qci-btn-primary" onClick={() => setShowCreate(true)}>+ New Inspection</button>
        </div>
      </div>

      {successMsg && <div className="qci-success-banner">{successMsg}</div>}

      <div className="qci-kpi-strip">
        {kpiCards.map((k, i) => (
          <div key={i} className={`kpi-card ${k.cls}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="qci-filters">
        <input className="qci-search-input" placeholder="Search inspection#, supplier, GRN…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="qci-status-tabs">
          {['', 'PENDING', 'IN_PROGRESS', 'ACCEPTED', 'PARTIAL', 'REJECTED'].map(s => (
            <button key={s} className={`qci-stab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
              {s ? STATUS_COLORS[s]?.label ?? s : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="qci-table-wrap">
        <table className="qci-table">
          <thead>
            <tr>
              <th>Inspection #</th><th>Supplier</th><th>GRN #</th><th>PO #</th>
              <th>Category</th><th>Date</th><th>Total Qty</th>
              <th>Accepted</th><th>Rejected</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
                No QC inspections found.
              </td></tr>
            )}
            {filtered.map(q => (
              <tr key={q.qc_id} className="qci-row" onClick={() => openDetail(q)}>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--brand)' }}>{q.inspection_no}</td>
                <td>{q.supplier_name}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{q.grn_number || '—'}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{q.po_number || '—'}</td>
                <td>{q.category}</td>
                <td>{fmtDate(q.inspection_date)}</td>
                <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{q.total_qty_inspected}</td>
                <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--green)' }}>{q.accepted_qty || '—'}</td>
                <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: q.rejected_qty > 0 ? 'var(--r2)' : undefined }}>{q.rejected_qty || '—'}</td>
                <td><StatusBadge status={q.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <QCDetailModal qc={selected} onClose={() => setSelected(null)} onAction={fetchData} />
      )}
      {showCreate && (
        <CreateQCModal onClose={() => setShowCreate(false)} onSuccess={(no) => {
          setShowCreate(false);
          setSuccessMsg(`QC Inspection ${no} created.`);
          fetchData();
          setTimeout(() => setSuccessMsg(''), 4000);
        }} />
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Analyse QC inspection results — which SKUs or suppliers have the highest rejection or RTV rates? Identify recurring failure patterns by checklist parameter and suggest supplier quality improvement actions.')}>
          <span>✨</span>
          <span>Ask AI: QC failure patterns by SKU and supplier — identify which items need supplier quality reviews →</span>
        </div>
      )}
    </div>
  );
}
