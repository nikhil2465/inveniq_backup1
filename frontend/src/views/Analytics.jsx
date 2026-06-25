import React, { useState, useEffect, useRef, useCallback } from 'react';
import { baseOpts, scaleXY, createChart, gradientFill, axisColors } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';

const fmtL   = (n) => { const v = Number(n); return v >= 100000 ? `₹${(v/100000).toFixed(2)}L` : `₹${v}`; };
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

function TrendArrow({ pct }) {
  if (pct > 0) return <span style={{ color: 'var(--g2)', fontSize: 11, fontWeight: 700 }}>▲ {fmtPct(pct)}</span>;
  if (pct < 0) return <span style={{ color: 'var(--r2)', fontSize: 11, fontWeight: 700 }}>▼ {fmtPct(Math.abs(pct))}</span>;
  return <span style={{ color: 'var(--text3)', fontSize: 11 }}>→ flat</span>;
}

const CTYPE_COLORS = { Developer: '#0f766e', Contractor: '#2563eb', 'Interior Firm': '#d97706', Architect: '#7c3aed', Retailer: '#9ca3af' };
const SUP_STATUS   = { preferred: 'bg', good: 'bb', review: 'br' };

const STATIC_COHORTS = [
  { cohort: 'Jan 2026', size: 14, rev_L: [2.1, 1.6, 1.3, 1.1, 0.9, 0.8] },
  { cohort: 'Feb 2026', size: 11, rev_L: [1.6, 1.2, 1.0, 0.8, 0.7, null] },
  { cohort: 'Mar 2026', size: 18, rev_L: [2.7, 2.2, 1.8, 1.5, null, null] },
  { cohort: 'Apr 2026', size: 9,  rev_L: [1.3, 1.0, 0.8, null, null, null] },
  { cohort: 'May 2026', size: 13, rev_L: [2.0, 1.5, null, null, null, null] },
  { cohort: 'Jun 2026', size: 16, rev_L: [2.4, null, null, null, null, null] },
];

const STATIC_COHORT_RET = [
  { cohort: 'Jan 2026', size: 14, ret: [100, 78, 64, 57, 50, 43] },
  { cohort: 'Feb 2026', size: 11, ret: [100, 73, 61, 54, 46, null] },
  { cohort: 'Mar 2026', size: 18, ret: [100, 82, 70, 59, null, null] },
  { cohort: 'Apr 2026', size: 9,  ret: [100, 75, 64, null, null, null] },
  { cohort: 'May 2026', size: 13, ret: [100, 78, null, null, null, null] },
  { cohort: 'Jun 2026', size: 16, ret: [100, null, null, null, null, null] },
];

const STATIC_BASKET = [
  { product_a: 'HPL Sheet 1mm',     product_b: 'Edge Band PVC',       support: 42, confidence: 78, lift: 2.3, orders: 38 },
  { product_a: 'Gypsum Board',      product_b: 'Grid Runner System',  support: 38, confidence: 82, lift: 2.6, orders: 35 },
  { product_a: 'Aluminium Section', product_b: 'Glass Panel 8mm',     support: 31, confidence: 65, lift: 1.9, orders: 28 },
  { product_a: 'PVC Foam Board',    product_b: 'HPL Sheet 1mm',       support: 28, confidence: 61, lift: 1.7, orders: 25 },
  { product_a: 'WPC Door Frame',    product_b: 'Door Hinge SS',       support: 25, confidence: 72, lift: 2.1, orders: 23 },
  { product_a: 'Acrylic Sheet 3mm', product_b: 'LED Strip Profile',   support: 22, confidence: 58, lift: 1.6, orders: 20 },
];

function retColor(pct) {
  if (pct >= 80) return { bg: '#15803d1a', color: '#15803d', fw: 700 };
  if (pct >= 60) return { bg: '#0f766e1a', color: '#0f766e', fw: 600 };
  if (pct >= 40) return { bg: '#d977061a', color: '#d97706', fw: 600 };
  return { bg: '#dc26261a', color: '#dc2626', fw: 600 };
}

