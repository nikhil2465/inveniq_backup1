/**
 * Print utilities for InvenIQ — opens a styled print window for documents.
 * Uses window.open() + window.print() pattern (same as QuoteBuilder delivery challan).
 */

const COMPANY = 'InvenIQ Hardware & Sanitary Fittings';
const COMPANY_ADDR = '123, Industrial Estate, Bangalore — 560 001 | GSTIN: 29ABCDE1234F1Z5';

/** Format today's date as DD/MM/YYYY */
function fmtDate(val) {
  if (!val) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (val === 'Today') return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (val === 'Yesterday') {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return val;
}

/**
 * Print a Credit Note for a GRN discrepancy / short delivery.
 * Accepts fields from both POGRN.jsx discrepancy log and Inward.jsx GRN feed.
 *
 * @param {object} g - GRN discrepancy record
 * Fields supported (either naming convention):
 *   g.grn_number | g.grn
 *   g.po_number  | g.po
 *   g.supplier
 *   g.product    (optional)
 *   g.invoice_value
 *   g.grn_value  | g.value
 *   g.discrepancy_amt
 *   g.qty_ordered, g.qty_received, g.unit (optional)
 *   g.notes
 *   g.received_by (optional)
 *   g.date | g.received_date (optional)
 *   g.issue_type | g.action (optional)
 */
export function printCreditNote(g) {
  const grnNum     = g.grn_number || g.grn || '—';
  const poNum      = g.po_number  || g.po  || '—';
  const supplier   = g.supplier   || '—';
  const product    = g.product    || g.sku_name || g.product_name || '—';
  const invoiceVal = g.invoice_value || '—';
  const grnVal     = g.grn_value  || g.value || '—';
  const discAmt    = g.discrepancy_amt || '—';
  const notes      = g.notes      || '—';
  const receivedBy = g.received_by || '—';
  const date       = fmtDate(g.received_date || g.date || null);
  const issueType  = g.issue_type || g.action || 'Short Delivery / Invoice Mismatch';

  const qtyLine =
    (g.qty_ordered != null && g.qty_received != null)
      ? `${g.qty_received} ${g.unit || 'units'} received of ${g.qty_ordered} ${g.unit || 'units'} ordered (short by ${Number(g.qty_ordered) - Number(g.qty_received)} ${g.unit || 'units'})`
      : '—';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Credit Note — ${grnNum}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; padding: 32px 40px; }
  .no-print { display: none; }
  h1 { font-size: 22px; font-weight: 700; color: #15803d; letter-spacing: -0.02em; }
  h2 { font-size: 13px; font-weight: 700; color: #374151; border-bottom: 2px solid #15803d; padding-bottom: 4px; margin: 18px 0 10px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
  .brand { }
  .brand .name { font-size: 18px; font-weight: 800; color: #15803d; }
  .brand .addr { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .doc-meta { text-align: right; }
  .doc-meta .doc-title { font-size: 20px; font-weight: 700; color: #dc2626; letter-spacing: 0.04em; text-transform: uppercase; }
  .doc-meta .doc-ref { font-size: 11px; color: #374151; margin-top: 4px; font-family: 'Courier New', monospace; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .info-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; }
  .info-block .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 6px; }
  .info-block .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .info-block .key { color: #6b7280; font-size: 11px; }
  .info-block .val { font-weight: 600; font-size: 11px; color: #111827; font-family: 'Courier New', monospace; }
  .issue-banner { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
  .issue-banner .ib-title { font-size: 11px; font-weight: 700; color: #c2410c; margin-bottom: 4px; }
  .issue-banner .ib-text { font-size: 11px; color: #7c2d12; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f3f4f6; color: #374151; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 10px; text-align: left; border: 1px solid #e5e7eb; }
  td { padding: 8px 10px; border: 1px solid #e5e7eb; font-size: 11px; }
  .amount-row td { font-weight: 700; }
  .credit-row { background: #fef2f2; }
  .credit-row td { color: #dc2626; font-weight: 700; font-size: 13px; }
  .notes-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 11px; color: #374151; line-height: 1.6; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 24px; }
  .sig-block { border-top: 1px solid #d1d5db; padding-top: 8px; }
  .sig-block .sig-label { font-size: 10px; color: #6b7280; font-weight: 600; }
  .sig-block .sig-name { font-size: 10px; color: #374151; margin-top: 24px; }
  .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; text-align: center; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; padding: 10px 20px; background: #15803d; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  @media print {
    .print-btn { display: none !important; }
    body { padding: 16px 24px; }
  }
</style>
</head>
<body>

<button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>

<div class="header">
  <div class="brand">
    <div class="name">${COMPANY}</div>
    <div class="addr">${COMPANY_ADDR}</div>
  </div>
  <div class="doc-meta">
    <div class="doc-title">Credit Note</div>
    <div class="doc-ref">Ref: ${grnNum} | Date: ${date}</div>
  </div>
</div>

<div class="grid2">
  <div class="info-block">
    <div class="label">Supplier Details</div>
    <div class="row"><span class="key">Supplier</span><span class="val">${supplier}</span></div>
    <div class="row"><span class="key">Credit Note To</span><span class="val">${supplier}</span></div>
  </div>
  <div class="info-block">
    <div class="label">Document References</div>
    <div class="row"><span class="key">GRN Number</span><span class="val">${grnNum}</span></div>
    <div class="row"><span class="key">PO Number</span><span class="val">${poNum}</span></div>
    <div class="row"><span class="key">Receipt Date</span><span class="val">${date}</span></div>
    <div class="row"><span class="key">Received By</span><span class="val">${receivedBy}</span></div>
  </div>
</div>

<div class="issue-banner">
  <div class="ib-title">Issue Type: ${issueType}</div>
  <div class="ib-text">${notes}</div>
</div>

<h2>Credit Note Details</h2>
<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Product / SKU</th>
      <th>Quantity</th>
      <th>Invoice Value</th>
      <th>GRN Value (Actual)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Goods Receipt Discrepancy</td>
      <td>${product}</td>
      <td>${qtyLine}</td>
      <td>${invoiceVal}</td>
      <td>${grnVal}</td>
    </tr>
    <tr class="amount-row">
      <td colspan="4" style="text-align:right; color:#6b7280; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Credit Amount (Invoice − GRN)</td>
      <td style="font-family:'Courier New',monospace; font-size:12px;">${discAmt}</td>
    </tr>
    <tr class="credit-row">
      <td colspan="4" style="text-align:right; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Net Credit to Be Issued</td>
      <td style="font-family:'Courier New',monospace;">${discAmt}</td>
    </tr>
  </tbody>
</table>

<h2>Inspection Notes</h2>
<div class="notes-box">${notes}</div>

<div class="signatures">
  <div class="sig-block">
    <div class="sig-label">Received & Inspected By</div>
    <div class="sig-name">${receivedBy}</div>
  </div>
  <div class="sig-block">
    <div class="sig-label">Store / Warehouse Manager</div>
    <div class="sig-name"></div>
  </div>
  <div class="sig-block">
    <div class="sig-label">Accounts / Finance Approval</div>
    <div class="sig-name"></div>
  </div>
</div>

<div class="footer">
  This credit note has been generated by InvenIQ — Inventory Intelligence Platform &nbsp;·&nbsp;
  Document generated on ${new Date().toLocaleString('en-IN')} &nbsp;·&nbsp;
  This is a system-generated document. Subject to verification.
</div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
  if (!win) {
    alert('Popup blocked — please allow popups for InvenIQ to print credit notes.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
}
