import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import Pagination from '../components/Pagination';
import { useDraggable } from '../components/DraggableModal';

// ── Customer import helpers ───────────────────────────────────────────────────
function _parseWithDelim(text, delim) {
  // Strip BOM if present
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i <= clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"') { if (clean[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else if (ch !== undefined) { field += ch; }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === delim) {
      row.push(field.trim()); field = '';
    } else if (ch === '\n' || ch === undefined || (ch === '\r' && clean[i + 1] === '\n')) {
      if (ch === '\r') i++;
      row.push(field.trim()); field = '';
      if (row.some(v => v)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (!rows.length) return { headers: [], rows: [] };
  return { headers: rows[0], rows: rows.slice(1).filter(r => r.some(v => v)) };
}

function parseCustCSV(text) {
  // Try each delimiter in order of preference; use the one that gives the most columns
  const candidates = [',', ';', '\t', '|'];
  let best = { headers: [], rows: [] };
  for (const d of candidates) {
    const r = _parseWithDelim(text, d);
    if (r.headers.length > best.headers.length) best = r;
    if (best.headers.length > 1) break;
  }
  // Handle "double-quoted CSV" where each row is one big quoted field containing commas
  if (best.headers.length === 1 && best.headers[0].includes(',')) {
    const stripped = text
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .map(line => { const t = line.trim(); return (t.startsWith('"') && t.endsWith('"')) ? t.slice(1, -1) : t; })
      .join('\n');
    const retry = _parseWithDelim(stripped, ',');
    if (retry.headers.length > 1) return retry;
  }
  return best;
}

function suggestCustMapping(headers) {
  const norm = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const HINTS = {
    name:             ['customername','name','customer','company','clientname','client','firmname','businessname','storename'],
    segment:          ['segment','type','category','customertype','clienttype','businesstype','businesscategory'],
    contact_person:   ['contactperson','contactname','contact','person','attn','attention','personname','primarycontact','keycontact'],
    phone:            ['phone','mobile','mobileno','tel','contactnumber','phonenumber','mobilenumber','contactphone'],
    email:            ['email','mail','emailid','emailaddress'],
    monthly_value:    ['monthlyvalue','revenue','monthlyrevenue','value','sales','monthlysales','turnoverrange','turnover'],
    score:            ['score','aiscore','creditscore','rating'],
    outstanding:      ['outstanding','overdue','balance','pending','dueamount'],
    days_since_order: ['days','dayssince','dayssilent','lastorder','dayssinceorder'],
    risk:             ['risk','risklevel','riskrating','riskstatus','verificationstatus'],
  };
  const result = {};
  for (const [field, hints] of Object.entries(HINTS)) {
    result[field] = null;
    for (const hint of hints) {
      const idx = norm.findIndex(h => h === hint || h.includes(hint) || hint.includes(h));
      if (idx !== -1) { result[field] = idx; break; }
    }
  }
  return result;
}

const CUSTOMER_IMPORT_FIELDS = [
  { key: 'name',             label: 'Customer Name *', required: true },
  { key: 'segment',          label: 'Segment' },
  { key: 'contact_person',   label: 'Contact Person' },
  { key: 'phone',            label: 'Phone' },
  { key: 'email',            label: 'Email' },
  { key: 'monthly_value',    label: 'Monthly Revenue' },
  { key: 'outstanding',      label: 'Outstanding Amount' },
  { key: 'days_since_order', label: 'Days Since Last Order' },
  { key: 'risk',             label: 'Risk (LOW/MEDIUM/HIGH)' },
  { key: 'score',            label: 'Score (0–100)' },
];

function CustomerImportModal({ onClose, onImported }) {
  const [impStep,    setImpStep]    = useState(0);
  const [impFile,    setImpFile]    = useState(null);
  const [impHeaders, setImpHeaders] = useState([]);
  const [impRows,    setImpRows]    = useState([]);
  const [impMapping, setImpMapping] = useState({});
  const [impLoading, setImpLoading] = useState(false);
  const [impError,   setImpError]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const { ref: importModalRef, style: importDragStyle } = useDraggable();

  const resetImp = () => {
    setImpStep(0); setImpFile(null); setImpHeaders([]); setImpRows([]);
    setImpMapping({}); setImpError(''); setSaved(false); setSavedCount(0);
  };

  const handleImpFile = async (f) => {
    if (!f) return;
    setImpFile(f);
    setImpError('');
    const fname = f.name.toLowerCase();
    if (fname.endsWith('.csv')) {
      const text = await f.text();
      const { headers, rows } = parseCustCSV(text);
      if (!headers.length) { setImpError('File appears empty or could not be parsed. Check that it has a header row.'); return; }
      setImpHeaders(headers); setImpRows(rows);
      setImpMapping(suggestCustMapping(headers));
      setImpStep(1);
    } else if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
      setImpLoading(true);
      try {
        const form = new FormData();
        form.append('file', f);
        const r = await fetch('/api/catalog/parse-import', { method: 'POST', body: form });
        if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Server error ${r.status}${t ? ': ' + t.slice(0, 120) : ''}`); }
        const d = await r.json();
        if (!d.headers?.length) { setImpError('File appears empty or has no header row.'); return; }
        setImpHeaders(d.headers); setImpRows(d.rows);
        setImpMapping(suggestCustMapping(d.headers));
        setImpStep(1);
      } catch (e) {
        setImpError(e.message || 'Failed to parse Excel file.');
      } finally {
        setImpLoading(false);
      }
    } else {
      setImpError('Unsupported format. Please upload a .csv, .xlsx, or .xls file.');
    }
  };

  const nameOk = impMapping.name !== null && impMapping.name !== undefined;

  const validRows = impRows.filter(row => {
    const val = nameOk ? (row[impMapping.name] ?? '').trim() : '';
    return !!val;
  });

  const handleImpConfirm = async () => {
    if (!validRows.length) { alert('No valid rows found. Make sure "Customer Name *" column is mapped and has values.'); return; }
    setSaving(true);
    try {
      const customers = validRows.map(row => {
        const c = {};
        for (const [field, colIdx] of Object.entries(impMapping)) {
          if (colIdx === null || colIdx === undefined) continue;
          const val = (row[colIdx] ?? '').trim();
          if (val) c[field] = val;
        }
        return c;
      });
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned ${res.status}. Please check your data and try again.`);
      }
      const d = await res.json();
      setSavedCount(d.added || customers.length);
      setSaved(true);
      onImported();
    } catch (e) {
      setImpError(e.message || 'Import failed. Check backend connection.');
    } finally {
      setSaving(false);
    }
  };

  const mappedFields = CUSTOMER_IMPORT_FIELDS.filter(f => impMapping[f.key] !== null && impMapping[f.key] !== undefined);

  if (saved) return (
    <div className="qb-modal-overlay">
      <div className="pc-add-modal" ref={importModalRef} style={{ maxWidth: 480, textAlign: 'center', padding: 40, ...importDragStyle }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>
          {savedCount} Customer{savedCount !== 1 ? 's' : ''} Imported!
        </div>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>
          Customer Intelligence has been updated. The table refreshes automatically.
        </div>
        <button className="btn-primary" style={{ marginRight: 8 }} onClick={onClose}>View Customers</button>
        <button className="qb-close-secondary" onClick={resetImp}>Import More</button>
      </div>
    </div>
  );

  return (
    <div className="qb-modal-overlay">
      <div className="pc-add-modal" ref={importModalRef} style={importDragStyle}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0f4c81 0%, #1a6ba0 100%)', borderRadius: '12px 12px 0 0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>📥 Import Customer Data</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 2 }}>
              Upload CSV or Excel — columns auto-mapped · full preview before import
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
        </div>

        {/* Scrollable content — same maxHeight approach as ProductCatalog import tab */}
        <div style={{ padding: 20, overflowY: 'auto', maxHeight: 'calc(85vh - 80px)' }}>

          {/* Step 0: File upload */}
          {impStep === 0 && (
            <div>
              <div style={{ marginBottom: 12, color: 'var(--text2)', fontSize: 13 }}>
                Upload a CSV or Excel spreadsheet with your customer data. Columns can be in any order — you'll map them in the next step.
              </div>
              <div
                onDrop={e => { e.preventDefault(); handleImpFile(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()}
                style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 36, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)', transition: 'border-color .2s' }}
                onClick={() => document.getElementById('cust-imp-file').click()}
              >
                <div style={{ fontSize: 40, marginBottom: 8 }}>📥</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>
                  {impFile ? `📄 ${impFile.name}` : 'Drop your CSV or Excel file here'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  or click to browse · .csv · .xlsx · .xls · auto-detects comma, semicolon, tab delimiters
                </div>
              </div>
              <input id="cust-imp-file" type="file" accept=".csv,.xlsx,.xls,text/csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files[0]; e.target.value = ''; handleImpFile(f); }} />

              {impLoading && (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--text2)', fontSize: 13 }}>⏳ Parsing file…</div>
              )}
              {impError && (
                <div style={{ color: 'var(--red)', background: 'var(--r5)', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>
                  ⚠ {impError}
                </div>
              )}
              <div style={{ marginTop: 16, padding: 12, background: 'var(--s3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
                <strong>Recommended columns:</strong> Customer Name · Segment / Category · Phone · Email · Monthly Revenue · Outstanding · Risk · Score
                <br /><span style={{ color: 'var(--text3)', fontSize: 11 }}>Only "Customer Name" is required. All other columns are optional and can be named anything.</span>
              </div>
            </div>
          )}

          {/* Step 1: Map columns + preview + import */}
          {impStep === 1 && (
            <div>
              {/* Back + file info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button
                  onClick={() => { setImpStep(0); setImpFile(null); setImpHeaders([]); setImpRows([]); setImpError(''); }}
                  style={{ fontSize: 12, padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}
                >
                  ← Change File
                </button>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>
                  <strong>{impFile?.name}</strong> · {impRows.length.toLocaleString()} rows · {impHeaders.length} columns
                </span>
              </div>

              {/* Column mapping grid */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--text1)' }}>
                Map Columns to Customer Fields
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>(auto-suggested — adjust as needed)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20 }}>
                {CUSTOMER_IMPORT_FIELDS.map(({ key, label }) => {
                  const mapped = impMapping[key] !== null && impMapping[key] !== undefined;
                  return (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: mapped ? 'var(--green)' : 'var(--text2)', fontWeight: 600, marginBottom: 3 }}>
                        {label} {mapped && '✓'}
                      </div>
                      <select
                        value={impMapping[key] ?? ''}
                        onChange={e => setImpMapping(m => ({ ...m, [key]: e.target.value === '' ? null : Number(e.target.value) }))}
                        style={{ width: '100%', padding: '5px 8px', border: `1.5px solid ${mapped ? 'var(--b3)' : 'var(--border)'}`, borderRadius: 6, fontSize: 12, background: 'var(--bg)', color: 'var(--text1)' }}
                      >
                        <option value="">— skip —</option>
                        {impHeaders.map((h, i) => (
                          <option key={i} value={i}>
                            {h}{impRows[0]?.[i] ? ` (e.g. "${String(impRows[0][i]).slice(0, 28)}")` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Preview table */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text1)' }}>
                Preview — First {Math.min(3, impRows.length)} Row{impRows.length !== 1 ? 's' : ''}
                {validRows.length > 0 && (
                  <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>
                    ({validRows.length.toLocaleString()} valid rows will be imported)
                  </span>
                )}
              </div>
              {mappedFields.length > 0 ? (
                <div style={{ overflowX: 'auto', marginBottom: 20, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {mappedFields.map(f => (
                          <th key={f.key} style={{ padding: '6px 10px', background: 'var(--s3)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 11, whiteSpace: 'nowrap' }}>
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {impRows.slice(0, 3).map((row, ri) => (
                        <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--s3)' }}>
                          {mappedFields.map(f => (
                            <td key={f.key} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text1)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row[impMapping[f.key]] ? String(row[impMapping[f.key]]).slice(0, 60) : <span style={{ color: 'var(--text3)' }}>—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: 'var(--text3)', fontSize: 13, padding: '12px 0', marginBottom: 20 }}>Map at least one column above to see a preview.</div>
              )}

              {/* Import error (server-side) */}
              {impError && (
                <div style={{ color: 'var(--red)', background: 'var(--r5)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span>⚠</span>
                  <span>{impError}</span>
                  <button onClick={() => setImpError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              )}

              {/* Import confirm */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn-primary"
                  disabled={saving || !nameOk || validRows.length === 0}
                  onClick={handleImpConfirm}
                >
                  {saving ? '⏳ Importing…' : `✓ Import ${validRows.length.toLocaleString()} Customer${validRows.length !== 1 ? 's' : ''}`}
                </button>
                {!nameOk && (
                  <span style={{ fontSize: 12, color: 'var(--amber)' }}>⚠ Map "Customer Name *" to continue</span>
                )}
                {nameOk && validRows.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--amber)' }}>⚠ No rows have a value in the Customer Name column</span>
                )}
                {nameOk && validRows.length > 0 && !impError && (
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {(impRows.length - validRows.length) > 0
                      ? `(${impRows.length - validRows.length} rows skipped — missing name)`
                      : 'All rows have customer names ✓'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STATIC_CUSTS = [
  { name: 'Mehta Constructions',  segment: 'Contractor',    monthly_value: '₹3.8L', score: 92, outstanding: '₹0',    days_since_order: 2,  risk: 'LOW' },
  { name: 'City Interiors',       segment: 'Interior Firm', monthly_value: '₹2.4L', score: 88, outstanding: '₹0',    days_since_order: 47, risk: 'MEDIUM' },
  { name: 'Kumar & Sons',         segment: 'Retailer',      monthly_value: '₹2.1L', score: 85, outstanding: '₹0.4L', days_since_order: 3,  risk: 'LOW' },
  { name: 'Sharma Constructions', segment: 'Contractor',    monthly_value: '₹1.8L', score: 42, outstanding: '₹3.4L', days_since_order: 78, risk: 'HIGH' },
  { name: 'Design Studio Patel',  segment: 'Interior Firm', monthly_value: '₹1.6L', score: 91, outstanding: '₹0',    days_since_order: 1,  risk: 'LOW' },
  { name: 'Raj Carpentry Works',  segment: 'Carpenter',     monthly_value: '₹0.9L', score: 76, outstanding: '₹0',    days_since_order: 8,  risk: 'LOW' },
  { name: 'Gupta Materials',      segment: 'Retailer',      monthly_value: '₹0.8L', score: 48, outstanding: '₹2.1L', days_since_order: 38, risk: 'MEDIUM' },
  { name: 'Royal Interiors',      segment: 'Interior Firm', monthly_value: '₹0.6L', score: 62, outstanding: '₹0',    days_since_order: 5,  risk: 'LOW' },
];

// ── Shared label style for modal form fields ──────────────────────────────────
const FIELD_LABEL = {
  fontSize: 11, fontWeight: 700, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '.7px', display: 'block', marginBottom: 5,
};

const CUST_SEGMENTS = [
  'General', 'Contractor', 'Interior Firm', 'Kitchen Studio',
  'Bath Studio', 'Retailer', 'Plumber/Installer', 'Developer',
];

// ── Add Customer Modal ─────────────────────────────────────────────────────────
function AddCustomerModal({ onClose, onAdded }) {
  const { ref: addRef, style: addDragStyle } = useDraggable();
  const [form, setForm] = useState({
    name: '', segment: 'General', phone: '', email: '',
    monthly_value: '₹0', outstanding: '₹0', risk: 'LOW', score: 50,
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Customer name is required.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/customers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, score: Number(form.score) || 50 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `Error ${res.status}`);
      setSaved(true);
      onAdded();
    } catch (e) {
      setError(e.message || 'Failed to add customer. Check backend connection.');
    } finally {
      setSaving(false);
    }
  };

  if (saved) return (
    <div className="qb-modal-overlay">
      <div className="pc-add-modal" ref={addRef} style={{ maxWidth: 480, textAlign: 'center', padding: 40, ...addDragStyle }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>Customer Added!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>
          <strong>{form.name}</strong> has been added to Customer Intelligence.
        </div>
        <button className="btn-primary" onClick={onClose}>View Customers</button>
      </div>
    </div>
  );

  return (
    <div className="qb-modal-overlay">
      <div className="pc-add-modal" ref={addRef} style={{ maxWidth: 520, ...addDragStyle }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0f2744 0%, #15803d 100%)', borderRadius: '12px 12px 0 0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>+ Add Customer Manually</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 2 }}>
              Add a single customer account · Drag header to move
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(85vh - 80px)' }}>
          {/* Row 1: Name + Segment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={FIELD_LABEL}>Customer Name *</label>
              <input className="qb-input" placeholder="e.g. Mehta Construction Group"
                value={form.name} onChange={e => up('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label style={FIELD_LABEL}>Segment</label>
              <select className="qb-sel" value={form.segment} onChange={e => up('segment', e.target.value)}>
                {CUST_SEGMENTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Phone + Email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={FIELD_LABEL}>Phone</label>
              <input className="qb-input" placeholder="+91 98765 43210"
                value={form.phone} onChange={e => up('phone', e.target.value)} />
            </div>
            <div>
              <label style={FIELD_LABEL}>Email</label>
              <input className="qb-input" type="email" placeholder="customer@example.com"
                value={form.email} onChange={e => up('email', e.target.value)} />
            </div>
          </div>

          {/* Row 3: Monthly Revenue + Outstanding */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={FIELD_LABEL}>Monthly Revenue</label>
              <input className="qb-input" placeholder="e.g. ₹2.5L"
                value={form.monthly_value} onChange={e => up('monthly_value', e.target.value)} />
            </div>
            <div>
              <label style={FIELD_LABEL}>Outstanding Amount</label>
              <input className="qb-input" placeholder="e.g. ₹0 or ₹1.2L"
                value={form.outstanding} onChange={e => up('outstanding', e.target.value)} />
            </div>
          </div>

          {/* Row 4: Risk + Score */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={FIELD_LABEL}>Risk Level</label>
              <select className="qb-sel" value={form.risk} onChange={e => up('risk', e.target.value)}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
            </div>
            <div>
              <label style={FIELD_LABEL}>AI Score (0–100)</label>
              <input className="qb-input" type="number" min="0" max="100"
                value={form.score} onChange={e => up('score', e.target.value)} />
            </div>
          </div>

          {error && (
            <div style={{ background: 'var(--r5)', border: '1px solid var(--r4)', borderRadius: 8, padding: '10px 14px', color: 'var(--r2)', fontSize: 13, marginBottom: 14 }}>
              ⚠ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="qb-cancel-btn" onClick={onClose}>Cancel</button>
            <button className="qb-save-btn" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : '+ Add Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function riskStatus(c) {
  if (c.risk === 'HIGH' || parseFloat(c.outstanding) > 2) return 'overdue';
  if (c.risk === 'MEDIUM' || c.days_since_order > 30) return 'risk';
  if (c.score >= 85) return 'top';
  return 'ok';
}

export default function Customers({ onGoChat, period = 'MTD' }) {
  const [filter, setFilter]       = useState('all');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 20;
  const [d, setD]                 = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showImport, setShowImport]       = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/customers?period=${encodeURIComponent(period)}`)
      .then(r => r.json())
      .then(data => { setD(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);
  useEffect(() => { setPage(1); }, [filter, search]);

  if (loading) return <SkeletonView />;

  const allCustomers = (d?.customers?.length ? d.customers : STATIC_CUSTS).map(c => ({
    ...c, _st: riskStatus(c),
  }));

  const byFilter = filter === 'all'     ? allCustomers
                 : filter === 'top'     ? allCustomers.filter(c => c._st === 'top')
                 : filter === 'risk'    ? allCustomers.filter(c => c._st === 'risk')
                 : allCustomers.filter(c => c._st === 'overdue');
  const q = search.trim().toLowerCase();
  const filtered = q ? byFilter.filter(c => (c.name ?? '').toLowerCase().includes(q) || (c.segment ?? '').toLowerCase().includes(q)) : byFilter;
  const list = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const src = d?.data_source ?? 'demo';

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Customer Intelligence — Know Every Account</div>
          <div className="psub">
            Payment behaviour · At-risk accounts · Margin by customer · Discount leakage
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          <button className="btn-secondary" onClick={() => setShowAddCustomer(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            + Add Customer
          </button>
          <button className="btn-secondary" onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            📥 Import Customers
          </button>
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me a full customer health report — who are my top accounts, who is at risk of churning, and who has overdue payments that need follow-up today?')}>
              ✨ AI Customer Brief
            </button>
          )}
        </div>
      </div>

      <div className="kg g4">
        {[
          { cls: 'sg', l: 'Active Customers',  v: String(d?.total_customers ?? 148),       d: '▲ Buying accounts',          s: 'All active accounts' },
          { cls: 'sa', l: 'At-Risk Accounts',  v: String(d?.at_risk_count ?? 8),            d: '▼ No order 30+ days',        s: 'Combined revenue at risk' },
          { cls: 'sr', l: 'Total Outstanding', v: d?.total_outstanding ?? '₹12.8L',         d: '▼ Overdue receivables',      s: 'Sharma ₹3.4L — 78 days' },
          { cls: 'si', l: 'Best Segment',      v: 'Interior Firms',                         d: '▲ 31% avg margin',           s: '26% of customers, 38% of profit' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.l.toLowerCase()}`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="ch">
          <div><div className="ctit">Customer Health — All Accounts</div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="chip-row">
              {[['all', 'All'], ['top', 'Top Accounts'], ['risk', 'At Risk'], ['overdue', 'Overdue']].map(([f, l]) => (
                <div key={f} className={`chip${filter === f ? ' sel' : ''}`} onClick={() => setFilter(f)}>{l}</div>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search customer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--mono)', outline: 'none', width: 160 }}
            />
            <ExportButton rows={allCustomers} filename="customers" columns={[
              { key: 'name', label: 'Customer' }, { key: 'segment', label: 'Segment' },
              { key: 'monthly_value', label: 'Monthly Revenue' }, { key: 'score', label: 'AI Score' },
              { key: 'days_since_order', label: 'Days Silent' }, { key: 'outstanding', label: 'Outstanding' },
              { key: 'risk', label: 'Risk' },
            ]} />
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Customer</th><th>Segment</th><th>Monthly Revenue</th><th>AI Score</th>
              <th>Days Silent</th><th>Outstanding</th><th>Risk</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => {
              const sc  = c._st === 'top' ? 'bg' : c._st === 'risk' ? 'ba' : c._st === 'overdue' ? 'br' : 'bsl';
              const lbl = c._st === 'top' ? 'TOP ACCOUNT' : c._st === 'risk' ? 'AT RISK' : c._st === 'overdue' ? 'OVERDUE' : 'ACTIVE';
              return (
                <tr key={c.name} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Customer analysis for ${c.name}`)}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ fontSize: '10px', color: 'var(--text2)' }}>{c.segment}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{c.monthly_value}</td>
                  <td>
                    <div className="sbar">
                      <div className="str">
                        <div className="sf2" style={{ width: `${c.score}%`, background: c.score > 80 ? '#16a34a' : c.score > 60 ? '#d97706' : '#dc2626' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '9px' }}>{c.score}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: c.days_since_order > 60 ? '#dc2626' : c.days_since_order > 30 ? '#d97706' : '#16a34a' }}>
                    {c.days_since_order}d
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: c.outstanding === '₹0' || c.outstanding === 'Rs.0.0L' ? '#16a34a' : '#dc2626' }}>
                    {c.outstanding}
                  </td>
                  <td><span className={`bdg ${c.risk === 'HIGH' ? 'br' : c.risk === 'MEDIUM' ? 'ba' : 'bg'}`}>{c.risk}</span></td>
                  <td><span className={`bdg ${sc}`}>{lbl}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which customers should I call this week — overdue payments, at-risk of churning, and upsell opportunities?')}>
          <span>✨</span>
          <span>Ask AI: Customer priority list — who to call this week and why →</span>
        </div>
      )}

      {showImport && (
        <CustomerImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { fetchData(); setTimeout(() => setShowImport(false), 2000); }}
        />
      )}

      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onAdded={() => { fetchData(); setTimeout(() => setShowAddCustomer(false), 2000); }}
        />
      )}
    </div>
  );
}
