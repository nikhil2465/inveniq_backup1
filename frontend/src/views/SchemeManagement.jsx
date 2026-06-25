import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { exportToCsv } from '../utils/exportUtils';

const MOCK_SCHEMES = [
  { id: 'SCH-001', name: 'Century BWP Loyalty Q1', brand: 'Century Plyboards', type: 'Volume',   target: 5000,  achieved: 3840, reward: '₹38,400', deadline: '2026-06-30', status: 'ACTIVE',   pct: 77 },
  { id: 'SCH-002', name: 'Greenply Monsoon Promo',  brand: 'Greenply',          type: 'Purchase', target: 200000, achieved: 145000, reward: '2% on billing', deadline: '2026-07-31', status: 'ACTIVE',   pct: 73 },
  { id: 'SCH-003', name: 'Gauri Q4 Growth Scheme',  brand: 'Gauri Laminates',  type: 'Growth',   target: 120,   achieved: 120,  reward: '₹12,000 gift', deadline: '2026-03-31', status: 'COMPLETED', pct: 100 },
  { id: 'SCH-004', name: 'HPL Monsoon Offer',       brand: 'Merino',            type: 'Volume',   target: 800,   achieved: 210,  reward: '₹8,000 coupon', deadline: '2026-08-31', status: 'ACTIVE',   pct: 26 },
  { id: 'SCH-005', name: 'Century Annual Rebate',   brand: 'Century Plyboards', type: 'Annual',   target: 2000000, achieved: 890000, reward: '3% rebate', deadline: '2026-12-31', status: 'ACTIVE', pct: 45 },
];

const MOCK_TARGETS = [
  { salesperson: 'Ravi Kumar',   product: '18mm BWP',         mtdTarget: 400,    mtdActual: 310,    ytdTarget: 2200,    ytdActual: 1820 },
  { salesperson: 'Priya Sharma', product: 'Laminates',         mtdTarget: 200,    mtdActual: 185,    ytdTarget: 1200,    ytdActual: 1050 },
  { salesperson: 'Ajay Nair',    product: 'All Products',      mtdTarget: 600000, mtdActual: 520000, ytdTarget: 3600000, ytdActual: 2980000 },
  { salesperson: 'Deepa Rao',    product: 'Aluminium Louvers', mtdTarget: 120,    mtdActual: 95,     ytdTarget: 700,     ytdActual: 580 },
];

const STATUS_CLS = { ACTIVE: 'bb', COMPLETED: 'bg', EXPIRED: 'br', PENDING: 'ba' };

