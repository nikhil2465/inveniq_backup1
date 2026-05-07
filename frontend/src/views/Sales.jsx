import React, { useState, useEffect, useRef } from 'react';
import { MONTHS, baseOpts, scaleXY, createChart, gradientFill } from '../utils/chartHelpers';
import DataSourceBadge from '../components/DataSourceBadge';

const STATIC_REV   = [19.2, 20.1, 21.4, 22.8, 21.6, 20.4, 22.1, 23.8, 24.4, 25.2, 26.0, 28.4];
const STATIC_PROF  = [4.1, 4.4, 4.6, 5.0, 4.8, 4.2, 4.8, 5.4, 5.5, 5.7, 5.8, 6.36];
const STATIC_MGN   = { labels: ['18mm BWP', '12mm BWP', '10mm Flexi', 'Laminates', '18mm MR', '12mm MR', 'Commercial'], data: [28.4, 25.6, 24.1, 22.8, 19.6, 17.4, 8.2] };
const STATIC_DOW   = { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], data: [5.8, 4.2, 4.6, 4.4, 4.8, 3.2, 0.4] };

export default function Sales({ onGoChat, period = 'MTD' }) {
  const [d, setD] = useState(null);
  const salesRef = useRef(null), marginRef = useRef(null), dowRef = useRef(null);

  useEffect(() => {
    fetch(`/api/sales?period=${encodeURIComponent(period)}`).then(r => r.json()).then(setD).catch(() => {});
  }, [period]);

  const src = d?.data_source ?? 'demo';

  const revData  = d?.monthly_revenue?.length ? d.monthly_revenue.map(m => m.revenue)  : STATIC_REV;
  const mgnLabels = d?.margin_by_sku?.length  ? d.margin_by_sku.map(m => m.sku)         : STATIC_MGN.labels;
  const mgnData   = d?.margin_by_sku?.length  ? d.margin_by_sku.map(m => m.margin)      : STATIC_MGN.data;
  const dowLabels = d?.day_of_week?.length    ? d.day_of_week.map(x => x.day)           : STATIC_DOW.labels;
  const dowData   = d?.day_of_week?.length    ? d.day_of_week.map(x => x.avg)           : STATIC_DOW.data;
  const chartLabels = d?.monthly_revenue?.length ? d.monthly_revenue.map(m => m.month)  : MONTHS;

  useEffect(() => {
    const d1 = createChart(salesRef, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          { data: revData, borderColor: '#0f766e', backgroundColor: gradientFill('#0f766e'), borderWidth: 2.5, tension: .4, pointRadius: 0, fill: true },
          { data: STATIC_PROF, borderColor: '#2563eb', borderWidth: 2, tension: .4, pointRadius: 0 },
        ],
      },
      options: baseOpts({ scales: scaleXY(v => '₹' + v + 'L') }),
    });
    const d2 = createChart(marginRef, {
      type: 'bar',
      data: {
        labels: mgnLabels,
        datasets: [{ data: mgnData, backgroundColor: ['#0f766ecc','#0f766ecc','#16a34acc','#9333eacc','#d97706cc','#2563ebcc','#ea580ccc'], borderWidth: 0, borderRadius: 3 }],
      },
      options: baseOpts({ scales: { x: { grid: { color: '#e2e6ec' }, ticks: { color: '#4b5563', font: { size: 9 } } }, y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' }, callback: v => v + '%' } } } }),
    });
    const d3 = createChart(dowRef, {
      type: 'bar',
      data: {
        labels: dowLabels,
        datasets: [{ data: dowData, backgroundColor: ['#0f766ecc','#2563ebaa','#2563ebaa','#2563ebaa','#2563ebaa','#d97706aa','#9ca3afaa'], borderWidth: 0, borderRadius: 3 }],
      },
      options: baseOpts({ scales: { x: { grid: { display: false }, ticks: { color: '#4b5563', font: { size: 10 } } }, y: { grid: { color: '#e2e6ec' }, ticks: { color: '#9ca3af', font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v + 'L' } } } }),
    });
    return () => { d1(); d2(); d3(); };
  }, [d]);

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Sales Performance — Revenue &amp; Margin Intelligence</div>
          <div className="psub">
            What's selling, what's not, and where your money really comes from
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me a full sales performance analysis — revenue trend, top margin products, discount leakage, and what I should focus on to grow profit this month.')}>
              ✨ AI Sales Analysis
            </button>
          )}
        </div>
      </div>

      <div className="kg g5">
        {[
          { cls: 'sg', l: 'Revenue MTD',      v: d?.revenue_mtd ?? '₹28.4L',     d: `▲ ${d?.revenue_growth ?? '+9.2% MoM'}` },
          { cls: 'sg', l: 'Gross Profit MTD', v: d?.profit_mtd ?? '₹6.36L',      d: `▲ Margin: ${d?.gross_margin ?? '22.4%'}` },
          { cls: 'sa', l: 'Avg Discount',     v: d?.avg_discount ?? '4.8%',       d: '▲ Leakage: ₹1.36L/mo' },
          { cls: 'sb', l: 'Orders MTD',       v: String(d?.orders_mtd ?? 486),   d: '▲ +42 vs last month' },
          { cls: 'st', l: 'Avg Order Value',  v: d?.avg_order_value ?? '₹58K',   d: '▲ +₹4K vs last month' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.l.toLowerCase()}`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd up">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div><div className="ctit">Revenue &amp; Profit Trend</div><div className="csub">₹ Lakhs — Last 12 months</div></div></div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={salesRef}></canvas></div>
        </div>
        <div className="card">
          <div className="ch"><div><div className="ctit">Margin by SKU</div><div className="csub">Gross margin % by product grade</div></div></div>
          <div style={{ height: '200px', position: 'relative' }}><canvas ref={marginRef}></canvas></div>
        </div>
      </div>

      <div className="gl g55">
        <div className="card">
          <div className="ch"><div className="ctit">Sales by Day of Week</div><div className="csub">₹ Lakhs avg · Peak day highlighted</div></div>
          <div style={{ height: '180px', position: 'relative' }}><canvas ref={dowRef}></canvas></div>
        </div>
        <div className="card">
          <div className="ch"><div className="ctit">AI Sales Insights</div><span className="bdg bg">AI Generated</span></div>
          <div className="ilist">
            {[
              ['icg', '★', 'Monday peak day — 38% of weekly revenue', 'Schedule maximum staff and vehicle availability on Mondays. Pre-pick popular SKUs Sunday evening.', 'SCHEDULING · HIGH IMPACT'],
              ['ica', '!', 'Interior firms yield 31% margin vs 19% from contractors', 'Increase marketing spend on interior design segment. Target 5 new interior firms this month.', 'CUSTOMER MIX · MARGIN IMPROVEMENT'],
              ['icr', '!', '8mm Flexi BWP true margin 6.7% — not stated 23.8%', 'Gauri freight ₹110/sh destroys profitability. Reprice or switch supplier.', 'TRUE COST · IMMEDIATE ACTION'],
            ].map(([ic, icon, t, dd, m]) => (
              <div key={t} className="ii"
                style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                onClick={() => onGoChat?.(`Sales insight: ${t}. Background: ${dd} (${m}). Give me a detailed action plan to act on this insight and quantify the revenue or margin impact.`)}>
                <div className={`iic ${ic}`}>{icon}</div>
                <div><div className="iti">{t}</div><div className="ide">{dd}</div><div className="imt">{m}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which products and customer segments are driving the most margin? Where am I losing margin through discounts and what should I change?')}>
          <span>✨</span>
          <span>Ask AI: Margin improvement analysis — where am I losing money and how to fix it →</span>
        </div>
      )}
    </div>
  );
}
