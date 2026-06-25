import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, baseOpts, axisColors } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATIC_AGING = [
  { sku: '6mm Gurjan BWP',  days_old: 118, stock: 186, value: '₹1.79L', action: 'Discount 12% + call 3 contractors',  recovery: '₹1.57L' },
  { sku: '4mm MR Plain',    days_old: 97,  stock: 240, value: '₹1.39L', action: 'Bundle with 18mm orders · 8% off',   recovery: '₹1.28L' },
  { sku: '19mm Commercial', days_old: 91,  stock: 102, value: '₹0.99L', action: 'Return to supplier if possible',      recovery: '₹0.90L' },
  { sku: '10mm Flexi BWP',  days_old: 74,  stock: 88,  value: '₹1.09L', action: 'Offer to interior design firms',      recovery: '₹1.09L' },
  { sku: '16mm MR Teak',    days_old: 62,  stock: 44,  value: '₹0.42L', action: 'Price okay · Promote to carpenters', recovery: '₹0.42L' },
];

export default function DeadStock({ onGoChat, period = 'MTD' }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dsSort, setDsSort] = useState({ field: 'value', dir: 'desc' });
  const agingRef = useRef(null);

  const fetchData = useCallback(() => {
    fetch(`/api/dead-stock?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  const src = d?.data_source ?? 'demo';
  const parseLakh = (s) => {
    const m = /([\d.]+)\s*(L|Cr)?/i.exec(String(s ?? '').replace(/[₹,]/g, ''));
    if (!m) return 0;
    const n = parseFloat(m[1]);
    return m[2]?.toUpperCase() === 'CR' ? n * 1e7 : m[2]?.toUpperCase() === 'L' ? n * 1e5 : n;
  };
  const dsSic = (f) => dsSort.field === f ? (dsSort.dir === 'asc' ? '▲' : '▼') : '⇅';
  const dsStc = (f) => `sth${dsSort.field === f ? ` sth-${dsSort.dir}` : ''}`;
  const toggleDsSort = (f) => setDsSort(s => ({ field: f, dir: s.field === f && s.dir === 'asc' ? 'desc' : 'asc' }));
  const rawItems = d?.items?.length ? d.items : STATIC_AGING;
  const items = [...rawItems].sort((a, b) => {
    const { field, dir } = dsSort;
    const fmap = {
      sku: r => r.sku ?? r.name ?? '',
      stock: r => r.stock ?? 0,
      days_old: r => r.days_old ?? 0,
      value: r => parseLakh(r.value),
      recovery: r => parseLakh(r.recovery ?? r.value),
    };
    const av = fmap[field]?.(a) ?? 0, bv = fmap[field]?.(b) ?? 0;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
  const chartLabels = rawItems.map(it => `${it.sku ?? it.name} (${it.days_old}d)`);
  const chartData = rawItems.map(it => {
    const raw = String(it.value ?? '0').replace('₹', '').replace('L', '');
    return Math.round(parseFloat(raw) * 100000);
  });

  useEffect(() => {
    if (!d) return;
    const c = axisColors();
    return createChart(agingRef, {
      type: 'bar', indexAxis: 'y',
      data: {
        labels: chartLabels,
        datasets: [{ data: chartData, backgroundColor: chartData.map((_, i) => i < 3 ? '#dc2626aa' : '#d97706aa'), borderWidth: 0, borderRadius: 3 }],
      },
      options: baseOpts({ scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + (v / 1000).toFixed(0) + 'K' } },
        y: { grid: { display: false }, ticks: { color: c.label, font: { size: 9 } } },
      }}),
    });
  }, [d]);

  if (loading) return <SkeletonView />;

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Dead Stock &amp; Ageing Analysis</div>
          <div className="psub">
            AI identifies cash locked in slow-moving inventory and recommends actions to free it
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Create a complete 30-day dead stock recovery plan. List every ageing SKU, the cash locked in each, and the specific action I should take — discount, bundle, return to supplier, or liquidate.')}>
              ✨ AI Recovery Plan
            </button>
          )}
        </div>
      </div>

      <div className="kg g4">
        {[
          { cls: 'sr', l: 'Dead Stock (90d+)',     v: d?.total_value ?? '₹4.2L',              d: `▼ ${d?.skus_count ?? 3} SKUs · Zero movement`,     s: `Oldest: ${d?.oldest_days ?? 118} days` },
          { cls: 'sa', l: 'Slow Stock (60–90d)',   v: d?.slow_stock_value ?? '₹3.6L',         d: '▲ 8 SKUs · Very slow',                             s: 'Trending toward dead if not sold' },
          { cls: 'sb', l: 'Total Cash Locked',     v: d?.total_locked ?? '₹7.8L',             d: '▲ In slow + dead stock',                           s: 'Could fund 3 months of fast-movers' },
          { cls: 'sg', l: 'AI Recovery Potential', v: d?.cash_recovery_potential ?? '₹6.1L',  d: '▲ If AI plan followed',                            s: '78% recovery in 45 days estimated' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.l.toLowerCase()}`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div><div className="kd wn">{k.d}</div><div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── AI Dead Stock Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '💸', text: 'Call 5 contractors today about 6mm Gurjan — recover ₹84K in 7 days',  q: 'I have 186 sheets of 6mm Gurjan BWP sitting for 118 days worth ₹1.79L. Draft a WhatsApp message to my top 5 contractors offering a 12% discount. Include exact price, quantity available, and a call-to-action.' },
            { icon: '📦', text: 'Bundle 4mm MR with 18mm BWP orders — clears stock in 45 days',         q: 'I can bundle 5 sheets of 4mm MR Plain with every 18mm BWP order above 50 sheets to clear dead stock. How do I implement this as a default sales policy and what is the financial impact?' },
            { icon: '🔄', text: 'Return 19mm Commercial to supplier — recover ₹99K within 2 weeks',     q: 'I have 102 sheets of 19mm Commercial Ply sitting for 91 days worth ₹99K. How do I negotiate a return or credit from supplier? What is the best approach and what concessions to ask for?' },
            { icon: '📱', text: 'WhatsApp blast to 28 interior firms about 10mm Flexi + 16mm Teak',      q: 'I want to run a WhatsApp campaign to my 28 interior design firm contacts to sell 10mm Flexi BWP and 16mm Teak slow stock. Draft the message with product details, benefits, and special offer price.' },
            { icon: '⏱',  text: 'Every 30 days of delay on dead stock costs 8% of recovery value',      q: 'What is the time-cost of holding dead stock? Calculate the ongoing storage, financing, and obsolescence cost per month for my ₹7.8L of slow and dead stock, and why I should act this week.' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      <div className="gl g57">
        <div className="card">
          <div className="ch"><div><div className="ctit">Ageing Inventory — AI Action Plan</div></div>
            <ExportButton rows={items} filename="dead_stock" columns={[
              { key: 'sku', label: 'SKU' }, { key: 'stock', label: 'Stock' },
              { key: 'days_old', label: 'Days Old' }, { key: 'value', label: 'Value Locked' },
              { key: 'action', label: 'AI Recommendation' }, { key: 'recovery', label: 'Expected Recovery' },
            ]} />
          </div>
          <table className="tbl tbl-striped">
            <thead><tr>
              <th className={dsStc('sku')} onClick={() => toggleDsSort('sku')}>Product / SKU <span className="sort-ic">{dsSic('sku')}</span></th>
              <th className={dsStc('stock')} onClick={() => toggleDsSort('stock')}>Stock <span className="sort-ic">{dsSic('stock')}</span></th>
              <th className={dsStc('days_old')} onClick={() => toggleDsSort('days_old')}>Days Old <span className="sort-ic">{dsSic('days_old')}</span></th>
              <th className={dsStc('value')} onClick={() => toggleDsSort('value')}>Value Locked <span className="sort-ic">{dsSic('value')}</span></th>
              <th>AI Recommendation</th>
              <th className={dsStc('recovery')} onClick={() => toggleDsSort('recovery')}>Exp. Recovery <span className="sort-ic">{dsSic('recovery')}</span></th>
            </tr></thead>
            <tbody>
              {items.map(row => {
                const days = row.days_old ?? 0;
                const sc = days >= 90 ? 'br' : 'ba';
                return (
                  <tr key={row.sku ?? row.name}
                    style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                    onClick={() => onGoChat?.(`Dead stock analysis for ${row.sku ?? row.name}`)}>
                    <td style={{ fontWeight: 600 }}>{row.sku ?? row.name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{row.stock ?? '—'} sheets</td>
                    <td><span className={`bdg ${sc}`}>{days} days</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--r2)' }}>{row.value ?? '—'}</td>
                    <td><span className="bdg ba">{row.action ?? 'Investigate'}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--g2)' }}>{row.recovery ?? row.value ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="ch"><div className="ctit">Cash Recovery AI Plan</div><span className="bdg bg">{d?.cash_recovery_potential ?? '₹6.1L'} Recoverable</span></div>
          <div style={{ height: '160px', position: 'relative', marginBottom: '14px' }}><canvas ref={agingRef}></canvas></div>
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>AI-Suggested 30-Day Actions</div>
          {[
            { num: 1, bg: 'var(--r3)', color: 'var(--r2)', t: 'Call top 5 contractors today about 6mm Gurjan deal',     m: 'Offer: Buy 30+ sheets → get 12% off · Expected: ₹84K recovered in 7 days' },
            { num: 2, bg: 'var(--a3)', color: 'var(--a2)', t: 'Bundle 4mm MR plain with 18mm BWP orders',               m: 'Auto-add 5 sheets 4mm to every order >50 sheets BWP · Expected: clears in 45 days' },
            { num: 3, bg: 'var(--b3)', color: 'var(--b2)', t: 'WhatsApp blast to interior design customer segment',      m: 'Promote 10mm Flexi and 16mm Teak to 28 interior firm contacts' },
            { num: 4, bg: 'var(--g3)', color: 'var(--g2)', t: 'Contact supplier about returning 19mm commercial',        m: 'Check return/credit policy. ₹99K at stake.' },
          ].map(r => (
            <div key={r.num} className="ri">
              <div className="rinum" style={{ background: r.bg, border: '1px solid', color: r.color }}>{r.num}</div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{r.t}</div>
                <div className="imt">{r.m}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Draft a WhatsApp message to my top 10 customers offering special deals on my slow-moving stock. Include product names, special price, and urgency.')}>
          <span>✨</span>
          <span>Ask AI: Draft customer outreach messages for slow-moving stock clearance →</span>
        </div>
      )}
    </div>
  );
}
