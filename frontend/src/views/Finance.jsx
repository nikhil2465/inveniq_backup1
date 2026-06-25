import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, baseOpts, gradientFill, axisColors } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

// ── Static fallbacks ──────────────────────────────────────────────────────────
const STATIC_CF = [
  { month: 'Nov', collections: 28.2, purchases: 20.4 },
  { month: 'Dec', collections: 31.6, purchases: 22.8 },
  { month: 'Jan', collections: 29.4, purchases: 21.6 },
  { month: 'Feb', collections: 31.2, purchases: 22.4 },
  { month: 'Mar', collections: 33.6, purchases: 24.2 },
  { month: 'Apr', collections: 34.6, purchases: 25.8 },
];

const STATIC_OVERDUE = [
  { customer: 'Apex Cladding Works',          amount: '₹3.8L', days_overdue: 82, risk: 'HIGH' },
  { customer: 'Metro Build & Infrastructure',  amount: '₹2.4L', days_overdue: 58, risk: 'HIGH' },
  { customer: 'Patel Design Associates',       amount: '₹1.6L', days_overdue: 46, risk: 'MEDIUM' },
  { customer: 'Royal Interiors Pvt Ltd',       amount: '₹0.8L', days_overdue: 35, risk: 'MEDIUM' },
  { customer: 'Others (9 accounts)',           amount: '₹6.8L', days_overdue: 22, risk: 'LOW' },
];

const STATIC_MARGINS = [
  { sku: 'Accessories',      margin: 36.2 }, { sku: 'Operable Systems', margin: 32.4 },
  { sku: 'HPL Laminates',    margin: 30.8 }, { sku: 'ACP Premium',      margin: 28.8 },
  { sku: 'Aerofoil Blades',  margin: 28.5 }, { sku: 'Aluminium Louvers',margin: 27.2 },
  { sku: 'ACP Budget',       margin: 24.6 }, { sku: 'Dead Stock (PVC)', margin: 0.0 },
];

const STATIC_PL = [
  { label: 'Gross Revenue',       value: 34.6, type: 'rev' },
  { label: 'Less: Returns & Discounts', value: -1.4, type: 'sub' },
  { label: 'Net Revenue',         value: 33.2, type: 'net' },
  { label: 'Less: Cost of Goods', value: -24.4, type: 'sub' },
  { label: 'Gross Profit',        value: 8.8,  type: 'gp' },
  { label: 'Less: Freight Costs', value: -1.2, type: 'sub' },
  { label: 'Less: Other Expenses',value: -0.8, type: 'sub' },
  { label: 'Operating Profit (EBITDA)', value: 6.8, type: 'ebit' },
];

const STATIC_MONTHLY_PL = [
  { month: 'Nov', revenue: 28.4, gross_profit: 7.1, ebitda: 4.3 },
  { month: 'Dec', revenue: 31.6, gross_profit: 8.2, ebitda: 5.1 },
  { month: 'Jan', revenue: 29.4, gross_profit: 7.6, ebitda: 4.7 },
  { month: 'Feb', revenue: 31.2, gross_profit: 8.0, ebitda: 5.0 },
  { month: 'Mar', revenue: 33.6, gross_profit: 8.6, ebitda: 5.4 },
  { month: 'Apr', revenue: 34.6, gross_profit: 9.1, ebitda: 6.8 },
];

const STATIC_BUDGET = {
  revenue:      { label: 'Revenue MTD',      target: 40.0,  actual: 34.6 },
  gross_profit: { label: 'Gross Profit MTD', target: 11.0,  actual: 9.14 },
  ebitda:       { label: 'EBITDA MTD',       target: 8.0,   actual: 6.8 },
  expenses:     { label: 'Opex Budget',      target: 4.0,   actual: 2.3 },
};

