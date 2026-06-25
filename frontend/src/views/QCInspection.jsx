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

const STATIC_SUPPLIER_QC = [
  { name: 'Hettich India Pvt Ltd',  rate: '97.8', total: 450, rejected: 10 },
  { name: 'Century Plyboards',      rate: '96.5', total: 680, rejected: 24 },
  { name: 'Ebco Industries Ltd',    rate: '95.4', total: 220, rejected: 10 },
  { name: 'Jaquar Group',           rate: '91.2', total: 114, rejected: 10 },
  { name: 'Hafele India Pvt Ltd',   rate: '89.3', total: 280, rejected: 30 },
  { name: 'Greenply Industries',    rate: '82.4', total: 310, rejected: 55 },
];

const STATIC_CATEGORY_QC = [
  { cat: 'Sanitary CP Fittings', defect_rate: '6.2', count: 12 },
  { cat: 'Hardware Fittings',    defect_rate: '3.8', count: 24 },
  { cat: 'Kitchen Systems',      defect_rate: '2.1', count: 8  },
  { cat: 'Door Hardware',        defect_rate: '1.4', count: 15 },
  { cat: 'Others',               defect_rate: '0.8', count: 5  },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtPct(n) { return `${parseFloat(n || 0).toFixed(1)}%`; }

const QC_BADGE_CLS = { PENDING: 'ba', IN_PROGRESS: 'bb', ACCEPTED: 'bg', PARTIAL: 'bo', REJECTED: 'br' };
function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
  return <span className={`bdg ${QC_BADGE_CLS[status] || 'bsl'}`}>{s.label}</span>;
}

