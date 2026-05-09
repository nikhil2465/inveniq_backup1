import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import Pagination from '../components/Pagination';

const fmt    = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

const STOCK_LABELS = { in_stock: 'In Stock', on_order: 'On Order', out_of_stock: 'Out of Stock' };
const STOCK_COLORS = { in_stock: 'bg', on_order: 'bt', out_of_stock: 'br' };

const CATEGORY_ICONS = {
  'High Pressure Laminate':        '🏷',
  'Compact Laminate':              '🔲',
  'Acrylic Laminate':              '✨',
  'PVC Laminate':                  '📋',
  'Aluminium Louvers':             '🔧',
  'PVC Louvers':                   '🌬',
  'Operable Louvre System':        '⚙️',
  'Exterior Cladding':             '🏗',
  'Aluminium Composite Panel':     '🔷',
  'Drawer Slides':                 '📦',
  'Hinges':                        '🔩',
  'Handles & Knobs':               '🔑',
  'Furniture Locks':               '🔒',
  'Kitchen Systems':               '🍳',
  'Furniture LED Lights':          '💡',
  'Aluminium Profiles & Handles':  '📐',
  'Glass Hardware':                '🪟',
  'Bed & Wardrobe Fittings':       '🛏',
  'Joinery Fittings & Screws':     '🪛',
  'Office Furniture Fittings':     '🪑',
};

const FALLBACK_CATS = [
  'All', 'Aluminium Louvers', 'PVC Louvers', 'Operable Louvre System',
  'High Pressure Laminate', 'Compact Laminate', 'Acrylic Laminate',
  'PVC Laminate', 'Exterior Cladding', 'Aluminium Composite Panel',
  'Drawer Slides', 'Hinges', 'Handles & Knobs', 'Furniture Locks',
  'Kitchen Systems', 'Furniture LED Lights', 'Aluminium Profiles & Handles',
  'Glass Hardware', 'Bed & Wardrobe Fittings', 'Joinery Fittings & Screws',
  'Office Furniture Fittings',
];

