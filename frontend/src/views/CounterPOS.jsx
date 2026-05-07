import React, { useState, useRef, useEffect } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { showToast } from '../components/Toast';

const CATALOG = [
  { id: 'P001', name: '18mm BWP (8x4)',  category: 'Plywood',   price: 1920, unit: 'sheets', stock: 140 },
  { id: 'P002', name: '12mm BWP (8x4)',  category: 'Plywood',   price: 1450, unit: 'sheets', stock: 220 },
  { id: 'P003', name: '12mm MR Plain',   category: 'Plywood',   price: 880,  unit: 'sheets', stock: 180 },
  { id: 'P004', name: '6mm Gurjan BWP',  category: 'Plywood',   price: 960,  unit: 'sheets', stock: 186 },
  { id: 'P005', name: 'Laminates Teak',  category: 'Laminate',  price: 520,  unit: 'sheets', stock: 90  },
  { id: 'P006', name: 'Laminates White', category: 'Laminate',  price: 480,  unit: 'sheets', stock: 75  },
  { id: 'P007', name: 'PVC Louver 100mm',category: 'Louvers',   price: 240,  unit: 'sqft',   stock: 500 },
  { id: 'P008', name: 'Aluminium Louver',category: 'Louvers',   price: 380,  unit: 'sqft',   stock: 320 },
  { id: 'P009', name: 'ACP 4mm Silver',  category: 'ACP',       price: 1100, unit: 'sheets', stock: 60  },
  { id: 'P010', name: 'Fevicol SH 5kg',  category: 'Adhesive',  price: 320,  unit: 'units',  stock: 45  },
];

const CATEGORIES = ['All', ...new Set(CATALOG.map(p => p.category))];
const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'NEFT/RTGS', 'Cheque', 'Credit'];
const GST_RATE = 0.18;

