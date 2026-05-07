import React, { useState, useEffect, useRef } from 'react';
import { baseOpts, createChart } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';

const STATIC_SKUS = [
  { n: '18mm BWP (8×4)',  b: 'Century',  stk: 140, buy: 1420, sell: 1920, d: 8,   s30: 480, st: 'critical' },
  { n: '12mm BWP (8×4)',  b: 'Century',  stk: 220, buy: 1080, sell: 1480, d: 11,  s30: 380, st: 'critical' },
  { n: '12mm MR Plain',   b: 'Greenply', stk: 380, buy: 720,  sell: 940,  d: 18,  s30: 420, st: 'ok' },
  { n: '18mm MR Plain',   b: 'Greenply', stk: 290, buy: 880,  sell: 1120, d: 22,  s30: 258, st: 'ok' },
  { n: '8mm Flexi BWP',   b: 'Gauri',   stk: 110, buy: 640,  sell: 840,  d: 28,  s30: 72,  st: 'over' },
  { n: '6mm Gurjan BWP',  b: 'National', stk: 186, buy: 960,  sell: 0,    d: 118, s30: 0,   st: 'dead' },
  { n: '4mm MR Plain',    b: 'National', stk: 240, buy: 580,  sell: 0,    d: 97,  s30: 4,   st: 'dead' },
  { n: '19mm Commercial', b: 'National', stk: 102, buy: 980,  sell: 0,    d: 91,  s30: 2,   st: 'dead' },
  { n: '10mm Flexi BWP',  b: 'Gauri',   stk: 88,  buy: 1240, sell: 1580, d: 74,  s30: 14,  st: 'over' },
  { n: 'Laminate Teak',   b: 'Supreme', stk: 165, buy: 340,  sell: 460,  d: 32,  s30: 128, st: 'ok' },
];

