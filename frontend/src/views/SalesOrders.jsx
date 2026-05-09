import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';
import ErrorState from '../components/ErrorState';
import DiscountAIPanel from '../components/DiscountAIPanel';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import Pagination from '../components/Pagination';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt    = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL   = (n) => { const v = Number(n); return v >= 100000 ? `₹${(v/100000).toFixed(2)}L` : fmt(v); };
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

// ── Status configs ────────────────────────────────────────────────────────────
const ORDER_STATUS = {
  DRAFT:         { label:'Draft',         cls:'ba', next:'CONFIRMED' },
  CONFIRMED:     { label:'Confirmed',     cls:'bb', next:'IN_PRODUCTION' },
  IN_PRODUCTION: { label:'In Production', cls:'bt', next:'DISPATCHED' },
  DISPATCHED:    { label:'Dispatched',    cls:'bp', next:'DELIVERED' },
  DELIVERED:     { label:'Delivered',     cls:'bg', next:null },
  CANCELLED:     { label:'Cancelled',     cls:'br', next:null },
};
const CLAIM_STATUS = {
  DRAFT:        { label:'Draft',        cls:'ba' },
  SUBMITTED:    { label:'Submitted',    cls:'bb' },
  UNDER_REVIEW: { label:'Under Review', cls:'bt' },
  APPROVED:     { label:'Approved',     cls:'bg' },
  PARTIAL:      { label:'Partial',      cls:'bp' },
  REJECTED:     { label:'Rejected',     cls:'br' },
};
const REBATE_STATUS = {
  ACTIVE:           { label:'Active',           cls:'bb' },
  ACHIEVED:         { label:'Achieved',         cls:'bg' },
  PENDING_APPROVAL: { label:'Pending Approval', cls:'bt' },
  PAID:             { label:'Paid',             cls:'bsl' },
  LAPSED:           { label:'Lapsed',           cls:'br' },
};
const CLAIM_TYPES  = ['PRICE_DIFF','DAMAGE','FREIGHT_EXCESS','PROMO_SUPPORT','SHORTAGE'];
const REBATE_TYPES = ['VOLUME','LOYALTY','PROJECT','ANNUAL_TARGET'];
const CUST_TYPES   = ['Architect','Contractor','Interior Firm','Developer','Retailer'];
const CLAIM_TYPE_LABELS = {
  PRICE_DIFF:'Price Difference', DAMAGE:'Transit Damage',
  FREIGHT_EXCESS:'Freight Excess', PROMO_SUPPORT:'Promo Support', SHORTAGE:'Shortage',
};
const REBATE_TYPE_LABELS = {
  VOLUME:'Volume Rebate', LOYALTY:'Loyalty Rebate',
  PROJECT:'Project Rebate', ANNUAL_TARGET:'Annual Target',
};

// ── Reusable badge ────────────────────────────────────────────────────────────
function StatusBadge({ status, map }) {
  const cfg = map[status] || { label: status, cls: 'ba' };
  return <span className={`bdg ${cfg.cls}`}>{cfg.label}</span>;
}

