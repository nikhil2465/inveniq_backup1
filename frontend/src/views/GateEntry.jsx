import React, { useState, useEffect, useCallback } from 'react';
import SkeletonLoader from '../components/SkeletonLoader';
import DataSourceBadge from '../components/DataSourceBadge';
import { ExportButton, exportToCsv } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATUS_STYLES = {
  ARRIVED:            { bg: 'rgba(245,158,11,.12)', color: '#b45309', label: 'Arrived' },
  VERIFIED:           { bg: 'rgba(59,130,246,.12)', color: '#2563eb', label: 'Verified' },
  FORWARDED_TO_STORE: { bg: 'rgba(22,163,74,.12)',  color: '#15803d', label: 'Forwarded to Store' },
  REJECTED:           { bg: 'rgba(220,38,38,.12)',  color: '#dc2626', label: 'Rejected' },
  DEPARTED:           { bg: 'rgba(107,114,128,.12)',color: '#6b7280', label: 'Departed' },
};

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.ARRIVED;
  return <span className="ge-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}

function EntryDetailModal({ entry, onClose, onAction }) {
  const [rejReason, setRejReason] = useState('');
  const [grnRef, setGrnRef]       = useState(entry.forwarded_grn || '');
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState(null);

  const handleVerify = async (approved) => {
    setSaving(true);
    try {
      await fetch(`/api/gate-entry/${entry.entry_id}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_verified: approved,
          rejection_reason: approved ? null : (rejReason || 'Documents not in order'),
        }),
      });
      setMsg({ type: 'success', text: approved ? 'Entry verified. Ready to forward to stores.' : 'Entry rejected.' });
      setTimeout(() => { onAction(); onClose(); }, 1200);
    } catch { setMsg({ type: 'error', text: 'Action failed.' }); }
    finally { setSaving(false); }
  };

  const handleForward = async () => {
    setSaving(true);
    try {
      await fetch(`/api/gate-entry/${entry.entry_id}/forward`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grn_number: grnRef || null }),
      });
      setMsg({ type: 'success', text: 'Vehicle forwarded to stores for GRN.' });
      setTimeout(() => { onAction(); onClose(); }, 1200);
    } catch { setMsg({ type: 'error', text: 'Forward failed.' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="ge-overlay" onClick={onClose}>
      <div className="ge-modal" onClick={e => e.stopPropagation()}>
        <div className="ge-modal-hdr">
          <div>
            <div className="ge-modal-title">{entry.entry_number}</div>
            <div className="ge-modal-sub">{entry.vehicle_number} · {entry.supplier_name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={entry.status} />
            <button className="ge-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="ge-modal-body">
          <div className="ge-info-grid">
            <div className="ge-info-item"><span className="ge-info-lbl">Vehicle No.</span><span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{entry.vehicle_number}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">Driver</span><span>{entry.driver_name || '—'}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">Driver Contact</span><span style={{ fontFamily: 'var(--mono)' }}>{entry.driver_contact || '—'}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">Supplier</span><span>{entry.supplier_name}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">DC Number</span><span style={{ fontFamily: 'var(--mono)' }}>{entry.dc_number}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">DC Date</span><span>{fmtDate(entry.dc_date)}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">PO Reference</span><span style={{ fontFamily: 'var(--mono)' }}>{entry.po_reference || '—'}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">Security Guard</span><span>{entry.security_guard || '—'}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">Entry Time</span><span>{fmtDateTime(entry.entry_time)}</span></div>
            <div className="ge-info-item"><span className="ge-info-lbl">Exit Time</span><span>{fmtDateTime(entry.exit_time)}</span></div>
            <div className="ge-info-item">
              <span className="ge-info-lbl">Seal Intact</span>
              <span style={{ color: entry.seal_intact ? 'var(--green)' : 'var(--r2)', fontWeight: 700 }}>
                {entry.seal_intact ? '✓ Yes' : '✗ No'}
              </span>
            </div>
            <div className="ge-info-item">
              <span className="ge-info-lbl">Docs Verified</span>
              <span style={{ color: entry.doc_verified ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
                {entry.doc_verified ? '✓ Yes' : 'Pending'}
              </span>
            </div>
          </div>

          {entry.material_desc && (
            <div className="ge-material-desc">
              <span className="ge-info-lbl">Material Description</span>
              <p>{entry.material_desc}</p>
            </div>
          )}
          {entry.rejection_reason && (
            <div className="ge-rejection-note">Rejection reason: {entry.rejection_reason}</div>
          )}
          {entry.forwarded_grn && (
            <div className="ge-fwd-note">Forwarded with GRN: <strong>{entry.forwarded_grn}</strong></div>
          )}
          {entry.notes && <div className="ge-notes">{entry.notes}</div>}

          {/* Actions for ARRIVED */}
          {entry.status === 'ARRIVED' && (
            <div className="ge-action-area">
              <div className="ge-section-title">Verify Documents</div>
              <textarea className="ge-reason-input" rows={2}
                placeholder="Rejection reason (required if rejecting)…"
                value={rejReason} onChange={e => setRejReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="ge-btn-approve" disabled={saving} onClick={() => handleVerify(true)}>
                  ✓ Verify & Accept
                </button>
                <button className="ge-btn-reject" disabled={saving || !rejReason.trim()} onClick={() => handleVerify(false)}>
                  ✗ Reject Entry
                </button>
              </div>
            </div>
          )}

          {/* Forward to Stores for VERIFIED */}
          {entry.status === 'VERIFIED' && (
            <div className="ge-action-area">
              <div className="ge-section-title">Forward to Stores for GRN</div>
              <input className="ge-form-input" placeholder="GRN number (if already created)…"
                value={grnRef} onChange={e => setGrnRef(e.target.value)} />
              <button className="ge-btn-approve" disabled={saving} onClick={handleForward} style={{ marginTop: 8 }}>
                {saving ? 'Forwarding…' : '→ Forward to Stores'}
              </button>
            </div>
          )}

          {msg && <div className={`ge-msg ${msg.type}`}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}

function CreateEntryModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    vehicle_number: '', driver_name: '', driver_contact: '', supplier_name: '',
    po_reference: '', dc_number: '', dc_date: '', security_guard: '',
    material_desc: '', seal_intact: true, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.vehicle_number.trim() || !form.supplier_name.trim() || !form.dc_number.trim()) {
      setError('Vehicle Number, Supplier and DC Number are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/gate-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, seal_intact: !!form.seal_intact }),
      });
      const data = await res.json();
      onSuccess(data.entry_number);
    } catch { setError('Failed to create gate entry.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="ge-overlay" onClick={onClose}>
      <div className="ge-modal" onClick={e => e.stopPropagation()}>
        <div className="ge-modal-hdr">
          <div><div className="ge-modal-title">New Gate Entry</div><div className="ge-modal-sub">Record vehicle arrival and DC</div></div>
          <button className="ge-close" onClick={onClose}>×</button>
        </div>
        <div className="ge-modal-body">
          <div className="ge-form-grid">
            {[
              ['Vehicle Number *', 'vehicle_number', 'text',   'MH-04-AB-1234'],
              ['Driver Name',      'driver_name',    'text',   'Driver name'],
              ['Driver Contact',   'driver_contact', 'text',   '9876543210'],
              ['Supplier Name *',  'supplier_name',  'text',   'Supplier name'],
              ['PO Reference',     'po_reference',   'text',   'PO-20260520-001'],
              ['DC Number *',      'dc_number',      'text',   'SUPP/DC/2026/XXX'],
              ['DC Date',          'dc_date',        'date',   ''],
              ['Security Guard',   'security_guard', 'text',   'Guard name'],
            ].map(([lbl, key, type, ph]) => (
              <div className="ge-form-field" key={key}>
                <label className="ge-form-lbl">{lbl}</label>
                <input className="ge-form-input" type={type} placeholder={ph}
                  value={form[key]} onChange={e => setField(key, e.target.value)} />
              </div>
            ))}
            <div className="ge-form-field ge-form-full">
              <label className="ge-form-lbl">Material Description</label>
              <textarea className="ge-form-input ge-form-textarea" rows={2}
                value={form.material_desc} onChange={e => setField('material_desc', e.target.value)}
                placeholder="Brief description of goods being delivered…" />
            </div>
            <div className="ge-form-field ge-form-full">
              <label className="ge-seal-label">
                <input type="checkbox" checked={form.seal_intact} onChange={e => setField('seal_intact', e.target.checked)} />
                <span>Vehicle/Package Seal Intact</span>
              </label>
            </div>
          </div>
          {error && <div className="ge-msg error">{error}</div>}
          <div className="ge-modal-footer">
            <button className="ge-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="ge-btn-approve" disabled={saving} onClick={handleSubmit}>
              {saving ? 'Recording…' : 'Record Gate Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GateEntry({ onGoChat, dbStatus, period }) {
  const [loading, setLoading]       = useState(true);
  const [kpis, setKpis]             = useState(null);
  const [entries, setEntries]       = useState([]);
  const [filter, setFilter]         = useState('');
  const [search, setSearch]         = useState('');
  const [dataSource, setDataSource] = useState('demo');
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const fetchData = useCallback(async () => {
    try {
      const [kpiRes, listRes] = await Promise.all([
        fetch('/api/gate-entry/kpis'),
        fetch('/api/gate-entry?limit=100'),
      ]);
      const [kpiData, listData] = await Promise.all([kpiRes.json(), listRes.json()]);
      setKpis(kpiData);
      setEntries(listData.entries || []);
      setDataSource(listData.data_source || 'demo');
    } catch { setEntries([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 2 * 60 * 1000);

  const filtered = entries.filter(e => {
    const matchStatus = !filter || e.status === filter;
    const s = search.toLowerCase();
    const matchSearch = !s || e.entry_number?.toLowerCase().includes(s)
      || e.vehicle_number?.toLowerCase().includes(s)
      || e.supplier_name?.toLowerCase().includes(s)
      || e.dc_number?.toLowerCase().includes(s);
    return matchStatus && matchSearch;
  });

  const kpiCards = [
    { label: 'Arrived Today',    value: kpis?.total_today         ?? 0, cls: 'sb' },
    { label: 'Pending Verify',   value: kpis?.arrived             ?? 0, cls: 'sa' },
    { label: 'Forwarded',        value: kpis?.forwarded_to_store  ?? 0, cls: 'sg' },
    { label: 'Rejected',         value: kpis?.rejected            ?? 0, cls: 'sr' },
  ];

  if (loading) return <SkeletonLoader type="full" />;

  return (
    <div className="ge-wrap">
      <div className="ge-header">
        <div>
          <h1 className="ge-title">Gate Entry</h1>
          <p className="ge-subtitle">Vehicle arrival log · DC verification · Security checkpoint · Forward to GRN</p>
        </div>
        <div className="ge-header-actions">
          <DataSourceBadge source={dataSource} />
          <ExportButton onClick={() => exportToCsv(filtered.map(e => ({
            Entry_No: e.entry_number, Vehicle: e.vehicle_number, Driver: e.driver_name,
            Supplier: e.supplier_name, PO_Ref: e.po_reference, DC_No: e.dc_number,
            Entry_Time: e.entry_time, Status: e.status, Seal_Intact: e.seal_intact ? 'Yes' : 'No',
            Doc_Verified: e.doc_verified ? 'Yes' : 'No', GRN: e.forwarded_grn || '',
          })), `gate_entries_${period}`)} label="Export" />
          <button className="ge-btn-primary" onClick={() => setShowCreate(true)}>+ New Entry</button>
        </div>
      </div>

      {successMsg && <div className="ge-success-banner">{successMsg}</div>}

      <div className="ge-kpi-strip">
        {kpiCards.map((k, i) => (
          <div key={i} className={`kpi-card ${k.cls}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="ge-filters">
        <input className="ge-search-input" placeholder="Search entry#, vehicle, supplier, DC…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="ge-status-tabs">
          {['', 'ARRIVED', 'VERIFIED', 'FORWARDED_TO_STORE', 'REJECTED', 'DEPARTED'].map(s => (
            <button key={s} className={`ge-stab${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
              {s ? (STATUS_STYLES[s]?.label ?? s) : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="ge-table-wrap">
        <table className="ge-table">
          <thead>
            <tr>
              <th>Entry #</th><th>Vehicle</th><th>Driver</th><th>Supplier</th>
              <th>DC Number</th><th>PO Reference</th><th>Entry Time</th>
              <th>Seal</th><th>Docs</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
                No gate entries found.
              </td></tr>
            )}
            {filtered.map(e => (
              <tr key={e.entry_id} className="ge-row" onClick={() => setSelected(e)}>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--brand)' }}>{e.entry_number}</td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{e.vehicle_number}</td>
                <td>{e.driver_name || '—'}</td>
                <td>{e.supplier_name}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{e.dc_number}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{e.po_reference || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDateTime(e.entry_time)}</td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: e.seal_intact ? 'var(--green)' : 'var(--r2)', fontWeight: 700 }}>
                    {e.seal_intact ? '✓' : '✗'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ color: e.doc_verified ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
                    {e.doc_verified ? '✓' : '—'}
                  </span>
                </td>
                <td><StatusBadge status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <EntryDetailModal entry={selected} onClose={() => setSelected(null)} onAction={fetchData} />
      )}
      {showCreate && (
        <CreateEntryModal onClose={() => setShowCreate(false)} onSuccess={(no) => {
          setShowCreate(false);
          setSuccessMsg(`Gate entry ${no} recorded.`);
          fetchData();
          setTimeout(() => setSuccessMsg(''), 4000);
        }} />
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Analyse gate entry patterns — which suppliers or transporters have the most pending or rejected entries? Flag any vehicles arriving without prior PO references and suggest security or scheduling improvements.')}>
          <span>✨</span>
          <span>Ask AI: Analyse gate entry patterns — pending verifications, transporters with rejections, scheduling gaps →</span>
        </div>
      )}
    </div>
  );
}