function QCDetailModal({ qc, onClose, onAction }) {
  const [decisionMode, setDecisionMode] = useState(false);
  const [acceptQty, setAcceptQty]       = useState(qc.total_qty_inspected || 0);
  const [rejectQty, setRejectQty]       = useState(0);
  const [reworkQty, setReworkQty]       = useState(0);
  const [holdQty, setHoldQty]           = useState(0);
  const [rejReason, setRejReason]       = useState('');
  const [initiateRtv, setInitiateRtv]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [msg, setMsg]                   = useState(null);

  const handleDecision = async () => {
    const a = parseFloat(acceptQty) || 0;
    const r = parseFloat(rejectQty) || 0;
    const rw = parseFloat(reworkQty) || 0;
    const h = parseFloat(holdQty) || 0;
    if (a + r + rw + h <= 0) { setMsg({ type: 'error', text: 'At least one quantity must be > 0.' }); return; }
    if (r > 0 && !rejReason.trim()) { setMsg({ type: 'error', text: 'Rejection reason is required when rejected qty > 0.' }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/qc/${qc.qc_id}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accepted_qty:     a,
          rejected_qty:     r,
          rework_qty:       rw,
          hold_qty:         h,
          rejection_reason: rejReason || null,
          initiate_rtv:     initiateRtv,
        }),
      });
      const data = await res.json();
      const rate = data.acceptance_rate ?? 100;
      const parts = [`Accepted: ${a}`, r > 0 ? `Rejected: ${r}` : null, rw > 0 ? `Rework: ${rw}` : null, h > 0 ? `Hold: ${h}` : null].filter(Boolean).join(' · ');
      setMsg({ type: 'success', text: `Decision recorded. ${parts}. Acceptance: ${rate}%${initiateRtv ? ' · RTV initiated.' : ''}` });
      setTimeout(() => { onAction(); onClose(); }, 2000);
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
            <div className="qci-info-item"><span className="qci-info-lbl">Accepted</span><span style={{ color: 'var(--green)', fontWeight: 700 }}>{qc.accepted_qty ?? '—'}</span></div>
            <div className="qci-info-item"><span className="qci-info-lbl">Rejected</span><span style={{ color: 'var(--r2)', fontWeight: 700 }}>{qc.rejected_qty ?? '—'}</span></div>
            {(parseFloat(qc.rework_qty) > 0 || ['ACCEPTED','PARTIAL','REJECTED'].includes(qc.status)) && (
              <div className="qci-info-item"><span className="qci-info-lbl">Rework</span><span style={{ color: parseFloat(qc.rework_qty) > 0 ? '#ea580c' : 'var(--text3)', fontWeight: 700 }}>{qc.rework_qty ?? 0}</span></div>
            )}
            {(parseFloat(qc.hold_qty) > 0 || ['ACCEPTED','PARTIAL','REJECTED'].includes(qc.status)) && (
              <div className="qci-info-item"><span className="qci-info-lbl">On Hold</span><span style={{ color: parseFloat(qc.hold_qty) > 0 ? '#7c3aed' : 'var(--text3)', fontWeight: 700 }}>{qc.hold_qty ?? 0}</span></div>
            )}
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
              <div className="qci-decision-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="qci-form-field">
                  <label className="qci-form-lbl">Accepted Qty</label>
                  <input className="qci-form-input" type="number" min="0" step="0.001"
                    value={acceptQty} onChange={e => setAcceptQty(e.target.value)} />
                </div>
                <div className="qci-form-field">
                  <label className="qci-form-lbl">Rejected Qty</label>
                  <input className="qci-form-input" type="number" min="0" step="0.001"
                    value={rejectQty} onChange={e => setRejectQty(e.target.value)} />
                </div>
                <div className="qci-form-field">
                  <label className="qci-form-lbl" style={{ color: '#ea580c' }}>Rework Qty</label>
                  <input className="qci-form-input" type="number" min="0" step="0.001"
                    value={reworkQty} onChange={e => setReworkQty(e.target.value)}
                    placeholder="Qty requiring rework" />
                </div>
                <div className="qci-form-field">
                  <label className="qci-form-lbl" style={{ color: '#7c3aed' }}>Hold Qty</label>
                  <input className="qci-form-input" type="number" min="0" step="0.001"
                    value={holdQty} onChange={e => setHoldQty(e.target.value)}
                    placeholder="Qty placed on hold" />
                </div>
              </div>
              {parseFloat(rejectQty) > 0 && (
                <>
                  <textarea className="qci-reason-input" rows={2}
                    placeholder="Rejection reason (required when rejected qty > 0)…"
                    value={rejReason} onChange={e => setRejReason(e.target.value)} />
                  <label className="qci-rtv-label">
                    <input type="checkbox" checked={initiateRtv} onChange={e => setInitiateRtv(e.target.checked)} />
                    <span>Initiate Return to Vendor (RTV)</span>
                  </label>
                </>
              )}
              {(parseFloat(reworkQty) > 0 || parseFloat(holdQty) > 0) && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.2)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                  {parseFloat(reworkQty) > 0 && <div>Rework items will be tracked separately pending re-inspection.</div>}
                  {parseFloat(holdQty) > 0 && <div>Hold items are quarantined pending disposition decision.</div>}
                </div>
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
            Rework: q.rework_qty ?? 0, Hold: q.hold_qty ?? 0,
          })), `qc_inspections_${period}`)} label="Export" />
          {onGoChat && (
            <button onClick={() => onGoChat('Analyse QC inspection results — what is the overall acceptance rate, which SKUs and suppliers have the highest rejection rates, and which items need immediate supplier quality review conversations?')}
              style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1.5px solid rgba(20,184,166,.35)', background: 'rgba(20,184,166,.09)', color: '#0d9488', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              ✨ AI Brief
            </button>
          )}
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

      {/* AI Opportunity Chips */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '✅', text: `Acceptance rate ${kpiCards[3].value} — which SKUs drag it down the most?`, q: `My QC acceptance rate is ${kpiCards[3].value}. Which specific SKUs and suppliers have the worst rejection rates? For each high-rejection SKU, what is the most likely failure cause — packaging, transit damage, manufacturing defect, or specification mismatch? What corrective action should I take with each supplier?` },
            { icon: '⏳', text: `${kpiCards[0].value} pending inspections — prioritise by stock criticality`, q: `I have ${kpiCards[0].value} pending QC inspections. How do I prioritise the sequence of inspections based on stock criticality? Which items are likely blocking production or customer orders? Give me a framework for QC prioritisation in a hardware and sanitary fittings business.` },
            { icon: '🔄', text: 'Reduce QC cycle time — what should each inspection take?', q: 'What is the optimal QC inspection cycle time for hardware fittings, sanitary ware, CP fittings, and plywood? What are the key inspection parameters for each category and how do I train inspectors to do fast but thorough quality checks? How do the best-in-class distributors run their QC process?' },
            { icon: '🏭', text: 'Which suppliers have repeat rejections — time for a quality review?', q: 'Analyse my QC rejection patterns by supplier. Which suppliers have had 2 or more rejections in the last 3 months? What is the standard process for issuing a supplier quality improvement notice (SQIN)? How do I decide whether to issue a warning, reduce volumes, or delist a supplier?' },
            { icon: '📋', text: 'Hold and rework quantities — recovery plan and accounting treatment', q: 'I have items in Hold and Rework status from QC inspections. What is the process for managing rework — who should do it, how do I account for the cost, and when should I reject vs rework? For Hold items, what criteria determine whether they get accepted, returned, or scrapped?' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Supplier Quality Scorecard + Category Defect Analysis ── */}
      {(() => {
        const supplierMap = {};
        items.forEach(q => {
          if (!q.supplier_name) return;
          if (!supplierMap[q.supplier_name]) supplierMap[q.supplier_name] = { total: 0, accepted: 0, rejected: 0 };
          supplierMap[q.supplier_name].total    += parseFloat(q.total_qty_inspected) || 0;
          supplierMap[q.supplier_name].accepted += parseFloat(q.accepted_qty) || 0;
          supplierMap[q.supplier_name].rejected += parseFloat(q.rejected_qty) || 0;
        });
        const liveSuppliers = Object.entries(supplierMap)
          .map(([name, s]) => ({ name, total: s.total, rejected: s.rejected, rate: s.total > 0 ? ((s.accepted / s.total) * 100).toFixed(1) : '0.0' }))
          .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));
        const suppliersToShow = liveSuppliers.length >= 3 ? liveSuppliers : STATIC_SUPPLIER_QC;

        const catMap = {};
        items.forEach(q => {
          if (!q.category) return;
          if (!catMap[q.category]) catMap[q.category] = { count: 0, total: 0, rejected: 0 };
          catMap[q.category].count++;
          catMap[q.category].total    += parseFloat(q.total_qty_inspected) || 0;
          catMap[q.category].rejected += parseFloat(q.rejected_qty) || 0;
        });
        const liveCats = Object.entries(catMap)
          .map(([cat, c]) => ({ cat, count: c.count, defect_rate: c.total > 0 ? ((c.rejected / c.total) * 100).toFixed(1) : '0.0' }))
          .sort((a, b) => parseFloat(b.defect_rate) - parseFloat(a.defect_rate));
        const catsToShow = liveCats.length >= 2 ? liveCats : STATIC_CATEGORY_QC;

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Supplier Quality Scorecard */}
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">Supplier Quality Scorecard</div>
                  <div className="csub">Acceptance rate ranked best → worst · Click row for AI action</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {suppliersToShow.slice(0, 6).map((s, i) => {
                  const rate = parseFloat(s.rate);
                  const color = rate >= 95 ? '#16a34a' : rate >= 85 ? '#d97706' : '#dc2626';
                  const label = rate >= 95 ? 'Excellent' : rate >= 85 ? 'Acceptable' : 'Action Needed';
                  return (
                    <div key={i} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                      onClick={() => onGoChat?.(`Supplier ${s.name} QC: ${s.rate}% acceptance, ${s.total} units inspected, ${s.rejected} rejected. ${rate < 85 ? 'Below threshold — what specific steps should I take to improve quality with this supplier and at what rejection rate should I issue a formal SQIN?' : 'What keeps this supplier performing well and how do I lock in these quality standards contractually?'}`)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>{s.name}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: color + '22', color }}>{label}</span>
                          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--mono)', color }}>{s.rate}%</span>
                        </div>
                      </div>
                      <div style={{ height: 6, background: 'var(--s3)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, rate)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 10, color: 'var(--text3)' }}>
                        <span>{s.total} inspected</span>
                        {s.rejected > 0 && <span style={{ color: '#dc2626' }}>{s.rejected} rejected</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Category Defect Rate */}
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">Category Defect Analysis</div>
                  <div className="csub">Defect rate % by product category — click for AI advice</div>
                </div>
                {onGoChat && (
                  <button className="export-btn" onClick={() => onGoChat('Which product categories have the highest defect rates? What are the most common failure modes in hardware, sanitary ware, and CP fittings? How should I redesign the QC checklist for each high-risk category?')}>
                    ✨ AI Brief
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {catsToShow.map((c, i) => {
                  const rate = parseFloat(c.defect_rate);
                  const color = rate > 5 ? '#dc2626' : rate > 2 ? '#d97706' : '#16a34a';
                  return (
                    <div key={i} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                      onClick={() => onGoChat?.(`Category ${c.cat}: defect rate ${c.defect_rate}% (${c.count} inspections). What are the most common defects in this category and how should I adjust the QC checklist to catch them earlier? If rate is above 5%, what pre-shipment inspection steps should I add?`)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)' }}>{c.cat}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color }}>{c.defect_rate}% defect rate</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--s3)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, rate * 12)}%`, height: '100%', background: color, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{c.count} inspection{c.count !== 1 ? 's' : ''}</div>
                      {i === 0 && rate > 4 && (
                        <div style={{ fontSize: 10, color: '#dc2626', marginTop: 1, fontWeight: 600 }}>⚠ Highest defect rate — recommend pre-shipment inspection</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

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
              <th>Accepted</th><th>Rejected</th><th>Rework</th><th>Hold</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
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
                <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: parseFloat(q.rework_qty) > 0 ? '#ea580c' : 'var(--text3)' }}>{parseFloat(q.rework_qty) > 0 ? q.rework_qty : '—'}</td>
                <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: parseFloat(q.hold_qty) > 0 ? '#7c3aed' : 'var(--text3)' }}>{parseFloat(q.hold_qty) > 0 ? q.hold_qty : '—'}</td>
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
