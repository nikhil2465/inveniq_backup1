import React, { useState, useEffect, useCallback } from 'react';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import Pagination from '../components/Pagination';
import DataSourceBadge from '../components/DataSourceBadge';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt    = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL   = n => { const v = Number(n); return v >= 100000 ? `₹${(v / 100000).toFixed(2)}L` : fmt(v); };
const fmtPct = n => `${Number(n).toFixed(1)}%`;

// ─── Status Maps ──────────────────────────────────────────────────────────────
const CLAIM_STATUS = {
  DRAFT:        { label: 'Draft',        cls: 'ba' },
  SUBMITTED:    { label: 'Submitted',    cls: 'bb' },
  UNDER_REVIEW: { label: 'Under Review', cls: 'bt' },
  APPROVED:     { label: 'Approved',     cls: 'bg' },
  PARTIAL:      { label: 'Partial Approved', cls: 'bp' },
  REJECTED:     { label: 'Rejected',     cls: 'br' },
};
const PROGRAM_STATUS = {
  ACTIVE:   { label: 'Active',   cls: 'bb' },
  ACHIEVED: { label: 'Achieved', cls: 'bg' },
  LAPSED:   { label: 'Lapsed',   cls: 'br' },
  PENDING:  { label: 'Pending',  cls: 'ba' },
};
const CLAIM_TYPE_LABELS = {
  PRICE_DIFF:    'Price Difference',
  DAMAGE:        'Transit Damage',
  FREIGHT_EXCESS:'Freight Excess',
  PROMO_SUPPORT: 'Promo Support',
  SHORTAGE:      'Shortage',
};
const REBATE_TYPE_LABELS = {
  VOLUME:       'Volume Rebate',
  LOYALTY:      'Loyalty Rebate',
  PROJECT:      'Project Rebate',
  ANNUAL_TARGET:'Annual Target',
  ACCRUAL:      'Accrual Scheme',
};

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_CLAIMS = [
  { id:'CC-2601', customer:'Rajesh Construction Pvt Ltd',   type:'PRICE_DIFF',     amount:45000,  status:'APPROVED',      date:'15 Apr 2025', region:'Mumbai',  ref:'SO-1021' },
  { id:'CC-2602', customer:'Modern Interiors & Designs',    type:'DAMAGE',         amount:12500,  status:'SUBMITTED',     date:'22 Apr 2025', region:'Pune',    ref:'SO-1034' },
  { id:'CC-2603', customer:'BuildRight Infrastructure Ltd', type:'PROMO_SUPPORT',  amount:75000,  status:'UNDER_REVIEW',  date:'28 Apr 2025', region:'Nashik',  ref:'SO-1042' },
  { id:'CC-2604', customer:'Skyline Contractors',           type:'FREIGHT_EXCESS', amount:8200,   status:'DRAFT',         date:'02 May 2025', region:'Thane',   ref:'SO-1055' },
  { id:'CC-2605', customer:'Premium Architects Studio',     type:'SHORTAGE',       amount:18900,  status:'APPROVED',      date:'05 May 2025', region:'Mumbai',  ref:'SO-1063' },
  { id:'CC-2606', customer:'Metro Builders & Associates',   type:'PRICE_DIFF',     amount:62000,  status:'PARTIAL',       date:'10 May 2025', region:'Pune',    ref:'SO-1071' },
  { id:'CC-2607', customer:'Sunshine Interiors LLP',        type:'DAMAGE',         amount:9800,   status:'REJECTED',      date:'12 May 2025', region:'Nagpur',  ref:'SO-1078' },
  { id:'CC-2608', customer:'Grand Construction Corp',       type:'PROMO_SUPPORT',  amount:120000, status:'APPROVED',      date:'15 May 2025', region:'Mumbai',  ref:'SO-1085' },
  { id:'CC-2609', customer:'Horizon Developers',            type:'FREIGHT_EXCESS', amount:14600,  status:'SUBMITTED',     date:'18 May 2025', region:'Nasik',   ref:'SO-1091' },
  { id:'CC-2610', customer:'Lakshmi Timber & Hardware',     type:'PRICE_DIFF',     amount:33500,  status:'UNDER_REVIEW',  date:'20 May 2025', region:'Aurangabad',ref:'SO-1097' },
];

const DEMO_PROGRAMS = [
  { id:'RP-101', customer:'Rajesh Construction Pvt Ltd',   type:'VOLUME',       period:'Q1 FY26', target:1000000,  achieved:720000,  accrualRate:3.5,  status:'ACTIVE'   },
  { id:'RP-102', customer:'Modern Interiors & Designs',    type:'ANNUAL_TARGET',period:'FY26',    target:2500000,  achieved:850000,  accrualRate:null, status:'ACTIVE'   },
  { id:'RP-103', customer:'BuildRight Infrastructure Ltd', type:'LOYALTY',      period:'FY26',    target:null,     achieved:3000000, accrualRate:1.5,  status:'ACTIVE'   },
  { id:'RP-104', customer:'Skyline Contractors',           type:'VOLUME',       period:'Q1 FY26', target:500000,   achieved:520000,  accrualRate:4.0,  status:'ACHIEVED' },
  { id:'RP-105', customer:'Premium Architects Studio',     type:'PROJECT',      period:'FY26',    target:1500000,  achieved:1120000, accrualRate:2.0,  status:'ACTIVE'   },
  { id:'RP-106', customer:'Metro Builders & Associates',   type:'ACCRUAL',      period:'Q1 FY26', target:800000,   achieved:560000,  accrualRate:2.5,  status:'ACTIVE'   },
];