// ── Add Products Modal ─────────────────────────────────────────────────────────
function AddProductModal({ onClose, onAdded, onGoChat }) {
  const [tab,           setTab]           = useState('scan');
  const [file,          setFile]          = useState(null);
  const [preview,       setPreview]       = useState(null);
  const [scanText,      setScanText]      = useState('');
  const [scanning,      setScanning]      = useState(false);
  const [extracted,     setExtracted]     = useState(null);
  const [selected,      setSelected]      = useState(new Set());
  const [editMap,       setEditMap]       = useState({});
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [dragOver,      setDragOver]      = useState(false);
  const [manForm,       setManForm]       = useState({
    name: '', brand: '', category: '', sub_category: '', unit: 'Nos',
    size: '', thickness: '', finish: '', colors: '',
    buy_price: '', sell_price: '', gst_rate: 18, hsn_code: '',
    applications: '', features: '', installation_tips: '',
    lead_time: '3-5 days', moq: 1, stock_status: 'in_stock', tags: '',
  });
  const [manSaving, setManSaving] = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setExtracted(null);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setExtracted(null);
    try {
      const form = new FormData();
      if (file) form.append('file', file);
      if (scanText.trim()) form.append('text_input', scanText.trim());
      const r = await fetch('/api/catalog/scan-image', { method: 'POST', body: form });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`Server error ${r.status}${txt ? ': ' + txt.slice(0, 120) : ''}`);
      }
      const d = await r.json();
      if (d.error) { setExtracted(d); return; }
      setExtracted(d);
      const allIdx = new Set((d.products || []).map((_, i) => i));
      setSelected(allIdx);
      setEditMap({});
    } catch (e) {
      const msg = e.message || 'Unknown error';
      const friendly = msg.includes('Failed to fetch')
        ? 'Cannot reach server — make sure the InvenIQ backend is running on port 8000.'
        : msg;
      setExtracted({ error: friendly, products: [] });
    } finally {
      setScanning(false);
    }
  };

  const getProduct = (i) => ({ ...(extracted?.products?.[i] || {}), ...(editMap[i] || {}) });

  const handleEdit = (i, field, val) => {
    setEditMap(m => ({ ...m, [i]: { ...(m[i] || {}), [field]: val } }));
  };

  const handleAddSelected = async () => {
    const toAdd = [...selected].map(i => getProduct(i)).filter(p => p.name);
    if (!toAdd.length) return;
    setSaving(true);
    try {
      const r = await fetch('/api/catalog/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: toAdd }),
      });
      const d = await r.json();
      if (d.added > 0) { setSaved(true); onAdded(); }
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleManualAdd = async () => {
    if (!manForm.name || !manForm.category) { alert('Name and Category are required.'); return; }
    setManSaving(true);
    try {
      const product = {
        ...manForm,
        buy_price:    parseFloat(manForm.buy_price) || 0,
        sell_price:   parseFloat(manForm.sell_price) || 0,
        gst_rate:     parseFloat(manForm.gst_rate) || 18,
        moq:          parseInt(manForm.moq) || 1,
        applications: manForm.applications ? manForm.applications.split('\n').map(s=>s.trim()).filter(Boolean) : [],
        features:     manForm.features     ? manForm.features.split('\n').map(s=>s.trim()).filter(Boolean)     : [],
        tags:         manForm.tags         ? manForm.tags.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean) : [],
        certifications: [],
        competitors:    [],
      };
      const r = await fetch('/api/catalog/add-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      await r.json();
      setSaved(true);
      onAdded();
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setManSaving(false);
    }
  };

  const CAT_OPTIONS = [
    'Drawer Slides','Hinges','Handles & Knobs','Furniture Locks','Kitchen Systems',
    'Furniture LED Lights','Aluminium Profiles & Handles','Glass Hardware',
    'Bed & Wardrobe Fittings','Joinery Fittings & Screws','Office Furniture Fittings',
    'High Pressure Laminate','Compact Laminate','Acrylic Laminate','PVC Laminate',
    'Aluminium Louvers','PVC Louvers','Operable Louvre System',
    'Exterior Cladding','Aluminium Composite Panel',
  ];

  if (saved) return (
    <div className="qb-modal-overlay" onClick={onClose}>
      <div className="pc-add-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>Products Added!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>
          Your catalog has been updated. New products are now searchable and available in QuoteBuilder.
        </div>
        {onGoChat && (
          <button className="btn-primary" style={{ marginRight: 8 }} onClick={() => { onClose(); onGoChat('Tell me about the products I just added to the catalog — what are their key selling points and ideal customers?'); }}>
            ✨ Ask AI About New Products
          </button>
        )}
        <button className="qb-close-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );

  return (
    <div className="qb-modal-overlay" onClick={onClose}>
      <div className="pc-add-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0f4c81 0%, #1a6ba0 100%)', borderRadius: '12px 12px 0 0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>➕ Add Products to Catalog</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 2 }}>
              Scan any catalog, price list, image or type product details — AI extracts everything
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: 'var(--surface)' }}>
          {[['scan', '✨ Scan from File / Image'], ['manual', '✏️ Manual Entry']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: '10px 20px', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', borderBottom: tab === id ? '2px solid var(--b2)' : '2px solid transparent', color: tab === id ? 'var(--b2)' : 'var(--text2)', background: 'transparent', marginBottom: -2 }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 20, overflowY: 'auto', maxHeight: 'calc(85vh - 120px)' }}>
          {tab === 'scan' && (
            <div>
              {!extracted ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    {/* Drop zone */}
                    <div
                      style={{ border: `2px dashed ${dragOver ? 'var(--b2)' : 'var(--border)'}`, borderRadius: 10, padding: 20, textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--b5)' : 'var(--bg)', transition: 'all .2s', minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onClick={() => document.getElementById('pc-add-file').click()}
                    >
                      {preview ? <img src={preview} alt="preview" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6 }} /> : (
                        <>
                          <div style={{ fontSize: 32 }}>📎</div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text1)' }}>
                            {file ? `📄 ${file.name}` : 'Drop any file here'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            Image · PDF · Excel · Word · CSV — any format
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            Ebco, Hafele, Hettich catalogs all supported
                          </div>
                        </>
                      )}
                    </div>
                    <input id="pc-add-file" type="file" accept="*/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />

                    {/* Text area */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 160, background: 'var(--bg)', color: 'var(--text1)' }}
                        placeholder={"OR paste product info here…\n\nExamples:\n• Ebco soft-close hinge 35mm pack of 10, MRP ₹566\n• Telescopic drawer slide 350mm, buy ₹110, sell ₹165\n• Paste any price list text or product descriptions"}
                        value={scanText}
                        onChange={e => { setScanText(e.target.value); setExtracted(null); }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn-primary" disabled={!file && !scanText.trim()} onClick={handleScan}>
                      {scanning ? '⏳ Extracting…' : '✨ Extract Products with AI'}
                    </button>
                    {scanning && <span style={{ fontSize: 12, color: 'var(--text3)' }}>GPT-4o Vision is reading your file…</span>}
                  </div>

                  <div style={{ marginTop: 16, padding: 12, background: 'var(--s3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
                    <strong>AI can read:</strong> Ebco / Hafele / Hettich / Blum / Dorset catalogs · MRP price lists (GST-inclusive pricing auto-handled) · Product photos · Any Excel/CSV list · Typed or pasted descriptions
                  </div>
                </>
              ) : extracted.error ? (
                <div>
                  <div style={{ color: 'var(--red)', padding: 16, background: 'var(--r5)', borderRadius: 8, marginBottom: 12 }}>⚠ {extracted.error}</div>
                  <button className="btn-secondary" onClick={() => setExtracted(null)}>← Try Again</button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <strong style={{ color: 'var(--green)' }}>✓ {extracted.total_found} products found</strong>
                      {extracted.brand && <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>from {extracted.brand}</span>}
                      {extracted.demo_note && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>💡 {extracted.demo_note}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setExtracted(null)} style={{ fontSize: 12, padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)' }}>← Re-scan</button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text2)' }}>
                        <input type="checkbox" checked={selected.size === extracted.products.length} onChange={e => setSelected(e.target.checked ? new Set(extracted.products.map((_, i) => i)) : new Set())} />
                        Select all
                      </label>
                    </div>
                  </div>

                  {(extracted.products || []).map((prod, i) => {
                    const p = getProduct(i);
                    const isSelected = selected.has(i);
                    return (
                      <div key={i} style={{ border: `1.5px solid ${isSelected ? 'var(--b3)' : 'var(--border)'}`, borderRadius: 10, marginBottom: 10, overflow: 'hidden', background: isSelected ? 'var(--b5)' : 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: isSelected ? 'var(--b5)' : 'var(--s3)' }}>
                          <input type="checkbox" checked={isSelected} onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(i) : n.delete(i); return n; })} />
                          <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{p.name || 'Unnamed Product'}</span>
                          <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--border)', padding: '2px 8px', borderRadius: 4 }}>{p.category}</span>
                          {p.sell_price > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>₹{Number(p.sell_price).toLocaleString('en-IN')}/{p.unit}</span>}
                        </div>
                        {isSelected && (
                          <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 12px' }}>
                            {[
                              ['name', 'Product Name', 'text'],
                              ['brand', 'Brand', 'text'],
                              ['category', 'Category', 'select'],
                              ['unit', 'Unit', 'text'],
                              ['size', 'Size', 'text'],
                              ['finish', 'Finish', 'text'],
                              ['buy_price', 'Buy Price (₹)', 'number'],
                              ['sell_price', 'Sell Price (₹)', 'number'],
                              ['hsn_code', 'HSN Code', 'text'],
                            ].map(([field, label, type]) => (
                              <div key={field}>
                                <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
                                {type === 'select' ? (
                                  <select value={p[field] || ''} onChange={e => handleEdit(i, field, e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: 'var(--bg)', color: 'var(--text1)' }}>
                                    <option value="">Select…</option>
                                    {CAT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                ) : (
                                  <input type={type} value={p[field] || ''} onChange={e => handleEdit(i, field, e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text1)' }} />
                                )}
                              </div>
                            ))}
                            <div style={{ gridColumn: '1/-1' }}>
                              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 2 }}>Applications (one per line)</div>
                              <textarea value={Array.isArray(p.applications) ? p.applications.join('\n') : p.applications || ''} rows={2}
                                onChange={e => handleEdit(i, 'applications', e.target.value.split('\n'))}
                                style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text1)', resize: 'none' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
                    <button className="btn-primary" disabled={selected.size === 0 || saving} onClick={handleAddSelected}>
                      {saving ? '⏳ Saving…' : `✓ Add ${selected.size} Selected Product${selected.size !== 1 ? 's' : ''} to Catalog`}
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{selected.size} of {extracted.products.length} selected</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'manual' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              {[
                ['name', 'Product Name *', 'text', ''], ['brand', 'Brand', 'text', ''],
                ['unit', 'Unit', 'text', 'Nos'], ['size', 'Size / Dimensions', 'text', ''],
                ['thickness', 'Thickness', 'text', ''], ['finish', 'Finish / Color', 'text', ''],
                ['buy_price', 'Buy Price (₹)', 'number', ''], ['sell_price', 'Sell Price (₹)', 'number', ''],
                ['gst_rate', 'GST Rate (%)', 'number', '18'], ['hsn_code', 'HSN Code', 'text', ''],
                ['lead_time', 'Lead Time', 'text', '3-5 days'], ['moq', 'MOQ', 'number', '1'],
              ].map(([field, label, type, ph]) => (
                <div key={field}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <input type={type} placeholder={ph} value={manForm[field] || ''}
                    onChange={e => setManForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text1)' }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>Category *</div>
                <select value={manForm.category} onChange={e => setManForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text1)' }}>
                  <option value="">Select category…</option>
                  {CAT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>Stock Status</div>
                <select value={manForm.stock_status} onChange={e => setManForm(f => ({ ...f, stock_status: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text1)' }}>
                  <option value="in_stock">In Stock</option>
                  <option value="on_order">On Order</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>Applications (one per line)</div>
                <textarea rows={3} value={manForm.applications} onChange={e => setManForm(f => ({ ...f, applications: e.target.value }))}
                  placeholder="Kitchen cabinet doors&#10;Wardrobe shutters&#10;Office furniture"
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text1)' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>Key Features (one per line)</div>
                <textarea rows={3} value={manForm.features} onChange={e => setManForm(f => ({ ...f, features: e.target.value }))}
                  placeholder="Soft-close mechanism&#10;Load rated 45 kg&#10;3-way adjustable"
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text1)' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>Tags (comma-separated)</div>
                <input value={manForm.tags} onChange={e => setManForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="ebco, hinge, soft-close, kitchen"
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text1)' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 4 }}>Installation Tips</div>
                <textarea rows={2} value={manForm.installation_tips} onChange={e => setManForm(f => ({ ...f, installation_tips: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text1)' }} />
              </div>
              <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, paddingTop: 8 }}>
                <button className="btn-primary" disabled={!manForm.name || !manForm.category || manSaving} onClick={handleManualAdd}>
                  {manSaving ? '⏳ Saving…' : '✓ Add Product to Catalog'}
                </button>
                {onGoChat && (
                  <button className="btn-secondary" onClick={() => { onClose(); onGoChat('I want to add products to my catalog. What information should I have ready about each product? What fields are most important for quotations and AI matching?'); }}>
                    ✨ Ask AI for Help
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Product Card ───────────────────────────────────────────────────────────────
function ProductCard({ product, onView, onGoChat }) {
  const icon = CATEGORY_ICONS[product.category] || '📦';
  const marginColor = product.margin_pct >= 25 ? 'var(--green)' : product.margin_pct >= 18 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="pc-card" onClick={() => onView(product)}>
      <div className="pc-card-header">
        <div className="pc-cat-badge">
          <span>{icon}</span>
          <span>{product.category}</span>
        </div>
        <span className={`bdg ${STOCK_COLORS[product.stock_status] || 'ba'}`}>
          {STOCK_LABELS[product.stock_status] || product.stock_status}
        </span>
      </div>

      <div className="pc-card-body">
        <div className="pc-prod-name">{product.name}</div>
        <div className="pc-prod-brand">{product.brand}</div>

        <div className="pc-spec-row">
          {product.thickness && <span className="pc-spec-pill">📏 {product.thickness}</span>}
          {product.size      && <span className="pc-spec-pill">📐 {product.size}</span>}
          {product.finish    && <span className="pc-spec-pill">✨ {product.finish}</span>}
        </div>

        <div className="pc-apps">
          {(product.applications || []).slice(0, 3).map((a, i) => (
            <span key={i} className="pc-app-tag">• {a}</span>
          ))}
          {(product.applications || []).length > 3 && (
            <span className="pc-app-tag pc-more">+{product.applications.length - 3} more</span>
          )}
        </div>
      </div>

      <div className="pc-card-footer">
        <div className="pc-pricing">
          <div className="pc-price">
            <span className="pc-price-label">List</span>
            <span className="pc-price-val">{fmt(product.sell_price)}/{product.unit}</span>
          </div>
          <div className="pc-margin" style={{ color: marginColor }}>
            {fmtPct(product.margin_pct)} margin
          </div>
        </div>
        <div className="pc-card-actions">
          <button className="pc-view-btn" onClick={e => { e.stopPropagation(); onView(product); }}>
            View Specs
          </button>
          {onGoChat && (
            <button className="pc-ai-btn" onClick={e => {
              e.stopPropagation();
              onGoChat(`Tell me about ${product.name} — applications, pricing, specifications and which customers should I target?`);
            }}>✨ AI</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Product Detail Modal ───────────────────────────────────────────────────────
function ProductDetail({ product, onClose, onGoChat }) {
  const icon = CATEGORY_ICONS[product.category] || '📦';

  return (
    <div className="pc-modal-overlay" onClick={onClose}>
      <div className="pc-modal" onClick={e => e.stopPropagation()}>
        <div className="pc-modal-header">
          <div>
            <div className="pc-modal-cat">{icon} {product.category} · {product.sub_category}</div>
            <div className="pc-modal-name">{product.name}</div>
            <div className="pc-modal-brand">{product.brand}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span className={`bdg ${STOCK_COLORS[product.stock_status] || 'ba'}`}>
              {STOCK_LABELS[product.stock_status]}
            </span>
            <button className="qb-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="pc-modal-body">
          {/* Left column */}
          <div className="pc-modal-left">
            {/* Pricing */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Pricing</div>
              <div className="pc-pricing-grid">
                <div className="pc-pricing-cell">
                  <div className="pc-pricing-cell-label">Buy Price</div>
                  <div className="pc-pricing-cell-val">{fmt(product.buy_price)}</div>
                  <div className="pc-pricing-cell-unit">per {product.unit}</div>
                </div>
                <div className="pc-pricing-cell">
                  <div className="pc-pricing-cell-label">Sell Price</div>
                  <div className="pc-pricing-cell-val pc-sell">{fmt(product.sell_price)}</div>
                  <div className="pc-pricing-cell-unit">per {product.unit}</div>
                </div>
                <div className="pc-pricing-cell">
                  <div className="pc-pricing-cell-label">Gross Margin</div>
                  <div className="pc-pricing-cell-val" style={{ color: product.margin_pct >= 20 ? 'var(--green)' : 'var(--amber)' }}>
                    {fmtPct(product.margin_pct)}
                  </div>
                  <div className="pc-pricing-cell-unit">before freight</div>
                </div>
              </div>
              <div className="pc-hsn-row">
                <span>HSN Code: <strong>{product.hsn_code}</strong></span>
                <span>GST: <strong>{product.gst_rate}%</strong></span>
                <span>MOQ: <strong>{product.moq} {product.unit}s</strong></span>
                <span>Lead Time: <strong>{product.lead_time}</strong></span>
              </div>
            </div>

            {/* Specifications */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Specifications</div>
              <div className="pc-spec-table">
                {product.size      && <div className="pc-spec-item"><span>Size</span><strong>{product.size}</strong></div>}
                {product.thickness && <div className="pc-spec-item"><span>Thickness</span><strong>{product.thickness}</strong></div>}
                {product.finish    && <div className="pc-spec-item"><span>Finish</span><strong>{product.finish}</strong></div>}
                {product.weight_kg && <div className="pc-spec-item"><span>Weight</span><strong>{product.weight_kg} kg/sheet</strong></div>}
                {product.colors    && <div className="pc-spec-item"><span>Colours</span><strong>{product.colors}</strong></div>}
              </div>
            </div>

            {/* Features */}
            {(product.features || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Key Features</div>
                <ul className="pc-feat-list">
                  {product.features.map((f, i) => <li key={i}>✓ {f}</li>)}
                </ul>
              </div>
            )}

            {/* Installation */}
            {product.installation_tips && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Installation Tips</div>
                <div className="pc-install-note">{product.installation_tips}</div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="pc-modal-right">
            {/* Applications */}
            <div className="pc-detail-section">
              <div className="pc-detail-sec-title">Applications</div>
              <div className="pc-app-list">
                {(product.applications || []).map((a, i) => (
                  <div key={i} className="pc-app-item">
                    <span className="pc-app-dot" />
                    {a}
                  </div>
                ))}
              </div>
            </div>

            {/* Certifications */}
            {(product.certifications || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Certifications & Standards</div>
                <div className="pc-cert-list">
                  {product.certifications.map((c, i) => (
                    <div key={i} className="pc-cert-item">🏆 {c}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Suppliers */}
            {(product.suppliers || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Approved Suppliers</div>
                {product.suppliers.map((s, i) => (
                  <div key={i} className="pc-sup-item">🏭 {s}</div>
                ))}
              </div>
            )}

            {/* Competitors */}
            {(product.competitors || []).length > 0 && (
              <div className="pc-detail-section">
                <div className="pc-detail-sec-title">Competing Brands</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {product.competitors.map((c, i) => (
                    <span key={i} style={{ background: 'var(--s3)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* AI CTA */}
            {onGoChat && (
              <div className="pc-ai-cta-box" onClick={() => {
                onClose();
                onGoChat(`I'm selling ${product.name}. Give me a competitive sales pitch, ideal customer profiles, and pricing strategy for Bangalore market.`);
              }}>
                <div className="pc-ai-cta-icon">✨</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Ask AI about this product</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Sales pitch, pricing strategy, target customers</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 18, color: 'var(--text3)' }}>→</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ProductCatalog View ───────────────────────────────────────────────────
export default function ProductCatalog({ onGoChat, dbStatus }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch]   = useState('');
  const [view, setView]       = useState('grid');
  const [selected, setSelected] = useState(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(() => {
    fetch('/api/catalog').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 10 * 60_000);
  useEffect(() => { setPage(1); }, [category, inStockOnly, search, view]);

  const products = useMemo(() => {
    let list = data?.products || [];
    if (category !== 'All') list = list.filter(p => p.category === category);
    if (inStockOnly)        list = list.filter(p => p.stock_status === 'in_stock');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
        || (p.tags || []).join(' ').includes(q)
        || (p.applications || []).some(a => a.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data, category, search, inStockOnly]);
  const pagedProducts = view === 'table' ? products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : products;

  const catCounts = useMemo(() => {
    const counts = {};
    (data?.products || []).forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
    return counts;
  }, [data]);

  const allCategories = useMemo(() => {
    const apiCats = data?.categories || [];
    const merged = [...new Set([...FALLBACK_CATS.slice(1), ...apiCats])].sort();
    return ['All', ...merged];
  }, [data]);

  if (loading) return <PageLoader />;

  return (
    <div className="view">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Product Catalog</div>
          <div className="psub">Louvers · Laminates · ACP · Cladding — with full specs, pricing & applications</div>
        </div>
        <div className="ph-actions">
          <DataSourceBadge source={data?.data_source || 'catalog'} />
          <button className="btn-secondary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            ➕ Add Products
          </button>
          {onGoChat && (
            <button className="btn-primary" onClick={() => onGoChat('Which products in our catalog have the highest margin and best market demand in Bangalore?')}>
              ✨ AI Product Intelligence
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="kg g4">
        <div className="kc sb" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I have ${data?.products?.length || 0} products across ${data?.categories?.length || 0} categories. Which product lines should I prioritise stocking and which have the best sales velocity?`)}>
          <div className="kt"><span className="kl">Total Products</span></div>
          <div className="kv">{data?.products?.length || 0}</div>
          <div className="ks">in catalog</div>
        </div>
        <div className="kc st" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`I carry ${data?.categories?.length || 0} product categories including Louvers, Laminates, ACP and Cladding. Which categories have the best margin and demand in my market?`)}>
          <div className="kt"><span className="kl">Categories</span></div>
          <div className="kv">{data?.categories?.length || 0}</div>
          <div className="ks">product lines</div>
        </div>
        <div className="kc sg" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`${(data?.products || []).filter(p => p.stock_status === 'in_stock').length} of my ${data?.products?.length || 0} products are in stock. Which out-of-stock items should I prioritise restocking based on demand and margin?`)}>
          <div className="kt"><span className="kl">In Stock</span></div>
          <div className="kv">{(data?.products || []).filter(p => p.stock_status === 'in_stock').length}</div>
          <div className="ks">available now</div>
        </div>
        <div className="kc sg" style={{ cursor: onGoChat ? 'pointer' : 'default' }}
          onClick={() => onGoChat?.(`My average catalog margin is ${fmtPct((data?.products || []).reduce((s,p) => s+p.margin_pct, 0) / Math.max((data?.products||[]).length,1))}. Which products have the highest margins and how can I shift my sales mix towards them?`)}>
          <div className="kt"><span className="kl">Avg Margin</span></div>
          <div className="kv">{fmtPct((data?.products || []).reduce((s,p) => s+p.margin_pct, 0) / Math.max((data?.products||[]).length,1))}</div>
          <div className="ks">across catalog</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <input className="view-search" placeholder="🔍  Search products, applications, tags…"
          value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
          In-stock only
        </label>
        <div className="vswitch">
          <button className={`vswitch-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>⊞ Grid</button>
          <button className={`vswitch-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>☰ List</button>
        </div>
        <ExportButton rows={products} filename="product_catalog" columns={[
          { key: 'product_id', label: 'ID' }, { key: 'sku_name', label: 'Product' },
          { key: 'category', label: 'Category' }, { key: 'sell_price', label: 'Sell Price (₹)' },
          { key: 'margin_pct', label: 'Margin %' }, { key: 'stock_status', label: 'Stock Status' },
          { key: 'unit', label: 'Unit' }, { key: 'applications', label: 'Applications' },
        ]} />
      </div>

      {/* Category tabs */}
      <div className="stabs" style={{ marginBottom: 16 }}>
        {allCategories.filter(cat => cat === 'All' || catCounts[cat] > 0).map(cat => (
          <button key={cat} className={`stab${category === cat ? ' active' : ''}`}
            onClick={() => setCategory(cat)}>
            {cat !== 'All' && CATEGORY_ICONS[cat] && <span>{CATEGORY_ICONS[cat]} </span>}
            {cat}
            {cat !== 'All' && catCounts[cat] ? <span className="stab-cnt">{catCounts[cat]}</span> : null}
          </button>
        ))}
      </div>

      {/* Products */}
      {view === 'grid' ? (
        <div className="pc-grid">
          {products.map(p => (
            <ProductCard key={p.product_id} product={p} onView={setSelected} onGoChat={onGoChat} />
          ))}
        </div>
      ) : (
        <div className="card-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Size / Thickness</th>
                <th>Buy Price</th>
                <th>Sell Price</th>
                <th>Margin</th>
                <th>Lead Time</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map(p => (
                <tr key={p.product_id} style={{ cursor: 'pointer' }} onClick={() => setSelected(p)}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.brand}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{CATEGORY_ICONS[p.category]} {p.category}</td>
                  <td style={{ fontSize: 12 }}>{p.thickness || '—'} · {p.size?.split('(')[0]?.trim() || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(p.buy_price)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{fmt(p.sell_price)}/{p.unit}</td>
                  <td>
                    <span style={{ color: p.margin_pct >= 20 ? 'var(--green)' : p.margin_pct >= 14 ? 'var(--amber)' : 'var(--red)', fontWeight: 600, fontSize: 12 }}>
                      {fmtPct(p.margin_pct)}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.lead_time}</td>
                  <td><span className={`bdg ${STOCK_COLORS[p.stock_status]}`}>{STOCK_LABELS[p.stock_status]}</span></td>
                  <td>
                    <button className="qb-view-btn" onClick={e => { e.stopPropagation(); setSelected(p); }}>View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No products match your filters.</div>
          )}
          <Pagination page={page} total={products.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      {products.length === 0 && view === 'grid' && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
          No products match your filters. Try a different category or search term.
        </div>
      )}

      {/* Product detail modal */}
      {selected && (
        <ProductDetail product={selected} onClose={() => setSelected(null)} onGoChat={onGoChat ? (q) => { setSelected(null); onGoChat(q); } : null} />
      )}

      {/* Add products modal */}
      {showAddModal && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => { fetchData(); setTimeout(() => setShowAddModal(false), 1800); }}
          onGoChat={onGoChat}
        />
      )}

      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('Which products have the highest margin? Show me pricing recommendations, slow movers, and which SKUs to push this month.')}>
          <span>✨</span>
          <span>Ask AI: Best-margin products, pricing strategy & SKU recommendations →</span>
        </div>
      )}
    </div>
  );
}
