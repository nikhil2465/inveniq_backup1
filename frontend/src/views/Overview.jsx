import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MONTHS, baseOpts, scaleXY, createChart, gradientFill } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const TODAY = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const TIME   = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const QUICK_ACTIONS = [
  { icon: '📦', label: 'New Sales Order',  view: 'louvers',   aiQ: null },
  { icon: '🛒', label: 'Create PO',        view: 'pogrn',     aiQ: null },
  { icon: '📊', label: 'Sales Analysis',   view: 'sales',     aiQ: null },
  { icon: '👥', label: 'Customers',        view: 'customers', aiQ: null },
  { icon: '📉', label: 'Dead Stock',       view: 'deadstock', aiQ: null },
  { icon: '💰', label: 'Finance',          view: 'finance',   aiQ: null },
  { icon: '📋', label: 'Invoices',         view: 'invoices',  aiQ: null },
  { icon: '🤖', label: 'Ask AI',           view: 'chatbot',   aiQ: 'Give me a complete executive business briefing — revenue health, top risks, best opportunities, and the 3 most important actions I should take today.' },
];

const PROACTIVE_ALERTS = [
  {
    level: 'cr', icon: '🚨',
    title: '₹4.2L Dead Stock — 3 SKUs unsold 90+ days — Immediate action needed',
    sub: '18mm BWP (₹1.8L) · 4mm MR (₹1.4L) · 19mm Commercial (₹1.0L) · Discount or supplier return',
    q: 'I have ₹4.2L in dead stock across 3 SKUs unsold for 90+ days. Give me a complete action plan — minimum sellable price, discount strategy, and supplier return process.',
  },
  {
    level: 'wr', icon: '⚠️',
    title: 'City Interiors — ₹1.8L/month customer at churn risk (47 days silent)',
    sub: 'Was ordering weekly · Sudden stop · Competitor may have offered better credit · Call now',
    q: "City Interiors hasn't ordered in 47 days — they were ordering weekly. They're worth ₹1.8L/month. What likely happened and what's the best recovery strategy?",
  },
  {
    level: 'wr', icon: '⚡',
    title: '18mm BWP stock critical — stockout in 8 days, lead time 6 days',
    sub: 'Current: 140 sheets · Daily: 17 sheets · Must order TODAY to avoid backorders',
    q: 'My 18mm BWP stock has 8 days remaining and supplier lead time is 6 days. How much should I order and should I expedite from an alternate supplier?',
  },
];

const RECENT_ACTIVITY = [
  { icon: '📦', iconBg: 'var(--g3)', title: 'Sales Order SO-2026-0089 created', meta: 'Prestige Developers · 250 SQM Aluminium Louvers · ₹5.25L', time: '9 min ago' },
  { icon: '✅', iconBg: 'var(--b3)', title: 'GRN GRN-2026-0017 — 3 items matched', meta: 'Gauri Laminates · 18mm BWP 200 sheets', time: '34 min ago' },
  { icon: '🔔', iconBg: 'var(--a3)', title: 'Low stock alert — 18mm BWP (8 days left)', meta: 'Reorder now · Lead time 6 days', time: '1h ago' },
  { icon: '💵', iconBg: 'var(--p3)', title: 'Payment received — City Interiors', meta: '₹2.4L cleared · Outstanding ₹0', time: '2h ago' },
  { icon: '📋', iconBg: 'var(--r3)', title: 'Claim CLM-2026-0012 approved', meta: 'Bangalore Building Supplies · Price diff ₹18,500', time: '3h ago' },
];

