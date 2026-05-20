import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    CLAIM_RAISED:             { bg: '#eff6ff', color: '#1d4ed8' },
    PENDING:                  { bg: '#fefce8', color: '#a16207' },
    INSURANCE_APPROVED:       { bg: '#f0fdf4', color: '#15803d' },
    RESOLVED:                 { bg: '#f0fdf4', color: '#15803d' },
    SUPPLIER_RETURN_INITIATED:{ bg: '#fef3c7', color: '#92400e' },
  };
  const s = map[status] || { bg: 'var(--s3)', color: 'var(--text3)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '.5px',
      whiteSpace: 'nowrap' }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

// ── Accounting entries block ──────────────────────────────────────────────────
function AccountingEntries({ entries }) {
  if (!entries?.length) return null;
  return (
    <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '12px 16px', marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>
        ACCOUNTING ENTRIES
      </div>
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: 'var(--text1)' }}>{e.dr}</span>
            <span style={{ color: 'var(--r2)', fontWeight: 700, fontFamily: 'var(--mono)' }}>Dr  {fmt(e.amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingLeft: 16, color: 'var(--text3)' }}>
            <span style={{ fontStyle: 'italic' }}>{e.cr}</span>
            <span style={{ color: 'var(--g2)', fontWeight: 600, fontFamily: 'var(--mono)' }}>Cr  {fmt(e.amount)}</span>
          </div>
          {e.narration && (
            <div style={{ fontSize: 10, color: 'var(--text3)', paddingLeft: 16, marginTop: 2 }}>{e.narration}</div>
          )}
          {i < entries.length - 1 && <div style={{ borderBottom: '1px dashed var(--border)', marginTop: 6 }} />}
        </div>
      ))}
    </div>
  );
}

// ── Static mock data ──────────────────────────────────────────────────────────
const MOCK_GRN = [
  { damage_id: 'GD-2026-0018', grn_id: 'GRN-2026-0084', po_number: 'PO-7742', supplier_name: 'Ebco Industries Ltd', damage_date: '2026-05-15', sku_name: 'Ebco Soft-Close Hinge 35mm Pk-10', received_qty: 500, damaged_qty: 12, uom: 'packs', damage_type: 'Physical Damage', damage_description: 'Outer carton crushed — 12 packs cracked', location: 'Main Godown — Whitefield', buy_price: 380, damage_value: 4560, insurance_claimable: true, insurance_claim_id: 'INS-2026-0041', insurance_amount: 4560, photos_pending: false, status: 'CLAIM_RAISED', accounting: { entries: [{ dr: 'Damage Loss A/c', cr: 'Inventory A/c', amount: 4560, narration: 'Damage write-down — 12 packs @ ₹380' }, { dr: 'Insurance Claim Receivable A/c', cr: 'Damage Loss A/c', amount: 4560, narration: 'Insurance claim raised — INS-2026-0041' }] } },
  { damage_id: 'GD-2026-0015', grn_id: 'GRN-2026-0079', po_number: 'PO-7710', supplier_name: 'Jaquar Group', damage_date: '2026-05-08', sku_name: 'Jaquar Lyric Basin Mixer Chrome', received_qty: 20, damaged_qty: 2, uom: 'pcs', damage_type: 'Manufacturing Defect', damage_description: 'Chrome finish peeling — QC inspection', location: 'Main Godown — Whitefield', buy_price: 3200, damage_value: 6400, insurance_claimable: false, insurance_claim_id: null, insurance_amount: 0, photos_pending: true, status: 'SUPPLIER_RETURN_INITIATED', accounting: { entries: [{ dr: 'Damage Loss A/c', cr: 'Inventory A/c', amount: 6400, narration: 'Manufacturing defect — 2 pcs @ ₹3,200' }, { dr: 'Supplier Claim Receivable A/c', cr: 'Damage Loss A/c', amount: 6400, narration: 'Supplier return claim raised' }] } },
  { damage_id: 'GD-2026-0013', grn_id: 'GRN-2026-0071', po_number: 'PO-7688', supplier_name: 'Hettich India Pvt Ltd', damage_date: '2026-05-01', sku_name: 'Hettich InnoTech Drawer 400mm', received_qty: 100, damaged_qty: 3, uom: 'sets', damage_type: 'Packaging Damage', damage_description: 'Packaging torn — 3 sets missing runners', location: 'Transit Hub — Koramangala', buy_price: 880, damage_value: 2640, insurance_claimable: true, insurance_claim_id: 'INS-2026-0038', insurance_amount: 2640, photos_pending: false, status: 'INSURANCE_APPROVED', accounting: { entries: [{ dr: 'Damage Loss A/c', cr: 'Inventory A/c', amount: 2640, narration: 'Packaging damage — 3 sets @ ₹880' }, { dr: 'Insurance Claim Receivable A/c', cr: 'Damage Loss A/c', amount: 2640, narration: 'Insurance claim approved — INS-2026-0038' }] } },
];

