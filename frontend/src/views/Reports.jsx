import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';

/* ── Formatters ─────────────────────────────────────────────────────────── */
const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL = (n) => { const v = Number(n || 0); return v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : fmt(v); };
const fmtN = (n, d = 0) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d });

/* ── Current FY default dates ─────────────────────────────────────────── */
function fyDefaults() {
  const today = new Date();
  const fyStart = today.getMonth() >= 3
    ? new Date(today.getFullYear(), 3, 1)
    : new Date(today.getFullYear() - 1, 3, 1);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(fyStart), to: fmt(today) };
}

/* ── KPI Card ──────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, cls = 'sb' }) {
  return (
    <div className={`kc ${cls}`}>
      <div className="kt"><div className="kl">{label}</div></div>
      <div className="kv">{value}</div>
      {sub && <div className="ks">{sub}</div>}
    </div>
  );
}

/* ── Simple table ─────────────────────────────────────────────────────── */
function ReportTable({ cols, rows, emptyMsg = 'No data' }) {
  if (!rows || rows.length === 0) {
    return <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{emptyMsg}</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {cols.map(c => (
              <th key={c.key} style={{
                padding: '8px 12px', textAlign: c.right ? 'right' : 'left',
                fontWeight: 700, fontSize: 11, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap',
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '' : 'var(--bg2)' }}>
              {cols.map(c => (
                <td key={c.key} style={{
                  padding: '8px 12px', textAlign: c.right ? 'right' : 'left',
                  fontFamily: c.mono ? 'var(--mono)' : 'inherit',
                  color: c.color ? c.color(row[c.key]) : 'inherit',
                  fontWeight: c.bold ? 700 : 400,
                }}>
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── AR Aging bar ─────────────────────────────────────────────────────── */
function AgingBar({ current, d30, d60, d90plus, total }) {
  if (!total) return null;
  const pct = (v) => `${((v / total) * 100).toFixed(1)}%`;
  const segs = [
    { v: current, color: '#16a34a', label: 'Current' },
    { v: d30,     color: '#f59e0b', label: '1–30d'   },
    { v: d60,     color: '#ef4444', label: '31–90d'  },
    { v: d90plus, color: '#7c3aed', label: '90d+'    },
  ].filter(s => s.v > 0);
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 4, overflow: 'hidden', gap: 1, marginTop: 4 }}>
      {segs.map(s => (
        <div key={s.label} title={`${s.label}: ${pct(s.v)}`}
          style={{ flex: s.v / total, background: s.color, minWidth: 2 }} />
      ))}
    </div>
  );
}

const TABS = ['Sales', 'GST Summary', 'Purchase', 'AR Aging', 'Stock'];

export default function Reports({ onGoChat, dbStatus, period }) {
  const { from: defaultFrom, to: defaultTo } = useMemo(() => fyDefaults(), []);

  const [activeTab, setActiveTab] = useState('Sales');
  const [fromDate,  setFromDate]  = useState(defaultFrom);
  const [toDate,    setToDate]    = useState(defaultTo);
  const [data,      setData]      = useState({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [src,       setSrc]       = useState('demo');

  // ── Fetch active report ────────────────────────────────────────────────
  const fetchReport = useCallback(async (tab, from, to) => {
    setLoading(true);
    setError(null);
    try {
      let url;
      if (tab === 'Sales')       url = `/api/reports/sales?from_date=${from}&to_date=${to}`;
      else if (tab === 'GST Summary') url = `/api/reports/gst-summary?from_date=${from}&to_date=${to}`;
      else if (tab === 'Purchase')  url = `/api/reports/purchase?from_date=${from}&to_date=${to}`;
      else if (tab === 'AR Aging')  url = `/api/reports/ar-aging?as_of=${to}`;
      else                          url = `/api/reports/stock`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(prev => ({ ...prev, [tab]: json }));
      setSrc(json.data_source || 'demo');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(activeTab, fromDate, toDate);
  }, [activeTab, fromDate, toDate, fetchReport]);

  const d = data[activeTab] || {};

  // ── Export handlers ───────────────────────────────────────────────────
  const handleExport = () => {
    if (activeTab === 'Sales' && d.by_month) {
      exportToCsv(d.by_month, `Sales_Report_${fromDate}_${toDate}`);
    } else if (activeTab === 'GST Summary' && d.output_tax) {
      exportToCsv(d.output_tax, `GST_Summary_${fromDate}_${toDate}`);
    } else if (activeTab === 'Purchase' && d.by_month) {
      exportToCsv(d.by_month, `Purchase_Report_${fromDate}_${toDate}`);
    } else if (activeTab === 'AR Aging' && d.rows) {
      exportToCsv(d.rows, `AR_Aging_${toDate}`);
    } else if (activeTab === 'Stock' && d.rows) {
      exportToCsv(d.rows, `Stock_Report`);
    }
  };

  // ── Skeleton ─────────────────────────────────────────────────────────
  const Skeleton = ({ h = 16, w = '100%', style = {} }) => (
    <div style={{ height: h, width: w, background: 'var(--bg3)', borderRadius: 6, ...style,
      animation: 'shimmer 1.5s infinite linear',
      backgroundImage: 'linear-gradient(90deg, var(--bg3) 25%, var(--bg2) 50%, var(--bg3) 75%)',
      backgroundSize: '200%' }} />
  );

  return (
    <div className="view">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Management Reports</div>
          <div className="psub">
            Sales · GST Summary · Purchase · AR Aging · Stock Valuation
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 12, border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)' }} />
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 12, border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)' }} />
          <button className="btn-primary" onClick={handleExport} disabled={loading}
            style={{ height: 34, padding: '0 16px', fontSize: 12 }}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 18px', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500,
            border: 'none', background: 'none', cursor: 'pointer',
            color: activeTab === tab ? 'var(--green)' : 'var(--text2)',
            borderBottom: activeTab === tab ? '2px solid var(--green)' : '2px solid transparent',
            marginBottom: -2, transition: 'all .15s',
          }}>{tab}</button>
        ))}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 8, color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
          Failed to load report: {error}
          <button onClick={() => fetchReport(activeTab, fromDate, toDate)}
            style={{ marginLeft: 12, background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SALES TAB */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'Sales' && (
        <>
          <div className="kg g4" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4].map(i => <div key={i} className="kc sb"><Skeleton h={60} /></div>) : (
              <>
                <KpiCard label="Total Revenue" value={fmtL(d.summary?.total_revenue)} sub={`${fmtN(d.summary?.total_invoices)} invoices`} cls="sg" />
                <KpiCard label="Total Tax Collected" value={fmtL(d.summary?.total_tax)} sub="CGST + SGST + IGST" cls="sb" />
                <KpiCard label="Top Customer" value={d.top_customers?.[0]?.name?.split(' ')[0] || '—'} sub={fmtL(d.top_customers?.[0]?.revenue)} cls="st" />
                <KpiCard label="Period" value={fromDate?.slice(0, 7) || '—'} sub={`to ${toDate?.slice(0, 7) || '—'}`} cls="sa" />
              </>
            )}
          </div>

          <div className="gl g55" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="ch"><div className="ctit">Monthly Sales Breakdown</div></div>
              {loading ? <Skeleton h={120} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'month',      label: 'Month',    bold: true },
                    { key: 'revenue',    label: 'Revenue',  right: true, mono: true, render: v => fmtL(v) },
                    { key: 'cgst',       label: 'CGST',     right: true, mono: true, render: v => fmt(v) },
                    { key: 'sgst',       label: 'SGST',     right: true, mono: true, render: v => fmt(v) },
                    { key: 'igst',       label: 'IGST',     right: true, mono: true, render: v => fmt(v) },
                    { key: 'total_tax',  label: 'Total Tax',right: true, mono: true, render: v => fmt(v) },
                    { key: 'invoices',   label: 'Invoices', right: true },
                    { key: 'customers',  label: 'Customers',right: true },
                  ]}
                  rows={d.by_month || []}
                  emptyMsg="No sales data for this period"
                />
              )}
            </div>
            <div className="card">
              <div className="ch"><div className="ctit">Top Customers</div></div>
              {loading ? <Skeleton h={120} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'name',     label: 'Customer', bold: true },
                    { key: 'revenue',  label: 'Revenue',  right: true, mono: true, render: v => fmtL(v) },
                    { key: 'invoices', label: 'Invoices', right: true },
                  ]}
                  rows={d.top_customers || []}
                  emptyMsg="No customer data"
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* GST SUMMARY TAB */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'GST Summary' && (
        <>
          <div className="kg g4" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4].map(i => <div key={i} className="kc sb"><Skeleton h={60} /></div>) : (
              <>
                <KpiCard label="Output Tax (Sales)" value={fmtL(d.summary?.output_tax_total)} sub="CGST+SGST+IGST collected" cls="sg" />
                <KpiCard label="ITC Available" value={fmtL(d.summary?.itc_available)} sub="Input Tax Credit on purchases" cls="sb" />
                <KpiCard label="Net GST Payable" value={fmtL(d.summary?.net_payable)} sub={`Output − ITC`} cls={d.summary?.net_payable > 0 ? 'sr' : 'sg'} />
                <KpiCard label="GSTR-3B Due" value={d.summary?.gstr3b_due_date || '—'} sub={d.summary?.filing_status || '—'} cls="sa" />
              </>
            )}
          </div>

          <div className="gl g55" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="ch">
                <div><div className="ctit">Output Tax by Rate (Sales)</div><div className="csub">GST collected from customers</div></div>
              </div>
              {loading ? <Skeleton h={120} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'rate',    label: 'GST Rate', bold: true },
                    { key: 'taxable', label: 'Taxable Value', right: true, mono: true, render: v => fmt(v) },
                    { key: 'cgst',    label: 'CGST',          right: true, mono: true, render: v => fmt(v) },
                    { key: 'sgst',    label: 'SGST',          right: true, mono: true, render: v => fmt(v) },
                    { key: 'igst',    label: 'IGST',          right: true, mono: true, render: v => fmt(v) },
                    { key: 'total',   label: 'Total Tax',     right: true, mono: true, render: v => fmt(v), bold: true },
                  ]}
                  rows={d.output_tax || []}
                  emptyMsg="No output tax data"
                />
              )}
              {!loading && d.summary && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700 }}>Total Output Tax</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{fmt(d.summary.output_tax_total)}</span>
                </div>
              )}
            </div>
            <div className="card">
              <div className="ch">
                <div><div className="ctit">ITC from Purchases</div><div className="csub">Input Tax Credit available</div></div>
              </div>
              {loading ? <Skeleton h={120} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'supplier', label: 'Supplier', bold: true },
                    { key: 'inv',      label: 'Invoice No', mono: true },
                    { key: 'date',     label: 'Date'    },
                    { key: 'igst',     label: 'IGST',   right: true, mono: true, render: v => v > 0 ? fmt(v) : '—' },
                    { key: 'cgst',     label: 'CGST',   right: true, mono: true, render: v => v > 0 ? fmt(v) : '—' },
                    { key: 'sgst',     label: 'SGST',   right: true, mono: true, render: v => v > 0 ? fmt(v) : '—' },
                    { key: 'total',    label: 'ITC',    right: true, mono: true, render: v => fmt(v), bold: true },
                  ]}
                  rows={d.itc || []}
                  emptyMsg="No ITC data for this period"
                />
              )}
              {!loading && d.summary && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700 }}>Total ITC Available</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--b2)' }}>{fmt(d.summary.itc_available)}</span>
                </div>
              )}
            </div>
          </div>

          {/* GST reconciliation summary */}
          {!loading && d.summary && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ch"><div className="ctit">GSTR-3B Reconciliation Summary</div></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)' }}>
                {[
                  { label: 'Output Tax (3.1)', value: d.summary.output_tax_total, color: 'var(--red)' },
                  { label: 'ITC Claimed (4)',  value: d.summary.itc_available,    color: 'var(--green)' },
                  { label: 'Net Payable (6)',  value: d.summary.net_payable,      color: 'var(--amber)' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '16px', background: 'var(--bg2)', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--mono)' }}>{fmtL(s.value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)' }}>
                Filing status: <strong>{d.summary.filing_status || 'Pending'}</strong> · Due date: <strong>{d.summary.gstr3b_due_date || '—'}</strong>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PURCHASE TAB */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'Purchase' && (
        <>
          <div className="kg g4" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4].map(i => <div key={i} className="kc sb"><Skeleton h={60} /></div>) : (
              <>
                <KpiCard label="Total Purchases" value={fmtL(d.summary?.total_purchases)} sub={`${fmtN(d.summary?.total_pos)} purchase orders`} cls="sg" />
                <KpiCard label="ITC (Input Tax)" value={fmtL(d.summary?.total_itc)} sub="GST paid on purchases" cls="sb" />
                <KpiCard label="Top Supplier" value={d.top_suppliers?.[0]?.name?.split(' ')[0] || '—'} sub={fmtL(d.top_suppliers?.[0]?.purchases)} cls="st" />
                <KpiCard label="Period" value={fromDate?.slice(0, 7) || '—'} sub={`to ${toDate?.slice(0, 7) || '—'}`} cls="sa" />
              </>
            )}
          </div>

          <div className="gl g55" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="ch"><div className="ctit">Monthly Purchase Summary</div></div>
              {loading ? <Skeleton h={120} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'month',     label: 'Month',       bold: true },
                    { key: 'purchases', label: 'Purchases',   right: true, mono: true, render: v => fmtL(v) },
                    { key: 'total_tax', label: 'GST (ITC)',   right: true, mono: true, render: v => fmt(v) },
                    { key: 'pos',       label: 'POs',         right: true },
                  ]}
                  rows={d.by_month || []}
                  emptyMsg="No purchase data for this period"
                />
              )}
            </div>
            <div className="card">
              <div className="ch"><div className="ctit">Top Suppliers</div></div>
              {loading ? <Skeleton h={120} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'name',      label: 'Supplier',  bold: true },
                    { key: 'purchases', label: 'Value',     right: true, mono: true, render: v => fmtL(v) },
                    { key: 'pos',       label: 'POs',       right: true },
                  ]}
                  rows={d.top_suppliers || []}
                  emptyMsg="No supplier data"
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* AR AGING TAB */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'AR Aging' && (
        <>
          <div className="kg g5" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4,5].map(i => <div key={i} className="kc sb"><Skeleton h={60} /></div>) : (
              <>
                <KpiCard label="Total Outstanding" value={fmtL(d.summary?.total_outstanding)} sub="Unpaid invoices" cls="sr" />
                <KpiCard label="Current (Not Due)" value={fmtL(d.summary?.current)} sub="Within due date" cls="sg" />
                <KpiCard label="Overdue 1–30 Days" value={fmtL(d.summary?.overdue_30)} sub="Mild risk" cls="sa" />
                <KpiCard label="Overdue 31–90 Days" value={fmtL(d.summary?.overdue_60)} sub="Action needed" cls="so" />
                <KpiCard label="Overdue 90+ Days" value={fmtL(d.summary?.overdue_90plus)} sub="Critical — escalate" cls="sr" />
              </>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div><div className="ctit">Customer Receivables Aging</div><div className="csub">As of {toDate}</div></div>
            </div>
            {loading ? <Skeleton h={160} style={{ margin: 16 }} /> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      {['Customer', 'Total Outstanding', 'Current', '1–30 Days', '31–90 Days', '90+ Days', 'Risk'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Customer' || h === 'Risk' ? 'left' : 'right', fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(d.rows || []).map((row, i) => {
                      const total = row.outstanding || row.total || 0;
                      const cur   = row.current_amt ?? row.current ?? 0;
                      const d30   = row.d30 || 0;
                      const d6090 = (row.d60 || 0) + (row.d90 || 0);
                      const d90p  = row.d90plus || 0;
                      const risk  = d90p > 0 ? 'Critical' : d6090 > 0 ? 'High' : d30 > 0 ? 'Medium' : 'Low';
                      const rClr  = { Critical: '#dc2626', High: '#f59e0b', Medium: '#2563eb', Low: '#16a34a' };
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '' : 'var(--bg2)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700 }}>{row.customer_name || row.customer}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(total)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#16a34a' }}>{cur > 0 ? fmt(cur) : '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: d30 > 0 ? '#f59e0b' : 'var(--text3)' }}>{d30 > 0 ? fmt(d30) : '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: d6090 > 0 ? '#ef4444' : 'var(--text3)' }}>{d6090 > 0 ? fmt(d6090) : '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: d90p > 0 ? '#dc2626' : 'var(--text3)', fontWeight: d90p > 0 ? 700 : 400 }}>{d90p > 0 ? fmt(d90p) : '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: rClr[risk] + '22', color: rClr[risk] }}>{risk}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!d.rows || d.rows.length === 0) && !loading && (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No outstanding receivables — all invoices paid</div>
                )}
              </div>
            )}
          </div>

          {/* Aging visualization */}
          {!loading && d.summary && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ch"><div className="ctit">Aging Breakdown</div></div>
              <div style={{ padding: '0 8px 12px' }}>
                {[
                  { label: 'Current (not due)',  value: d.summary.current,      color: '#16a34a' },
                  { label: '1–30 Days Overdue',  value: d.summary.overdue_30,   color: '#f59e0b' },
                  { label: '31–90 Days Overdue', value: d.summary.overdue_60,   color: '#ef4444' },
                  { label: '90+ Days Overdue',   value: d.summary.overdue_90plus, color: '#7c3aed' },
                ].map(s => {
                  const total = d.summary.total_outstanding || 1;
                  const pct = ((s.value / total) * 100).toFixed(1);
                  return (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 12 }}>{s.label}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{fmt(s.value)}</div>
                      <div style={{ width: 48, textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* STOCK TAB */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'Stock' && (
        <>
          <div className="kg g4" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4].map(i => <div key={i} className="kc sb"><Skeleton h={60} /></div>) : (
              <>
                <KpiCard label="Total SKUs" value={fmtN(d.summary?.total_skus)} sub="Active stock items" cls="sg" />
                <KpiCard label="Stock Value" value={fmtL(d.summary?.total_value)} sub="At sell price" cls="sb" />
                <KpiCard label="Dead Stock Items" value={fmtN(d.summary?.dead_stock_count)} sub="60+ days no movement" cls="sr" />
                <KpiCard label="Dead Stock Value" value={fmtL(d.summary?.dead_stock_value)} sub="Capital at risk" cls="sa" />
              </>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch"><div className="ctit">Stock Valuation Report</div><div className="csub">All SKUs by value</div></div>
            {loading ? <Skeleton h={200} style={{ margin: 16 }} /> : (
              <ReportTable
                cols={[
                  { key: 'sku',            label: 'SKU',          mono: true },
                  { key: 'name',           label: 'Product',      bold: true },
                  { key: 'category',       label: 'Category'     },
                  { key: 'stock',          label: 'Qty',          right: true },
                  { key: 'unit',           label: 'Unit'         },
                  { key: 'rate',           label: 'Rate',         right: true, mono: true, render: v => fmt(v) },
                  { key: 'value',          label: 'Value',        right: true, mono: true, render: v => fmtL(v), bold: true },
                  { key: 'dead_stock_days', label: 'Days Idle',   right: true,
                    color: v => v > 60 ? '#dc2626' : v > 30 ? '#f59e0b' : 'inherit',
                    render: (v, row) => v > 60
                      ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{v}d ⚠️</span>
                      : v > 30 ? <span style={{ color: '#f59e0b' }}>{v}d</span>
                      : v > 0 ? `${v}d` : '—'
                  },
                ]}
                rows={d.rows || []}
                emptyMsg="No stock data"
              />
            )}
          </div>
        </>
      )}

      {/* ── AI CTA ────────────────────────────────────────────────────────── */}
      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginTop: 16 }} onClick={() => onGoChat(
          activeTab === 'Sales'       ? `Analyse my sales performance from ${fromDate} to ${toDate}. What are the key trends, top customers, and GST breakdown?` :
          activeTab === 'GST Summary' ? `Review my GST position from ${fromDate} to ${toDate}. What is my net GST payable after ITC? Any filing risks?` :
          activeTab === 'Purchase'    ? `Analyse my purchase report from ${fromDate} to ${toDate}. Which suppliers are I spending most with? What is my ITC?` :
          activeTab === 'AR Aging'    ? `Analyse my accounts receivable aging as of ${toDate}. Who are the critical overdue accounts and what should I do?` :
          `Analyse my current stock report. What is the total value, dead stock risk, and top SKUs by value?`
        )}>
          <span>✨</span>
          <span>Ask AI: Analyse this {activeTab} report — find risks, opportunities, and actions</span>
        </div>
      )}
    </div>
  );
}
