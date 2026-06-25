import React, { useState, useEffect, useRef, useCallback } from 'react';
import { baseOpts, scaleXY, createChart, axisColors } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const VERDICT_CLS = { PREFERRED: 'bg', GOOD: 'bb', REVIEW: 'br', AVOID: 'br' };

const STATIC_SPEND_CAT = [
  { category: 'Plywood & BWP',     spend_L: 8.4, prev_L: 7.9, pct_total: 38 },
  { category: 'Laminates (HPL)',   spend_L: 5.2, prev_L: 4.8, pct_total: 24 },
  { category: 'Aluminium Profiles',spend_L: 3.1, prev_L: 3.3, pct_total: 14 },
  { category: 'Hardware',          spend_L: 1.8, prev_L: 1.6, pct_total: 8  },
  { category: 'Edge Bands',        spend_L: 2.0, prev_L: 1.7, pct_total: 9  },
  { category: 'Glass Panels',      spend_L: 1.6, prev_L: 1.5, pct_total: 7  },
];

const STATIC_PRICE_VAR = [
  { sku: 'BWP 19mm 8×4',       supplier: 'Century Plyboards',   my_price: 1240, market_rate: 1280, variance_pct: -3.1 },
  { sku: 'HPL 1mm Suede',      supplier: 'Greenply Industries', my_price: 68,   market_rate: 67,   variance_pct: 1.5  },
  { sku: '8mm Flexi BWP',      supplier: 'Gauri Laminates',     my_price: 890,  market_rate: 840,  variance_pct: 5.9  },
  { sku: 'Alum Extrusion 6m',  supplier: 'National Aluminium',  my_price: 425,  market_rate: 410,  variance_pct: 3.7  },
  { sku: 'Edge Band PVC 22mm', supplier: 'Henkel Adhesives',    my_price: 22,   market_rate: 24,   variance_pct: -8.3 },
  { sku: 'Glass 8mm Toughened',supplier: 'Saint Gobain Dist',   my_price: 320,  market_rate: 315,  variance_pct: 1.6  },
];

const SPEND_COLORS = ['#0f766e','#2563eb','#d97706','#9333ea','#ea580c','#06b6d4'];
const LT_MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun'];
const LT_DATA     = {
  'Century Plyboards':   [6.0, 5.5, 5.8, 5.4, 5.1, 5.5],
  'Greenply Industries': [7.2, 6.8, 7.5, 7.0, 8.1, 7.0],
  'Gauri Laminates':     [9.5,10.2,11.0,10.5,12.0,10.8],
};
const LT_COLORS = ['#0f766e','#2563eb','#dc2626'];

