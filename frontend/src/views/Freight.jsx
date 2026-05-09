import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, baseOpts, gradientFill } from '../utils/chartHelpers';
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

export default function Freight({ onGoChat, period = 'MTD' }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const ftRef = useRef(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/freight?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  const src   = d?.data_source ?? 'demo';
  const lanes = d?.outbound_lanes?.length ? d.outbound_lanes : STATIC_LANES;
  const trend = d?.freight_trend_30d ?? STATIC_TREND;
  const days  = Array.from({ length: trend.length }, (_, i) => `${i + 1}`);

  useEffect(() => {
    if (!d) return;
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
          x: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 8 }, maxTicksLimit: 10 } },
          y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v } },
        },
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 10, family: 'JetBrains Mono' }, padding: 12, boxWidth: 12, color: '#4b5563' } } },
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
