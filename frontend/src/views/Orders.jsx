import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, baseOpts, axisColors } from '../utils/chartHelpers';
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

// Fulfillment pipeline stages (static demo, overridden by live data)
const STATIC_PIPELINE = [
  { stage: 'Received',    count: 24, pct: 100, color: '#0f766e', icon: '📥', avg_time: null },
  { stage: 'Processing',  count: 18, pct: 75,  color: '#2563eb', icon: '⚙',  avg_time: '45 min' },
  { stage: 'QC / Packed', count: 12, pct: 50,  color: '#7c3aed', icon: '📦', avg_time: '1.2 hr' },
  { stage: 'Dispatched',  count: 10, pct: 42,  color: '#d97706', icon: '🚚', avg_time: '2.1 hr' },
  { stage: 'Delivered',   count: 8,  pct: 33,  color: '#16a34a', icon: '✅', avg_time: '3.2 hr' },
];

const SLA_REASONS = [
  { reason: 'Stock shortage',      count: 6, pct: 40, color: '#dc2626' },
  { reason: 'QC delay',           count: 4, pct: 27, color: '#d97706' },
  { reason: 'Driver unavailable', count: 3, pct: 20, color: '#9333ea' },
  { reason: 'Packing backlog',    count: 2, pct: 13, color: '#2563eb' },
];

