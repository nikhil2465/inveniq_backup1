import React, { useState, useEffect } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';

const STATIC_CUSTS = [
  { name: 'Mehta Constructions',  segment: 'Contractor',    monthly_value: '₹3.8L', score: 92, outstanding: '₹0',    days_since_order: 2,  risk: 'LOW' },
  { name: 'City Interiors',       segment: 'Interior Firm', monthly_value: '₹2.4L', score: 88, outstanding: '₹0',    days_since_order: 47, risk: 'MEDIUM' },
  { name: 'Kumar & Sons',         segment: 'Retailer',      monthly_value: '₹2.1L', score: 85, outstanding: '₹0.4L', days_since_order: 3,  risk: 'LOW' },
  { name: 'Sharma Constructions', segment: 'Contractor',    monthly_value: '₹1.8L', score: 42, outstanding: '₹3.4L', days_since_order: 78, risk: 'HIGH' },
  { name: 'Design Studio Patel',  segment: 'Interior Firm', monthly_value: '₹1.6L', score: 91, outstanding: '₹0',    days_since_order: 1,  risk: 'LOW' },
  { name: 'Raj Carpentry Works',  segment: 'Carpenter',     monthly_value: '₹0.9L', score: 76, outstanding: '₹0',    days_since_order: 8,  risk: 'LOW' },
  { name: 'Gupta Materials',      segment: 'Retailer',      monthly_value: '₹0.8L', score: 48, outstanding: '₹2.1L', days_since_order: 38, risk: 'MEDIUM' },
  { name: 'Royal Interiors',      segment: 'Interior Firm', monthly_value: '₹0.6L', score: 62, outstanding: '₹0',    days_since_order: 5,  risk: 'LOW' },
];

function riskStatus(c) {
  if (c.risk === 'HIGH' || parseFloat(c.outstanding) > 2) return 'overdue';
  if (c.risk === 'MEDIUM' || c.days_since_order > 30) return 'risk';
  if (c.score >= 85) return 'top';
  return 'ok';
}

export default function Customers({ onGoChat }) {
  const [filter, setFilter] = useState('all');
  const [d, setD]           = useState(null);

  useEffect(() => {
    fetch('/api/customers').then(r => r.json()).then(setD).catch(() => {});
  }, []);

  const allCustomers = (d?.customers?.length ? d.customers : STATIC_CUSTS).map(c => ({
    ...c, _st: riskStatus(c),
  }));

  const list = filter === 'all'     ? allCustomers
             : filter === 'top'     ? allCustomers.filter(c => c._st === 'top')
             : filter === 'risk'    ? allCustomers.filter(c => c._st === 'risk')
             : allCustomers.filter(c => c._st === 'overdue');

  const src = d?.data_source ?? 'demo';

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Customer Intelligence — Know Every Account</div>
          <div className="psub">
            Payment behaviour · At-risk accounts · Margin by customer · Discount leakage
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me a full customer health report — who are my top accounts, who is at risk of churning, and who has overdue payments that need follow-up today?')}>
              ✨ AI Customer Brief
            </button>
          )}
        </div>
      </div>

      <div className="kg g4">
        {[
          { cls: 'sg', l: 'Active Customers',  v: String(d?.total_customers ?? 148),       d: '▲ Buying accounts',          s: 'All active accounts' },
          { cls: 'sa', l: 'At-Risk Accounts',  v: String(d?.at_risk_count ?? 8),            d: '▼ No order 30+ days',        s: 'Combined revenue at risk' },
          { cls: 'sr', l: 'Total Outstanding', v: d?.total_outstanding ?? '₹12.8L',         d: '▼ Overdue receivables',      s: 'Sharma ₹3.4L — 78 days' },
          { cls: 'si', l: 'Best Segment',      v: 'Interior Firms',                         d: '▲ 31% avg margin',           s: '26% of customers, 38% of profit' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.l.toLowerCase()}`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="ch">
          <div><div className="ctit">Customer Health — All Accounts</div></div>
          <div className="chip-row">
            {[['all', 'All'], ['top', 'Top Accounts'], ['risk', 'At Risk'], ['overdue', 'Overdue']].map(([f, l]) => (
              <div key={f} className={`chip${filter === f ? ' sel' : ''}`} onClick={() => setFilter(f)}>{l}</div>
            ))}
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Customer</th><th>Segment</th><th>Monthly Revenue</th><th>AI Score</th>
              <th>Days Silent</th><th>Outstanding</th><th>Risk</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => {
              const sc  = c._st === 'top' ? 'bg' : c._st === 'risk' ? 'ba' : c._st === 'overdue' ? 'br' : 'bsl';
              const lbl = c._st === 'top' ? 'TOP ACCOUNT' : c._st === 'risk' ? 'AT RISK' : c._st === 'overdue' ? 'OVERDUE' : 'ACTIVE';
              return (
                <tr key={c.name} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Customer analysis for ${c.name}`)}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ fontSize: '10px', color: 'var(--text2)' }}>{c.segment}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{c.monthly_value}</td>
                  <td>
                    <div className="sbar">
                      <div className="str">
                        <div className="sf2" style={{ width: `${c.score}%`, background: c.score > 80 ? '#16a34a' : c.score > 60 ? '#d97706' : '#dc2626' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '9px' }}>{c.score}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: c.days_since_order > 60 ? '#dc2626' : c.days_since_order > 30 ? '#d97706' : '#16a34a' }}>
                    {c.days_since_order}d
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: c.outstanding === '₹0' || c.outstanding === 'Rs.0.0L' ? '#16a34a' : '#dc2626' }}>
                    {c.outstanding}
                  </td>
                  <td><span className={`bdg ${c.risk === 'HIGH' ? 'br' : c.risk === 'MEDIUM' ? 'ba' : 'bg'}`}>{c.risk}</span></td>
                  <td><span className={`bdg ${sc}`}>{lbl}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which customers should I call this week — overdue payments, at-risk of churning, and upsell opportunities?')}>
          <span>✨</span>
          <span>Ask AI: Customer priority list — who to call this week and why →</span>
        </div>
      )}
    </div>
  );
}
