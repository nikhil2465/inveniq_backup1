import React, { useState, useEffect } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';

export default function Inward({ onGoChat }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch('/api/inward').then(r => r.json()).then(setD).catch(() => {});
  }, []);

  const src = d?.data_source ?? 'demo';
  const inwardQty  = d?.inward_qty  ?? 14;
  const outwardQty = d?.outward_count ?? 16;
  const netChange  = (d?.inward_qty ?? 680) - (d?.outward_qty ?? 520);

  const stages = d?.stages ?? [
    { label: 'Goods Received',     val: inwardQty, sub: `${d?.inward_today ?? '₹6.8L'} value · ${d?.inward_count ?? 4} suppliers`,   color: 'var(--b2)' },
    { label: 'QC / Inspection',    val: Math.round(inwardQty * 0.4), sub: '2 pending >2hrs · Avg 38 min',                            color: 'var(--a2)' },
    { label: 'Put-Away / Shelved', val: Math.round(inwardQty * 0.78), sub: '98% accuracy · 1 mismatch',                             color: 'var(--teal)' },
    { label: 'Pick & Pack',        val: outwardQty + 2, sub: 'Avg pick time: 12 min',                                               color: 'var(--purple)' },
    { label: 'Dispatched Out',     val: outwardQty, sub: `${d?.outward_today ?? '₹8.2L'} value · ${d?.outward_count ?? 12} customers`, color: 'var(--green)' },
  ];

  const recentGrn = d?.recent_grn ?? [
    { grn: 'GRN-4424', supplier: 'Century Plyboards',  value: '₹3.8L', status: 'MATCH',    date: 'Today' },
    { grn: 'GRN-4423', supplier: 'Greenply Industries', value: '₹1.6L', status: 'MATCH',    date: 'Today' },
    { grn: 'GRN-4422', supplier: 'Gauri Laminates',    value: '₹1.4L', status: 'MISMATCH', date: 'Today' },
  ];

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Inward &amp; Outward — Stock Movement Intelligence</div>
          <div className="psub">
            AI tracks every unit entering and leaving your warehouse · Shrinkage detection · Dispatch velocity
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me today\'s complete stock movement brief — what came in, what went out, any GRN mismatches, and is there any shrinkage or QC issue I should investigate?')}>
              ✨ AI Movement Brief
            </button>
          )}
        </div>
      </div>

      <div className="ai-banner">
        <div className="ai-ic">AI</div>
        <div className="ai-b">
          <div className="ai-lbl">AI Movement Brief — {src === 'mysql' ? 'Live DB' : 'Demo'}</div>
          <div className="ai-txt">
            <strong>Inward today: {d?.inward_today ?? '₹6.8L'}</strong> across {d?.inward_count ?? 4} consignments.{' '}
            <strong>Outward dispatched: {d?.outward_today ?? '₹8.2L'}</strong>.{' '}
            <strong>Shrinkage MTD: {d?.shrinkage_mtd ?? '₹0.24L'}</strong>.{' '}
            {recentGrn.some(g => g.status === 'MISMATCH') && <strong>⚠️ GRN mismatch detected — review required.</strong>}
          </div>
        </div>
        <div className="ai-ts">{src === 'mysql' ? 'Live' : 'Demo'}<br />{src === 'mysql' ? 'Real-time' : 'Fallback'}</div>
      </div>

      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', fontFamily: 'var(--mono)', marginBottom: '7px' }}>
        Today's Stock Flow Pipeline
      </div>

      <div className="flow-grid">
        {stages.reduce((acc, item, i, arr) => {
          acc.push(
            <div key={item.label} className="flow-card" style={{ borderTop: `3px solid ${item.color}` }}>
              <div className="fl2">{item.label}</div>
              <div className="fv" style={{ color: item.color }}>{item.val}</div>
              <div className="fd">{item.sub}</div>
            </div>
          );
          if (i < arr.length - 1) acc.push(<div key={`arrow-${i}`} className="flow-arrow">→</div>);
          return acc;
        }, [])}
      </div>

      <div className="kg g6">
        {[
          { cls: 'sb', l: 'Inward Today',     v: d?.inward_today  ?? '₹6.8L', d: `▲ ${d?.inward_count ?? 14} consignments`,    s: `${d?.inward_qty ?? 680} sheets received` },
          { cls: 'sg', l: 'Outward Today',    v: d?.outward_today ?? '₹8.2L', d: `▲ ${d?.outward_count ?? 16} dispatches`,     s: `${d?.outward_qty ?? 520} sheets dispatched` },
          { cls: 'st', l: 'Net Stock Change', v: `${netChange >= 0 ? '+' : ''}${netChange}`, d: netChange >= 0 ? '▲ sheets added net' : '▼ net outflow', s: netChange >= 0 ? 'Inward > Outward' : 'Outward > Inward' },
          { cls: 'sa', l: 'Shrinkage MTD',    v: d?.shrinkage_mtd ?? '₹0.24L', d: '▲ Monitored daily', s: 'Industry avg: 0.5%' },
          { cls: 'sr', l: 'GRN Mismatches',   v: String(recentGrn.filter(g => g.status === 'MISMATCH').length), d: '▼ Requires investigation', s: 'Wrong grade / short delivery' },
          { cls: 'sp', l: 'QC Pass Rate',     v: d?.qc_pass_rate ?? '94%', d: '▲ Monitored per batch', s: '6% rejection rate this month' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`${k.l} - ${k.d}`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {recentGrn.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="ch">
            <div className="ctit">Recent GRN Entries</div>
            <span className={`bdg ${recentGrn.some(g => g.status === 'MISMATCH') ? 'ba' : 'bg'}`}>
              {recentGrn.filter(g => g.status === 'MISMATCH').length} mismatch
            </span>
          </div>
          <table className="tbl">
            <thead><tr><th>GRN #</th><th>Supplier</th><th>Value</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {recentGrn.map(g => (
                <tr key={g.grn}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--b2)', fontWeight: 600 }}>{g.grn}</td>
                  <td style={{ fontWeight: 600 }}>{g.supplier}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{g.value}</td>
                  <td><span className={`bdg ${g.status === 'MATCH' ? 'bg' : 'br'}`}>{g.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text2)' }}>{g.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Explain this GRN mismatch — what likely caused it, what is the financial impact, and what are the exact steps to resolve it with the supplier?')}>
          <span>✨</span>
          <span>Ask AI: Investigate GRN mismatch — root cause, impact, and resolution steps →</span>
        </div>
      )}
    </div>
  );
}
