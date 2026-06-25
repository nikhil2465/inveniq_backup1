import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import SkeletonView from '../components/SkeletonLoader';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import { printCreditNote } from '../utils/printUtils';

const TRANSFER_REASONS = [
  'Showroom Replenishment', 'Customer Order Fulfilment', 'Overflow / Capacity Balancing',
  'Quality Hold / Quarantine', 'Dead Stock Rebalancing', 'Emergency Restocking', 'Other',
];
const TRANSFER_UNITS = ['Sheets', 'Packs', 'Pieces', 'Sets', 'Rolls', 'Bags', 'Boxes', 'Kg', 'Running Meters'];

const blankTransferForm = () => ({
  from_godown_id: '', from_godown_name: '', to_godown_id: '', to_godown_name: '',
  sku_code: '', sku_name: '', qty: '', unit: 'Sheets', buy_price: '',
  transfer_date: new Date().toISOString().split('T')[0],
  reason: 'Showroom Replenishment', authorized_by: '', notes: '',
});

const blankDispatchForm = () => ({
  distributor_id: '', distributor_name: '',
  sku_code: '', sku_name: '', category: '',
  qty: '', unit: 'Pieces', buy_price: '', sell_price: '',
  dispatched_by: '', order_ref: '', notes: '',
  dispatch_date: new Date().toISOString().split('T')[0],
});