export default function Orders({ onGoChat, period = 'MTD' }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ordSort, setOrdSort] = useState({ field: 'delayed', dir: 'desc' });
  const ordRef    = useRef(null);

  const fetchData = useCallback(() => {
    fetch(`/api/orders?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 2 * 60_000);

  useEffect(() => {
    if (!d) return;
    const c     = axisColors();
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
          x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 8 }, maxTicksLimit: 10 } },
          y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' } } },
        },
      }),
    });
  }, [d]);

  if (loading) return <SkeletonView />;

  const rawPending = d?.pending_details?.length ? d.pending_details : STATIC_PENDING;
  const src      = d?.data_source ?? 'demo';
  const todayOrd = d?.today_orders ?? 24;
  const dispatched = d?.dispatched ?? 18;
  const pendingCnt = d?.pending ?? 6;

  const parseDelay = (s) => {
    const m = /([\d.]+)\s*(hour|min)/i.exec(String(s ?? ''));
    if (!m) return 0;
    const n = parseFloat(m[1]);
    return m[2].toLowerCase() === 'hour' ? n * 60 : n;
  };
  const parseValue = (s) => {
    const m = /([\d.]+)\s*(L|Cr)?/i.exec(String(s ?? '').replace(/[₹,]/g, ''));
    if (!m) return 0;
    const n = parseFloat(m[1]);
    return m[2]?.toUpperCase() === 'CR' ? n * 1e7 : m[2]?.toUpperCase() === 'L' ? n * 1e5 : n;
  };
  const ordSic = (f) => ordSort.field === f ? (ordSort.dir === 'asc' ? '▲' : '▼') : '⇅';
  const ordStc = (f) => `sth${ordSort.field === f ? ` sth-${ordSort.dir}` : ''}`;
  const toggleOrdSort = (f) => setOrdSort(s => ({ field: f, dir: s.field === f && s.dir === 'asc' ? 'desc' : 'asc' }));
  const pending = [...rawPending].sort((a, b) => {
    const { field, dir } = ordSort;
    const fmap = {
      order: r => r.order ?? r.order_number ?? '',
      customer: r => r.customer ?? r.customer_name ?? '',
      value: r => parseValue(r.value),
      status: r => r.status ?? '',
      delayed: r => parseDelay(r.delayed),
    };
    const av = fmap[field]?.(a) ?? '', bv = fmap[field]?.(b) ?? '';
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });

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

      {/* ── AI Order Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '⚡', text: 'ORD-2847 delayed 30 hours for Mehta — stock shortage costing ₹3.8L', q: 'Order ORD-2847 for Mehta Constructions worth ₹3.8L has been delayed 30 hours due to 18mm BWP stock shortage. What should I do right now? Draft a customer message and fix plan.' },
            { icon: '⏱',  text: 'Avg fulfil time 3.2 hrs vs 2-hr target — QC is the bottleneck',      q: 'My average order fulfillment time is 3.2 hours vs a 2-hour target. QC on MR grades seems to be the bottleneck. How do I redesign the QC process to hit the 2-hour target consistently?' },
            { icon: '📅', text: 'Monday peak: staff and pre-pick on Sundays to handle +38% volume',    q: 'Monday has 38% more order volume than other days. How should I redesign Sunday pre-picking, driver scheduling, and staffing to handle Monday peak without delays?' },
            { icon: '🎯', text: 'SLA at 87% — missing 13% delays costs customer trust over time',       q: 'My dispatch SLA is 87%. The 13% of orders that miss the SLA — who are they, what causes the delay, and what systemic change prevents these in the next 30 days?' },
            { icon: '🤖', text: 'Auto-dispatch for orders under ₹1L — removes 40% of manual handling',  q: 'Can I implement auto-dispatch for orders under ₹1L with pre-approved customers? How much time and manual work would this save, and which order types qualify?' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Fulfillment Pipeline ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="ch">
          <div>
            <div className="ctit">Fulfillment Pipeline — Today's Orders</div>
            <div className="csub">Order flow from receipt to delivery · Avg times per stage</div>
          </div>
          {onGoChat && (
            <button className="export-btn" onClick={() => onGoChat(`My fulfillment pipeline today: Received 24 → Processing 18 → QC/Packed 12 → Dispatched 10 → Delivered 8 orders. Average total time is 3.2 hours vs a 2-hour target. Which stage has the biggest drop-off and what specific action fixes it fastest?`)}>
              ✨ AI Analyse
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '8px 0' }}>
          {STATIC_PIPELINE.map((stage, i) => (
            <React.Fragment key={stage.stage}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{stage.icon}</div>
                <div style={{ height: 40, background: `${stage.color}22`, border: `2px solid ${stage.color}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '4px 2px' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: stage.color }}>{stage.count}</div>
                  <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{stage.pct}%</div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text2)', marginTop: 4, whiteSpace: 'nowrap' }}>{stage.stage}</div>
                {stage.avg_time && <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>⏱ {stage.avg_time}</div>}
              </div>
              {i < STATIC_PIPELINE.length - 1 && (
                <div style={{ fontSize: 16, color: 'var(--text3)', padding: '0 2px', flexShrink: 0, paddingBottom: 30 }}>→</div>
              )}
            </React.Fragment>
          ))}
        </div>
        {/* SLA Breach Reasons */}
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--s3)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>SLA Breach Root Causes — Today</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SLA_REASONS.map(r => (
              <div key={r.reason} style={{ flex: 1, minWidth: 120 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{r.reason}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: r.color }}>{r.count}</span>
                </div>
                <div style={{ height: 6, background: 'var(--s4)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', background: r.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
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
              {onGoChat && pending.length > 0 && (
                <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => onGoChat(
                    `I have ${pending.length} delayed orders that need customer notifications drafted right now:\n\n` +
                    pending.map(r => `• ${r.order ?? r.order_number} — ${r.customer ?? r.customer_name} (${r.value}, delayed ${r.delayed}, reason: ${r.reason})`).join('\n') +
                    '\n\nFor each order, draft a concise WhatsApp/SMS message: acknowledge the delay, state the specific new ETA, apologise, and offer a small goodwill gesture if delay exceeds 4 hours.'
                  )}>
                  📨 Notify All Delayed
                </button>
              )}
              <ExportButton rows={pending} filename="pending_orders" columns={[
                { key: 'order', label: 'Order #' }, { key: 'customer', label: 'Customer' },
                { key: 'value', label: 'Value' }, { key: 'status', label: 'Status' },
                { key: 'delayed', label: 'Delayed' }, { key: 'reason', label: 'Reason' },
                { key: 'action', label: 'Action' },
              ]} />
            </div>
          </div>
          <table className="tbl tbl-striped">
            <thead>
              <tr>
                <th className={ordStc('order')} onClick={() => toggleOrdSort('order')}>Order # <span className="sort-ic">{ordSic('order')}</span></th>
                <th className={ordStc('customer')} onClick={() => toggleOrdSort('customer')}>Customer <span className="sort-ic">{ordSic('customer')}</span></th>
                <th className={ordStc('value')} onClick={() => toggleOrdSort('value')}>Value <span className="sort-ic">{ordSic('value')}</span></th>
                <th className={ordStc('status')} onClick={() => toggleOrdSort('status')}>Status <span className="sort-ic">{ordSic('status')}</span></th>
                <th className={ordStc('delayed')} onClick={() => toggleOrdSort('delayed')}>Delayed <span className="sort-ic">{ordSic('delayed')}</span></th>
                <th>Reason</th><th>Action</th>{onGoChat && <th>Notify</th>}
              </tr>
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
                const isHighDelay = String(row.delayed).includes('hour') && parseInt(row.delayed) >= 4;
                return (
                <tr key={row.order ?? row.order_number}
                  style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Order ${row.order ?? row.order_number} for ${row.customer ?? row.customer_name} — status ${status}, delayed ${row.delayed}`)}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--b2)', fontWeight: 600 }}>{row.order ?? row.order_number}</td>
                  <td style={{ fontWeight: 600 }}>{row.customer ?? row.customer_name}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{row.value}</td>
                  <td><span className={statusBdg} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{statusLabel}</span></td>
                  <td><span className={`bdg ${isHighDelay ? 'br' : 'ba'}`}>{row.delayed}</span></td>
                  <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{row.reason}</td>
                  <td style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>{row.action ?? 'Investigate'}</td>
                  {onGoChat && (
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        style={{ fontSize: 10, padding: '3px 9px', background: isHighDelay ? 'var(--r3)' : 'var(--bg2)', border: `1px solid ${isHighDelay ? 'var(--red)' : 'var(--border)'}`, borderRadius: 5, cursor: 'pointer', color: isHighDelay ? 'var(--r2)' : 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}
                        onClick={() => onGoChat(`Draft a customer delay notification for ${row.customer ?? row.customer_name}. Order: ${row.order ?? row.order_number}, Value: ${row.value}, Delayed: ${row.delayed}, Reason: ${row.reason}. Suggested action: ${row.action}. Write a WhatsApp message: acknowledge the delay, give a clear new ETA, apologise professionally, and offer a small goodwill gesture.`)}>
                        📨 Draft
                      </button>
                    </td>
                  )}
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