export default function Inventory({ onGoChat }) {
  const [filter, setFilter] = useState('all');
  const [d, setD] = useState(null);
  const mvRef = useRef(null);

  useEffect(() => {
    fetch('/api/inventory').then(r => r.json()).then(setD).catch(() => {});
  }, []);

  const src = d?.data_source ?? 'demo';

  // Map API shape to internal shape
  const allSkus = (d?.skus?.length ? d.skus : STATIC_SKUS).map(s => ({
    n:   s.n ?? s.name,
    b:   s.b ?? s.brand,
    stk: s.stk ?? s.stock,
    buy: s.buy ?? 0,
    sell: s.sell ?? 0,
    d:   s.d ?? s.days_cover,
    s30: s.s30 ?? s.sales_30,
    st:  s.st ?? s.status,
  }));

  const chartData   = allSkus.slice(0, 8).map(s => s.s30 ?? 0);
  const chartLabels = allSkus.slice(0, 8).map(s => s.n ?? 'SKU');

  useEffect(() => {
    return createChart(mvRef, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{ data: chartData, backgroundColor: chartData.map((v, i) => allSkus[i]?.st === 'dead' ? '#dc2626cc' : allSkus[i]?.st === 'critical' ? '#0f766ecc' : '#2563ebcc'), borderWidth: 0, borderRadius: 3 }],
      },
      options: baseOpts({ scales: { x: { grid: { color: '#e2e6ec' }, ticks: { color: '#4b5563', font: { size: 9 } } }, y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' }, callback: v => v + ' sh' } } } }),
    });
  }, [d]);

  const list = filter === 'all' ? allSkus : allSkus.filter(s => s.st === filter);

  const deadVal = d?.dead_stock_value ? (typeof d.dead_stock_value === 'number' ? `₹${d.dead_stock_value.toFixed(1)}L` : String(d.dead_stock_value)) : '₹4.2L';

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Stock Intelligence — AI-Powered Inventory View</div>
          <div className="psub">
            Live from your DMS · Reorder alerts · Overstock detection · Margin by SKU
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('What is the complete stock health report? Which items are critically low and need ordering today, and which are dead stock I should liquidate?')}>
              ✨ AI Stock Report
            </button>
          )}
        </div>
      </div>

      <div className="kg g5">
        {[
          { cls: 'sg', label: 'Total Stock Value',   val: d?.total_stock_value ?? '₹38.6L', d: '▲ From your DMS',           dc: 'up', s: '842 SKU variants tracked' },
          { cls: 'sr', label: 'Critical Low Stock',  val: `${d?.critical_count ?? 7} SKUs`, d: '▼ Below 10-day cover',       dc: 'dn', s: 'Order immediately · ₹8.2L revenue at risk' },
          { cls: 'sa', label: 'Overstock (60d+)',    val: '₹7.8L',                          d: '▲ 14 SKUs over-bought',     dc: 'wn', s: 'Cash locked in slow movers' },
          { cls: 'sr', label: 'Dead Stock (90d+)',   val: deadVal,                           d: '▼ 3 SKUs — no movement',    dc: 'dn', s: 'Discount or return to supplier' },
          { cls: 'sb', label: 'Avg Stock Cover',     val: '22 days',                         d: '▲ Healthy for most grades', dc: 'up', s: '18mm BWP only 8 days — risk' },
        ].map(k => (
          <div key={k.label} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.label.toLowerCase()}`)}>
            <div className="kt"><div className="kl">{k.label}</div></div>
            <div className="kv">{k.val}</div>
            <div className={`kd ${k.dc}`}>{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="ch">
          <div><div className="ctit">SKU-wise Stock Health — AI Classification</div></div>
          <div className="chip-row">
            {['all', 'critical', 'dead', 'over', 'ok'].map(f => (
              <div key={f} className={`chip${filter === f ? ' sel' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All SKUs' : f === 'critical' ? 'Critical' : f === 'dead' ? 'Dead Stock' : f === 'over' ? 'Overstock' : 'Healthy'}
              </div>
            ))}
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>SKU / Product</th><th>Brand</th><th>In Stock</th><th>Buy Price</th><th>Sell Price</th><th>Margin</th><th>Days Cover</th><th>30d Sales</th><th>AI Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {list.map(s => {
              const mg = s.sell > 0 ? Math.round((s.sell - s.buy) / s.sell * 100) : 0;
              const sc = s.st === 'ok' ? 'bg' : s.st === 'critical' ? 'br' : s.st === 'dead' ? 'br' : 'ba';
              const sl = s.st === 'ok' ? 'HEALTHY' : s.st === 'critical' ? 'CRITICAL' : s.st === 'dead' ? 'DEAD STOCK' : 'OVERSTOCK';
              const ac = s.st === 'critical' ? 'Order now' : s.st === 'dead' ? 'Discount/Return' : s.st === 'over' ? 'Slow—hold' : 'Normal';
              return (
                <tr key={s.n} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Stock status and reorder recommendation for ${s.n}`)}>
                  <td style={{ fontWeight: 600 }}>{s.n}</td>
                  <td style={{ fontSize: '10px', color: 'var(--text2)' }}>{s.b}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{s.stk} sheets</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{s.buy > 0 ? '₹' + s.buy.toLocaleString() : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{s.sell > 0 ? '₹' + s.sell.toLocaleString() : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: mg > 25 ? '#16a34a' : mg > 15 ? '#d97706' : '#dc2626' }}>{mg > 0 ? mg + '%' : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: s.d < 15 ? '#dc2626' : s.d < 30 ? '#d97706' : '#16a34a' }}>{s.d}d</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{s.s30 > 0 ? s.s30 + ' sheets' : 'None'}</td>
                  <td><span className={`bdg ${sc}`}>{sl}</span></td>
                  <td style={{ fontSize: '10px', color: 'var(--text2)' }}>{ac}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div><div className="ctit">Stock Movement — Fast vs Slow Movers</div><div className="csub">Sheets sold per month by SKU</div></div></div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={mvRef}></canvas></div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">AI Reorder Recommendations</div><span className="bdg br">{d?.critical_count ?? 7} Urgent</span></div>
          <div className="ilist">
            {[
              ['icr', '!', '18mm BWP — Order 200 sheets NOW', '8 days stock left. Daily sale: 17 sheets. Supplier lead time: 6 days.', 'CRITICAL · ORDER TODAY · ₹1.9L REVENUE AT RISK'],
              ['icr', '!', '12mm BWP — Order 150 sheets THIS WEEK', '11 days cover. Trending up +9% demand.', 'URGENT · 3-DAY WINDOW · ₹1.1L REVENUE'],
              ['ica', '↑', 'Laminates (8×4 teak) — Replenish 80 sheets', '14 days cover but demand forecast shows +22% next 30 days.', 'PLAN AHEAD · AI DEMAND SIGNAL'],
              ['icg', '✓', '6mm Gurjan — Hold. Do Not Reorder.', '90 days in stock with no sale. Clear existing stock first.', 'DEAD STOCK · CLEAR FIRST'],
            ].map(([ic, icon, t, dd, m]) => (
              <div key={t} className="ii" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                onClick={() => onGoChat?.(t)}>
                <div className={`iic ${ic}`}>{icon}</div>
                <div><div className="iti">{t}</div><div className="ide">{dd}</div><div className="imt">{m}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Calculate the EOQ and reorder point for my top 5 fast-moving SKUs. How much should I order from each supplier this week?')}>
          <span>✨</span>
          <span>Ask AI: Calculate EOQ and create this week's reorder plan →</span>
        </div>
      )}
    </div>
  );
}
