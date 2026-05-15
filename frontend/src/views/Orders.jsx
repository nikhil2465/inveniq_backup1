import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, baseOpts } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';

const STATIC_TREND = [18,22,19,24,20,14,8,21,25,28,22,19,16,11,6,23,26,24,20,18,15,9,22,28,30,24,21,17,12,24];
const STATIC_PENDING = [
  { order: 'ORD-2847', customer: 'Mehta Constructions', value: '₹3.8L', delayed: '30 hours', reason: '18mm BWP stock shortage',   action: 'Order from Century NOW' },
  { order: 'ORD-2852', customer: 'Patel Contractors',   value: '₹1.2L', delayed: '4 hours',  reason: 'QC pending on MR grade',    action: 'Prioritise QC' },
  { order: 'ORD-2855', customer: 'Kumar & Sons',        value: '₹0.8L', delayed: '1 hour',   reason: 'Packing in progress',       action: 'ETA 30 min' },
  { order: 'ORD-2856', customer: 'Raj Carpentry',       value: '₹0.4L', delayed: '30 min',   reason: 'Driver route optimisation', action: 'Dispatch by 3PM' },
];

export default function Orders({ onGoChat, period = 'MTD' }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const ordRef    = useRef(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/orders?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 2 * 60_000);

  useEffect(() => {
    if (!d) return;
    const trend = d?.order_trend_30d ?? STATIC_TREND;
    const days  = Array.from({ length: trend.length }, (_, i) => `${i + 1}`);
    return createChart(ordRef, {
      type: 'line',
      data: {
        labels: days,
        datasets: [
          { data: trend, borderColor: '#0f766e', backgroundColor: '#0f766e10', borderWidth: 2, tension: .4, pointRadius: 0, fill: true },
          { data: trend.map(() => 20), borderColor: '#d97706', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0 },
        ],
      },
      options: baseOpts({
        scales: {
          x: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 8 }, maxTicksLimit: 10 } },
          y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' } } },
        },
      }),
    });
  }, [d]);

  if (loading) return <SkeletonView />;

  const pending  = d?.pending_details?.length ? d.pending_details : STATIC_PENDING;
  const src      = d?.data_source ?? 'demo';
  const todayOrd = d?.today_orders ?? 24;
  const dispatched = d?.dispatched ?? 18;
  const pendingCnt = d?.pending ?? 6;

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Orders &amp; Fulfilment Intelligence</div>
          <div className="psub">
            Live order pipeline · Pending dispatch · SLA performance
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('What is today\'s order status? Which pending orders are most at risk of delay and what should I do right now to fix them?')}>
              ✨ AI Order Brief
            </button>
          )}
        </div>
      </div>

      <div className="kg g5">
        {[
          { cls: 'sb', l: 'Orders Today',   v: String(todayOrd),                d: `▲ ${dispatched} dispatched · ${pendingCnt} pending`,  s: 'Live: refreshes in real-time' },
          { cls: 'sg', l: 'Dispatched',     v: String(dispatched),              d: `▲ ${d?.dispatch_sla ?? '87%'} SLA hit`,               s: 'Orders fulfilled today' },
          { cls: 'sr', l: 'Pending',        v: String(pendingCnt),              d: '▼ Requires action',                                   s: pending[0] ? `${pending[0].order}: ${pending[0].delayed}` : 'No critical delays' },
          { cls: 'st', l: 'Avg Fulfil Time',v: `${d?.avg_fulfillment_hrs ?? 3.2} hrs`, d: '▲ Target: 2 hrs',                             s: 'QC bottleneck on MR grades' },
          { cls: 'sa', l: 'Orders MTD',     v: String(d?.orders_mtd ?? 486),    d: '▲ vs last month',                                    s: 'Month-to-date count' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`What is my ${k.l.toLowerCase()} status?`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div><div className="ctit">Order Volume — Last 30 Days</div><div className="csub">Daily orders vs 20-order target</div></div></div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={ordRef} /></div>
        </div>
        <div className="card">
          <div className="ch">
            <div className="ctit">Pending Orders — Needs Action</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="bdg br">{pendingCnt} Pending</span>
              <ExportButton rows={pending} filename="pending_orders" columns={[
                { key: 'order', label: 'Order #' }, { key: 'customer', label: 'Customer' },
                { key: 'value', label: 'Value' }, { key: 'status', label: 'Status' },
                { key: 'delayed', label: 'Delayed' }, { key: 'reason', label: 'Reason' },
                { key: 'action', label: 'Action' },
              ]} />
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Order #</th><th>Customer</th><th>Value</th><th>Status</th><th>Delayed</th><th>Reason</th><th>Action</th></tr>
            </thead>
            <tbody>
              {pending.map((row) => {
                const status = row.status ?? '';
                const statusBdg =
                  status === 'DRAFT'         ? 'bdg' :
                  status === 'CONFIRMED'     ? 'bdg bb' :
                  status === 'IN_PRODUCTION' ? 'bdg ba' :
                  status === 'DISPATCHED'    ? 'bdg bg' :
                  status === 'DELIVERED'     ? 'bdg bg' :
                  status === 'CANCELLED'     ? 'bdg br' : 'bdg';
                const statusLabel =
                  status === 'IN_PRODUCTION' ? 'In Production' : status || 'Unknown';
                return (
                <tr key={row.order ?? row.order_number}
                  style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Order ${row.order ?? row.order_number} for ${row.customer ?? row.customer_name} — status ${status}, delayed ${row.delayed}`)}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--b2)', fontWeight: 600 }}>{row.order ?? row.order_number}</td>
                  <td style={{ fontWeight: 600 }}>{row.customer ?? row.customer_name}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{row.value}</td>
                  <td><span className={statusBdg} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{statusLabel}</span></td>
                  <td><span className={`bdg ${String(row.delayed).includes('hour') && parseInt(row.delayed) >= 4 ? 'br' : 'ba'}`}>{row.delayed}</span></td>
                  <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{row.reason}</td>
                  <td style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>{row.action ?? 'Investigate'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which orders are delayed today, what is causing the delays, and draft an update message for each affected customer?')}>
          <span>✨</span>
          <span>Ask AI: Draft delay notifications for pending orders and suggest fixes →</span>
        </div>
      )}
    </div>
  );
}