const MOCK_TRANSIT = [
  { damage_id: 'TD-2026-0022', so_number: 'SO-2026-0138', customer_name: 'Prestige Developers', damage_date: '2026-05-14', sku_name: 'Hafele Zinc D-Handle 128mm', dispatched_qty: 100, damaged_qty: 8, uom: 'pcs', damage_type: 'Rough Handling by Carrier', damage_description: '8 handles scratched/dented in transit', carrier_name: 'City Express Logistics', sell_price: 320, buy_price: 240, damage_sell_value: 2560, damage_cost_value: 1920, insurance_claimable: true, insurance_claim_id: 'INS-2026-0044', so_adjustment_type: 'Reduce Invoice Qty', so_adjustment_note: 'Invoice revised — credit note issued', credit_note_id: 'CN-2026-0015', customer_notified: true, replacement_status: 'Replacement dispatched', status: 'CLAIM_RAISED', accounting: { entries: [{ dr: 'Transit Loss A/c', cr: 'Inventory A/c (Stock)', amount: 1920, narration: '8 pcs @ ₹240 cost — transit damage' }, { dr: 'Insurance Claim Receivable A/c', cr: 'Transit Loss A/c', amount: 1920, narration: 'Transit insurance claim — INS-2026-0044' }, { dr: 'Sales Return A/c', cr: 'Customer A/c (Prestige Developers)', amount: 2560, narration: 'Credit note CN-2026-0015 for 8 pcs' }] } },
  { damage_id: 'TD-2026-0019', so_number: 'SO-2026-0129', customer_name: 'Sharma Constructions', damage_date: '2026-05-06', sku_name: 'Jaquar Lyric Basin Mixer Chrome', dispatched_qty: 6, damaged_qty: 1, uom: 'pcs', damage_type: 'Vehicle Accident', damage_description: 'Minor road accident — 1 unit shattered', carrier_name: 'Own Vehicle (Bolero DL-7C)', sell_price: 4850, buy_price: 3200, damage_sell_value: 4850, damage_cost_value: 3200, insurance_claimable: true, insurance_claim_id: 'INS-2026-0041', so_adjustment_type: 'Re-dispatch Replacement', so_adjustment_note: 'Replacement delivered next day', credit_note_id: null, customer_notified: true, replacement_status: 'Delivered', status: 'RESOLVED', accounting: { entries: [{ dr: 'Transit Loss A/c', cr: 'Inventory A/c (Stock)', amount: 3200, narration: '1 pc @ ₹3,200 cost — vehicle accident' }, { dr: 'Insurance Claim Receivable A/c', cr: 'Transit Loss A/c', amount: 3200, narration: 'Transit insurance claim' }] } },
];

const GRN_DAMAGE_TYPES     = ['Physical Damage','Moisture / Water Damage','Manufacturing Defect','Short Supply / Missing Units','Packaging Damage','Handling Error'];
const TRANSIT_DAMAGE_TYPES = ['Vehicle Accident','Improper Packaging','Overloading / Pressure Damage','Theft / Pilferage','Weather Exposure','Rough Handling by Carrier'];
const SO_ADJ_TYPES         = ['Reduce Invoice Qty','Raise Credit Note','Re-dispatch Replacement','Cancel SO Line'];

const TABS = ['GRN Damage', 'Transit Damage', 'Record Damage'];

