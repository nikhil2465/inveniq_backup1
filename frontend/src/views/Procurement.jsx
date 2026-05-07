import React, { useState, useEffect } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';

const VERDICT_CLS = { PREFERRED: 'bg', GOOD: 'bb', REVIEW: 'br', AVOID: 'br' };

export default function Procurement({ onGoChat }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch('/api/procurement').then(r => r.json()).then(setD).catch(() => {});
  }, []);

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

      <div className="card">
        <div className="ch"><div className="ctit">Supplier Scorecards — AI Evaluation</div><span className="bdg bg">AI Ranked</span></div>
        <table className="tbl">
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
