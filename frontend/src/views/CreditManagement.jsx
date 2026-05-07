import React, { useState, useEffect } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';

const MOCK_ACCOUNTS = [
  { id: 'C001', name: 'Sharma Constructions',    limit: 500000, used: 340000, overdue: 340000, days: 78, risk: 'HIGH',    phone: '+91 98765 43210', lastOrder: '2026-02-18', pdcCount: 0 },
  { id: 'C002', name: 'Mehta Interiors',          limit: 300000, used: 210000, overdue: 80000,  days: 45, risk: 'MEDIUM',  phone: '+91 87654 32109', lastOrder: '2026-04-02', pdcCount: 1 },
  { id: 'C003', name: 'Prestige Developers',      limit: 800000, used: 620000, overdue: 0,      days: 0,  risk: 'LOW',     phone: '+91 76543 21098', lastOrder: '2026-05-01', pdcCount: 3 },
  { id: 'C004', name: 'City Interiors',           limit: 200000, used: 80000,  overdue: 0,      days: 0,  risk: 'LOW',     phone: '+91 65432 10987', lastOrder: '2026-05-03', pdcCount: 0 },
  { id: 'C005', name: 'Bangalore Building Supp.', limit: 400000, used: 390000, overdue: 190000, days: 62, risk: 'HIGH',    phone: '+91 54321 09876', lastOrder: '2026-03-10', pdcCount: 0 },
  { id: 'C006', name: 'Kumar & Sons',             limit: 250000, used: 120000, overdue: 40000,  days: 35, risk: 'MEDIUM',  phone: '+91 43210 98765', lastOrder: '2026-04-18', pdcCount: 2 },
  { id: 'C007', name: 'Metro Constructions',      limit: 600000, used: 280000, overdue: 0,      days: 0,  risk: 'LOW',     phone: '+91 32109 87654', lastOrder: '2026-05-05', pdcCount: 1 },
  { id: 'C008', name: 'Patel Hardware',           limit: 150000, used: 145000, overdue: 95000,  days: 55, risk: 'HIGH',    phone: '+91 21098 76543', lastOrder: '2026-03-20', pdcCount: 0 },
];

const MOCK_PDC = [
  { cheque: 'CHQ-004521', customer: 'Prestige Developers',  amount: 150000, date: '2026-05-10', bank: 'HDFC',  status: 'PENDING' },
  { cheque: 'CHQ-004522', customer: 'Kumar & Sons',         amount: 40000,  date: '2026-05-15', bank: 'SBI',   status: 'PENDING' },
  { cheque: 'CHQ-004523', customer: 'Metro Constructions',  amount: 80000,  date: '2026-05-20', bank: 'ICICI', status: 'PENDING' },
  { cheque: 'CHQ-004520', customer: 'Mehta Interiors',      amount: 60000,  date: '2026-05-05', bank: 'Axis',  status: 'DEPOSITED' },
  { cheque: 'CHQ-004518', customer: 'Kumar & Sons',         amount: 25000,  date: '2026-04-28', bank: 'SBI',   status: 'CLEARED' },
];

const RISK_COLOR = { HIGH: 'br', MEDIUM: 'ba', LOW: 'bg' };
const RISK_BADGE = { HIGH: 'var(--r2)', MEDIUM: 'var(--a2)', LOW: 'var(--g2)' };