export default function DamageRecording({ dbStatus, period, onGoChat }) {
  // ── ALL hooks declared unconditionally first ─────────────────────────────
  const [tab, setTab]               = useState('GRN Damage');
  const [grnDamages, setGrnDamages] = useState(MOCK_GRN);
  const [transitDmgs, setTransitDmgs] = useState(MOCK_TRANSIT);
  const [src, setSrc]               = useState('demo');
  const [selectedGrn, setSelectedGrn]       = useState(null);
  const [selectedTransit, setSelectedTransit] = useState(null);

  // Record form — shared
  const [dmgKind, setDmgKind]       = useState('GRN');   // 'GRN' | 'TRANSIT'
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState('');
  const [submitErr, setSubmitErr]   = useState('');

  // GRN form fields
  const [grnId, setGrnId]           = useState('');
  const [poNo, setPoNo]             = useState('');
  const [supplier, setSupplier]     = useState('');
  const [grnSku, setGrnSku]         = useState('');
  const [grnSkuName, setGrnSkuName] = useState('');
  const [receivedQty, setReceivedQty] = useState('');
  const [damagedQtyG, setDamagedQtyG] = useState('');
  const [uomG, setUomG]             = useState('pcs');
  const [dmgTypeG, setDmgTypeG]     = useState(GRN_DAMAGE_TYPES[0]);
  const [dmgDescG, setDmgDescG]     = useState('');
  const [locationG, setLocationG]   = useState('');
  const [reportedBy, setReportedBy] = useState('');
  const [buyPriceG, setBuyPriceG]   = useState('');
  const [insuredG, setInsuredG]     = useState(false);

  // Transit form fields
  const [soNo, setSoNo]             = useState('');
  const [custName, setCustName]     = useState('');
  const [transSku, setTransSku]     = useState('');
  const [transSkuName, setTransSkuName] = useState('');
  const [dispatchedQty, setDispatchedQty] = useState('');
  const [damagedQtyT, setDamagedQtyT] = useState('');
  const [uomT, setUomT]             = useState('pcs');
  const [dmgTypeT, setDmgTypeT]     = useState(TRANSIT_DAMAGE_TYPES[0]);
  const [dmgDescT, setDmgDescT]     = useState('');
  const [carrier, setCarrier]       = useState('');
  const [sellPrice, setSellPrice]   = useState('');
  const [buyPriceT, setBuyPriceT]   = useState('');
  const [insuredT, setInsuredT]     = useState(false);
  const [adjType, setAdjType]       = useState(SO_ADJ_TYPES[0]);
  const [adjNote, setAdjNote]       = useState('');
  const [custNotified, setCustNotified] = useState(false);

  // ── Data fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/damage/grn-damages').then(r => r.json()).then(d => {
      if (d?.damages?.length) { setGrnDamages(d.damages); setSrc(d.data_source || 'demo'); }
    }).catch(() => {});
    fetch('/api/damage/transit-damages').then(r => r.json()).then(d => {
      if (d?.damages?.length) setTransitDmgs(d.damages);
    }).catch(() => {});
  }, [period]);

  // ── Submit handlers ───────────────────────────────────────────────────────
  const handleGrnSubmit = useCallback(async () => {
    if (!grnId || !supplier || !grnSkuName || !receivedQty || !damagedQtyG || !buyPriceG) {
      setSubmitErr('Fill all required fields.'); return;
    }
    setSubmitting(true); setSubmitMsg(''); setSubmitErr('');
    try {
      const body = {
        grn_id: grnId, po_number: poNo, supplier_name: supplier,
        sku_code: grnSku, sku_name: grnSkuName,
        received_qty: parseFloat(receivedQty), damaged_qty: parseFloat(damagedQtyG),
        uom: uomG, damage_type: dmgTypeG, damage_description: dmgDescG,
        location: locationG, reported_by: reportedBy,
        buy_price: parseFloat(buyPriceG), insurance_claimable: insuredG, photos_pending: true,
      };
      const res  = await fetch('/api/damage/grn-damages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      setSubmitMsg(data.message);
      setGrnDamages(prev => [data.damage, ...prev]);
      setGrnId(''); setPoNo(''); setSupplier(''); setGrnSku(''); setGrnSkuName('');
      setReceivedQty(''); setDamagedQtyG(''); setDmgDescG(''); setLocationG('');
      setReportedBy(''); setBuyPriceG(''); setInsuredG(false);
    } catch (e) { setSubmitErr(e.message); }
    finally { setSubmitting(false); }
  }, [grnId, poNo, supplier, grnSku, grnSkuName, receivedQty, damagedQtyG, uomG, dmgTypeG, dmgDescG, locationG, reportedBy, buyPriceG, insuredG]);

  const handleTransitSubmit = useCallback(async () => {
    if (!soNo || !custName || !transSkuName || !dispatchedQty || !damagedQtyT || !sellPrice || !buyPriceT) {
      setSubmitErr('Fill all required fields.'); return;
    }
    setSubmitting(true); setSubmitMsg(''); setSubmitErr('');
    try {
      const body = {
        so_number: soNo, customer_name: custName,
        sku_code: transSku, sku_name: transSkuName,
        dispatched_qty: parseFloat(dispatchedQty), damaged_qty: parseFloat(damagedQtyT),
        uom: uomT, damage_type: dmgTypeT, damage_description: dmgDescT,
        carrier_name: carrier,
        sell_price: parseFloat(sellPrice), buy_price: parseFloat(buyPriceT),
        insurance_claimable: insuredT, so_adjustment_type: adjType,
        so_adjustment_note: adjNote, customer_notified: custNotified,
      };
      const res  = await fetch('/api/damage/transit-damages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      setSubmitMsg(data.message);
      setTransitDmgs(prev => [data.damage, ...prev]);
      setSoNo(''); setCustName(''); setTransSku(''); setTransSkuName('');
      setDispatchedQty(''); setDamagedQtyT(''); setDmgDescT(''); setCarrier('');
      setSellPrice(''); setBuyPriceT(''); setInsuredT(false); setAdjNote(''); setCustNotified(false);
    } catch (e) { setSubmitErr(e.message); }
    finally { setSubmitting(false); }
  }, [soNo, custName, transSku, transSkuName, dispatchedQty, damagedQtyT, uomT, dmgTypeT, dmgDescT, carrier, sellPrice, buyPriceT, insuredT, adjType, adjNote, custNotified]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalGrnValue     = grnDamages.reduce((s, d) => s + (d.damage_value || 0), 0);
  const totalTransitValue = transitDmgs.reduce((s, d) => s + (d.damage_sell_value || 0), 0);
  const openClaims        = [...grnDamages, ...transitDmgs].filter(d => d.status === 'CLAIM_RAISED' || d.status === 'PENDING').length;
  const insuredTotal      = [...grnDamages, ...transitDmgs].filter(d => d.insurance_claimable).reduce((s, d) => s + (d.insurance_amount || 0), 0);

  const GRN_EXPORT = [
    { key: 'damage_id', label: 'Damage ID' }, { key: 'grn_id', label: 'GRN ID' },
    { key: 'supplier_name', label: 'Supplier' }, { key: 'damage_date', label: 'Date' },
    { key: 'sku_name', label: 'Product' }, { key: 'damaged_qty', label: 'Damaged Qty' },
    { key: 'damage_value', label: 'Value (₹)' }, { key: 'status', label: 'Status' },
  ];

  const TRANSIT_EXPORT = [
    { key: 'damage_id', label: 'Damage ID' }, { key: 'so_number', label: 'SO No' },
    { key: 'customer_name', label: 'Customer' }, { key: 'damage_date', label: 'Date' },
    { key: 'sku_name', label: 'Product' }, { key: 'damaged_qty', label: 'Damaged Qty' },
    { key: 'damage_sell_value', label: 'SO Impact (₹)' }, { key: 'status', label: 'Status' },
  ];

  const tabStyle = (id) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: tab === id ? 700 : 500,
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: tab === id ? 'var(--brand)' : 'var(--text3)',
    borderBottom: tab === id ? '2px solid var(--brand)' : '2px solid transparent',
    transition: 'all .15s',
  });

  const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' };
  const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 };

  return (
    <div className="view">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Damage Recording — GRN · Transit · Accounting</div>
          <div className="psub">
            Record inward damage after GRN receipt and transit damage during SO dispatch,
            with automatic accounting entries and insurance claim initiation
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <>
              <button className="btn-primary"
                onClick={() => onGoChat('Analyze my recent damage incidents — what are the biggest loss sources and how can I reduce damage in GRN and transit?')}>
                ✨ AI Analysis
              </button>
              <button className="btn-secondary"
                onClick={() => onGoChat('What is the process for filing an insurance claim for goods damaged in transit? What documents are needed?')}>
                ✨ Insurance Claim Guide
              </button>
            </>
          )}
          {tab === 'GRN Damage' && (
            <button className="btn-secondary" onClick={() => exportToCsv(grnDamages, GRN_EXPORT, 'grn-damages')}>
              Export CSV
            </button>
          )}
          {tab === 'Transit Damage' && (
            <button className="btn-secondary" onClick={() => exportToCsv(transitDmgs, TRANSIT_EXPORT, 'transit-damages')}>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card sr">
          <div className="kl">GRN Damage Value</div>
          <div className="kv">{fmt(totalGrnValue)}</div>
          <div className="ks">{grnDamages.length} incidents</div>
        </div>
        <div className="kpi-card sa">
          <div className="kl">Transit Damage</div>
          <div className="kv">{fmt(totalTransitValue)}</div>
          <div className="ks">{transitDmgs.length} incidents (sell value)</div>
        </div>
        <div className="kpi-card sb">
          <div className="kl">Insurance Recoverable</div>
          <div className="kv">{fmt(insuredTotal)}</div>
          <div className="ks">Claim value in progress</div>
        </div>
        <div className="kpi-card sg">
          <div className="kl">Open Claims</div>
          <div className="kv">{openClaims}</div>
          <div className="ks">Pending resolution</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => { setTab(t); setSubmitMsg(''); setSubmitErr(''); }}>{t}</button>)}
      </div>

      {/* ── GRN Damage tab ─────────────────────────────────────────────────── */}
      {tab === 'GRN Damage' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Damage ID</th><th>GRN / PO</th><th>Supplier</th><th>Date</th>
                <th>Product</th><th>Damaged</th><th>Damage Value</th>
                <th>Insurance</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {grnDamages.map(d => (
                <React.Fragment key={d.damage_id}>
                  <tr onClick={() => setSelectedGrn(selectedGrn?.damage_id === d.damage_id ? null : d)}
                    style={{ cursor: 'pointer', background: selectedGrn?.damage_id === d.damage_id ? 'var(--s2)' : 'transparent' }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--r2)', fontWeight: 700 }}>{d.damage_id}</td>
                    <td style={{ fontSize: 11 }}>
                      <div style={{ fontFamily: 'var(--mono)', color: 'var(--brand)' }}>{d.grn_id}</div>
                      <div style={{ color: 'var(--text3)' }}>{d.po_number}</div>
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{d.supplier_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{d.damage_date}</td>
                    <td style={{ fontSize: 12 }}>{d.sku_name}</td>
                    <td style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: 'var(--r2)' }}>{d.damaged_qty}</span>
                      <span style={{ color: 'var(--text3)', marginLeft: 4 }}>{d.uom}</span>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>of {d.received_qty} received</div>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--r2)' }}>{fmt(d.damage_value)}</td>
                    <td style={{ fontSize: 11 }}>
                      {d.insurance_claimable ? (
                        <span style={{ color: 'var(--g2)', fontWeight: 600 }}>
                          ✓ {d.insurance_claim_id || 'Claimable'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3)' }}>
                          {d.damage_type?.includes('Defect') ? 'Supplier Claim' : 'None'}
                        </span>
                      )}
                    </td>
                    <td><StatusBadge status={d.status} /></td>
                    <td style={{ color: 'var(--brand)', fontSize: 11 }}>{selectedGrn?.damage_id === d.damage_id ? '▲' : '▼'}</td>
                  </tr>
                  {selectedGrn?.damage_id === d.damage_id && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <div style={{ background: 'var(--s2)', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>DAMAGE DETAILS</div>
                              <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 14, border: '1px solid var(--border)' }}>
                                <div style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Damage Type: </span>
                                  <span style={{ fontSize: 12, fontWeight: 600 }}>{d.damage_type}</span>
                                </div>
                                <div style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Description: </span>
                                  <span style={{ fontSize: 12 }}>{d.damage_description}</span>
                                </div>
                                <div style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Location: </span>
                                  <span style={{ fontSize: 12 }}>{d.location}</span>
                                </div>
                                <div style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Reported By: </span>
                                  <span style={{ fontSize: 12 }}>{d.reported_by}</span>
                                </div>
                                <div style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Buy Price: </span>
                                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{fmt(d.buy_price)}/{d.uom}</span>
                                </div>
                                <div style={{ marginTop: 10, padding: '8px 12px', background: d.photos_pending ? '#fef3c7' : '#f0fdf4', borderRadius: 6 }}>
                                  {d.photos_pending
                                    ? <span style={{ fontSize: 11, color: '#92400e' }}>⚠ Photos / documentation pending</span>
                                    : <span style={{ fontSize: 11, color: '#15803d' }}>✓ Photos attached</span>}
                                </div>
                              </div>
                              {onGoChat && (
                                <button className="btn-secondary" style={{ marginTop: 10, width: '100%', fontSize: 12 }}
                                  onClick={() => onGoChat(`Analyze this GRN damage: ${d.damaged_qty} ${d.uom} of ${d.sku_name} from supplier ${d.supplier_name}. Damage type: ${d.damage_type}. Value: ₹${d.damage_value}. What actions should I take and how do I recover maximum value?`)}>
                                  ✨ Ask AI — Recovery Strategy
                                </button>
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>ACCOUNTING ENTRIES</div>
                              <AccountingEntries entries={d.accounting?.entries} />
                              <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}>
                                <div style={{ color: 'var(--text3)', marginBottom: 4 }}>Inventory write-down:</div>
                                <div style={{ fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--r2)', fontSize: 14 }}>{fmt(d.damage_value)}</div>
                                {d.insurance_claimable && d.insurance_amount > 0 && (
                                  <>
                                    <div style={{ color: 'var(--text3)', marginTop: 8, marginBottom: 4 }}>Insurance claim amount:</div>
                                    <div style={{ fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--g2)', fontSize: 14 }}>{fmt(d.insurance_amount)}</div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {grnDamages.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No GRN damage records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Transit Damage tab ────────────────────────────────────────────── */}
      {tab === 'Transit Damage' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Damage ID</th><th>SO No</th><th>Customer</th><th>Date</th>
                <th>Product</th><th>Damaged</th><th>SO Impact</th>
                <th>Adjustment</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {transitDmgs.map(d => (
                <React.Fragment key={d.damage_id}>
                  <tr onClick={() => setSelectedTransit(selectedTransit?.damage_id === d.damage_id ? null : d)}
                    style={{ cursor: 'pointer', background: selectedTransit?.damage_id === d.damage_id ? 'var(--s2)' : 'transparent' }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--r2)', fontWeight: 700 }}>{d.damage_id}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--brand)' }}>{d.so_number}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{d.customer_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{d.damage_date}</td>
                    <td style={{ fontSize: 12 }}>{d.sku_name}</td>
                    <td style={{ fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: 'var(--r2)' }}>{d.damaged_qty}</span>
                      <span style={{ color: 'var(--text3)', marginLeft: 4 }}>{d.uom}</span>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>of {d.dispatched_qty} dispatched</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--r2)' }}>{fmt(d.damage_sell_value)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>Cost: {fmt(d.damage_cost_value)}</div>
                    </td>
                    <td style={{ fontSize: 11 }}>
                      <div style={{ color: 'var(--brand)', fontWeight: 600 }}>{d.so_adjustment_type}</div>
                      {d.credit_note_id && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{d.credit_note_id}</div>}
                    </td>
                    <td><StatusBadge status={d.status} /></td>
                    <td style={{ color: 'var(--brand)', fontSize: 11 }}>{selectedTransit?.damage_id === d.damage_id ? '▲' : '▼'}</td>
                  </tr>
                  {selectedTransit?.damage_id === d.damage_id && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <div style={{ background: 'var(--s2)', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>TRANSIT DAMAGE DETAILS</div>
                              <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 14, border: '1px solid var(--border)' }}>
                                <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: 'var(--text3)' }}>Damage Type: </span><span style={{ fontSize: 12, fontWeight: 600 }}>{d.damage_type}</span></div>
                                <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: 'var(--text3)' }}>Description: </span><span style={{ fontSize: 12 }}>{d.damage_description}</span></div>
                                <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: 'var(--text3)' }}>Carrier: </span><span style={{ fontSize: 12 }}>{d.carrier_name}</span></div>
                                <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: 'var(--text3)' }}>Sell Price: </span><span style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{fmt(d.sell_price)}/{d.uom}</span></div>
                                <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: 'var(--text3)' }}>Buy Price: </span><span style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{fmt(d.buy_price)}/{d.uom}</span></div>
                                <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: 'var(--text3)' }}>Customer Notified: </span><span style={{ fontSize: 12, fontWeight: 600, color: d.customer_notified ? 'var(--g2)' : 'var(--r2)' }}>{d.customer_notified ? '✓ Yes' : '✗ No'}</span></div>
                                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>SO Adjustment: <strong>{d.so_adjustment_note}</strong></div>
                                {d.replacement_status && <div style={{ marginTop: 6, fontSize: 12 }}><span style={{ color: 'var(--text3)' }}>Replacement: </span><span style={{ fontWeight: 600, color: 'var(--brand)' }}>{d.replacement_status}</span></div>}
                              </div>
                              {onGoChat && (
                                <button className="btn-secondary" style={{ marginTop: 10, width: '100%', fontSize: 12 }}
                                  onClick={() => onGoChat(`Help me manage this transit damage: ${d.damaged_qty} ${d.uom} of ${d.sku_name} damaged in transit to ${d.customer_name}. Carrier: ${d.carrier_name}. Sell value affected: ₹${d.damage_sell_value}. Adjustment type: ${d.so_adjustment_type}. What are my next steps?`)}>
                                  ✨ Ask AI — Next Steps
                                </button>
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>ACCOUNTING ENTRIES</div>
                              <AccountingEntries entries={d.accounting?.entries} />
                              {d.insurance_claim_id && (
                                <div style={{ marginTop: 10, padding: '10px 14px', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe', fontSize: 12 }}>
                                  <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>Insurance Claim</div>
                                  <div>Claim ID: <strong>{d.insurance_claim_id}</strong></div>
                                  <div>Amount: <strong style={{ fontFamily: 'var(--mono)' }}>{fmt(d.insurance_amount)}</strong></div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {transitDmgs.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No transit damage records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Record Damage tab ─────────────────────────────────────────────── */}
      {tab === 'Record Damage' && (
        <div>
          {/* Damage kind toggle */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[['GRN','Post-GRN / Inward Damage'],['TRANSIT','Transit Damage (SO Dispatch)']].map(([id, label]) => (
              <button key={id} onClick={() => { setDmgKind(id); setSubmitMsg(''); setSubmitErr(''); }}
                style={{ flex: 1, padding: '14px 20px', borderRadius: 10, border: dmgKind === id ? 'none' : '1px solid var(--border)',
                  background: dmgKind === id ? 'var(--brand)' : 'var(--surface)',
                  color: dmgKind === id ? '#fff' : 'var(--text2)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  transition: '.15s', textAlign: 'center' }}>
                {id === 'GRN' ? '📦' : '🚚'} {label}
              </button>
            ))}
          </div>

          {/* ── GRN damage form ─────────────────────────────────────────── */}
          {dmgKind === 'GRN' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card" style={{ padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: 'var(--text1)' }}>Record Post-GRN Damage</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>GRN ID *</label>
                    <input style={inp} value={grnId} onChange={e => setGrnId(e.target.value)} placeholder="GRN-2026-xxxx" />
                  </div>
                  <div>
                    <label style={lbl}>PO Number</label>
                    <input style={inp} value={poNo} onChange={e => setPoNo(e.target.value)} placeholder="PO-xxxx" />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Supplier Name *</label>
                  <input style={inp} value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Ebco Industries Ltd" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>SKU Code</label>
                    <input style={inp} value={grnSku} onChange={e => setGrnSku(e.target.value)} placeholder="EBCO-SCH-35" />
                  </div>
                  <div>
                    <label style={lbl}>SKU Name *</label>
                    <input style={inp} value={grnSkuName} onChange={e => setGrnSkuName(e.target.value)} placeholder="Product name" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>Received Qty *</label>
                    <input style={inp} type="number" min="1" value={receivedQty} onChange={e => setReceivedQty(e.target.value)} placeholder="100" />
                  </div>
                  <div>
                    <label style={lbl}>Damaged Qty *</label>
                    <input style={inp} type="number" min="1" value={damagedQtyG} onChange={e => setDamagedQtyG(e.target.value)} placeholder="5" />
                  </div>
                  <div>
                    <label style={lbl}>UOM</label>
                    <input style={inp} value={uomG} onChange={e => setUomG(e.target.value)} placeholder="pcs / sets" />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Damage Type *</label>
                  <select style={{ ...inp }} value={dmgTypeG} onChange={e => setDmgTypeG(e.target.value)}>
                    {GRN_DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Description</label>
                  <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={dmgDescG} onChange={e => setDmgDescG(e.target.value)} placeholder="Describe the damage observed during inspection…" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>Location</label>
                    <input style={inp} value={locationG} onChange={e => setLocationG(e.target.value)} placeholder="Main Godown — Whitefield" />
                  </div>
                  <div>
                    <label style={lbl}>Reported By</label>
                    <input style={inp} value={reportedBy} onChange={e => setReportedBy(e.target.value)} placeholder="Warehouse manager name" />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Buy / Cost Price (₹ per {uomG}) *</label>
                  <input style={inp} type="number" min="0" step="0.01" value={buyPriceG} onChange={e => setBuyPriceG(e.target.value)} placeholder="380" />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 20, cursor: 'pointer' }}>
                  <input type="checkbox" checked={insuredG} onChange={e => setInsuredG(e.target.checked)}
                    style={{ width: 16, height: 16 }} />
                  Raise insurance claim for this damage
                </label>

                {submitMsg && <div style={{ color: 'var(--g2)', fontSize: 13, background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>✓ {submitMsg}</div>}
                {submitErr && <div style={{ color: 'var(--r2)', fontSize: 13, background: '#fef2f2', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>✗ {submitErr}</div>}

                <button onClick={handleGrnSubmit} disabled={submitting}
                  style={{ width: '100%', padding: 11, borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    background: submitting ? 'var(--s4)' : 'var(--r2)', color: '#fff', transition: '.15s' }}>
                  {submitting ? 'Recording…' : '📦 Record GRN Damage & Generate Accounting Entries'}
                </button>
              </div>

              {/* Info panel */}
              <div className="card" style={{ padding: 24, background: 'var(--s2)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text1)' }}>GRN Damage Workflow</div>
                {[
                  { step: '1', title: 'Detect Damage', desc: 'Found during inward QC inspection — before putaway.' },
                  { step: '2', title: 'Record & Classify', desc: 'Log damage type, qty, and location. Upload photos.' },
                  { step: '3', title: 'Accounting Entry', desc: 'Damage Loss A/c Dr / Inventory A/c Cr — write-down at buy price.' },
                  { step: '4', title: 'Raise Claim', desc: 'Insurance claim (physical damage) or Supplier return (manufacturing defect).' },
                  { step: '5', title: 'Resolve', desc: 'Insurance settlement or supplier replacement/credit.' },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--r2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{s.step}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
                {onGoChat && (
                  <button className="btn-secondary" style={{ width: '100%', marginTop: 8, fontSize: 12 }}
                    onClick={() => onGoChat('What are best practices for reducing GRN damage in a hardware and sanitary fittings business? How should I set up the inward inspection process?')}>
                    ✨ Ask AI — Damage Prevention Tips
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Transit damage form ──────────────────────────────────────── */}
          {dmgKind === 'TRANSIT' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card" style={{ padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: 'var(--text1)' }}>Record Transit Damage (SO)</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>SO Number *</label>
                    <input style={inp} value={soNo} onChange={e => setSoNo(e.target.value)} placeholder="SO-2026-xxxx" />
                  </div>
                  <div>
                    <label style={lbl}>Customer Name *</label>
                    <input style={inp} value={custName} onChange={e => setCustName(e.target.value)} placeholder="Prestige Developers" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>SKU Code</label>
                    <input style={inp} value={transSku} onChange={e => setTransSku(e.target.value)} placeholder="HAFL-ZDH-128" />
                  </div>
                  <div>
                    <label style={lbl}>SKU Name *</label>
                    <input style={inp} value={transSkuName} onChange={e => setTransSkuName(e.target.value)} placeholder="Product name" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>Dispatched Qty *</label>
                    <input style={inp} type="number" min="1" value={dispatchedQty} onChange={e => setDispatchedQty(e.target.value)} placeholder="100" />
                  </div>
                  <div>
                    <label style={lbl}>Damaged Qty *</label>
                    <input style={inp} type="number" min="1" value={damagedQtyT} onChange={e => setDamagedQtyT(e.target.value)} placeholder="8" />
                  </div>
                  <div>
                    <label style={lbl}>UOM</label>
                    <input style={inp} value={uomT} onChange={e => setUomT(e.target.value)} placeholder="pcs" />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Transit Damage Type *</label>
                  <select style={{ ...inp }} value={dmgTypeT} onChange={e => setDmgTypeT(e.target.value)}>
                    {TRANSIT_DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Carrier / Vehicle</label>
                  <input style={inp} value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="City Express Logistics / Own Vehicle" />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Damage Description</label>
                  <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={dmgDescT} onChange={e => setDmgDescT(e.target.value)} placeholder="Describe how damage occurred in transit…" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>Sell Price (₹ per {uomT}) *</label>
                    <input style={inp} type="number" min="0" step="0.01" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="320" />
                  </div>
                  <div>
                    <label style={lbl}>Buy / Cost Price (₹ per {uomT}) *</label>
                    <input style={inp} type="number" min="0" step="0.01" value={buyPriceT} onChange={e => setBuyPriceT(e.target.value)} placeholder="240" />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>SO Adjustment Action *</label>
                  <select style={{ ...inp }} value={adjType} onChange={e => setAdjType(e.target.value)}>
                    {SO_ADJ_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Adjustment Notes</label>
                  <input style={inp} value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="e.g. Invoice revised, replacement dispatched tomorrow" />
                </div>

                <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={insuredT} onChange={e => setInsuredT(e.target.checked)} style={{ width: 16, height: 16 }} />
                    Raise insurance claim
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={custNotified} onChange={e => setCustNotified(e.target.checked)} style={{ width: 16, height: 16 }} />
                    Customer notified
                  </label>
                </div>

                {/* Live preview of financial impact */}
                {damagedQtyT && sellPrice && buyPriceT && parseFloat(damagedQtyT) > 0 && (
                  <div style={{ background: '#fef2f2', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--r2)', marginBottom: 8, textTransform: 'uppercase' }}>Financial Impact Preview</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                      <div>SO impact (sell): <strong style={{ fontFamily: 'var(--mono)', color: 'var(--r2)' }}>{fmt(parseFloat(damagedQtyT) * parseFloat(sellPrice))}</strong></div>
                      <div>Inventory write-off: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--r2)' }}>{fmt(parseFloat(damagedQtyT) * parseFloat(buyPriceT))}</strong></div>
                    </div>
                  </div>
                )}

                {submitMsg && <div style={{ color: 'var(--g2)', fontSize: 13, background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>✓ {submitMsg}</div>}
                {submitErr && <div style={{ color: 'var(--r2)', fontSize: 13, background: '#fef2f2', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>✗ {submitErr}</div>}

                <button onClick={handleTransitSubmit} disabled={submitting}
                  style={{ width: '100%', padding: 11, borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    background: submitting ? 'var(--s4)' : 'var(--r2)', color: '#fff', transition: '.15s' }}>
                  {submitting ? 'Recording…' : '🚚 Record Transit Damage & Adjust SO'}
                </button>
              </div>

              {/* Transit info panel */}
              <div className="card" style={{ padding: 24, background: 'var(--s2)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text1)' }}>Transit Damage Workflow</div>
                {[
                  { step: '1', title: 'Damage Reported', desc: 'Driver reports damage OR customer complains on delivery.' },
                  { step: '2', title: 'Record Incident', desc: 'Log SO number, qty damaged, carrier, and damage type.' },
                  { step: '3', title: 'Adjust Sales Order', desc: 'Reduce invoice qty, raise credit note, or re-dispatch replacement.' },
                  { step: '4', title: 'Accounting Entry', desc: 'Transit Loss A/c Dr / Inventory A/c Cr (cost). Credit note issued to customer.' },
                  { step: '5', title: 'Insurance Claim', desc: 'Insurance Claim Receivable A/c Dr / Transit Loss A/c Cr — file with insurer.' },
                  { step: '6', title: 'Carrier Claim', desc: 'If carrier-caused, file claim against carrier for loss recovery.' },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--amber)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{s.step}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
                {onGoChat && (
                  <button className="btn-secondary" style={{ width: '100%', marginTop: 8, fontSize: 12 }}
                    onClick={() => onGoChat('How do I reduce transit damage in hardware and sanitary deliveries? What packaging and carrier practices minimize breakage?')}>
                    ✨ Ask AI — Transit Safety Best Practices
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
