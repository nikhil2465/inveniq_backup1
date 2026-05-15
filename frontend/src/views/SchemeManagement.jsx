import React, { useState } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';

const MOCK_SCHEMES = [
  { id: 'SCH-001', name: 'Century BWP Loyalty Q1', brand: 'Century Plyboards', type: 'Volume',   target: 5000,  achieved: 3840, reward: '₹38,400 cash', deadline: '2026-06-30', status: 'ACTIVE',   pct: 77 },
  { id: 'SCH-002', name: 'Greenply Monsoon Promo',  brand: 'Greenply',          type: 'Purchase', target: 200000, achieved: 145000, reward: '2% on billing', deadline: '2026-07-31', status: 'ACTIVE',   pct: 73 },
  { id: 'SCH-003', name: 'Gauri Q4 Growth Scheme',  brand: 'Gauri Laminates',  type: 'Growth',   target: 120,   achieved: 120,  reward: '₹12,000 gift', deadline: '2026-03-31', status: 'COMPLETED', pct: 100 },
  { id: 'SCH-004', name: 'HPL Monsoon Offer',       brand: 'Merino',            type: 'Volume',   target: 800,   achieved: 210,  reward: '₹8,000 coupon', deadline: '2026-08-31', status: 'ACTIVE',   pct: 26 },
  { id: 'SCH-005', name: 'Century Annual Rebate',   brand: 'Century Plyboards', type: 'Annual',   target: 2000000, achieved: 890000, reward: '3% annual rebate', deadline: '2026-12-31', status: 'ACTIVE', pct: 45 },
];

const MOCK_TARGETS = [
  { salesperson: 'Ravi Kumar',   product: '18mm BWP',       mtdTarget: 400, mtdActual: 310, ytdTarget: 2200, ytdActual: 1820 },
  { salesperson: 'Priya Sharma', product: 'Laminates',       mtdTarget: 200, mtdActual: 185, ytdTarget: 1200, ytdActual: 1050 },
  { salesperson: 'Ajay Nair',    product: 'All Products',    mtdTarget: 600000, mtdActual: 520000, ytdTarget: 3600000, ytdActual: 2980000 },
  { salesperson: 'Deepa Rao',    product: 'Aluminium Louvers', mtdTarget: 120, mtdActual: 95,  ytdTarget: 700, ytdActual: 580 },
];

const STATUS_CLS = { ACTIVE: 'bb', COMPLETED: 'bg', EXPIRED: 'br', PENDING: 'ba' };

function fmtLakh(v) {
  if (!v && v !== 0) return '—';
  if (v >= 100000) return `₹${(v/100000).toFixed(1)}L`;
  if (v >= 1000)   return `₹${(v/1000).toFixed(0)}K`;
  return `₹${v}`;
}

