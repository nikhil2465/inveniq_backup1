import React, { useEffect, useRef, useState } from 'react';
import { createChart, baseOpts } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';

const STATIC_MGN_LABELS = ['18mm BWP', '12mm BWP', '10mm Flexi', 'Laminates', '18mm MR', '12mm MR', 'Commercial', 'Dead Stock'];
const STATIC_MGN_DATA   = [28.4, 25.6, 24.1, 22.8, 19.6, 17.4, 8.2, -12];
const STATIC_CF_LABELS  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const STATIC_CF_COL     = [18.4, 21.2, 19.8, 22.4, 24.1, 26.8];
const STATIC_CF_PUR     = [16.2, 19.4, 18.1, 20.8, 22.4, 24.2];

export default function Finance({ onGoChat }) {
  const mRef = useRef(null), cfRef = useRef(null);
  const [disc, setDisc] = useState(4.8);
  const [d, setD] = useState(null);

  useEffect(() => {
    fetch('/api/finance').then(r => r.json()).then(setD).catch(() => {});
  }, []);

  const src = d?.data_source ?? 'demo';

  const mgnLabels = d?.margin_by_sku?.length ? d.margin_by_sku.map(m => m.sku)    : STATIC_MGN_LABELS;
  const mgnData   = d?.margin_by_sku?.length ? d.margin_by_sku.map(m => m.margin) : STATIC_MGN_DATA;
  const cfLabels  = d?.cash_flow_6m?.length  ? d.cash_flow_6m.map(m => m.month)      : STATIC_CF_LABELS;
  const cfCol     = d?.cash_flow_6m?.length  ? d.cash_flow_6m.map(m => m.collections) : STATIC_CF_COL;
  const cfPur     = d?.cash_flow_6m?.length  ? d.cash_flow_6m.map(m => m.purchases)   : STATIC_CF_PUR;

  useEffect(() => {
    const d1 = createChart(mRef, {
      type: 'bar',
      data: {
        labels: mgnLabels,
        datasets: [{
          data: mgnData,
          backgroundColor: (ctx) => ctx.raw < 0 ? '#dc2626aa' : ctx.raw > 25 ? '#0f766ecc' : ctx.raw > 20 ? '#16a34acc' : '#d97706cc',
          borderWidth: 0, borderRadius: 3,
        }],
      },
      options: baseOpts({ scales: { x: { grid: { color: '#e2e6ec' }, ticks: { color: '#4b5563', font: { size: 9 } } }, y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' }, callback: v => v + '%' } } } }),
    });
    const d2 = createChart(cfRef, {
      type: 'bar',
      data: {
        labels: cfLabels,
        datasets: [
          { label: 'Collections', data: cfCol, backgroundColor: '#16a34acc', borderRadius: 3, borderWidth: 0 },
          { label: 'Purchases',   data: cfPur, backgroundColor: '#2563ebaa', borderRadius: 3, borderWidth: 0 },
        ],
      },
      options: baseOpts({
        scales: {
          x: { grid: { display: false }, ticks: { color: '#4b5563', font: { size: 10 } } },
          y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v + 'L' } },
        },
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 10, family: 'JetBrains Mono' }, padding: 12, boxWidth: 12, color: '#4b5563' } } },
      }),
    });
    return () => { d1(); d2(); };
  }, [d]);

  const baseRev = parseFloat(String(d?.revenue_mtd ?? '28.4').replace('₹', '').replace('L', '')) || 28.4;
  const baseProfit = parseFloat(String(d?.gross_profit_mtd ?? '6.36').replace('₹', '').replace('L', '')) || 6.36;
  const savedDisc = (4.8 - disc) / 100 * baseRev;
  const newProfit = (baseProfit + savedDisc).toFixed(2);
  const newMargin = ((newProfit / baseRev) * 100).toFixed(1);
  const gain = (newProfit - baseProfit).toFixed(2);

  const receivables = d?.overdue_receivables ?? [
    { customer: 'Sharma Constructions',  amount: '₹3.4L', days_overdue: 78, risk: 'HIGH' },
    { customer: 'Mehta Brothers',        amount: '₹2.1L', days_overdue: 52, risk: 'MEDIUM' },
    { customer: 'Patel Contractors',     amount: '₹1.8L', days_overdue: 44, risk: 'MEDIUM' },
    { customer: 'Rajan Interior',        amount: '₹1.2L', days_overdue: 31, risk: 'LOW' },
    { customer: 'Others (12 accounts)', amount: '₹4.3L', days_overdue: 25, risk: 'LOW' },
  ];

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Profitability &amp; Cash Intelligence — Owner View</div>
          <div className="psub">
            True profit by product · Cash flow · Receivables · What's actually in your pocket
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me an owner-level financial brief — true profit after all costs, cash position, overdue receivables, and the top 3 actions I should take today to improve cash flow.')}>
              ✨ AI Finance Brief
            </button>
          )}
        </div>
      </div>

      <div className="kg g5">
        {[
          { cls: 'sg', l: 'Gross Revenue MTD',  v: d?.revenue_mtd ?? '₹28.4L',               d: `▲ ${d?.revenue_growth ?? '9.2% MoM'}`, s: 'YTD: ₹2.84 Cr' },
          { cls: 'sg', l: 'Gross Profit MTD',   v: d?.gross_profit_mtd ?? '₹6.36L',          d: `▲ Margin: ${d?.gross_margin ?? '22.4%'}`, s: 'After buy price, freight, losses' },
          { cls: 'sr', l: 'Cash Receivable',    v: d?.outstanding_receivables ?? '₹12.8L',   d: '▼ 4 accounts overdue 60d+', s: '₹3.4L overdue >60 days' },
          { cls: 'sa', l: 'Cash in Dead Stock', v: d?.dead_stock_locked ?? '₹7.8L',          d: '▲ Locked, not working', s: 'Actionable recovery: ₹6.1L' },
          { cls: 'sb', l: 'Net Operating Cash', v: d?.net_cash ?? '₹4.1L',                   d: '▲ Healthy this month', s: 'After payables and collections' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.l.toLowerCase()}`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd up">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div><div className="ctit">Profit by Product Category</div><div className="csub">Which products actually make you money?</div></div></div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={mRef}></canvas></div>
        </div>
        <div className="card">
          <div className="ch"><div><div className="ctit">Cash Flow — Collections vs Purchases</div></div></div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={cfRef}></canvas></div>
        </div>
      </div>

      <div className="gl g57">
        <div className="card">
          <div className="ch"><div className="ctit">What-If: Margin Simulator</div><span className="bdg bg">Live AI Tool</span></div>
          <div className="scbox">
            <div className="sclbl">If I reduce discount by X% across all orders...</div>
            <input type="range" min="0" max="10" step="0.1" value={disc} onChange={e => setDisc(+e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>
              <span>0%</span><span style={{ color: 'var(--green)', fontWeight: 700 }}>{disc.toFixed(1)}%</span><span>10%</span>
            </div>
            <div className="scout">
              <div className="scit"><div className="scv" style={{ color: 'var(--g2)' }}>₹{newProfit}L</div><div className="scl">Monthly Profit</div></div>
              <div className="scit"><div className="scv" style={{ color: 'var(--b2)' }}>{newMargin}%</div><div className="scl">Margin %</div></div>
              <div className="scit"><div className="scv" style={{ color: gain >= 0 ? 'var(--green)' : 'var(--r2)' }}>{gain >= 0 ? '+' : ''}{gain}L</div><div className="scl">Extra Gain</div></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">Overdue Receivables — Action Required</div><span className="bdg br">{d?.outstanding_receivables ?? '₹12.8L'} Outstanding</span></div>
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Amount Due</th><th>Days Overdue</th><th>AI Risk</th><th>Action</th></tr></thead>
            <tbody>
              {receivables.map(row => {
                const sc = row.risk === 'HIGH' ? 'br' : row.risk === 'MEDIUM' ? 'ba' : 'bg';
                const action = row.action ?? (row.risk === 'HIGH' ? 'Legal notice if not paid this week' : row.risk === 'MEDIUM' ? 'Call + offer early pay discount' : 'Normal collection cycle');
                return (
                  <tr key={row.customer} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                    onClick={() => onGoChat?.(`Outstanding from ${row.customer} — ${row.days_overdue ?? row.days} days overdue`)}>
                    <td style={{ fontWeight: 600 }}>{row.customer}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: sc === 'br' ? 'var(--r2)' : sc === 'ba' ? 'var(--a2)' : 'var(--text)' }}>{row.amount}</td>
                    <td><span className={`bdg ${sc}`}>{row.days_overdue ?? row.days} days</span></td>
                    <td><span className={`bdg ${sc}`}>{row.risk}</span></td>
                    <td style={{ fontSize: '11px' }}>{action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which overdue receivables should I chase this week? Draft a payment reminder for the top 3 customers with outstanding amounts and suggest collection strategies.')}>
          <span>✨</span>
          <span>Ask AI: Draft payment reminders for overdue accounts + collection strategy →</span>
        </div>
      )}
    </div>
  );
}