// ─── Master Data ──────────────────────────────────────────────────────────────
const CUSTOMERS = [
  'Rajesh Construction Pvt Ltd','Modern Interiors & Designs','BuildRight Infrastructure Ltd',
  'Skyline Contractors','Premium Architects Studio','Metro Builders & Associates',
  'Sunshine Interiors LLP','Grand Construction Corp','Horizon Developers','Lakshmi Timber & Hardware',
  'Apex Furniture Works','Royal Interiors Pvt Ltd',
];
const CATEGORIES = ['Plywood','Laminates','Hardware','Louvers','MDF','Veneer','Glass','Particle Board','Others'];
const QUARTERS = ['Q1 FY26 (Apr–Jun)','Q2 FY26 (Jul–Sep)','Q3 FY26 (Oct–Dec)','Q4 FY26 (Jan–Mar)','FY26 (Full Year)'];
const ACC_MONTHS = {
  'Q1 FY26 (Apr–Jun)':  ['Apr 2025','May 2025','Jun 2025'],
  'Q2 FY26 (Jul–Sep)':  ['Jul 2025','Aug 2025','Sep 2025'],
  'Q3 FY26 (Oct–Dec)':  ['Oct 2025','Nov 2025','Dec 2025'],
  'Q4 FY26 (Jan–Mar)':  ['Jan 2026','Feb 2026','Mar 2026'],
  'FY26 (Full Year)':   ['Apr 2025','May 2025','Jun 2025','Jul 2025','Aug 2025','Sep 2025','Oct 2025','Nov 2025','Dec 2025','Jan 2026','Feb 2026','Mar 2026'],
};