export default function Inward({ onGoChat, period = 'MTD' }) {
  const [d, setD]               = useState(null);
  const [grnFeed, setGrnFeed]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [drilldownGrn, setDrilldownGrn] = useState(null);
  // Internal transfer state
  const [inwardTab,     setInwardTab]     = useState('grn');    // 'grn' | 'transfer'
  const [warehouses,    setWarehouses]    = useState([]);
  const [transfers,     setTransfers]     = useState([]);
  const [transferForm,  setTransferForm]  = useState(blankTransferForm());
  const [trfSubmitting, setTrfSubmitting] = useState(false);
  const [trfError,      setTrfError]      = useState('');
  const [trfSuccess,    setTrfSuccess]    = useState(null); // last successful transfer response

  const setTF = (k) => (v) => setTransferForm(f => ({ ...f, [k]: v }));

  // Distributor dispatch state
  const [distributors,       setDistributors]       = useState([]);
  const [dispatchForm,       setDispatchForm]       = useState(blankDispatchForm());
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [dispatchError,      setDispatchError]      = useState('');
  const [dispatchSuccess,    setDispatchSuccess]    = useState(null);
  const setDF = (k) => (v) => setDispatchForm(f => ({ ...f, [k]: v }));
  const [catalogProducts, setCatalogProducts] = useState([]);

  const fetchData = useCallback(() => {
    fetch(`/api/inward?period=${encodeURIComponent(period)}`).then(r => r.json()).then(data => { setD(data); setLoading(false); }).catch(() => setLoading(false));
  }, [period]);

  const fetchGrn = useCallback(() => {
    fetch('/api/po-grn/recent-grn?limit=10')
      .then(r => r.json())
      .then(data => setGrnFeed(data))
      .catch(() => {/* silent — fallback to static data */});
  }, []);

  const fetchTransfers = useCallback(() => {
    fetch('/api/warehouse/transfers')
      .then(r => r.json())
      .then(data => setTransfers(data.transfers || []))
      .catch(() => {});
  }, []);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useEffect(() => { fetchGrn(); }, [fetchGrn]);
  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  // Load warehouses for transfer form dropdowns (once)
  useEffect(() => {
    fetch('/api/warehouses')
      .then(r => r.json())
      .then(data => setWarehouses(data.warehouses || []))
      .catch(() => {
        setWarehouses([
          { godown_id: 1, godown_name: 'Main WH (HSR Layout)' },
          { godown_id: 2, godown_name: 'Showroom (Koramangala)' },
          { godown_id: 3, godown_name: 'Overflow (Whitefield)' },
        ]);
      });
  }, []);

  // Poll GRN feed every 30 seconds for real-time activity
  useEffect(() => {
    const id = setInterval(fetchGrn, 30_000);
    return () => clearInterval(id);
  }, [fetchGrn]);

  // Load distributor list for dispatch form (once)
  useEffect(() => {
    fetch('/api/distributors/inventory')
      .then(r => r.json())
      .then(data => setDistributors(data.distributors || []))
      .catch(() => {});
  }, []);

  // Load product catalog for SKU picker (once — catalog is stable)
  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(data => setCatalogProducts(data.products || []))
      .catch(() => {});
  }, []);

  useAutoRefresh(fetchData, 3 * 60_000);

  const handleTransferSubmit = async () => {
    const f = transferForm;
    if (!f.from_godown_id) return setTrfError('Select source warehouse.');
    if (!f.to_godown_id)   return setTrfError('Select destination warehouse.');
    if (f.from_godown_id === f.to_godown_id) return setTrfError('Source and destination must be different.');
    if (!f.sku_name.trim()) return setTrfError('SKU / Product name is required.');
    if (!f.qty || Number(f.qty) <= 0) return setTrfError('Quantity must be greater than zero.');
    if (!f.authorized_by.trim()) return setTrfError('Authorized by is required.');
    setTrfSubmitting(true);
    setTrfError('');
    setTrfSuccess(null);
    try {
      const res = await fetch('/api/warehouse/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_godown_id:   Number(f.from_godown_id),
          from_godown_name: f.from_godown_name,
          to_godown_id:     Number(f.to_godown_id),
          to_godown_name:   f.to_godown_name,
          sku_code:         f.sku_code || f.sku_name.toUpperCase().replace(/\s+/g, '-').slice(0, 20),
          sku_name:         f.sku_name,
          qty:              Number(f.qty),
          unit:             f.unit,
          buy_price:        f.buy_price ? Number(f.buy_price) : null,
          transfer_date:    f.transfer_date || undefined,
          reason:           f.reason,
          authorized_by:    f.authorized_by,
          notes:            f.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Transfer failed.');
      if (data.success) {
        setTrfSuccess(data);
        setTransferForm(blankTransferForm());
        fetchTransfers();
      } else {
        setTrfError(data.detail || 'Transfer failed.');
      }
    } catch (e) {
      setTrfError(e.message || 'Network error — could not reach server.');
    } finally {
      setTrfSubmitting(false);
    }
  };

  const handleDispatchSubmit = async () => {
    const f = dispatchForm;
    if (!f.distributor_name.trim()) return setDispatchError('Distributor name is required.');
    if (!f.sku_name.trim())         return setDispatchError('SKU / Product name is required.');
    if (!f.qty || Number(f.qty) <= 0) return setDispatchError('Quantity must be greater than zero.');
    if (!f.buy_price || Number(f.buy_price) <= 0) return setDispatchError('Buy price is required.');
    if (!f.dispatched_by.trim())    return setDispatchError('Dispatched by is required.');

    setDispatchSubmitting(true);
    setDispatchError('');
    setDispatchSuccess(null);
    try {
      const res = await fetch('/api/stock-dispatch/distributor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distributor_id:   f.distributor_id ? Number(f.distributor_id) : 0,
          distributor_name: f.distributor_name,
          sku_code:         f.sku_code || f.sku_name.toUpperCase().replace(/\s+/g, '-').slice(0, 20),
          sku_name:         f.sku_name,
          category:         f.category || '—',
          qty:              Number(f.qty),
          unit:             f.unit,
          buy_price:        Number(f.buy_price),
          sell_price:       f.sell_price ? Number(f.sell_price) : null,
          dispatched_by:    f.dispatched_by,
          order_ref:        f.order_ref || null,
          notes:            f.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Dispatch failed.');
      if (data.success) {
        setDispatchSuccess(data);
        setDispatchForm(blankDispatchForm());
      } else {
        setDispatchError(data.detail || 'Dispatch failed.');
      }
    } catch (e) {
      setDispatchError(e.message || 'Network error — could not reach server.');
    } finally {
      setDispatchSubmitting(false);
    }
  };

  if (loading) return <SkeletonView />;

  const src = d?.data_source ?? 'demo';
  const grnSrc = grnFeed?.data_source ?? 'demo';
  const inwardQty  = d?.inward_qty  ?? 14;
  const outwardQty = d?.outward_count ?? 16;
  const netChange  = (d?.inward_qty ?? 680) - (d?.outward_qty ?? 520);

  const stages = d?.stages ?? [
    { label: 'Goods Received',     val: inwardQty, sub: `${d?.inward_today ?? '₹6.8L'} value · ${d?.inward_count ?? 4} suppliers`,   color: 'var(--b2)' },
    { label: 'QC / Inspection',    val: Math.round(inwardQty * 0.4), sub: '2 pending >2hrs · Avg 38 min',                            color: 'var(--a2)' },
    { label: 'Put-Away / Shelved', val: Math.round(inwardQty * 0.78), sub: '98% accuracy · 1 mismatch',                             color: 'var(--teal)' },
    { label: 'Pick & Pack',        val: outwardQty + 2, sub: 'Avg pick time: 12 min',                                               color: 'var(--purple)' },
    { label: 'Dispatched Out',     val: outwardQty, sub: `${d?.outward_today ?? '₹8.2L'} value · ${d?.outward_count ?? 12} customers`, color: 'var(--green)' },
  ];

  // Live GRN feed from /api/po-grn/recent-grn, or static fallback
  const recentGrn = grnFeed?.grn_entries?.length
    ? grnFeed.grn_entries.map(g => ({
        grn: g.grn_number, po: g.po_number, supplier: g.supplier,
        value: g.grn_value, invoice_value: g.invoice_value,
        discrepancy_amt: g.discrepancy_amt,
        status: g.match_status, date: g.received_date, product: g.product,
        qty_ordered: g.qty_ordered, qty_received: g.qty_received, unit: g.unit,
        notes: g.notes, received_by: g.received_by,
      }))
    : [
        { grn: 'GRN-4428', po: 'PO-7740', supplier: 'Ebco India Pvt. Ltd.',  value: '₹48,500', invoice_value: '₹48,500', discrepancy_amt: null, status: 'MATCH',    date: 'Today',     product: 'Soft-Close Hinge 35mm', qty_ordered: 100, qty_received: 100, unit: 'packs',  notes: null, received_by: 'Ravi M.' },
        { grn: 'GRN-4427', po: 'PO-7738', supplier: 'Hettich India',          value: '₹64,000', invoice_value: '₹64,000', discrepancy_amt: null, status: 'MATCH',    date: 'Today',     product: 'InnoTech Drawer 400mm', qty_ordered: 50,  qty_received: 50,  unit: 'sets',   notes: null, received_by: 'Santhosh K.' },
        { grn: 'GRN-4426', po: 'PO-7735', supplier: 'Hafele India',           value: '₹64,000', invoice_value: '₹67,840', discrepancy_amt: '₹3,840', status: 'MISMATCH', date: 'Yesterday', product: 'Zinc D-Handle 128mm',   qty_ordered: 212, qty_received: 200, unit: 'pcs',    notes: 'Short by 12 pcs — Hafele to credit note. PO rate ₹320/pc × 212 = ₹67,840 invoiced, only 200 received.', received_by: 'Ravi M.' },
      ];

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Inward &amp; Outward — Stock Movement Intelligence</div>
          <div className="psub">
            AI tracks every unit entering and leaving your warehouse · Shrinkage detection · Dispatch velocity
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me today\'s complete stock movement brief — what came in, what went out, any GRN mismatches, and is there any shrinkage or QC issue I should investigate?')}>
              ✨ AI Movement Brief
            </button>
          )}
        </div>
      </div>

      <div className="ai-banner">
        <div className="ai-ic">AI</div>
        <div className="ai-b">
          <div className="ai-lbl">AI Movement Brief — {src === 'mysql' ? 'Live DB' : 'Demo'}</div>
          <div className="ai-txt">
            <strong>Inward today: {d?.inward_today ?? '₹6.8L'}</strong> across {d?.inward_count ?? 4} consignments.{' '}
            <strong>Outward dispatched: {d?.outward_today ?? '₹8.2L'}</strong>.{' '}
            <strong>Shrinkage MTD: {d?.shrinkage_mtd ?? '₹0.24L'}</strong>.{' '}
            {recentGrn.some(g => g.status === 'MISMATCH') && <strong>⚠️ GRN mismatch detected — review required.</strong>}
          </div>
        </div>
        <div className="ai-ts">{src === 'mysql' ? 'Live' : 'Demo'}<br />{src === 'mysql' ? 'Real-time' : 'Fallback'}</div>
      </div>

      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', fontFamily: 'var(--mono)', marginBottom: '7px' }}>
        Today's Stock Flow Pipeline
      </div>

      <div className="flow-grid">
        {stages.reduce((acc, item, i, arr) => {
          acc.push(
            <div key={item.label} className="flow-card" style={{ borderTop: `3px solid ${item.color}` }}>
              <div className="fl2">{item.label}</div>
              <div className="fv" style={{ color: item.color }}>{item.val}</div>
              <div className="fd">{item.sub}</div>
            </div>
          );
          if (i < arr.length - 1) acc.push(<div key={`arrow-${i}`} className="flow-arrow">→</div>);
          return acc;
        }, [])}
      </div>

      <div className="kg g6">
        {[
          { cls: 'sb', l: 'Inward Today',     v: d?.inward_today  ?? '₹6.8L', d: `▲ ${d?.inward_count ?? 14} consignments`,    s: `${d?.inward_qty ?? 680} sheets received` },
          { cls: 'sg', l: 'Outward Today',    v: d?.outward_today ?? '₹8.2L', d: `▲ ${d?.outward_count ?? 16} dispatches`,     s: `${d?.outward_qty ?? 520} sheets dispatched` },
          { cls: 'st', l: 'Net Stock Change', v: `${netChange >= 0 ? '+' : ''}${netChange}`, d: netChange >= 0 ? '▲ sheets added net' : '▼ net outflow', s: netChange >= 0 ? 'Inward > Outward' : 'Outward > Inward' },
          { cls: 'sa', l: 'Shrinkage MTD',    v: d?.shrinkage_mtd ?? '₹0.24L', d: '▲ Monitored daily', s: 'Industry avg: 0.5%' },
          { cls: 'sr', l: 'GRN Mismatches',   v: String(recentGrn.filter(g => g.status === 'MISMATCH').length), d: '▼ Requires investigation', s: 'Wrong grade / short delivery' },
          { cls: 'sp', l: 'QC Pass Rate',     v: d?.qc_pass_rate ?? '94%', d: '▲ Monitored per batch', s: '6% rejection rate this month' },
        ].map(k => (
          <div key={k.l} className={`kc ${k.cls}`} style={{ cursor: onGoChat ? 'pointer' : 'default' }}
            onClick={() => onGoChat?.(`${k.l} - ${k.d}`)}>
            <div className="kt"><div className="kl">{k.l}</div></div>
            <div className="kv">{k.v}</div>
            <div className="kd wn">{k.d}</div>
            <div className="ks">{k.s}</div>
          </div>
        ))}
      </div>

      {/* ── AI Inward/Outward Opportunity Chips ── */}
      {onGoChat && (
        <div className="ai-opp-strip">
          <span className="ai-opp-label">AI Opportunities</span>
          {[
            { icon: '⚠',  text: 'GRN mismatch detected — Hafele ₹3,840 discrepancy to resolve',     q: 'GRN-4426 from Hafele India shows a ₹3,840 discrepancy — 200 pcs received vs 212 billed. Draft a credit note request letter to Hafele, state the exact shortfall, and tell me what the claim process should be.' },
            { icon: '📦', text: 'QC pending 2 batches >2 hrs — delay risk for dispatch SLA',          q: 'I have 2 QC inspections pending for more than 2 hours, risking dispatch SLA. What is causing QC delays and how should I redesign the QC process for standard grades to reduce average inspection time below 30 minutes?' },
            { icon: '🔄', text: 'Net stock change positive today — verify all units are put away',     q: 'My net stock change today shows more inward than outward. How do I verify that all received units are correctly put away in their designated slots and none are sitting at the receiving bay? What scan-based verification process should I implement?' },
            { icon: '📉', text: 'Shrinkage at ₹0.24L MTD — investigate and prevent recurring losses',  q: 'My shrinkage is ₹0.24L this month. What is the most likely cause — theft, damage, recording error, or GRN mismatch? How do I investigate, identify the source, and prevent this from recurring next month?' },
            { icon: '🤖', text: 'Automate GRN scanning — reduce put-away time from 38 to 15 minutes',  q: 'My average put-away time is 38 minutes per consignment. How do I implement a barcode/QR scan-based GRN process to reduce this to 15 minutes, and what hardware and software changes are needed?' },
          ].map((o, i) => (
            <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
              <span>{o.icon}</span>
              <span>{o.text}</span>
              <span className="ai-opp-chip-arrow">→</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Section Tab Toggle ── */}
      <div className="stabs" style={{ marginTop: 16, marginBottom: 0 }}>
        <button className={`stab${inwardTab === 'grn' ? ' active' : ''}`} onClick={() => setInwardTab('grn')}>
          📋 GRN Feed
        </button>
        <button className={`stab${inwardTab === 'transfer' ? ' active' : ''}`} onClick={() => setInwardTab('transfer')}>
          🔄 Internal Transfer
        </button>
        <button className={`stab${inwardTab === 'dispatch' ? ' active' : ''}`} onClick={() => setInwardTab('dispatch')}>
          📤 Distributor Dispatch
        </button>
      </div>

      {inwardTab === 'grn' && recentGrn.length > 0 && (
        <div className="card" style={{ marginTop: 0, borderRadius: '0 8px 8px 8px' }}>
          <div className="ch">
            <div>
              <div className="ctit">Live GRN Feed</div>
              <div className="csub" style={{ marginTop: 2 }}>
                Real-time goods received · Auto-updates every 30 seconds
                <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4, background: grnSrc === 'mysql' ? 'var(--g3)' : 'var(--s3)', border: `1px solid ${grnSrc === 'mysql' ? 'var(--g4)' : 'var(--border)'}`, borderRadius: 20, padding: '1px 8px', fontSize: 10, fontFamily: 'var(--mono)', color: grnSrc === 'mysql' ? 'var(--green)' : 'var(--text3)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: grnSrc === 'mysql' ? 'var(--g2)' : 'var(--text3)', display: 'inline-block' }} />
                  {grnSrc === 'mysql' ? 'Live DB' : 'Demo'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`bdg ${recentGrn.some(g => g.status === 'MISMATCH') ? 'ba' : 'bg'}`}>
                {recentGrn.filter(g => g.status === 'MISMATCH').length} mismatch
              </span>
              <ExportButton rows={recentGrn} filename="grn_entries" columns={[
                { key: 'grn', label: 'GRN #' }, { key: 'supplier', label: 'Supplier' },
                { key: 'product', label: 'Product' }, { key: 'value', label: 'Value' },
                { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' },
              ]} />
            </div>
          </div>
          <table className="tbl tbl-striped">
            <thead><tr>
              <th>GRN #</th><th>Supplier</th><th>Product</th>
              <th style={{ textAlign: 'right' }}>GRN Value</th>
              <th>Status</th><th>Date</th><th style={{ textAlign: 'center' }}>Detail</th>
            </tr></thead>
            <tbody>
              {recentGrn.map(g => {
                const isMismatch = g.status === 'MISMATCH';
                const isOpen = drilldownGrn === g.grn;
                return (
                  <React.Fragment key={g.grn}>
                    <tr style={{ background: isMismatch ? 'var(--r3)' : undefined }}>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--b2)', fontWeight: 600 }}>{g.grn}</td>
                      <td style={{ fontWeight: 600 }}>{g.supplier}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{g.product || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{g.value}</td>
                      <td><span className={`bdg ${g.status === 'MATCH' ? 'bg' : 'br'}`}>{g.status}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--text2)' }}>{g.date}</td>
                      <td style={{ textAlign: 'center' }}>
                        {isMismatch ? (
                          <button
                            onClick={() => setDrilldownGrn(isOpen ? null : g.grn)}
                            style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                              background: isOpen ? 'var(--r2)' : 'var(--r3)', color: isOpen ? '#fff' : 'var(--r2)',
                              border: '1px solid var(--r4)', fontWeight: 700 }}>
                            {isOpen ? '▲ Hide' : '▼ Details'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--text3)' }}>✓</span>
                        )}
                      </td>
                    </tr>
                    {isMismatch && isOpen && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, borderTop: '2px solid var(--r4)' }}>
                          <div style={{ padding: '16px 20px', background: 'var(--r3)', borderBottom: '1px solid var(--r4)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--r2)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 12 }}>
                              ⚠ GRN Mismatch Detail — {g.grn}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                              {[
                                { label: 'PO Reference', val: g.po || '—' },
                                { label: 'Received By', val: g.received_by || '—' },
                                { label: 'Received On', val: g.date || '—' },
                                { label: 'Qty Ordered', val: g.qty_ordered ? `${g.qty_ordered} ${g.unit || ''}` : '—' },
                                { label: 'Qty Received', val: g.qty_received ? `${g.qty_received} ${g.unit || ''}` : '—' },
                                { label: 'Shortfall', val: (g.qty_ordered && g.qty_received) ? `${g.qty_ordered - g.qty_received} ${g.unit || ''}` : '—' },
                                { label: 'Invoice Value', val: g.invoice_value || '—' },
                                { label: 'Accepted GRN Value', val: g.value || '—' },
                                { label: 'Discrepancy Amount', val: g.discrepancy_amt || '—', hi: true },
                              ].map(({ label, val, hi }) => (
                                <div key={label} style={{ background: 'var(--surface)', border: `1px solid ${hi ? 'var(--r4)' : 'var(--border)'}`, borderRadius: 6, padding: '8px 12px' }}>
                                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                                  <div style={{ fontWeight: 700, color: hi ? 'var(--r2)' : 'var(--text)', fontSize: 13 }}>{val}</div>
                                </div>
                              ))}
                            </div>
                            {g.notes && (
                              <div style={{ background: 'var(--surface)', border: '1px solid var(--r4)', borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'var(--text2)' }}>
                                <strong style={{ color: 'var(--r2)' }}>Notes: </strong>{g.notes}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {onGoChat && (
                                <button className="dap-trigger-btn sm"
                                  onClick={() => onGoChat(`GRN ${g.grn} from ${g.supplier} for ${g.product} has a MISMATCH — invoice value ${g.invoice_value}, GRN value ${g.value}, discrepancy ${g.discrepancy_amt}. Qty ordered: ${g.qty_ordered}, received: ${g.qty_received}. Notes: ${g.notes}. What is the root cause, what is the accounting treatment, and what exact steps should I take to resolve this with the supplier?`)}>
                                  ✨ AI Resolution Guide
                                </button>
                              )}
                              <button
                                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--a4)', color: 'var(--a2)', fontWeight: 600 }}
                                onClick={() => onGoChat?.(`Draft a credit note request to ${g.supplier} for GRN ${g.grn}: shortfall of ${g.qty_ordered && g.qty_received ? g.qty_ordered - g.qty_received : '—'} ${g.unit || 'units'} of ${g.product}, discrepancy amount ${g.discrepancy_amt}. Reference PO ${g.po || '—'}.`)}>
                                📄 Draft Credit Note
                              </button>
                              <button
                                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--b3)', color: 'var(--b2)', fontWeight: 600 }}
                                onClick={() => printCreditNote({ grn: g.grn, po: g.po, supplier: g.supplier, product: g.product, value: g.value, invoice_value: g.invoice_value, discrepancy_amt: g.discrepancy_amt, qty_ordered: g.qty_ordered, qty_received: g.qty_received, unit: g.unit, notes: g.notes, received_by: g.received_by, date: g.date })}>
                                🖨 Print Credit Note
                              </button>
                              <button
                                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', fontWeight: 600 }}
                                onClick={() => setDrilldownGrn(null)}>
                                Close
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {inwardTab === 'transfer' && (
        <div className="card" style={{ marginTop: 0, borderRadius: '0 8px 8px 8px' }}>
          <div className="ch">
            <div className="ctit">Internal Stock Transfer</div>
            <div className="csub">Move stock between warehouses / godowns · Accounting entry auto-generated</div>
          </div>

          {/* Transfer form */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 12 }}>
              🏭 New Transfer Request
            </div>

            {/* From / To warehouse row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>
                  From Warehouse <span style={{ color: 'var(--r2)' }}>*</span>
                </label>
                <select
                  value={transferForm.from_godown_id}
                  onChange={e => {
                    const wh = warehouses.find(w => String(w.godown_id) === e.target.value);
                    setTransferForm(f => ({ ...f, from_godown_id: e.target.value, from_godown_name: wh?.godown_name || '' }));
                  }}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)' }}
                >
                  <option value="">— Select source —</option>
                  {warehouses.map(w => (
                    <option key={w.godown_id} value={w.godown_id}>{w.godown_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>
                  To Warehouse <span style={{ color: 'var(--r2)' }}>*</span>
                </label>
                <select
                  value={transferForm.to_godown_id}
                  onChange={e => {
                    const wh = warehouses.find(w => String(w.godown_id) === e.target.value);
                    setTransferForm(f => ({ ...f, to_godown_id: e.target.value, to_godown_name: wh?.godown_name || '' }));
                  }}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)' }}
                >
                  <option value="">— Select destination —</option>
                  {warehouses.filter(w => String(w.godown_id) !== String(transferForm.from_godown_id)).map(w => (
                    <option key={w.godown_id} value={w.godown_id}>{w.godown_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* SKU row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>
                  SKU / Product <span style={{ color: 'var(--r2)' }}>*</span>
                </label>
                <input
                  list="transfer-sku-catalog"
                  value={transferForm.sku_name}
                  onChange={e => {
                    const name = e.target.value;
                    const prod = catalogProducts.find(p => p.name === name);
                    if (prod) {
                      setTransferForm(f => ({
                        ...f,
                        sku_name:  prod.name,
                        sku_code:  prod.sku_code || '',
                        buy_price: prod.buy_price != null ? String(prod.buy_price) : '',
                      }));
                    } else {
                      setTF('sku_name')(name);
                    }
                  }}
                  placeholder="Type or select from Product Catalog…"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                />
                <datalist id="transfer-sku-catalog">
                  {catalogProducts.map(p => (
                    <option key={p.sku_code || p.product_id} value={p.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>SKU Code</label>
                <input value={transferForm.sku_code} onChange={e => setTF('sku_code')(e.target.value)}
                  placeholder="e.g. 18BWP-C-8x4"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--mono)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Qty / Unit / Buy Price / Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              {[
                { label: 'Qty *', key: 'qty', type: 'number', placeholder: '50' },
                { label: 'Buy Price (₹/unit)', key: 'buy_price', type: 'number', placeholder: '1420' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>{label}</label>
                  <input type={type} value={transferForm[key]} onChange={e => setTF(key)(e.target.value)}
                    placeholder={placeholder}
                    style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Unit</label>
                <select value={transferForm.unit} onChange={e => setTF('unit')(e.target.value)}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)' }}>
                  {TRANSFER_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Transfer Date</label>
                <input type="date" value={transferForm.transfer_date} onChange={e => setTF('transfer_date')(e.target.value)}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Reason / Authorized By row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Reason *</label>
                <select value={transferForm.reason} onChange={e => setTF('reason')(e.target.value)}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)' }}>
                  {TRANSFER_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Authorized By *</label>
                <input value={transferForm.authorized_by} onChange={e => setTF('authorized_by')(e.target.value)}
                  placeholder="Store Manager / Owner name"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Notes (optional)</label>
              <textarea value={transferForm.notes} onChange={e => setTF('notes')(e.target.value)}
                rows={2} placeholder="Any additional instructions or context for this transfer…"
                style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            {/* Accounting preview */}
            {transferForm.from_godown_name && transferForm.to_godown_name && transferForm.qty && transferForm.buy_price && (
              <div style={{ background: 'var(--b5)', border: '1px solid var(--b4)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--b2)', marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', fontFamily: 'var(--mono)' }}>
                  📊 Accounting Entry Preview
                </div>
                <div style={{ display: 'flex', gap: 24, fontFamily: 'var(--mono)', fontSize: 12 }}>
                  <span>
                    <strong style={{ color: 'var(--green)' }}>Dr</strong>: {transferForm.to_godown_name} Stock A/c
                  </span>
                  <span style={{ color: 'var(--text3)' }}>|</span>
                  <span>
                    <strong style={{ color: 'var(--r2)' }}>Cr</strong>: {transferForm.from_godown_name} Stock A/c
                  </span>
                  <span style={{ color: 'var(--text3)' }}>|</span>
                  <strong style={{ color: 'var(--text)' }}>
                    ₹{(Number(transferForm.qty) * Number(transferForm.buy_price)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </strong>
                </div>
              </div>
            )}

            {/* Error */}
            {trfError && (
              <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7, padding: '9px 13px', fontSize: 12, color: 'var(--r2)', marginBottom: 12 }}>
                ⚠ {trfError}
              </div>
            )}

            {/* Success */}
            {trfSuccess && (
              <div style={{ background: 'var(--g3)', border: '1px solid var(--g4)', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13, marginBottom: 6 }}>
                  ✅ Transfer {trfSuccess.transfer_id} recorded successfully!
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                  {trfSuccess.qty} {trfSuccess.sku_name} moved: {trfSuccess.from} → {trfSuccess.to}
                </div>
                {trfSuccess.accounting_entry && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    Dr: {trfSuccess.accounting_entry.debit} &nbsp;|&nbsp;
                    Cr: {trfSuccess.accounting_entry.credit} &nbsp;|&nbsp;
                    ₹{Number(trfSuccess.accounting_entry.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setTransferForm(blankTransferForm()); setTrfError(''); setTrfSuccess(null); }}
                style={{ padding: '9px 18px', background: 'var(--s3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                disabled={trfSubmitting}>
                Reset
              </button>
              <button onClick={handleTransferSubmit} disabled={trfSubmitting}
                style={{ padding: '9px 22px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {trfSubmitting ? '⏳ Processing…' : '🔄 Record Transfer'}
              </button>
            </div>
          </div>

          {/* Transfer history */}
          <div style={{ padding: '14px 20px 4px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 10 }}>
              📋 Transfer History
            </div>
            {transfers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 20px', color: 'var(--text3)', fontSize: 13 }}>
                No transfers recorded yet. Use the form above to create one.
              </div>
            ) : (
              <table className="tbl tbl-striped" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Transfer #</th>
                    <th>From</th>
                    <th>To</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'center' }}>Qty</th>
                    <th>Date</th>
                    <th>Reason</th>
                    <th>Authorized By</th>
                    <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                    <th>Accounting</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t, i) => {
                    const ae = t.accounting_entry || {};
                    return (
                      <tr key={t.transfer_id || i}>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--b2)', fontSize: 11 }}>{t.transfer_id}</td>
                        <td style={{ fontSize: 11, color: 'var(--text2)' }}>{t.from_godown_name}</td>
                        <td style={{ fontSize: 11, fontWeight: 600 }}>{t.to_godown_name}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{t.sku_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{t.sku_code}</div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                          {t.qty} {t.unit}
                        </td>
                        <td style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{t.transfer_date}</td>
                        <td style={{ fontSize: 11, color: 'var(--text2)' }}>{t.reason}</td>
                        <td style={{ fontSize: 11 }}>{t.authorized_by}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                          {ae.amount ? `₹${Number(ae.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                        </td>
                        <td style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                          {ae.debit ? (
                            <span title={`Dr: ${ae.debit} | Cr: ${ae.credit}`}>
                              <span style={{ color: 'var(--green)', fontWeight: 700 }}>Dr</span>: {(ae.debit || '').replace(' Stock A/c', '')}<br />
                              <span style={{ color: 'var(--r2)', fontWeight: 700 }}>Cr</span>: {(ae.credit || '').replace(' Stock A/c', '')}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {inwardTab === 'dispatch' && (
        <div className="card" style={{ marginTop: 0, borderRadius: '0 8px 8px 8px' }}>
          <div className="ch">
            <div className="ctit">Dispatch Stock to Distributor</div>
            <div className="csub">Record stock sent to a distributor · Accounting entry auto-generated · Updates distributor inventory in Warehouse section</div>
          </div>

          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 12 }}>
              🚚 New Distributor Dispatch
            </div>

            {/* Distributor / Order Ref row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>
                  Distributor Name <span style={{ color: 'var(--r2)' }}>*</span>
                </label>
                <input
                  list="dist-dispatch-list"
                  value={dispatchForm.distributor_name}
                  onChange={e => {
                    const dist = distributors.find(d => d.distributor_name === e.target.value);
                    setDispatchForm(f => ({ ...f, distributor_name: e.target.value, distributor_id: dist?.distributor_id || '' }));
                  }}
                  placeholder="Type or select distributor…"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                />
                <datalist id="dist-dispatch-list">
                  {distributors.map(d => <option key={d.distributor_id} value={d.distributor_name} />)}
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Order Reference</label>
                <input value={dispatchForm.order_ref} onChange={e => setDF('order_ref')(e.target.value)}
                  placeholder="ORD-2841"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* SKU row */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>
                  SKU / Product <span style={{ color: 'var(--r2)' }}>*</span>
                </label>
                <input
                  list="dispatch-sku-catalog"
                  value={dispatchForm.sku_name}
                  onChange={e => {
                    const name = e.target.value;
                    const prod = catalogProducts.find(p => p.name === name);
                    if (prod) {
                      setDispatchForm(f => ({
                        ...f,
                        sku_name:   prod.name,
                        sku_code:   prod.sku_code  || '',
                        category:   prod.category  || '',
                        buy_price:  prod.buy_price  != null ? String(prod.buy_price)  : '',
                        sell_price: prod.sell_price != null ? String(prod.sell_price) : '',
                        unit: prod.unit === 'sheet' ? 'Sheets' : prod.unit === 'piece' ? 'Pieces' : prod.unit || f.unit,
                      }));
                    } else {
                      setDF('sku_name')(name);
                    }
                  }}
                  placeholder="Type or select from Product Catalog…"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }}
                />
                <datalist id="dispatch-sku-catalog">
                  {catalogProducts.map(p => (
                    <option key={p.sku_code || p.product_id} value={p.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>SKU Code</label>
                <input value={dispatchForm.sku_code} onChange={e => setDF('sku_code')(e.target.value)}
                  placeholder="EBCO-SCH-35"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--mono)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Category</label>
                <input value={dispatchForm.category} onChange={e => setDF('category')(e.target.value)}
                  placeholder="Hardware Fittings"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Qty / Unit / Buy Price / Sell Price / Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Qty <span style={{ color: 'var(--r2)' }}>*</span></label>
                <input type="number" value={dispatchForm.qty} onChange={e => setDF('qty')(e.target.value)}
                  placeholder="100"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Unit</label>
                <select value={dispatchForm.unit} onChange={e => setDF('unit')(e.target.value)}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)' }}>
                  {TRANSFER_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Buy Price (₹) <span style={{ color: 'var(--r2)' }}>*</span></label>
                <input type="number" value={dispatchForm.buy_price} onChange={e => setDF('buy_price')(e.target.value)}
                  placeholder="485"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Sell Price (₹)</label>
                <input type="number" value={dispatchForm.sell_price} onChange={e => setDF('sell_price')(e.target.value)}
                  placeholder="620"
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Dispatch Date</label>
                <input type="date" value={dispatchForm.dispatch_date} onChange={e => setDF('dispatch_date')(e.target.value)}
                  style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Dispatched by */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>
                Dispatched By <span style={{ color: 'var(--r2)' }}>*</span>
              </label>
              <input value={dispatchForm.dispatched_by} onChange={e => setDF('dispatched_by')(e.target.value)}
                placeholder="Store Manager name"
                style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px', fontFamily: 'var(--mono)' }}>Notes (optional)</label>
              <textarea value={dispatchForm.notes} onChange={e => setDF('notes')(e.target.value)}
                rows={2} placeholder="Any special handling instructions, delivery challan number, etc."
                style={{ width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            {/* Accounting preview */}
            {dispatchForm.distributor_name && dispatchForm.qty && dispatchForm.buy_price && (
              <div style={{ background: 'var(--b5)', border: '1px solid var(--b4)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--b2)', marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', fontFamily: 'var(--mono)' }}>
                  📊 Accounting Entry Preview
                </div>
                <div style={{ display: 'flex', gap: 24, fontFamily: 'var(--mono)', fontSize: 12, flexWrap: 'wrap' }}>
                  <span>
                    <strong style={{ color: 'var(--green)' }}>Dr</strong>: {dispatchForm.distributor_name} Stock A/c
                  </span>
                  <span style={{ color: 'var(--text3)' }}>|</span>
                  <span>
                    <strong style={{ color: 'var(--r2)' }}>Cr</strong>: Warehouse Stock A/c
                  </span>
                  <span style={{ color: 'var(--text3)' }}>|</span>
                  <strong style={{ color: 'var(--text)' }}>
                    ₹{(Number(dispatchForm.qty) * Number(dispatchForm.buy_price)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </strong>
                </div>
              </div>
            )}

            {/* Error */}
            {dispatchError && (
              <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7, padding: '9px 13px', fontSize: 12, color: 'var(--r2)', marginBottom: 12 }}>
                ⚠ {dispatchError}
              </div>
            )}

            {/* Success */}
            {dispatchSuccess && (
              <div style={{ background: 'var(--g3)', border: '1px solid var(--g4)', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13, marginBottom: 4 }}>
                  ✅ Dispatch recorded successfully!
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                  {dispatchSuccess.qty} units of {dispatchSuccess.sku_name} dispatched to <strong>{dispatchSuccess.distributor_name}</strong> on {dispatchSuccess.dispatch_date}.
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
                  Distributor inventory updated. View full inventory in the Warehouse section → Distributor Inventory tab.
                </div>
              </div>
            )}

            {/* Submit */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setDispatchForm(blankDispatchForm()); setDispatchError(''); setDispatchSuccess(null); }}
                style={{ padding: '9px 18px', background: 'var(--s3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                disabled={dispatchSubmitting}>
                Reset
              </button>
              <button
                onClick={handleDispatchSubmit}
                disabled={dispatchSubmitting}
                style={{ padding: '9px 22px', background: 'var(--b2)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {dispatchSubmitting ? '⏳ Processing…' : '📤 Record Dispatch'}
              </button>
            </div>
          </div>

          {/* Current distributor summary */}
          {distributors.length > 0 && (
            <div style={{ padding: '14px 20px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'var(--mono)', marginBottom: 10 }}>
                📋 Active Distributor Inventory Summary
              </div>
              <table className="tbl tbl-striped" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Distributor</th>
                    <th>City</th>
                    <th>Last Dispatch</th>
                    <th style={{ textAlign: 'right' }}>Stock Value</th>
                    <th>SKUs Out</th>
                  </tr>
                </thead>
                <tbody>
                  {distributors.map(d => (
                    <tr key={d.distributor_id}>
                      <td style={{ fontWeight: 700 }}>{d.distributor_name}</td>
                      <td style={{ fontSize: 11, color: 'var(--text2)' }}>{d.city}</td>
                      <td style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{d.last_dispatch_date || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--b2)' }}>{d.total_stock_value_fmt || '—'}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>{d.stock?.length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Explain this GRN mismatch — what likely caused it, what is the financial impact, and what are the exact steps to resolve it with the supplier?')}>
          <span>✨</span>
          <span>Ask AI: Investigate GRN mismatch — root cause, impact, and resolution steps →</span>
        </div>
      )}
    </div>
  );
}
