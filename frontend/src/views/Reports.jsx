import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

/* ── Formatters ─────────────────────────────────────────────────────────── */
const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL = (n) => { const v = Number(n || 0); return v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : fmt(v); };
const fmtN = (n, d = 0) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d });

/* ── FY default dates ─────────────────────────────────────────────────── */
function fyDefaults() {
  const today = new Date();
  const fyStart = today.getMonth() >= 3
    ? new Date(today.getFullYear(), 3, 1)
    : new Date(today.getFullYear() - 1, 3, 1);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmtD(fyStart), to: fmtD(today) };
}

/* ── Period presets ─────────────────────────────────────────────────────── */
function buildPresets() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmtD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toStr = fmtD(today);
  const subM = (m) => { const d = new Date(today); d.setMonth(d.getMonth() - m); return fmtD(d); };
  const fy = fyDefaults();
  const prevFyStart = new Date(fy.from); prevFyStart.setFullYear(prevFyStart.getFullYear() - 1);
  const prevFyEnd   = new Date(prevFyStart); prevFyEnd.setFullYear(prevFyEnd.getFullYear() + 1); prevFyEnd.setDate(prevFyEnd.getDate() - 1);
  return [
    { label: 'This FY',  from: fy.from,           to: toStr },
    { label: 'Last FY',  from: fmtD(prevFyStart),  to: fmtD(prevFyEnd) },
    { label: '6 Months', from: subM(6),             to: toStr },
    { label: '3 Months', from: subM(3),             to: toStr },
    { label: '1 Month',  from: subM(1),             to: toStr },
  ];
}

/* ── KPI Card (clickable with AI) ────────────────────────────────────── */
function KpiCard({ label, value, sub, cls = 'sb', onAsk, trend }) {
  return (
    <div className={`kc ${cls}${onAsk ? ' rpt-kc-ai' : ''}`} onClick={onAsk}>
      <div className="kt">
        <div className="kl">{label}</div>
        {onAsk && <span style={{ fontSize: 9, opacity: .5 }}>✨</span>}
      </div>
      <div className="kv">{value}</div>
      {trend !== undefined && trend !== null && !isNaN(Number(trend)) && (
        <div className={`rpt-trend ${Number(trend) >= 0 ? 'rpt-up' : 'rpt-dn'}`}>
          {Number(trend) >= 0 ? '▲' : '▼'} {Math.abs(Number(trend)).toFixed(1)}%
        </div>
      )}
      {sub && <div className="ks">{sub}</div>}
    </div>
  );
}

/* ── Report Table ─────────────────────────────────────────────────────── */
function ReportTable({ cols, rows, emptyMsg = 'No data' }) {
  if (!rows || rows.length === 0) {
    return <div className="rpt-empty">{emptyMsg}</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="rpt-table">
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} className={c.right ? 'r' : ''}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 !== 0 ? 'alt' : ''}>
              {cols.map(c => (
                <td key={c.key}
                  className={[c.right ? 'r' : '', c.mono ? 'mono' : '', c.bold ? 'bold' : ''].filter(Boolean).join(' ')}
                  style={c.color ? { color: c.color(row[c.key], row) } : undefined}>
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Mini aging bar (per customer row) ─────────────────────────────── */
function MiniAgingBar({ cur, d30, d60, d90p, total }) {
  if (!total) return null;
  const segs = [
    { v: cur, c: '#16a34a' }, { v: d30, c: '#f59e0b' },
    { v: d60, c: '#ef4444' }, { v: d90p, c: '#7c3aed' },
  ].filter(s => s.v > 0);
  return (
    <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1, marginTop: 3, minWidth: 60 }}>
      {segs.map((s, i) => (
        <div key={i} style={{ flex: s.v / total, background: s.c, minWidth: 2 }} />
      ))}
    </div>
  );
}

/* ── MoM change badge ────────────────────────────────────────────────── */
function MomBadge({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: 'var(--text3)' }}>—</span>;
  const n = Number(pct);
  const color = n >= 0 ? 'var(--g2)' : 'var(--r2)';
  const bg    = n >= 0 ? 'var(--g5)' : 'var(--r5)';
  return (
    <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: bg, color, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
      {n >= 0 ? '▲' : '▼'} {Math.abs(n).toFixed(1)}%
    </span>
  );
}

const TABS = [
  { id: 'Sales',       label: 'Sales',    icon: '📊' },
  { id: 'GST Summary', label: 'GST',      icon: '🧾' },
  { id: 'Purchase',    label: 'Purchase', icon: '🏭' },
  { id: 'AR Aging',    label: 'AR Aging', icon: '⏱' },
  { id: 'Stock',       label: 'Stock',    icon: '📦' },
];

