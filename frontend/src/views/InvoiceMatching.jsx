import React, { useState, useEffect, useCallback } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import DataSourceBadge from '../components/DataSourceBadge';
import { ExportButton, exportToCsv } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATUS_STYLES = {
  MATCHED:       { bg: 'rgba(22,163,74,.12)',  color: '#15803d', label: 'Matched' },
  DISCREPANCY:   { bg: 'rgba(220,38,38,.12)',  color: '#dc2626', label: 'Discrepancy' },
  PENDING_REVIEW:{ bg: 'rgba(245,158,11,.12)', color: '#b45309', label: 'Pending Review' },
  APPROVED:      { bg: 'rgba(99,102,241,.12)', color: '#6366f1', label: 'Approved' },
  PAID:          { bg: 'rgba(59,130,246,.12)', color: '#2563eb', label: 'Paid' },
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
  const s = STATUS_STYLES[status] || STATUS_STYLES.PENDING_REVIEW;
  return <span className="im-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}

function MatchValueBar({ po, grn, invoice }) {
  const max = Math.max(parseFloat(po)||0, parseFloat(grn)||0, parseFloat(invoice)||0, 1);
  const poPct  = Math.round(100 * (parseFloat(po)||0)  / max);
  const grnPct = Math.round(100 * (parseFloat(grn)||0) / max);
  const invPct = Math.round(100 * (parseFloat(invoice)||0) / max);
  return (
    <div className="im-value-bars">
      {[
        { label: 'PO Value',      val: po,      pct: poPct,  color: '#6366f1' },
        { label: 'GRN Value',     val: grn,     pct: grnPct, color: '#0891b2' },
        { label: 'Invoice Value', val: invoice, pct: invPct, color: '#2563eb' },
      ].map(({ label, val, pct, color }) => (
        <div key={label} className="im-bar-row">
          <span className="im-bar-lbl">{label}</span>
          <div className="im-bar-track">
            <div className="im-bar-fill" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="im-bar-val" style={{ color }}>{fmtCurrency(val)}</span>
        </div>
      ))}
    </div>
  );
}

function MatchDetailModal({ match, onClose, onAction }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState(null);

  const handleApprove = async () => {
    setSaving(true);
    try {
      await fetch(`/api/invoice-matching/${match.match_id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: 'Finance Manager' }),
      });
      setMsg({ type: 'success', text: 'Invoice approved for AP payment.' });
      setTimeout(() => { onAction(); onClose(); }, 1200);
    } catch { setMsg({ type: 'error', text: 'Approval failed.' }); }
    finally { setSaving(false); }
  };

  const handleMarkPaid = async () => {
    setSaving(true);
    try {
      await fetch(`/api/invoice-matching/${match.match_id}/mark-paid`, { method: 'PATCH' });
      setMsg({ type: 'success', text: 'Invoice marked as paid.' });
      setTimeout(() => { onAction(); onClose(); }, 1200);
    } catch { setMsg({ type: 'error', text: 'Failed to mark paid.' }); }
    finally { setSaving(false); }
  };

  const disc = parseFloat(match.discrepancy_amt) || 0;

  return (
    <div className="im-overlay" onClick={onClose}>
      <div className="im-modal" onClick={e => e.stopPropagation()}>
        <div className="im-modal-hdr">
          <div>
            <div className="im-modal-title">{match.match_number}</div>
            <div className="im-modal-sub">{match.supplier_name} · Invoice {match.invoice_number}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={match.match_status} />
            <button className="im-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="im-modal-body">
          <div className="im-info-grid">
            <div className="im-info-item"><span className="im-info-lbl">PO Number</span><span style={{ fontFamily: 'var(--mono)' }}>{match.po_number}</span></div>
            <div className="im-info-item"><span className="im-info-lbl">GRN Number</span><span style={{ fontFamily: 'var(--mono)' }}>{match.grn_number}</span></div>
            <div className="im-info-item"><span className="im-info-lbl">Invoice Date</span><span>{fmtDate(match.invoice_date)}</span></div>
            <div className="im-info-item"><span className="im-info-lbl">Payment Terms</span><span>{match.payment_terms}</span></div>
            <div className="im-info-item"><span className="im-info-lbl">Payment Due</span>
              <span style={{ color: match.payment_due_date && new Date(match.payment_due_date) < new Date() ? 'var(--r2)' : undefined }}>
                {fmtDate(match.payment_due_date)}
              </span>
            </div>
            {match.approved_by && (
              <div className="im-info-item"><span className="im-info-lbl">Approved By</span><span>{match.approved_by}</span></div>
            )}
          </div>

          <MatchValueBar po={match.po_value} grn={match.grn_value} invoice={match.invoice_value} />

          {disc > 0 && (
            <div className="im-disc-banner">
              <span className="im-disc-label">⚠ Discrepancy: {fmtCurrency(disc)}</span>
              <p className="im-disc-reason">{match.discrepancy_reason || 'Invoice value does not match GRN received value.'}</p>
            </div>
          )}
          {disc === 0 && <div className="im-match-banner">✓ Perfect 3-way match — values are aligned.</div>}

          {match.notes && <div className="im-notes">{match.notes}</div>}

          <div className="im-action-area">
            {['MATCHED', 'PENDING_REVIEW'].includes(match.match_status) && (
              <button className="im-btn-primary" disabled={saving} onClick={handleApprove}>
                {saving ? 'Processing…' : '✓ Approve for Payment'}
              </button>
            )}
            {match.match_status === 'APPROVED' && (
              <button className="im-btn-paid" disabled={saving} onClick={handleMarkPaid}>
                {saving ? 'Saving…' : '₹ Mark as Paid'}
              </button>
            )}
          </div>
          {msg && <div className={`im-msg ${msg.type}`}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}

const MATCH_TYPE_INFO = {
  '2-Way': {
    label: '2-Way (PO + Invoice)',
    desc: 'Matches PO against supplier invoice. No GRN required. Used for service invoices or advance payments.',
    requires: ['po_number', 'invoice_number', 'supplier_name', 'invoice_date'],
    color: '#2563eb',
  },
  '3-Way': {
    label: '3-Way (PO + GRN + Invoice)',
    desc: 'Standard match: PO → GRN → Invoice. GRN must be recorded before matching.',
    requires: ['po_number', 'grn_number', 'invoice_number', 'supplier_name', 'invoice_date'],
    color: '#16a34a',
  },
  '4-Way': {
    label: '4-Way (PO + GRN + Invoice + QC)',
    desc: 'Strictest: requires QC inspection clearance in addition to GRN. Used for quality-critical materials.',
    requires: ['po_number', 'grn_number', 'qc_reference', 'invoice_number', 'supplier_name', 'invoice_date'],
    color: '#7c3aed',
  },
};

function CreateMatchModal({ onClose, onSuccess }) {
  const [matchingType, setMatchingType] = useState('3-Way');
  const [form, setForm] = useState({
    po_number: '', grn_number: '', qc_reference: '', invoice_number: '',
    supplier_name: '', invoice_date: '', po_value: '', grn_value: '',
    invoice_value: '', payment_terms: 'Net 30', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const info = MATCH_TYPE_INFO[matchingType];
  const needs3Way = matchingType === '3-Way' || matchingType === '4-Way';
  const needs4Way = matchingType === '4-Way';

  const handleSubmit = async () => {
    // Gate validation based on matching type
    if (!form.po_number.trim()) { setError('PO Number is required.'); return; }
    if (needs3Way && !form.grn_number.trim()) {
      setError(`${matchingType} match requires a GRN Number. Record a GRN first.`); return;
    }
    if (needs4Way && !form.qc_reference.trim()) {
      setError('4-Way match requires a QC inspection reference number.'); return;
    }
    if (!form.invoice_number.trim() || !form.supplier_name.trim() || !form.invoice_date) {
      setError('Invoice Number, Supplier and Invoice Date are required.'); return;
    }
    if (!form.invoice_value) { setError('Invoice value is required.'); return; }

    setSaving(true); setError('');
    try {
      const res = await fetch('/api/invoice-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          matching_type: matchingType,
          po_value:      parseFloat(form.po_value)      || 0,
          grn_value:     parseFloat(form.grn_value)     || 0,
          invoice_value: parseFloat(form.invoice_value) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Failed to create match.'); return; }
      onSuccess(data.match_number, data.match_status);
    } catch { setError('Failed to create match. Please retry.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="im-overlay" onClick={onClose}>
      <div className="im-modal" onClick={e => e.stopPropagation()}>
        <div className="im-modal-hdr">
          <div>
            <div className="im-modal-title">New Invoice Match</div>
            <div className="im-modal-sub">Select matching type then fill in the required references</div>
          </div>
          <button className="im-close" onClick={onClose}>×</button>
        </div>
        <div className="im-modal-body">

          {/* Matching type selector */}
          <div style={{ marginBottom: 16 }}>
            <div className="im-form-lbl" style={{ marginBottom: 8 }}>Matching Type *</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(MATCH_TYPE_INFO).map(([key, val]) => (
                <button key={key} onClick={() => { setMatchingType(key); setError(''); }}
                  style={{
                    padding: '7px 14px', borderRadius: 7, border: `2px solid ${matchingType === key ? val.color : 'var(--border)'}`,
                    background: matchingType === key ? `${val.color}18` : 'var(--s3)',
                    color: matchingType === key ? val.color : 'var(--text3)',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all .15s',
                  }}>
                  {val.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, padding: '8px 12px', background: `${info.color}10`,
              border: `1px solid ${info.color}40`, borderRadius: 6, fontSize: 12, color: info.color }}>
              {info.desc}
            </div>
          </div>

          <div className="im-form-grid">
            {/* PO Number — always required */}
            <div className="im-form-field">
              <label className="im-form-lbl">PO Number *</label>
              <input className="im-form-input" type="text" placeholder="PO-20260519-001"
                value={form.po_number} onChange={e => setField('po_number', e.target.value)} />
            </div>

            {/* GRN Number — required for 3-Way and 4-Way */}
            <div className="im-form-field">
              <label className="im-form-lbl">
                GRN Number {needs3Way ? '*' : <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional for 2-Way)</span>}
              </label>
              <input className="im-form-input" type="text" placeholder="GRN-20260520-001"
                value={form.grn_number} onChange={e => setField('grn_number', e.target.value)}
                style={{ borderColor: needs3Way && !form.grn_number ? '#fca5a5' : undefined }} />
            </div>

            {/* QC Reference — required only for 4-Way */}
            {needs4Way && (
              <div className="im-form-field">
                <label className="im-form-lbl">QC Inspection Ref *</label>
                <input className="im-form-input" type="text" placeholder="QCI-20260520-001"
                  value={form.qc_reference} onChange={e => setField('qc_reference', e.target.value)}
                  style={{ borderColor: !form.qc_reference ? '#fca5a5' : undefined }} />
              </div>
            )}

            {[
              ['Invoice Number *', 'invoice_number', 'text',   'SUPP/INV/2026/XXX'],
              ['Supplier *',       'supplier_name',  'text',   'Supplier name'],
              ['Invoice Date *',   'invoice_date',   'date',   ''],
              ['Payment Terms',    'payment_terms',  'text',   'Net 30'],
              ['PO Value',         'po_value',       'number', '0.00'],
              ['GRN Value',        'grn_value',      'number', '0.00'],
              ['Invoice Value *',  'invoice_value',  'number', '0.00'],
            ].map(([lbl, key, type, ph]) => (
              <div className="im-form-field" key={key}>
                <label className="im-form-lbl">{lbl}</label>
                <input className="im-form-input" type={type} placeholder={ph}
                  value={form[key]} onChange={e => setField(key, e.target.value)} />
              </div>
            ))}
            <div className="im-form-field im-form-full">
              <label className="im-form-lbl">Notes</label>
              <textarea className="im-form-input im-form-textarea" rows={2}
                value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            System auto-detects discrepancies and sets match status. {needs3Way ? 'GRN must be recorded in PO & GRN module first.' : ''}
          </p>
          {error && <div className="im-msg error">{error}</div>}
          <div className="im-modal-footer">
            <button className="im-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="im-btn-primary" disabled={saving} onClick={handleSubmit}
              style={{ background: info.color }}>
              {saving ? 'Processing…' : `Run ${matchingType} Match`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceMatching({ onGoChat, dbStatus, period }) {
  const [loading, setLoading]       = useState(true);
  const [kpis, setKpis]             = useState(null);
  const [matches, setMatches]       = useState([]);
  const [filter, setFilter]         = useState('');
  const [search, setSearch]         = useState('');
  const [dataSource, setDataSource] = useState('demo');
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const fetchData = useCallback(async () => {
    try {
      const [kpiRes, listRes] = await Promise.all([
        fetch('/api/invoice-matching/kpis'),
        fetch('/api/invoice-matching?limit=100'),
      ]);
      const [kpiData, listData] = await Promise.all([kpiRes.json(), listRes.json()]);
      setKpis(kpiData);
      setMatches(listData.matches || []);
      setDataSource(listData.data_source || 'demo');
    } catch { setMatches([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60 * 1000);

  const filtered = matches.filter(m => {
    const matchStatus = !filter || m.match_status === filter;
    const s = search.toLowerCase();
    const matchSearch = !s || m.match_number?.toLowerCase().includes(s)
      || m.supplier_name?.toLowerCase().includes(s)
      || m.invoice_number?.toLowerCase().includes(s)
      || m.po_number?.toLowerCase().includes(s);
    return matchStatus && matchSearch;
  });

  const kpiCards = [
    { label: 'Pending Review', value: kpis?.pending_review ?? 0, cls: 'sa' },
    { label: 'Discrepancies',  value: kpis?.discrepancy    ?? 0, cls: 'sr' },
    { label: 'Approved',       value: kpis?.approved       ?? 0, cls: 'sg' },
    { label: 'Match Rate',     value: `${parseFloat(kpis?.match_rate||0).toFixed(1)}%`, cls: 'sb' },
  ];

  const totalDiscrepancy = matches.reduce((s, m) => s + (parseFloat(m.discrepancy_amt)||0), 0);

  if (loading) return <SkeletonLoader type="full" />;

  return (
    <div className="im-wrap">
      <div className="im-header">
        <div>
          <h1 className="im-title">Invoice Matching</h1>
          <p className="im-subtitle">2-Way / 3-Way / 4-Way Match: PO · GRN · Invoice · QC · AP Approval</p>
        </div>
        <div className="im-header-actions">
          <DataSourceBadge source={dataSource} />
          <ExportButton onClick={() => exportToCsv(filtered.map(m => ({
            Match_No: m.match_number, Supplier: m.supplier_name, PO: m.po_number,
            GRN: m.grn_number, Invoice: m.invoice_number, Invoice_Date: m.invoice_date,
            PO_Value: m.po_value, GRN_Value: m.grn_value, Invoice_Value: m.invoice_value,
            Discrepancy: m.discrepancy_amt, Status: m.match_status, Due: m.payment_due_date,
          })), `invoice_matching_${period}`)} label="Export" />
          <button className="im-btn-primary" onClick={() => setShowCreate(true)}>+ New Match</button>
        </div>
      </div>

      {successMsg && <div className="im-success-banner">{successMsg}</div>}
      {totalDiscrepancy > 0 && !successMsg && (
        <div className="im-alert-banner">
          ⚠ Total unresolved discrepancy: <strong>{fmtCurrency(totalDiscrepancy)}</strong> — review highlighted records.
        </div>
      )}

      <div className="im-kpi-strip">
        {kpiCards.map((k, i) => (
          <div key={i} className={`kpi-card ${k.cls}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="im-filters">
        <input className="im-search-input" placeholder="Search match#, supplier, invoice, PO…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="im-status-tabs">
          {['', 'PENDING_REVIEW', 'DISCREPANCY', 'MATCHED', 'APPROVED', 'PAID'].map(s => (
            <button key={s} className={`im-stab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
              {s ? (STATUS_STYLES[s]?.label ?? s) : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="im-table-wrap">
        <table className="im-table">
          <thead>
            <tr>
              <th>Match #</th><th>Supplier</th><th>PO Number</th><th>Invoice #</th>
              <th>Invoice Date</th><th>PO Value</th><th>GRN Value</th><th>Invoice Value</th>
              <th>Discrepancy</th><th>Payment Due</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
                No invoice matches found.
              </td></tr>
            )}
            {filtered.map(m => {
              const disc = parseFloat(m.discrepancy_amt) || 0;
              return (
                <tr key={m.match_id} className={`im-row${disc > 0 ? ' im-row-disc' : ''}`} onClick={() => setSelected(m)}>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--brand)' }}>{m.match_number}</td>
                  <td>{m.supplier_name}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{m.po_number}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{m.invoice_number}</td>
                  <td>{fmtDate(m.invoice_date)}</td>
                  <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{fmtCurrency(m.po_value)}</td>
                  <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{fmtCurrency(m.grn_value)}</td>
                  <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{fmtCurrency(m.invoice_value)}</td>
                  <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: disc > 0 ? 'var(--r2)' : 'var(--green)', fontWeight: 700 }}>
                    {disc > 0 ? `−${fmtCurrency(disc)}` : '✓ Nil'}
                  </td>
                  <td style={{ color: m.payment_due_date && new Date(m.payment_due_date) < new Date() && m.match_status !== 'PAID' ? 'var(--r2)' : undefined }}>
                    {fmtDate(m.payment_due_date)}
                  </td>
                  <td><StatusBadge status={m.match_status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <MatchDetailModal match={selected} onClose={() => setSelected(null)} onAction={fetchData} />
      )}
      {showCreate && (
        <CreateMatchModal onClose={() => setShowCreate(false)} onSuccess={(no, status) => {
          setShowCreate(false);
          const disc = status === 'DISCREPANCY' ? ' — discrepancy detected, review required.' : ' — pending review.';
          setSuccessMsg(`Match ${no} created${disc}`);
          fetchData();
          setTimeout(() => setSuccessMsg(''), 5000);
        }} />
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Review invoice matching discrepancies — which suppliers consistently have price or quantity variances beyond the 1% tolerance? Analyse patterns in pending AP approvals and suggest process improvements to reduce 3-way match failures.')}>
          <span>✨</span>
          <span>Ask AI: Analyse invoice discrepancy patterns — which suppliers have recurring 3-way match failures? →</span>
        </div>
      )}
    </div>
  );
}