export default function CounterPOS({ onGoChat, dbStatus }) {
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('All');
  const [cart, setCart]             = useState([]);
  const [discount, setDiscount]     = useState(0);
  const [customer, setCustomer]     = useState('');
  const [payMode, setPayMode]       = useState('Cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [billNo]                    = useState(`INV-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`);
  const searchRef                   = useRef(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const filtered = CATALOG.filter(p => {
    const matchCat  = catFilter === 'All' || p.category === catFilter;
    const matchSrch = !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSrch;
  });

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id, qty) => {
    if (qty <= 0) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  };

  const subtotal   = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discAmt    = Math.round(subtotal * (discount / 100));
  const taxable    = subtotal - discAmt;
  const gstAmt     = Math.round(taxable * GST_RATE);
  const grandTotal = taxable + gstAmt;

  const handleBill = () => {
    if (!cart.length) { showToast('Add items to cart first', 'warning'); return; }
    setShowReceipt(true);
  };

  const handleNewSale = () => { setCart([]); setDiscount(0); setCustomer(''); setPayMode('Cash'); setShowReceipt(false); };

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Counter POS — Walk-In Sales & Fast Billing</div>
          <div className="psub">Quick billing for walk-in customers with real-time stock check <DataSourceBadge source="demo" /></div>
        </div>
        <div className="ph-actions">
          <button className="btn-primary" onClick={handleNewSale}>＋ New Sale</button>
        </div>
      </div>

      {!showReceipt ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:14 }}>
          {/* Product Panel */}
          <div>
            {/* Search + Filter */}
            <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by product name or ID…"
                style={{ flex:1, minWidth:180, padding:'7px 12px', border:'1px solid var(--border)', borderRadius:7, fontSize:12, fontFamily:'var(--font)', background:'var(--surface)', color:'var(--text)', outline:'none' }}
              />
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    style={{ padding:'5px 11px', borderRadius:20, border:`1px solid ${catFilter===c?'var(--brand)':'var(--border)'}`, background:catFilter===c?'var(--brand)':'var(--surface)', color:catFilter===c?'#fff':'var(--text2)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:8 }}>
              {filtered.map(p => (
                <button key={p.id} onClick={() => addToCart(p)}
                  style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'12px', textAlign:'left', cursor:'pointer', transition:'all .15s', fontFamily:'var(--font)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--brand2)'; e.currentTarget.style.boxShadow='var(--shm)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.boxShadow='none'; }}>
                  <div style={{ fontSize:9, color:'var(--text3)', fontFamily:'var(--mono)', marginBottom:4 }}>{p.category}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:6, lineHeight:1.3 }}>{p.name}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:'var(--brand)', fontFamily:'var(--mono)' }}>₹{p.price}</div>
                  <div style={{ fontSize:10, color:'var(--text3)', marginTop:3 }}>/{p.unit} · Stock: {p.stock}</div>
                  {p.stock < 20 && <div style={{ fontSize:9, color:'var(--r2)', fontWeight:700, marginTop:3 }}>⚠ Low Stock</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Cart Panel */}
          <div>
            <div className="card" style={{ position:'sticky', top:0 }}>
              <div className="ch">
                <div className="ctit">Cart</div>
                {cart.length > 0 && <span className="bdg bg">{cart.length} items</span>}
              </div>
              <div style={{ padding:'10px 16px' }}>
                {/* Customer */}
                <input
                  value={customer}
                  onChange={e => setCustomer(e.target.value)}
                  placeholder="Customer name (optional)"
                  style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, fontFamily:'var(--font)', background:'var(--s2)', color:'var(--text)', outline:'none', marginBottom:10 }}
                />

                {/* Cart items */}
                {cart.length === 0 ? (
                  <div style={{ padding:'24px 0', textAlign:'center', color:'var(--text3)', fontSize:12 }}>No items added yet</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:280, overflowY:'auto', marginBottom:10 }}>
                    {cart.map(item => (
                      <div key={item.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'var(--s2)', borderRadius:6, border:'1px solid var(--border)' }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.name}</div>
                          <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>₹{item.price}/{item.unit}</div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <button onClick={() => updateQty(item.id, item.qty - 1)} style={{ width:22, height:22, borderRadius:4, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
                          <span style={{ fontSize:12, fontWeight:700, fontFamily:'var(--mono)', minWidth:24, textAlign:'center' }}>{item.qty}</span>
                          <button onClick={() => updateQty(item.id, item.qty + 1)} style={{ width:22, height:22, borderRadius:4, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                        </div>
                        <div style={{ fontSize:12, fontWeight:700, fontFamily:'var(--mono)', color:'var(--text)', minWidth:55, textAlign:'right' }}>₹{(item.price * item.qty).toLocaleString('en-IN')}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Discount */}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <label style={{ fontSize:12, color:'var(--text2)', whiteSpace:'nowrap' }}>Discount %</label>
                  <input type="number" min={0} max={40} value={discount} onChange={e => setDiscount(Math.min(40, Math.max(0, +e.target.value)))}
                    style={{ width:60, padding:'5px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:12, fontFamily:'var(--mono)', background:'var(--s2)', color:'var(--text)', outline:'none' }}
                  />
                  {discount > 0 && <span style={{ fontSize:11, color:'var(--green)', fontFamily:'var(--mono)' }}>−₹{discAmt.toLocaleString('en-IN')}</span>}
                </div>

                {/* Totals */}
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, marginBottom:10 }}>
                  {[
                    ['Subtotal', subtotal],
                    ['Discount', -discAmt],
                    ['GST (18%)', gstAmt],
                  ].map(([l,v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:v<0?'var(--g2)':'var(--text2)', marginBottom:5 }}>
                      <span>{l}</span>
                      <span style={{ fontFamily:'var(--mono)' }}>{v < 0 ? '−' : ''}₹{Math.abs(v).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:800, color:'var(--text)', borderTop:'1px solid var(--border)', paddingTop:8, marginTop:4 }}>
                    <span>Grand Total</span>
                    <span style={{ fontFamily:'var(--mono)', color:'var(--brand)' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Payment Mode */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:5 }}>Payment Mode</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                    {PAYMENT_MODES.map(m => (
                      <button key={m} onClick={() => setPayMode(m)}
                        style={{ padding:'4px 11px', borderRadius:20, border:`1px solid ${payMode===m?'var(--brand)':'var(--border)'}`, background:payMode===m?'var(--brand)':'var(--surface)', color:payMode===m?'#fff':'var(--text2)', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' }}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleBill}
                  disabled={!cart.length}
                  style={{ width:'100%', padding:'11px', borderRadius:8, border:'none', background: cart.length ? 'var(--brand)':'var(--border)', color: cart.length ? '#fff':'var(--text3)', fontWeight:800, fontSize:13, cursor: cart.length ? 'pointer':'not-allowed', fontFamily:'var(--font)', transition:'background .15s' }}>
                  🧾 Generate Bill — ₹{grandTotal.toLocaleString('en-IN')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Receipt View */
        <div style={{ maxWidth:520, margin:'0 auto' }}>
          <div className="card no-print" style={{ textAlign:'center', padding:'20px', background:'var(--g5)', border:'2px solid var(--g4)', marginBottom:14 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--green)' }}>Bill Generated Successfully</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>{billNo} · {new Date().toLocaleString('en-IN')}</div>
          </div>
          <div className="card" style={{ padding:'24px' }} id="pos-receipt">
            <div style={{ textAlign:'center', marginBottom:16, borderBottom:'2px dashed var(--border)', paddingBottom:16 }}>
              <div style={{ fontSize:18, fontWeight:900, color:'var(--text)' }}>InvenIQ Enterprise</div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>HSR Layout, Bangalore · GSTIN: 29XXXXX1234X1ZX</div>
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:4 }}>Cash Memo / Tax Invoice</div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:12 }}>
              <div>
                <div style={{ color:'var(--text3)' }}>Bill No</div>
                <div style={{ fontWeight:700, fontFamily:'var(--mono)' }}>{billNo}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ color:'var(--text3)' }}>Customer</div>
                <div style={{ fontWeight:700 }}>{customer || 'Walk-in Customer'}</div>
              </div>
            </div>
            <table className="tbl" style={{ marginBottom:12 }}>
              <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>
                {cart.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontSize:11 }}>{i.name}</td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{i.qty}</td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>₹{i.price}</td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:600 }}>₹{(i.price*i.qty).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ borderTop:'1px dashed var(--border)', paddingTop:10 }}>
              {discount > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--g2)', marginBottom:4 }}><span>Discount ({discount}%)</span><span style={{ fontFamily:'var(--mono)' }}>−₹{discAmt.toLocaleString('en-IN')}</span></div>}
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text2)', marginBottom:4 }}><span>GST (18%)</span><span style={{ fontFamily:'var(--mono)' }}>₹{gstAmt.toLocaleString('en-IN')}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:900, color:'var(--text)', borderTop:'1px solid var(--border)', paddingTop:8, marginTop:4 }}>
                <span>TOTAL</span><span style={{ fontFamily:'var(--mono)', color:'var(--brand)' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ textAlign:'center', marginTop:10, fontSize:10, color:'var(--text3)' }}>Payment: {payMode} · Thank you for your business!</div>
            </div>
          </div>
          <div className="no-print" style={{ display:'flex', gap:10, marginTop:12, justifyContent:'center' }}>
            <button onClick={() => window.print()} style={{ padding:'9px 20px', borderRadius:7, border:'1px solid var(--border)', background:'var(--surface)', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'var(--font)', color:'var(--text2)' }}>🖨 Print</button>
            <button onClick={handleNewSale} className="btn-primary">＋ New Sale</button>
          </div>
        </div>
      )}
    </div>
  );
}