export default function Procurement({ onGoChat, period = 'MTD' }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pvSort, setPvSort] = useState({ field: 'variance_pct', dir: 'desc' });
  const spendRef = useRef(null);
  const ltRef    = useRef(null);

  const fetchData = useCallback(() => {
    fetch(`/api/procurement?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  useEffect(() => {
    if (!spendRef.current) return;
    const ac = axisColors();
    const cats  = STATIC_SPEND_CAT.map(c => c.category.replace('Laminates (HPL)', 'Laminates').replace('Aluminium Profiles', 'Aluminium'));
    const spend = STATIC_SPEND_CAT.map(c => c.spend_L);
    const prev  = STATIC_SPEND_CAT.map(c => c.prev_L);
    const destroy = createChart(spendRef, {
      type: 'bar',
      data: {
        labels: cats,
        datasets: [
          { label: 'This Month (₹L)', data: spend, backgroundColor: SPEND_COLORS.map(c => c + 'CC'), borderColor: SPEND_COLORS, borderWidth: 1.5, borderRadius: 4 },
          { label: 'Last Month (₹L)', data: prev,  backgroundColor: SPEND_COLORS.map(c => c + '44'), borderColor: SPEND_COLORS, borderWidth: 1.5, borderRadius: 4, borderDash: [4,3] },
        ],
      },
      options: {
        ...baseOpts(),
        scales: {
          x: scaleXY().x,
          y: { ticks: { callback: v => '₹' + v + 'L', color: ac.tick, font: { size: 9, family: 'JetBrains Mono' } }, grid: { color: ac.grid } },
        },
      },
    });
    return () => destroy && destroy();
  }, [loading]);

  useEffect(() => {
    if (!ltRef.current) return;
    const ac = axisColors();
    const suppliers = Object.keys(LT_DATA);
    const datasets = suppliers.map((sup, i) => ({
      label: sup,
      data: LT_DATA[sup],
      borderColor: LT_COLORS[i],
      backgroundColor: LT_COLORS[i] + '22',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 3,
      fill: false,
    }));
    const destroy = createChart(ltRef, {
      type: 'line',
      data: { labels: LT_MONTHS, datasets },
      options: {
        ...baseOpts(),
        scales: {
          x: scaleXY().x,
          y: { ticks: { callback: v => v + 'd', color: ac.tick, font: { size: 9, family: 'JetBrains Mono' } }, grid: { color: ac.grid } },
        },
      },
    });
    return () => destroy && destroy();
  }, [loading]);

  if (loading) return <SkeletonView />;

  const suppliers = d?.suppliers ?? [
    { name: 'Century Plyboards',   on_time_pct: 96, avg_delay_days: 0.4, grn_match_rate: '100%', recommendation: 'PREFERRED', open_pos: 2, overdue_pos: 0, lead_time: '5-6 days', freight_cost: '₹8.4/sheet', price_vs_market: '-3% below' },
    { name: 'Greenply Industries', on_time_pct: 88, avg_delay_days: 1.2, grn_match_rate: '94%',  recommendation: 'GOOD',      open_pos: 1, overdue_pos: 1, lead_time: '7 days',   freight_cost: '₹12.6/sheet', price_vs_market: '+1% above' },
    { name: 'Gauri Laminates',     on_time_pct: 68, avg_delay_days: 3.2, grn_match_rate: '82%',  recommendation: 'REVIEW',    open_pos: 1, overdue_pos: 1, lead_time: '10-11 days', freight_cost: '₹22/sheet', price_vs_market: '+6% above' },
  ];

  const alerts = d?.alerts ?? [
    { type: 'icr', icon: '!', title: 'PO-7731 (Gauri Laminates) overdue by 4 days — ₹0.49L at risk',         detail: 'Escalate immediately. Only 38% filled. Consider emergency order from Century Plyboards.', meta: 'OVERDUE PO · HIGH RISK' },
    { type: 'icr', icon: '!', title: 'PO-7734 (Greenply) overdue by 2 days — 300 sheets pending',             detail: 'Greenply confirmed shipment delayed due to transport strike. ETA adjusted to +3 days.',   meta: 'OVERDUE PO · MEDIUM RISK' },
    { type: 'ica', icon: '!', title: 'Gauri Laminates true landed cost is +11% above market',                  detail: "₹22/sheet freight vs Century's ₹8.4. Evaluate switching 8mm Flexi to alternate supplier.", meta: 'COST ANALYSIS · REVIEW' },
    { type: 'icg', icon: '★', title: 'Century Plyboards: 100% GRN match rate this month',                     detail: 'Consider expanding orders. They have capacity and below-market pricing.',                  meta: 'PREFERRED SUPPLIER · EXPAND' },
  ];

  const src = d?.data_source ?? 'demo';

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Supplier &amp; Procurement Intelligence</div>
          <div className="psub">
            Supplier scorecards · Performance analysis · Cost comparison · Risk flags
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me a full supplier review — which suppliers are performing well, which need to be replaced, and how can I reduce my total procurement cost this month?')}>
              ✨ AI Supplier Review
            </button>
          )}
        </div>
      </div>

      <div className="kg g4">
        {[
          { cls: 'sb', l: 'Open POs',        v: String(d?.open_pos ?? 8),           d: `▲ ${d?.open_po_value ?? '₹12.4L'} total value`,     s: 'Active purchase orders' },
          { cls: 'sg', l: 'Best Supplier',   v: suppliers[0]?.name?.split(' ')[0] ?? 'Century',   d: `▲ ${suppliers[0]?.on_time_pct ?? 96}% on-time`,   s: 'Below market price · Full trucks' },
          { cls: 'sr', l: 'Problem Supplier',v: suppliers.find(s => s.recommendation === 'REVIEW')?.name ?? 'Gauri Laminates', d: `▼ ${suppliers.find(s => s.recommendation === 'REVIEW')?.on_time_pct ?? 68}% on-time`, s: '+11% true landed cost vs market' },
          { cls: 'sa', l: 'GRN Match Rate',  v: d?.grn_match_rate ?? '96%',         d: `▲ ${d?.grn_mismatches ?? 3} mismatches this month`,  s: 'Invoice vs GRN reconciliation' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.l.toLowerCase()} in procurement`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── AI Procurement Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '⚠',  text: 'Gauri true landed cost +11% above market — switch 8mm Flexi now',    q: 'Gauri Laminates has a true landed cost 11% above market due to ₹22/sheet freight vs Century\'s ₹8.4. If I switch my 8mm Flexi BWP orders to Century, calculate the annual savings and what negotiation points should I raise with Gauri before deciding?' },
            { icon: '⭐', text: 'Century 100% GRN match + below market — expand order volume',          q: 'Century Plyboards has a 100% GRN match rate, 96% on-time delivery, and pricing 3% below market. What additional SKUs and order volumes should I shift to Century to take full advantage of their reliability and pricing?' },
            { icon: '🔴', text: 'PO-7731 Gauri overdue 4 days — escalate or source emergency supply',  q: 'PO-7731 from Gauri Laminates is overdue by 4 days with ₹0.49L at risk and only 38% filled. Draft an escalation message to Gauri and tell me if I should emergency-source the remaining quantity from Century or another supplier.' },
            { icon: '📊', text: 'GRN match at 96% — reduce mismatches to save admin + claim time',     q: 'My GRN match rate is 96% with 3 mismatches this month. What is the cost of each mismatch in terms of admin time, credit note delays, and cash flow? How do I design a GRN process to reach 99%+?' },
            { icon: '💰', text: 'Negotiate full-truck orders with Century — saves ₹2.4/sheet freight',  q: 'If I consolidate orders with Century Plyboards into full-truck loads, how much freight savings can I expect per sheet and per month? What order quantity threshold achieves a full truck and how does this affect my working capital?' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Spend by Category + Vendor Concentration ── */}
      <div className="gl g55" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="ch">
            <div>
              <div className="ctit">Spend by Category (MTD vs Prev)</div>
              <div className="csub">₹L procurement spend split — current vs last month</div>
            </div>
            {onGoChat && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => onGoChat('My biggest spend category is Plywood & BWP at ₹8.4L (38% of total). Analyse my procurement spend mix — where am I over-spending relative to revenue, and which categories have the most room to negotiate better pricing or find alternate suppliers?')}>
                ✨ Spend AI
              </button>
            )}
          </div>
          <div style={{ height: 200, position: 'relative' }}><canvas ref={spendRef} /></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {STATIC_SPEND_CAT.map((c, i) => {
              const delta = ((c.spend_L - c.prev_L) / c.prev_L * 100).toFixed(1);
              return (
                <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: 'var(--s4)', borderRadius: 4, padding: '3px 8px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: SPEND_COLORS[i], flexShrink: 0 }} />
                  <span style={{ color: 'var(--text2)' }}>{c.category}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', marginLeft: 3 }}>₹{c.spend_L}L</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: delta > 0 ? 'var(--r2)' : 'var(--g2)', fontWeight: 700 }}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Vendor concentration risk */}
        <div className="card">
          <div className="ch">
            <div>
              <div className="ctit">Vendor Concentration Risk</div>
              <div className="csub">HHI score · Top-3 supplier share · Single-source dependency</div>
            </div>
            {onGoChat && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => onGoChat('My vendor concentration has 62% of spend in 2 suppliers. What is my supply chain risk if one of them faces a disruption? How many suppliers per category is optimal for a building materials distributor of my scale? Give me a supplier diversification roadmap.')}>
                ✨ Risk AI
              </button>
            )}
          </div>

          {/* HHI Meter */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: 'var(--text2)' }}>Herfindahl-Hirschman Index (HHI)</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#d97706' }}>2,440</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #15803d 33%, #d97706 66%, #dc2626 100%)', marginBottom: 6 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)' }}>
              <span>Competitive (&lt;1500)</span><span>Moderate (1500–2500)</span><span>Concentrated (&gt;2500)</span>
            </div>
            <div style={{ marginTop: 6, background: '#d977061a', border: '1px solid #d9770640', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#d97706', fontWeight: 600 }}>
              ⚠ Moderately concentrated — 3 suppliers hold 76% of spend
            </div>
          </div>

          {/* Per-supplier share bars */}
          {[
            { name: 'Century Plyboards',   share: 38, color: SPEND_COLORS[0], risk: 'Low' },
            { name: 'Greenply Industries', share: 24, color: SPEND_COLORS[1], risk: 'Low' },
            { name: 'Gauri Laminates',     share: 14, color: SPEND_COLORS[2], risk: 'High' },
            { name: 'Others (3)',           share: 24, color: '#9ca3af',       risk: '—' },
          ].map(v => (
            <div key={v.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{v.name}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{v.share}%</span>
                  {v.risk !== '—' && <span style={{ background: v.risk === 'High' ? '#dc26261a' : '#15803d1a', color: v.risk === 'High' ? '#dc2626' : '#15803d', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{v.risk} Risk</span>}
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--s4)', overflow: 'hidden' }}>
                <div style={{ width: `${v.share}%`, height: '100%', background: v.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Single-source SKUs (critical risk)</div>
            {['8mm Flexi BWP (Gauri only)', 'Alum Extrusion 6m (National only)', 'Glass 8mm (Saint Gobain only)'].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}>
                <span style={{ color: '#dc2626', fontWeight: 700 }}>●</span>
                <span style={{ color: 'var(--text2)' }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Price Variance + Lead Time Trend ── */}
      <div className="gl g55" style={{ marginBottom: 12 }}>
        {/* Price variance table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="ch" style={{ padding: '12px 15px', marginBottom: 0, borderBottom: '1px solid var(--s4)' }}>
            <div>
              <div className="ctit">Price Variance vs Market Rates</div>
              <div className="csub">My buy price vs published market rate per SKU</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ExportButton rows={STATIC_PRICE_VAR} filename="price_variance" columns={[
                { key: 'sku', label: 'SKU' }, { key: 'supplier', label: 'Supplier' },
                { key: 'my_price', label: 'My Price (₹)' }, { key: 'market_rate', label: 'Market Rate (₹)' },
                { key: 'variance_pct', label: 'Variance %' },
              ]} />
              {onGoChat && (
                <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => onGoChat('My price variance analysis shows some SKUs are above market rate. Which ones should I renegotiate first? Calculate the annual savings if I can bring all above-market SKUs to market rate, and give me the negotiation script for each supplier.')}>
                  ✨ Negotiate
                </button>
              )}
            </div>
          </div>
          <table className="tbl tbl-striped">
            <thead>
              <tr>
                <th>SKU</th><th>Supplier</th>
                {[['my_price','My Price (₹)'],['market_rate','Market Rate (₹)'],['variance_pct','Variance']].map(([f,l]) => (
                  <th key={f} className={`sth${pvSort.field===f?' sth-'+(pvSort.dir===2||pvSort.dir==='asc'?'asc':'desc'):''}`}
                    style={{ cursor:'pointer', userSelect:'none' }}
                    onClick={() => setPvSort(p => ({ field:f, dir: p.field===f&&p.dir==='desc'?'asc':'desc' }))}>
                    {l}<span className="sort-ic">{pvSort.field===f?(pvSort.dir==='asc'?'↑':'↓'):'↕'}</span>
                  </th>
                ))}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {[...(d?.price_variance?.length ? d.price_variance : STATIC_PRICE_VAR)].sort((a,b) => {
                const mul = pvSort.dir === 'asc' ? 1 : -1;
                return ((a[pvSort.field]??0) - (b[pvSort.field]??0)) * mul;
              }).map((row, i) => {
                const saving = Math.abs(row.my_price - row.market_rate);
                const isAbove = row.variance_pct > 0;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{row.sku}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{row.supplier}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>₹{row.my_price}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>₹{row.market_rate}</td>
                    <td>
                      <span style={{
                        background: isAbove ? 'var(--r3)' : 'var(--g3)',
                        color: isAbove ? 'var(--r2)' : 'var(--green)',
                        fontFamily: 'var(--mono)', fontWeight: 700, borderRadius: 4, padding: '2px 7px', fontSize: 12,
                      }}>
                        {isAbove ? '+' : ''}{row.variance_pct}%
                      </span>
                    </td>
                    <td>
                      {isAbove && onGoChat ? (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => onGoChat(`My ${row.sku} from ${row.supplier} is priced ₹${row.my_price} vs market rate ₹${row.market_rate} (+${row.variance_pct}%). Draft a price negotiation message to ${row.supplier} to bring this to market rate, highlighting our order volume and payment reliability.`)}>
                          Negotiate
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--g2)', fontWeight: 600 }}>✓ Below mkt · +₹{saving} margin</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '8px 15px', borderTop: '1px solid var(--border)', background: 'var(--s4)', fontSize: 11, color: 'var(--text2)' }}>
            Total above-market overspend: <span style={{ fontWeight: 700, color: 'var(--r2)', fontFamily: 'var(--mono)' }}>~₹0.8L/month</span> if annualised = <span style={{ fontWeight: 700, color: 'var(--r2)', fontFamily: 'var(--mono)' }}>₹9.6L/year</span>
          </div>
        </div>

        {/* Lead time trend chart */}
        <div className="card">
          <div className="ch">
            <div>
              <div className="ctit">Supplier Lead Time Trend — 6 Months</div>
              <div className="csub">Days from PO raised to GRN received · Lower is better</div>
            </div>
            {onGoChat && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => onGoChat('Gauri Laminates lead time has been increasing to 12 days in May. What does this trend indicate? How should I adjust my reorder points and safety stock to account for this deterioration? At what point should I replace them as a supplier?')}>
                ✨ Lead Time AI
              </button>
            )}
          </div>
          <div style={{ height: 210, position: 'relative' }}><canvas ref={ltRef} /></div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
            {Object.keys(LT_DATA).map((sup, i) => {
              const vals = LT_DATA[sup];
              const trend = vals[vals.length - 1] - vals[0];
              return (
                <div key={sup} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                  <span style={{ width: 10, height: 3, borderRadius: 2, background: LT_COLORS[i] }} />
                  <span style={{ color: 'var(--text2)' }}>{sup.split(' ')[0]}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: LT_COLORS[i] }}>{vals[vals.length - 1]}d</span>
                  <span style={{ color: trend > 0 ? '#dc2626' : '#15803d', fontSize: 10, fontWeight: 700 }}>
                    {trend > 0 ? '▲' : '▼'}{Math.abs(trend).toFixed(1)}d
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>Impact on Reorder Points</div>
            {[
              { sup: 'Century', lt: 5.5,  ss: 3, rop: '2× daily demand + 3 days SS' },
              { sup: 'Greenply', lt: 7.0, ss: 4, rop: '2.5× daily demand + 4 days SS' },
              { sup: 'Gauri',   lt: 10.8, ss: 7, rop: '4× daily demand + 7 days SS ⚠' },
            ].map(r => (
              <div key={r.sup} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 8px', background: 'var(--s4)', borderRadius: 4 }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.sup}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>LT: {r.lt}d</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>SS: {r.ss}d</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch"><div className="ctit">Supplier Scorecards — AI Evaluation</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="bdg bg">AI Ranked</span>
            <ExportButton rows={suppliers} filename="supplier_scorecards" columns={[
              { key: 'name', label: 'Supplier' }, { key: 'on_time_pct', label: 'On-Time %' },
              { key: 'avg_delay_days', label: 'Avg Delay (days)' }, { key: 'price_vs_market', label: 'Price vs Market' },
              { key: 'lead_time', label: 'Lead Time' }, { key: 'freight_cost', label: 'Freight/Sheet' },
              { key: 'grn_match_rate', label: 'GRN Match %' }, { key: 'recommendation', label: 'AI Verdict' },
            ]} />
          </div>
        </div>
        <table className="tbl tbl-striped">
          <thead>
            <tr><th>Supplier</th><th>On-Time %</th><th>Avg Delay</th><th>Price vs Market</th><th>Lead Time</th><th>Freight/Sheet</th><th>GRN Match</th><th>Open POs</th><th>AI Verdict</th></tr>
          </thead>
          <tbody>
            {suppliers.map(s => (
              <tr key={s.name}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: s.on_time_pct >= 90 ? '#16a34a' : s.on_time_pct >= 80 ? '#d97706' : '#dc2626' }}>{s.on_time_pct}%</td>
                <td style={{ fontFamily: 'var(--mono)', color: s.avg_delay_days > 2 ? '#dc2626' : '#4b5563' }}>{s.avg_delay_days}d</td>
                <td style={{ fontFamily: 'var(--mono)', color: String(s.price_vs_market ?? '').includes('-') ? '#16a34a' : '#d97706' }}>{s.price_vs_market ?? '—'}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{s.lead_time ?? '—'}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{s.freight_cost ?? `₹${s.freight_per_sheet ?? '—'}/sheet`}</td>
                <td style={{ fontFamily: 'var(--mono)', color: parseFloat(s.grn_match_rate) >= 95 ? '#16a34a' : '#d97706' }}>{s.grn_match_rate}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>
                  {s.open_pos} {s.overdue_pos > 0 && <span style={{ color: '#dc2626', fontSize: 10 }}>({s.overdue_pos} OD)</span>}
                </td>
                <td><span className={`bdg ${VERDICT_CLS[s.recommendation] ?? 'bsl'}`}>{s.recommendation}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: '12px' }}>
        <div className="ch"><div className="ctit">AI Procurement Alerts</div><span className="bdg ba">Action Required</span></div>
        <div className="ilist">
          {alerts.map((a, i) => (
            <div key={i} className="ii">
              <div className={`iic ${a.type}`}>{a.icon}</div>
              <div>
                <div className="iti">{a.title ?? a.text}</div>
                {a.detail && <div className="ide">{a.detail}</div>}
                <div className="imt">{a.meta ?? a.type?.toUpperCase()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which supplier has the worst GRN match rate and highest true landed cost? Draft an escalation message and suggest the best alternative.')}>
          <span>✨</span>
          <span>Ask AI: Identify worst supplier and draft escalation + replacement plan →</span>
        </div>
      )}
    </div>
  );
}
