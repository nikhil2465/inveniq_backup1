import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, baseOpts, gradientFill, axisColors } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATIC_LANES = [
  { lane: 'Whitefield',      cost_per_sheet: 14, fill_pct: 78, status: 'BEST' },
  { lane: 'Koramangala',     cost_per_sheet: 16, fill_pct: 72, status: 'OK' },
  { lane: 'HSR Layout',      cost_per_sheet: 17, fill_pct: 65, status: 'OK' },
  { lane: 'BTM Layout',      cost_per_sheet: 19, fill_pct: 58, status: 'HIGH' },
  { lane: 'Electronic City', cost_per_sheet: 24, fill_pct: 54, status: 'WORST' },
  { lane: 'Hebbal',          cost_per_sheet: 21, fill_pct: 61, status: 'HIGH' },
];

const STATIC_TREND = [16, 18, 15, 17, 20, 14, 0, 19, 17, 16, 18, 21, 15, 14, 0, 18, 16, 17, 19, 20, 16, 0, 18, 17, 15, 19, 18, 16, 0, 18];
const STATIC_INC   = [9, 11, 8, 10, 12, 0, 0, 9, 11, 10, 8, 12, 10, 0, 0, 11, 9, 10, 12, 11, 9, 0, 10, 11, 9, 12, 10, 8, 0, 11];

const LANE_SC = { BEST: 'bg', OK: 'bb', HIGH: 'ba', WORST: 'br' };

