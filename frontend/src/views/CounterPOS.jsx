import React, { useState, useRef, useEffect, useCallback } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import { showToast } from '../components/Toast';

// ── Hardware & Sanitary demo catalog (shown when DB unavailable) ──────────────
const DEMO_CATALOG = [
  { id: 'H001', name: 'Ebco Soft-Close Hinge 35mm Pk-10', category: 'Hardware Fittings', price: 485,  unit: 'pack',  stock: 95,  hsn: '8302', brand: 'Ebco' },
  { id: 'H002', name: 'Hettich InnoTech Drawer 400mm',    category: 'Hardware Fittings', price: 1280, unit: 'set',   stock: 42,  hsn: '8302', brand: 'Hettich' },
  { id: 'H003', name: 'Hafele Zinc D-Handle 128mm',        category: 'Hardware Fittings', price: 320,  unit: 'pc',    stock: 210, hsn: '8302', brand: 'Hafele' },
  { id: 'H004', name: 'Ebco Magic Wand Door Stop',         category: 'Hardware Fittings', price: 145,  unit: 'pc',    stock: 130, hsn: '8302', brand: 'Ebco' },
  { id: 'H005', name: 'Hafele Cam Lock 19mm',              category: 'Hardware Fittings', price: 85,   unit: 'pc',    stock: 350, hsn: '8302', brand: 'Hafele' },
  { id: 'S001', name: 'Jaquar Lyric Basin Mixer Chrome',   category: 'Sanitary CP',       price: 4850, unit: 'pc',    stock: 18,  hsn: '8481', brand: 'Jaquar' },
  { id: 'S002', name: 'Hindware Quartz Single Lever Basin',category: 'Sanitary CP',       price: 2200, unit: 'pc',    stock: 24,  hsn: '8481', brand: 'Hindware' },
  { id: 'S003', name: 'Jaquar Aria Shower Panel',          category: 'Sanitary CP',       price: 12500,unit: 'pc',    stock: 6,   hsn: '8481', brand: 'Jaquar' },
  { id: 'S004', name: 'Hindware Concealed Cistern 6/3L',   category: 'Sanitary Ware',     price: 3800, unit: 'pc',    stock: 14,  hsn: '6910', brand: 'Hindware' },
  { id: 'K001', name: 'Hettich Quadro Tandem 450mm',       category: 'Kitchen Systems',   price: 2400, unit: 'pair',  stock: 28,  hsn: '8302', brand: 'Hettich' },
  { id: 'K002', name: 'Ebco Aluminium Profile Handle 1.2m',category: 'Kitchen Systems',   price: 580,  unit: 'pc',    stock: 65,  hsn: '7610', brand: 'Ebco' },
  { id: 'D001', name: 'Hafele 3D Adj Concealed Hinge',     category: 'Door Hardware',     price: 220,  unit: 'pc',    stock: 185, hsn: '8302', brand: 'Hafele' },
];

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'NEFT/RTGS', 'Cheque', 'Credit'];
const GST_RATE = 0.18;
const SALE_STATUS = { DRAFT: 'Draft', SOLD: 'Sold', CANCELLED: 'Cancelled' };

