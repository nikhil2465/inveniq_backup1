import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import Pagination from '../components/Pagination';

// ── Customer import helpers ───────────────────────────────────────────────────
function parseCustCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else if (ch !== undefined) { field += ch; }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      row.push(field.trim()); field = '';
    } else if (ch === '\n' || ch === undefined || (ch === '\r' && text[i + 1] === '\n')) {
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

function suggestCustMapping(headers) {
  const norm = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const HINTS = {
    name:             ['customername','name','customer','company','clientname','client','firmname'],
    segment:          ['segment','type','category','customertype','clienttype'],
    monthly_value:    ['monthlyvalue','revenue','monthlyrevenue','value','sales','monthlysales'],
    score:            ['score','aiscore','creditscore','rating'],
    outstanding:      ['outstanding','overdue','balance','pending','dueamount'],
    days_since_order: ['days','dayssince','dayssilent','lastorder','dayssinceorder'],
    risk:             ['risk','risklevel','riskrating','riskstatus'],
    email:            ['email','mail','emailid'],
    phone:            ['phone','mobile','contact','tel'],
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
  { key: 'monthly_value',    label: 'Monthly Revenue' },
  { key: 'outstanding',      label: 'Outstanding Amount' },
  { key: 'days_since_order', label: 'Days Since Last Order' },
  { key: 'risk',             label: 'Risk (LOW/MEDIUM/HIGH)' },
  { key: 'score',            label: 'Score (0–100)' },
  { key: 'email',            label: 'Email' },
  { key: 'phone',            label: 'Phone' },
];

function CustomerImportModal({ onClose, onImported }) {
  const [step,     setStep]     = useState(0);
  const [file,     setFile]     = useState(null);
  const [headers,  setHeaders]  = useState([]);
  const [rows,     setRows]     = useState([]);
  const [mapping,  setMapping]  = useState({});
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState(0);

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setError('');
    const name = f.name.toLowerCase();
    try {
      if (name.endsWith('.csv')) {
        const text = await f.text();
        const { headers: h, rows: r } = parseCustCSV(text);
        if (!h.length) { setError('File appears empty or could not be parsed.'); return; }
        setHeaders(h); setRows(r); setMapping(suggestCustMapping(h)); setStep(1);
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        setLoading(true);
        const form = new FormData();
        form.append('file', f);
        const res = await fetch('/api/catalog/parse-import', { method: 'POST', body: form });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const d = await res.json();
        if (!d.headers?.length) { setError('File appears empty or has no header row.'); return; }
        setHeaders(d.headers); setRows(d.rows); setMapping(suggestCustMapping(d.headers)); setStep(1);
      } else {
        setError('Unsupported format. Please upload a .csv, .xlsx, or .xls file.');
      }
    } catch (e) {
      setError(e.message || 'Failed to read file. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const customers = rows.map(row => {
      const c = {};
      for (const [field, colIdx] of Object.entries(mapping)) {
        if (colIdx === null || colIdx === undefined) continue;
        const val = (row[colIdx] ?? '').trim();
        if (val) c[field] = val;
      }
      return c.name ? c : null;
    }).filter(Boolean);
    if (!customers.length) { alert('No valid rows found. Make sure "Customer Name" column is mapped and not empty.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers }),
      });
      const d = await res.json();
      setDone(d.added || 0);
      setStep(2);
      onImported();
    } catch (e) {
      alert('Import failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="qb-modal-overlay" onClick={onClose}>
      <div className="pc-add-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0f4c81 0%, #1a6ba0 100%)', borderRadius: '12px 12px 0 0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>📥 Import Customers</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 2 }}>
              Upload CSV or Excel to add customer records to Customer Intelligence
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', maxHeight: 'calc(85vh - 80px)' }}>
          {step === 2 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>{done} Customer{done !== 1 ? 's' : ''} Imported!</div>
              <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>
                The Customer Intelligence view now shows your imported data. Refresh to see the updated list.
              </div>
              <button className="btn-primary" onClick={onClose}>Close</button>
            </div>
          ) : step === 0 ? (
            <div>
              <div style={{ marginBottom: 12, color: 'var(--text2)', fontSize: 13 }}>
                Upload a CSV or Excel file with your customer data. Columns can be in any order — you'll map them in the next step.
              </div>
              <label
                htmlFor="cust-imp-file"
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()}
                style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 36, textAlign: 'center', cursor: 'pointer', background: 'var(--bg)', display: 'block' }}
              >
                <div style={{ fontSize: 40, marginBottom: 8 }}>📥</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text1)' }}>
                  {file ? `📄 ${file.name}` : 'Drop your CSV or Excel file here'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>or click to browse · .csv · .xlsx · .xls</div>
              </label>
              <input id="cust-imp-file" type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files[0]; e.target.value = ''; handleFile(f); }} />
              {loading && <div style={{ textAlign: 'center', padding: 16, color: 'var(--text2)', fontSize: 13 }}>⏳ Parsing file…</div>}
              {error && <div style={{ color: 'var(--red)', background: 'var(--r5)', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>⚠ {error}</div>}
              <div style={{ marginTop: 16, padding: 12, background: 'var(--s3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
                <strong>Recommended columns:</strong> Customer Name · Segment · Monthly Revenue · Outstanding · Days Since Last Order · Risk · Score · Email · Phone
                <br /><span style={{ color: 'var(--text3)', fontSize: 11 }}>Only "Customer Name" is required. All other columns are optional.</span>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button onClick={() => { setStep(0); setFile(null); setHeaders([]); setRows([]); setError(''); }}
                  style={{ fontSize: 12, padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}>
                  ← Change File
                </button>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>
                  <strong>{file?.name}</strong> · {rows.length} rows · {headers.length} columns
                </span>
              </div>

              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                Map Columns to Customer Fields
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>(auto-suggested — adjust as needed)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20 }}>
                {CUSTOMER_IMPORT_FIELDS.map(({ key, label }) => {
                  const mapped = mapping[key] !== null && mapping[key] !== undefined;
                  return (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: mapped ? 'var(--green)' : 'var(--text2)', fontWeight: 600, marginBottom: 3 }}>
                        {label} {mapped && '✓'}
                      </div>
                      <select
                        value={mapping[key] ?? ''}
                        onChange={e => setMapping(m => ({ ...m, [key]: e.target.value === '' ? null : Number(e.target.value) }))}
                        style={{ width: '100%', padding: '5px 8px', border: `1.5px solid ${mapped ? 'var(--b3)' : 'var(--border)'}`, borderRadius: 6, fontSize: 12, background: 'var(--bg)', color: 'var(--text1)' }}
                      >
                        <option value="">— skip —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>{h}{rows[0]?.[i] ? ` (e.g. "${rows[0][i]}")` : ''}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Preview — First {Math.min(3, rows.length)} Row{rows.length !== 1 ? 's' : ''}</div>
              <div style={{ overflowX: 'auto', marginBottom: 20, borderRadius: 8, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {CUSTOMER_IMPORT_FIELDS.filter(f => mapping[f.key] !== null && mapping[f.key] !== undefined).map(f => (
                        <th key={f.key} style={{ padding: '6px 10px', background: 'var(--s3)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3).map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--s3)' }}>
                        {CUSTOMER_IMPORT_FIELDS.filter(f => mapping[f.key] !== null && mapping[f.key] !== undefined).map(f => (
                          <td key={f.key} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text1)' }}>
                            {row[mapping[f.key]] || <span style={{ color: 'var(--text3)' }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn-primary" disabled={saving || mapping.name === null || mapping.name === undefined} onClick={handleConfirm}>
                  {saving ? '⏳ Importing…' : `✓ Import ${rows.length} Customer${rows.length !== 1 ? 's' : ''}`}
                </button>
                {(mapping.name === null || mapping.name === undefined) && (
                  <span style={{ fontSize: 12, color: 'var(--amber)' }}>⚠ Map "Customer Name *" to continue</span>
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
  const [showImport, setShowImport] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/customers?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);
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
    </div>
  );
}