function fmtLakh(v) {
  if (!v && v !== 0) return '—';
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

export default function SchemeManagement({ onGoChat, dbStatus, period }) {
  const [tab,     setTab]     = useState('schemes');
  const [schemes, setSchemes] = useState(MOCK_SCHEMES);
  const [targets, setTargets] = useState(MOCK_TARGETS);
  const [src,     setSrc]     = useState('demo');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`/api/schemes?period=${encodeURIComponent(period || 'MTD')}`);
      if (r.ok) {
        const d = await r.json();
        if (d?.schemes?.length) {
          setSchemes(d.schemes.map(s => ({
            ...s,
            pct:    Number(s.pct ?? 0),
            reward: /^\d+$/.test(String(s.reward))
              ? `₹${Number(s.reward).toLocaleString('en-IN')}`
              : s.reward,
          })));
          setSrc(d.data_source || 'demo');
        }
        if (d?.targets?.length) {
          setTargets(d.targets.map(t => ({
            salesperson: t.salesperson,
            product:     t.product,
            mtdTarget:   t.mtd_target  ?? t.mtdTarget  ?? 0,
            mtdActual:   t.mtd_actual  ?? t.mtdActual  ?? 0,
            ytdTarget:   t.ytd_target  ?? t.ytdTarget  ?? 0,
            ytdActual:   t.ytd_actual  ?? t.ytdActual  ?? 0,
          })));
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const active   = schemes.filter(s => s.status === 'ACTIVE');

  const SCHEME_COLS = [
    { key: 'id', label: 'Scheme ID' }, { key: 'name', label: 'Scheme Name' },
    { key: 'brand', label: 'Brand' }, { key: 'type', label: 'Type' },
    { key: 'target', label: 'Target' }, { key: 'achieved', label: 'Achieved' },
    { key: 'reward', label: 'Reward' }, { key: 'deadline', label: 'Deadline' }, { key: 'status', label: 'Status' },
  ];

  if (loading) return <SkeletonView rows={8} />;

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Scheme Management — Promotions · Targets · Accruals</div>
          <div className="psub">Track supplier schemes, sales targets, and earned rewards <DataSourceBadge source={src} /></div>
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
          { cls: 'sg', l: 'Active Schemes',  v: `${active.length}`, d: `▲ From ${new Set(active.map(s => s.brand)).size} brands`, s: 'Check progress weekly' },
          { cls: 'sb', l: 'Avg Achievement', v: active.length ? `${Math.round(active.reduce((s, x) => s + x.pct, 0) / active.length)}%` : '—', d: `▲ On track for ${active.filter(s => s.pct >= 70).length} schemes`, s: 'Push close-to-target schemes' },
          { cls: 'sa', l: 'Schemes Expiring', v: `${active.filter(s => { const d = Math.ceil((new Date(s.deadline) - new Date()) / 86400000); return d >= 0 && d <= 30; }).length} this month`, d: '▼ Review deadlines', s: 'Focus urgent scheme buying' },
          { cls: 'sp', l: 'At Risk (<50%)',   v: `${active.filter(s => s.pct < 50).length} schemes`, d: '▼ Need acceleration', s: 'Redirect buying budget' },
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

      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            {
              icon: '🏆',
              text: `${active.filter(s => s.pct >= 70)[0]?.name ?? 'Top scheme'} at ${active.filter(s => s.pct >= 70)[0]?.pct ?? '—'}% — close to reward`,
              q: (() => {
                const top = active.filter(s => s.pct >= 70)[0];
                return top
                  ? `My ${top.name} scheme from ${top.brand} is at ${top.pct}% with deadline ${top.deadline}. What quantity do I still need to buy and which customers should I push this product to in order to unlock the ${top.reward} reward before the deadline?`
                  : 'Which of my active supplier schemes is closest to hitting its target? What purchases do I need to make to unlock the reward?';
              })(),
            },
            {
              icon: '📅',
              text: 'Annual rebate schemes — plan H2 purchases to hit year-end targets',
              q: `${active.filter(s => s.type === 'Annual').length > 0 ? active.filter(s => s.type === 'Annual').map(s => `${s.name} from ${s.brand} at ${s.pct}%`).join('; ') : 'My annual loyalty schemes'} — create a monthly purchase plan for the remaining months to hit all annual targets and maximize year-end rebates without overstocking.`,
            },
            {
              icon: '🐢',
              text: `${active.filter(s => s.pct < 50).length} schemes below 50% — redirect buying budget or drop`,
              q: `${active.filter(s => s.pct < 50).length} of my active schemes are below 50% achievement. For each one, should I redirect buying budget to accelerate progress, or cut losses and focus on schemes I can realistically hit? Give me a go/no-go recommendation for each.`,
            },
            {
              icon: '💰',
              text: 'ROI ranking — which scheme gives most reward per rupee spent',
              q: `Rank all my active supplier schemes by ROI — reward value vs additional purchase needed to hit target. Which scheme gives me the best return per rupee of incremental buying? Where should I allocate my remaining budget this month?`,
            },
            {
              icon: '📊',
              text: 'Sales team targets — who is behind and needs support to close the month',
              q: `${targets.map(t => `${t.salesperson}: ${t.product}, MTD at ${t.mtdTarget > 0 ? Math.round((t.mtdActual / t.mtdTarget) * 100) : 0}% of target`).join('; ')}. Who needs the most support to hit their target before month end? What specific actions should each salesperson take?`,
            },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Scheme ROI Priority Matrix ── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ch">
          <div>
            <div className="ctit">Scheme ROI Priority Matrix</div>
            <div className="csub">Prioritize schemes by reward/effort ratio — focus where incremental action has the most impact</div>
          </div>
          {onGoChat && (
            <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => onGoChat('Analyze all my active supplier schemes. Rank them by ROI (reward value vs incremental purchase effort needed). Which scheme should I prioritize with my remaining buying budget this month? Give me specific purchase quantities and customer recommendations for each.')}>
              ✨ AI Priority Plan
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {schemes.filter(s => s.status === 'ACTIVE').map(s => {
            const daysLeft  = Math.ceil((new Date(s.deadline) - new Date()) / 86400000);
            const remaining = Math.max(0, s.target - s.achieved);
            const urgency   = s.pct >= 80 ? 'high' : s.pct >= 50 ? 'medium' : 'low';
            const urgColor  = urgency === 'high' ? '#15803d' : urgency === 'medium' ? '#d97706' : '#dc2626';
            const urgBg     = urgency === 'high' ? '#15803d18' : urgency === 'medium' ? '#d977061a' : '#dc26261a';
            const priorityLabel = urgency === 'high' ? '🏆 Close to reward — push now' : urgency === 'medium' ? '⚙ On track — maintain pace' : '⚠ Behind — needs acceleration';
            return (
              <div key={s.id} style={{ background: urgBg, border: `1px solid ${urgColor}40`, borderRadius: 10, padding: '12px 14px', cursor: onGoChat ? 'pointer' : 'default' }}
                onClick={() => onGoChat?.(`My ${s.name} scheme from ${s.brand} is at ${s.pct}% with ${daysLeft} days left and ${remaining.toLocaleString('en-IN')} remaining. What's the fastest path to hit the target and unlock "${s.reward}"? Give me specific customer and product recommendations.`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>{s.name.length > 22 ? s.name.slice(0, 22) + '…' : s.name}</div>
                  <span style={{ background: urgColor + '22', color: urgColor, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{s.pct}%</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>{s.brand} · {s.type}</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--s4)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, s.pct)}%`, height: '100%', background: urgColor, borderRadius: 3 }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>Reward: <span style={{ fontWeight: 700, color: 'var(--g2)' }}>{s.reward}</span></div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>Days left: <span style={{ fontWeight: 700, color: daysLeft < 30 ? '#dc2626' : 'var(--text)' }}>{daysLeft >= 0 ? `${daysLeft}d` : 'Expired'}</span></div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: urgColor }}>{priorityLabel}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, padding: '10px 14px', background: 'var(--s2)', borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {[
            { l: 'Active Schemes',       v: active.length,                                   c: 'var(--b2)' },
            { l: 'Close to target (>70%)', v: active.filter(s => s.pct >= 70).length,        c: 'var(--g2)' },
            { l: 'At risk (<50%)',         v: active.filter(s => s.pct < 50).length,          c: 'var(--r2)' },
            { l: 'Completed this cycle',   v: schemes.filter(s => s.status === 'COMPLETED').length, c: 'var(--purple)' },
          ].map(k => (
            <div key={k.l} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface)', borderRadius: 6, padding: '6px 12px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{k.l}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: k.c, fontSize: 14 }}>{k.v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="seg-tabs" style={{ display:'flex', gap:4, background:'var(--s3)', borderRadius:8, padding:3, border:'1px solid var(--border2)', width:'fit-content', marginBottom:14 }}>
        {[['schemes','Supplier Schemes'],['targets','Sales Targets'],['calendar','Scheme Calendar']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'5px 14px', borderRadius:6, border:'none', background: tab===id?'var(--surface)':'transparent', color: tab===id?'var(--brand)':'var(--text3)', fontWeight: tab===id?700:500, fontSize:12, cursor:'pointer', boxShadow: tab===id?'var(--sh)':undefined, fontFamily:'var(--font)', transition:'all .15s' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'schemes' && (
        <div className="card">
          <div className="ch">
            <div className="ctit">Supplier Schemes &amp; Promotions</div>
            <button className="btn-export" onClick={() => exportToCsv(schemes, SCHEME_COLS, 'schemes')}>
              <svg viewBox="0 0 16 16" fill="none" width="11" height="11"><path d="M8 2v9M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Export CSV
            </button>
          </div>
          <table className="tbl tbl-striped">
            <thead>
              <tr><th>Scheme</th><th>Brand</th><th>Type</th><th>Progress</th><th>Reward</th><th>Deadline</th><th>Status</th></tr>
            </thead>
            <tbody>
              {schemes.map(s => (
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
                        <div className="progress-bar-fill green" style={{ width:`${Math.min(100, s.pct)}%` }} />
                      </div>
                      <div style={{ fontSize:10, color:'var(--text2)', fontFamily:'var(--mono)' }}>
                        {typeof s.achieved === 'number' && s.achieved >= 1000 ? fmtLakh(s.achieved) : s.achieved} / {typeof s.target === 'number' && s.target >= 1000 ? fmtLakh(s.target) : s.target}
                        {' '}({s.pct}%)
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight:600, color:'var(--g2)', fontFamily:'var(--mono)' }}>{s.reward}</td>
                  <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{s.deadline}</td>
                  <td><span className={`bdg ${STATUS_CLS[s.status] ?? 'ba'}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'targets' && (
        <div className="card">
          <div className="ch"><div className="ctit">Sales Team Targets vs Actuals</div></div>
          <table className="tbl tbl-striped">
            <thead>
              <tr><th>Salesperson</th><th>Product/Category</th><th>MTD Target</th><th>MTD Actual</th><th>MTD %</th><th>YTD Target</th><th>YTD Actual</th><th>YTD %</th></tr>
            </thead>
            <tbody>
              {targets.map((t, i) => {
                const mtdPct = t.mtdTarget ? Math.round((t.mtdActual / t.mtdTarget) * 100) : 0;
                const ytdPct = t.ytdTarget ? Math.round((t.ytdActual / t.ytdTarget) * 100) : 0;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight:600 }}>{t.salesperson}</td>
                    <td style={{ fontSize:11, color:'var(--text2)' }}>{t.product}</td>
                    <td style={{ fontFamily:'var(--mono)' }}>{t.mtdTarget >= 1000 ? fmtLakh(t.mtdTarget) : t.mtdTarget}</td>
                    <td style={{ fontFamily:'var(--mono)', fontWeight:600 }}>{t.mtdActual >= 1000 ? fmtLakh(t.mtdActual) : t.mtdActual}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div className="progress-bar-wrap" style={{ width:50 }}>
                          <div className="progress-bar-fill" style={{ width:`${Math.min(100, mtdPct)}%`, background: mtdPct>=80?'var(--g2)':mtdPct>=60?'var(--a2)':'var(--r2)' }} />
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
            {schemes.filter(s => s.status === 'ACTIVE').sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).map(s => {
              const daysLeft = Math.ceil((new Date(s.deadline) - new Date()) / (1000 * 60 * 60 * 24));
              const urgency  = daysLeft < 30 ? 'var(--r2)' : daysLeft < 60 ? 'var(--a2)' : 'var(--g2)';
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
                        <div className="progress-bar-fill green" style={{ width:`${Math.min(100, s.pct)}%` }} />
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