function fmtLakh(v) {
  if (!v && v !== 0) return '—';
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

export default function CreditManagement({ onGoChat, dbStatus, period }) {
  const [accounts, setAccounts] = useState(MOCK_ACCOUNTS);
  const [pdcs, setPdcs]         = useState(MOCK_PDC);
  const [tab, setTab]           = useState('accounts');
  const [filter, setFilter]     = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [src, setSrc]           = useState('demo');

  useEffect(() => {
    fetch('/api/credit/accounts').then(r => r.json()).then(d => {
      if (d?.accounts?.length) { setAccounts(d.accounts); setSrc(d.data_source || 'demo'); }
    }).catch(() => {});
  }, [period]);

  const totalLimit    = accounts.reduce((s, a) => s + a.limit, 0);
  const totalUsed     = accounts.reduce((s, a) => s + a.used, 0);
  const totalOverdue  = accounts.reduce((s, a) => s + a.overdue, 0);
  const highRisk      = accounts.filter(a => a.risk === 'HIGH');
  const utilPct       = totalLimit ? Math.round((totalUsed / totalLimit) * 100) : 0;

  const filtered = filter === 'ALL' ? accounts : accounts.filter(a => a.risk === filter);

  const EXPORT_COLS = [
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Customer' },
    { key: 'limit', label: 'Credit Limit' }, { key: 'used', label: 'Used' },
    { key: 'overdue', label: 'Overdue' }, { key: 'days', label: 'Days Overdue' },
    { key: 'risk', label: 'Risk' },
  ];

  return (
    <div className="view">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Credit Management — Limits · Overdue · PDC Tracking</div>
          <div className="psub">
            Manage customer credit limits, collections, and post-dated cheques
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me a prioritised collections call list with exact amounts, days overdue, and a recovery script for each high-risk customer.')}>
              ✨ AI Collections Plan
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kg g4">
        {[
          { cls: 'sr', l: 'Total Overdue',       v: fmtLakh(totalOverdue), d: `▼ ${highRisk.length} high-risk accounts`, s: 'Needs immediate action' },
          { cls: 'sa', l: 'Credit Utilisation',  v: `${utilPct}%`,          d: `▼ ${fmtLakh(totalUsed)} / ${fmtLakh(totalLimit)}`, s: 'Target: <75% utilisation' },
          { cls: 'sb', l: 'Total Credit Limit',  v: fmtLakh(totalLimit),    d: `▲ ${accounts.length} active accounts`, s: 'Review limits quarterly' },
          { cls: 'sg', l: 'PDC Pending',         v: `${pdcs.filter(p => p.status === 'PENDING').length} cheques`, d: `▲ ${fmtLakh(pdcs.filter(p => p.status === 'PENDING').reduce((s,p) => s+p.amount,0))}`, s: 'Deposit before expiry' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`Tell me about ${k.l.toLowerCase()} and what I should do`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="seg-tabs" style={{ display:'flex', gap:4, background:'var(--s3)', borderRadius:8, padding:3, border:'1px solid var(--border2)', width:'fit-content', marginBottom:14 }}>
        {[['accounts','Customer Accounts'],['pdc','PDC Register'],['aging','Ageing Analysis']].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'5px 14px', borderRadius:6, border:'none', background: tab===id ? '#fff':'transparent', color: tab===id ? 'var(--brand)':'var(--text3)', fontWeight: tab===id ? 700:500, fontSize:12, cursor:'pointer', boxShadow: tab===id ? 'var(--sh)':undefined, fontFamily:'var(--font)', transition:'all .15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Accounts Tab */}
      {tab === 'accounts' && (
        <div className="card">
          <div className="ch">
            <div>
              <div className="ctit">Customer Credit Accounts</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {['ALL','HIGH','MEDIUM','LOW'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding:'3px 11px', borderRadius:20, border:`1px solid ${filter===f ? 'var(--brand)':'var(--border)'}`, background: filter===f ? 'var(--brand)':'var(--surface)', color: filter===f ? '#fff':'var(--text2)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                  {f}
                </button>
              ))}
              <button className="btn-export" onClick={() => exportToCsv(filtered, EXPORT_COLS, 'credit_accounts')}>
                <svg viewBox="0 0 16 16" fill="none" width="11" height="11"><path d="M8 2v9M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Export CSV
              </button>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Customer</th><th>Credit Limit</th><th>Used</th>
                  <th>Utilisation</th><th>Overdue</th><th>Days</th>
                  <th>PDC</th><th>Risk</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const util = a.limit ? Math.round((a.used / a.limit) * 100) : 0;
                  const barColor = util > 90 ? 'var(--r2)' : util > 70 ? 'var(--a2)' : 'var(--g2)';
                  return (
                    <tr key={a.id} onClick={() => setSelected(selected?.id === a.id ? null : a)}
                      style={{ cursor:'pointer', background: selected?.id === a.id ? 'var(--g5)' : undefined }}>
                      <td style={{ fontWeight:600 }}>
                        <div>{a.name}</div>
                        <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>{a.phone}</div>
                      </td>
                      <td style={{ fontFamily:'var(--mono)' }}>{fmtLakh(a.limit)}</td>
                      <td style={{ fontFamily:'var(--mono)', fontWeight:600 }}>{fmtLakh(a.used)}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div className="progress-bar-wrap" style={{ width:60 }}>
                            <div className="progress-bar-fill" style={{ width:`${util}%`, background:barColor }} />
                          </div>
                          <span style={{ fontSize:10, fontFamily:'var(--mono)', color: util>90?'var(--red)':util>70?'var(--amber)':'var(--text2)' }}>{util}%</span>
                        </div>
                      </td>
                      <td style={{ fontFamily:'var(--mono)', fontWeight:700, color: a.overdue>0?'var(--r2)':'var(--g2)' }}>
                        {a.overdue > 0 ? fmtLakh(a.overdue) : '—'}
                      </td>
                      <td>
                        {a.days > 0
                          ? <span className={`bdg ${a.days >= 60 ? 'br' : 'ba'}`}>{a.days}d</span>
                          : <span className="bdg bg">Current</span>}
                      </td>
                      <td>
                        {a.pdcCount > 0
                          ? <span className="bdg bb">{a.pdcCount} PDC</span>
                          : <span style={{ color:'var(--text3)', fontSize:11 }}>—</span>}
                      </td>
                      <td><span className={`bdg ${RISK_COLOR[a.risk]}`}>{a.risk}</span></td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <button style={{ padding:'3px 9px', fontSize:10, borderRadius:5, border:'1px solid var(--border)', background:'var(--s2)', cursor:'pointer', fontFamily:'var(--font)', color:'var(--text2)' }}
                            onClick={e => { e.stopPropagation(); onGoChat?.(`Call script for collecting overdue payment from ${a.name} — ₹${a.overdue} overdue for ${a.days} days`); }}>
                            📞 Script
                          </button>
                          {a.overdue > 0 && (
                            <button style={{ padding:'3px 9px', fontSize:10, borderRadius:5, border:'1px solid var(--r4)', background:'var(--r3)', cursor:'pointer', fontFamily:'var(--font)', color:'var(--red)' }}
                              onClick={e => { e.stopPropagation(); onGoChat?.(`What actions should I take for ${a.name} who has ₹${a.overdue} overdue for ${a.days} days? Should I stop supply?`); }}>
                              ⚠️ Alert
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <div style={{ margin:'14px 16px', padding:'14px 16px', background:'var(--g5)', border:'1px solid var(--g4)', borderRadius:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--text)' }}>{selected.name}</div>
                <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:14 }}>✕</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                {[
                  ['Credit Limit', fmtLakh(selected.limit)],
                  ['Amount Used', fmtLakh(selected.used)],
                  ['Overdue', selected.overdue > 0 ? fmtLakh(selected.overdue) : 'None'],
                  ['Days Overdue', selected.days > 0 ? `${selected.days} days` : 'Current'],
                ].map(([l,v]) => (
                  <div key={l} style={{ background:'var(--surface)', borderRadius:6, padding:'10px 12px', border:'1px solid var(--g4)' }}>
                    <div style={{ fontSize:10, color:'var(--text3)', marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:14, fontWeight:700, fontFamily:'var(--mono)', color:'var(--text)' }}>{v}</div>
                  </div>
                ))}
              </div>
              {onGoChat && (
                <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button className="btn-primary" onClick={() => onGoChat(`Give me a complete collections strategy for ${selected.name}. They owe ₹${selected.overdue} for ${selected.days} days. What are the escalation steps?`)}>
                    ✨ AI Recovery Strategy
                  </button>
                  <button onClick={() => onGoChat(`Draft a formal payment reminder letter for ${selected.name} for overdue amount of ₹${selected.overdue}`)}
                    style={{ padding:'6px 13px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--text2)', fontFamily:'var(--font)' }}>
                    📧 Draft Reminder
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PDC Tab */}
      {tab === 'pdc' && (
        <div className="card">
          <div className="ch">
            <div className="ctit">Post-Dated Cheque Register</div>
            <button className="btn-export" onClick={() => exportToCsv(pdcs, [
              {key:'cheque',label:'Cheque No'},{key:'customer',label:'Customer'},
              {key:'amount',label:'Amount'},{key:'date',label:'Date'},
              {key:'bank',label:'Bank'},{key:'status',label:'Status'},
            ], 'pdc_register')}>
              <svg viewBox="0 0 16 16" fill="none" width="11" height="11"><path d="M8 2v9M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Export CSV
            </button>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Cheque No</th><th>Customer</th><th>Amount</th><th>Date</th><th>Bank</th><th>Status</th></tr>
            </thead>
            <tbody>
              {pdcs.map(p => (
                <tr key={p.cheque}>
                  <td style={{ fontFamily:'var(--mono)', fontWeight:600 }}>{p.cheque}</td>
                  <td>{p.customer}</td>
                  <td style={{ fontFamily:'var(--mono)', fontWeight:700 }}>{fmtLakh(p.amount)}</td>
                  <td style={{ fontFamily:'var(--mono)' }}>{p.date}</td>
                  <td>{p.bank}</td>
                  <td>
                    <span className={`bdg ${p.status === 'CLEARED' ? 'bg' : p.status === 'DEPOSITED' ? 'bb' : 'ba'}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ageing Tab */}
      {tab === 'aging' && (
        <div className="card">
          <div className="ch"><div className="ctit">Receivables Ageing Summary</div></div>
          <table className="tbl">
            <thead>
              <tr><th>Customer</th><th>Current (0-30d)</th><th>31-60d</th><th>61-90d</th><th>90d+</th><th>Total</th></tr>
            </thead>
            <tbody>
              {accounts.filter(a => a.used > 0).map(a => {
                const curr    = a.days === 0 ? a.used : 0;
                const d31_60  = a.days > 30 && a.days <= 60 ? a.overdue : 0;
                const d61_90  = a.days > 60 && a.days <= 90 ? a.overdue : 0;
                const d90plus = a.days > 90 ? a.overdue : 0;
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight:600 }}>{a.name}</td>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--g2)' }}>{curr > 0 ? fmtLakh(curr) : '—'}</td>
                    <td style={{ fontFamily:'var(--mono)', color: d31_60>0?'var(--a2)':'var(--text3)' }}>{d31_60 > 0 ? fmtLakh(d31_60) : '—'}</td>
                    <td style={{ fontFamily:'var(--mono)', color: d61_90>0?'var(--o2)':'var(--text3)' }}>{d61_90 > 0 ? fmtLakh(d61_90) : '—'}</td>
                    <td style={{ fontFamily:'var(--mono)', color: d90plus>0?'var(--r2)':'var(--text3)', fontWeight: d90plus>0?700:400 }}>{d90plus > 0 ? fmtLakh(d90plus) : '—'}</td>
                    <td style={{ fontFamily:'var(--mono)', fontWeight:700 }}>{fmtLakh(a.used)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which customers have crossed their credit limit? What is the risk and what should I do about it?')}>
          <span>✨</span>
          <span>Ask AI: Credit risk analysis — which customers to stop supply immediately →</span>
        </div>
      )}
    </div>
  );
}