// ── AI trigger button ─────────────────────────────────────────────────────────
function AiBtn({ label, onClick, full, sm }) {
  return (
    <button
      className={`dap-trigger-btn${sm ? ' sm' : ''}`}
      style={full ? { width: '100%', justifyContent: 'center' } : {}}
      onClick={onClick}
    >✨ {label}</button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE ORDER WIZARD  (4 steps)
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_FORM = {
  customer_name:'', contact_person:'', contact_phone:'', contact_email:'',
  customer_type:'Architect', gst_number:'', billing_address:'',
  product_id:'', quantity:1, specifications:'', supplier_id:'', site_location:'',
  sell_price:0, discount_pct:0, payment_terms:'100% Advance', delivery_date:'', notes:'',
};
const WIZ_STEPS = ['Customer Details','Product & Supplier','Pricing & Terms','Review & Confirm'];
const PAYMENT_TERMS = ['100% Advance','50% Advance + 50% on Delivery','Net 30 Days','Net 60 Days','Cash on Delivery','Letter of Credit'];

function CreateOrderWizard({ products, quotations, onClose, onCreated, openAI, initProduct }) {
  const [step, setStep]       = useState(1);
  const [saving, setSaving]   = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [f, setF] = useState(() => ({
    ...BLANK_FORM,
    product_id:  initProduct ? String(initProduct.product_id) : '',
    sell_price:  initProduct ? initProduct.sell_price : 0,
  }));

  const up = (k, v) => setF(p => ({ ...p, [k]: v }));

  const selProd   = products.find(p => String(p.product_id) === String(f.product_id)) || null;
  const quotes    = quotations[String(f.product_id)] || [];
  const selSup    = quotes.find(q => String(q.supplier_id) === String(f.supplier_id));

  const handleProductPick = (pid) => {
    const p = products.find(x => String(x.product_id) === String(pid));
    setF(prev => ({ ...prev, product_id: pid, supplier_id: '', sell_price: p ? p.sell_price : 0 }));
  };

  const unitPrice  = Number(f.sell_price) || selProd?.sell_price || 0;
  const disc       = unitPrice * (Number(f.discount_pct) / 100);
  const netUnit    = unitPrice - disc;
  const qty        = Math.max(1, Number(f.quantity) || 1);
  const subtotal   = netUnit * qty;
  const gst        = subtotal * 0.18;
  const grandTotal = subtotal + gst;
  const buyPrice   = selSup?.rate || selProd?.buy_price || 0;
  const margin     = grandTotal > 0 ? ((grandTotal - buyPrice * qty) / grandTotal * 100) : 0;

  const stepValid  = [
    f.customer_name.trim() !== '',
    f.product_id !== '' && qty > 0,
    f.delivery_date !== '',
    true,
  ];

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        customer_name: f.customer_name, customer_type: f.customer_type,
        product_id: Number(f.product_id), product_name: selProd?.sku_name || '',
        category: selProd?.category || '', unit: selProd?.unit || '',
        sell_price: netUnit, buy_price: buyPrice,
        supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
        supplier_name: selSup?.name || '',
        delivery_date: f.delivery_date, site_location: f.site_location, quantity: qty,
        notes: [f.specifications && `Specs: ${f.specifications}`, `Payment: ${f.payment_terms}`, f.notes].filter(Boolean).join(' | '),
      };
      const res  = await fetch('/api/louvers/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const json = await res.json();
      setConfirmed(json);
      onCreated(json);
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  };

  /* ── Success screen ── */
  if (confirmed) return (
    <div className="ll-wizard-success">
      <div className="ll-wiz-success-icon">✓</div>
      <div className="ll-wiz-success-title">Sales Order Created!</div>
      <div className="ll-wiz-success-num">{confirmed.order_number}</div>
      <div className="ll-wiz-success-sub">{selProd?.sku_name} · {qty} {selProd?.unit} · {fmt(grandTotal)} incl. GST · Valid till {confirmed.valid_till}</div>
      <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:18}}>
        <button className="dc-save-btn" onClick={() => { setConfirmed(null); setStep(1); setF({...BLANK_FORM}); }}>+ New Order</button>
        <button className="dc-ai-btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );

  return (
    <div className="ll-wizard">
      {/* Header */}
      <div className="ll-wiz-hdr">
        <div>
          <div className="ctit">New Sales Order</div>
          <div className="csub">Step {step} of 4 — {WIZ_STEPS[step-1]}</div>
        </div>
        <button className="dc-ai-btn" onClick={onClose}>✕ Cancel</button>
      </div>

      {/* Progress bar */}
      <div className="ll-wiz-progress">
        {WIZ_STEPS.map((s,i) => (
          <div key={i} className={`ll-wiz-pstep${step>i+1?' done':step===i+1?' active':''}`}
            onClick={() => step > i+1 && setStep(i+1)} style={{cursor:step>i+1?'pointer':'default'}}>
            <div className="ll-wiz-pnum">{step>i+1?'✓':i+1}</div>
            <div className="ll-wiz-plbl">{s}</div>
          </div>
        ))}
      </div>

      {/* ── STEP 1: Customer Details ── */}
      {step===1 && (
        <div className="ll-wiz-body">
          <div className="ll-wiz-sec-title">Customer / Company Details</div>
          <div className="ll-form-grid">
            <div style={{gridColumn:'1 / -1'}}>
              <div className="dc-lbl">Customer / Company Name *</div>
              <input className="dc-inp" placeholder="e.g. Prestige Developers Pvt Ltd" autoFocus
                value={f.customer_name} onChange={e=>up('customer_name',e.target.value)} />
            </div>
            <div>
              <div className="dc-lbl">Contact Person</div>
              <input className="dc-inp" placeholder="e.g. Mr. Rajesh Kumar"
                value={f.contact_person} onChange={e=>up('contact_person',e.target.value)} />
            </div>
            <div>
              <div className="dc-lbl">Customer Type *</div>
              <select className="dc-inp" value={f.customer_type} onChange={e=>up('customer_type',e.target.value)}>
                {CUST_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div className="dc-lbl">Phone Number</div>
              <input className="dc-inp" type="tel" placeholder="+91 98765 43210"
                value={f.contact_phone} onChange={e=>up('contact_phone',e.target.value)} />
            </div>
            <div>
              <div className="dc-lbl">Email Address</div>
              <input className="dc-inp" type="email" placeholder="contact@company.com"
                value={f.contact_email} onChange={e=>up('contact_email',e.target.value)} />
            </div>
            <div>
              <div className="dc-lbl">GST Number (optional)</div>
              <input className="dc-inp" placeholder="22AAAAA0000A1Z5"
                value={f.gst_number} onChange={e=>up('gst_number',e.target.value)} />
            </div>
            <div>
              <div className="dc-lbl">Billing Address</div>
              <input className="dc-inp" placeholder="Door, Street, City, State – PIN"
                value={f.billing_address} onChange={e=>up('billing_address',e.target.value)} />
            </div>
          </div>
          <div className="ll-wiz-ai-row">
            <AiBtn sm label="Pricing tips for this customer type"
              onClick={()=>openAI(`I'm creating a sales order for a ${f.customer_type}: "${f.customer_name||'new customer'}". What pricing strategy, typical discount range, and credit terms should I use? What are key risks when dealing with ${f.customer_type} clients?`)} />
          </div>
        </div>
      )}

      {/* ── STEP 2: Product & Supplier ── */}
      {step===2 && (
        <div className="ll-wiz-body">
          <div className="ll-wiz-sec-title">Product Selection &amp; Supplier</div>
          <div className="ll-form-grid">
            <div style={{gridColumn:'1 / -1'}}>
              <div className="dc-lbl">Select Product *</div>
              <select className="dc-inp" value={f.product_id} onChange={e=>handleProductPick(e.target.value)}>
                <option value="">— Choose a product —</option>
                {products.map(p=>(
                  <option key={p.product_id} value={p.product_id}>
                    {p.sku_name} ({p.category}) — {fmt(p.sell_price)}/{p.unit} · {fmtPct(p.margin_pct)} margin
                  </option>
                ))}
              </select>
            </div>
            {selProd && <>
              <div>
                <div className="dc-lbl">Quantity ({selProd.unit}) *</div>
                <input type="number" min={1} className="dc-inp" value={f.quantity}
                  onChange={e=>up('quantity',Math.max(1,Number(e.target.value)||1))} />
              </div>
              <div>
                <div className="dc-lbl">Specifications / Finish / Colour</div>
                <input className="dc-inp" placeholder="e.g. RAL 9005 Matt Black, Anodized Silver, Teak finish…"
                  value={f.specifications} onChange={e=>up('specifications',e.target.value)} />
              </div>
              <div style={{gridColumn:'1 / -1'}}>
                <div className="dc-lbl">Delivery / Site Address *</div>
                <input className="dc-inp" placeholder="Full site address — e.g. 4th Floor, Prestige Tower, Whitefield, Bangalore 560066"
                  value={f.site_location} onChange={e=>up('site_location',e.target.value)} />
              </div>
            </>}
          </div>

          {selProd && (
            <div className="ll-wiz-prod-info">
              <div className="ll-wiz-prod-info-row"><span>Sell Price</span><strong>{fmt(selProd.sell_price)}/{selProd.unit}</strong></div>
              <div className="ll-wiz-prod-info-row"><span>Category</span><strong>{selProd.category}</strong></div>
              <div className="ll-wiz-prod-info-row"><span>Margin</span><strong style={{color:'var(--accent)'}}>{fmtPct(selProd.margin_pct)}</strong></div>
              <div className="ll-wiz-prod-info-row"><span>Applications</span><strong style={{fontSize:10}}>{selProd.applications}</strong></div>
              <div className="ll-wiz-prod-info-row"><span>Certifications</span><strong style={{fontSize:10}}>{selProd.certifications}</strong></div>
            </div>
          )}

          {quotes.length>0 && (
            <div style={{marginTop:16}}>
              <div className="dc-lbl" style={{marginBottom:8}}>Select Supplier ({quotes.length} quoting) — click to choose</div>
              <div className="ll-supplier-grid">
                {quotes.map(q=>{
                  const landed=q.rate+q.freight;
                  const chosen=String(f.supplier_id)===String(q.supplier_id);
                  const recCls=q.rec==='PREFERRED'?'bg':q.rec==='REVIEW'?'br':'bb';
                  return (
                    <div key={q.supplier_id} className={`ll-supplier-card${chosen?' chosen':''}${q.is_best?' ll-best':''}`}
                      onClick={()=>up('supplier_id',q.supplier_id)}>
                      {q.is_best&&<span className="ll-best">Best Value</span>}
                      <div className="ll-sup-name">{q.name} <span className={`bdg ${recCls}`} style={{fontSize:9}}>{q.rec}</span></div>
                      <div className="ll-sup-city">{q.city} · {q.lead}d lead · {q.rel}% reliable · MOQ {q.moq}</div>
                      <div className="ll-sup-rates">
                        <div><span>Base Rate</span><strong>{fmt(q.rate)}/{selProd.unit}</strong></div>
                        <div><span>Freight</span><strong>+{fmt(q.freight)}</strong></div>
                        <div><span>Landed</span><strong style={{color:'var(--accent)'}}>{fmt(landed)}</strong></div>
                        <div><span>Lead Time</span><strong>{q.lead} days</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="ll-wiz-ai-row">
            <AiBtn sm label="Which supplier should I choose?"
              onClick={()=>{
                const lines=quotes.map(q=>`${q.name}: ₹${q.rate+q.freight} landed, ${q.lead}d lead, ${q.rel}% reliable`).join('; ');
                openAI(`Supplier selection for ${selProd?.sku_name||'this product'}, qty ${f.quantity}. Options: ${lines}. Which is best and why? Consider rate, reliability and lead time.`);
              }} />
            {selProd&&<AiBtn sm label="Product specs guide"
              onClick={()=>openAI(`Explain the technical specs and certifications for ${selProd.sku_name} (${selProd.category}). What finish/colour options exist? Key selling points for a ${f.customer_type}? Certifications: ${selProd.certifications}`)} />}
          </div>
        </div>
      )}

      {/* ── STEP 3: Pricing & Terms ── */}
      {step===3 && (
        <div className="ll-wiz-body">
          <div className="ll-wiz-sec-title">Pricing, Payment &amp; Delivery</div>
          <div className="ll-form-grid">
            <div>
              <div className="dc-lbl">Unit Sell Price (₹/{selProd?.unit||'unit'}) *</div>
              <input type="number" className="dc-inp" value={f.sell_price||selProd?.sell_price||''}
                onChange={e=>up('sell_price',Number(e.target.value))} />
            </div>
            <div>
              <div className="dc-lbl">Discount % (0–30)</div>
              <input type="number" min={0} max={30} step={0.5} className="dc-inp" value={f.discount_pct}
                onChange={e=>up('discount_pct',Math.min(30,Math.max(0,Number(e.target.value))))} />
            </div>
            <div>
              <div className="dc-lbl">Payment Terms *</div>
              <select className="dc-inp" value={f.payment_terms} onChange={e=>up('payment_terms',e.target.value)}>
                {PAYMENT_TERMS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div className="dc-lbl">Delivery Date *</div>
              <input type="date" className="dc-inp" value={f.delivery_date}
                onChange={e=>up('delivery_date',e.target.value)}
                min={new Date().toISOString().split('T')[0]} />
            </div>
            <div style={{gridColumn:'1 / -1'}}>
              <div className="dc-lbl">Special Instructions / Notes</div>
              <textarea className="dc-inp" rows={2}
                placeholder="Special packaging, labelling, installation notes, surface protection requirements…"
                value={f.notes} onChange={e=>up('notes',e.target.value)} style={{resize:'vertical'}} />
            </div>
          </div>

          <div className="ll-wiz-price-box">
            <div className="ll-wiz-price-title">Live Order Summary</div>
            <div className="ll-wiz-price-row"><span>Unit Price</span><span>{fmt(unitPrice)}/{selProd?.unit||'unit'}</span></div>
            {f.discount_pct>0&&<div className="ll-wiz-price-row" style={{color:'var(--r2)'}}><span>Discount ({f.discount_pct}%)</span><span>−{fmt(disc)}</span></div>}
            <div className="ll-wiz-price-row"><span>Net Unit Price</span><span style={{fontWeight:700}}>{fmt(netUnit)}/{selProd?.unit||'unit'}</span></div>
            <div className="ll-wiz-price-row"><span>Quantity</span><span>{qty} {selProd?.unit||'units'}</span></div>
            <div className="ll-wiz-price-row ll-wiz-price-sub"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="ll-wiz-price-row"><span>GST @ 18%</span><span>{fmt(gst)}</span></div>
            <div className="ll-wiz-price-row ll-wiz-price-grand"><span>GRAND TOTAL</span><span>{fmt(grandTotal)}</span></div>
            <div className="ll-wiz-price-row ll-wiz-price-margin">
              <span>Est. Gross Margin</span>
              <span style={{color:margin>=18?'var(--accent)':margin>=12?'var(--a2)':'var(--r2)'}}>{fmtPct(margin)}</span>
            </div>
          </div>

          <div className="ll-wiz-ai-row">
            <AiBtn sm label="Is this pricing competitive?"
              onClick={()=>openAI(`Pricing check: ${f.quantity} ${selProd?.unit} of ${selProd?.sku_name} at ${fmt(netUnit)} net (${f.discount_pct}% discount from list ${fmt(selProd?.sell_price)}). ${f.customer_type} customer. Grand total ${fmt(grandTotal)} incl. GST. Margin ${fmtPct(margin)}. Payment: ${f.payment_terms}. Is this competitive? What's the minimum I should accept?`)} />
            <AiBtn sm label="GST & invoice guidance"
              onClick={()=>openAI(`What HSN code and GST rate applies to ${selProd?.sku_name} (${selProd?.category})? How should GST be shown on the invoice for a ${f.customer_type}? Any ITC implications?`)} />
          </div>
        </div>
      )}

      {/* ── STEP 4: Review & Confirm ── */}
      {step===4 && (
        <div className="ll-wiz-body">
          <div className="ll-wiz-sec-title">Review Sales Order Document</div>
          <div className="ll-so-doc">
            <div className="ll-so-doc-hdr">
              <div>
                <div className="ll-so-doc-co">InvenIQ — Sales Orders</div>
                <div className="ll-so-doc-tagline">Inventory Intelligence Platform</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="ll-so-doc-label">SALES ORDER</div>
                <div className="ll-so-doc-meta">Date: {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
                <div className="ll-so-doc-meta">Delivery: {f.delivery_date?new Date(f.delivery_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</div>
              </div>
            </div>
            <div className="ll-so-doc-parties">
              <div className="ll-so-doc-party">
                <div className="ll-so-doc-party-lbl">Bill To</div>
                <div className="ll-so-doc-party-name">{f.customer_name||'—'}</div>
                {f.contact_person&&<div className="ll-so-doc-party-line">{f.contact_person}</div>}
                {f.contact_phone&&<div className="ll-so-doc-party-line">{f.contact_phone}</div>}
                {f.contact_email&&<div className="ll-so-doc-party-line">{f.contact_email}</div>}
                {f.gst_number&&<div className="ll-so-doc-party-line">GSTIN: {f.gst_number}</div>}
                {f.billing_address&&<div className="ll-so-doc-party-line" style={{marginTop:4}}>{f.billing_address}</div>}
              </div>
              <div className="ll-so-doc-party">
                <div className="ll-so-doc-party-lbl">Deliver To</div>
                <div className="ll-so-doc-party-name">{f.site_location||f.billing_address||'—'}</div>
                <div className="ll-so-doc-party-line">Customer Type: <strong>{f.customer_type}</strong></div>
                <div className="ll-so-doc-party-line">Payment: <strong>{f.payment_terms}</strong></div>
                {selSup&&<div className="ll-so-doc-party-line" style={{marginTop:4}}>Supplier: <strong>{selSup.name}</strong></div>}
              </div>
            </div>
            <table className="ll-so-doc-tbl">
              <thead><tr>
                <th style={{width:'38%'}}>Product / Description</th>
                <th style={{textAlign:'center'}}>Qty</th>
                <th style={{textAlign:'right'}}>Unit Price</th>
                <th style={{textAlign:'right'}}>Discount</th>
                <th style={{textAlign:'right'}}>Net Price</th>
                <th style={{textAlign:'right'}}>Amount</th>
              </tr></thead>
              <tbody><tr>
                <td>
                  <div style={{fontWeight:700}}>{selProd?.sku_name||'—'}</div>
                  <div style={{fontSize:10,color:'var(--text3)'}}>{selProd?.category} · {selProd?.brand}</div>
                  {f.specifications&&<div style={{fontSize:10,color:'var(--text2)',marginTop:2}}>Spec: {f.specifications}</div>}
                </td>
                <td style={{textAlign:'center',fontFamily:'var(--mono)'}}>{qty} {selProd?.unit}</td>
                <td style={{textAlign:'right',fontFamily:'var(--mono)'}}>{fmt(unitPrice)}</td>
                <td style={{textAlign:'right',fontFamily:'var(--mono)',color:'var(--r2)'}}>{f.discount_pct>0?`${f.discount_pct}%`:'—'}</td>
                <td style={{textAlign:'right',fontFamily:'var(--mono)',fontWeight:700}}>{fmt(netUnit)}</td>
                <td style={{textAlign:'right',fontFamily:'var(--mono)',fontWeight:700}}>{fmt(subtotal)}</td>
              </tr></tbody>
            </table>
            <div className="ll-so-doc-totals">
              <div className="ll-so-doc-trow"><span>Subtotal (excl. GST)</span><span>{fmt(subtotal)}</span></div>
              <div className="ll-so-doc-trow"><span>GST @ 18%</span><span>{fmt(gst)}</span></div>
              <div className="ll-so-doc-trow ll-so-doc-grand"><span>GRAND TOTAL</span><span>{fmt(grandTotal)}</span></div>
            </div>
            {(f.notes||f.specifications)&&(
              <div className="ll-so-doc-notes"><strong>Notes:</strong> {[f.specifications&&`Specs: ${f.specifications}`,f.notes].filter(Boolean).join(' | ')}</div>
            )}
            <div className="ll-so-doc-terms">Terms &amp; Conditions: {f.payment_terms} · Subject to stock availability · Prices include freight from supplier · GST as applicable</div>
          </div>

          <div className="ll-wiz-ai-row">
            <AiBtn label="AI: Review this order for risks before confirming"
              onClick={()=>openAI(`Review my sales order before I confirm: ${f.customer_name} (${f.customer_type}), ${qty} ${selProd?.unit} of ${selProd?.sku_name}, Grand Total ${fmt(grandTotal)} incl. GST, margin ${fmtPct(margin)}, payment ${f.payment_terms}, delivery ${f.delivery_date||'TBD'}, supplier ${selSup?.name||'not selected'}. Any risks, red flags or negotiation points?`)} />
          </div>
        </div>
      )}

      {/* Footer navigation */}
      <div className="ll-wiz-footer">
        {step>1&&<button className="ll-wiz-back-btn" onClick={()=>setStep(s=>s-1)}>← Back</button>}
        <div style={{flex:1}}/>
        {step<4
          ? <button className="ll-wiz-next-btn" onClick={()=>setStep(s=>s+1)} disabled={!stepValid[step-1]}>
              Next: {WIZ_STEPS[step]} →
            </button>
          : <button className="dc-save-btn" onClick={handleSubmit} disabled={saving}>
              {saving?'Creating Order…':'✓ Confirm & Create Sales Order'}
            </button>
        }
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DELAY COMMAND CENTER
// ─────────────────────────────────────────────────────────────────────────────

function DelayCommandCenter({ openAI }) {
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [source,     setSource]     = useState('mock');
  const [totalVal,   setTotalVal]   = useState(0);
  const [expanded,   setExpanded]   = useState({});
  const [aiData,     setAiData]     = useState({});
  const [aiLoading,  setAiLoading]  = useState({});
  const [notified,   setNotified]   = useState({});   // id → 'sending'|'sent'|'demo'|'error'
  const [bulkState,  setBulkState]  = useState('idle');
  const [bulkResult, setBulkResult] = useState(null);

  const fmtL = (n) => { const v = Number(n); return v >= 100000 ? `₹${(v/100000).toFixed(2)}L` : `₹${v.toLocaleString('en-IN',{maximumFractionDigits:0})}`; };

  const fetchOverdue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/louvers/orders/overdue');
      const d   = await res.json();
      setOrders(d.orders     || []);
      setSource(d.data_source || 'mock');
      setTotalVal(d.total_value || 0);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOverdue(); }, [fetchOverdue]);

  const getSev = (days) => days >= 7 ? 'critical' : days >= 3 ? 'high' : 'moderate';
  const getSevLabel = (days) => days >= 7 ? 'CRITICAL' : days >= 3 ? 'HIGH' : 'MODERATE';

  const handleSendAll = async () => {
    setBulkState('sending');
    try {
      const res  = await fetch('/api/louvers/orders/check-delays', { method: 'POST' });
      const json = await res.json();
      setBulkResult(json);
      setBulkState('done');
      const upd = {};
      (json.notified || []).forEach(n => {
        const o = orders.find(x => x.order_number === n.order_number);
        if (o) upd[o.order_id] = n.sent ? 'sent' : n.demo_mode ? 'demo' : 'error';
      });
      setNotified(prev => ({ ...prev, ...upd }));
    } catch(e) { setBulkState('idle'); console.error(e); }
  };

  const handleNotifyOne = async (orderId) => {
    setNotified(prev => ({ ...prev, [orderId]: 'sending' }));
    try {
      const res  = await fetch(`/api/louvers/orders/${orderId}/notify-delay`, { method: 'POST' });
      const json = await res.json();
      setNotified(prev => ({ ...prev, [orderId]: json.sent ? 'sent' : json.demo_mode ? 'demo' : 'error' }));
    } catch(e) { setNotified(prev => ({ ...prev, [orderId]: 'error' })); }
  };

  const handleAiToggle = async (orderId) => {
    if (aiData[orderId]) { setExpanded(prev => ({ ...prev, [orderId]: !prev[orderId] })); return; }
    setExpanded(prev => ({ ...prev, [orderId]: true }));
    setAiLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      const res  = await fetch(`/api/louvers/orders/${orderId}/ai-analysis`);
      const json = await res.json();
      setAiData(prev => ({ ...prev, [orderId]: json }));
    } catch(e) { console.error(e); }
    finally { setAiLoading(prev => ({ ...prev, [orderId]: false })); }
  };

  if (loading) return (
    <div className="dcc-wrap">
      <div className="dcc-loading-state">⏳ Checking overdue orders…</div>
    </div>
  );
  if (!orders.length) return null;

  return (
    <div className="dcc-wrap">
      {/* Header */}
      <div className="dcc-header">
        <div className="dcc-header-left">
          <div className="dcc-header-icon">⚠</div>
          <div>
            <div className="dcc-title">Delay Command Center</div>
            <div className="dcc-meta">
              <span>{orders.length} order{orders.length > 1 ? 's' : ''} overdue</span>
              <span className="dcc-meta-dot">·</span>
              <span className="dcc-meta-risk">{fmtL(totalVal)} at risk</span>
              <span className="dcc-meta-dot">·</span>
              <span className={`dcc-source-badge ${source === 'mysql' ? 'live' : 'demo'}`}>
                {source === 'mysql' ? '🟢 Live MySQL' : '🟡 Demo Mode'}
              </span>
            </div>
          </div>
        </div>
        <div className="dcc-header-right">
          {bulkState === 'done' && bulkResult && (
            <span className="dcc-bulk-ok">
              ✓ {bulkResult.emails_sent > 0
                ? `${bulkResult.emails_sent} alert${bulkResult.emails_sent > 1 ? 's' : ''} sent`
                : 'Logged (add SMTP password to send)'}
            </span>
          )}
          <button
            className={`dcc-send-all-btn${bulkState === 'sending' ? ' loading' : ''}`}
            onClick={handleSendAll}
            disabled={bulkState === 'sending'}
          >
            {bulkState === 'sending' ? '⏳ Sending…' : `📧 Send All Alerts (${orders.length})`}
          </button>
        </div>
      </div>

      {/* Order rows */}
      <div className="dcc-orders">
        {orders.map((order, idx) => {
          const sev  = getSev(order.days_overdue);
          const ai   = aiData[order.order_id];
          const exp  = expanded[order.order_id];
          const ns   = notified[order.order_id];
          const aiL  = aiLoading[order.order_id];
          const last = idx === orders.length - 1;

          return (
            <div key={order.order_id} className={`dcc-order sev-${sev}${last ? ' last' : ''}`}>
              {/* Main info row */}
              <div className="dcc-order-main">
                <div className="dcc-order-col-left">
                  <span className={`dcc-sev sev-${sev}`}>{getSevLabel(order.days_overdue)}</span>
                  <div>
                    <div className="dcc-order-num">{order.order_number}</div>
                    <div className="dcc-order-cust">{order.customer_name}</div>
                    <div className="dcc-order-type">{order.customer_type}</div>
                  </div>
                </div>

                <div className="dcc-order-col-mid">
                  <div className="dcc-order-prod">{order.product_name}</div>
                  <div className="dcc-order-detail">
                    {order.quantity} {order.unit} · {order.category}
                  </div>
                  {order.delay_reason && order.delay_reason !== '—' && (
                    <div className="dcc-order-reason">⚡ {order.delay_reason}</div>
                  )}
                </div>

                <div className="dcc-order-col-right">
                  <div className="dcc-order-value">{fmtL(order.total_value)}</div>
                  <div className={`dcc-days sev-${sev}`}>
                    <span className="dcc-days-n">{order.days_overdue}</span>
                    <span className="dcc-days-l">days late</span>
                  </div>
                </div>
              </div>

              {/* Action row */}
              <div className="dcc-order-btns">
                <button
                  className={`dcc-btn-notify${ns === 'sent' ? ' sent' : ns === 'demo' ? ' demo' : ns === 'error' ? ' err' : ''}`}
                  onClick={() => handleNotifyOne(order.order_id)}
                  disabled={ns === 'sending' || ns === 'sent'}
                >
                  {ns === 'sending' ? '⏳ Sending…'
                    : ns === 'sent'  ? '✓ Sent to Admin'
                    : ns === 'demo'  ? '✓ Logged'
                    : ns === 'error' ? '✗ Failed — Retry'
                    : '📧 Notify Admin'}
                </button>

                <button
                  className={`dcc-btn-ai${aiL ? ' loading' : exp ? ' active' : ''}`}
                  onClick={() => handleAiToggle(order.order_id)}
                >
                  {aiL ? '✨ Analysing…' : exp ? '✨ Hide Analysis' : '✨ AI Analysis'}
                </button>

                <button
                  className="dcc-btn-chat"
                  onClick={() => openAI(
                    `Order ${order.order_number} for ${order.customer_name} is ${order.days_overdue} days overdue. `+
                    `Product: ${order.product_name}, value ${fmtL(order.total_value)}, status ${order.status}. `+
                    `Delay reason: ${order.delay_reason || 'not specified'}. What should I do immediately to resolve this?`
                  )}
                >
                  💬 Chat
                </button>
              </div>

              {/* AI Analysis panel */}
              {exp && (
                <div className="dcc-ai-panel">
                  {aiL ? (
                    <div className="dcc-ai-loading">✨ GPT-4o is analysing this order…</div>
                  ) : ai ? (
                    <div>
                      {/* Summary */}
                      <div className="dcc-ai-summary-row">
                        <span className="dcc-ai-badge">✨ GPT-4o Analysis</span>
                        <p className="dcc-ai-summary">{ai.executive_summary}</p>
                      </div>
                      {/* Grid */}
                      <div className="dcc-ai-grid">
                        <div className="dcc-ai-block">
                          <div className="dcc-ai-block-lbl">Root Cause</div>
                          <p className="dcc-ai-block-txt">{ai.root_cause}</p>
                        </div>
                        <div className="dcc-ai-block">
                          <div className="dcc-ai-block-lbl">Risk Assessment</div>
                          <p className="dcc-ai-block-txt">{ai.financial_risk}</p>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="dcc-ai-block" style={{marginBottom:10}}>
                        <div className="dcc-ai-block-lbl">Recommended Actions</div>
                        <ol className="dcc-ai-ol">
                          {(ai.actions || []).map((a, i) => <li key={i}>{a}</li>)}
                        </ol>
                      </div>
                      {/* Resolution */}
                      <div className="dcc-ai-resolution">
                        <span style={{fontSize:14}}>🎯</span>
                        <span>{ai.resolution}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="dcc-ai-loading">AI unavailable — check OPENAI_API_KEY in backend/.env</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: SALES ORDERS
// ─────────────────────────────────────────────────────────────────────────────

function SalesOrdersTab({ data, onRefresh, openAI }) {
  const products   = data?.products   || [];
  const quotations = data?.quotations || {};
  const [orders, setOrders]         = useState(data?.orders || []);
  const [filter, setFilter]         = useState('ALL');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardInit, setWizardInit] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => { setOrders(data?.orders || []); }, [data]);
  useEffect(() => { setPage(1); }, [filter]);

  const handleAdvanceStatus = async (orderId, newStatus) => {
    try {
      await fetch(`/api/louvers/orders/${orderId}/status`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status: newStatus }),
      });
      setOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, status: newStatus } : o));
    } catch(e) { console.error(e); }
  };

  const filteredOrders = useMemo(() =>
    filter === 'ALL' ? orders : orders.filter(o => o.status === filter),
  [orders, filter]);
  const pagedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* ── Delay Command Center ── */}
      <DelayCommandCenter openAI={openAI} />

      {/* ── Create Sales Order — action bar ── */}
      <div className="ll-create-order-bar">
        <div className="ll-create-order-bar-left">
          <div className="ll-create-order-bar-icon">
            <svg viewBox="0 0 20 20" fill="none" width="22" height="22">
              <rect x="2" y="3" width="16" height="14" rx="2.5" stroke="white" strokeWidth="1.6"/>
              <path d="M10 7v6M7 10h6" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="ll-create-order-bar-title">Create New Sales Order</div>
            <div className="ll-create-order-bar-sub">4-step guided form — customer details, product, pricing, review &amp; confirm</div>
          </div>
        </div>
        <button className="ll-create-order-bar-btn"
          onClick={() => { setWizardInit(null); setShowWizard(true); setTimeout(()=>document.getElementById('ll-wizard-anchor')?.scrollIntoView({behavior:'smooth',block:'start'}),80); }}>
          <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          New Sales Order
        </button>
      </div>

      {/* ── Wizard (inline) ── */}
      {showWizard && (
        <div id="ll-wizard-anchor" style={{marginBottom:20}}>
          <CreateOrderWizard
            products={products} quotations={quotations}
            initProduct={wizardInit}
            openAI={openAI}
            onClose={() => setShowWizard(false)}
            onCreated={() => { onRefresh(); }}
          />
        </div>
      )}

      {/* Product Catalogue */}
      <div className="ll-section-hdr">
        <div>
          <div className="ctit">Product Catalogue</div>
          <div className="csub">7 products · click a card to open wizard with that product pre-selected</div>
        </div>
        <AiBtn sm label="Catalogue insights"
          onClick={() => openAI(
            `Give me an overview of the sales orders product catalogue: HPL laminates (₹1,300/sheet), `+
            `Compact 6mm (₹3,600/sheet), Acrylic (₹2,100/sheet), Aluminium 100mm Anodized (₹2,100/RM), `+
            `80mm Powder Coated (₹1,680/RM), PVC Blades (₹580/RM), Motorised Louvre System (₹12,000/SQM). `+
            `Which products give the best margins? Which should I push for Architects vs Contractors vs Developers?`
          )} />
      </div>

      <div className="ll-product-grid">
        {products.map(p => {
          const quotes = quotations[String(p.product_id)] || [];
          const best   = quotes.find(q => q.is_best);
          return (
            <div
              key={p.product_id}
              className={`ll-product-card${showWizard && wizardInit?.product_id === p.product_id ? ' selected' : ''}`}
              onClick={() => { setWizardInit(p); setShowWizard(true); setTimeout(()=>document.getElementById('ll-wizard-anchor')?.scrollIntoView({behavior:'smooth',block:'start'}),80); }}
            >
              <div className="ll-prod-cat">{p.category}</div>
              <div className="ll-prod-name">{p.sku_name}</div>
              <div className="ll-prod-meta">{p.brand} · {p.unit}</div>
              <div className="ll-prod-prices">
                <span className="ll-sell">{fmt(p.sell_price)}</span>
                <span className="ll-margin">{fmtPct(p.margin_pct)} margin</span>
              </div>
              {best && (
                <div className="ll-prod-supplier">
                  Best supply: <strong>{best.name}</strong> @ {fmt(best.rate)}/{p.unit}
                </div>
              )}
              <div className="ll-prod-apps">{p.applications}</div>
              <div className="ll-prod-footer">
                <button className="dap-trigger-btn sm" style={{fontSize:9}} onClick={e => {
                  e.stopPropagation();
                  openAI(
                    `Tell me about ${p.sku_name} (${p.category}): sell price ${fmt(p.sell_price)}/${p.unit}, `+
                    `margin ${fmtPct(p.margin_pct)}, ${quotes.length} suppliers quoting. `+
                    `Applications: ${p.applications}. `+
                    `Which customer segment should I target for this product? What are the key selling points?`
                  );
                }}>✨ AI insights</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order History */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="ch">
          <div>
            <div className="ctit">Order History</div>
            <div className="csub">{orders.length} orders · click row to advance status</div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <AiBtn sm label="Analyse pipeline"
              onClick={() => {
                const active = orders.filter(o=>o.status!=='DELIVERED'&&o.status!=='CANCELLED');
                const total  = orders.reduce((a,o)=>a+o.total_value,0);
                openAI(
                  `Analyse my sales orders pipeline: ${orders.length} total orders, `+
                  `${active.length} active, total value ${fmtL(total)}, avg margin ${fmtPct(orders.reduce((a,o)=>a+o.margin_pct,0)/orders.length)}. `+
                  `Orders by status: DRAFT (${orders.filter(o=>o.status==='DRAFT').length}), `+
                  `CONFIRMED (${orders.filter(o=>o.status==='CONFIRMED').length}), `+
                  `IN_PRODUCTION (${orders.filter(o=>o.status==='IN_PRODUCTION').length}), `+
                  `DISPATCHED (${orders.filter(o=>o.status==='DISPATCHED').length}). `+
                  `Which orders need urgent attention? What should I focus on today?`
                );
              }} />
            {['ALL','DRAFT','CONFIRMED','IN_PRODUCTION','DISPATCHED','DELIVERED'].map(f=>(
              <button key={f} className={`dc-filter-btn${filter===f?' active':''}`}
                onClick={()=>setFilter(f)} style={{fontSize:9}}>
                {f.replace('_',' ')}
              </button>
            ))}
            <ExportButton rows={filteredOrders} filename="sales_orders" columns={[
              { key: 'so_number', label: 'Order #' }, { key: 'customer_name', label: 'Customer' },
              { key: 'order_type', label: 'Type' }, { key: 'total_value', label: 'Value (₹)' },
              { key: 'margin_pct', label: 'Margin %' }, { key: 'status', label: 'Status' },
              { key: 'order_date', label: 'Date' },
            ]} />
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>Order #</th><th>Customer</th><th>Type</th>
              <th>Product</th><th style={{textAlign:'right'}}>Qty</th>
              <th style={{textAlign:'right'}}>Value</th><th style={{textAlign:'right'}}>Margin</th>
              <th>Delivery</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody>
              {pagedOrders.map(o => {
                const sc   = ORDER_STATUS[o.status] || ORDER_STATUS.DRAFT;
                const past = o.delivery_date && new Date(o.delivery_date) < new Date();
                return (
                  <tr key={o.order_id} style={{cursor:'pointer'}} title="Click row to ask AI"
                    onClick={() => openAI(
                      `Analyse order ${o.order_number} for ${o.customer_name} (${o.customer_type}): `+
                      `${o.quantity} ${o.unit} of ${o.product_name}, value ${fmtL(o.total_value)}, `+
                      `margin ${fmtPct(o.margin_pct)}, supplier ${o.supplier_name}, `+
                      `delivery ${o.delivery_date||'not set'}, status ${o.status}. `+
                      `What action should I take on this order? Any risks?`
                    )}>
                    <td><span style={{fontFamily:'var(--mono)',fontSize:10,fontWeight:700}}>{o.order_number}</span></td>
                    <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.customer_name}</td>
                    <td><span className="bdg ba" style={{fontSize:9}}>{o.customer_type}</span></td>
                    <td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11}}>{o.product_name}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:11}}>{Number(o.quantity).toLocaleString('en-IN')} {o.unit}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,fontSize:11}}>{fmtL(o.total_value)}</td>
                    <td style={{textAlign:'right'}}>
                      <span style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:700,
                        color:o.margin_pct>=20?'var(--green)':o.margin_pct>=15?'var(--a2)':'var(--r2)'}}>
                        {fmtPct(o.margin_pct)}
                      </span>
                    </td>
                    <td style={{fontFamily:'var(--mono)',fontSize:10,color:past&&o.status!=='DELIVERED'?'var(--r2)':'var(--text3)'}}>
                      {o.delivery_date||'—'}
                    </td>
                    <td><StatusBadge status={o.status} map={ORDER_STATUS} /></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',gap:4}}>
                        {sc.next && (
                          <button className="dc-act-btn dc-act-green"
                            onClick={()=>handleAdvanceStatus(o.order_id, sc.next)}
                            title={`Advance to ${sc.next}`}>→ {ORDER_STATUS[sc.next]?.label}</button>
                        )}
                        <button className="dap-trigger-btn sm" style={{fontSize:9}}
                          onClick={()=>openAI(
                            `Quick AI check on order ${o.order_number}: ${o.product_name} for ${o.customer_name}, `+
                            `${o.status} status. Delivery: ${o.delivery_date||'not set'}. What's the next best action?`
                          )}>✨</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={filteredOrders.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: DISTRIBUTOR CLAIMS
// ─────────────────────────────────────────────────────────────────────────────

function DistributorClaimsTab({ data, onRefresh, openAI }) {
  const products = data?.products || [];
  const [claims, setClaims] = useState(data?.claims || []);
  const [filter, setFilter] = useState('ALL');
  const [showForm, setShowForm]   = useState(false);
  const [savedClaim, setSavedClaim] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    distributor_name:'', claim_type:'PRICE_DIFF', product_name:'', invoice_ref:'',
    invoice_date:'', quantity:1, unit:'sheet', claimed_rate:0, amount_claimed:0, notes:'',
  });

  useEffect(() => { setClaims(data?.claims || []); }, [data]);

  const handleSubmit = async () => {
    if (!form.distributor_name || !form.product_name || !form.invoice_ref) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/louvers/claims', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form),
      });
      const json = await res.json();
      setSavedClaim(json);
      setShowForm(false);
      setForm({ distributor_name:'', claim_type:'PRICE_DIFF', product_name:'', invoice_ref:'',
                invoice_date:'', quantity:1, unit:'sheet', claimed_rate:0, amount_claimed:0, notes:'' });
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleStatusUpdate = async (claimId, newStatus, approvedAmount) => {
    try {
      await fetch(`/api/louvers/claims/${claimId}/status`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status: newStatus, approved_amount: approvedAmount }),
      });
      setClaims(prev => prev.map(c => c.claim_id === claimId ? {...c, status: newStatus, amount_approved: approvedAmount} : c));
    } catch(e) { console.error(e); }
  };

  const filteredClaims = useMemo(() =>
    filter==='ALL' ? claims : claims.filter(c=>c.status===filter),
  [claims, filter]);

  const totalPending  = claims.filter(c=>['SUBMITTED','UNDER_REVIEW'].includes(c.status)).reduce((a,c)=>a+c.amount_claimed,0);
  const totalApproved = claims.filter(c=>['APPROVED','PARTIAL'].includes(c.status)).reduce((a,c)=>a+(c.amount_approved||0),0);

  return (
    <div>
      {/* KPI strip */}
      <div className="ll-claim-kpi-row">
        <div className="ll-claim-kpi" onClick={() => openAI(
          `My pending distributor claims total ${fmtL(totalPending)} across ${claims.filter(c=>['SUBMITTED','UNDER_REVIEW'].includes(c.status)).length} open claims. `+
          `What is the best process to resolve these quickly? What documentation should I have ready?`
        )}>
          <div className="ll-claim-kpi-lbl">Pending Claims ✨</div>
          <div className="ll-claim-kpi-val" style={{color:'var(--amber)'}}>{fmtL(totalPending)}</div>
          <div className="ll-claim-kpi-sub">{claims.filter(c=>['SUBMITTED','UNDER_REVIEW'].includes(c.status)).length} open</div>
        </div>
        <div className="ll-claim-kpi" onClick={() => openAI(
          `My approved distributor claims total ${fmtL(totalApproved)} this month. `+
          `How do I track and reconcile these against supplier credit notes? Best practice for claim accounting?`
        )}>
          <div className="ll-claim-kpi-lbl">Approved Claims ✨</div>
          <div className="ll-claim-kpi-val" style={{color:'var(--green)'}}>{fmtL(totalApproved)}</div>
          <div className="ll-claim-kpi-sub">{claims.filter(c=>['APPROVED','PARTIAL'].includes(c.status)).length} settled</div>
        </div>
        <div className="ll-claim-kpi" onClick={() => openAI(
          `I have ${claims.length} distributor claims: `+
          `${claims.filter(c=>c.claim_type==='PRICE_DIFF').length} price diff, `+
          `${claims.filter(c=>c.claim_type==='DAMAGE').length} damage, `+
          `${claims.filter(c=>c.claim_type==='FREIGHT_EXCESS').length} freight excess, `+
          `${claims.filter(c=>c.claim_type==='SHORTAGE').length} shortage, `+
          `${claims.filter(c=>c.claim_type==='PROMO_SUPPORT').length} promo support. `+
          `Which claim types are most common and how do I reduce them?`
        )}>
          <div className="ll-claim-kpi-lbl">Total Claims ✨</div>
          <div className="ll-claim-kpi-val">{claims.length}</div>
          <div className="ll-claim-kpi-sub">All time</div>
        </div>
        <div className="ll-claim-kpi">
          <AiBtn label="Full claims analysis"
            onClick={() => openAI(
              `Analyse distributor claims for my sales orders module: `+
              `${claims.length} total claims, ${fmtL(totalPending)} pending, ${fmtL(totalApproved)} approved. `+
              `Claim types: price difference, transit damage, freight excess, promo support, shortage. `+
              `What's the industry benchmark for claim resolution? How do I build a watertight claims policy?`
            )} />
        </div>
      </div>

      {/* New claim form */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ch">
          <div>
            <div className="ctit">Raise Distributor Claim</div>
            <div className="csub">Log price difference, damage, freight excess, promo support or shortage</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            {savedClaim && <span className="bdg bg">✓ {savedClaim.claim_number}</span>}
            <button className="dc-ai-btn" onClick={()=>setShowForm(!showForm)}>
              {showForm ? '▲ Hide Form' : '+ New Claim'}
            </button>
          </div>
        </div>
        {showForm && (
          <div>
            <div className="ll-form-grid" style={{marginTop:12}}>
              <div>
                <div className="dc-lbl">Distributor Name *</div>
                <input className="dc-inp" placeholder="e.g. Bangalore Building Supplies"
                  value={form.distributor_name} onChange={e=>setForm(f=>({...f,distributor_name:e.target.value}))} />
              </div>
              <div>
                <div className="dc-lbl">Claim Type *</div>
                <select className="dc-inp" value={form.claim_type}
                  onChange={e=>setForm(f=>({...f,claim_type:e.target.value}))}>
                  {CLAIM_TYPES.map(t=><option key={t} value={t}>{CLAIM_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <div className="dc-lbl">Product</div>
                <select className="dc-inp" value={form.product_name}
                  onChange={e=>setForm(f=>({...f,product_name:e.target.value}))}>
                  <option value="">— select product —</option>
                  {products.map(p=><option key={p.product_id} value={p.sku_name}>{p.sku_name}</option>)}
                </select>
              </div>
              <div>
                <div className="dc-lbl">Invoice Reference *</div>
                <input className="dc-inp" placeholder="INV-2026-XXXX"
                  value={form.invoice_ref} onChange={e=>setForm(f=>({...f,invoice_ref:e.target.value}))} />
              </div>
              <div>
                <div className="dc-lbl">Invoice Date</div>
                <input type="date" className="dc-inp" value={form.invoice_date}
                  onChange={e=>setForm(f=>({...f,invoice_date:e.target.value}))} />
              </div>
              <div>
                <div className="dc-lbl">Quantity</div>
                <input type="number" min={1} className="dc-inp" value={form.quantity}
                  onChange={e=>setForm(f=>({...f,quantity:Number(e.target.value)||1}))} />
              </div>
              <div>
                <div className="dc-lbl">Claimed Rate (per unit)</div>
                <input type="number" min={0} className="dc-inp" value={form.claimed_rate}
                  onChange={e=>{
                    const rate=Number(e.target.value)||0;
                    setForm(f=>({...f,claimed_rate:rate,amount_claimed:Math.round(rate*f.quantity)}));
                  }} />
              </div>
              <div>
                <div className="dc-lbl">Total Amount Claimed</div>
                <input type="number" min={0} className="dc-inp" value={form.amount_claimed}
                  onChange={e=>setForm(f=>({...f,amount_claimed:Number(e.target.value)||0}))} />
              </div>
            </div>
            <div style={{marginTop:8}}>
              <div className="dc-lbl">Notes / Evidence</div>
              <input className="dc-inp" style={{width:'100%',boxSizing:'border-box'}}
                placeholder="Describe the issue, attach invoice reference…"
                value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
            </div>
            <div className="dc-actions" style={{marginTop:12}}>
              <button className="dc-save-btn" onClick={handleSubmit}
                disabled={saving||!form.distributor_name||!form.invoice_ref}>
                {saving?'Submitting…':'✓ Submit Claim'}
              </button>
              <AiBtn label="Is my claim valid?"
                onClick={() => openAI(
                  `I want to raise a ${CLAIM_TYPE_LABELS[form.claim_type]||form.claim_type} claim `+
                  `for ${form.product_name||'[product]'}, invoice ${form.invoice_ref||'[ref]'}, `+
                  `${form.quantity} units, amount ₹${form.amount_claimed.toLocaleString('en-IN')}. `+
                  `Is this a valid claim? What documentation and evidence do I need? `+
                  `What is a realistic approval rate for this claim type?`
                )} />
            </div>
          </div>
        )}
      </div>

      {/* Claims History Table */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Claims History</div>
            <div className="csub">{claims.length} claims · click row for AI analysis</div>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            {['ALL','DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','PARTIAL','REJECTED'].map(f=>(
              <button key={f} className={`dc-filter-btn${filter===f?' active':''}`}
                onClick={()=>setFilter(f)} style={{fontSize:9}}>
                {f.replace('_',' ')}
              </button>
            ))}
          </div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead><tr>
              <th>Claim #</th><th>Distributor</th><th>Type</th><th>Product</th>
              <th>Invoice</th><th style={{textAlign:'right'}}>Claimed</th>
              <th style={{textAlign:'right'}}>Approved</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody>
              {filteredClaims.map(c => (
                <tr key={c.claim_id} style={{cursor:'pointer'}}
                  onClick={() => openAI(
                    `Analyse distributor claim ${c.claim_number}: ${CLAIM_TYPE_LABELS[c.claim_type]} claim `+
                    `from ${c.distributor_name} for ${c.product_name}, invoice ${c.invoice_ref}, `+
                    `amount claimed ${fmt(c.amount_claimed)}, approved ${c.amount_approved?fmt(c.amount_approved):'pending'}, `+
                    `status ${c.status}. ${c.remarks||''}. `+
                    `Is the claim amount reasonable? What should I do next?`
                  )}>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:10,fontWeight:700}}>{c.claim_number}</span></td>
                  <td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.distributor_name}</td>
                  <td><span className="bdg ba" style={{fontSize:9}}>{CLAIM_TYPE_LABELS[c.claim_type]||c.claim_type}</span></td>
                  <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11}}>{c.product_name}</td>
                  <td style={{fontFamily:'var(--mono)',fontSize:10}}>{c.invoice_ref}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:11,fontWeight:700,color:'var(--r2)'}}>{fmt(c.amount_claimed)}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:11,fontWeight:700,color:'var(--green)'}}>
                    {c.amount_approved!=null ? fmt(c.amount_approved) : <span style={{color:'var(--text3)'}}>—</span>}
                  </td>
                  <td><StatusBadge status={c.status} map={CLAIM_STATUS} /></td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',gap:4}}>
                      {c.status==='SUBMITTED'&&(
                        <button className="dc-act-btn" onClick={()=>handleStatusUpdate(c.claim_id,'UNDER_REVIEW',null)}>Review</button>
                      )}
                      {c.status==='UNDER_REVIEW'&&(
                        <>
                          <button className="dc-act-btn dc-act-green"
                            onClick={()=>handleStatusUpdate(c.claim_id,'APPROVED',c.amount_claimed)}>✓ Approve</button>
                          <button className="dc-act-btn dc-act-red"
                            onClick={()=>handleStatusUpdate(c.claim_id,'REJECTED',0)}>✗</button>
                        </>
                      )}
                      <button className="dap-trigger-btn sm" style={{fontSize:9}}
                        onClick={()=>openAI(
                          `Quick analysis: ${c.claim_number} — ${CLAIM_TYPE_LABELS[c.claim_type]} claim `+
                          `from ${c.distributor_name}, ${fmt(c.amount_claimed)}, status ${c.status}. Best next action?`
                        )}>✨</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: CUSTOMER REBATES
// ─────────────────────────────────────────────────────────────────────────────

function CustomerRebatesTab({ data, onRefresh, openAI }) {
  const products = data?.products || [];
  const [rebates, setRebates] = useState(data?.rebates || []);
  const [filter, setFilter]   = useState('ALL');
  const [showForm, setShowForm]   = useState(false);
  const [savedRebate, setSavedRebate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_name:'', customer_type:'Developer',
    rebate_type:'VOLUME', category:'',
    target_amount:0, rebate_pct:2,
    period_start:'', period_end:'', notes:'',
  });

  useEffect(() => { setRebates(data?.rebates || []); }, [data]);

  const estimatedValue = form.target_amount > 0 ? Math.round(form.target_amount * form.rebate_pct / 100) : 0;

  const handleSubmit = async () => {
    if (!form.customer_name || !form.target_amount) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/louvers/rebates', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form),
      });
      const json = await res.json();
      setSavedRebate(json);
      setShowForm(false);
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleStatusUpdate = async (rebateId, newStatus, actualAmount) => {
    try {
      await fetch(`/api/louvers/rebates/${rebateId}/status`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status: newStatus, actual_amount: actualAmount }),
      });
      setRebates(prev => prev.map(r => r.rebate_id===rebateId ? {...r, status: newStatus} : r));
    } catch(e) { console.error(e); }
  };

  const filteredRebates = useMemo(() =>
    filter==='ALL' ? rebates : rebates.filter(r=>r.status===filter),
  [rebates, filter]);

  const totalLiability = rebates.filter(r=>['ACTIVE','PENDING_APPROVAL','ACHIEVED'].includes(r.status))
    .reduce((a,r)=>a+r.rebate_value,0);
  const totalActive    = rebates.filter(r=>r.status==='ACTIVE').length;

  return (
    <div>
      {/* Rebate KPI strip */}
      <div className="ll-claim-kpi-row">
        <div className="ll-claim-kpi" onClick={()=>openAI(
          `My total rebate liability is ${fmtL(totalLiability)} across ${totalActive} active rebate agreements. `+
          `How should I provision for this in my P&L? What accounting treatment is standard for customer rebates in India?`
        )}>
          <div className="ll-claim-kpi-lbl">Rebate Liability ✨</div>
          <div className="ll-claim-kpi-val" style={{color:'var(--r2)'}}>{fmtL(totalLiability)}</div>
          <div className="ll-claim-kpi-sub">Provisioned</div>
        </div>
        <div className="ll-claim-kpi" onClick={()=>openAI(
          `I have ${totalActive} active rebate agreements. How do I track customer progress against targets effectively? `+
          `What's the best way to communicate rebate status to customers to drive volumes?`
        )}>
          <div className="ll-claim-kpi-lbl">Active Schemes ✨</div>
          <div className="ll-claim-kpi-val">{totalActive}</div>
          <div className="ll-claim-kpi-sub">Running now</div>
        </div>
        <div className="ll-claim-kpi" onClick={()=>openAI(
          `${rebates.filter(r=>r.status==='ACHIEVED').length} rebate(s) achieved this period. `+
          `What is the best process to pay out rebates? Credit note vs bank transfer? GST implications?`
        )}>
          <div className="ll-claim-kpi-lbl">Achieved ✨</div>
          <div className="ll-claim-kpi-val" style={{color:'var(--green)'}}>{rebates.filter(r=>r.status==='ACHIEVED').length}</div>
          <div className="ll-claim-kpi-sub">Ready to pay</div>
        </div>
        <div className="ll-claim-kpi">
          <AiBtn label="Rebate strategy"
            onClick={()=>openAI(
              `Review my customer rebate programme for sales orders: `+
              `${rebates.length} schemes total, ${fmtL(totalLiability)} total liability, `+
              `types: volume (${rebates.filter(r=>r.rebate_type==='VOLUME').length}), `+
              `loyalty (${rebates.filter(r=>r.rebate_type==='LOYALTY').length}), `+
              `project (${rebates.filter(r=>r.rebate_type==='PROJECT').length}), `+
              `annual target (${rebates.filter(r=>r.rebate_type==='ANNUAL_TARGET').length}). `+
              `Is my rebate structure effective? What benchmarks apply? How to improve ROI on rebates?`
            )} />
        </div>
      </div>

      {/* New Rebate Form */}
      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div>
            <div className="ctit">Create Customer Rebate</div>
            <div className="csub">Volume, loyalty, project or annual-target incentive schemes</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            {savedRebate && <span className="bdg bg">✓ {savedRebate.rebate_number}</span>}
            <button className="dc-ai-btn" onClick={()=>setShowForm(!showForm)}>
              {showForm?'▲ Hide Form':'+ New Rebate'}
            </button>
          </div>
        </div>

        {showForm && (
          <div>
            <div className="ll-form-grid" style={{marginTop:12}}>
              <div>
                <div className="dc-lbl">Customer Name *</div>
                <input className="dc-inp" placeholder="e.g. Prestige Developers"
                  value={form.customer_name} onChange={e=>setForm(f=>({...f,customer_name:e.target.value}))} />
              </div>
              <div>
                <div className="dc-lbl">Customer Type</div>
                <select className="dc-inp" value={form.customer_type}
                  onChange={e=>setForm(f=>({...f,customer_type:e.target.value}))}>
                  {CUST_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div className="dc-lbl">Rebate Type</div>
                <select className="dc-inp" value={form.rebate_type}
                  onChange={e=>setForm(f=>({...f,rebate_type:e.target.value}))}>
                  {REBATE_TYPES.map(t=><option key={t} value={t}>{REBATE_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <div className="dc-lbl">Product Category</div>
                <select className="dc-inp" value={form.category}
                  onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                  <option value="">All Products</option>
                  {['Louvers','High Pressure Laminate','Compact Laminate','Acrylic','Operable Louvre System'].map(c=>
                    <option key={c} value={c}>{c}</option>
                  )}
                </select>
              </div>
              <div>
                <div className="dc-lbl">Target Purchase Amount (₹)</div>
                <input type="number" min={0} step={10000} className="dc-inp"
                  value={form.target_amount}
                  onChange={e=>setForm(f=>({...f,target_amount:Number(e.target.value)||0}))} />
              </div>
              <div>
                <div className="dc-lbl">Rebate % on Target</div>
                <input type="number" min={0.1} max={10} step={0.1} className="dc-inp"
                  value={form.rebate_pct}
                  onChange={e=>setForm(f=>({...f,rebate_pct:Number(e.target.value)||0}))} />
              </div>
              <div>
                <div className="dc-lbl">Period Start</div>
                <input type="date" className="dc-inp" value={form.period_start}
                  onChange={e=>setForm(f=>({...f,period_start:e.target.value}))} />
              </div>
              <div>
                <div className="dc-lbl">Period End</div>
                <input type="date" className="dc-inp" value={form.period_end}
                  onChange={e=>setForm(f=>({...f,period_end:e.target.value}))} />
              </div>
            </div>
            {estimatedValue > 0 && (
              <div className="ll-order-summary" style={{marginTop:10}}>
                <span>If target met → Rebate payout: <strong style={{color:'var(--r2)'}}>{fmt(estimatedValue)}</strong></span>
                <span>As % of revenue: <strong>{fmtPct(form.rebate_pct)}</strong></span>
              </div>
            )}
            <div className="dc-actions" style={{marginTop:12}}>
              <button className="dc-save-btn" onClick={handleSubmit}
                disabled={saving||!form.customer_name||!form.target_amount}>
                {saving?'Creating…':'✓ Create Rebate Scheme'}
              </button>
              <AiBtn label="Is this rebate structure right?"
                onClick={()=>openAI(
                  `I'm creating a ${REBATE_TYPE_LABELS[form.rebate_type]} rebate for ${form.customer_name||'a customer'} `+
                  `(${form.customer_type}): target ${fmt(form.target_amount)}, `+
                  `${fmtPct(form.rebate_pct)} rebate = ${fmt(estimatedValue)} payout. `+
                  `Category: ${form.category||'all products'}. Period: ${form.period_start||'?'} to ${form.period_end||'?'}. `+
                  `Is this rebate structure competitive? What's the industry standard? `+
                  `How do I set targets that motivate without eroding margin?`
                )} />
            </div>
          </div>
        )}
      </div>

      {/* Rebates Table */}
      <div className="card">
        <div className="ch">
          <div>
            <div className="ctit">Rebate Schemes</div>
            <div className="csub">{rebates.length} schemes · click row for AI analysis</div>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            {['ALL','ACTIVE','ACHIEVED','PENDING_APPROVAL','PAID','LAPSED'].map(f=>(
              <button key={f} className={`dc-filter-btn${filter===f?' active':''}`}
                onClick={()=>setFilter(f)} style={{fontSize:9}}>
                {f.replace('_',' ')}
              </button>
            ))}
          </div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead><tr>
              <th>Rebate #</th><th>Customer</th><th>Type</th><th>Category</th>
              <th style={{textAlign:'right'}}>Target</th><th style={{textAlign:'right'}}>Actual</th>
              <th style={{textAlign:'right'}}>Achievement</th>
              <th style={{textAlign:'right'}}>Rebate Value</th>
              <th>Period</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody>
              {filteredRebates.map(r => {
                const pct = r.actual_amount>0 ? Math.round(r.actual_amount/r.target_amount*100) : 0;
                return (
                  <tr key={r.rebate_id} style={{cursor:'pointer'}}
                    onClick={()=>openAI(
                      `Analyse rebate ${r.rebate_number} for ${r.customer_name} (${r.customer_type}): `+
                      `${REBATE_TYPE_LABELS[r.rebate_type]}, target ${fmtL(r.target_amount)}, `+
                      `actual ${fmtL(r.actual_amount)} (${pct}% achieved), rebate value ${fmt(r.rebate_value)}, `+
                      `status ${r.status}, period ${r.period_start} to ${r.period_end}. `+
                      `Will they hit the target? What actions can I take to help them reach it?`
                    )}>
                    <td><span style={{fontFamily:'var(--mono)',fontSize:10,fontWeight:700}}>{r.rebate_number}</span></td>
                    <td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.customer_name}</td>
                    <td><span className="bdg ba" style={{fontSize:9}}>{REBATE_TYPE_LABELS[r.rebate_type]||r.rebate_type}</span></td>
                    <td style={{fontSize:10,color:'var(--text3)'}}>{r.category||'All'}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:11}}>{fmtL(r.target_amount)}</td>
                    <td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:11}}>{fmtL(r.actual_amount)}</td>
                    <td style={{textAlign:'right'}}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
                        <span style={{fontFamily:'var(--mono)',fontSize:10,fontWeight:700,
                          color:pct>=100?'var(--green)':pct>=70?'var(--a2)':'var(--r2)'}}>
                          {pct}%
                        </span>
                        <div className="ll-rebate-progress">
                          <div className="ll-rebate-bar" style={{
                            width:`${Math.min(pct,100)}%`,
                            background:pct>=100?'var(--green)':pct>=70?'var(--a2)':'var(--r2)',
                          }}/>
                        </div>
                      </div>
                    </td>
                    <td style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:11,fontWeight:700,color:'var(--r2)'}}>{fmt(r.rebate_value)}</td>
                    <td style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)'}}>{r.period_start}<br/>{r.period_end}</td>
                    <td><StatusBadge status={r.status} map={REBATE_STATUS} /></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',gap:4}}>
                        {r.status==='ACHIEVED'&&(
                          <button className="dc-act-btn dc-act-green"
                            onClick={()=>handleStatusUpdate(r.rebate_id,'PENDING_APPROVAL',r.actual_amount)}>
                            Approve
                          </button>
                        )}
                        {r.status==='PENDING_APPROVAL'&&(
                          <button className="dc-act-btn dc-act-green"
                            onClick={()=>handleStatusUpdate(r.rebate_id,'PAID',r.actual_amount)}>
                            Pay
                          </button>
                        )}
                        <button className="dap-trigger-btn sm" style={{fontSize:9}}
                          onClick={()=>openAI(
                            `Quick analysis: ${r.rebate_number} — ${r.customer_name}, `+
                            `${pct}% of target achieved, ${fmt(r.rebate_value)} at stake, status ${r.status}. `+
                            `Should I pay this rebate? Any tax or accounting considerations?`
                          )}>✨</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id:'orders',  label:'📦 Sales Orders',         sub:'Place and track orders' },
  { id:'claims',  label:'📋 Distributor Claims',    sub:'Price diff, damage, freight' },
  { id:'rebates', label:'💰 Customer Rebates',      sub:'Volume and loyalty schemes' },
];

export default function SalesOrders({ onGoChat, dbStatus }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState('orders');

  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  const openAI = useCallback((msg) => { setAiMessage(msg); setAiOpen(true); }, []);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/louvers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch(e) { setError(e.message); }
    finally    { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 5 * 60_000);

  if (loading) return <PageLoader />;
  if (error)   return <ErrorState message={error} onRetry={fetchData} />;

  const kpis = data?.kpis || {};

  return (
    <div className="view">

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="dc-page-header">
        <div>
          <div className="kl" style={{color:'var(--text3)',marginBottom:2}}>SALES ORDERS</div>
          <div style={{fontSize:20,fontWeight:800,color:'var(--text)',letterSpacing:'-0.5px',marginBottom:2}}>
            Orders · Claims · Rebates
          </div>
          <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)'}}>
            HPL · Compact Laminate · Acrylic · Aluminium Louvers · PVC · Operable Systems
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <AiBtn label="Full business briefing"
            onClick={()=>openAI(
              `Give me a full business briefing for my sales orders division: `+
              `${kpis.orders_this_month} orders this month, revenue ${fmtL(kpis.order_revenue||0)}, `+
              `avg margin ${fmtPct(kpis.avg_margin_pct||0)}, pipeline ${fmtL(kpis.pipeline_value||0)}, `+
              `distributor claims pending ${fmtL(kpis.claims_pending||0)}, `+
              `rebate liability ${fmtL(kpis.rebate_liability||0)}. `+
              `What are the top 3 priorities for this week? Where are the biggest risks and opportunities?`
            )} />
          <DataSourceBadge source={data?.data_source} updatedAt={dbStatus?.checkedAt} />
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────────────────────────── */}
      <div className="kg" style={{gridTemplateColumns:'repeat(6,1fr)',marginBottom:6}}>
        {[
          {label:'Orders (MTD)',    val:kpis.orders_this_month,       cls:'sg', fmt:'num',
           ai:`I have ${kpis.orders_this_month} sales orders this month. Is this a healthy order volume? What should I do to grow order count?`},
          {label:'Order Revenue',   val:kpis.order_revenue,           cls:'sb', fmt:'L',
           ai:`My sales orders revenue is ${fmtL(kpis.order_revenue||0)} this month. How does this compare to industry benchmarks? What product mix should I focus on to grow revenue?`},
          {label:'Avg Margin',      val:kpis.avg_margin_pct,          cls:'sg', fmt:'pct',
           ai:`My average order margin is ${fmtPct(kpis.avg_margin_pct||0)} across sales orders. Which products give the highest margins? How can I improve the average?`},
          {label:'Pipeline Value',  val:kpis.pipeline_value,          cls:'st', fmt:'L',
           ai:`My active pipeline value is ${fmtL(kpis.pipeline_value||0)}. What conversion rate should I expect? How do I prioritise which orders to push to close?`},
          {label:'Claims Pending',  val:kpis.claims_pending,          cls:'sp', fmt:'L',
           ai:`I have ${fmtL(kpis.claims_pending||0)} in pending distributor claims. This is cash tied up. How do I resolve claims faster? What documentation reduces claim disputes?`},
          {label:'Rebate Liability',val:kpis.rebate_liability,        cls:'sb', fmt:'L',
           ai:`My rebate liability is ${fmtL(kpis.rebate_liability||0)}. How should I provision for this? What's the correct GST treatment for customer rebates in India under GST law?`},
        ].map(k => (
          <div key={k.label} className={`kc ${k.cls}`} style={{cursor:'pointer'}} onClick={()=>openAI(k.ai)}>
            <div className="kt"><span className="kl">{k.label}</span><span style={{fontSize:9,opacity:.5}}>✨</span></div>
            <div className="kv" style={{fontSize:16}}>
              {k.fmt==='num'  ? k.val :
               k.fmt==='pct'  ? fmtPct(k.val||0) : fmtL(k.val||0)}
            </div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
        <AiBtn sm label="KPI scorecard"
          onClick={()=>openAI(
            `Give me a KPI scorecard for my sales orders: `+
            `${kpis.orders_this_month} orders, revenue ${fmtL(kpis.order_revenue||0)}, `+
            `margin ${fmtPct(kpis.avg_margin_pct||0)}, pipeline ${fmtL(kpis.pipeline_value||0)}, `+
            `claims ${fmtL(kpis.claims_pending||0)}, rebate liability ${fmtL(kpis.rebate_liability||0)}. `+
            `Rate each KPI green/amber/red and give one action per red/amber metric.`
          )} />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="ll-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`ll-tab${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>
            <span className="ll-tab-label">{t.label}</span>
            <span className="ll-tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}
      <div style={{marginTop:14}}>
        {tab==='orders'  && <SalesOrdersTab     data={data} onRefresh={fetchData} openAI={openAI} />}
        {tab==='claims'  && <DistributorClaimsTab data={data} onRefresh={fetchData} openAI={openAI} />}
        {tab==='rebates' && <CustomerRebatesTab   data={data} onRefresh={fetchData} openAI={openAI} />}
      </div>

      {/* ── AI Panel ─────────────────────────────────────────────────────────── */}
      <DiscountAIPanel isOpen={aiOpen} onClose={()=>setAiOpen(false)} initialMessage={aiMessage} />

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Analyze my sales orders — show pending fulfillment, delayed orders, revenue at risk, and which orders to prioritize for dispatch today.')}>
          <span>✨</span>
          <span>Ask AI: Pending orders, dispatch priorities & revenue at risk →</span>
        </div>
      )}
    </div>
  );
}