export default function Analytics({ onGoChat, dbStatus, period = 'MTD' }) {
  const [d, setD]             = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('overview');
  const revRef  = useRef(null);
  const catRef  = useRef(null);
  const custRef = useRef(null);
  const margRef = useRef(null);
  const cohRef  = useRef(null);

  const fetchData = useCallback(() => {
    fetch(`/api/analytics?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  useEffect(() => {
    if (!d || tab !== 'overview') return;
    const destroy = [];

    if (revRef.current) {
      const ac = axisColors();
      destroy.push(createChart(revRef, {
        type: 'line',
        data: {
          labels: d.revenue_labels,
          datasets: [
            { label: 'Revenue (₹L)', data: d.revenue_data, borderColor: '#0f766e', backgroundColor: gradientFill('#0f766e'), borderWidth: 2.5, tension: .4, fill: true, pointRadius: 3, yAxisID: 'y' },
            { label: 'Target',       data: d.revenue_data.map(v => +(v * 1.08).toFixed(1)), borderColor: '#d97706', borderWidth: 1.5, borderDash: [5,4], tension: .4, pointRadius: 0, yAxisID: 'y' },
            { label: 'Margin %',     data: d.margin_data,  borderColor: '#2563eb', borderWidth: 2, tension: .4, pointRadius: 2, yAxisID: 'y2' },
          ],
        },
        options: {
          ...baseOpts(),
          scales: {
            x: scaleXY().x,
            y:  { type: 'linear', position: 'left',  ticks: { callback: v => '₹' + v + 'L', color: ac.tick, font: { size: 9, family: 'JetBrains Mono' } }, grid: { color: ac.grid } },
            y2: { type: 'linear', position: 'right', ticks: { callback: v => v + '%',        color: ac.tick, font: { size: 9, family: 'JetBrains Mono' } }, grid: { drawOnChartArea: false } },
          },
        },
      }));
    }

    if (catRef.current) {
      const cats   = (d.category_revenue || []).map(c => c.category.replace('High Pressure Laminate','HPL').replace('Aluminium Composite Panel','ACP'));
      const revs   = (d.category_revenue || []).map(c => c.revenue_L);
      const colors = ['#0f766e','#2563eb','#d97706','#9333ea','#ea580c','#06b6d4','#84cc16','#9ca3af'];
      destroy.push(createChart(catRef, {
        type: 'bar',
        data: { labels: cats, datasets: [{ data: revs, backgroundColor: colors.map(c => c + 'CC'), borderColor: colors, borderWidth: 1.5, borderRadius: 4 }] },
        options: baseOpts({ scales: scaleXY(v => '₹' + v + 'L'), plugins: { legend: { display: false } } }),
      }));
    }

    if (custRef.current) {
      const types  = (d.customer_type_breakdown || []).map(c => c.type);
      const shares = (d.customer_type_breakdown || []).map(c => c.share_pct);
      destroy.push(createChart(custRef, {
        type: 'doughnut',
        data: { labels: types, datasets: [{ data: shares, backgroundColor: types.map(t => CTYPE_COLORS[t] || '#9ca3af'), borderWidth: 0, hoverOffset: 8 }] },
        options: baseOpts({ cutout: '70%' }),
      }));
    }

    if (margRef.current) {
      const prods   = (d.top_products || []).slice(0, 6).map(p => p.name.split('(')[0].trim().slice(0, 20));
      const margins = (d.top_products || []).slice(0, 6).map(p => p.margin_pct);
      const mcolors = margins.map(m => m >= 25 ? '#15803d' : m >= 18 ? '#d97706' : '#dc2626');
      destroy.push(createChart(margRef, {
        type: 'bar',
        data: { labels: prods, datasets: [{ data: margins, backgroundColor: mcolors.map(c => c + 'CC'), borderColor: mcolors, borderWidth: 1.5, borderRadius: 4 }] },
        options: { ...baseOpts({ plugins: { legend: { display: false } } }), indexAxis: 'y', scales: { x: { ticks: { callback: v => v + '%' } } } },
      }));
    }

    return () => destroy.forEach(fn => fn && fn());
  }, [d, tab]);

  useEffect(() => {
    if (!cohRef.current || tab !== 'cohort') return;
    const ac = axisColors();
    const labels = ['M+0', 'M+1', 'M+2', 'M+3', 'M+4', 'M+5'];
    const colors = ['#0f766e', '#2563eb', '#d97706', '#9333ea', '#ea580c', '#06b6d4'];
    const datasets = STATIC_COHORTS.map((c, i) => ({
      label: c.cohort,
      data: c.rev_L,
      backgroundColor: colors[i] + 'AA',
      borderColor: colors[i],
      borderWidth: 1.5,
      borderRadius: 4,
      skipNull: true,
    }));
    const destroy = createChart(cohRef, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        ...baseOpts(),
        scales: {
          x: scaleXY().x,
          y: { ticks: { callback: v => '₹' + v + 'L', color: ac.tick, font: { size: 9, family: 'JetBrains Mono' } }, grid: { color: ac.grid } },
        },
      },
    });
    return () => destroy && destroy();
  }, [tab]);

  if (loading) return <PageLoader />;

  const kpis = d?.kpis || {};

  return (
    <div className="view">

      {/* ── Page header ── */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Analytics & Business Intelligence</div>
          <div className="psub">Revenue, margin, customer & supplier performance — full business view · <DataSourceBadge source={d?.data_source} /></div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me a full business health analysis — revenue trends, margin risks, top customers, and biggest opportunities this month.')}>
              ✨ AI Business Brief
            </button>
          )}
        </div>
      </div>

      {/* ── KPI row 1 ── */}
      <div className="kg g4">
        {[
          { cls: 'sg', l: 'Revenue MTD',    v: `₹${kpis.revenue_mtd_L}L`,            d: `▲ ${fmtPct(kpis.achievement_pct)} of target`,  dc: 'up', s: `YTD ₹${kpis.revenue_ytd_L}L`,  q: `My revenue MTD is ₹${kpis.revenue_mtd_L}L — ${fmtPct(kpis.achievement_pct)} of target, YTD ₹${kpis.revenue_ytd_L}L. Analyse my revenue trend, identify growth drivers and risks, and tell me what I should do this month to hit target.` },
          { cls: 'sg', l: 'Gross Margin',   v: fmtPct(kpis.gross_margin_pct),         d: `Target ${fmtPct(kpis.margin_target_pct)}`,      dc: kpis.gross_margin_pct >= kpis.margin_target_pct ? 'up' : 'dn', s: 'HPL & Louvers leading', q: `My gross margin is ${fmtPct(kpis.gross_margin_pct)} vs target ${fmtPct(kpis.margin_target_pct)}. Which product categories and customers are dragging my margin down? What can I do to improve it?` },
          { cls: 'sb', l: 'Orders MTD',     v: kpis.orders_mtd,                       d: `Avg ₹${(kpis.avg_order_value_L*100).toFixed(0)}K / order`, dc: 'up', s: `${kpis.new_customers_mtd} new customers`, q: `I have ${kpis.orders_mtd} orders this month, avg ₹${(kpis.avg_order_value_L*100).toFixed(0)}K each, with ${kpis.new_customers_mtd} new customers. How is my order volume trending and how can I increase average order value?` },
          { cls: 'st', l: 'Stock Turnover', v: `${kpis.stock_turnover_x}×`,           d: `Inv ₹${kpis.inventory_value_L}L`,               dc: 'fl', s: 'Target: >5×', q: `My stock turnover is ${kpis.stock_turnover_x}× with ₹${kpis.inventory_value_L}L in inventory. The target is >5×. How can I improve inventory efficiency and which SKUs are tying up the most capital?` },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }} onClick={() => onGoChat?.(k.q)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className={`kd ${k.dc}`}>{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── KPI row 2 ── */}
      <div className="kg g4">
        {[
          { cls: 'sa', l: 'Dead Stock',      v: fmtL(kpis.dead_stock_L * 100000),             d: 'Recover immediately',                                     dc: 'dn', s: 'Ageing 90+ days',     q: `My dead stock is ${fmtL(kpis.dead_stock_L * 100000)} — items ageing 90+ days. Which products are stuck, and what's the best liquidation strategy to recover cash?` },
          { cls: 'sp', l: 'Quote Win Rate',  v: fmtPct(kpis.quote_win_rate_pct),              d: `Pipeline ₹${kpis.quotes_pipeline_L}L`,                    dc: 'fl', s: 'Industry avg: 35–45%', q: `My quote win rate is ${fmtPct(kpis.quote_win_rate_pct)} with ₹${kpis.quotes_pipeline_L}L in pipeline. Industry avg is 35–45%. What's causing quote losses and how can I improve my conversion rate?` },
          { cls: 'sr', l: 'Receivables',     v: fmtL(kpis.outstanding_receivable_L * 100000), d: `Overdue ₹${kpis.overdue_L}L`,                             dc: 'dn', s: 'Follow up this week', q: `My outstanding receivables are ${fmtL(kpis.outstanding_receivable_L * 100000)} with ₹${kpis.overdue_L}L overdue. Which customers owe the most and what collection actions should I take this week?` },
          { cls: 'so', l: 'Working Capital', v: `${kpis.working_capital_days}d`,               d: kpis.working_capital_days > 40 ? '▼ Above 40d target' : '▲ Within target', dc: kpis.working_capital_days > 40 ? 'dn' : 'up', s: 'DIO + DSO − DPO', q: `My working capital cycle is ${kpis.working_capital_days} days (DIO + DSO − DPO). Target is <40 days. How can I compress this cycle — which levers should I pull first?` },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }} onClick={() => onGoChat?.(k.q)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className={`kd ${k.dc}`}>{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── AI Analytics Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '📊', text: `Revenue at ${fmtPct(kpis.achievement_pct ?? 88)} of target — what's driving the gap`, q: `My revenue achievement is ${fmtPct(kpis.achievement_pct ?? 88)} of target this month. Analyse what is causing the gap — is it volume, pricing, customer mix, or product mix? Give me 3 specific actions to close the gap this month.` },
            { icon: '📉', text: `Working capital at ${kpis.working_capital_days ?? 48}d — compress below 40 days`,    q: `My working capital cycle is ${kpis.working_capital_days ?? 48} days, target is <40 days. Which of the three levers — Days Inventory Outstanding (DIO), Days Sales Outstanding (DSO), Days Payable Outstanding (DPO) — should I attack first and what specific actions reduce each?` },
            { icon: '🏆', text: 'Win rate vs industry avg — what my quote loss patterns reveal',                q: `My quote win rate is ${fmtPct(kpis.quote_win_rate_pct ?? 38)} vs industry average of 35–45%. Analyse the likely loss reasons — is it pricing, speed, product match, or follow-up? What are the top 3 things I should change in my quoting process?` },
            { icon: '👥', text: 'Customer type mix — rebalance toward highest-margin segments',                 q: 'Analyse my customer type revenue mix. Which segments (Contractors, Interior Firms, Developers, Retailers, Architects) give the best margin and volume combination? How should I shift my sales effort allocation?' },
            { icon: '🔄', text: `Stock turnover at ${kpis.stock_turnover_x ?? '4.2'}× — identify capital inefficiency`,  q: `My stock turnover is ${kpis.stock_turnover_x ?? '4.2'}× against a target of 5×. Which specific SKUs are tying up the most capital with the slowest turns? How much capital can I free up if I hit the 5× target?` },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="vtabs">
        {[['overview','Overview'],['products','Products'],['customers','Customers'],['suppliers','Suppliers'],['cohort','Cohort & Basket']].map(([id, label]) => (
          <button key={id} className={`vtab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div>
          <div className="gl g57" style={{ marginBottom: 12 }}>
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">Revenue & Margin Trend — 12 months</div>
                  <div className="csub">Revenue (₹L) vs target · Right axis: Gross Margin %</div>
                </div>
              </div>
              <div style={{ height: 210, position: 'relative' }}><canvas ref={revRef} /></div>
            </div>
            <div className="card">
              <div className="ch"><div><div className="ctit">Customer Type Mix</div><div className="csub">Revenue share by segment</div></div></div>
              <div style={{ height: 160, position: 'relative' }}><canvas ref={custRef} /></div>
              <div style={{ marginTop: 12 }}>
                {(d?.customer_type_breakdown || []).map(c => (
                  <div key={c.type} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: CTYPE_COLORS[c.type], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text2)' }}>{c.type}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>₹{c.revenue_L}L</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: c.avg_margin_pct >= 20 ? 'var(--g2)' : 'var(--a2)', minWidth: 42, textAlign: 'right' }}>{fmtPct(c.avg_margin_pct)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="gl g55" style={{ marginBottom: 12 }}>
            <div className="card">
              <div className="ch"><div><div className="ctit">Revenue by Category (MTD)</div><div className="csub">₹L per category this month</div></div></div>
              <div style={{ height: 200, position: 'relative' }}><canvas ref={catRef} /></div>
            </div>
            <div className="card">
              <div className="ch"><div><div className="ctit">Margin by Product (Top 6)</div><div className="csub">Green ≥25% · Amber ≥18% · Red below</div></div></div>
              <div style={{ height: 200, position: 'relative' }}><canvas ref={margRef} /></div>
            </div>
          </div>

          {onGoChat && (
            <div className="ai-cta-bar" onClick={() => onGoChat('Give me a full business analysis — revenue trends, margin by category, customer health, and top opportunities this month.')}>
              ✨ Ask AI: Full business analytics brief →
            </div>
          )}
        </div>
      )}

      {/* ── Products tab ── */}
      {tab === 'products' && (
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
              <div className="ctit">Top Products by Margin Contribution (MTD)</div>
              <ExportButton rows={d?.top_products || []} filename="top_products_margin" columns={[
                { key: 'rank', label: 'Rank' }, { key: 'name', label: 'Product' },
                { key: 'category', label: 'Category' }, { key: 'revenue_L', label: 'Revenue (L)' },
                { key: 'margin_L', label: 'Margin (L)' }, { key: 'margin_pct', label: 'Margin %' },
                { key: 'units_sold', label: 'Units Sold' }, { key: 'trend_pct', label: 'YoY %' },
              ]} />
            </div>
            <table className="tbl tbl-striped">
              <thead>
                <tr><th>#</th><th>Product</th><th>Category</th><th>Revenue</th><th>Margin ₹</th><th>Margin %</th><th>Units Sold</th><th>YoY Growth</th></tr>
              </thead>
              <tbody>
                {(d?.top_products || []).map(p => (
                  <tr key={p.rank}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', fontSize: 11 }}>{p.rank}</span></td>
                    <td><div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div></td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.category}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>₹{p.revenue_L}L</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>₹{p.margin_L}L</td>
                    <td><span style={{ fontWeight: 700, color: p.margin_pct >= 25 ? 'var(--g2)' : p.margin_pct >= 18 ? 'var(--a2)' : 'var(--r2)' }}>{fmtPct(p.margin_pct)}</span></td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{p.units_sold} {p.unit}</td>
                    <td><TrendArrow pct={p.trend_pct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
              <div className="ctit">Category Performance (MTD)</div>
              <ExportButton rows={d?.category_revenue || []} filename="category_performance" columns={[
                { key: 'category', label: 'Category' }, { key: 'revenue_L', label: 'Revenue (L)' },
                { key: 'orders', label: 'Orders' }, { key: 'margin_pct', label: 'Avg Margin %' },
                { key: 'yoy_growth', label: 'YoY Growth %' },
              ]} />
            </div>
            <table className="tbl tbl-striped">
              <thead>
                <tr><th>Category</th><th>Revenue</th><th>Orders</th><th>Avg Margin</th><th>YoY Growth</th></tr>
              </thead>
              <tbody>
                {(d?.category_revenue || []).map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.category}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>₹{c.revenue_L}L</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{c.orders}</td>
                    <td><span style={{ color: c.margin_pct >= 20 ? 'var(--g2)' : 'var(--a2)', fontWeight: 600 }}>{fmtPct(c.margin_pct)}</span></td>
                    <td><TrendArrow pct={c.yoy_growth} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Customers tab ── */}
      {tab === 'customers' && (
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
              <div className="ctit">Top Customers by Revenue (MTD)</div>
              <ExportButton rows={d?.top_customers || []} filename="top_customers_revenue" columns={[
                { key: 'rank', label: 'Rank' }, { key: 'name', label: 'Customer' },
                { key: 'type', label: 'Type' }, { key: 'revenue_L', label: 'Revenue (L)' },
                { key: 'orders', label: 'Orders' }, { key: 'margin_pct', label: 'Margin %' },
                { key: 'outstanding_L', label: 'Outstanding (L)' }, { key: 'yoy_growth', label: 'YoY %' },
                { key: 'status', label: 'Status' },
              ]} />
            </div>
            <table className="tbl tbl-striped">
              <thead>
                <tr><th>#</th><th>Customer</th><th>Type</th><th>Revenue</th><th>Orders</th><th>Avg Order</th><th>Margin</th><th>Outstanding</th><th>YoY</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(d?.top_customers || []).map(c => (
                  <tr key={c.rank}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', fontSize: 11 }}>{c.rank}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Last order: {c.last_order_days}d ago</div>
                    </td>
                    <td><span style={{ background: CTYPE_COLORS[c.type] + '22', color: CTYPE_COLORS[c.type], borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{c.type}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>₹{c.revenue_L}L</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{c.orders}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>₹{(c.avg_order_L * 100).toFixed(0)}K</td>
                    <td><span style={{ color: c.margin_pct >= 20 ? 'var(--g2)' : 'var(--a2)', fontWeight: 600 }}>{fmtPct(c.margin_pct)}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', color: c.outstanding_L > 1 ? 'var(--a2)' : 'inherit', fontWeight: 600 }}>₹{c.outstanding_L}L</td>
                    <td><TrendArrow pct={c.yoy_growth} /></td>
                    <td><span className={`bdg ${c.status === 'healthy' ? 'bg' : c.status === 'watch' ? 'bt' : 'br'}`}>{c.status === 'healthy' ? '✓ Healthy' : c.status === 'watch' ? '⚠ Watch' : '🚨 Risk'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {onGoChat && (
            <div className="ai-cta-bar" onClick={() => onGoChat('Which customers are at risk of churning? Who should I call this week to protect revenue?')}>
              ✨ Ask AI: Customer churn risk analysis →
            </div>
          )}
        </div>
      )}

      {/* ── Suppliers tab ── */}
      {tab === 'suppliers' && (
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
              <div className="ctit">Supplier Performance Scorecard</div>
              <ExportButton rows={d?.supplier_performance || []} filename="supplier_performance" columns={[
                { key: 'name', label: 'Supplier' }, { key: 'category', label: 'Category' },
                { key: 'orders', label: 'Orders' }, { key: 'value_L', label: 'Value (L)' },
                { key: 'ontime_pct', label: 'On-Time %' }, { key: 'price_vs_market', label: 'Price vs Mkt %' },
                { key: 'quality_score', label: 'Quality Score' }, { key: 'overall_rating', label: 'Rating' },
              ]} />
            </div>
            <table className="tbl tbl-striped">
              <thead>
                <tr><th>Supplier</th><th>Category</th><th>Orders</th><th>Value</th><th>On-Time %</th><th>Price vs Mkt</th><th>Quality</th><th>Rating</th></tr>
              </thead>
              <tbody>
                {(d?.supplier_performance || []).map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{s.category}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{s.orders}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>₹{s.value_L}L</td>
                    <td>
                      <div className="sbar">
                        <div className="str"><div className="sf2" style={{ width: `${s.ontime_pct}%`, background: s.ontime_pct >= 90 ? 'var(--g2)' : s.ontime_pct >= 80 ? 'var(--a2)' : 'var(--r2)' }} /></div>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 12 }}>{s.ontime_pct}%</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: s.price_vs_market < 0 ? 'var(--g2)' : s.price_vs_market > 5 ? 'var(--r2)' : 'var(--a2)', fontWeight: 600 }}>
                        {s.price_vs_market > 0 ? '+' : ''}{s.price_vs_market}%
                      </span>
                    </td>
                    <td><span style={{ color: s.quality_score >= 90 ? 'var(--g2)' : s.quality_score >= 80 ? 'var(--a2)' : 'var(--r2)', fontWeight: 600 }}>{s.quality_score}/100</span></td>
                    <td><span className={`bdg ${SUP_STATUS[s.status] || 'ba'}`}>{s.status.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {onGoChat && (
            <div className="ai-cta-bar" onClick={() => onGoChat('Which suppliers need immediate review? Who is costing me the most in late deliveries and price premium?')}>
              ✨ Ask AI: Supplier risk analysis →
            </div>
          )}
        </div>
      )}

      {/* ── Cohort & Basket tab ── */}
      {tab === 'cohort' && (
        <div>

          {/* Cohort Revenue chart */}
          <div className="gl g55" style={{ marginBottom: 12 }}>
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">Revenue by Acquisition Cohort</div>
                  <div className="csub">₹L earned per month after first purchase (M+0 = acquisition month)</div>
                </div>
                {onGoChat && (
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => onGoChat('Analyse my customer cohort revenue curves. Which cohorts are the most valuable over time? What does the drop-off pattern tell me about my retention strategy and where should I invest to improve LTV?')}>
                    ✨ AI Insight
                  </button>
                )}
              </div>
              <div style={{ height: 210, position: 'relative' }}><canvas ref={cohRef} /></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {STATIC_COHORTS.map((c, i) => {
                  const clrs = ['#0f766e','#2563eb','#d97706','#9333ea','#ea580c','#06b6d4'];
                  const totalL = c.rev_L.filter(Boolean).reduce((a, b) => a + b, 0);
                  return (
                    <div key={c.cohort} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: 'var(--s4)', borderRadius: 4, padding: '3px 8px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: clrs[i], flexShrink: 0 }} />
                      <span style={{ color: 'var(--text2)' }}>{c.cohort}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', marginLeft: 3 }}>₹{totalL.toFixed(1)}L</span>
                      <span style={{ color: 'var(--text3)', fontSize: 10 }}>· {c.size} cust</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cohort health KPIs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { l: 'Avg M+3 Retention', v: '57%', sub: 'Across Jan–Mar cohorts', color: 'var(--g2)', q: 'My average M+3 customer retention is 57%. What is a good benchmark for building materials B2B? What specific actions — loyalty programs, account reviews, proactive outreach — would most improve this?' },
                { l: 'Best Cohort LTV',   v: '₹2.2L/cust', sub: 'Mar 2026 (18 customers)', color: 'var(--b2)', q: 'My March 2026 cohort has the highest LTV at ₹2.2L per customer over 4 months. What characterises this cohort — what did I do differently in March that made them more valuable? How do I replicate it?' },
                { l: 'Churn Risk Window', v: 'M+1 to M+2', sub: 'Biggest retention drop', color: 'var(--a2)', q: 'The biggest customer churn happens between M+1 and M+2 in my cohort data. What interventions at the M+1 mark (30-day check-in, special offer, account review) would most effectively prevent churn? Give me a concrete 30-day playbook.' },
                { l: 'Cohort Rev MTD',    v: '₹8.1L', sub: 'All 6 cohorts combined', color: 'var(--purple)', q: 'My combined cohort revenue this month is ₹8.1L from 6 acquisition cohorts. How should I think about cohort-based revenue forecasting for the next 3 months? What acquisition rate do I need to hit my target?' },
              ].map(k => (
                <div key={k.l} className="card" style={{ padding: '10px 14px', cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(k.q)}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{k.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: k.color }}>{k.v}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Retention heatmap */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
              <div>
                <div className="ctit">Customer Retention Heatmap</div>
                <div className="csub">% of customers from each cohort still active N months later</div>
              </div>
              {onGoChat && (
                <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => onGoChat('My customer retention heatmap shows a typical drop from 100% at M+0 to around 43–50% by M+5. Is this healthy for a B2B building materials distributor? What are the 3 highest-ROI initiatives to improve retention from M+1 onwards?')}>
                  ✨ AI Analysis
                </button>
              )}
            </div>
            <div style={{ overflowX: 'auto', padding: '14px 15px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text3)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>Cohort</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>Size</th>
                    {['M+0','M+1','M+2','M+3','M+4','M+5'].map(m => (
                      <th key={m} style={{ textAlign: 'center', padding: '6px 12px', color: 'var(--text3)', fontWeight: 600, fontSize: 11 }}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STATIC_COHORT_RET.map((row, ri) => (
                    <tr key={row.cohort} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text)', fontSize: 12, whiteSpace: 'nowrap' }}>{row.cohort}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text2)', fontSize: 11 }}>{row.size}</td>
                      {row.ret.map((pct, mi) => {
                        if (pct === null) return <td key={mi} style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--border)', fontSize: 11 }}>—</td>;
                        const { bg, color, fw } = retColor(pct);
                        return (
                          <td key={mi} style={{ padding: '8px 12px', textAlign: 'center', background: bg, borderRadius: 4 }}>
                            <span style={{ color, fontWeight: fw, fontSize: 12 }}>{pct}%</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: 'var(--text2)' }}>
                {[['#15803d','≥80% Excellent'],['#0f766e','60–79% Good'],['#d97706','40–59% Watch'],['#dc2626','<40% At Risk']].map(([c, l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: c + '33', border: `1px solid ${c}`, flexShrink: 0 }} />
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Market basket analysis */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
              <div>
                <div className="ctit">Market Basket Analysis — Frequently Bought Together</div>
                <div className="csub">Product pairs with high co-purchase frequency · Lift &gt;1 = products bought together more than by chance</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ExportButton rows={STATIC_BASKET} filename="market_basket" columns={[
                  { key: 'product_a', label: 'Product A' }, { key: 'product_b', label: 'Product B' },
                  { key: 'support', label: 'Support %' }, { key: 'confidence', label: 'Confidence %' },
                  { key: 'lift', label: 'Lift' }, { key: 'orders', label: 'Co-Orders' },
                ]} />
                {onGoChat && (
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => onGoChat('Based on my market basket analysis, which product pairs should I bundle for promotions? How can I use this co-purchase data to increase average order value through cross-selling and bundle pricing strategies?')}>
                    ✨ Bundle Strategy
                  </button>
                )}
              </div>
            </div>
            <table className="tbl tbl-striped">
              <thead>
                <tr>
                  <th>Product A</th>
                  <th>→ Often with</th>
                  <th>Support</th>
                  <th>Confidence</th>
                  <th>Lift</th>
                  <th>Co-Orders</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {STATIC_BASKET.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{row.product_a}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{row.product_b}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 50, height: 5, borderRadius: 3, background: 'var(--s4)', overflow: 'hidden' }}>
                          <div style={{ width: `${row.support}%`, height: '100%', background: 'var(--blue)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{row.support}%</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: row.confidence >= 70 ? 'var(--g2)' : row.confidence >= 60 ? 'var(--a2)' : 'var(--text)' }}>
                        {row.confidence}%
                      </span>
                    </td>
                    <td>
                      <span style={{
                        background: row.lift >= 2.0 ? '#15803d1a' : row.lift >= 1.7 ? '#d977061a' : '#9ca3af1a',
                        color: row.lift >= 2.0 ? '#15803d' : row.lift >= 1.7 ? '#d97706' : '#6b7280',
                        fontFamily: 'var(--mono)', fontWeight: 700, borderRadius: 4, padding: '2px 7px', fontSize: 12,
                      }}>{row.lift}×</span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{row.orders}</td>
                    <td>
                      {onGoChat && (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => onGoChat(`Customers who buy "${row.product_a}" also buy "${row.product_b}" with ${row.confidence}% confidence and a lift of ${row.lift}×. Design a bundle promotion strategy — what discount structure, packaging, and sales pitch would work best to increase combined sales?`)}>
                          Bundle
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI insights strip for cohort tab */}
          {onGoChat && (
            <div className="ai-opp-strip">
              <span className="ai-opp-label">Cohort AI</span>
              {[
                { icon: '📊', text: 'Which cohort has the highest 6-month LTV — replicate the conditions', q: 'Analyse my customer cohort LTV data. Which acquisition cohort has the highest 6-month lifetime value? What were the market conditions, products sold, and sales behaviors in that month that drove higher LTV? Give me a plan to replicate those conditions.' },
                { icon: '🔄', text: 'M+1 churn spike — design a 30-day retention campaign', q: 'My cohort data shows the biggest customer drop-off happens between M+0 and M+1. Design a concrete 30-day post-acquisition retention campaign: what to communicate, when, through which channel, and what offer to make to maximize the chance of a second purchase.' },
                { icon: '🛒', text: 'HPL + Edge Band bundle — pricing and margin impact', q: 'HPL Sheet and Edge Band PVC are bought together in 78% of HPL purchases (lift 2.3×). Design a bundle pricing strategy: what discount to offer, whether to create a SKU bundle, how to train sales staff to cross-sell, and the expected margin impact at different discount levels.' },
                { icon: '🏷️', text: 'Top 3 bundle opportunities to increase avg order value', q: 'From my market basket analysis, identify the top 3 product bundle opportunities with the highest potential to increase average order value. For each, give me: the bundle composition, recommended pricing, expected AOV lift, and the sales pitch.' },
                { icon: '📈', text: 'Forecast next 3 months revenue from existing cohorts', q: 'Using my cohort retention curves (M+1=~75%, M+2=~64%, M+3=~56%), forecast the expected revenue from my existing customer base for the next 3 months. How much new customer acquisition revenue do I need to hit my growth targets?' },
              ].map((o, i) => (
                <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
                  <span>{o.icon}</span>
                  <span>{o.text}</span>
                  <span className="ai-opp-chip-arrow">→</span>
                </button>
              ))}
            </div>
          )}

          {onGoChat && (
            <div className="ai-cta-bar" onClick={() => onGoChat('Give me a full cohort health report: which customer segments have the best retention, which product bundles drive repeat purchases, and what are my top 3 actions to improve LTV this quarter?')}>
              ✨ Ask AI: Full cohort & LTV health report →
            </div>
          )}
        </div>
      )}

    </div>
  );
}