export default function Reports({ onGoChat, dbStatus, period }) {
  const { from: defaultFrom, to: defaultTo } = useMemo(() => fyDefaults(), []);
  const presets = useMemo(() => buildPresets(), []);

  const [activeTab, setActiveTab] = useState('Sales');
  const [fromDate,  setFromDate]  = useState(defaultFrom);
  const [toDate,    setToDate]    = useState(defaultTo);
  const [data,      setData]      = useState({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [src,       setSrc]       = useState('demo');
  const [arSort,    setArSort]    = useState({ field: 'outstanding', dir: 'desc' });

  const fetchReport = useCallback(async (tab, from, to) => {
    setLoading(true);
    setError(null);
    try {
      let url;
      if (tab === 'Sales')            url = `/api/reports/sales?from_date=${from}&to_date=${to}`;
      else if (tab === 'GST Summary') url = `/api/reports/gst-summary?from_date=${from}&to_date=${to}`;
      else if (tab === 'Purchase')    url = `/api/reports/purchase?from_date=${from}&to_date=${to}`;
      else if (tab === 'AR Aging')    url = `/api/reports/ar-aging?as_of=${to}`;
      else                            url = `/api/reports/stock`;
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

  useEffect(() => { fetchReport(activeTab, fromDate, toDate); }, [activeTab, fromDate, toDate, fetchReport]);
  useAutoRefresh(() => fetchReport(activeTab, fromDate, toDate));

  const d = data[activeTab] || {};

  /* MoM enriched sales rows */
  const salesMonthly = useMemo(() => {
    const rows = d.by_month || [];
    return rows.map((row, i) => ({
      ...row,
      mom_pct: i > 0 && rows[i - 1]?.revenue
        ? ((row.revenue - rows[i - 1].revenue) / rows[i - 1].revenue * 100)
        : null,
    }));
  }, [d.by_month]);

  const applyPreset = (p) => { setFromDate(p.from); setToDate(p.to); };

  const handleExport = () => {
    if (activeTab === 'Sales' && d.by_month)         exportToCsv(d.by_month,   `Sales_${fromDate}_${toDate}`);
    else if (activeTab === 'GST Summary' && d.output_tax) exportToCsv(d.output_tax, `GST_${fromDate}_${toDate}`);
    else if (activeTab === 'Purchase' && d.by_month)  exportToCsv(d.by_month,   `Purchase_${fromDate}_${toDate}`);
    else if (activeTab === 'AR Aging' && d.rows)      exportToCsv(d.rows,       `AR_Aging_${toDate}`);
    else if (activeTab === 'Stock' && d.rows)         exportToCsv(d.rows,       `Stock_Report`);
  };

  const ask = (q) => onGoChat?.(q);

  const Sk = ({ h = 16 }) => (
    <div style={{
      height: h, borderRadius: 6, background: 'var(--bg3)',
      animation: 'shimmer 1.5s infinite linear',
      backgroundImage: 'linear-gradient(90deg, var(--bg3) 25%, var(--bg2) 50%, var(--bg3) 75%)',
      backgroundSize: '200%',
    }} />
  );

  /* ── Active preset match ─────────────────────────────────────────── */
  const activePreset = presets.find(p => p.from === fromDate && p.to === toDate)?.label;

  return (
    <div className="view">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Management Reports</div>
          <div className="psub">
            MIS · Sales · GST · Purchase · AR Aging · Stock
            {' '}<DataSourceBadge source={src} updatedAt={dbStatus?.checkedAt} />
          </div>
        </div>
        <div className="ph-actions" style={{ flexWrap: 'wrap', rowGap: 6 }}>
          {/* Period quick presets */}
          <div className="rpt-presets no-print">
            {presets.map(p => (
              <button key={p.label}
                className={`rpt-preset${activePreset === p.label ? ' active' : ''}`}
                onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="rpt-date-input no-print" />
          <span className="rpt-date-sep no-print">→</span>
          <input type="date" value={toDate}   onChange={e => setToDate(e.target.value)}   className="rpt-date-input no-print" />
          {onGoChat && (
            <button className="btn-secondary no-print" onClick={() => ask(
              activeTab === 'Sales'       ? `Analyse my Sales report from ${fromDate} to ${toDate}. What are the top revenue months, best customers, MoM growth trends, and top 3 actions to accelerate revenue?` :
              activeTab === 'GST Summary' ? `Review my GST position from ${fromDate} to ${toDate}. What is my net tax payable after ITC? Identify any compliance gaps or mismatches before GSTR-3B filing.` :
              activeTab === 'Purchase'    ? `Analyse purchase report ${fromDate} to ${toDate}. Which suppliers account for most spend? What credit terms should I renegotiate? What is my total ITC?` :
              activeTab === 'AR Aging'    ? `Analyse AR Aging as of ${toDate}. Who are my top overdue accounts? Total at-risk amount, bad debt risk, and a prioritised recovery action list.` :
              `Analyse my Stock report. Total inventory value, dead stock items (60+ days idle), top SKUs by value, and which items to reorder vs liquidate.`
            )} style={{ height: 34, padding: '0 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              ✨ AI Analyse
            </button>
          )}
          <button className="btn-secondary no-print" onClick={() => window.print()}
            style={{ height: 34, padding: '0 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            🖨 Print
          </button>
          <button className="btn-primary no-print" onClick={handleExport} disabled={loading}
            style={{ height: 34, padding: '0 16px', fontSize: 12 }}>
            ↓ Export
          </button>
        </div>
      </div>

      {/* ── AI Opportunity Chips ─────────────────────────────────────────── */}
      {onGoChat && (
        <div className="ai-opp-strip no-print">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '📊', text: 'Sales — top 3 revenue growth drivers this FY',               q: `Analyse my sales report for ${fromDate} to ${toDate}. What are the top 3 revenue growth drivers — which months had best performance, which customer segments drove growth, and which product categories gained or lost share? Give me 3 specific actions.` },
            { icon: '🧾', text: 'GST — am I claiming full ITC and is net payable correct?',    q: `Review my GST summary for ${fromDate} to ${toDate}. Am I claiming maximum ITC on all purchases? What is net GST payable? Are there mismatches between GSTR-1 output and GSTR-2B input that could create reconciliation issues?` },
            { icon: '⏱', text: 'AR Aging — which accounts are 60+ days overdue?',             q: `Analyse my AR Aging as of ${toDate}. Which customers have balances beyond 60 days? Total at-risk amount? For the top 5 overdue accounts, give a specific collection strategy and accounting treatment if they cannot pay.` },
            { icon: '📦', text: 'Stock — which SKUs have zero movement in 90 days?',           q: 'Analyse my stock report. Identify products with zero or near-zero movement in 90 days. Total capital tied up in these SKUs? For each major dead stock item, suggest the best liquidation strategy — markdown, bundle, supplier return, or scrap.' },
            { icon: '🏭', text: 'Purchase — which suppliers can I get better credit terms from?', q: `Looking at my purchase report for ${fromDate} to ${toDate}, which suppliers account for >15% of spend? For each major supplier, what credit terms am I getting vs industry standard? Which should I approach for extended terms, volume rebates, or price renegotiation?` },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => ask(o.q)}>
              <span>{o.icon}</span><span>{o.text}</span><span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className="rpt-tabs no-print">
        {TABS.map(t => (
          <button key={t.id} className={`rpt-tab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
            <span className="rpt-tab-icon">{t.icon}</span>
            <span className="rpt-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 8, color: 'var(--red)', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠</span>
          <span>Failed to load report: {error}</span>
          <button onClick={() => fetchReport(activeTab, fromDate, toDate)}
            style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--red)', borderRadius: 5, color: 'var(--red)', cursor: 'pointer', fontWeight: 700, padding: '3px 10px', fontSize: 12 }}>
            Retry
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SALES TAB                                                        */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'Sales' && (
        <>
          <div className="kg g4" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4].map(i => <div key={i} className="kc sb"><Sk h={60} /></div>) : (
              <>
                <KpiCard label="Total Revenue" value={fmtL(d.summary?.total_revenue)}
                  sub={`${fmtN(d.summary?.total_invoices)} invoices`} cls="sg"
                  onAsk={onGoChat ? () => ask(`My total sales revenue from ${fromDate} to ${toDate} is ${fmtL(d.summary?.total_revenue)} across ${fmtN(d.summary?.total_invoices)} invoices. Is this a healthy revenue level for a hardware/building materials distributor? What would double-digit growth require and which product categories should I focus on?`) : undefined} />
                <KpiCard label="GST Collected" value={fmtL(d.summary?.total_tax)}
                  sub="Output tax — CGST + SGST + IGST" cls="sb"
                  onAsk={onGoChat ? () => ask(`I collected ${fmtL(d.summary?.total_tax)} in output GST from ${fromDate} to ${toDate}. When do I need to deposit this with the government? What happens if GSTR-1 and GSTR-3B have discrepancies? What is the interest and penalty for late payment?`) : undefined} />
                <KpiCard label="Top Customer" value={d.top_customers?.[0]?.name?.split(' ')[0] || '—'}
                  sub={fmtL(d.top_customers?.[0]?.revenue)} cls="st"
                  onAsk={onGoChat ? () => ask(`My top customer by revenue is ${d.top_customers?.[0]?.name || 'my best account'} at ${fmtL(d.top_customers?.[0]?.revenue)}. What is the risk of single-customer concentration? How do I protect and grow this relationship while reducing dependency risk?`) : undefined} />
                <KpiCard label="Avg Monthly" value={fmtL((d.summary?.total_revenue || 0) / Math.max(1, d.by_month?.length || 1))}
                  sub={`over ${d.by_month?.length || 0} months`} cls="sa"
                  onAsk={onGoChat ? () => ask(`My average monthly revenue is ${fmtL((d.summary?.total_revenue || 0) / Math.max(1, d.by_month?.length || 1))} over this period. What monthly run rate do I need to achieve my annual revenue target? How do I model seasonal adjustments for hardware and sanitary products?`) : undefined} />
              </>
            )}
          </div>

          <div className="gl g55" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="ch">
                <div><div className="ctit">Monthly Sales Breakdown</div><div className="csub">Revenue, GST, and MoM growth</div></div>
              </div>
              {loading ? <Sk h={140} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'month',     label: 'Month',    bold: true },
                    { key: 'revenue',   label: 'Revenue',  right: true, mono: true, render: v => fmtL(v) },
                    { key: 'total_tax', label: 'GST',      right: true, mono: true, render: v => fmt(v) },
                    { key: 'invoices',  label: 'Invoices', right: true },
                    { key: 'mom_pct',   label: 'MoM',      right: true, render: v => <MomBadge pct={v} /> },
                  ]}
                  rows={salesMonthly}
                  emptyMsg="No sales data for this period"
                />
              )}
            </div>
            <div className="card">
              <div className="ch">
                <div><div className="ctit">Top Customers</div><div className="csub">By revenue this period</div></div>
                {onGoChat && !loading && (
                  <button className="export-btn no-print" onClick={() => ask(`My top customers by revenue from ${fromDate} to ${toDate} are: ${(d.top_customers || []).slice(0, 5).map(c => `${c.name}: ${fmtL(c.revenue)}`).join(', ')}. Analyse customer concentration risk and suggest how to grow the bottom-half customers.`)}>
                    ✨ AI
                  </button>
                )}
              </div>
              {loading ? <Sk h={140} style={{ margin: 16 }} /> : (
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

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* GST SUMMARY TAB                                                  */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'GST Summary' && (
        <>
          <div className="kg g4" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4].map(i => <div key={i} className="kc sb"><Sk h={60} /></div>) : (
              <>
                <KpiCard label="Output Tax (Sales)" value={fmtL(d.summary?.output_tax_total)}
                  sub="CGST + SGST + IGST collected" cls="sg"
                  onAsk={onGoChat ? () => ask(`My output GST from sales is ${fmtL(d.summary?.output_tax_total)} from ${fromDate} to ${toDate}. Which GST rate (5%, 12%, 18%, 28%) contributes most? Are there any supply types where I should verify the correct GST rate is being charged?`) : undefined} />
                <KpiCard label="ITC Available" value={fmtL(d.summary?.itc_available)}
                  sub="Input Tax Credit on purchases" cls="sb"
                  onAsk={onGoChat ? () => ask(`My Input Tax Credit (ITC) from purchases is ${fmtL(d.summary?.itc_available)}. Am I eligible to claim ITC on all my purchases? What are the common ITC reversal situations under GST that I should watch out for? How do I match my GSTR-2B?`) : undefined} />
                <KpiCard label="Net GST Payable" value={fmtL(d.summary?.net_payable)}
                  sub="Output tax minus ITC" cls={d.summary?.net_payable > 0 ? 'sr' : 'sg'}
                  onAsk={onGoChat ? () => ask(`My net GST payable is ${fmtL(d.summary?.net_payable)} after ITC. This is the amount I need to deposit in the Electronic Cash Ledger. What is the due date for GSTR-3B payment? What are the consequences of late filing vs late payment in GST?`) : undefined} />
                <KpiCard label="GSTR-3B Due" value={d.summary?.gstr3b_due_date || '—'}
                  sub={d.summary?.filing_status || 'Check filing status'} cls="sa"
                  onAsk={onGoChat ? () => ask(`My GSTR-3B is due on ${d.summary?.gstr3b_due_date || 'the 20th of next month'}. What is the complete GSTR-3B filing process — what data goes into each section, how do I reconcile with GSTR-1, and what common errors cause mismatches?`) : undefined} />
              </>
            )}
          </div>

          <div className="gl g55" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="ch">
                <div><div className="ctit">Output Tax by Rate (Sales)</div><div className="csub">GST collected from customers</div></div>
              </div>
              {loading ? <Sk h={120} style={{ margin: 16 }} /> : (
                <>
                  <ReportTable
                    cols={[
                      { key: 'rate',    label: 'GST Rate', bold: true },
                      { key: 'taxable', label: 'Taxable',  right: true, mono: true, render: v => fmt(v) },
                      { key: 'cgst',    label: 'CGST',     right: true, mono: true, render: v => fmt(v) },
                      { key: 'sgst',    label: 'SGST',     right: true, mono: true, render: v => fmt(v) },
                      { key: 'igst',    label: 'IGST',     right: true, mono: true, render: v => fmt(v) },
                      { key: 'total',   label: 'Total Tax', right: true, mono: true, render: v => fmt(v), bold: true },
                    ]}
                    rows={d.output_tax || []}
                    emptyMsg="No output tax data"
                  />
                  {!loading && d.summary && (
                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700 }}>Total Output Tax</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--green)', fontSize: 14 }}>{fmt(d.summary.output_tax_total)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="card">
              <div className="ch">
                <div><div className="ctit">ITC from Purchases</div><div className="csub">Input Tax Credit available</div></div>
              </div>
              {loading ? <Sk h={120} style={{ margin: 16 }} /> : (
                <>
                  <ReportTable
                    cols={[
                      { key: 'supplier', label: 'Supplier', bold: true },
                      { key: 'inv',      label: 'Invoice',  mono: true },
                      { key: 'date',     label: 'Date' },
                      { key: 'cgst',     label: 'CGST', right: true, mono: true, render: v => v > 0 ? fmt(v) : '—' },
                      { key: 'sgst',     label: 'SGST', right: true, mono: true, render: v => v > 0 ? fmt(v) : '—' },
                      { key: 'igst',     label: 'IGST', right: true, mono: true, render: v => v > 0 ? fmt(v) : '—' },
                      { key: 'total',    label: 'ITC',  right: true, mono: true, render: v => fmt(v), bold: true },
                    ]}
                    rows={d.itc || []}
                    emptyMsg="No ITC data for this period"
                  />
                  {d.summary && (
                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700 }}>Total ITC Available</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--b2)', fontSize: 14 }}>{fmt(d.summary.itc_available)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* GSTR-3B Reconciliation Summary */}
          {!loading && d.summary && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ch">
                <div><div className="ctit">GSTR-3B Reconciliation</div><div className="csub">Tax position at a glance</div></div>
                {onGoChat && (
                  <button className="export-btn no-print" onClick={() => ask(`My GSTR-3B position: Output tax ${fmtL(d.summary.output_tax_total)}, ITC ${fmtL(d.summary.itc_available)}, Net payable ${fmtL(d.summary.net_payable)}. Filing status: ${d.summary.filing_status || 'Pending'}. What are the key things I must check before submitting GSTR-3B to avoid a notice from the GST department?`)}>
                    ✨ Pre-filing Check
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)' }}>
                {[
                  { label: 'Table 3.1 — Output Tax',  value: d.summary.output_tax_total, color: 'var(--red)',   icon: '📤' },
                  { label: 'Table 4 — ITC Claimed',   value: d.summary.itc_available,    color: 'var(--green)', icon: '📥' },
                  { label: 'Table 6 — Net Payable',   value: d.summary.net_payable,       color: 'var(--amber)', icon: '💳' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '20px 16px', background: 'var(--surface)', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: 'var(--mono)' }}>{fmtL(s.value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Filing status: <strong style={{ color: d.summary.filing_status === 'FILED' ? 'var(--green)' : 'var(--amber)' }}>{d.summary.filing_status || 'Pending'}</strong></span>
                <span>Due date: <strong>{d.summary.gstr3b_due_date || '—'}</strong></span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* PURCHASE TAB                                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'Purchase' && (
        <>
          <div className="kg g4" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4].map(i => <div key={i} className="kc sb"><Sk h={60} /></div>) : (
              <>
                <KpiCard label="Total Purchases" value={fmtL(d.summary?.total_purchases)}
                  sub={`${fmtN(d.summary?.total_pos)} purchase orders`} cls="sg"
                  onAsk={onGoChat ? () => ask(`My total purchases from ${fromDate} to ${toDate} are ${fmtL(d.summary?.total_purchases)} across ${fmtN(d.summary?.total_pos)} POs. Is my purchase-to-sales ratio healthy? How do I benchmark purchase efficiency for a hardware distributor and what does an optimal ratio look like?`) : undefined} />
                <KpiCard label="ITC from Purchases" value={fmtL(d.summary?.total_itc)}
                  sub="GST paid — input tax credit" cls="sb"
                  onAsk={onGoChat ? () => ask(`I have ${fmtL(d.summary?.total_itc)} in input tax credit from purchases. What is the process to reconcile this ITC with my GSTR-2B? What are the most common reasons ITC gets blocked or reversed, and how do I prevent them?`) : undefined} />
                <KpiCard label="Top Supplier" value={d.top_suppliers?.[0]?.name?.split(' ')[0] || '—'}
                  sub={fmtL(d.top_suppliers?.[0]?.purchases)} cls="st"
                  onAsk={onGoChat ? () => ask(`My top supplier is ${d.top_suppliers?.[0]?.name || 'my primary vendor'} at ${fmtL(d.top_suppliers?.[0]?.purchases)} in purchases. What leverage do I have to renegotiate credit terms, volume discounts, or payment terms with them? What concessions can I reasonably ask for at this volume?`) : undefined} />
                <KpiCard label="Avg Monthly Spend" value={fmtL((d.summary?.total_purchases || 0) / Math.max(1, d.by_month?.length || 1))}
                  sub={`over ${d.by_month?.length || 0} months`} cls="sa"
                  onAsk={onGoChat ? () => ask(`My average monthly purchase spend is ${fmtL((d.summary?.total_purchases || 0) / Math.max(1, d.by_month?.length || 1))}. How do I use this data to negotiate a master supplier agreement with volume rebates? What annual commitment would unlock the best pricing tier?`) : undefined} />
              </>
            )}
          </div>

          <div className="gl g55" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="ch"><div className="ctit">Monthly Purchase Summary</div></div>
              {loading ? <Sk h={120} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'month',     label: 'Month',    bold: true },
                    { key: 'purchases', label: 'Purchases', right: true, mono: true, render: v => fmtL(v) },
                    { key: 'total_tax', label: 'ITC (GST)', right: true, mono: true, render: v => fmt(v) },
                    { key: 'pos',       label: 'POs',       right: true },
                  ]}
                  rows={d.by_month || []}
                  emptyMsg="No purchase data for this period"
                />
              )}
            </div>
            <div className="card">
              <div className="ch">
                <div><div className="ctit">Top Suppliers</div><div className="csub">By spend this period</div></div>
                {onGoChat && !loading && (
                  <button className="export-btn no-print" onClick={() => ask(`My top suppliers by spend from ${fromDate} to ${toDate}: ${(d.top_suppliers || []).slice(0, 5).map(s => `${s.name}: ${fmtL(s.purchases)}`).join(', ')}. Which suppliers should I consolidate purchases with to unlock better pricing? Who has the most room for credit term improvement?`)}>
                    ✨ Negotiate
                  </button>
                )}
              </div>
              {loading ? <Sk h={120} style={{ margin: 16 }} /> : (
                <ReportTable
                  cols={[
                    { key: 'name',      label: 'Supplier', bold: true },
                    { key: 'purchases', label: 'Value',    right: true, mono: true, render: v => fmtL(v) },
                    { key: 'pos',       label: 'POs',      right: true },
                  ]}
                  rows={d.top_suppliers || []}
                  emptyMsg="No supplier data"
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* AR AGING TAB                                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'AR Aging' && (
        <>
          <div className="kg g5" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4,5].map(i => <div key={i} className="kc sb"><Sk h={60} /></div>) : (
              <>
                <KpiCard label="Total Outstanding" value={fmtL(d.summary?.total_outstanding)}
                  sub="All unpaid invoices" cls="sr"
                  onAsk={onGoChat ? () => ask(`My total outstanding AR is ${fmtL(d.summary?.total_outstanding)} as of ${toDate}. What is a healthy DSO for a hardware distributor? What collection strategy should I run this month to recover the most cash?`) : undefined} />
                <KpiCard label="Current (Not Due)" value={fmtL(d.summary?.current)}
                  sub="Within due date" cls="sg"
                  onAsk={onGoChat ? () => ask(`I have ${fmtL(d.summary?.current)} in current (not yet due) receivables. How do I proactively reach out to these customers before the due date to increase on-time payment rate and avoid them slipping into overdue?`) : undefined} />
                <KpiCard label="1–30 Days Overdue" value={fmtL(d.summary?.overdue_30)}
                  sub="Mild risk — follow up" cls="sa"
                  onAsk={onGoChat ? () => ask(`I have ${fmtL(d.summary?.overdue_30)} in receivables 1–30 days overdue. Draft a polite but firm collection message for customers in this bucket. Should I charge interest? What is the standard overdue interest rate in B2B trade in India?`) : undefined} />
                <KpiCard label="31–90 Days Overdue" value={fmtL(d.summary?.overdue_60)}
                  sub="High risk — escalate" cls="so"
                  onAsk={onGoChat ? () => ask(`I have ${fmtL(d.summary?.overdue_60)} in receivables 31–90 days overdue. This is high risk. What escalation process should I follow — final demand letter, stop supply, legal notice? Draft a formal demand notice for this bucket.`) : undefined} />
                <KpiCard label="90+ Days Overdue" value={fmtL(d.summary?.overdue_90plus)}
                  sub="Critical — bad debt risk" cls="sr"
                  onAsk={onGoChat ? () => ask(`I have ${fmtL(d.summary?.overdue_90plus)} in receivables 90+ days overdue. What is the process for writing off bad debt in India — accounting entries, GST reversal on bad debt, and legal recovery options? How do I decide between a settlement, debt collection agency, or legal action?`) : undefined} />
              </>
            )}
          </div>

          {(() => {
            const toggleAr = (f) => setArSort(s => ({ field: f, dir: s.field === f && s.dir === 'asc' ? 'desc' : 'asc' }));
            const arSic = (f) => arSort.field === f ? (arSort.dir === 'asc' ? '▲' : '▼') : '⇅';
            const arStc = (f) => `r${arSort.field === f ? ` sth sth-${arSort.dir}` : ''}`;
            const arRows = [...(d.rows || [])].sort((a, b) => {
              const fmap = { outstanding: r => r.outstanding || r.total || 0, d90plus: r => r.d90plus || 0, customer: r => (r.customer_name || r.customer || '') };
              const av = fmap[arSort.field]?.(a) ?? 0, bv = fmap[arSort.field]?.(b) ?? 0;
              const cmp = av < bv ? -1 : av > bv ? 1 : 0;
              return arSort.dir === 'asc' ? cmp : -cmp;
            });
            return (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div><div className="ctit">Customer Receivables Aging</div><div className="csub">As of {toDate}</div></div>
              {onGoChat && !loading && (
                <button className="export-btn no-print" onClick={() => ask(`Looking at my AR aging as of ${toDate}, the total outstanding is ${fmtL(d.summary?.total_outstanding)} with ${fmtL(d.summary?.overdue_90plus)} beyond 90 days. Rank my top 10 customers by overdue amount and give me a specific collection action for each.`)}>
                  ✨ Recovery Plan
                </button>
              )}
            </div>
            {loading ? <Sk h={180} style={{ margin: 16 }} /> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="rpt-table">
                  <thead>
                    <tr>
                      <th className={`sth${arSort.field === 'customer' ? ` sth-${arSort.dir}` : ''}`} onClick={() => toggleAr('customer')}>Customer <span className="sort-ic">{arSic('customer')}</span></th>
                      <th className={arStc('outstanding')} onClick={() => toggleAr('outstanding')}>Outstanding <span className="sort-ic">{arSic('outstanding')}</span></th>
                      <th className="r">Current</th>
                      <th className="r">1–30d</th>
                      <th className="r">31–90d</th>
                      <th className={arStc('d90plus')} onClick={() => toggleAr('d90plus')}>90d+ <span className="sort-ic">{arSic('d90plus')}</span></th>
                      <th>Aging Split</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arRows.map((row, i) => {
                      const total = row.outstanding || row.total || 0;
                      const cur   = row.current_amt ?? row.current ?? 0;
                      const d30   = row.d30 || 0;
                      const d6090 = (row.d60 || 0) + (row.d90 || 0);
                      const d90p  = row.d90plus || 0;
                      const risk  = d90p > 0 ? 'Critical' : d6090 > 0 ? 'High' : d30 > 0 ? 'Medium' : 'Low';
                      const rClr  = { Critical: 'var(--r2)', High: 'var(--amber)', Medium: 'var(--b2)', Low: 'var(--g2)' };
                      const rBg   = { Critical: 'var(--r5)', High: 'var(--a5)',    Medium: 'var(--b5)', Low: 'var(--g5)' };
                      return (
                        <tr key={i} className={i % 2 !== 0 ? 'alt' : ''}>
                          <td className="bold">{row.customer_name || row.customer}</td>
                          <td className="r mono bold">{fmt(total)}</td>
                          <td className="r mono" style={{ color: 'var(--g2)' }}>{cur > 0 ? fmt(cur) : '—'}</td>
                          <td className="r mono" style={{ color: d30 > 0 ? 'var(--amber)' : undefined }}>{d30 > 0 ? fmt(d30) : '—'}</td>
                          <td className="r mono" style={{ color: d6090 > 0 ? 'var(--r2)' : undefined }}>{d6090 > 0 ? fmt(d6090) : '—'}</td>
                          <td className="r mono" style={{ color: d90p > 0 ? 'var(--r2)' : undefined, fontWeight: d90p > 0 ? 700 : 400 }}>{d90p > 0 ? fmt(d90p) : '—'}</td>
                          <td style={{ minWidth: 80 }}>
                            <MiniAgingBar cur={cur} d30={d30} d60={d6090} d90p={d90p} total={total} />
                          </td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: rBg[risk], color: rClr[risk] }}>{risk}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {arRows.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>
                        No outstanding receivables — all invoices paid ✓
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
          })()}

          {/* Aging bucket visual */}
          {!loading && d.summary && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="ch"><div className="ctit">Aging Breakdown</div></div>
              <div style={{ padding: '0 16px 12px' }}>
                {[
                  { label: 'Current (not due)',   value: d.summary.current,         color: 'var(--green)',  pct_of: d.summary.total_outstanding },
                  { label: '1–30 Days Overdue',   value: d.summary.overdue_30,      color: 'var(--amber)',  pct_of: d.summary.total_outstanding },
                  { label: '31–90 Days Overdue',  value: d.summary.overdue_60,      color: 'var(--red)',    pct_of: d.summary.total_outstanding },
                  { label: '90+ Days (Critical)', value: d.summary.overdue_90plus,  color: 'var(--purple)', pct_of: d.summary.total_outstanding },
                ].map(s => {
                  const pct = s.pct_of ? ((s.value / s.pct_of) * 100).toFixed(1) : '0.0';
                  const barW = `${Math.min(100, parseFloat(pct))}%`;
                  return (
                    <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 72px 52px', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                        {s.label}
                      </div>
                      <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: barW, height: '100%', background: s.color, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{fmt(s.value)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', fontFamily: 'var(--mono)' }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* STOCK TAB                                                        */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'Stock' && (
        <>
          <div className="kg g4" style={{ marginBottom: 16 }}>
            {loading ? [1,2,3,4].map(i => <div key={i} className="kc sb"><Sk h={60} /></div>) : (
              <>
                <KpiCard label="Active SKUs" value={fmtN(d.summary?.total_skus)}
                  sub="Items in stock" cls="sg"
                  onAsk={onGoChat ? () => ask(`I have ${fmtN(d.summary?.total_skus)} active SKUs in stock. How do I use ABC analysis (A = top 20% by revenue, B = next 30%, C = bottom 50%) to rationalise my SKU count? How many SKUs should an efficient hardware distributor typically carry?`) : undefined} />
                <KpiCard label="Total Stock Value" value={fmtL(d.summary?.total_value)}
                  sub="At sell price" cls="sb"
                  onAsk={onGoChat ? () => ask(`My total stock value at sell price is ${fmtL(d.summary?.total_value)}. What is my inventory-to-sales ratio and is it healthy? How much of this value is tied up in slow-moving or dead stock? What is the holding cost per month for this inventory level?`) : undefined} />
                <KpiCard label="Dead Stock Items" value={fmtN(d.summary?.dead_stock_count)}
                  sub="60+ days no movement" cls="sr"
                  onAsk={onGoChat ? () => ask(`I have ${fmtN(d.summary?.dead_stock_count)} dead stock items (60+ days no movement) worth ${fmtL(d.summary?.dead_stock_value)}. For each category — hardware fittings, sanitary ware, CP fittings — what is the best liquidation strategy? How do I approach customers with dead stock clearance offers?`) : undefined} />
                <KpiCard label="Dead Stock Value" value={fmtL(d.summary?.dead_stock_value)}
                  sub="Capital at risk — recover now" cls="sa"
                  onAsk={onGoChat ? () => ask(`My dead stock is worth ${fmtL(d.summary?.dead_stock_value)}. If I sell this at a 20% markdown, what is the cash recovered vs holding cost avoided? At what discount level should I just return unsold items to the supplier?`) : undefined} />
              </>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div><div className="ctit">Stock Valuation Report</div><div className="csub">All SKUs — value & movement</div></div>
              {onGoChat && !loading && (
                <button className="export-btn no-print" onClick={() => ask(`I have ${fmtN(d.summary?.dead_stock_count)} dead stock items worth ${fmtL(d.summary?.dead_stock_value)}. List the top 10 by value and give a specific recovery plan for each — which to mark down, bundle, return to supplier, or write off.`)}>
                  ✨ Recovery Plan
                </button>
              )}
            </div>
            {loading ? <Sk h={200} style={{ margin: 16 }} /> : (
              <ReportTable
                cols={[
                  { key: 'sku',             label: 'SKU',        mono: true },
                  { key: 'name',            label: 'Product',    bold: true },
                  { key: 'category',        label: 'Category' },
                  { key: 'stock',           label: 'Qty',        right: true },
                  { key: 'unit',            label: 'UOM' },
                  { key: 'rate',            label: 'Rate',       right: true, mono: true, render: v => fmt(v) },
                  { key: 'value',           label: 'Value',      right: true, mono: true, render: v => fmtL(v), bold: true },
                  { key: 'dead_stock_days', label: 'Idle Days',  right: true,
                    render: (v) => {
                      if (!v || v <= 0) return '—';
                      if (v > 60) return <span style={{ color: '#dc2626', fontWeight: 700 }}>{v}d ⚠️</span>;
                      if (v > 30) return <span style={{ color: '#f59e0b' }}>{v}d</span>;
                      return `${v}d`;
                    },
                  },
                ]}
                rows={d.rows || []}
                emptyMsg="No stock data"
              />
            )}
          </div>
        </>
      )}

      {/* ── AI CTA ──────────────────────────────────────────────────────── */}
      {onGoChat && (
        <div className="ai-cta-bar no-print" style={{ marginTop: 16 }} onClick={() => ask(
          activeTab === 'Sales'       ? `Deep-dive into my sales performance from ${fromDate} to ${toDate}. Key trends, top customers, MoM growth, and GST position.` :
          activeTab === 'GST Summary' ? `Review my full GST position from ${fromDate} to ${toDate}. Net payable after ITC, GSTR-3B readiness, and any compliance risks.` :
          activeTab === 'Purchase'    ? `Analyse my purchases from ${fromDate} to ${toDate}. Top suppliers, ITC available, and which vendor relationships to renegotiate.` :
          activeTab === 'AR Aging'    ? `Full AR Aging analysis as of ${toDate}. Critical overdue accounts, bad debt risk, and prioritised collection actions.` :
          `Complete stock analysis — total value, dead stock items (60d+ idle), top SKUs by value, and reorder vs liquidate decisions.`
        )}>
          <span>✨</span>
          <span>Ask AI: Deep analysis of this {activeTab} report — risks, actions, insights →</span>
        </div>
      )}
    </div>
  );
}