// ─── Reusable Badge ───────────────────────────────────────────────────────────
function Badge({ status, map }) {
  const cfg = (map || {})[status] || { label: status, cls: 'ba' };
  return <span className={`bdg ${cfg.cls}`}>{cfg.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIMS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ClaimsTab({ claims, onGoChat }) {
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('ALL');
  const [typeFilter, setType] = useState('ALL');
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => { setPage(1); }, [search, filter, typeFilter]);

  const filtered = claims.filter(c => {
    if (filter !== 'ALL' && c.status !== filter) return false;
    if (typeFilter !== 'ALL' && c.type !== typeFilter) return false;
    const q = search.toLowerCase();
    if (q && !c.customer.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false;
    return true;
  });

  const totalAmt    = filtered.reduce((s, c) => s + c.amount, 0);
  const approvedAmt = filtered.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.amount, 0);
  const pagedClaims = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* Filter Bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <input
          className="cc-search"
          placeholder="Search by customer name or claim ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="cc-select" style={{ width:'auto', minWidth:140, padding:'7px 10px' }} value={typeFilter} onChange={e => setType(e.target.value)}>
          <option value="ALL">All Types</option>
          {Object.entries(CLAIM_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="chip-row">
          {['ALL','DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','PARTIAL','REJECTED'].map(s => (
            <button key={s} className={`chip${filter === s ? ' sel' : ''}`} onClick={() => setFilter(s)}>
              {s === 'ALL' ? 'All Status' : CLAIM_STATUS[s]?.label || s}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)', flexShrink:0 }}>
          {filtered.length} claims · Total: <strong style={{color:'var(--text)'}}>{fmtL(totalAmt)}</strong>
          {approvedAmt > 0 && <> · Approved: <strong style={{color:'var(--green)'}}>{fmtL(approvedAmt)}</strong></>}
        </div>
      </div>

      {/* Claims Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div className="oc-section">
          <span className="oc-section-title">Claims Register — FY 2025–26</span>
          <span className="oc-section-meta">{filtered.length} of {claims.length} records shown</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Claim ID</th>
              <th>Customer</th>
              <th>Region</th>
              <th>Claim Type</th>
              <th>Ref. Order</th>
              <th style={{ textAlign:'right' }}>Claim Amount</th>
              <th>Filed On</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedClaims.map(c => (
              <tr key={c.id}>
                <td>
                  <span style={{ fontFamily:'var(--mono)', fontWeight:700, fontSize:11, color:'var(--green)' }}>
                    {c.id}
                  </span>
                </td>
                <td style={{ fontWeight:600, color:'var(--text)', maxWidth:200 }}>
                  <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.customer}</div>
                </td>
                <td><span className="bdg bsl">{c.region}</span></td>
                <td><span className="bdg bi">{CLAIM_TYPE_LABELS[c.type] || c.type}</span></td>
                <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)' }}>{c.ref}</td>
                <td style={{ textAlign:'right', fontWeight:700, fontFamily:'var(--mono)', color:'var(--text)', fontSize:12 }}>
                  {fmtL(c.amount)}
                </td>
                <td style={{ fontSize:11, color:'var(--text3)', whiteSpace:'nowrap' }}>{c.date}</td>
                <td><Badge status={c.status} map={CLAIM_STATUS} /></td>
                <td>
                  <button
                    className="cc-action-btn"
                    onClick={() => onGoChat?.(`Analyze claim ${c.id} for ${c.customer} — ${CLAIM_TYPE_LABELS[c.type]} of ${fmt(c.amount)}`)}
                  >
                    ✨ AI Review
                  </button>
                </td>
              </tr>
            ))}
            {pagedClaims.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign:'center', padding:40, color:'var(--text3)', fontSize:13 }}>
                  No claims match the selected filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* Summary Footer */}
      {filtered.length > 0 && (
        <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
          {Object.keys(CLAIM_STATUS).map(s => {
            const cnt = filtered.filter(c => c.status === s).length;
            const amt = filtered.filter(c => c.status === s).reduce((sum, c) => sum + c.amount, 0);
            if (!cnt) return null;
            return (
              <div key={s} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:5, fontSize:11 }}>
                <Badge status={s} map={CLAIM_STATUS} />
                <span style={{ color:'var(--text2)' }}>{cnt} claims</span>
                <span style={{ fontFamily:'var(--mono)', fontWeight:700, color:'var(--text)' }}>{fmtL(amt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REBATE PROGRAMS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ProgramsTab({ programs, onGoChat }) {
  return (
    <div>
      {/* Program Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:18 }}>
        {programs.map(p => {
          const pct = p.target ? Math.min(150, (p.achieved / p.target) * 100) : null;
          const accrualEarned = p.accrualRate ? p.achieved * (p.accrualRate / 100) : null;
          const barColor = pct === null ? 'var(--t2)' : pct >= 100 ? 'var(--g2)' : pct >= 75 ? 'var(--a2)' : 'var(--r2)';
          const pctColor = pct === null ? 'var(--t2)' : pct >= 100 ? 'var(--green)' : pct >= 75 ? 'var(--a2)' : 'var(--r2)';

          return (
            <div key={p.id} className="card cc-prog-card">
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.customer}
                  </div>
                  <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                    {REBATE_TYPE_LABELS[p.type]} · {p.period}
                    <span style={{ marginLeft:6, fontWeight:700 }}>{p.id}</span>
                  </div>
                </div>
                <Badge status={p.status} map={PROGRAM_STATUS} />
              </div>

              {/* Achievement Progress */}
              {pct !== null && (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:5 }}>
                    <span style={{ color:'var(--text3)' }}>Achievement Progress</span>
                    <span style={{ fontWeight:800, fontFamily:'var(--mono)', color:pctColor }}>
                      {fmtPct(Math.min(150, pct))}
                    </span>
                  </div>
                  <div className="oc-progress-wrap" style={{ marginBottom:10 }}>
                    <div className="oc-progress-fill" style={{ background:barColor, width:`${Math.min(100, pct)}%` }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:8 }}>
                    <div>
                      <div style={{ color:'var(--text3)', marginBottom:1 }}>Target</div>
                      <div style={{ fontWeight:700, fontFamily:'var(--mono)' }}>{fmtL(p.target)}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ color:'var(--text3)', marginBottom:1 }}>Achieved</div>
                      <div style={{ fontWeight:700, fontFamily:'var(--mono)', color:pctColor }}>{fmtL(p.achieved)}</div>
                    </div>
                  </div>
                </>
              )}

              {/* Rate / Accrual Info */}
              {p.accrualRate && (
                <div style={{ padding:'8px 10px', background:'var(--s3)', borderRadius:5, border:'1px solid var(--border)', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>
                      Rebate Rate: <strong style={{ color:'var(--text)' }}>{p.accrualRate}%</strong>
                    </span>
                    {accrualEarned !== null && (
                      <span style={{ fontFamily:'var(--mono)', fontWeight:700, fontSize:12, color:'var(--green)' }}>
                        {fmtL(accrualEarned)} earned
                      </span>
                    )}
                  </div>
                </div>
              )}

              <button
                className="cc-action-btn"
                style={{ width:'100%', justifyContent:'center', marginTop:4 }}
                onClick={() => onGoChat?.(`Analyze rebate program ${p.id} for ${p.customer} — ${REBATE_TYPE_LABELS[p.type]}, achievement: ${pct ? fmtPct(pct) : 'N/A'}`)}
              >
                ✨ AI Analysis
              </button>
            </div>
          );
        })}
      </div>

      {/* Programs Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div className="oc-section">
          <span className="oc-section-title">All Rebate Programs</span>
          <span className="oc-section-meta">{programs.length} programs</span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Program ID</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Period</th>
              <th style={{ textAlign:'right' }}>Target (₹)</th>
              <th style={{ textAlign:'right' }}>Achieved (₹)</th>
              <th style={{ textAlign:'right' }}>Rate / Accrual</th>
              <th>Achievement</th>
              <th>Rebate Earned</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {programs.map(p => {
              const pct = p.target ? (p.achieved / p.target) * 100 : null;
              const earned = p.accrualRate ? p.achieved * (p.accrualRate / 100) : null;
              const barColor = pct === null ? 'var(--t2)' : pct >= 100 ? 'var(--g2)' : pct >= 75 ? 'var(--a2)' : 'var(--r2)';
              return (
                <tr key={p.id}>
                  <td><span style={{ fontFamily:'var(--mono)', fontWeight:700, fontSize:11, color:'var(--green)' }}>{p.id}</span></td>
                  <td style={{ fontWeight:600, maxWidth:180 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.customer}</div>
                  </td>
                  <td><span className="bdg bt">{REBATE_TYPE_LABELS[p.type]}</span></td>
                  <td style={{ fontSize:11, color:'var(--text3)', whiteSpace:'nowrap' }}>{p.period}</td>
                  <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:600 }}>
                    {p.target ? fmtL(p.target) : '—'}
                  </td>
                  <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:600 }}>{fmtL(p.achieved)}</td>
                  <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>
                    {p.accrualRate ? `${p.accrualRate}%` : 'Lumpsum'}
                  </td>
                  <td style={{ minWidth:120 }}>
                    {pct !== null ? (
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div className="oc-progress-wrap" style={{ flex:1 }}>
                          <div className="oc-progress-fill" style={{ background:barColor, width:`${Math.min(100, pct)}%` }} />
                        </div>
                        <span style={{ fontFamily:'var(--mono)', fontSize:10, fontWeight:700, color:barColor, minWidth:34 }}>
                          {fmtPct(pct)}
                        </span>
                      </div>
                    ) : <span style={{ color:'var(--text3)', fontSize:11 }}>Ongoing</span>}
                  </td>
                  <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:700, color:'var(--green)' }}>
                    {earned !== null ? fmtL(earned) : '—'}
                  </td>
                  <td><Badge status={p.status} map={PROGRAM_STATUS} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOLUME-WISE CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_VOL_TIERS = [
  { from:0,   to:100,  rate:2.0 },
  { from:101, to:500,  rate:3.5 },
  { from:501, to:null, rate:5.0 },
];

function computeVolume(units, unitPrice, tiers) {
  const u = parseFloat(units);
  const p = parseFloat(unitPrice);
  if (!u || !p || u <= 0 || p <= 0) return null;
  const tier = tiers.find(t => u >= t.from && (t.to === null || u <= t.to));
  if (!tier) return null;
  const purchaseValue = u * p;
  const rebateAmt     = purchaseValue * (tier.rate / 100);
  return {
    tierIndex: tiers.indexOf(tier),
    tierLabel: `${tier.from}${tier.to ? ` – ${tier.to}` : '+'} units`,
    rate: tier.rate, units: u, unitPrice: p,
    purchaseValue, rebateAmt, netAmt: purchaseValue - rebateAmt,
  };
}

function VolumeCalculator() {
  const [customer,  setCustomer]  = useState('Rajesh Construction Pvt Ltd');
  const [category,  setCategory]  = useState('Plywood');
  const [period,    setPeriod]    = useState('Q1 FY26 (Apr–Jun)');
  const [units,     setUnits]     = useState('350');
  const [unitPrice, setUnitPrice] = useState('850');
  const [tiers, setTiers] = useState(DEFAULT_VOL_TIERS);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setResult(computeVolume('350', '850', DEFAULT_VOL_TIERS));
  }, []);

  const updateTier = (idx, field, val) =>
    setTiers(prev => prev.map((t, i) => i === idx ? { ...t, [field]: parseFloat(val) || 0 } : t));

  const calculate = () => setResult(computeVolume(units, unitPrice, tiers));

  const canCalc = units && unitPrice && parseFloat(units) > 0 && parseFloat(unitPrice) > 0;

  return (
    <div className="cc-calc-layout">
      {/* ── Input Panel ── */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Volume-Wise Parameters</div>
            <div className="csub">Tiered rebate based on purchase quantity</div>
          </div>
        </div>

        <div className="cc-form-group">
          <label className="cc-label">Customer</label>
          <select className="cc-select" value={customer} onChange={e => setCustomer(e.target.value)}>
            <option value="">Select Customer…</option>
            {CUSTOMERS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div className="cc-form-group">
            <label className="cc-label">Product Category</label>
            <select className="cc-select" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="cc-form-group">
            <label className="cc-label">Period</label>
            <select className="cc-select" value={period} onChange={e => setPeriod(e.target.value)}>
              {QUARTERS.map(q => <option key={q}>{q}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div className="cc-form-group">
            <label className="cc-label">Purchase Volume (Units)</label>
            <input className="cc-input" type="number" min="0" placeholder="e.g. 350" value={units} onChange={e => setUnits(e.target.value)} />
          </div>
          <div className="cc-form-group">
            <label className="cc-label">Unit Price (₹)</label>
            <input className="cc-input" type="number" min="0" placeholder="e.g. 850" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
          </div>
        </div>

        {/* Tier Structure Table */}
        <div className="cc-form-group">
          <label className="cc-label">Volume Tier Structure (Editable)</label>
          <div className="card" style={{ padding:0, marginTop:6, overflow:'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>From (Units)</th>
                  <th>To (Units)</th>
                  <th>Rebate Rate %</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => (
                  <tr key={i} className={result && result.tierIndex === i ? 'cc-tier-active' : ''}>
                    <td style={{ fontWeight:700, color:'var(--green)', fontFamily:'var(--mono)', fontSize:12 }}>T{i + 1}</td>
                    <td>
                      <input className="cc-input-sm" type="number" value={t.from}
                        onChange={e => updateTier(i, 'from', e.target.value)} />
                    </td>
                    <td>
                      {t.to === null
                        ? <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)' }}>No Limit ∞</span>
                        : <input className="cc-input-sm" type="number" value={t.to}
                            onChange={e => updateTier(i, 'to', e.target.value)} />
                      }
                    </td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <input className="cc-input-sm" type="number" step="0.1" min="0" max="100" value={t.rate}
                          onChange={e => updateTier(i, 'rate', e.target.value)} />
                        <span style={{ fontSize:11, color:'var(--text3)' }}>%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button className="cc-primary-btn" style={{ width:'100%', justifyContent:'center', padding:'10px' }}
          disabled={!canCalc} onClick={calculate}>
          Calculate Volume Rebate →
        </button>
      </div>

      {/* ── Result Panel ── */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Calculation Result</div>
            <div className="csub">Volume-wise rebate breakdown</div>
          </div>
        </div>

        {result ? (
          <>
            {/* Highlight Box */}
            <div className="cc-result-highlight">
              <div className="cc-result-label">Total Rebate Eligible</div>
              <div className="cc-result-value">{fmt(result.rebateAmt)}</div>
              <div className="cc-result-sub">
                @ {fmtPct(result.rate)} on {fmt(result.purchaseValue)} purchase value
              </div>
            </div>

            {/* Detail Rows */}
            <div className="cc-result-rows">
              <div className="cc-result-row">
                <span>Applicable Tier</span>
                <span style={{ fontWeight:700, color:'var(--green)', fontFamily:'var(--mono)' }}>
                  Tier {result.tierIndex + 1}: {result.tierLabel}
                </span>
              </div>
              <div className="cc-result-row">
                <span>Rebate Rate</span>
                <span style={{ fontWeight:700, fontFamily:'var(--mono)' }}>{fmtPct(result.rate)}</span>
              </div>
              <div className="cc-result-row">
                <span>Purchase Volume</span>
                <span style={{ fontFamily:'var(--mono)', fontWeight:600 }}>{result.units.toLocaleString('en-IN')} units</span>
              </div>
              <div className="cc-result-row">
                <span>Unit Price</span>
                <span style={{ fontFamily:'var(--mono)', fontWeight:600 }}>{fmt(result.unitPrice)}</span>
              </div>
              <div className="cc-result-row">
                <span>Gross Purchase Value</span>
                <span style={{ fontFamily:'var(--mono)', fontWeight:700 }}>{fmt(result.purchaseValue)}</span>
              </div>
              <div className="cc-result-row cc-result-row-highlight">
                <span style={{ fontWeight:700 }}>Rebate Amount</span>
                <span style={{ fontWeight:900, color:'var(--green)', fontFamily:'var(--mono)', fontSize:15 }}>
                  {fmt(result.rebateAmt)}
                </span>
              </div>
              <div className="cc-result-row">
                <span>Net Payable (After Rebate)</span>
                <span style={{ fontFamily:'var(--mono)', fontWeight:700 }}>{fmt(result.netAmt)}</span>
              </div>
            </div>

            {/* Tier Applicability Visual */}
            <div style={{ marginTop:4 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.8px', fontFamily:'var(--mono)', marginBottom:8 }}>
                Tier Applicability
              </div>
              {tiers.map((t, i) => {
                const isActive = result.tierIndex === i;
                return (
                  <div key={i} className={isActive ? 'cc-tier-row cc-tier-row-active' : 'cc-tier-row'}>
                    <span style={{ fontSize:11, fontWeight:isActive ? 700 : 400, color:isActive ? 'var(--green)' : 'var(--text3)' }}>
                      Tier {i + 1}: {t.from}{t.to ? ` – ${t.to}` : '+'} units
                    </span>
                    <span style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700, color:isActive ? 'var(--green)' : 'var(--text3)' }}>
                      {t.rate}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="cc-empty-result">
            <div style={{ fontSize:40, marginBottom:14 }}>📦</div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Volume-Wise Rebate Calculator</div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7, maxWidth:280, textAlign:'center' }}>
              Configure tier slabs, enter purchase volume and unit price, then click <strong>Calculate Volume Rebate</strong> to compute the eligible rebate.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCRUAL-WISE CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_ACC_DATA = {
  'Apr 2025': '200000',
  'May 2025': '250000',
  'Jun 2025': '180000',
};

function computeAccrual(months, monthData, rate, settled) {
  const rateDecimal = parseFloat(rate) / 100;
  let cumulative = 0;
  const rows = months.map(m => {
    const purchase  = parseFloat(monthData[m]) || 0;
    const accrual   = purchase * rateDecimal;
    cumulative += accrual;
    return { month: m, purchase, accrual, cumulative };
  });
  const totalAccrual = rows.reduce((s, r) => s + r.accrual, 0);
  const settledAmt   = parseFloat(settled) || 0;
  return { rows, totalAccrual, settled: settledAmt, outstanding: totalAccrual - settledAmt };
}

function AccrualCalculator() {
  const [customer, setCustomer] = useState('Rajesh Construction Pvt Ltd');
  const [scheme,   setScheme]   = useState('Q1 FY26 Loyalty Accrual Scheme');
  const [period,   setPeriod]   = useState('Q1 FY26 (Apr–Jun)');
  const [rate,     setRate]     = useState(1.5);
  const [monthData, setMonthData] = useState(DEFAULT_ACC_DATA);
  const [settled,  setSettled]  = useState('3000');
  const [result,   setResult]   = useState(null);

  const months = ACC_MONTHS[period] || [];

  useEffect(() => {
    setResult(computeAccrual(
      ACC_MONTHS['Q1 FY26 (Apr–Jun)'],
      DEFAULT_ACC_DATA,
      1.5,
      '3000'
    ));
  }, []);

  const setMonthValue = (month, val) =>
    setMonthData(prev => ({ ...prev, [month]: val }));

  const handlePeriodChange = (val) => {
    setPeriod(val);
    setMonthData({});
    setResult(null);
  };

  const calculate = () =>
    setResult(computeAccrual(months, monthData, rate, settled));

  const hasData = months.some(m => parseFloat(monthData[m]) > 0);

  return (
    <div className="cc-calc-layout">
      {/* ── Input Panel ── */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Accrual-Wise Parameters</div>
            <div className="csub">Period-wise rebate accumulation by purchase value</div>
          </div>
        </div>

        <div className="cc-form-group">
          <label className="cc-label">Customer</label>
          <select className="cc-select" value={customer} onChange={e => setCustomer(e.target.value)}>
            <option value="">Select Customer…</option>
            {CUSTOMERS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="cc-form-group">
          <label className="cc-label">Scheme / Program Name</label>
          <input className="cc-input" placeholder="e.g. Loyalty Q1 FY26 Scheme" value={scheme} onChange={e => setScheme(e.target.value)} />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div className="cc-form-group">
            <label className="cc-label">Period</label>
            <select className="cc-select" value={period} onChange={e => handlePeriodChange(e.target.value)}>
              {QUARTERS.map(q => <option key={q}>{q}</option>)}
            </select>
          </div>
          <div className="cc-form-group">
            <label className="cc-label">Accrual Rate (%)</label>
            <input className="cc-input" type="number" step="0.1" min="0" max="100" value={rate}
              onChange={e => setRate(parseFloat(e.target.value) || 0)} />
          </div>
        </div>

        {/* Monthly Purchase Inputs */}
        <div className="cc-form-group">
          <label className="cc-label">Monthly Purchases (₹) — {period}</label>
          <div className="card" style={{ padding:0, marginTop:6, overflow:'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Purchase Value (₹)</th>
                  <th style={{ textAlign:'right' }}>Accrual @ {rate}%</th>
                </tr>
              </thead>
              <tbody>
                {months.map(m => {
                  const val = parseFloat(monthData[m]) || 0;
                  return (
                    <tr key={m}>
                      <td style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:600 }}>{m}</td>
                      <td>
                        <input
                          className="cc-input-sm"
                          style={{ width:'100%', boxSizing:'border-box' }}
                          type="number" min="0"
                          placeholder="0"
                          value={monthData[m] || ''}
                          onChange={e => setMonthValue(m, e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:11, color:'var(--green)', fontWeight: val > 0 ? 700 : 400 }}>
                        {val > 0 ? fmt(val * (rate / 100)) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="cc-form-group">
          <label className="cc-label">Already Settled / Paid Amount (₹)</label>
          <input className="cc-input" type="number" min="0" placeholder="0"
            value={settled} onChange={e => setSettled(e.target.value)} />
        </div>

        <button className="cc-primary-btn" style={{ width:'100%', justifyContent:'center', padding:'10px' }}
          disabled={!hasData} onClick={calculate}>
          Calculate Accrual →
        </button>
      </div>

      {/* ── Result Panel ── */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Accrual Breakdown</div>
            <div className="csub">Month-wise accumulation and outstanding balance</div>
          </div>
        </div>

        {result ? (
          <>
            {/* KPI Summary Row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
              <div className="cc-kpi-mini">
                <div className="cc-kpi-mini-label">Total Accrued</div>
                <div className="cc-kpi-mini-value" style={{ color:'var(--green)' }}>{fmtL(result.totalAccrual)}</div>
              </div>
              <div className="cc-kpi-mini">
                <div className="cc-kpi-mini-label">Settled</div>
                <div className="cc-kpi-mini-value" style={{ color:'var(--text3)' }}>{fmtL(result.settled)}</div>
              </div>
              <div className="cc-kpi-mini" style={{ background:'var(--a3)', borderColor:'var(--a4)' }}>
                <div className="cc-kpi-mini-label">Outstanding</div>
                <div className="cc-kpi-mini-value" style={{ color:'var(--amber)' }}>{fmtL(result.outstanding)}</div>
              </div>
            </div>

            {/* Month-wise Table */}
            <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:12 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign:'right' }}>Purchase (₹)</th>
                    <th style={{ textAlign:'right' }}>Accrual (₹)</th>
                    <th style={{ textAlign:'right' }}>Cumulative (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map(r => (
                    <tr key={r.month}>
                      <td style={{ fontFamily:'var(--mono)', fontWeight:600, fontSize:11 }}>{r.month}</td>
                      <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:11 }}>
                        {r.purchase > 0 ? fmt(r.purchase) : <span style={{ color:'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:11, fontWeight: r.accrual > 0 ? 700 : 400, color: r.accrual > 0 ? 'var(--green)' : 'var(--text3)' }}>
                        {r.accrual > 0 ? fmt(r.accrual) : '—'}
                      </td>
                      <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:11, fontWeight:700 }}>
                        {r.cumulative > 0 ? fmt(r.cumulative) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ fontWeight:800 }}>Total</td>
                    <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:700 }}>
                      {fmt(result.rows.reduce((s, r) => s + r.purchase, 0))}
                    </td>
                    <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:800, color:'var(--green)' }}>
                      {fmt(result.totalAccrual)}
                    </td>
                    <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:800 }}>
                      {fmt(result.totalAccrual)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Outstanding Payable Highlight */}
            <div style={{ padding:'14px 16px', background:'linear-gradient(135deg,var(--g5),var(--g3))', border:'1px solid var(--g4)', borderLeft:'4px solid var(--green)', borderRadius:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'.8px', fontFamily:'var(--mono)', marginBottom:3 }}>
                  Outstanding Payable
                </div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>
                  Total Accrued {fmt(result.totalAccrual)} − Settled {fmt(result.settled)}
                </div>
              </div>
              <div style={{ fontFamily:'var(--mono)', fontWeight:900, fontSize:22, color:'var(--green)', letterSpacing:-1 }}>
                {fmtL(result.outstanding)}
              </div>
            </div>
          </>
        ) : (
          <div className="cc-empty-result">
            <div style={{ fontSize:40, marginBottom:14 }}>📅</div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Accrual-Wise Calculator</div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7, maxWidth:280, textAlign:'center' }}>
              Select a period, enter monthly purchase values, set the accrual rate, and click <strong>Calculate Accrual</strong> to see the period-wise breakdown.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LUMPSUM-WISE CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_SLABS = [
  { label:'Below 75%',    from:0,   to:75,  payout:0 },
  { label:'75% – 90%',    from:75,  to:90,  payout:15000 },
  { label:'90% – 100%',   from:90,  to:100, payout:30000 },
  { label:'100% & Above', from:100, to:null, payout:50000 },
];

function computeLumpsum(target, achievement, slabs) {
  const t = parseFloat(target);
  const a = parseFloat(achievement);
  if (!t || !a || t <= 0) return null;
  const pct = (a / t) * 100;
  const slab = slabs.find(s => pct >= s.from && (s.to === null || pct < s.to))
    || slabs[slabs.length - 1];
  return { pct, target: t, achievement: a, slab, payout: slab.payout };
}

function LumpsumCalculator() {
  const [customer,    setCustomer]    = useState('BuildRight Infrastructure Ltd');
  const [period,      setPeriod]      = useState('Q1 FY26 (Apr–Jun)');
  const [target,      setTarget]      = useState('1000000');
  const [achievement, setAchievement] = useState('850000');
  const [slabs, setSlabs] = useState(DEFAULT_SLABS);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setResult(computeLumpsum('1000000', '850000', DEFAULT_SLABS));
  }, []);

  const updateSlab = (idx, field, val) =>
    setSlabs(prev => prev.map((s, i) =>
      i === idx ? { ...s, [field]: field === 'label' ? val : (parseFloat(val) || 0) } : s
    ));

  const calculate = () => setResult(computeLumpsum(target, achievement, slabs));

  const canCalc = target && achievement && parseFloat(target) > 0 && parseFloat(achievement) > 0;

  return (
    <div className="cc-calc-layout">
      {/* ── Input Panel ── */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Lumpsum-Wise Parameters</div>
            <div className="csub">Target-based fixed payout upon achievement</div>
          </div>
        </div>

        <div className="cc-form-group">
          <label className="cc-label">Customer</label>
          <select className="cc-select" value={customer} onChange={e => setCustomer(e.target.value)}>
            <option value="">Select Customer…</option>
            {CUSTOMERS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="cc-form-group">
          <label className="cc-label">Period</label>
          <select className="cc-select" value={period} onChange={e => setPeriod(e.target.value)}>
            {QUARTERS.map(q => <option key={q}>{q}</option>)}
          </select>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div className="cc-form-group">
            <label className="cc-label">Target Amount (₹)</label>
            <input className="cc-input" type="number" min="0" placeholder="e.g. 1000000"
              value={target} onChange={e => setTarget(e.target.value)} />
          </div>
          <div className="cc-form-group">
            <label className="cc-label">Achievement Amount (₹)</label>
            <input className="cc-input" type="number" min="0" placeholder="e.g. 850000"
              value={achievement} onChange={e => setAchievement(e.target.value)} />
          </div>
        </div>

        {/* Lumpsum Slab Table */}
        <div className="cc-form-group">
          <label className="cc-label">Lumpsum Payout Slabs (Editable)</label>
          <div className="card" style={{ padding:0, marginTop:6, overflow:'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Slab Description</th>
                  <th>From %</th>
                  <th>To %</th>
                  <th>Payout (₹)</th>
                </tr>
              </thead>
              <tbody>
                {slabs.map((s, i) => (
                  <tr key={i} className={result && result.slab === s ? 'cc-tier-active' : ''}>
                    <td>
                      <input className="cc-input-sm" style={{ width:'100%', boxSizing:'border-box' }}
                        value={s.label} onChange={e => updateSlab(i, 'label', e.target.value)} />
                    </td>
                    <td>
                      <input className="cc-input-sm" type="number" value={s.from}
                        onChange={e => updateSlab(i, 'from', e.target.value)} />
                    </td>
                    <td>
                      {s.to === null
                        ? <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)' }}>∞</span>
                        : <input className="cc-input-sm" type="number" value={s.to}
                            onChange={e => updateSlab(i, 'to', e.target.value)} />
                      }
                    </td>
                    <td>
                      <input className="cc-input-sm" type="number" min="0" value={s.payout}
                        onChange={e => updateSlab(i, 'payout', e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button className="cc-primary-btn" style={{ width:'100%', justifyContent:'center', padding:'10px' }}
          disabled={!canCalc} onClick={calculate}>
          Calculate Lumpsum Payout →
        </button>
      </div>

      {/* ── Result Panel ── */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Lumpsum Result</div>
            <div className="csub">Target achievement and applicable payout slab</div>
          </div>
        </div>

        {result ? (
          <>
            {/* Achievement Ring */}
            <div className="cc-achieve-ring">
              <div className="cc-achieve-label">Achievement vs Target</div>
              <div className="cc-achieve-pct" style={{
                color: result.pct >= 100 ? 'var(--green)'
                     : result.pct >= 75  ? 'var(--a2)'
                     : 'var(--r2)'
              }}>
                {fmtPct(result.pct)}
              </div>
              <div style={{ fontSize:12, color:'var(--text3)', marginTop:6 }}>
                {fmt(result.achievement)} achieved of {fmt(result.target)} target
              </div>
            </div>

            {/* Progress Bar with Milestone Markers */}
            <div style={{ marginBottom:18 }}>
              <div style={{ height:14, background:'var(--s4)', borderRadius:7, overflow:'hidden', position:'relative' }}>
                <div style={{
                  height:'100%', borderRadius:7,
                  background: result.pct >= 100 ? 'linear-gradient(90deg,var(--g2),#4ade80)'
                            : result.pct >= 75  ? 'linear-gradient(90deg,var(--a2),#fbbf24)'
                            : 'linear-gradient(90deg,var(--r2),#f87171)',
                  width:`${Math.min(100, result.pct)}%`,
                  transition:'width .8s cubic-bezier(.2,0,.2,1)',
                }} />
                {/* Milestone ticks */}
                {[75, 90, 100].map(pct => (
                  <div key={pct} style={{
                    position:'absolute', top:0, bottom:0,
                    left:`${pct}%`, width:2,
                    background:'rgba(255,255,255,.6)',
                  }} />
                ))}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:9, color:'var(--text3)', fontFamily:'var(--mono)', padding:'0 2px' }}>
                <span>0%</span><span style={{marginLeft:'calc(75% - 16px)'}}>75%</span>
                <span>90%</span><span>100%</span>
              </div>
            </div>

            {/* Applicable Slab Highlight */}
            <div style={{
              background: result.payout > 0
                ? 'linear-gradient(135deg,#F0FAF4,#D6F5E3)'
                : 'linear-gradient(135deg,var(--s3),var(--s4))',
              border:`1px solid ${result.payout > 0 ? 'var(--g4)' : 'var(--border)'}`,
              borderLeft:`4px solid ${result.payout > 0 ? 'var(--g2)' : 'var(--border2)'}`,
              borderRadius:6, padding:16, textAlign:'center', marginBottom:14,
            }}>
              <div style={{ fontSize:9, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1.2px', fontFamily:'var(--mono)', marginBottom:6 }}>
                Applicable Slab
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:result.payout > 0 ? 'var(--green)' : 'var(--text3)', marginBottom:10 }}>
                {result.slab.label}
              </div>
              <div style={{ fontSize:9, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1.2px', fontFamily:'var(--mono)', marginBottom:6 }}>
                Lumpsum Payout
              </div>
              <div style={{ fontSize:32, fontWeight:900, letterSpacing:-1, color: result.payout > 0 ? 'var(--green)' : 'var(--text3)', lineHeight:1 }}>
                {result.payout > 0 ? fmt(result.payout) : 'No Payout'}
              </div>
            </div>

            {/* All Slabs */}
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.8px', fontFamily:'var(--mono)', marginBottom:8 }}>
              All Slabs
            </div>
            {slabs.map((s, i) => {
              const isActive = s === result.slab;
              return (
                <div key={i} className={isActive ? 'cc-slab-row cc-slab-row-active' : 'cc-slab-row'}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {isActive && <span style={{ fontSize:14 }}>✓</span>}
                    <span style={{ fontSize:11, fontWeight:isActive ? 700 : 400, color:isActive ? 'var(--green)' : 'var(--text3)' }}>
                      {s.label}
                    </span>
                  </div>
                  <span style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700, color:isActive ? 'var(--green)' : 'var(--text3)' }}>
                    {s.payout > 0 ? fmt(s.payout) : '₹0'}
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <div className="cc-empty-result">
            <div style={{ fontSize:40, marginBottom:14 }}>🎯</div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Lumpsum-Wise Calculator</div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7, maxWidth:280, textAlign:'center' }}>
              Enter the target and achievement amounts. Customize the payout slabs and click <strong>Calculate Lumpsum Payout</strong> to determine the eligible amount.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CUSTOMER CLAIMS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
export default function CustomerClaims({ onGoChat, dbStatus }) {
  const [tab,      setTab]      = useState('engine');
  const [calcTab,  setCalcTab]  = useState('volume');
  const [claims,   setClaims]   = useState(DEMO_CLAIMS);
  const [programs, setPrograms] = useState(DEMO_PROGRAMS);

  const fetchData = useCallback(async () => {
    try {
      const [cr, pr] = await Promise.all([
        fetch('/api/customer-claims'),
        fetch('/api/rebate-programs'),
      ]);
      if (cr.ok) { const d = await cr.json(); if (d.claims?.length)   setClaims(d.claims); }
      if (pr.ok) { const d = await pr.json(); if (d.programs?.length) setPrograms(d.programs); }
    } catch { /* fallback to demo data */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  // KPI Aggregates
  const totalApproved  = claims.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.amount, 0);
  const totalPending   = claims.filter(c => ['SUBMITTED','UNDER_REVIEW'].includes(c.status)).reduce((s, c) => s + c.amount, 0);
  const activePrograms = programs.filter(p => p.status === 'ACTIVE').length;
  const accrualBalance = programs.filter(p => p.accrualRate).reduce((s, p) => s + (p.achieved * (p.accrualRate / 100)), 0);
  const pendingCount   = claims.filter(c => !['APPROVED','REJECTED'].includes(c.status)).length;

  return (
    <div className="view">
      {/* ── Page Header ── */}
      <div className="ph" style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <div className="pg">Customer Claims &amp; Rebate Management</div>
            <div className="psub">
              Enterprise-grade claim processing with <strong>Volume-Wise</strong>,{' '}
              <strong>Accrual-Wise</strong> and <strong>Lumpsum-Wise</strong> rebate calculation engine
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <DataSourceBadge source={dbStatus?.source} updatedAt={dbStatus?.checkedAt} />
            <button
              className="cc-primary-btn"
              onClick={() => onGoChat?.('Explain how to manage customer claims and rebates effectively — volume, accrual and lumpsum methods')}
            >
              ✨ AI Guidance
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="kg g4" style={{ marginBottom:16 }}>
        <div className="kc sb" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I have ${activePrograms} active rebate programs running in FY26. Summarise which programs are closest to achieving targets and which need intervention.`)}>
          <div className="kt"><span className="kl">Active Programs</span><span className="kconf">FY26</span></div>
          <div className="kv">{activePrograms}</div>
          <div className="kd fl">Rebate schemes running</div>
        </div>
        <div className="kc sa" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I have ${fmtL(totalPending)} in claims pipeline with ${pendingCount} claims awaiting action. Which claims should I prioritise and what are the next steps to resolve them?`)}>
          <div className="kt"><span className="kl">Claims in Pipeline</span><span className="kconf">Pending</span></div>
          <div className="kv">{fmtL(totalPending)}</div>
          <div className="kd wn">{pendingCount} claims awaiting action</div>
        </div>
        <div className="kc sg" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I have approved ${fmtL(totalApproved)} in claims YTD — ${claims.filter(c => c.status === 'APPROVED').length} claims settled. What is my claims approval rate and how can I improve it?`)}>
          <div className="kt"><span className="kl">Approved YTD</span><span className="kconf">FY26</span></div>
          <div className="kv">{fmtL(totalApproved)}</div>
          <div className="kd up">{claims.filter(c => c.status === 'APPROVED').length} claims settled</div>
        </div>
        <div className="kc st" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`My accrual balance outstanding is ${fmtL(accrualBalance)} across ${programs.filter(p => p.accrualRate).length} active schemes. How should I manage these accruals and when should I settle them?`)}>
          <div className="kt"><span className="kl">Accrual Balance</span><span className="kconf">Outstanding</span></div>
          <div className="kv">{fmtL(accrualBalance)}</div>
          <div className="kd fl">Across {programs.filter(p => p.accrualRate).length} active schemes</div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="cc-tab-nav">
        <button
          className={`cc-tab${tab === 'engine' ? ' cc-tab-active' : ''}`}
          onClick={() => setTab('engine')}
        >
          <span className="cc-tab-icon">⚙️</span>
          Calculation Engine
        </button>
        <button
          className={`cc-tab${tab === 'claims' ? ' cc-tab-active' : ''}`}
          onClick={() => setTab('claims')}
        >
          <span className="cc-tab-icon">📋</span>
          Claims Management
          <span className={`cc-tab-badge${pendingCount > 5 ? '' : ' cc-badge-blue'}`}>{pendingCount}</span>
        </button>
        <button
          className={`cc-tab${tab === 'programs' ? ' cc-tab-active' : ''}`}
          onClick={() => setTab('programs')}
        >
          <span className="cc-tab-icon">🎯</span>
          Rebate Programs
          <span className="cc-tab-badge cc-badge-green">{activePrograms}</span>
        </button>
      </div>

      {/* ── Claims Tab ── */}
      {tab === 'claims' && <ClaimsTab claims={claims} onGoChat={onGoChat} />}

      {/* ── Programs Tab ── */}
      {tab === 'programs' && <ProgramsTab programs={programs} onGoChat={onGoChat} />}

      {/* ── Calculation Engine ── */}
      {tab === 'engine' && (
        <div>
          {/* Engine Description Banner */}
          <div className="ai-banner" style={{ marginBottom:14 }}>
            <div className="ai-ic">⚙</div>
            <div className="ai-b">
              <div className="ai-lbl">Rebate Calculation Engine</div>
              <div className="ai-txt">
                Select a calculation method below. <strong>Volume-Wise</strong> computes tiered rebate on purchase quantity.{' '}
                <strong>Accrual-Wise</strong> accumulates period-wise rebate on purchase value.{' '}
                <strong>Lumpsum-Wise</strong> computes fixed payouts based on target achievement slabs.
                All tier/slab structures are fully editable inline.
              </div>
            </div>
          </div>

          {/* Sub-tab Selector */}
          <div className="cc-calc-nav">
            <button
              className={`cc-calc-tab${calcTab === 'volume' ? ' cc-calc-tab-active' : ''}`}
              onClick={() => setCalcTab('volume')}
            >
              <span className="cc-calc-tab-icon">📦</span>
              <div>
                <div className="cc-calc-tab-title">Volume-Wise</div>
                <div className="cc-calc-tab-sub">Tiered rebate on purchase quantity</div>
              </div>
            </button>
            <button
              className={`cc-calc-tab${calcTab === 'accrual' ? ' cc-calc-tab-active' : ''}`}
              onClick={() => setCalcTab('accrual')}
            >
              <span className="cc-calc-tab-icon">📅</span>
              <div>
                <div className="cc-calc-tab-title">Accrual-Wise</div>
                <div className="cc-calc-tab-sub">Period-wise accumulation on purchase value</div>
              </div>
            </button>
            <button
              className={`cc-calc-tab${calcTab === 'lumpsum' ? ' cc-calc-tab-active' : ''}`}
              onClick={() => setCalcTab('lumpsum')}
            >
              <span className="cc-calc-tab-icon">🎯</span>
              <div>
                <div className="cc-calc-tab-title">Lumpsum-Wise</div>
                <div className="cc-calc-tab-sub">Fixed payout on target achievement</div>
              </div>
            </button>
          </div>

          {/* Calculators */}
          {calcTab === 'volume'  && <VolumeCalculator />}
          {calcTab === 'accrual' && <AccrualCalculator />}
          {calcTab === 'lumpsum' && <LumpsumCalculator />}
        </div>
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Analyze my customer claims and rebates — show total outstanding, overdue distributor rebates, and which claims need urgent action this week.')}>
          <span>✨</span>
          <span>Ask AI: Analyze claims, rebates & overdue distributors →</span>
        </div>
      )}
    </div>
  );
}