export default function Overview({ onGoChat, onNavigate, dbStatus, period = 'MTD', allowedModules = null }) {
  const [d, setD] = useState(null);
  const revRef = useRef(null), donutRef = useRef(null), custTypeRef = useRef(null);

  const fetchData = useCallback(() => {
    fetch(`/api/overview?period=${encodeURIComponent(period)}`).then(r => r.json()).then(setD).catch(() => {});
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  const src = d?.data_source ?? 'demo';

  const KPI1 = [
    { cls: 'sg', label: 'Revenue MTD',            conf: '96%', val: d?.revenue_mtd ?? '₹28.4L',                        delta: '▲ 9.2% vs last month', deltaClass: 'up',  sub: 'YTD: ₹2.84 Cr · Target: ₹3.0 Cr',   bar: 78, barColor: 'var(--g2)', q: 'Why is revenue up 9.2% this month? What are the main drivers?' },
    { cls: 'sg', label: 'Gross Margin',            conf: '93%', val: d?.gross_margin ?? '22.4%',                        delta: '▲ 1.1% vs last month', deltaClass: 'up',  sub: 'BWP grades highest · MR grades lowest', bar: 65, barColor: 'var(--g2)', q: 'What is my gross margin this month and which products have the highest margin?' },
    { cls: 'sa', label: 'Dead Stock Value',        conf: '98%', val: d?.dead_stock_value ?? '₹4.2L',                   delta: '▲ +₹0.8L this month',  deltaClass: 'wn',  sub: '3 SKUs · 90+ days unsold',            bar: 62, barColor: 'var(--a2)', q: 'I have dead stock worth ₹4.2L. Which SKUs are these and what should I do?' },
    { cls: 'sr', label: 'Outstanding Receivable',  conf: '95%', val: d?.outstanding_receivables ?? '₹12.8L',           delta: '▼ 4 overdue accounts',  deltaClass: 'dn',  sub: 'Oldest: 78 days · High risk',          bar: 72, barColor: 'var(--r2)', q: 'Why is my outstanding receivable high? Which customers owe the most?' },
    { cls: 'sb', label: 'Orders Today',            conf: '99%', val: String(d?.orders_today ?? 24),                    delta: `▲ ${d?.orders_dispatched ?? 18} dispatched`, deltaClass: 'up', sub: `${d?.orders_dispatched ?? 18} dispatched · ${d?.orders_pending ?? 6} pending`, bar: 82, barColor: 'var(--b2)', q: 'How many orders did I receive today vs target? Which orders are pending?' },
    { cls: 'sp', label: 'Low Stock Alerts',        conf: '99%', val: `${d?.low_stock_skus ?? 7} SKUs`,                 delta: '▼ Below reorder level', deltaClass: 'dn',  sub: '18mm BWP critical · Order now',        bar: 45, barColor: 'var(--p2)', q: 'Which products are running low on stock and need to be reordered?' },
  ];
  const KPI2 = [
    { cls: 'st', label: 'Working Capital Days',  conf: 'AI',  val: `${d?.working_capital_days ?? 48} days`,    delta: '▲ DIO 22 + DSO 34 − DPO 8', deltaClass: 'wn',  sub: 'Target: <40d · Cash stuck longer',      q: 'What is my working capital cycle in days?' },
    { cls: 'sg', label: 'Inventory Accuracy',    conf: '97%', val: d?.inventory_accuracy ?? '96.8%',           delta: '▲ Book vs Physical match',  deltaClass: 'up',  sub: 'Last audit: 3 days ago',                q: 'What is my inventory accuracy after last audit?' },
    { cls: 'so', label: 'ABC Classification',    conf: 'AI',  val: 'A: 4 SKUs',                                delta: '▲ 78% revenue from 20% SKUs', deltaClass: 'up', sub: 'B: 8 · C: 30 · Focus on A',             q: 'Show me ABC classification of my SKUs' },
    { cls: 'sa', label: 'At-Risk Customers',     conf: '88%', val: `${d?.at_risk_customers ?? 8} accounts`,   delta: '▼ No order 30+ days',        deltaClass: 'dn',  sub: 'Combined value: ₹6.4L/mo',              q: "Which customers haven't ordered in a long time and are at risk of churning?" },
    { cls: 'si', label: 'Stock Turnover',        conf: '92%', val: d?.stock_turnover ?? '4.2×',               delta: '▲ 0.3× vs last month',       deltaClass: 'up',  sub: '18mm BWP: 6.8× · Best mover',          q: 'What is my stock turnover ratio and which SKUs turn fastest?' },
    { cls: 'sb', label: 'GMROI',                 conf: 'AI',  val: d?.gmroi ?? '₹1.98',                       delta: '▲ Gross margin per ₹1 stock', deltaClass: 'up', sub: 'Target: >₹2.0 · Fix dead stock',        q: 'What is my GMROI and how can I improve it?' },
  ];

  const revChartLabels = d?.monthly_revenue?.length ? d.monthly_revenue.map(m => m.month) : MONTHS;
  const revChartData   = d?.monthly_revenue?.length ? d.monthly_revenue.map(m => m.revenue) : [19.2, 20.1, 21.4, 22.8, 21.6, 20.4, 22.1, 23.8, 24.4, 25.2, 26.0, 28.4];
  const profitData     = d?.monthly_revenue?.length ? d.monthly_revenue.map(m => +(m.revenue * 0.224).toFixed(2)) : [4.1, 4.4, 4.6, 5.0, 4.8, 4.2, 4.8, 5.4, 5.5, 5.7, 5.8, 6.36];
  const targetData     = revChartData.map((v) => +(v * 1.08).toFixed(1));

  useEffect(() => {
    const d1 = createChart(revRef, {
      type: 'line',
      data: {
        labels: revChartLabels,
        datasets: [
          { data: revChartData, borderColor: '#0f766e', backgroundColor: gradientFill('#0f766e'), borderWidth: 2.5, tension: .4, pointRadius: 3, pointHoverRadius: 5, fill: true, label: 'Revenue' },
          { data: targetData, borderColor: '#d97706', borderWidth: 1.5, borderDash: [5, 4], tension: .4, pointRadius: 0, label: 'Target' },
          { data: profitData, borderColor: '#2563eb', backgroundColor: gradientFill('#2563eb', 0.12), borderWidth: 2, tension: .4, pointRadius: 0, fill: true, label: 'Gross Profit' },
        ],
      },
      options: baseOpts({ scales: scaleXY(v => '₹' + v + 'L') }),
    });
    const d2 = createChart(donutRef, {
      type: 'doughnut',
      data: { labels: ['BWP', 'MR', 'Commercial', 'Laminates', 'Others'], datasets: [{ data: [38, 28, 18, 11, 5], backgroundColor: ['#0f766e', '#2563eb', '#d97706', '#9333ea', '#9ca3af'], borderWidth: 0, hoverOffset: 8 }] },
      options: baseOpts({ cutout: '72%' }),
    });
    const d3 = createChart(custTypeRef, {
      type: 'doughnut',
      data: { labels: ['Contractors', 'Interior Firms', 'Retailers', 'Carpenters'], datasets: [{ data: [44, 26, 18, 12], backgroundColor: ['#0f766e', '#2563eb', '#d97706', '#ea580c'], borderWidth: 0, hoverOffset: 8 }] },
      options: baseOpts({ cutout: '72%' }),
    });
    return () => { d1(); d2(); d3(); };
  }, [d]);

  const aiBrief = d?.ai_brief ?? (
    'Revenue up 9.2% this month — 18mm BWP and 12mm MR are your top movers. ' +
    'Dead stock worth ₹4.2L sitting unsold for 90+ days — 3 SKUs identified for urgent action. ' +
    'Customer "City Interiors" hasn\'t ordered in 47 days — at-risk account worth ₹1.8L/month. ' +
    'Supplier "Gauri Laminates" has delayed 2 deliveries this month — consider alternate sourcing.'
  );

  const healthScore = d ? Math.round(
    (d.revenue_growth?.includes('+') ? 22 : 10) +
    (parseFloat(d.gross_margin) > 20 ? 20 : 12) +
    (d.low_stock_skus < 5 ? 18 : 8) +
    (d.at_risk_customers < 5 ? 20 : 10) +
    (parseFloat(d.inventory_accuracy) > 95 ? 20 : 12)
  ) : 78;
  const healthLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 65 ? 'Good' : healthScore >= 50 ? 'Fair' : 'Needs Attention';

  return (
    <div className="view">

      {/* ── Welcome Banner ── */}
      <div className="overview-welcome">
        <div className="overview-welcome-left">
          <div className="overview-welcome-greeting">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'} · {TODAY}</div>
          <div className="overview-welcome-title">InvenIQ Command Centre</div>
          <div className="overview-welcome-sub">
            {src === 'mysql' ? '🟢 Live data · All modules synced' : '🟡 Demo mode · Connect MySQL for live data'} · Refreshed {TIME}
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              className="bhs-badge"
              style={{ cursor: 'pointer', border: 'none', background: 'rgba(255,255,255,.14)' }}
              onClick={() => onGoChat?.('Give me a complete business health analysis — what\'s going well, what needs attention, and my top 3 action items today.')}
            >
              <div>
                <div className="bhs-label-top">Business Health</div>
                <div className="bhs-label-bot">{healthLabel}</div>
              </div>
              <div className="bhs-score">{healthScore}</div>
              <div>
                <div className="bhs-bar-wrap"><div className="bhs-bar-fill" style={{ width: `${healthScore}%` }}></div></div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,.5)', marginTop: 3, fontFamily: 'var(--mono)' }}>OUT OF 100</div>
              </div>
            </button>
          </div>
        </div>
        <div className="overview-welcome-right">
          <div className="overview-welcome-stat" onClick={() => onGoChat?.('How many orders have I received today vs target?')} style={{ cursor: 'pointer' }}>
            <div className="ows-val">{d?.orders_today ?? 24}</div>
            <div className="ows-lbl">Orders Today</div>
          </div>
          <div className="overview-welcome-stat" onClick={() => onGoChat?.('What is my revenue MTD and am I on track for the monthly target?')} style={{ cursor: 'pointer' }}>
            <div className="ows-val">{d?.revenue_mtd ?? '₹28.4L'}</div>
            <div className="ows-lbl">Revenue MTD</div>
          </div>
          <div className="overview-welcome-stat" onClick={() => onGoChat?.('What are my current stock alerts and which ones need immediate action?')} style={{ cursor: 'pointer' }}>
            <div className="ows-val" style={{ color: (d?.low_stock_skus ?? 7) > 0 ? '#fbbf24' : '#4ade80' }}>{d?.low_stock_skus ?? 7}</div>
            <div className="ows-lbl">Stock Alerts</div>
          </div>
          <div className="overview-welcome-stat" onClick={() => onGoChat?.('Which customers owe me money and how overdue are they?')} style={{ cursor: 'pointer' }}>
            <div className="ows-val" style={{ color: '#fbbf24' }}>{d?.at_risk_customers ?? 8}</div>
            <div className="ows-lbl">At-Risk Accounts</div>
          </div>
        </div>
      </div>

      {/* ── Proactive AI Alert Strip ── */}
      <div className="pal-strip">
        <div className="pal-header">
          <span className="pal-header-icon">🤖</span>
          <span className="pal-header-text">AI Priority Alerts</span>
          <span className="pal-header-sub">3 items requiring your attention today · click any to get an action plan</span>
        </div>
        <div className="pal-items">
          {PROACTIVE_ALERTS.map((a, i) => (
            <div key={i} className={`pal-item pal-${a.level}`} onClick={() => onGoChat?.(a.q)}>
              <span className="pal-icon">{a.icon}</span>
              <div className="pal-body">
                <div className="pal-title">{a.title}</div>
                <div className="pal-sub">{a.sub}</div>
              </div>
              <span className="pal-action">Ask AI →</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="qa-bar">
        <span className="qa-bar-label">Quick Actions:</span>
        {QUICK_ACTIONS.filter(a => !allowedModules || !a.view || allowedModules.includes(a.view)).map(a => (
          <button
            key={a.label}
            className="qa-btn"
            onClick={() => {
              if (a.aiQ) { onGoChat?.(a.aiQ); }
              else { onNavigate?.(a.view); }
            }}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {/* ── Data Source Banner ── */}
      <div className="src-banner">
        <div className="src-icon">API</div>
        <div className="src-text">
          <strong>InvenIQ reads directly from your Dealer Management System (DMS).</strong> All numbers below are pulled live from your existing inventory, billing, and order software — no manual entry required.
        </div>
        <div className="src-dots">
          {['Inventory', 'Billing', 'Orders', 'Purchases'].map(l => (
            <div key={l} className="src-dot"><span className="dot dg"></span>{l}</div>
          ))}
        </div>
      </div>

      {/* ── AI Daily Brief ── */}
      <div className="ai-banner">
        <div className="ai-ic">AI</div>
        <div className="ai-b">
          <div className="ai-lbl">
            AI Daily Brief — {src === 'mysql' ? '● Live DB' : 'Demo data'} · Updated {TIME}
          </div>
          <div className="ai-txt">{aiBrief}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <div className="ai-ts">{src === 'mysql' ? 'Live' : 'Demo'}<br />{src === 'mysql' ? 'Real-time' : 'Fallback'}</div>
          <DataSourceBadge source={src} updatedAt={dbStatus?.checkedAt} />
        </div>
      </div>

      {/* ── KPI Row 1 ── */}
      <div className="dash-section-hdr">
        <div className="dash-section-title">Today's Business Health — click any tile for AI explanation</div>
        <button className="export-btn" onClick={() => onGoChat("Give me a full business health report for today")}>📊 Full Report</button>
      </div>
      <div className="kg g6">
        {KPI1.map(k => (
          <div key={k.label} className={`kc ${k.cls}`} onClick={() => onGoChat(k.q)} style={{ cursor: 'pointer' }}>
            <div className="kt"><div className="kl">{k.label}</div><span className="kconf">{k.conf}</span></div>
            <div className="kv">{k.val}</div>
            <div className={`kd ${k.deltaClass}`}>{k.delta}</div>
            <div className="ks">{k.sub}</div>
            <div className="kbar"><div className="kbf" style={{ width: `${k.bar}%`, background: k.barColor }}></div></div>
          </div>
        ))}
      </div>

      {/* ── KPI Row 2 ── */}
      <div className="dash-section-hdr">
        <div className="dash-section-title">Dealership Operations KPIs · <span style={{ color: 'var(--g2)', fontFamily: 'var(--font)', textTransform: 'none', letterSpacing: 0 }}>AI-Enhanced · Beyond Tally &amp; Vyapar</span></div>
      </div>
      <div className="kg g6">
        {KPI2.map(k => (
          <div key={k.label} className={`kc ${k.cls}`} onClick={() => onGoChat(k.q)} style={{ cursor: 'pointer' }}>
            <div className="kt"><div className="kl">{k.label}</div><span className="kconf">{k.conf}</span></div>
            <div className="kv">{k.val}</div>
            <div className={`kd ${k.deltaClass}`}>{k.delta}</div>
            <div className="ks">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div className="gl g75">
        <div className="card">
          <div className="ch">
            <div>
              <div className="ctit">Revenue Trend — Last 12 Months</div>
              <div className="csub">₹ Lakhs · From your billing system · Click chart for AI analysis</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="export-btn" onClick={() => onGoChat('Analyse my 12-month revenue trend. What are the key patterns and drivers?')}>✨ AI Analyse</button>
              <DataSourceBadge source={src} />
            </div>
          </div>
          <div style={{ height: '220px', position: 'relative' }}>
            <canvas ref={revRef}></canvas>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
            {[['#0f766e', 'Revenue'], ['#d97706', 'AI Target'], ['#2563eb', 'Gross Profit']].map(([c, l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text2)' }}>
                <span style={{ width: 12, height: 3, borderRadius: 2, background: c, display: 'inline-block' }}></span>{l}
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">AI Alerts — Action Required</div><span className="bdg br">5 Active</span></div>
          <div className="ilist">
            {[
              ['icr', '!', '₹4.2L Dead Stock — 3 SKUs Stagnant 90+ Days', '6mm Gurjan (₹1.8L), 4mm MR plain (₹1.4L), 19mm commercial (₹1.0L). AI recommends discounting or returning to supplier.', 'STOCK AGEING · IMMEDIATE · HIGH IMPACT'],
              ['ica', '!', 'City Interiors — 47 Days No Order (₹1.8L/mo)', 'Was ordering weekly. Sudden silence. Competitor may have offered better credit terms. Call needed.', 'CUSTOMER CHURN RISK · HIGH VALUE'],
              ['icr', '!', 'Gauri Laminates — 2 Delivery Delays This Month', '8mm flexi boards delayed 8 and 12 days. Orders pending. Evaluate alternate supplier.', 'SUPPLIER RISK · AFFECTING FULFILMENT'],
              ['ica', '₹', '18mm BWP Stock at 8 Days — Reorder Now', 'Current stock: 140 sheets. Daily sale: 17 sheets. Stockout in 8 days. Lead time 6 days.', 'CRITICAL REORDER · ORDER TODAY'],
            ].map(([icCls, icon, title, desc, meta]) => (
              <div key={title} className="ii" style={{ cursor: 'pointer' }} onClick={() => onGoChat(title)}>
                <div className={`iic ${icCls}`}>{icon}</div>
                <div><div className="iti">{title}</div><div className="ide">{desc}</div><div className="imt">{meta}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="gl g333">
        <div className="card">
          <div className="ch"><div className="ctit">Revenue by Product Grade</div><div className="csub">MTD contribution %</div></div>
          <div style={{ height: '160px', position: 'relative' }}><canvas ref={donutRef}></canvas></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
            {[['#0f766e', 'BWP 38%'], ['#2563eb', 'MR 28%'], ['#d97706', 'Commercial 18%'], ['#9333ea', 'Laminates 11%'], ['#9ca3af', 'Others 5%']].map(([c, l]) => (
              <span key={l} style={{ fontSize: 10, color: 'var(--text3)' }}><span style={{ color: c, fontWeight: 700 }}>■</span> {l}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">Revenue by Customer Type</div><div className="csub">Who's buying from you</div></div>
          <div style={{ height: '160px', position: 'relative' }}><canvas ref={custTypeRef}></canvas></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
            {[['#0f766e', 'Contractors 44%'], ['#2563eb', 'Interior Firms 26%'], ['#d97706', 'Retailers 18%'], ['#ea580c', 'Carpenters 12%']].map(([c, l]) => (
              <span key={l} style={{ fontSize: 10, color: 'var(--text3)' }}><span style={{ color: c, fontWeight: 700 }}>■</span> {l}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">Top 5 Selling SKUs Today</div><div className="csub">Sheets sold</div></div>
          <div className="rlist">
            {[['18mm BWP', 92, '#0f766e', '46 sheets', '+18%', 'up'], ['12mm MR', 76, '#2563eb', '38 sheets', '+6%', 'up'], ['12mm BWP', 62, '#0f766e', '31 sheets', '+9%', 'up'], ['18mm MR', 48, '#d97706', '24 sheets', '0%', 'fl'], ['Laminates', 36, '#9333ea', '18 sheets', '-4%', 'dn']].map(([n, w, c, v, dd, dc]) => (
              <div key={n} className="rrow" style={{ cursor: 'pointer' }} onClick={() => onGoChat(`Tell me about ${n} sales performance today vs last week vs last month`)}>
                <span className="rn">{n}</span>
                <div className="rbw"><div className="rbf" style={{ width: `${w}%`, background: c }}></div></div>
                <span className="rv">{v}</span>
                <span className={`rd ${dc}`}>{dd}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="ch">
          <div>
            <div className="ctit">Recent Activity</div>
            <div className="csub">Live feed from all modules · click to analyse</div>
          </div>
          <button className="export-btn" onClick={() => onGoChat("Show me today's complete business activity summary")}>📋 Full Log</button>
        </div>
        <div className="activity-feed">
          {RECENT_ACTIVITY.map((a, i) => (
            <div key={i} className="act-item" style={{ cursor: 'pointer' }} onClick={() => onGoChat(`Analyse: ${a.title} — ${a.meta}`)}>
              <div className="act-icon" style={{ background: a.iconBg }}>{a.icon}</div>
              <div className="act-body">
                <div className="act-title">{a.title}</div>
                <div className="act-meta">{a.meta}</div>
              </div>
              <div className="act-time">{a.time}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Performance Metrics ── */}
      <div className="gl g55" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="ch"><div className="ctit">Business Health Scorecard</div><div className="csub">AI-rated · Click metric for deep dive</div></div>
          <div>
            {[
              { label: 'Revenue Achievement', pct: 78, val: '₹28.4L', delta: '+9.2%', dc: 'up', color: 'var(--g2)', q: 'How am I tracking against revenue target this month?' },
              { label: 'Gross Margin Health', pct: 65, val: '22.4%',  delta: '+1.1%', dc: 'up', color: 'var(--g2)', q: 'Is my gross margin healthy and how can I improve it?' },
              { label: 'Inventory Turnover',  pct: 70, val: '4.2×',   delta: '+0.3×', dc: 'up', color: 'var(--t2)', q: 'What is my inventory turnover and how does it compare to industry?' },
              { label: 'Collection Efficiency',pct: 55, val: '78 days',delta: '-2d',  dc: 'wn', color: 'var(--a2)', q: 'How is my accounts receivable collection performing?' },
              { label: 'Dead Stock Risk',     pct: 38, val: '₹4.2L',  delta: '+19%', dc: 'dn', color: 'var(--r2)', q: 'What is my dead stock risk and what actions should I take?' },
              { label: 'Supplier On-Time',    pct: 82, val: '87%',    delta: '-5%',  dc: 'wn', color: 'var(--a2)', q: 'Which suppliers are delivering on time and which are delayed?' },
            ].map(m => (
              <div key={m.label} className="metric-row" style={{ cursor: 'pointer' }} onClick={() => onGoChat(m.q)}>
                <div className="metric-label">{m.label}</div>
                <div className="metric-bar-wrap">
                  <div className="metric-bar-fill" style={{ width: `${m.pct}%`, background: m.color }}></div>
                </div>
                <div className="metric-value">{m.val}</div>
                <div className={`metric-delta ${m.dc}`}>{m.delta}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">Cash Flow Snapshot</div><div className="csub">Working capital intelligence</div></div>
          <div className="flow-grid">
            <div className="flow-card" style={{ borderTop: '3px solid var(--g2)' }}>
              <div className="fl2">Inflows (MTD)</div>
              <div className="fv" style={{ color: 'var(--g2)' }}>₹31.2L</div>
              <div className="fd">Sales collections</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-card" style={{ borderTop: '3px solid var(--r2)' }}>
              <div className="fl2">Outflows (MTD)</div>
              <div className="fv" style={{ color: 'var(--r2)' }}>₹18.6L</div>
              <div className="fd">Purchases + opex</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-card" style={{ borderTop: '3px solid var(--b2)' }}>
              <div className="fl2">Net Cash</div>
              <div className="fv" style={{ color: 'var(--b2)' }}>₹12.6L</div>
              <div className="fd">Net positive ✓</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            {[
              { label: 'Receivables Outstanding', val: '₹12.8L', color: 'var(--r2)', pct: 72 },
              { label: 'Payables Due',             val: '₹6.4L',  color: 'var(--a2)', pct: 45 },
              { label: 'Working Capital',           val: '48 days',color: 'var(--t2)', pct: 55 },
            ].map(m => (
              <div key={m.label} className="metric-row" style={{ cursor: 'pointer' }} onClick={() => onGoChat(`What is my ${m.label} and how can I improve it?`)}>
                <div className="metric-label">{m.label}</div>
                <div className="metric-bar-wrap">
                  <div className="metric-bar-fill" style={{ width: `${m.pct}%`, background: m.color }}></div>
                </div>
                <div className="metric-value">{m.val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--g5)', border: '1px solid var(--g4)', borderRadius: 8 }}>
            <button
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font)' }}
              onClick={() => onGoChat("Give me a complete cash flow analysis and recommendations to improve working capital")}
            >
              ✨ Ask AI: How can I improve my cash position? →
            </button>
          </div>
        </div>
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginTop: 20 }} onClick={() => onGoChat(
          'Give me a complete executive business briefing — revenue health, top risks, best opportunities, and the 3 most important actions I should take today.'
        )}>
          <span>✨</span>
          <span>Ask AI: Full business briefing — top risks, opportunities, and today's 3 priority actions</span>
        </div>
      )}
    </div>
  );
}
