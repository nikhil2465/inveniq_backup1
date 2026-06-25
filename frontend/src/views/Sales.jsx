import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MONTHS, baseOpts, scaleXY, createChart, gradientFill, axisColors } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATIC_REV   = [19.2, 20.1, 21.4, 22.8, 21.6, 20.4, 22.1, 23.8, 24.4, 25.2, 26.0, 28.4];
const STATIC_PROF  = [4.1, 4.4, 4.6, 5.0, 4.8, 4.2, 4.8, 5.4, 5.5, 5.7, 5.8, 6.36];
const STATIC_MGN   = { labels: ['18mm BWP', '12mm BWP', '10mm Flexi', 'Laminates', '18mm MR', '12mm MR', 'Commercial'], data: [28.4, 25.6, 24.1, 22.8, 19.6, 17.4, 8.2] };
const STATIC_DOW   = { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], data: [5.8, 4.2, 4.6, 4.4, 4.8, 3.2, 0.4] };

export default function Sales({ onGoChat, period = 'MTD' }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [custSort, setCustSort] = useState({ field: 'rev', dir: 'desc' });
  const [repSort, setRepSort] = useState({ field: 'pct', dir: 'asc' });
  const salesRef = useRef(null), marginRef = useRef(null), dowRef = useRef(null);

  const fetchData = useCallback(() => {
    fetch(`/api/sales?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  const src = d?.data_source ?? 'demo';

  const revData  = d?.monthly_revenue?.length ? d.monthly_revenue.map(m => m.revenue)  : STATIC_REV;
  const mgnLabels = d?.margin_by_sku?.length  ? d.margin_by_sku.map(m => m.sku)         : STATIC_MGN.labels;
  const mgnData   = d?.margin_by_sku?.length  ? d.margin_by_sku.map(m => m.margin)      : STATIC_MGN.data;
  const dowLabels = d?.day_of_week?.length    ? d.day_of_week.map(x => x.day)           : STATIC_DOW.labels;
  const dowData   = d?.day_of_week?.length    ? d.day_of_week.map(x => x.avg)           : STATIC_DOW.data;
  const chartLabels = d?.monthly_revenue?.length ? d.monthly_revenue.map(m => m.month)  : MONTHS;

  const parseLakh = (s) => {
    const m = /([\d.]+)\s*(L|Cr)?/i.exec(String(s ?? '').replace(/[₹,]/g, ''));
    if (!m) return 0;
    const n = parseFloat(m[1]);
    return m[2]?.toUpperCase() === 'CR' ? n * 1e7 : m[2]?.toUpperCase() === 'L' ? n * 1e5 : n;
  };
  const custSic = (f) => custSort.field === f ? (custSort.dir === 'asc' ? '▲' : '▼') : '⇅';
  const custStc = (f) => `sth${custSort.field === f ? ` sth-${custSort.dir}` : ''}`;
  const toggleCustSort = (f) => setCustSort(s => ({ field: f, dir: s.field === f && s.dir === 'asc' ? 'desc' : 'asc' }));
  const topCustomers = [
    { r: 1, name: 'Prestige Developers',  rev: '₹5.2L', margin: '24.8%', orders: 18, trend: 1  },
    { r: 2, name: 'Design Space Studio',  rev: '₹3.8L', margin: '31.2%', orders: 24, trend: 1  },
    { r: 3, name: 'BuildPro Contractors', rev: '₹3.1L', margin: '18.4%', orders: 31, trend: -1 },
    { r: 4, name: 'City Interiors',       rev: '₹2.4L', margin: '28.6%', orders: 12, trend: -1 },
    { r: 5, name: 'MKS Hardware Works',   rev: '₹1.9L', margin: '19.1%', orders: 8,  trend: 1  },
  ].sort((a, b) => {
    const { field, dir } = custSort;
    const fmap = { r: x => x.r, name: x => x.name, rev: x => parseLakh(x.rev), margin: x => parseFloat(x.margin), orders: x => x.orders };
    const av = fmap[field]?.(a) ?? 0, bv = fmap[field]?.(b) ?? 0;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });

  const repSic = (f) => repSort.field === f ? (repSort.dir === 'asc' ? '▲' : '▼') : '⇅';
  const repStc = (f) => `sth${repSort.field === f ? ` sth-${repSort.dir}` : ''}`;
  const toggleRepSort = (f) => setRepSort(s => ({ field: f, dir: s.field === f && s.dir === 'asc' ? 'desc' : 'asc' }));
  const repPerf = [
    { name: 'Ravi Kumar',   target: '₹12L', actual: '₹10.8L', pct: 90,  color: '#15803d', act: 'On track'   },
    { name: 'Priya Sharma', target: '₹8L',  actual: '₹8.4L',  pct: 105, color: '#0f766e', act: 'Exceeded'   },
    { name: 'Ajay Nair',    target: '₹10L', actual: '₹7.2L',  pct: 72,  color: '#d97706', act: 'Behind 28%' },
    { name: 'Deepa Rao',    target: '₹6L',  actual: '₹3.6L',  pct: 60,  color: '#dc2626', act: 'At risk'    },
  ].sort((a, b) => {
    const { field, dir } = repSort;
    const fmap = { name: x => x.name, target: x => parseLakh(x.target), actual: x => parseLakh(x.actual), pct: x => x.pct };
    const av = fmap[field]?.(a) ?? 0, bv = fmap[field]?.(b) ?? 0;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });

  useEffect(() => {
    if (!d) return;
    const d1 = createChart(salesRef, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          { data: revData, borderColor: '#0f766e', backgroundColor: gradientFill('#0f766e'), borderWidth: 2.5, tension: .4, pointRadius: 0, fill: true },
          { data: STATIC_PROF, borderColor: '#2563eb', borderWidth: 2, tension: .4, pointRadius: 0 },
        ],
      },
      options: baseOpts({ scales: scaleXY(v => '₹' + v + 'L') }),
    });
    const c = axisColors();
    const d2 = createChart(marginRef, {
      type: 'bar',
      data: {
        labels: mgnLabels,
        datasets: [{ data: mgnData, backgroundColor: ['#0f766ecc','#0f766ecc','#16a34acc','#9333eacc','#d97706cc','#2563ebcc','#ea580ccc'], borderWidth: 0, borderRadius: 3 }],
      },
      options: baseOpts({ scales: { x: { grid: { color: c.grid }, ticks: { color: c.label, font: { size: 9 } } }, y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => v + '%' } } } }),
    });
    const d3 = createChart(dowRef, {
      type: 'bar',
      data: {
        labels: dowLabels,
        datasets: [{ data: dowData, backgroundColor: ['#0f766ecc','#2563ebaa','#2563ebaa','#2563ebaa','#2563ebaa','#d97706aa','#9ca3afaa'], borderWidth: 0, borderRadius: 3 }],
      },
      options: baseOpts({ scales: { x: { grid: { display: false }, ticks: { color: c.label, font: { size: 10 } } }, y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v + 'L' } } } }),
    });
    return () => { d1(); d2(); d3(); };
  }, [d]);

  if (loading) return <SkeletonView />;

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Sales Performance — Revenue &amp; Margin Intelligence</div>
          <div className="psub">
            What's selling, what's not, and where your money really comes from
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me a full sales performance analysis — revenue trend, top margin products, discount leakage, and what I should focus on to grow profit this month.')}>
              ✨ AI Sales Analysis
            </button>
          )}
        </div>
      </div>

      <div className="kg g5">
        {[
          { cls: 'sg', l: 'Revenue MTD',      v: d?.revenue_mtd ?? '₹28.4L',   d: `▲ ${d?.revenue_growth ?? '+9.2% MoM'}`,  sub: 'Target: ₹32L · On track', q: 'What is my revenue MTD and am I on track for the monthly target?' },
          { cls: 'sg', l: 'Gross Profit MTD', v: d?.profit_mtd ?? '₹6.36L',    d: `▲ Margin: ${d?.gross_margin ?? '22.4%'}`, sub: 'Best: 18mm BWP at 28%',    q: 'What is my gross profit and which products have the highest margins?' },
          { cls: 'sa', l: 'Discount Leakage', v: d?.avg_discount ?? '4.8%',     d: '₹1.36L/mo lost to discounts',             sub: 'Set floor prices to stop',  q: 'How much revenue am I losing to discounts and how can I reduce discount leakage?' },
          { cls: 'sb', l: 'Orders MTD',       v: String(d?.orders_mtd ?? 486), d: '▲ +42 vs last month',                      sub: 'Peak: Monday · 38%',        q: 'How many orders have I received this month and what is the trend?' },
          { cls: 'st', l: 'Avg Order Value',  v: d?.avg_order_value ?? '₹58K', d: '▲ +₹4K vs last month',                     sub: 'Interior firms highest',     q: 'What is my average order value and which customer segments have the highest AOV?' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(k.q)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd up">{k.d}</div>
            {k.sub && <div className="ks">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── AI Revenue Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '🏠', text: 'Interior firms yield 31% margin vs 19% contractors — grow this segment',     q: 'Interior design firms give me 31% margin vs 19% from contractors. How should I change my sales strategy to grow the higher-margin segment?' },
            { icon: '💸', text: '4.8% avg discount = ₹1.36L lost monthly — set floor prices now',             q: 'I\'m giving 4.8% average discount across orders, costing ₹1.36L per month. Help me set floor prices by SKU and reduce discount leakage.' },
            { icon: '📅', text: 'Monday peaks at 38% of weekly revenue — maximize staffing & pre-picking',     q: 'Monday accounts for 38% of my weekly revenue. How should I adjust staffing, pre-picking, and vehicle scheduling to capitalize on this?' },
            { icon: '📦', text: '8mm Flexi true margin is 6.7% not 23.8% — freight destroys profitability',   q: 'After freight costs, 8mm Flexi BWP has a true margin of 6.7% instead of stated 23.8%. What should I do — reprice, renegotiate freight, or find alternate supplier?' },
            { icon: '🎯', text: 'A-grade SKUs (4 items) drive 78% revenue — prioritize stock & credit here', q: 'My A-grade SKUs are just 4 items but drive 78% of revenue. How should I prioritize inventory investment and credit for these products?' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      <div className="gl g55">
        <div className="card">
          <div className="ch">
            <div>
              <div className="ctit">Revenue &amp; Profit Trend</div>
              <div className="csub">₹ Lakhs — Last 12 months · Teal = Revenue · Blue = Gross Profit</div>
            </div>
            {onGoChat && (
              <button className="export-btn" onClick={() => onGoChat('Analyse my 12-month revenue and profit trend. What are the key patterns, seasonal dips, and what should I do differently in the next quarter?')}>
                ✨ AI Analyse
              </button>
            )}
          </div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={salesRef}></canvas></div>
        </div>
        <div className="card">
          <div className="ch">
            <div>
              <div className="ctit">Margin by SKU</div>
              <div className="csub">Gross margin % — sorted by profitability</div>
            </div>
            {onGoChat && (
              <button className="export-btn" onClick={() => onGoChat('Which SKUs have the highest and lowest gross margins? What should I do to improve margins on low-margin products?')}>
                ✨ AI Analyse
              </button>
            )}
          </div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={marginRef}></canvas></div>
        </div>
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div className="ctit">Sales by Day of Week</div><div className="csub">₹ Lakhs avg · Peak day highlighted</div></div>
          <div style={{ height: '180px', position: 'relative' }}><canvas ref={dowRef}></canvas></div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">AI Sales Insights</div><span className="bdg bg">AI Generated</span></div>
          <div className="ilist">
            {[
              ['icg', '★', 'Monday peak day — 38% of weekly revenue', 'Schedule maximum staff and vehicle availability on Mondays. Pre-pick popular SKUs Sunday evening.', 'SCHEDULING · HIGH IMPACT'],
              ['ica', '!', 'Interior firms yield 31% margin vs 19% from contractors', 'Increase marketing spend on interior design segment. Target 5 new interior firms this month.', 'CUSTOMER MIX · MARGIN IMPROVEMENT'],
              ['icr', '!', '8mm Flexi BWP true margin 6.7% — not stated 23.8%', 'Gauri freight ₹110/sh destroys profitability. Reprice or switch supplier.', 'TRUE COST · IMMEDIATE ACTION'],
            ].map(([ic, icon, t, dd, m]) => (
              <div key={t} className="ii"
                style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                onClick={() => onGoChat?.(`Sales insight: ${t}. Background: ${dd} (${m}). Give me a detailed action plan to act on this insight and quantify the revenue or margin impact.`)}>
                <div className={`iic ${ic}`}>{icon}</div>
                <div><div className="iti">{t}</div><div className="ide">{dd}</div><div className="imt">{m}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* ── Sales Leaderboard ── */}
      <div className="gl g55" style={{ marginTop: 12, marginBottom: 12 }}>
        {/* Top customers */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
            <div>
              <div className="ctit">Top Customers This Month</div>
              <div className="csub">Revenue · Margin · Trend</div>
            </div>
            {onGoChat && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => onGoChat('Analyse my top customers this month. Which ones have the highest margin vs highest revenue? Are any top-revenue customers actually low-margin? What actions should I take with each top customer?')}>
                ✨ AI
              </button>
            )}
          </div>
          <table className="tbl tbl-striped">
            <thead>
              <tr>
                <th className={custStc('r')} onClick={() => toggleCustSort('r')}># <span className="sort-ic">{custSic('r')}</span></th>
                <th className={custStc('name')} onClick={() => toggleCustSort('name')}>Customer <span className="sort-ic">{custSic('name')}</span></th>
                <th className={custStc('rev')} onClick={() => toggleCustSort('rev')}>Revenue <span className="sort-ic">{custSic('rev')}</span></th>
                <th className={custStc('margin')} onClick={() => toggleCustSort('margin')}>Margin <span className="sort-ic">{custSic('margin')}</span></th>
                <th className={custStc('orders')} onClick={() => toggleCustSort('orders')}>Orders <span className="sort-ic">{custSic('orders')}</span></th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map(c => (
                <tr key={c.r} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`${c.name} has bought ${c.rev} with ${c.margin} margin and ${c.orders} orders this month. Analyse this customer's account — what should I do to grow revenue and protect this relationship?`)}>
                  <td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', fontSize: 11 }}>{c.r}</span></td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{c.rev}</td>
                  <td><span style={{ color: parseFloat(c.margin) >= 25 ? 'var(--g2)' : parseFloat(c.margin) >= 20 ? 'var(--a2)' : 'var(--r2)', fontWeight: 700 }}>{c.margin}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{c.orders}</td>
                  <td>{c.trend > 0 ? <span style={{ color: 'var(--g2)', fontWeight: 700 }}>▲</span> : <span style={{ color: 'var(--r2)', fontWeight: 700 }}>▼</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Salesperson targets */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
            <div>
              <div className="ctit">Sales Team — MTD Targets vs Actuals</div>
              <div className="csub">Who's on track · Who needs a push</div>
            </div>
            {onGoChat && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => onGoChat('Analyse my sales team performance this month. Who is over-performing, who is behind target? What coaching or resource support should I give to the underperformers to help them close the month strong?')}>
                ✨ AI Coach
              </button>
            )}
          </div>
          <table className="tbl tbl-striped">
            <thead>
              <tr>
                <th className={repStc('name')} onClick={() => toggleRepSort('name')}>Rep <span className="sort-ic">{repSic('name')}</span></th>
                <th className={repStc('target')} onClick={() => toggleRepSort('target')}>Target <span className="sort-ic">{repSic('target')}</span></th>
                <th className={repStc('actual')} onClick={() => toggleRepSort('actual')}>Actual <span className="sort-ic">{repSic('actual')}</span></th>
                <th className={repStc('pct')} onClick={() => toggleRepSort('pct')}>Achievement <span className="sort-ic">{repSic('pct')}</span></th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {repPerf.map(r => (
                <tr key={r.name} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`${r.name} is at ${r.pct}% of target (${r.actual} vs ${r.target} target). What specific actions, customer calls, or product focus should ${r.name} take in the remaining days to close the gap?`)}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{r.target}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.actual}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 60, height: 5, background: 'var(--s4)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, r.pct)}%`, height: '100%', background: r.color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: r.color }}>{r.pct}%</span>
                    </div>
                  </td>
                  <td><span style={{ fontSize: 11, fontWeight: 600, color: r.color }}>{r.act}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which products and customer segments are driving the most margin? Where am I losing margin through discounts and what should I change?')}>
          <span>✨</span>
          <span>Ask AI: Margin improvement analysis — where am I losing money and how to fix it →</span>
        </div>
      )}
    </div>
  );
}