const fmtV = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function Freight({ onGoChat, period = 'MTD' }) {
  const [d, setD]                   = useState(null);
  const [inTransit, setInTransit]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const ftRef = useRef(null);

  const fetchData = useCallback(() => {
    fetch(`/api/freight?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  const fetchInTransit = useCallback(() => {
    fetch('/api/freight/in-transit')
      .then(r => r.json())
      .then(data => setInTransit(data))
      .catch(() => {});
  }, []);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useEffect(() => { fetchInTransit(); }, [fetchInTransit]);
  useAutoRefresh(fetchData, 5 * 60_000);
  useAutoRefresh(fetchInTransit, 2 * 60_000);

  const src   = d?.data_source ?? 'demo';
  const lanes = d?.outbound_lanes?.length ? d.outbound_lanes : STATIC_LANES;
  const trend = d?.freight_trend_30d ?? STATIC_TREND;
  const days  = Array.from({ length: trend.length }, (_, i) => `${i + 1}`);

  useEffect(() => {
    if (!d) return;
    const c = axisColors();
    return createChart(ftRef, {
      type: 'line',
      data: {
        labels: days,
        datasets: [
          { data: trend, borderColor: '#0f766e', backgroundColor: gradientFill('#0f766e'), borderWidth: 2, tension: .4, pointRadius: 0, fill: true, label: 'Outbound ₹/sheet' },
          { data: STATIC_INC.slice(0, trend.length), borderColor: '#9333ea', backgroundColor: gradientFill('#9333ea', 0.12), borderWidth: 2, tension: .4, pointRadius: 0, fill: true, label: 'Inbound ₹/sheet' },
          { data: trend.map(() => 16), borderColor: '#d97706', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, label: 'Target ₹16/sh' },
        ],
      },
      options: baseOpts({
        scales: {
          x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 8 }, maxTicksLimit: 10 } },
          y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v } },
        },
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 10, family: 'JetBrains Mono' }, padding: 12, boxWidth: 12, color: c.label } } },
      }),
    });
  }, [d]);

  if (loading) return <SkeletonView />;

  const bestLane  = lanes.find(l => l.status === 'BEST')  ?? lanes[0];
  const worstLane = lanes.find(l => l.status === 'WORST') ?? lanes[lanes.length - 1];

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Freight Planning — AI-Optimized Logistics</div>
          <div className="psub">
            Outbound lane costs · Vehicle utilisation · Consolidation opportunities · Inbound freight analysis
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Optimize my freight costs today — which deliveries can be consolidated, what is the total saving, and what is the exact dispatch plan I should follow?')}>
              ✨ AI Route Optimizer
            </button>
          )}
        </div>
      </div>

      <div className="kg g5">
        {[
          { cls: 'sr', l: 'Outbound Cost/Sheet',  v: d?.outbound_cost_per_sheet ?? '₹18.4',     d: '▼ Target ₹16/sh', s: '₹2.4 above target' },
          { cls: 'sa', l: 'Vehicle Utilisation',   v: d?.vehicle_utilisation ?? '68%',           d: '▼ Target 85%', s: '17% unused capacity daily' },
          { cls: 'sb', l: 'Best Lane',             v: bestLane?.lane ?? 'Whitefield',            d: `▲ ₹${bestLane?.cost_per_sheet ?? 14}/sh · ${bestLane?.fill_pct ?? 78}% fill`, s: 'Consolidation possible today' },
          { cls: 'sr', l: 'Worst Lane',            v: worstLane?.lane ?? 'Electronic City',      d: `▼ ₹${worstLane?.cost_per_sheet ?? 24}/sh · ${worstLane?.fill_pct ?? 54}% fill`, s: 'Set min order ₹15K for zone' },
          { cls: 'sg', l: 'Today Saving',          v: d?.savings_potential ?? '₹2,400',          d: '▲ 3 Whitefield merges', s: 'Mehta + Patel + Gupta same zone' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.l.toLowerCase()} in freight`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── AI Freight Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '🚛', text: 'Merge Whitefield deliveries today — save ₹2,400 in one move',          q: 'Mehta, Patel, and Gupta are all in the Whitefield zone today. If I merge these 3 deliveries into one truck run, calculate the exact freight saving, how to sequence the drops, and how to communicate delivery windows to each customer.' },
            { icon: '⚡', text: 'Electronic City at ₹24/sheet — set ₹15K minimum order for this zone', q: 'My Electronic City lane costs ₹24/sheet with only 54% truck fill. How do I implement a minimum order value policy for this zone, what should the threshold be, and how do I communicate this to affected customers?' },
            { icon: '📈', text: 'Vehicle utilisation at 68% vs 85% target — 17% empty cost daily',       q: 'My vehicle utilisation is 68% against a target of 85%. That 17% gap represents daily wasted cost. How do I redesign delivery scheduling, customer order batching, and route planning to consistently hit 85% utilisation?' },
            { icon: '💰', text: 'Outbound ₹18.4/sheet vs ₹16 target — recover ₹2.4 margin per sheet', q: 'My outbound freight cost is ₹18.4/sheet vs ₹16 target. ₹2.4 gap per sheet. Over my monthly 480-sheet sales that is ₹1,152 per month in excess freight. What are the 3 fastest ways to close this gap?' },
            { icon: '🔄', text: 'Inbound freight 40% higher than outbound — renegotiate supplier terms', q: 'My inbound freight cost from suppliers is significantly higher than outbound per sheet. How do I negotiate freight-included (CIF) terms with Century and Greenply, and what volume commitment gives me leverage for a better deal?' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Deliveries In Transit ───────────────────────────────────────── */}
      {(() => {
        const deliveries = inTransit?.deliveries ?? [];
        const dispatched   = deliveries.filter(o => o.status === 'DISPATCHED');
        const inProduction = deliveries.filter(o => o.status === 'IN_PRODUCTION');
        if (deliveries.length === 0) return null;
        return (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div>
                <div className="ctit">Deliveries In Transit</div>
                <div className="csub">Live route board — pulled from Sales Orders · Ship-to addresses</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="bdg bb">{dispatched.length} In Transit</span>
                <span className="bdg ba">{inProduction.length} Preparing</span>
              </div>
            </div>
            <div className="freight-route-board">
              {deliveries.map((order, i) => {
                const isDispatched = order.status === 'DISPATCHED';
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const eta   = order.delivery_date ? new Date(order.delivery_date) : null;
                const daysLeft = eta ? Math.ceil((eta - today) / 86400000) : null;
                const overdue  = daysLeft !== null && daysLeft < 0;
                const urgent   = daysLeft !== null && daysLeft <= 1 && !overdue;
                return (
                  <div key={order.order_id} className={`freight-delivery-card${isDispatched ? ' fd-transit' : ' fd-prep'}`}>
                    <div className="fd-status-bar">
                      <span className={`bdg ${isDispatched ? 'bb' : 'ba'}`}>
                        {isDispatched ? '🚚 IN TRANSIT' : '🏭 PREPARING'}
                      </span>
                      {daysLeft !== null && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: overdue ? 'var(--red)' : urgent ? 'var(--amber)' : 'var(--text3)' }}>
                          {overdue ? `⚠ ${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `ETA ${daysLeft}d`}
                        </span>
                      )}
                    </div>
                    <div className="fd-order-num">{order.order_number}</div>
                    <div className="fd-customer">{order.customer_name}</div>
                    <div className="fd-location">
                      <svg viewBox="0 0 12 16" fill="none" style={{ width: 10, height: 12, flexShrink: 0 }}>
                        <path d="M6 1C3.8 1 2 2.8 2 5c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.2"/>
                        <circle cx="6" cy="5" r="1.2" fill="currentColor"/>
                      </svg>
                      {order.site_location}
                    </div>
                    <div className="fd-value">{fmtV(order.total_value)}</div>
                    {order.notes && <div className="fd-notes">{order.notes}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="lane-grid">
        {lanes.map(lane => {
          const sc = LANE_SC[lane.status] ?? 'bsl';
          return (
            <div key={lane.lane} className="lane-card">
              <div className="lane-hd">
                <div className="lane-route">{lane.lane}</div>
                <span className={`bdg ${sc}`}>{lane.status}</span>
              </div>
              <div className="lane-detail">
                <div className="ld"><div className="ldv">₹{lane.cost_per_sheet}/sh</div><div className="ldl">Cost/Sheet</div></div>
                <div className="ld"><div className="ldv">{lane.fill_pct}%</div><div className="ldl">Truck Fill</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div><div className="ctit">Freight Cost Trend — 30 Days</div><div className="csub">₹/sheet · Inbound vs Outbound</div></div></div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={ftRef}></canvas></div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">AI Freight Insights</div><span className="bdg bg">AI Generated</span></div>
          <div className="ilist">
            {[
              ['icg', '★', 'Consolidate 3 Whitefield deliveries → save ₹2,400 today', 'Mehta (40sh) + Patel (30sh) + Gupta (10sh) — all within 3km. One truck at 92% vs three at 35%.', 'ROUTE MERGE · IMMEDIATE SAVING'],
              ['icr', '!', 'Gauri inbound freight is 2.8× more expensive than Century', '₹22/sheet vs ₹8.4/sheet. True landed cost +11% above market.', 'TRUE COST · SWITCH SUPPLIER'],
              ['ica', '↑', 'Electronic City needs minimum order consolidation', 'Only 54% fill — ₹24/sh is 50% above avg. Set min ₹15K order value.', 'POLICY · MIN ORDER RULE'],
            ].map(([ic, icon, t, dd, m]) => (
              <div key={t} className="ii">
                <div className={`iic ${ic}`}>{icon}</div>
                <div><div className="iti">{t}</div><div className="ide">{dd}</div><div className="imt">{m}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which delivery zones have the worst cost-per-sheet and lowest truck fill rate? What policy changes — minimum order value, route batching — would bring me below ₹16/sheet average?')}>
          <span>✨</span>
          <span>Ask AI: Freight cost reduction policy — bring average below ₹16/sheet →</span>
        </div>
      )}
    </div>
  );
}
