import React, { useState, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { exportToCsv } from '../utils/exportUtils';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt  = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 });

function StatusBadge({ status }) {
  const map = {
    PROCESSED:     { bg: '#eff6ff', color: '#1d4ed8' },
    CREDIT_APPLIED:{ bg: '#f0fdf4', color: '#15803d' },
    PARTIAL:       { bg: '#fefce8', color: '#a16207' },
    OPEN:          { bg: '#eff6ff', color: '#1d4ed8' },
    APPLIED:       { bg: '#f0fdf4', color: '#15803d' },
  };
  const s = map[status] || { bg: 'var(--s3)', color: 'var(--text3)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '.5px' }}>
      {status}
    </span>
  );
}

function EntryRow({ dr, cr, amount, narration }) {
  return (
    <tr>
      <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text2)' }}>{dr}</td>
      <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text3)' }}>Dr</td>
      <td style={{ padding: '6px 10px', fontSize: 12, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(amount)}</td>
      <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text3)' }}>—</td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const TABS = ['Returns', 'Credit Notes', 'New Return'];
const MOCK_RETURNS = [
  { return_id: 'SR-2026-0012', credit_note_id: 'CN-2026-0012', invoice_id: 'INV-2026-0071', customer_name: 'Mehta Interiors', return_date: '2026-05-16', sku_name: 'Ebco Soft-Close Hinge 35mm Pk-10', original_qty: 10, original_uom: 'box', return_qty: 3, return_uom: 'pcs', conversion_ratio: 10, converted_base_qty: 0.3, return_reason: 'Damaged pieces on arrival', unit_price: 485, piece_price: 48.5, return_amount: 145.5, gst_rate: 18, gst_amount: 26.19, credit_amount: 171.69, status: 'PROCESSED' },
  { return_id: 'SR-2026-0011', credit_note_id: 'CN-2026-0011', invoice_id: 'INV-2026-0064', customer_name: 'Sharma Constructions', return_date: '2026-05-11', sku_name: 'Hafele Zinc D-Handle 128mm', original_qty: 50, original_uom: 'pcs', return_qty: 5, return_uom: 'pcs', conversion_ratio: 1, converted_base_qty: 5, return_reason: 'Wrong specification', unit_price: 320, piece_price: 320, return_amount: 1600, gst_rate: 18, gst_amount: 288, credit_amount: 1888, status: 'CREDIT_APPLIED' },
];
const MOCK_CNS = [
  { credit_note_id: 'CN-2026-0012', return_id: 'SR-2026-0012', customer_name: 'Mehta Interiors', issue_date: '2026-05-16', amount: 171.69, balance: 171.69, status: 'OPEN', valid_until: '2026-08-14' },
  { credit_note_id: 'CN-2026-0011', return_id: 'SR-2026-0011', customer_name: 'Sharma Constructions', issue_date: '2026-05-11', amount: 1888, balance: 0, status: 'APPLIED', valid_until: '2026-08-09' },
];
const MOCK_INVOICES = [
  { invoice_id: 'INV-2026-0091', customer_name: 'Prestige Developers', invoice_date: '2026-05-09', items: [
    { line_id: 1, sku_code: 'EBCO-SCH-35', sku_name: 'Ebco Soft-Close Hinge 35mm Pk-10', qty: 50, uom: 'box', pieces_per_unit: 10, unit_price: 485, buy_price: 380, gst_rate: 18 },
    { line_id: 2, sku_code: 'HAFL-ZDH-128', sku_name: 'Hafele Zinc D-Handle 128mm', qty: 100, uom: 'pcs', pieces_per_unit: 1, unit_price: 320, buy_price: 240, gst_rate: 18 },
  ]},
  { invoice_id: 'INV-2026-0088', customer_name: 'Sharma Constructions', invoice_date: '2026-05-01', items: [
    { line_id: 1, sku_code: 'HETT-INN-400', sku_name: 'Hettich InnoTech Drawer 400mm', qty: 20, uom: 'set', pieces_per_unit: 1, unit_price: 1280, buy_price: 980, gst_rate: 18 },
    { line_id: 2, sku_code: 'JAQ-LYR-CHR', sku_name: 'Jaquar Lyric Basin Mixer Chrome', qty: 4, uom: 'pcs', pieces_per_unit: 1, unit_price: 4850, buy_price: 3600, gst_rate: 18 },
  ]},
  { invoice_id: 'INV-2026-0082', customer_name: 'Mehta Interiors', invoice_date: '2026-04-24', items: [
    { line_id: 1, sku_code: 'EBCO-SCH-35', sku_name: 'Ebco Soft-Close Hinge 35mm Pk-10', qty: 30, uom: 'box', pieces_per_unit: 10, unit_price: 485, buy_price: 380, gst_rate: 18 },
  ]},
];
const STANDARD_UOMS = ['pcs','pieces','units','nos','box','boxes','case','cases','sheet','sheets','bag','bags','kg','kgs','ltr','mtrs','sqft','sqm','reel','roll','dozen','set','sets','pair','pairs','pack','packs'];