// ── Barcode Scanner Modal ─────────────────────────────────────────────────────
function BarcodeScannerModal({ onScan, onClose }) {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const [status, setStatus] = useState('Requesting camera access…');
  const [scanning, setScanning] = useState(false);
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!supported) { setStatus('BarcodeDetector API not supported on this browser. Use Chrome/Edge.'); return; }
    let detector;
    let interval;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'] });
        setStatus('Point camera at barcode…');
        setScanning(true);
        interval = setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              clearInterval(interval);
              streamRef.current?.getTracks().forEach(t => t.stop());
              onScan(code);
            }
          } catch { /* ignore frame errors */ }
        }, 200);
      })
      .catch(() => setStatus('Camera access denied. Enter barcode manually below.'));
    return () => {
      clearInterval(interval);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [supported, onScan]);

  const [manualCode, setManualCode] = useState('');
  return (
    <div className="qb-modal-overlay" onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: 380, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>📷 Barcode Scanner</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
        </div>
        {supported ? (
          <video ref={videoRef} autoPlay playsInline muted
            style={{ width: '100%', borderRadius: 10, background: '#000', aspectRatio: '4/3', objectFit: 'cover', marginBottom: 12 }} />
        ) : null}
        <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginBottom: 14 }}>{status}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && manualCode.trim()) { onScan(manualCode.trim()); }}}
            placeholder="Enter barcode / product ID manually"
            autoFocus={!supported}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontFamily: 'var(--mono)', background: 'var(--s2)', color: 'var(--text)', outline: 'none' }}
          />
          <button
            onClick={() => { if (manualCode.trim()) onScan(manualCode.trim()); }}
            style={{ padding: '8px 14px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CounterPOS({ onGoChat, dbStatus }) {
  const [catalog, setCatalog]       = useState(DEMO_CATALOG);
  const [catalogSrc, setCatalogSrc] = useState('demo');
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('All');
  const [cart, setCart]             = useState([]);
  const [discount, setDiscount]     = useState(0);
  const [customer, setCustomer]     = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [payMode, setPayMode]       = useState('Cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [saleStatus, setSaleStatus] = useState('DRAFT');
  const [showScanner, setShowScanner] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSaved, setCustomerSaved] = useState(false);
  const [billNo] = useState(`INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`);
  const searchRef = useRef(null);

  // Fetch catalog from DB
  const fetchCatalog = useCallback(() => {
    fetch('/api/catalog/products?limit=100')
      .then(r => r.json())
      .then(d => {
        const products = d.products || d;
        if (Array.isArray(products) && products.length > 0) {
          const mapped = products.map(p => ({
            id:       String(p.product_id),
            name:     p.name || p.sku_name || 'Unknown',
            category: p.category || 'Other',
            price:    p.sell_price || p.price || 0,
            unit:     p.unit || 'pc',
            stock:    p.stock_qty ?? p.quantity ?? 99,
            hsn:      p.hsn_code || '8302',
            brand:    p.brand || '',
          }));
          setCatalog(mapped);
          setCatalogSrc('mysql');
        }
      })
      .catch(() => {}); // keep demo catalog on failure
  }, []);

  useEffect(() => {
    fetchCatalog();
    searchRef.current?.focus();
  }, [fetchCatalog]);

  const categories = ['All', ...Array.from(new Set(catalog.map(p => p.category)))];

  const filtered = catalog.filter(p => {
    const matchCat  = catFilter === 'All' || p.category === catFilter;
    const q         = search.trim().toLowerCase();
    const matchSrch = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
    return matchCat && matchSrch;
  });

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1, specs: '' }];
    });
    setSaleStatus('DRAFT');
    setCustomerSaved(false);
  };

  const updateQty = (id, qty) => {
    if (qty <= 0) { setCart(prev => prev.filter(i => i.id !== id)); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  };

  const updateSpecs = (id, specs) => setCart(prev => prev.map(i => i.id === id ? { ...i, specs } : i));

  const handleBarcodeScan = (code) => {
    setShowScanner(false);
    const product = catalog.find(p => p.id === code || p.name.toLowerCase().includes(code.toLowerCase()));
    if (product) {
      addToCart(product);
      showToast(`Added: ${product.name}`, 'success');
    } else {
      showToast(`No product found for code: ${code}`, 'warning');
    }
    setSearch('');
  };

  const subtotal   = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discAmt    = Math.round(subtotal * (discount / 100));
  const taxable    = subtotal - discAmt;
  const gstAmt     = Math.round(taxable * GST_RATE);
  const grandTotal = taxable + gstAmt;

  const handleBill = () => {
    if (!cart.length) { showToast('Add items to cart first', 'warning'); return; }
    setSaleStatus('SOLD');
    setShowReceipt(true);
  };

  const handleCancel = () => {
    setSaleStatus('CANCELLED');
    setCart([]);
    setDiscount(0);
    setCustomer('');
    setCustomerPhone('');
    setPayMode('Cash');
    setCustomerSaved(false);
    showToast('Sale cancelled', 'warning');
  };

  const handleNewSale = () => {
    setCart([]);
    setDiscount(0);
    setCustomer('');
    setCustomerPhone('');
    setPayMode('Cash');
    setShowReceipt(false);
    setSaleStatus('DRAFT');
    setCustomerSaved(false);
    searchRef.current?.focus();
  };

  const handleSaveCustomer = async () => {
    if (!customer.trim()) { showToast('Enter customer name first', 'warning'); return; }
    setSavingCustomer(true);
    try {
      await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customer.trim(), phone: customerPhone.trim(), segment: 'Retailer', source: 'POS' }),
      });
      setCustomerSaved(true);
      showToast(`${customer} saved to Customer Master`, 'success');
    } catch {
      setCustomerSaved(true); // optimistic in demo mode
      showToast(`${customer} saved (demo mode)`, 'success');
    } finally {
      setSavingCustomer(false);
    }
  };

  const saleStatusBadge = saleStatus === 'SOLD'
    ? { label: 'Sold', bg: '#d1fae5', color: '#065f46' }
    : saleStatus === 'CANCELLED'
    ? { label: 'Cancelled', bg: '#fee2e2', color: '#991b1b' }
    : { label: 'Draft', bg: 'var(--s3)', color: 'var(--text3)' };

  return (
    <div className="view">
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Counter POS — Walk-In Sales & Fast Billing</div>
          <div className="psub">
            Quick billing · barcode scanning · hardware &amp; sanitary catalog
            <DataSourceBadge source={catalogSrc} />
          </div>
        </div>
        <div className="ph-actions">
          <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: saleStatusBadge.bg, color: saleStatusBadge.color }}>
            {saleStatusBadge.label}
          </span>
          <button className="btn-secondary" onClick={() => setShowScanner(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="10" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M10 10h1.5M13.5 10H15M10 12h5M10 14h3M14 12v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Scan Barcode
          </button>
          <button className="btn-primary" onClick={handleNewSale}>＋ New Sale</button>
        </div>
      </div>

      {!showReceipt ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14 }}>
          {/* ── Product Panel ── */}
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Search by product name, brand or ID…"
                style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
              />
              <button
                onClick={() => setShowScanner(true)}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 5 }}>
                📷 Scan
              </button>
            </div>

            {/* Category chips */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
              {categories.map(c => (
                <button key={c} onClick={() => setCatFilter(c)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${catFilter === c ? 'var(--brand)' : 'var(--border)'}`, background: catFilter === c ? 'var(--brand)' : 'var(--surface)', color: catFilter === c ? '#fff' : 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  {c}
                </button>
              ))}
            </div>

            {/* Product Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 8 }}>
              {filtered.map(p => (
                <button key={p.id} onClick={() => addToCart(p)}
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px', textAlign: 'left', cursor: 'pointer', transition: 'all .15s', fontFamily: 'var(--font)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand2)'; e.currentTarget.style.boxShadow = 'var(--shm)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 2 }}>{p.category}</div>
                  {p.brand && <div style={{ fontSize: 9, color: 'var(--brand3)', fontWeight: 700, marginBottom: 3 }}>{p.brand}</div>}
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--brand)', fontFamily: 'var(--mono)' }}>₹{p.price}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>/{p.unit} · {p.hsn && `HSN ${p.hsn} ·`} Stock: {p.stock}</div>
                  {p.stock < 10 && <div style={{ fontSize: 9, color: 'var(--r2)', fontWeight: 700, marginTop: 3 }}>⚠ Low Stock</div>}
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '32px', color: 'var(--text3)', fontSize: 12 }}>
                  No products found. Try a different search or category.
                </div>
              )}
            </div>
          </div>

          {/* ── Cart Panel ── */}
          <div>
            <div className="card" style={{ position: 'sticky', top: 0 }}>
              <div className="ch">
                <div className="ctit">Cart</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {cart.length > 0 && <span className="bdg bg">{cart.length} items</span>}
                  <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: saleStatusBadge.bg, color: saleStatusBadge.color }}>{saleStatusBadge.label}</span>
                </div>
              </div>
              <div style={{ padding: '10px 16px' }}>
                {/* Customer fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 8, alignItems: 'end' }}>
                  <div>
                    <input
                      value={customer}
                      onChange={e => { setCustomer(e.target.value); setCustomerSaved(false); }}
                      placeholder="Customer name (optional)"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font)', background: 'var(--s2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    onClick={handleSaveCustomer}
                    disabled={!customer.trim() || savingCustomer || customerSaved}
                    title="Save to Customer Master"
                    style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: customer.trim() && !customerSaved ? 'pointer' : 'default', background: customerSaved ? 'var(--g5)' : 'var(--surface)', color: customerSaved ? 'var(--green)' : 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {customerSaved ? '✓ Saved' : savingCustomer ? '…' : '+ Save'}
                  </button>
                </div>
                <input
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  type="tel"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font)', background: 'var(--s2)', color: 'var(--text)', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
                />

                {/* Cart items */}
                {cart.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No items added yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', marginBottom: 10 }}>
                    {cart.map(item => (
                      <div key={item.id} style={{ padding: '8px 10px', background: 'var(--s2)', borderRadius: 7, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>₹{item.price}/{item.unit}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <button onClick={() => updateQty(item.id, item.qty - 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 14 }}>−</button>
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)', minWidth: 24, textAlign: 'center' }}>{item.qty}</span>
                            <button onClick={() => updateQty(item.id, item.qty + 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 14 }}>+</button>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', minWidth: 55, textAlign: 'right' }}>₹{(item.price * item.qty).toLocaleString('en-IN')}</div>
                        </div>
                        {/* Specs input per item */}
                        <input
                          value={item.specs || ''}
                          onChange={e => updateSpecs(item.id, e.target.value)}
                          placeholder="Specs / finish / colour (optional)"
                          style={{ width: '100%', marginTop: 5, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 10, fontFamily: 'var(--font)', background: 'var(--surface)', color: 'var(--text2)', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Discount */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Discount %</label>
                  <input type="number" min={0} max={40} value={discount}
                    onChange={e => setDiscount(Math.min(40, Math.max(0, +e.target.value)))}
                    style={{ width: 60, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)', background: 'var(--s2)', color: 'var(--text)', outline: 'none' }}
                  />
                  {discount > 0 && <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--mono)' }}>−₹{discAmt.toLocaleString('en-IN')}</span>}
                </div>

                {/* Totals */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
                  {[['Subtotal', subtotal], ['Discount', -discAmt], ['GST (18%)', gstAmt]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: v < 0 ? 'var(--g2)' : 'var(--text2)', marginBottom: 5 }}>
                      <span>{l}</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{v < 0 ? '−' : ''}₹{Math.abs(v).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: 'var(--text)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span>Grand Total</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--brand)' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Payment Mode */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>Payment Mode</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {PAYMENT_MODES.map(m => (
                      <button key={m} onClick={() => setPayMode(m)}
                        style={{ padding: '4px 11px', borderRadius: 20, border: `1px solid ${payMode === m ? 'var(--brand)' : 'var(--border)'}`, background: payMode === m ? 'var(--brand)' : 'var(--surface)', color: payMode === m ? '#fff' : 'var(--text2)', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleBill}
                    disabled={!cart.length}
                    style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: cart.length ? 'var(--brand)' : 'var(--border)', color: cart.length ? '#fff' : 'var(--text3)', fontWeight: 800, fontSize: 13, cursor: cart.length ? 'pointer' : 'not-allowed', fontFamily: 'var(--font)', transition: 'background .15s' }}>
                    🧾 Bill — ₹{grandTotal.toLocaleString('en-IN')}
                  </button>
                  {cart.length > 0 && (
                    <button
                      onClick={handleCancel}
                      style={{ padding: '11px 14px', borderRadius: 8, border: '1px solid var(--r2)', background: 'transparent', color: 'var(--r2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                      Cancel
                    </button>
                  )}
                </div>

                {onGoChat && (
                  <button className="dap-trigger-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8, fontSize: 11 }}
                    onClick={() => {
                      const items = cart.map(i => `${i.name} ×${i.qty}`).join(', ');
                      onGoChat(`Counter POS cart: ${items}. Total ₹${grandTotal.toLocaleString('en-IN')} for ${customer || 'walk-in'}. Customer type likely ${customer ? 'retail/trade' : 'walk-in'}. What upsell or bulk discount should I offer?`);
                    }}>
                    ✨ AI Upsell Tip
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Receipt View ── */
        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          <div className="card no-print" style={{ textAlign: 'center', padding: '20px', background: 'var(--g5)', border: '2px solid var(--g4)', marginBottom: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>Sale Completed — {SALE_STATUS.SOLD}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{billNo} · {new Date().toLocaleString('en-IN')}</div>
          </div>
          <div className="card" style={{ padding: '24px' }} id="pos-receipt">
            <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px dashed var(--border)', paddingBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>InvenIQ Enterprise</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>HSR Layout, Bangalore · GSTIN: 29AAACI1234Z1Z5</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Cash Memo / Tax Invoice</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 12 }}>
              <div>
                <div style={{ color: 'var(--text3)' }}>Bill No</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{billNo}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--text3)' }}>Customer</div>
                <div style={{ fontWeight: 700 }}>{customer || 'Walk-in Customer'}</div>
                {customerPhone && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{customerPhone}</div>}
              </div>
            </div>
            <table className="tbl" style={{ marginBottom: 12 }}>
              <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>
                {cart.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontSize: 11 }}>
                      <div>{i.name}</div>
                      {i.specs && <div style={{ fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>{i.specs}</div>}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{i.qty} {i.unit}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>₹{i.price}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600 }}>₹{(i.price * i.qty).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
              {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--g2)', marginBottom: 4 }}><span>Discount ({discount}%)</span><span style={{ fontFamily: 'var(--mono)' }}>−₹{discAmt.toLocaleString('en-IN')}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}><span>GST (18%)</span><span style={{ fontFamily: 'var(--mono)' }}>₹{gstAmt.toLocaleString('en-IN')}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                <span>TOTAL</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--brand)' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: 'var(--text3)' }}>
                Payment: {payMode} · HSN: {cart[0]?.hsn || '8302'} · Thank you!
              </div>
            </div>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'center' }}>
            <button onClick={() => window.print()} style={{ padding: '9px 20px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', color: 'var(--text2)' }}>🖨 Print</button>
            <button onClick={handleNewSale} className="btn-primary">＋ New Sale</button>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && <BarcodeScannerModal onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />}
      {onGoChat && (
        <div className="ai-cta-bar" style={{ marginTop: 20 }} onClick={() => onGoChat(
          'Analyse my counter POS sales — what are the best-selling products, average basket size, and peak transaction hours? ' +
          'What upsell or cross-sell opportunities am I missing at the counter?'
        )}>
          <span>✨</span>
          <span>Ask AI: Counter POS insights — best sellers, basket analysis, and upsell opportunities</span>
        </div>
      )}
    </div>
  );
}
