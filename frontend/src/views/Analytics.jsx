import React, { useState, useEffect, useRef } from 'react';
import { baseOpts, scaleXY, createChart, gradientFill } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';

const fmtL   = (n) => { const v = Number(n); return v >= 100000 ? `₹${(v/100000).toFixed(2)}L` : `₹${v}`; };
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

function TrendArrow({ pct }) {
  if (pct > 0) return <span style={{ color: 'var(--g2)', fontSize: 11, fontWeight: 700 }}>▲ {fmtPct(pct)}</span>;
  if (pct < 0) return <span style={{ color: 'var(--r2)', fontSize: 11, fontWeight: 700 }}>▼ {fmtPct(Math.abs(pct))}</span>;
  return <span style={{ color: 'var(--text3)', fontSize: 11 }}>→ flat</span>;
}

const CTYPE_COLORS = { Developer: '#0f766e', Contractor: '#2563eb', 'Interior Firm': '#d97706', Architect: '#7c3aed', Retailer: '#9ca3af' };
const SUP_STATUS   = { preferred: 'bg', good: 'bb', review: 'br' };

export default function Analytics({ onGoChat, dbStatus }) {
  const [d, setD]             = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('overview');
  const revRef  = useRef(null);
  const catRef  = useRef(null);
  const custRef = useRef(null);
  const margRef = useRef(null);

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!d || tab !== 'overview') return;
    const destroy = [];

    if (revRef.current) {
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
            y:  { type: 'linear', position: 'left',  ticks: { callback: v => '₹' + v + 'L', color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' } }, grid: { color: '#e2e6ec' } },
            y2: { type: 'linear', position: 'right', ticks: { callback: v => v + '%',        color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' } }, grid: { drawOnChartArea: false } },
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

      {/* ── Tab bar ── */}
      <div className="vtabs">
        {[['overview','Overview'],['products','Products'],['customers','Customers'],['suppliers','Suppliers']].map(([id, label]) => (
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
            </div>
            <table className="tbl">
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
            </div>
            <table className="tbl">
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
            </div>
            <table className="tbl">
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
            </div>
            <table className="tbl">
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

    </div>
  );
}