const STATIC_EXPENSES = [
  { category: 'Freight & Logistics', budget: 1.2,  actual: 1.0  },
  { category: 'Salaries & Wages',    budget: 1.6,  actual: 1.4  },
  { category: 'Rent & Utilities',    budget: 0.4,  actual: 0.38 },
  { category: 'Marketing & Sales',   budget: 0.3,  actual: 0.22 },
  { category: 'Admin & Misc',        budget: 0.5,  actual: 0.3  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseWC(cycle = '') {
  const dio = parseInt(cycle.match(/DIO\s*(\d+)/i)?.[1] ?? 24);
  const dso = parseInt(cycle.match(/DSO\s*(\d+)/i)?.[1] ?? 38);
  const dpo = parseInt(cycle.match(/DPO\s*(\d+)/i)?.[1] ?? 10);
  return { dio, dso, dpo, net: dio + dso - dpo };
}

function ageBucket(days) {
  if (days > 90)  return { label: '90+ days', cls: 'br' };
  if (days > 60)  return { label: '61-90 days', cls: 'br' };
  if (days > 30)  return { label: '31-60 days', cls: 'ba' };
  return { label: '1-30 days', cls: 'bb' };
}

// ── Collection Action Modal ───────────────────────────────────────────────────
function CollectionModal({ row, onClose, onGoChat }) {
  const steps = [
    { day: 'Day 1',  action: 'Phone call from Owner/Senior staff — acknowledge, ask payment date' },
    { day: 'Day 3',  action: 'WhatsApp with formal outstanding statement + invoice copies' },
    { day: 'Day 7',  action: 'Formal demand letter on company letterhead (legal language)' },
    { day: 'Day 15', action: 'Stop further credit and supply — communicate clearly' },
    { day: 'Day 30', action: 'Legal notice via advocate + MSME Samadhaan portal filing' },
  ];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Collection Plan — {row.customer}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, padding: '10px 14px', background: 'var(--r3)', borderRadius: 8, border: '1px solid var(--r4)' }}>
              <div style={{ fontSize: 11, color: 'var(--r2)', fontWeight: 700, marginBottom: 2 }}>OUTSTANDING</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--r2)' }}>{row.amount}</div>
            </div>
            <div style={{ flex: 1, padding: '10px 14px', background: 'var(--s3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, marginBottom: 2 }}>OVERDUE</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: row.days_overdue > 60 ? 'var(--r2)' : 'var(--amber)' }}>{row.days_overdue} days</div>
            </div>
            <div style={{ flex: 1, padding: '10px 14px', background: 'var(--s3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, marginBottom: 2 }}>RISK</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: row.risk === 'HIGH' ? 'var(--r2)' : row.risk === 'MEDIUM' ? 'var(--amber)' : 'var(--green)' }}>{row.risk}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>ESCALATION TIMELINE</div>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 12px', background: 'var(--s3)', borderRadius: 7 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--b2)', fontFamily: 'var(--mono)', minWidth: 44, paddingTop: 1 }}>{s.day}</span>
              <span style={{ fontSize: 12, color: 'var(--text1)', lineHeight: 1.5 }}>{s.action}</span>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {onGoChat && (
            <button className="btn-primary" onClick={() => { onGoChat(`${row.customer} owes ${row.amount} for ${row.days_overdue} days (${row.risk} risk). Draft a professional payment demand message suitable for WhatsApp and a formal letter. Include: amount, overdue duration, bank details, payment deadline, and consequences of non-payment.`); onClose(); }}>
              ✨ Draft Demand Letter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Finance({ onGoChat, period = 'MTD' }) {
  const [d, setD]                 = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [collModal, setCollModal] = useState(null);
  const cfRef  = useRef(null);
  const mgRef  = useRef(null);
  const plRef  = useRef(null);
  const budRef = useRef(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    fetch(`/api/finance?period=${encodeURIComponent(period)}`)
      .then(r => r.json())
      .then(data => { setD(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  // ── Cash Flow chart ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!d) return;
    const cf = d?.cash_flow_6m?.length ? d.cash_flow_6m : STATIC_CF;
    const c  = axisColors();
    return createChart(cfRef, {
      type: 'bar',
      data: {
        labels: cf.map(x => x.month),
        datasets: [
          { label: 'Collections (₹L)', data: cf.map(x => x.collections), backgroundColor: '#0f766ecc', borderRadius: 4, borderSkipped: false },
          { label: 'Purchases (₹L)',   data: cf.map(x => x.purchases),   backgroundColor: '#dc2626aa', borderRadius: 4, borderSkipped: false },
        ],
      },
      options: baseOpts({
        scales: {
          x: { grid: { color: c.grid }, ticks: { color: c.label, font: { size: 9 } } },
          y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v + 'L' } },
        },
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 10, family: 'JetBrains Mono' }, padding: 14, boxWidth: 12, color: c.label } } },
      }),
    });
  }, [d, activeTab]);

  // ── Margin by SKU chart ───────────────────────────────────────────────────
  useEffect(() => {
    if (!d) return;
    const mg = (d?.margin_by_sku?.length ? d.margin_by_sku : STATIC_MARGINS)
      .filter(x => x.margin > 0)
      .sort((a, b) => b.margin - a.margin);
    const c  = axisColors();
    return createChart(mgRef, {
      type: 'bar',
      data: {
        labels: mg.map(x => x.sku),
        datasets: [{ data: mg.map(x => x.margin), backgroundColor: mg.map(x => x.margin >= 30 ? '#0f766ecc' : x.margin >= 25 ? '#16a34acc' : '#2563ebcc'), borderWidth: 0, borderRadius: 4 }],
      },
      options: baseOpts({
        indexAxis: 'y',
        scales: {
          y: { grid: { color: c.grid }, ticks: { color: c.label, font: { size: 10 } } },
          x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => v + '%' }, max: 45 },
        },
      }),
    });
  }, [d, activeTab]);

  // ── P&L Waterfall chart ───────────────────────────────────────────────────
  useEffect(() => {
    if (!d || activeTab !== 'pl') return;
    const pl = STATIC_PL;
    const c  = axisColors();
    return createChart(plRef, {
      type: 'bar',
      data: {
        labels: pl.map(x => x.label),
        datasets: [{
          data: pl.map(x => Math.abs(x.value)),
          backgroundColor: pl.map(x => x.type === 'rev' ? '#0f766e' : x.type === 'sub' ? '#dc2626' : x.type === 'net' ? '#2563eb' : x.type === 'gp' ? '#16a34a' : x.type === 'ebit' ? '#7c3aed' : '#0f766e'),
          borderWidth: 0, borderRadius: 4,
        }],
      },
      options: baseOpts({
        indexAxis: 'y',
        scales: {
          y: { grid: { color: c.grid }, ticks: { color: c.label, font: { size: 9 }, maxRotation: 0 } },
          x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v + 'L' } },
        },
      }),
    });
  }, [d, activeTab]);

  // ── Monthly P&L Trend chart (Budget & Plan tab) ───────────────────────────
  useEffect(() => {
    if (!d || activeTab !== 'budget') return;
    const mpl = d?.monthly_pl?.length ? d.monthly_pl : STATIC_MONTHLY_PL;
    const c   = axisColors();
    return createChart(budRef, {
      type: 'line',
      data: {
        labels: mpl.map(x => x.month),
        datasets: [
          { label: 'Revenue (₹L)',      data: mpl.map(x => x.revenue),      borderColor: '#0f766e', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4, borderWidth: 2 },
          { label: 'Gross Profit (₹L)', data: mpl.map(x => x.gross_profit), borderColor: '#16a34a', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4, borderWidth: 2 },
          { label: 'EBITDA (₹L)',       data: mpl.map(x => x.ebitda),       borderColor: '#7c3aed', backgroundColor: 'transparent', tension: 0.3, pointRadius: 4, borderWidth: 2 },
        ],
      },
      options: baseOpts({
        scales: {
          x: { grid: { color: c.grid }, ticks: { color: c.label, font: { size: 9 } } },
          y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v + 'L' } },
        },
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 10, family: 'JetBrains Mono' }, padding: 12, boxWidth: 12, color: c.label } } },
      }),
    });
  }, [d, activeTab]);

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (loading) return <SkeletonView />;

  const src     = d?.data_source ?? 'demo';
  const gst     = d?.gst ?? {};
  const wc      = parseWC(d?.cash_cycle ?? '');
  const overdue = d?.overdue_receivables?.length ? d.overdue_receivables : STATIC_OVERDUE;
  const cf      = d?.cash_flow_6m?.length ? d.cash_flow_6m : STATIC_CF;
  const lastCF  = cf[cf.length - 1] ?? {};
  const netSurplus = lastCF.collections && lastCF.purchases
    ? (lastCF.collections - lastCF.purchases).toFixed(1)
    : '8.8';

  const highRiskCount = overdue.filter(x => x.risk === 'HIGH').length;

  return (
    <div className="view">

      {/* ── Header ── */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Financial Intelligence — P&amp;L, Cash Flow &amp; Compliance</div>
          <div className="psub">
            Revenue · Margin analysis · Cash cycle · GST compliance · AR recovery
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat(`Give me a complete financial health report — revenue ${d?.revenue_mtd ?? '₹34.6L'}, gross margin ${d?.gross_margin ?? '26.4%'}, cash cycle ${d?.working_capital_days ?? 52} days, outstanding AR ${d?.outstanding_receivables ?? '₹15.4L'}. What are the top 3 financial risks and the top 3 opportunities I should act on this month?`)}>
              ✨ AI Finance Brief
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="kg g5">
        {[
          { cls: 'sg', l: 'Revenue MTD',          v: d?.revenue_mtd ?? '₹34.6L',           d: '▲ vs last month', s: 'Target ₹40L · 86.5% achieved', q: `What is my revenue MTD? Am I on track for the monthly target of ₹40L?` },
          { cls: 'sg', l: 'Gross Profit MTD',      v: d?.gross_profit_mtd ?? '₹9.14L',      d: `▲ ${d?.gross_margin ?? '26.4%'} margin`, s: 'Best product: Accessories 36.2%', q: `My gross profit is ${d?.gross_profit_mtd ?? '₹9.14L'} at a margin of ${d?.gross_margin ?? '26.4%'}. What are the top 3 actions to push margin above 30%?` },
          { cls: 'sr', l: 'Outstanding AR',        v: d?.outstanding_receivables ?? '₹15.4L',d: `▼ ${highRiskCount} high-risk accounts`, s: 'Apex Cladding 82 days overdue', q: `I have ${d?.outstanding_receivables ?? '₹15.4L'} in outstanding receivables with ${highRiskCount} high-risk accounts. Prioritize which to collect first and what to say.` },
          { cls: 'sa', l: 'Working Capital Cycle', v: `${d?.working_capital_days ?? wc.net}d`, d: '▼ Target: <40 days', s: `DIO ${wc.dio}d + DSO ${wc.dso}d − DPO ${wc.dpo}d`, q: `My cash cycle is ${d?.working_capital_days ?? wc.net} days. Which of the 3 levers (DIO ${wc.dio}d, DSO ${wc.dso}d, DPO ${wc.dpo}d) should I attack first to compress below 40 days?` },
          { cls: 'sb', l: 'Net Cash This Month',   v: `₹${netSurplus}L`,                     d: '▲ Collections exceed purchases', s: 'Cash surplus after all payments', q: `My net cash surplus this month is ₹${netSurplus}L. How should I deploy this — pay down payables, invest in inventory, or hold as reserve?` },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(k.q)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── AI Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '💰', text: `Collect ₹${d?.outstanding_receivables ?? '15.4L'} AR — ${highRiskCount} HIGH risk accounts need action today`, q: `I have ${d?.outstanding_receivables ?? '₹15.4L'} in outstanding receivables. The HIGH risk accounts are: ${overdue.filter(x=>x.risk==='HIGH').map(x=>`${x.customer} (${x.amount}, ${x.days_overdue}d)`).join('; ')}. Create a step-by-step collection action plan for each — what to say, when to escalate, and when to take legal action.` },
            { icon: '⏱',  text: `Cash cycle ${d?.working_capital_days ?? wc.net}d — cut DIO+DSO to unlock ₹4L+ working capital`, q: `My cash conversion cycle is ${d?.working_capital_days ?? wc.net} days (DIO ${wc.dio}d + DSO ${wc.dso}d − DPO ${wc.dpo}d). If I reduce each by 5 days, how much cash would be freed? Which lever gives the biggest return for my type of business?` },
            { icon: '📊', text: `GST GSTR-3B ${gst.gstr3b_status ?? 'PENDING'} — file before 20th to avoid ₹5K/day late fee`, q: `My GST status: Output tax ${gst.output_collected ?? '₹6.23L'}, ITC available ${gst.itc_available ?? '₹5.46L'}, Net payable ${gst.net_payable ?? '₹0.77L'}, GSTR-3B: ${gst.gstr3b_status ?? 'PENDING'}. What is my filing checklist, what ITC claims should I not miss, and what are the penalties for late filing?` },
            { icon: '📉', text: `Dead stock ₹${d?.dead_stock_locked ?? '4.1L'} capital locked — liquidate before quarter end`, q: `I have ₹${d?.dead_stock_locked ?? '4.1L'} locked in dead stock earning zero return. What liquidation options do I have — distress pricing, supplier buyback, contractor clearance offer, or write-off? Calculate the after-tax impact of each option.` },
            { icon: '📈', text: `Margin at ${d?.gross_margin ?? '26.4%'} — 3 levers to push past 30% this quarter`, q: `My gross margin is ${d?.gross_margin ?? '26.4%'}. My top margin product is Accessories at 36.2%. What are the 3 most impactful moves to push overall margin above 30% — product mix shift, discount control, freight optimization, or supplier renegotiation?` },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span><span>{o.text}</span><span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Tab navigation ── */}
      <div className="vtabs" style={{ marginBottom: 12 }}>
        {[['overview','Overview'],['pl','P&L Statement'],['budget','Budget & Plan'],['gst','GST'],['ar','AR Aging']].map(([id, label]) => (
          <div key={id} className={`vtab${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>{label}</div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Cash Flow + Working Capital */}
          <div className="gl g55">
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">Cash Flow — Last 6 Months</div>
                  <div className="csub">₹ Lakhs · Collections (teal) vs Purchases (red)</div>
                </div>
                {onGoChat && (
                  <button className="export-btn" onClick={() => onGoChat('Analyse my 6-month cash flow pattern. When do collections lag purchases? How do I smooth the mismatch and improve cash flow timing?')}>
                    ✨ AI Analyse
                  </button>
                )}
              </div>
              <div style={{ height: 200, position: 'relative' }}><canvas ref={cfRef} /></div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                {cf.slice(-3).map((m, i) => {
                  const net = (m.collections - m.purchases).toFixed(1);
                  return (
                    <div key={i} style={{ flex: 1, padding: '7px 10px', background: parseFloat(net) >= 0 ? 'var(--g5,#f0fdf4)' : 'var(--r5,#fef2f2)', borderRadius: 7, border: `1px solid ${parseFloat(net) >= 0 ? 'var(--g4,#86efac)' : 'var(--r4,#fca5a5)'}` }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{m.month}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: parseFloat(net) >= 0 ? '#16a34a' : '#dc2626' }}>₹{net}L</div>
                      <div style={{ fontSize: 9, color: 'var(--text3)' }}>net surplus</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Working Capital Cycle */}
            <div className="card">
              <div className="ch">
                <div className="ctit">Cash Conversion Cycle</div>
                <span className={`bdg ${wc.net > 50 ? 'br' : wc.net > 40 ? 'ba' : 'bg'}`}>{wc.net}d cycle</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
                {[
                  { label: 'DIO — Days Inventory Outstanding', val: wc.dio, max: 60, color: '#0f766e', desc: 'Avg days stock sits before selling' },
                  { label: 'DSO — Days Sales Outstanding',     val: wc.dso, max: 60, color: '#dc2626', desc: 'Avg days to collect from customers' },
                  { label: 'DPO — Days Payable Outstanding',   val: wc.dpo, max: 60, color: '#2563eb', desc: 'Avg days before you pay suppliers' },
                ].map(b => (
                  <div key={b.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{b.label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: b.color }}>{b.val}d</span>
                    </div>
                    <div style={{ height: 10, background: 'var(--s3)', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, b.val / b.max * 100)}%`, height: '100%', background: b.color, borderRadius: 5, transition: 'width .4s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{b.desc}</div>
                  </div>
                ))}
                <div style={{ marginTop: 4, padding: '10px 14px', background: wc.net > 50 ? 'var(--r5,#fef2f2)' : 'var(--g5,#f0fdf4)', borderRadius: 8, border: `1px solid ${wc.net > 50 ? 'var(--r4,#fca5a5)' : 'var(--g4,#86efac)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>DIO + DSO − DPO</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Target: below 40 days</div>
                    </div>
                    <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: wc.net > 50 ? '#dc2626' : wc.net > 40 ? '#d97706' : '#16a34a' }}>{wc.net}d</span>
                  </div>
                </div>
                {onGoChat && (
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 12px' }}
                    onClick={() => onGoChat(`My cash cycle is ${wc.net} days (DIO ${wc.dio} + DSO ${wc.dso} - DPO ${wc.dpo}). If I reduce DIO by 5 days, DSO by 5 days, and increase DPO by 5 days — how much cash does that unlock in rupees given my ₹${d?.revenue_mtd ?? '34.6L'} monthly revenue?`)}>
                    ✨ Model Cash Cycle Improvement
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Margin by SKU */}
          <div className="card">
            <div className="ch">
              <div>
                <div className="ctit">Gross Margin by Product Category</div>
                <div className="csub">% margin · Sorted by profitability · Target ≥25% (teal)</div>
              </div>
              {onGoChat && (
                <button className="export-btn" onClick={() => onGoChat('Which product categories have the highest and lowest gross margins? For my 3 lowest-margin products, what specific actions can improve them?')}>
                  ✨ AI Analyse
                </button>
              )}
            </div>
            <div style={{ height: 220, position: 'relative' }}><canvas ref={mgRef} /></div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: P&L STATEMENT
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pl' && (
        <div className="gl g55">
          {/* P&L Summary Table */}
          <div className="card">
            <div className="ch">
              <div>
                <div className="ctit">P&amp;L Summary — {period}</div>
                <div className="csub">Revenue → COGS → Gross Profit → Operating Profit</div>
              </div>
              <ExportButton rows={STATIC_PL} filename="pl_statement" columns={[
                { key: 'label', label: 'Line Item' }, { key: 'value', label: '₹ Lakhs' },
              ]} />
            </div>
            <table className="tbl tbl-striped">
              <thead>
                <tr><th>Line Item</th><th style={{ textAlign: 'right' }}>₹ Lakhs</th><th style={{ textAlign: 'right' }}>% Revenue</th></tr>
              </thead>
              <tbody>
                {STATIC_PL.map((row, i) => {
                  const revVal = STATIC_PL[0].value;
                  const pct = revVal > 0 ? ((row.value / revVal) * 100).toFixed(1) : '—';
                  const isTotal = ['net', 'gp', 'ebit'].includes(row.type);
                  const isSub   = row.type === 'sub';
                  return (
                    <tr key={i} style={{ background: isTotal ? 'var(--s2)' : 'transparent', fontWeight: isTotal ? 700 : 400 }}>
                      <td style={{ color: isSub ? 'var(--text3)' : 'var(--text1)', paddingLeft: isSub ? 24 : 12, fontSize: 13 }}>{row.label}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: row.value < 0 ? 'var(--r2)' : isTotal ? (row.type === 'ebit' ? '#7c3aed' : 'var(--green)') : 'var(--text1)' }}>
                        {row.value < 0 ? `(₹${Math.abs(row.value)}L)` : `₹${row.value}L`}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{row.value < 0 ? `-${Math.abs(parseFloat(pct))}%` : `${pct}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {onGoChat && (
              <div className="ai-cta-bar" style={{ margin: '12px 0 0', borderRadius: 8 }}
                onClick={() => onGoChat(`My P&L: Revenue ₹34.6L, COGS ₹24.4L, Gross Profit ₹8.8L (25.4%), after freight and expenses EBITDA ₹6.8L (19.7%). What are the top 3 ways to improve my EBITDA margin from 19.7% to 25% in the next quarter?`)}>
                <span>✨</span><span>Ask AI to analyse P&L and improve EBITDA margin →</span>
              </div>
            )}
          </div>

          {/* P&L waterfall chart */}
          <div className="card">
            <div className="ch">
              <div className="ctit">P&amp;L Waterfall Visualization</div>
              <div className="csub">₹ Lakhs · Revenue to EBITDA breakdown</div>
            </div>
            <div style={{ height: 280, position: 'relative' }}><canvas ref={plRef} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {[
                { color: '#0f766e', label: 'Revenue' }, { color: '#dc2626', label: 'Deductions' },
                { color: '#2563eb', label: 'Net Rev' }, { color: '#16a34a', label: 'Gross Profit' },
                { color: '#7c3aed', label: 'EBITDA' },
              ].map(x => (
                <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text2)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: x.color }} />
                  {x.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: GST
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gst' && (
        <div className="gl g55">
          <div className="card">
            <div className="ch">
              <div className="ctit">GST Compliance Dashboard</div>
              <span className={`bdg ${gst.gstr3b_status === 'FILED' ? 'bg' : 'ba'}`}>
                GSTR-3B: {gst.gstr3b_status ?? 'PENDING'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Output Tax Collected (3.1)',  val: gst.output_collected ?? '₹6.23L', color: '#dc2626', sub: 'GST charged on sales invoices', icon: '⬆' },
                { label: 'Input Tax Credit (ITC) (3.4)',val: gst.itc_available ?? '₹5.46L',   color: '#0f766e', sub: 'ITC on supplier purchases — claimable', icon: '⬇' },
                { label: 'Net GST Payable (3.1 − 3.4)', val: gst.net_payable ?? '₹0.77L',    color: '#d97706', sub: 'Amount to pay to GST portal', icon: '=' },
              ].map((g, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--s3)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text1)' }}>{g.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{g.sub}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, color: g.color }}>{g.icon}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: g.color }}>{g.val}</span>
                  </div>
                </div>
              ))}
              <div style={{ padding: '12px 16px', background: gst.gstr3b_status === 'FILED' ? 'var(--g5,#f0fdf4)' : 'var(--r5,#fffbeb)', border: `1px solid ${gst.gstr3b_status === 'FILED' ? 'var(--g4,#86efac)' : '#fcd34d'}`, borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: gst.gstr3b_status === 'FILED' ? '#16a34a' : '#92400e' }}>
                  {gst.gstr3b_status === 'FILED' ? '✅ GSTR-3B Filed — you\'re compliant' : '⚠ GSTR-3B Pending — file before 20th to avoid ₹5,000/day late fee'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  {gst.gstr3b_status === 'FILED' ? 'Next: Reconcile GSTR-2B ITC vs your purchase register' : 'Steps: Download GSTR-2B → Reconcile ITC → Pay net ₹0.77L → File 3B → File 1 (quarterly)'}
                </div>
              </div>
            </div>
            {onGoChat && (
              <div className="ai-cta-bar" style={{ margin: '12px 0 0', borderRadius: 8 }}
                onClick={() => onGoChat(`My GST details: Output tax ${gst.output_collected ?? '₹6.23L'}, ITC ${gst.itc_available ?? '₹5.46L'}, Net payable ${gst.net_payable ?? '₹0.77L'}, GSTR-3B: ${gst.gstr3b_status ?? 'PENDING'}. Walk me through the complete monthly GST filing process and what reconciliations I must do before filing.`)}>
                <span>✨</span><span>Ask AI: Walk me through the GST filing process for this month →</span>
              </div>
            )}
          </div>

          {/* GST Checklist */}
          <div className="card">
            <div className="ch"><div className="ctit">Monthly GST Compliance Checklist</div><span className="bdg bb">Monthly</span></div>
            <div className="ilist">
              {[
                ['icg', '✓', 'Download GSTR-2B from GST portal', 'Auto-populated ITC from supplier invoices — available by 14th of every month', 'STEP 1 · BY 14TH'],
                ['icg', '✓', 'Reconcile purchase register vs GSTR-2B', 'Match your purchase entries with supplier-filed data. Flag mismatches before claiming ITC', 'STEP 2 · CRITICAL'],
                [gst.gstr3b_status === 'FILED' ? 'icg' : 'icr', gst.gstr3b_status === 'FILED' ? '✓' : '!', 'File GSTR-3B by 20th', `Net GST payable: ${gst.net_payable ?? '₹0.77L'}. Late filing: ₹50/day (₹25 CGST + ₹25 SGST) or ₹5,000 max`, 'STEP 3 · DUE 20TH'],
                ['ica', '↑', 'File GSTR-1 (quarterly/monthly)', 'All outward supply details — B2B invoices must be filed so your customers can claim ITC', 'STEP 4 · QUARTERLY'],
                ['ica', '↑', 'Reconcile GSTR-2A vs purchase register quarterly', 'Annual reconciliation catches unclaimed ITC and ghost suppliers', 'STEP 5 · QUARTERLY'],
              ].map(([ic, icon, t, dd, m]) => (
                <div key={t} className="ii" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Explain: ${t}. Context: ${dd}`)}>
                  <div className={`iic ${ic}`}>{icon}</div>
                  <div><div className="iti">{t}</div><div className="ide">{dd}</div><div className="imt">{m}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: AR AGING
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ar' && (
        <>
          {/* Aging summary strip */}
          <div className="kg g4" style={{ marginBottom: 12 }}>
            {[
              { cls: 'sg', l: '1–30 Days',  v: overdue.filter(x => x.days_overdue <= 30).length + ' accts', d: 'Current / acceptable', s: 'Send gentle reminder' },
              { cls: 'sa', l: '31–60 Days', v: overdue.filter(x => x.days_overdue > 30 && x.days_overdue <= 60).length + ' accts', d: '▼ Requires follow-up', s: 'Call and WhatsApp weekly' },
              { cls: 'sr', l: '61–90 Days', v: overdue.filter(x => x.days_overdue > 60 && x.days_overdue <= 90).length + ' accts', d: '▼ High risk — escalate', s: 'Formal demand letter' },
              { cls: 'sr', l: '90+ Days',   v: overdue.filter(x => x.days_overdue > 90).length + ' accts',  d: '▼ Legal action required', s: 'MSME Samadhaan + legal notice' },
            ].map(k => (
              <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: 'default' }}>
                <div className="kt"><div className="kl">{k.l}</div></div>
                <div className="kv">{k.v}</div>
                <div className="kd wn">{k.d}</div>
                <div className="ks">{k.s}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="ch">
              <div>
                <div className="ctit">Accounts Receivable Aging — All Overdue Accounts</div>
                <div className="csub">Sorted by days overdue · Click row for collection plan · Click AI button for demand draft</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="bdg br">{highRiskCount} HIGH risk</span>
                <ExportButton rows={overdue} filename="ar_aging" columns={[
                  { key: 'customer', label: 'Customer' }, { key: 'amount', label: 'Amount' },
                  { key: 'days_overdue', label: 'Days Overdue' }, { key: 'risk', label: 'Risk' },
                ]} />
              </div>
            </div>
            <table className="tbl tbl-striped">
              <thead>
                <tr>
                  <th>Customer</th><th>Amount</th><th>Days Overdue</th><th>Aging Bucket</th>
                  <th>Risk Level</th><th>Recommended Action</th>{onGoChat && <th>AI Action</th>}
                </tr>
              </thead>
              <tbody>
                {[...overdue].sort((a, b) => b.days_overdue - a.days_overdue).map((r, i) => {
                  const bucket = ageBucket(r.days_overdue);
                  const riskCls = r.risk === 'HIGH' ? 'br' : r.risk === 'MEDIUM' ? 'ba' : 'bg';
                  const recAction = r.days_overdue > 90 ? 'Legal notice + MSME Samadhaan' :
                                    r.days_overdue > 60 ? 'Formal demand letter' :
                                    r.days_overdue > 30 ? 'Phone + WhatsApp follow-up' : 'Gentle reminder';
                  return (
                    <tr key={i} style={{ cursor: 'pointer' }}
                      onClick={() => setCollModal(r)}>
                      <td style={{ fontWeight: 700 }}>{r.customer}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#dc2626' }}>{r.amount}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: r.days_overdue > 60 ? '#dc2626' : r.days_overdue > 30 ? '#d97706' : '#16a34a' }}>{r.days_overdue}d</td>
                      <td><span className={`bdg ${bucket.cls}`}>{bucket.label}</span></td>
                      <td><span className={`bdg ${riskCls}`}>{r.risk}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--text2)' }}>{recAction}</td>
                      {onGoChat && (
                        <td onClick={e => e.stopPropagation()}>
                          <button style={{ fontSize: 10, padding: '3px 9px', background: r.risk === 'HIGH' ? 'var(--r3,#fee2e2)' : 'var(--bg2)', border: `1px solid ${r.risk === 'HIGH' ? 'var(--red)' : 'var(--border)'}`, borderRadius: 5, cursor: 'pointer', color: r.risk === 'HIGH' ? 'var(--r2)' : 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}
                            onClick={() => onGoChat(`${r.customer} owes ${r.amount} for ${r.days_overdue} days (${r.risk} risk). Draft a professional but firm payment demand message for WhatsApp. Then write a formal legal-style demand letter. Include: outstanding amount, overdue duration, bank payment details, deadline (7 days), and consequences of non-payment.`)}>
                            ✨ Draft Notice
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {onGoChat && (
            <div className="ai-cta-bar" onClick={() => onGoChat(`My AR aging: ${overdue.map(r=>`${r.customer} — ${r.amount} — ${r.days_overdue} days — ${r.risk} risk`).join('; ')}. Prioritize which accounts to contact this week, what to say to each, and suggest a 30-day AR collection roadmap.`)}>
              <span>✨</span>
              <span>Ask AI: 30-day AR collection roadmap — who to call, what to say, and how to escalate →</span>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: BUDGET & PLAN
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'budget' && (
        <>
          <div className="gl g55">
            {/* Monthly P&L trend chart */}
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">Monthly P&amp;L Trend — 6 Months</div>
                  <div className="csub">₹ Lakhs · Revenue · Gross Profit · EBITDA</div>
                </div>
                {onGoChat && (
                  <button className="export-btn" onClick={() => onGoChat('Analyse my 6-month P&L trend. Is revenue growth accelerating or decelerating? Is my gross margin widening or compressing month-over-month? Which month was the turning point and why?')}>
                    ✨ Trend Analysis
                  </button>
                )}
              </div>
              <div style={{ height: 220, position: 'relative' }}><canvas ref={budRef} /></div>
              {(() => {
                const mpl  = d?.monthly_pl?.length ? d.monthly_pl : STATIC_MONTHLY_PL;
                const last = mpl[mpl.length - 1];
                const prev = mpl[mpl.length - 2];
                if (!last || !prev) return null;
                const revGrowth = (((last.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1);
                const gpGrowth  = (((last.gross_profit - prev.gross_profit) / prev.gross_profit) * 100).toFixed(1);
                const margin    = ((last.gross_profit / last.revenue) * 100).toFixed(1);
                const ebitdaMg  = ((last.ebitda / last.revenue) * 100).toFixed(1);
                return (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {[
                      { l: 'Revenue MoM',    v: `${parseFloat(revGrowth) >= 0 ? '+' : ''}${revGrowth}%`, color: parseFloat(revGrowth) >= 0 ? '#16a34a' : '#dc2626' },
                      { l: 'GP Margin',      v: `${margin}%`,      color: '#0f766e' },
                      { l: 'GP MoM',         v: `${parseFloat(gpGrowth) >= 0 ? '+' : ''}${gpGrowth}%`,  color: parseFloat(gpGrowth) >= 0 ? '#16a34a' : '#dc2626' },
                      { l: 'EBITDA Margin',  v: `${ebitdaMg}%`,    color: '#7c3aed' },
                    ].map((s, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: 'var(--s3)', borderRadius: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{s.l}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color }}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Budget vs Actual */}
            <div className="card">
              <div className="ch">
                <div className="ctit">Budget vs Actual — {period}</div>
                <span className="bdg ba">MTD Tracking</span>
              </div>
              {(() => {
                const budget = d?.budget_targets ?? STATIC_BUDGET;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {[
                      { key: 'revenue',      icon: '📈', color: '#0f766e', invert: false },
                      { key: 'gross_profit', icon: '💰', color: '#16a34a', invert: false },
                      { key: 'ebitda',       icon: '📊', color: '#7c3aed', invert: false },
                      { key: 'expenses',     icon: '📉', color: '#d97706', invert: true  },
                    ].map(({ key, icon, color, invert }) => {
                      const b = (budget[key] ?? STATIC_BUDGET[key]) || {};
                      const pct     = Math.min(120, (b.actual / b.target) * 100);
                      const dispPct = ((b.actual / b.target) * 100).toFixed(1);
                      const statusColor = invert
                        ? (pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#16a34a')
                        : (pct >= 90 ? '#16a34a' : pct >= 75 ? '#d97706' : '#dc2626');
                      return (
                        <div key={key}
                          style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                          onClick={() => onGoChat?.(`${b.label}: actual ₹${b.actual}L vs target ₹${b.target}L (${dispPct}% achieved). What specific actions can close this gap in the remaining days of the month?`)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{icon} {b.label}</span>
                              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                                Actual ₹{b.actual}L · Target ₹{b.target}L
                              </div>
                            </div>
                            <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: statusColor }}>
                              {dispPct}%
                            </span>
                          </div>
                          <div style={{ height: 8, background: 'var(--s3)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .5s' }} />
                          </div>
                          {!invert && parseFloat(dispPct) < 75 && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3 }}>⚠ Under 75% — revenue gap needs attention</div>}
                          {!invert && parseFloat(dispPct) >= 90 && <div style={{ fontSize: 10, color: '#16a34a', marginTop: 3 }}>✓ On track — strong achievement</div>}
                          {invert  && parseFloat(dispPct) > 85 && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 3 }}>⚠ Over 85% of expense budget — review costs</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {onGoChat && (
                <div className="ai-cta-bar" style={{ margin: '16px 0 0', borderRadius: 8 }}
                  onClick={() => onGoChat(`Budget performance this month: Revenue ${d?.budget_targets?.revenue?.actual ?? 34.6}L vs ₹${d?.budget_targets?.revenue?.target ?? 40}L target. Gross Profit ${d?.budget_targets?.gross_profit?.actual ?? 9.14}L vs ₹${d?.budget_targets?.gross_profit?.target ?? 11}L. What actions in the next 10 working days will most effectively close the revenue and profit gaps?`)}>
                  <span>✨</span><span>Ask AI: Actions to close the budget gap this month →</span>
                </div>
              )}
            </div>
          </div>

          {/* Expense breakdown table */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="ch">
              <div>
                <div className="ctit">Expense Breakdown — Budget vs Actual</div>
                <div className="csub">₹ Lakhs · All operating cost categories · Click row for AI cost reduction advice</div>
              </div>
              {onGoChat && (
                <button className="export-btn" onClick={() => onGoChat('Analyse my full operating expense breakdown. Which categories are tracking over budget? What are the fastest cuts I can make without hurting sales capacity?')}>
                  ✨ AI Cost Review
                </button>
              )}
            </div>
            <table className="tbl tbl-striped">
              <thead>
                <tr>
                  <th>Expense Category</th>
                  <th style={{ textAlign: 'right' }}>Budget (₹L)</th>
                  <th style={{ textAlign: 'right' }}>Actual (₹L)</th>
                  <th style={{ textAlign: 'right' }}>Used %</th>
                  <th style={{ minWidth: 130 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {(d?.expense_breakdown?.length ? d.expense_breakdown : STATIC_EXPENSES).map((e, i) => {
                  const used = ((e.actual / e.budget) * 100).toFixed(0);
                  const over = e.actual > e.budget;
                  const barColor = parseInt(used) > 100 ? '#dc2626' : parseInt(used) > 85 ? '#d97706' : '#0f766e';
                  return (
                    <tr key={i} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                      onClick={() => onGoChat?.(`My ${e.category}: budget ₹${e.budget}L vs actual ₹${e.actual}L (${used}% used). Is this rate of spend acceptable? If I am over-pacing, what are the top 3 ways to reduce ${e.category} expense without impacting business?`)}>
                      <td style={{ fontWeight: 600 }}>{e.category}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>₹{e.budget.toFixed(2)}L</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: over ? '#dc2626' : 'var(--text1)' }}>
                        ₹{e.actual.toFixed(2)}L{over ? ' ⚠' : ''}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: barColor }}>{used}%</td>
                      <td>
                        <div style={{ height: 6, background: 'var(--s3)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, parseFloat(used))}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width .4s' }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const expenses    = d?.expense_breakdown?.length ? d.expense_breakdown : STATIC_EXPENSES;
                  const totalBudget = expenses.reduce((s, e) => s + (e.budget || 0), 0);
                  const totalActual = expenses.reduce((s, e) => s + (e.actual || 0), 0);
                  const totalUsed   = ((totalActual / totalBudget) * 100).toFixed(0);
                  return (
                    <tr style={{ background: 'var(--s2)', fontWeight: 700 }}>
                      <td>Total Opex</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>₹{totalBudget.toFixed(2)}L</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: totalActual > totalBudget ? '#dc2626' : '#0f766e' }}>₹{totalActual.toFixed(2)}L</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: parseInt(totalUsed) > 100 ? '#dc2626' : '#0f766e' }}>{totalUsed}%</td>
                      <td />
                    </tr>
                  );
                })()}
              </tfoot>
            </table>

            {onGoChat && (
              <div className="ai-cta-bar" style={{ margin: '12px 0 0', borderRadius: 8 }}
                onClick={() => onGoChat(`My operating expenses: Freight ₹1.0L (budget ₹1.2L), Salaries ₹1.4L (budget ₹1.6L), Rent ₹0.38L (budget ₹0.4L), Marketing ₹0.22L (budget ₹0.3L), Admin ₹0.3L (budget ₹0.5L). Total: ₹3.3L of ₹4.0L budget (82.5%). Which expense levers will have the biggest positive impact on EBITDA if reduced by 10%?`)}>
                <span>✨</span>
                <span>Ask AI: Which expense cuts improve EBITDA the most — model the impact →</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Global AI CTA (overview tab only) ── */}
      {activeTab === 'overview' && onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat(`Complete financial picture: Revenue ${d?.revenue_mtd ?? '₹34.6L'}, Gross Margin ${d?.gross_margin ?? '26.4%'}, Cash Cycle ${d?.working_capital_days ?? wc.net} days, Outstanding AR ${d?.outstanding_receivables ?? '₹15.4L'}, Net Cash ₹${netSurplus}L, GST payable ${gst.net_payable ?? '₹0.77L'}. Give me the 5 most impactful financial actions to take this month ranked by impact.`)}>
          <span>✨</span>
          <span>Ask AI: Top 5 financial actions to take this month — ranked by impact on cash and margin →</span>
        </div>
      )}

      {/* ── Collection modal ── */}
      {collModal && (
        <CollectionModal
          row={collModal}
          onClose={() => setCollModal(null)}
          onGoChat={onGoChat}
        />
      )}
    </div>
  );
}