export default function SalesReturn({ dbStatus, period, onGoChat, onNavigate }) {
  const [tab, setTab]             = useState('Returns');
  const [returns, setReturns]     = useState(MOCK_RETURNS);
  const [cns, setCns]             = useState(MOCK_CNS);
  const [invoices, setInvoices]   = useState(MOCK_INVOICES);
  const [src, setSrc]             = useState('demo');
  const [selected, setSelected]   = useState(null);
  const [showDamageNudge, setShowDamageNudge] = useState(false);

  // ── New Return form state ────────────────────────────────────────────────
  const [invId, setInvId]               = useState('');
  const [selInvoice, setSelInvoice]     = useState(null);
  const [selLine, setSelLine]           = useState(null);
  const [returnQty, setReturnQty]       = useState('');
  const [returnUom, setReturnUom]       = useState('');
  const [customRatio, setCustomRatio]   = useState('');
  const [reason, setReason]             = useState('');
  const [preview, setPreview]           = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [submitMsg, setSubmitMsg]       = useState('');
  const [submitError, setSubmitError]   = useState('');
  // Workflow linking + condition
  const [soNumber, setSoNumber]           = useState('');
  const [dcNumber, setDcNumber]           = useState('');
  const [returnCondition, setReturnCondition] = useState('GOOD');
  const [damageQty, setDamageQty]         = useState('');
  const [damageDesc, setDamageDesc]       = useState('');

  // Load data
  useEffect(() => {
    fetch('/api/sales-returns').then(r => r.json()).then(d => {
      if (d?.returns?.length) { setReturns(d.returns); setSrc(d.data_source || 'demo'); }
    }).catch(() => {});
    fetch('/api/sales-returns/credit-notes').then(r => r.json()).then(d => {
      if (d?.credit_notes?.length) setCns(d.credit_notes);
    }).catch(() => {});
    fetch('/api/sales-returns/invoices').then(r => r.json()).then(d => {
      if (d?.invoices?.length) setInvoices(d.invoices);
    }).catch(() => {});
  }, [period]);

  // When invoice changes
  const handleInvChange = useCallback((id) => {
    setInvId(id);
    const inv = invoices.find(i => i.invoice_id === id) || null;
    setSelInvoice(inv);
    setSelLine(null);
    setReturnQty('');
    setReturnUom('');
    setCustomRatio('');
    setPreview(null);
    setSubmitMsg('');
    setSubmitError('');
  }, [invoices]);

  const handleLineChange = useCallback((lineId) => {
    const line = selInvoice?.items?.find(l => l.line_id === Number(lineId)) || null;
    setSelLine(line);
    setReturnUom(line?.uom || '');
    setReturnQty('');
    setPreview(null);
  }, [selInvoice]);

  // Live preview calculation
  useEffect(() => {
    if (!selLine || !returnQty || !returnUom) { setPreview(null); return; }
    const rq   = parseFloat(returnQty);
    if (isNaN(rq) || rq <= 0) { setPreview(null); return; }

    const origUom = selLine.uom;
    const ratio   = customRatio ? parseFloat(customRatio) : selLine.pieces_per_unit || 1;
    if (!ratio || isNaN(ratio) || ratio <= 0) { setPreview(null); return; }

    // If same UOM, ratio is effectively 1 (no conversion needed)
    const effectiveRatio = origUom === returnUom ? 1 : ratio;
    const convertedBase  = rq / effectiveRatio;
    if (convertedBase > selLine.qty + 1e-9) {
      setPreview({ error: `Return of ${rq} ${returnUom} = ${convertedBase.toFixed(4)} ${origUom} exceeds original sale of ${selLine.qty} ${origUom}` });
      return;
    }
    const piecePrice   = selLine.unit_price / effectiveRatio;
    const returnAmount = parseFloat((piecePrice * rq).toFixed(2));
    const gstAmt       = parseFloat((returnAmount * selLine.gst_rate / 100).toFixed(2));
    const creditAmount = parseFloat((returnAmount + gstAmt).toFixed(2));
    const buyPiece     = (selLine.buy_price || 0) / effectiveRatio;
    const cogsRev      = parseFloat((buyPiece * rq).toFixed(2));

    setPreview({
      origUom, returnUom, ratio: effectiveRatio, convertedBase: parseFloat(convertedBase.toFixed(4)),
      piecePrice, returnAmount, gstAmt, creditAmount, cogsRev,
      entries: [
        { dr: 'Sales Return A/c', cr: `Customer A/c (${selInvoice?.customer_name})`, amount: creditAmount },
        { dr: 'Inventory A/c',    cr: 'COGS A/c',                                    amount: cogsRev },
        { dr: 'GST Payable A/c', cr: 'GST Liability A/c',                            amount: gstAmt },
      ],
    });
  }, [selLine, returnQty, returnUom, customRatio, selInvoice]);

  const handleSubmit = async () => {
    if (!selInvoice || !selLine || !returnQty || !returnUom) { setSubmitError('Fill all fields.'); return; }
    setSubmitting(true); setSubmitMsg(''); setSubmitError('');
    try {
      const body = {
        invoice_id:       selInvoice.invoice_id,
        customer_name:    selInvoice.customer_name,
        sku_code:         selLine.sku_code,
        sku_name:         selLine.sku_name,
        original_qty:     selLine.qty,
        original_uom:     selLine.uom,
        return_qty:       parseFloat(returnQty),
        return_uom:       returnUom,
        unit_price:       selLine.unit_price,
        buy_price:        selLine.buy_price || 0,
        gst_rate:         selLine.gst_rate || 18,
        return_reason:    reason,
        so_number:        soNumber.trim() || null,
        dc_number:        dcNumber.trim() || null,
        return_condition: returnCondition,
        damage_qty:       returnCondition !== 'GOOD' && damageQty ? parseFloat(damageQty) : null,
        damage_desc:      returnCondition !== 'GOOD' && damageDesc ? damageDesc.trim() : null,
        ...(customRatio ? { custom_ratio: parseFloat(customRatio) } : {}),
      };
      const res  = await fetch('/api/sales-returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      setSubmitMsg(data.message);
      setReturns(prev => [data.return, ...prev]);
      setCns(prev => [data.credit_note, ...prev]);
      // Show damage nudge when condition is damaged OR reason mentions damage
      if (returnCondition !== 'GOOD' || /damag|transit|broken|defect|quality|carrier/i.test(reason)) {
        setShowDamageNudge(true);
      }
      // Reset form
      setInvId(''); setSelInvoice(null); setSelLine(null);
      setReturnQty(''); setReturnUom(''); setCustomRatio(''); setReason(''); setPreview(null);
      setSoNumber(''); setDcNumber(''); setReturnCondition('GOOD'); setDamageQty(''); setDamageDesc('');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalCredit  = returns.reduce((s, r) => s + (r.credit_amount || 0), 0);
  const openCN       = cns.filter(c => c.status === 'OPEN').length;
  const openBalance  = cns.filter(c => c.status === 'OPEN').reduce((s, c) => s + (c.balance || 0), 0);

  const EXPORT_COLS = [
    { key: 'return_id', label: 'Return ID' }, { key: 'invoice_id', label: 'Invoice' },
    { key: 'customer_name', label: 'Customer' }, { key: 'return_date', label: 'Date' },
    { key: 'sku_name', label: 'Product' }, { key: 'return_qty', label: 'Qty' },
    { key: 'return_uom', label: 'UOM' }, { key: 'credit_amount', label: 'Credit (₹)' },
    { key: 'status', label: 'Status' },
  ];

  const tabStyle = (id) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: tab === id ? 700 : 500,
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: tab === id ? 'var(--brand)' : 'var(--text3)',
    borderBottom: tab === id ? '2px solid var(--brand)' : '2px solid transparent',
    transition: 'all .15s',
  });

  return (
    <div className="view">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Sales Return — UOM Conversion · Credit Notes · Accounting</div>
          <div className="psub">
            Manage partial and full sales returns with unit-of-measure conversion and automated credit notes
            {' '}<DataSourceBadge source={src} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Give me a summary of open sales returns and outstanding credit note balances.')}>
              ✨ AI Summary
            </button>
          )}
          <button className="btn-secondary" onClick={() => exportToCsv(returns, EXPORT_COLS, 'sales-returns')}>
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card sg">
          <div className="kl">Total Returns</div>
          <div className="kv">{returns.length}</div>
          <div className="ks">All time this period</div>
        </div>
        <div className="kpi-card sa">
          <div className="kl">Total Credit Issued</div>
          <div className="kv">{fmt(totalCredit)}</div>
          <div className="ks">Gross credit amount</div>
        </div>
        <div className="kpi-card sb">
          <div className="kl">Open Credit Notes</div>
          <div className="kv">{openCN}</div>
          <div className="ks">Balance: {fmt(openBalance)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {/* ── Returns tab ──────────────────────────────────────────────────── */}
      {tab === 'Returns' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Return ID</th><th>Invoice / SO</th><th>Customer</th><th>Date</th>
                <th>Product</th><th>Returned</th><th>Condition</th>
                <th>Credit Amt</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => {
                const condColor = r.return_condition === 'GOOD' ? { bg: '#f0fdf4', color: '#15803d', label: '✓ Good' }
                  : r.return_condition === 'PARTIALLY_DAMAGED' ? { bg: '#fffbeb', color: '#92400e', label: '⚠ Partial' }
                  : r.return_condition === 'FULLY_DAMAGED' ? { bg: '#fef2f2', color: '#dc2626', label: '✗ Damaged' }
                  : { bg: 'var(--s3)', color: 'var(--text3)', label: '—' };
                return (
                <React.Fragment key={r.return_id}>
                  <tr onClick={() => setSelected(selected?.return_id === r.return_id ? null : r)}
                    style={{ cursor: 'pointer', background: selected?.return_id === r.return_id ? 'var(--s2)' : 'transparent' }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--brand)' }}>{r.return_id}</td>
                    <td>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.invoice_id}</div>
                      {r.so_number && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#7c3aed' }}>{r.so_number}</div>}
                      {r.dc_number && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.dc_number}</div>}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{r.customer_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{r.return_date}</td>
                    <td style={{ fontSize: 12 }}>{r.sku_name}
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                        {r.return_qty} {r.return_uom} from {r.original_qty} {r.original_uom}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
                      {fmtN(r.converted_base_qty)} {r.original_uom}
                    </td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: condColor.bg, color: condColor.color }}>
                        {condColor.label}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--r2)' }}>{fmt(r.credit_amount)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {onGoChat && (
                          <button
                            onClick={() => onGoChat(`Analyse sales return ${r.return_id} for ${r.customer_name}: returned ${r.return_qty} ${r.return_uom} of ${r.sku_name} from invoice ${r.invoice_id}${r.so_number ? ' / SO ' + r.so_number : ''}. Reason: ${r.return_reason || 'not specified'}. Condition: ${r.return_condition || 'GOOD'}. Credit note: ${r.credit_note_id} for ₹${r.credit_amount}. What actions should I take?`)}
                            style={{ fontSize: 9, padding: '2px 6px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--brand)', fontWeight: 700 }}>
                            ✨ AI
                          </button>
                        )}
                        {r.return_condition !== 'GOOD' && onNavigate && (
                          <button
                            onClick={() => onNavigate('damage')}
                            style={{ fontSize: 9, padding: '2px 6px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>
                            Record Dmg
                          </button>
                        )}
                        <span style={{ color: 'var(--brand)', fontSize: 11 }}>{selected?.return_id === r.return_id ? '▲' : '▼'}</span>
                      </div>
                    </td>
                  </tr>
                  {selected?.return_id === r.return_id && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <div style={{ background: 'var(--s2)', padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            {/* UOM Conversion box */}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}>UOM CONVERSION DETAIL</div>
                              <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', padding: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, fontSize: 18 }}>{r.original_qty}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.original_uom} sold</div>
                                  </div>
                                  <div style={{ fontSize: 20, color: 'var(--text3)' }}>→</div>
                                  <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--r2)' }}>{r.return_qty}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.return_uom} returned</div>
                                  </div>
                                  <div style={{ fontSize: 13, color: 'var(--text3)', marginLeft: 8 }}>
                                    1 {r.original_uom} = <strong>{r.conversion_ratio}</strong> {r.return_uom}
                                  </div>
                                </div>
                                <div style={{ background: 'var(--s3)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                                  <strong>{r.return_qty} {r.return_uom}</strong> ÷ {r.conversion_ratio} = {' '}
                                  <strong>{fmtN(r.converted_base_qty)} {r.original_uom}</strong> equivalent
                                </div>
                                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)' }}>
                                  Reason: <em>{r.return_reason || '—'}</em>
                                </div>
                                {(r.so_number || r.dc_number) && (
                                  <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11, flexWrap: 'wrap' }}>
                                    {r.so_number && <span><strong style={{ color: '#7c3aed' }}>SO:</strong> {r.so_number}</span>}
                                    {r.dc_number && <span><strong>DC:</strong> {r.dc_number}</span>}
                                  </div>
                                )}
                                {r.return_condition && r.return_condition !== 'GOOD' && (
                                  <div style={{ marginTop: 8, background: '#fef2f2', borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                                    <strong style={{ color: '#dc2626' }}>Condition:</strong>{' '}
                                    {r.return_condition.replace(/_/g, ' ')}
                                    {r.damage_qty && <> · <strong>{r.damage_qty} damaged</strong></>}
                                    {r.damage_desc && <> · {r.damage_desc}</>}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Accounting entries */}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}>ACCOUNTING ENTRIES</div>
                              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ background: 'var(--s3)' }}>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Account</th>
                                    <th style={{ padding: '6px 10px' }}>Dr/Cr</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(r.accounting?.entries || []).map((e, i) => (
                                    <React.Fragment key={i}>
                                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '5px 10px', fontWeight: 600 }}>{e.dr}</td>
                                        <td style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--r2)', fontWeight: 700 }}>Dr</td>
                                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(e.amount)}</td>
                                      </tr>
                                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '5px 10px', paddingLeft: 24, color: 'var(--text3)' }}>{e.cr}</td>
                                        <td style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--g2)', fontWeight: 700 }}>Cr</td>
                                        <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fmt(e.amount)}</td>
                                      </tr>
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                              <div style={{ marginTop: 10, textAlign: 'right', fontSize: 13 }}>
                                Credit Note: <strong style={{ color: 'var(--brand)' }}>{r.credit_note_id}</strong>
                                {' · '}Amount: <strong style={{ color: 'var(--r2)' }}>{fmt(r.credit_amount)}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
              })}
              {returns.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No returns found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Credit Notes tab ─────────────────────────────────────────────── */}
      {tab === 'Credit Notes' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Credit Note ID</th><th>Return ID</th><th>Customer</th>
                <th>Issue Date</th><th>Valid Until</th><th>Amount</th><th>Balance</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cns.map(c => (
                <tr key={c.credit_note_id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{c.credit_note_id}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c.return_id}</td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{c.customer_name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>{c.issue_date}</td>
                  <td style={{ fontSize: 12, color: c.status === 'OPEN' ? 'var(--amber)' : 'var(--text3)' }}>{c.valid_until}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(c.amount)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: c.balance > 0 ? 'var(--r2)' : 'var(--g2)' }}>{fmt(c.balance)}</td>
                  <td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
              {cns.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No credit notes found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New Return tab ────────────────────────────────────────────────── */}
      {tab === 'New Return' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Form */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: 'var(--text1)' }}>Create Sales Return</div>

            {/* Invoice selector */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Select Invoice *</label>
            <select value={invId} onChange={e => handleInvChange(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 16, background: 'var(--surface)', color: 'var(--text1)' }}>
              <option value="">— choose invoice —</option>
              {invoices.map(i => <option key={i.invoice_id} value={i.invoice_id}>{i.invoice_id} · {i.customer_name} ({i.invoice_date})</option>)}
            </select>

            {/* Line item selector */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Select Product *</label>
            <select value={selLine?.line_id || ''} onChange={e => handleLineChange(e.target.value)}
              disabled={!selInvoice}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 16, background: 'var(--surface)', color: 'var(--text1)', opacity: selInvoice ? 1 : 0.5 }}>
              <option value="">— choose product —</option>
              {(selInvoice?.items || []).map(l => (
                <option key={l.line_id} value={l.line_id}>{l.sku_name} ({l.qty} {l.uom} @ ₹{l.unit_price})</option>
              ))}
            </select>

            {selLine && (
              <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, borderLeft: '3px solid var(--brand)' }}>
                <strong>Original sale:</strong> {selLine.qty} {selLine.uom} at ₹{selLine.unit_price}/{selLine.uom}
                {selLine.pieces_per_unit > 1 && <> · <strong>{selLine.pieces_per_unit} pcs</strong> per {selLine.uom}</>}
              </div>
            )}

            {/* Return qty + UOM */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Return Quantity *</label>
                <input type="number" value={returnQty} onChange={e => setReturnQty(e.target.value)} min="0.001" step="0.001"
                  placeholder="e.g. 3" disabled={!selLine}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Return UOM *</label>
                <select value={returnUom} onChange={e => setReturnUom(e.target.value)} disabled={!selLine}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)' }}>
                  <option value="">— UOM —</option>
                  {STANDARD_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Custom ratio */}
            {selLine && returnUom && returnUom !== selLine?.uom && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>
                  Custom Conversion Ratio (optional)
                  <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text3)' }}>— override auto-detect</span>
                </label>
                <input type="number" value={customRatio} onChange={e => setCustomRatio(e.target.value)} min="0.001" step="0.001"
                  placeholder={`pieces per ${selLine?.uom || 'unit'}`}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  How many <strong>{returnUom}</strong> equal 1 <strong>{selLine?.uom || 'original unit'}</strong>? (e.g. 10 for box→pcs)
                </div>
              </div>
            )}

            {/* Return reason */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Return Reason</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="e.g. Damaged pieces, wrong spec, quality issue"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', resize: 'vertical', marginBottom: 14, boxSizing: 'border-box' }} />

            {/* SO + DC linking */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Sales Order # (optional)</label>
                <input value={soNumber} onChange={e => setSoNumber(e.target.value)} placeholder="SO-2026-XXXX"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Delivery Challan # (optional)</label>
                <input value={dcNumber} onChange={e => setDcNumber(e.target.value)} placeholder="DC-XXXX-XXXX"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Return condition split */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 8 }}>Return Condition *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { val: 'GOOD',              label: '✓ Good',           sub: 'Back to inventory', bg: '#f0fdf4', border: '#86efac', color: '#15803d' },
                  { val: 'PARTIALLY_DAMAGED', label: '⚠ Partial Damage', sub: 'Some pcs damaged',  bg: '#fffbeb', border: '#fcd34d', color: '#92400e' },
                  { val: 'FULLY_DAMAGED',     label: '✗ Fully Damaged',  sub: 'Damage bucket',     bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' },
                ].map(opt => (
                  <button key={opt.val} type="button"
                    onClick={() => setReturnCondition(opt.val)}
                    style={{ padding: '8px 6px', borderRadius: 7, border: `2px solid ${returnCondition === opt.val ? opt.border : 'var(--border)'}`,
                      background: returnCondition === opt.val ? opt.bg : 'var(--surface)', cursor: 'pointer', textAlign: 'center',
                      color: returnCondition === opt.val ? opt.color : 'var(--text3)', fontWeight: returnCondition === opt.val ? 700 : 500 }}>
                    <div style={{ fontSize: 12 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, marginTop: 2, opacity: .8 }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Damage details — shown for PARTIALLY_DAMAGED or FULLY_DAMAGED */}
            {returnCondition !== 'GOOD' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 10 }}>Damage Details</div>
                {returnCondition === 'PARTIALLY_DAMAGED' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Damaged Qty (of returned qty)</label>
                    <input type="number" value={damageQty} onChange={e => setDamageQty(e.target.value)} min="0.001" step="0.001"
                      placeholder={returnQty ? `max ${returnQty} ${returnUom}` : 'how many damaged?'}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Damage Description</label>
                  <textarea value={damageDesc} onChange={e => setDamageDesc(e.target.value)} rows={2}
                    placeholder="Describe the damage — cracks, scratches, missing parts, packaging torn..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, background: 'var(--surface)', color: 'var(--text1)', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            {submitMsg && <div style={{ color: 'var(--g2)', fontSize: 13, background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>✓ {submitMsg}</div>}
            {submitError && <div style={{ color: 'var(--r2)', fontSize: 13, background: '#fef2f2', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>✗ {submitError}</div>}

            {showDamageNudge && (
              <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 20 }}>⚠️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>Damage detected in return reason</div>
                  <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>
                    Record this as a Transit Damage entry to initiate insurance claim and update accounting.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {onNavigate && (
                    <button
                      style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                      onClick={() => { setShowDamageNudge(false); onNavigate('damage'); }}>
                      Record Damage →
                    </button>
                  )}
                  <button
                    style={{ background: 'transparent', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, padding: '7px 10px', fontSize: 11, cursor: 'pointer' }}
                    onClick={() => setShowDamageNudge(false)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting || !selLine || !returnQty || !returnUom || preview?.error}
              style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                background: (!selLine || !returnQty || !returnUom || preview?.error || submitting) ? 'var(--s4)' : 'var(--brand)',
                color: (!selLine || !returnQty || !returnUom || preview?.error || submitting) ? 'var(--text3)' : '#fff', transition: '.15s' }}>
              {submitting ? 'Processing…' : 'Process Return & Generate Credit Note'}
            </button>
          </div>

          {/* Preview panel */}
          <div>
            {preview?.error ? (
              <div className="card" style={{ padding: 20, border: '1px solid var(--r3)', background: '#fef2f2' }}>
                <div style={{ color: 'var(--r2)', fontWeight: 600, fontSize: 13 }}>⚠ Validation Error</div>
                <div style={{ color: 'var(--r2)', fontSize: 12, marginTop: 6 }}>{preview.error}</div>
              </div>
            ) : preview ? (
              <>
                {/* UOM conversion card */}
                <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.5px' }}>UOM Conversion</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                    <div style={{ textAlign: 'center', flex: 1, background: 'var(--s2)', borderRadius: 8, padding: '12px 8px' }}>
                      <div style={{ fontSize: 22, fontWeight: 800 }}>{selLine?.qty}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{preview.origUom} sold</div>
                    </div>
                    <div style={{ fontSize: 22 }}>→</div>
                    <div style={{ textAlign: 'center', flex: 1, background: '#fef2f2', borderRadius: 8, padding: '12px 8px' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--r2)' }}>{returnQty}</div>
                      <div style={{ fontSize: 11, color: 'var(--r2)' }}>{returnUom} returned</div>
                    </div>
                  </div>
                  <div style={{ background: 'var(--s3)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                    <div>Ratio: 1 <strong>{preview.origUom}</strong> = <strong>{preview.ratio}</strong> <strong>{preview.returnUom}</strong></div>
                    <div style={{ marginTop: 4 }}>Equivalent base qty: <strong>{fmtN(preview.convertedBase)} {preview.origUom}</strong></div>
                  </div>
                </div>

                {/* Credit amount card */}
                <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.5px' }}>Credit Calculation</div>
                  {[
                    { label: `Price per ${preview.returnUom}`, value: fmt(preview.piecePrice) },
                    { label: `Return amount (${returnQty} × ₹${preview.piecePrice.toFixed(2)})`, value: fmt(preview.returnAmount) },
                    { label: `GST @ ${selLine?.gst_rate || 18}%`, value: fmt(preview.gstAmt) },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: 'var(--text3)' }}>{row.label}</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '2px solid var(--border)', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800 }}>
                    <span>Credit Note Value</span>
                    <span style={{ color: 'var(--r2)' }}>{fmt(preview.creditAmount)}</span>
                  </div>
                </div>

                {/* Accounting entries */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.5px' }}>Accounting Entries</div>
                  {(preview.entries || []).map((e, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ fontWeight: 700 }}>{e.dr}</span>
                        <span style={{ color: 'var(--r2)', fontWeight: 700, fontFamily: 'var(--mono)' }}>Dr  {fmt(e.amount)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingLeft: 16, color: 'var(--text3)' }}>
                        <span>{e.cr}</span>
                        <span style={{ color: 'var(--g2)', fontWeight: 600, fontFamily: 'var(--mono)' }}>Cr  {fmt(e.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>↩</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Select an invoice and fill return details</div>
                <div style={{ fontSize: 12 }}>The UOM conversion, credit amount, and accounting entries will appear here live as you fill the form.</div>
              </div>
            )}
          </div>
        </div>
      )}
      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginTop: 20 }} onClick={() => onGoChat(
          'Analyse my sales returns data — what are the most frequent return reasons and which products or customers have the highest return rates? ' +
          'What actions can I take to reduce credit note volume and improve delivery quality?'
        )}>
          <span>✨</span>
          <span>Ask AI: Sales return analysis — top return causes, customer patterns, and credit note reduction strategy</span>
        </div>
      )}
    </div>
  );
}