export default function SchemeManagement({ onGoChat, dbStatus, period }) {
  const [tab, setTab] = useState('schemes');

  const active   = MOCK_SCHEMES.filter(s => s.status === 'ACTIVE');
  const totalRew = MOCK_SCHEMES.filter(s => s.status === 'ACTIVE').length;

  const SCHEME_COLS = [
    { key: 'id', label: 'Scheme ID' }, { key: 'name', label: 'Scheme Name' },
    { key: 'brand', label: 'Brand' }, { key: 'type', label: 'Type' },
    { key: 'target', label: 'Target' }, { key: 'achieved', label: 'Achieved' },
    { key: 'reward', label: 'Reward' }, { key: 'deadline', label: 'Deadline' }, { key: 'status', label: 'Status' },
  ];

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Scheme Management — Promotions · Targets · Accruals</div>
          <div className="psub">Track supplier schemes, sales targets, and earned rewards <DataSourceBadge source="demo" /></div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Show me all active supplier schemes. Which ones am I close to hitting targets on? What should I prioritize to maximize scheme earnings this quarter?')}>
              ✨ AI Scheme Analysis
            </button>
          )}
        </div>
      </div>

      <div className="kg g4">
        {[
          { cls: 'sg', l: 'Active Schemes',  v: `${active.length}`, d: '▲ From 3 brands', s: 'Check progress weekly' },
          { cls: 'sb', l: 'Avg Achievement', v: active.length ? `${Math.round(active.reduce((s,x)=>s+x.pct,0)/active.length)}%` : '—', d: '▲ On track for 2 schemes', s: 'Push Century BWP 23% more' },
          { cls: 'sa', l: 'Schemes Expiring', v: '1 this month', d: '▼ HPL Monsoon Offer', s: 'Deadline: Aug 31' },
          { cls: 'sp', l: 'Reward Potential', v: '₹1.2L+', d: '▲ If all active hit target', s: 'YTD earned: ₹58,400' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me more about ${k.l.toLowerCase()}`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="seg-tabs" style={{ display:'flex', gap:4, background:'var(--s3)', borderRadius:8, padding:3, border:'1px solid var(--border2)', width:'fit-content', marginBottom:14 }}>
        {[['schemes','Supplier Schemes'],['targets','Sales Targets'],['calendar','Scheme Calendar']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'5px 14px', borderRadius:6, border:'none', background: tab===id?'#fff':'transparent', color: tab===id?'var(--brand)':'var(--text3)', fontWeight: tab===id?700:500, fontSize:12, cursor:'pointer', boxShadow: tab===id?'var(--sh)':undefined, fontFamily:'var(--font)', transition:'all .15s' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'schemes' && (
        <div className="card">
          <div className="ch">
            <div className="ctit">Supplier Schemes & Promotions</div>
            <button className="btn-export" onClick={() => exportToCsv(MOCK_SCHEMES, SCHEME_COLS, 'schemes')}>
              <svg viewBox="0 0 16 16" fill="none" width="11" height="11"><path d="M8 2v9M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Export CSV
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Scheme</th><th>Brand</th><th>Type</th><th>Progress</th><th>Reward</th><th>Deadline</th><th>Status</th></tr>
            </thead>
            <tbody>
              {MOCK_SCHEMES.map(s => (
                <tr key={s.id} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
                  onClick={() => onGoChat?.(`Tell me about the ${s.name} scheme from ${s.brand}. How can I hit the target and maximize the reward?`)}>
                  <td>
                    <div style={{ fontWeight:600, fontSize:12 }}>{s.name}</div>
                    <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>{s.id}</div>
                  </td>
                  <td>{s.brand}</td>
                  <td><span className="bdg bb">{s.type}</span></td>
                  <td>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      <div className="progress-bar-wrap">
                        <div className="progress-bar-fill green" style={{ width:`${Math.min(100,s.pct)}%` }} />
                      </div>
                      <div style={{ fontSize:10, color:'var(--text2)', fontFamily:'var(--mono)' }}>
                        {typeof s.achieved === 'number' && s.achieved >= 1000 ? fmtLakh(s.achieved) : s.achieved} / {typeof s.target === 'number' && s.target >= 1000 ? fmtLakh(s.target) : s.target}
                        {' '}({s.pct}%)
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight:600, color:'var(--g2)', fontFamily:'var(--mono)' }}>{s.reward}</td>
                  <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{s.deadline}</td>
                  <td><span className={`bdg ${STATUS_CLS[s.status]}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'targets' && (
        <div className="card">
          <div className="ch"><div className="ctit">Sales Team Targets vs Actuals</div></div>
          <table className="tbl">
            <thead>
              <tr><th>Salesperson</th><th>Product/Category</th><th>MTD Target</th><th>MTD Actual</th><th>MTD %</th><th>YTD Target</th><th>YTD Actual</th><th>YTD %</th></tr>
            </thead>
            <tbody>
              {MOCK_TARGETS.map((t,i) => {
                const mtdPct = t.mtdTarget ? Math.round(t.mtdActual/t.mtdTarget*100) : 0;
                const ytdPct = t.ytdTarget ? Math.round(t.ytdActual/t.ytdTarget*100) : 0;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight:600 }}>{t.salesperson}</td>
                    <td style={{ fontSize:11, color:'var(--text2)' }}>{t.product}</td>
                    <td style={{ fontFamily:'var(--mono)' }}>{t.mtdTarget >= 1000 ? fmtLakh(t.mtdTarget) : t.mtdTarget}</td>
                    <td style={{ fontFamily:'var(--mono)', fontWeight:600 }}>{t.mtdActual >= 1000 ? fmtLakh(t.mtdActual) : t.mtdActual}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div className="progress-bar-wrap" style={{ width:50 }}>
                          <div className="progress-bar-fill" style={{ width:`${Math.min(100,mtdPct)}%`, background: mtdPct>=80?'var(--g2)':mtdPct>=60?'var(--a2)':'var(--r2)' }} />
                        </div>
                        <span style={{ fontSize:10, fontFamily:'var(--mono)', fontWeight:600, color: mtdPct>=80?'var(--g2)':mtdPct>=60?'var(--a2)':'var(--r2)' }}>{mtdPct}%</span>
                      </div>
                    </td>
                    <td style={{ fontFamily:'var(--mono)' }}>{t.ytdTarget >= 1000 ? fmtLakh(t.ytdTarget) : t.ytdTarget}</td>
                    <td style={{ fontFamily:'var(--mono)', fontWeight:600 }}>{t.ytdActual >= 1000 ? fmtLakh(t.ytdActual) : t.ytdActual}</td>
                    <td><span style={{ fontWeight:700, fontSize:12, color: ytdPct>=80?'var(--g2)':ytdPct>=60?'var(--a2)':'var(--r2)' }}>{ytdPct}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="card" style={{ padding:'20px' }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>Upcoming Scheme Deadlines</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {MOCK_SCHEMES.filter(s => s.status === 'ACTIVE').sort((a,b) => new Date(a.deadline)-new Date(b.deadline)).map(s => {
              const daysLeft = Math.ceil((new Date(s.deadline)-new Date())/(1000*60*60*24));
              const urgency = daysLeft < 30 ? 'var(--r2)' : daysLeft < 60 ? 'var(--a2)' : 'var(--g2)';
              return (
                <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--s2)', borderRadius:8, border:'1px solid var(--border)', cursor:'pointer' }}
                  onClick={() => onGoChat?.(`What do I need to do to hit the target for ${s.name} before the ${s.deadline} deadline?`)}>
                  <div style={{ width:48, height:48, borderRadius:8, background: daysLeft<30?'var(--r3)':daysLeft<60?'var(--a3)':'var(--g3)', border:`1px solid ${urgency}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <div style={{ fontSize:16, fontWeight:900, fontFamily:'var(--mono)', color:urgency }}>{daysLeft}</div>
                    <div style={{ fontSize:8, color:urgency, fontWeight:700 }}>days</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:12, color:'var(--text)' }}>{s.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{s.brand} · {s.reward}</div>
                    <div style={{ marginTop:4 }}>
                      <div className="progress-bar-wrap" style={{ width:200 }}>
                        <div className="progress-bar-fill green" style={{ width:`${s.pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:urgency }}>{s.pct}%</div>
                    <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>{s.deadline}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Analyze all my active schemes. What purchases do I need to make this month to hit all targets and maximize scheme rewards?')}>
          <span>✨</span>
          <span>Ask AI: Optimize purchases to hit all scheme targets this month →</span>
        </div>
      )}
    </div>
  );
}
