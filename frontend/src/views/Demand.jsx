import React, { useState, useEffect, useRef } from 'react';
import { createChart, baseOpts, gradientFill } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';

const MONTHS_SHORT = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const STATIC_SEASONAL = [88, 84, 90, 96, 100, 92, 76, 72, 94, 112, 128, 118];

const STATIC_FDATA = [
  { sku: '18mm BWP',  curr: 480, f30: 596, f60: 680, f90: 712, signal: 'SURGE +24%',    action: 'Pre-order 300 extra sheets NOW' },
  { sku: '12mm MR',   curr: 420, f30: 448, f60: 436, f90: 380, signal: 'STABLE +6.7%',  action: 'Normal ordering cycle' },
  { sku: '12mm BWP',  curr: 380, f30: 432, f60: 498, f90: 524, signal: 'GROWING +13.7%',action: 'Increase stock by 25%' },
  { sku: 'Laminates', curr: 320, f30: 298, f60: 274, f90: 250, signal: 'DECLINING -6.9%',action: 'Reduce next order quantity' },
  { sku: '18mm MR',   curr: 258, f30: 262, f60: 248, f90: 210, signal: 'STABLE',        action: 'Normal — monitor monsoon dip' },
  { sku: '8mm Flexi', curr: 72,  f30: 88,  f60: 102, f90: 118, signal: 'GROWING',       action: 'Fix supplier reliability first' },
  { sku: 'Commercial',curr: 24,  f30: 20,  f60: 16,  f90: 12,  signal: 'FALLING',       action: 'Do not reorder dead stock grade' },
];

const COLORS = { '18mm BWP': '#0f766e', '12mm MR': '#2563eb', '12mm BWP': '#0f766e', 'Laminates': '#9333ea', '18mm MR': '#d97706', '8mm Flexi': '#ea580c', 'Commercial': '#9ca3af' };
const SIG_SC  = sig => {
  const s = String(sig).toUpperCase();
  if (s.includes('SURGE'))    return 'br';
  if (s.includes('GROWING'))  return 'bg';
  if (s.includes('DECLINING') || s.includes('FALLING') || s.includes('DEAD')) return 'ba';
  return 'bb';
};

export default function Demand({ onGoChat }) {
  const [d, setD]  = useState(null);
  const sRef = useRef(null);

  useEffect(() => {
    fetch('/api/demand').then(r => r.json()).then(setD).catch(() => {});
  }, []);

  const src        = d?.data_source ?? 'demo';
  const fdata      = d?.forecast?.length ? d.forecast : STATIC_FDATA;
  const seasonal   = d?.seasonal_index ?? STATIC_SEASONAL;
  const seasonText = d?.seasonal_insight ?? 'Oct–Dec is historically your strongest quarter (+28%). Start stocking up in September to avoid stockouts during the festive construction rush. Plan extra 400 sheets of BWP grades.';

  useEffect(() => {
    return createChart(sRef, {
      type: 'line',
      data: {
        labels: MONTHS_SHORT,
        datasets: [{
          data: seasonal,
          borderColor: '#0f766e', backgroundColor: gradientFill('#0f766e'), borderWidth: 2.5, tension: .4,
          pointRadius: 3, pointBackgroundColor: '#0f766e', fill: true, label: 'Index (100=avg)',
        }],
      },
      options: baseOpts({ scales: { x: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9 } } }, y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' } } } } }),
    });
  }, [d]);

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Demand Forecasting — What Will Sell Next?</div>
          <div className="psub">
            AI-powered demand signals · 30/60/90-day forecast · Seasonal patterns · Pre-order alerts
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Which products show SURGE demand in the next 90 days? How much stock should I pre-order right now to avoid stockouts during the peak period?')}>
              ✨ AI Demand Forecast
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="ch">
          <div><div className="ctit">30/60/90-Day Demand Forecast by SKU</div><div className="csub">AI prediction · Sheets/month</div></div>
          <span className="bdg bg">AI FORECAST</span>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>SKU</th><th>Current Month</th><th>30-Day Forecast</th><th>60-Day</th><th>90-Day</th><th>AI Signal</th><th>Recommended Action</th></tr>
          </thead>
          <tbody>
            {fdata.map(row => {
              const g30 = row.curr > 0 ? Math.round((row.f30 - row.curr) / row.curr * 100) : 0;
              const sc   = SIG_SC(row.signal);
              const bg30 = row.f30 > row.curr ? '#0f766e' : row.f30 < row.curr ? '#dc2626' : '#2563eb';
              return (
                <tr key={row.sku} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Demand forecast for ${row.sku}`)}>
                  <td style={{ fontWeight: 600 }}>{row.sku}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{row.curr} sheets</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ background: bg30, borderRadius: '4px', padding: '5px 8px', color: '#fff', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, display: 'inline-block' }}>
                      {row.f30} ({g30 >= 0 ? '+' : ''}{g30}%)
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: row.f60 > row.curr ? '#0f766e' : '#dc2626' }}>{row.f60}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: row.f90 > row.curr ? '#0f766e' : '#dc2626' }}>{row.f90}</td>
                  <td style={{ textAlign: 'center' }}><span className={`bdg ${sc}`}>{row.signal}</span></td>
                  <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{row.action ?? row.ac}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div><div className="ctit">30/60/90-Day Demand by SKU</div><div className="csub">Visual bars</div></div></div>
          {fdata.slice(0, 6).map(row => {
            const c  = COLORS[row.sku] || '#9ca3af';
            const mx = Math.max(row.curr, row.f30, row.f60, row.f90);
            return (
              <div key={row.sku} className="fc-row">
                <span className="fc-lbl">{row.sku}</span>
                <div className="fc-bs">
                  {[{ v: row.curr, o: '99' }, { v: row.f30, o: 'cc' }, { v: row.f60, o: 'bb' }, { v: row.f90, o: '99' }].map((b, i) => (
                    <div key={i} className="fc-b" style={{ height: `${Math.round(b.v / mx * 100)}%`, background: `${c}${b.o}` }}>{b.v}</div>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: '3px', marginLeft: '100px', marginTop: '3px' }}>
            {['Now', '30d', '60d', '90d'].map(l => <div key={l} className="fc-pl">{l}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">Seasonal Pattern — AI Detected</div><div className="csub">Based on historical sales data</div></div>
          <div style={{ height: '180px', position: 'relative' }}><canvas ref={sRef}></canvas></div>
          <div style={{ padding: '10px 12px', background: 'var(--b3)', border: '1px solid var(--b4)', borderRadius: '7px', marginTop: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--b2)', fontFamily: 'var(--mono)', marginBottom: '3px' }}>AI SEASONAL INSIGHT</div>
            <div style={{ fontSize: '12px', color: 'var(--blue)' }}>{seasonText}</div>
          </div>
        </div>
      </div>

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Based on the demand forecast and seasonal patterns, create a complete pre-order plan for the next 60 days — which products, how many sheets, from which suppliers, and when to order.')}>
          <span>✨</span>
          <span>Ask AI: Build 60-day pre-order plan based on demand forecast and seasonal data →</span>
        </div>
      )}
    </div>
  );
}
