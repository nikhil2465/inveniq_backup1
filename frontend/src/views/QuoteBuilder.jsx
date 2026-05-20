import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import Pagination from '../components/Pagination';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';
import { useDraggable } from '../components/DraggableModal';

// ── WhatsApp Scanner Modal ─────────────────────────────────────────────────────
function WhatsAppScannerModal({ onClose, onBuildQuote }) {
  const [file,             setFile]           = useState(null);
  const [preview,          setPreview]         = useState(null);
  const [scanning,         setScanning]        = useState(false);
  const [result,           setResult]          = useState(null);
  const [error,            setError]           = useState(null);
  const [selectedProducts, setSelectedProducts] = useState({});
  const [dragOver,         setDragOver]        = useState(false);
  const [textInput,        setTextInput]       = useState('');
  const [contactPhone,     setContactPhone]    = useState('');
  const [contactEmail,     setContactEmail]    = useState('');

  const canScan = !scanning && (file || textInput.trim());

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleScan = async () => {
    if (!canScan) return;
    setScanning(true);
    setError(null);
    try {
      const form = new FormData();
      if (file) form.append('file', file);
      if (textInput.trim()) form.append('text_input', textInput.trim());
      const r = await fetch('/api/quotes/scan-whatsapp', { method: 'POST', body: form });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const d = await r.json();
      setResult(d);
      const init = {};
      (d.matched_products || []).forEach((mp, i) => {
        if (mp.best_match) init[i] = mp.best_match.product_id;
      });
      setSelectedProducts(init);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const handleDemoScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('text_input', '__demo__');
      const r = await fetch('/api/quotes/scan-whatsapp', { method: 'POST', body: form });
      const d = await r.json();
      setResult(d);
      const init = {};
      (d.matched_products || []).forEach((mp, i) => {
        if (mp.best_match) init[i] = mp.best_match.product_id;
      });
      setSelectedProducts(init);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const handleBuildQuote = () => {
    if (!result) return;
    const ext = result.extracted;
    const initialData = {
      customer_name:  ext.customer_name  || '',
      customer_type:  ext.customer_type  || 'Developer',
      contact_person: ext.contact_person || '',
      contact_phone:  contactPhone || ext.contact_phone  || '',
      contact_email:  contactEmail || ext.contact_email  || '',
      project_name:   ext.project_name   || '',
      site_location:  ext.site_location  || '',
      notes: [ext.special_requirements, ext.delivery_notes].filter(Boolean).join(' · '),
    };
    const initialLines = (result.matched_products || []).map((mp, i) => {
      const pid  = selectedProducts[i];
      const prod = (mp.matches || []).find(p => String(p.product_id) === String(pid)) || mp.best_match;
      if (prod) {
        return {
          product_id:     String(prod.product_id),
          product_name:   prod.name,
          category:       prod.category,
          quantity:       mp.required?.quantity || 1,
          unit:           prod.unit,
          unit_price:     prod.sell_price,
          buy_price:      prod.buy_price,
          discount_pct:   0,
          specifications: mp.required?.specifications || '',
        };
      }
      // No catalog match — add a placeholder so the item still appears in the quote
      if (mp.required?.description) {
        return {
          product_id:     '',
          product_name:   mp.required.description,
          category:       '',
          quantity:       mp.required?.quantity || 1,
          unit:           mp.required?.unit || 'Nos',
          unit_price:     0,
          buy_price:      0,
          discount_pct:   0,
          specifications: mp.required?.specifications || '',
        };
      }
      return null;
    }).filter(Boolean);
    onBuildQuote(initialData, initialLines.length > 0 ? initialLines : [{ ...BLANK_LINE }]);
  };

  const [savedToCatalog, setSavedToCatalog] = useState(new Set());
  const [savingCatalog,  setSavingCatalog]  = useState(null);

  const handleSaveToCatalog = async (mp, i) => {
    setSavingCatalog(i);
    const req = mp.required || {};
    const product = {
      name:         req.description || 'Unknown Product',
      brand:        '',
      category:     '',
      sub_category: '',
      unit:         req.unit || 'Nos',
      size:         req.specifications || '',
      finish:       '',
      buy_price:    0,
      sell_price:   0,
      gst_rate:     18,
      hsn_code:     '8302',
      applications: req.notes ? [req.notes] : [],
      features:     [],
      tags:         [],
      stock_status: 'in_stock',
      lead_time:    '3-5 days',
      moq:          1,
    };
    try {
      await fetch('/api/catalog/add-product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) });
      setSavedToCatalog(s => new Set([...s, i]));
    } catch (e) { /* silent */ }
    setSavingCatalog(null);
  };

  const CONF_COLOR  = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--r2)', none: 'var(--text3)' };
  const CONF_LABEL  = { high: 'high match', medium: 'medium match', low: 'low match', none: 'nearest available' };

  const { ref: scanModalRef, style: scanDragStyle } = useDraggable();

  // Pre-extract phone/email from typed/pasted text — instant feedback before AI scan runs
  useEffect(() => {
    if (!textInput.trim() || result) return;
    const EM = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/;
    const PH = /(?:\+?91[-.\s]?)?[6-9]\d{9}|\+?\d{10,13}/;
    const em = textInput.match(EM);
    const ph = textInput.match(PH);
    if (em) setContactEmail(em[0]);
    if (ph) setContactPhone(ph[0].replace(/[\s\-()+]/g, ''));
  }, [textInput, result]);

  // Populate / override from AI scan result (AI is more reliable for full document scans)
  useEffect(() => {
    if (!result?.extracted) return;
    if (result.extracted.contact_phone) setContactPhone(result.extracted.contact_phone);
    if (result.extracted.contact_email) setContactEmail(result.extracted.contact_email);
  }, [result]);

  return (
    <div className="qb-modal-overlay">
      <div className="scan-modal" ref={scanModalRef} style={scanDragStyle}>
        {/* Header */}
        <div className="qb-modal-header" style={{ background: 'linear-gradient(135deg, #0f4c81 0%, #1a6ba0 100%)', borderTop: 'none', borderRadius: '12px 12px 0 0' }}>
          <div>
            <div className="qb-modal-title" style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>📱 WhatsApp Requirement Scanner</div>
            <div className="qb-modal-sub" style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 3 }}>
              Upload any file or paste text — AI extracts all requirements and matches your catalog
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
        </div>

        <div className="scan-body">
          {/* Upload panel */}
          <div className="scan-upload-panel">
            <div
              className={`scan-drop-zone${dragOver ? ' drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('scan-file-input').click()}
            >
              {preview ? (
                <img src={preview} alt="preview" className="scan-preview-img" />
              ) : (
                <>
                  <div className="scan-drop-icon">📎</div>
                  <div className="scan-drop-label">
                    {file ? `📄 ${file.name}` : 'Drop any file here'}
                  </div>
                  <div className="scan-drop-sub">JPG · PNG · PDF · DOCX · XLSX · CSV · TXT · any file</div>
                </>
              )}
            </div>

            <input
              id="scan-file-input" type="file" accept="*/*"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />

            {/* OR divider */}
            <div className="scan-or-divider"><span>OR</span></div>

            {/* Typed / pasted text input */}
            <textarea
              className="scan-text-input"
              placeholder={'Paste or type requirement here…\n\nExamples:\n• "Need 10 HPL sheets 1mm matte teak"\n• WhatsApp message text\n• Any unformatted list of items'}
              value={textInput}
              onChange={e => { setTextInput(e.target.value); setResult(null); setError(null); }}
              rows={5}
            />

            <div className="scan-actions">
              {canScan && (
                <button className="btn-primary" onClick={handleScan}>
                  ✨ Scan & Extract Requirements
                </button>
              )}
              {!canScan && !result && (
                <button className="scan-demo-btn" onClick={handleDemoScan}>
                  ▶ Try with Demo WhatsApp Message
                </button>
              )}
              {scanning && (
                <div className="scan-loading">
                  <span className="scan-spinner"></span>
                  AI is analysing your requirement…
                </div>
              )}
            </div>

            {error && <div className="scan-error">⚠ {error}</div>}

            {/* Tips */}
            <div className="scan-tips">
              <div className="scan-tip-title">What works best</div>
              <div className="scan-tip">📸 WhatsApp screenshot or BOQ photo</div>
              <div className="scan-tip">📑 PDF / DOCX / Excel requisition form</div>
              <div className="scan-tip">💬 Paste typed or copied WhatsApp text</div>
              <div className="scan-tip">📋 Any unorganized list — AI handles it</div>
            </div>
          </div>

          {/* Results panel */}
          {result && (
            <div className="scan-results-panel">
              {result.demo_note && (
                <div className="scan-demo-notice">💡 {result.demo_note}</div>
              )}

              {/* Extracted info */}
              <div className="scan-section-hd">Extracted Customer Info</div>
              <div className="scan-info-grid">
                {[
                  ['Customer',  result.extracted.customer_name],
                  ['Type',      result.extracted.customer_type],
                  ['Contact',   result.extracted.contact_person],
                  ['Project',   result.extracted.project_name],
                  ['Location',  result.extracted.site_location],
                ].filter(([, v]) => v).map(([l, v]) => (
                  <div key={l} className="scan-info-item">
                    <span className="scan-info-lbl">{l}</span>
                    <span className="scan-info-val">{v}</span>
                  </div>
                ))}
              </div>

              {/* Always-editable phone + email fields — user can fill / correct if AI missed them */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 }}>
                    Phone
                  </div>
                  <input
                    className="qb-input"
                    style={{ fontSize: 12, padding: '5px 8px', height: 30 }}
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    placeholder="+91 XXXXX XXXXX"
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 }}>
                    Email
                  </div>
                  <input
                    className="qb-input"
                    style={{ fontSize: 12, padding: '5px 8px', height: 30 }}
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="email@example.com"
                    type="email"
                  />
                </div>
              </div>

              {result.extracted.special_requirements && (
                <div className="scan-special">{result.extracted.special_requirements}</div>
              )}

              {/* Product matches */}
              <div className="scan-section-hd" style={{ marginTop: 16 }}>
                Product Matches
                <span className="scan-count">{(result.matched_products || []).length} items detected</span>
              </div>

              {(result.matched_products || []).map((mp, i) => (
                <div key={i} className={`scan-product-card${mp.confidence === 'none' ? ' scan-card-none' : ''}`}>
                  <div className="scan-req-row">
                    <span className="bdg ba">REQUIRED</span>
                    <span className="scan-req-desc">{mp.required?.description}</span>
                    {mp.required?.quantity > 0 && (
                      <span className="scan-req-qty">{mp.required.quantity} {mp.required.unit || 'units'}</span>
                    )}
                    <span className="scan-conf" style={{ color: CONF_COLOR[mp.confidence] || 'var(--text3)' }}>
                      {CONF_LABEL[mp.confidence] || mp.confidence}
                    </span>
                    {savedToCatalog.has(i) ? (
                      <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>✓ Saved to Catalog</span>
                    ) : (
                      <button
                        disabled={savingCatalog === i}
                        onClick={() => handleSaveToCatalog(mp, i)}
                        style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {savingCatalog === i ? '⏳' : '➕ Catalog'}
                      </button>
                    )}
                  </div>
                  {mp.required?.specifications && (
                    <div className="scan-req-specs">{mp.required.specifications}</div>
                  )}
                  {mp.required?.notes && (
                    <div className="scan-req-specs" style={{ fontStyle: 'normal', color: 'var(--text2)' }}>
                      📝 {mp.required.notes}
                    </div>
                  )}
                  {mp.confidence === 'none' && (
                    <div className="scan-no-match-note">
                      ⚠ Not in catalog — showing nearest available products. Select one or skip.
                    </div>
                  )}
                  <div className="scan-match-row">
                    {mp.matches?.length > 0 ? mp.matches.map(match => (
                      <div
                        key={match.product_id}
                        className={`scan-match-chip${String(selectedProducts[i]) === String(match.product_id) ? ' selected' : ''}${mp.confidence === 'none' ? ' chip-none' : ''}`}
                        onClick={() => setSelectedProducts(p => ({ ...p, [i]: match.product_id }))}
                      >
                        <div className="scan-chip-name">{match.name}</div>
                        <div className="scan-chip-meta">
                          ₹{(match.sell_price || 0).toLocaleString('en-IN')}/{match.unit} · {match.margin_pct}% margin
                        </div>
                      </div>
                    )) : (
                      <div className="scan-no-match">No products in catalog — item will be skipped</div>
                    )}
                  </div>
                </div>
              ))}

              <button className="qb-save-btn scan-build-btn" onClick={handleBuildQuote}>
                ✓ Build Quotation with Selected Products →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Image Product Search Modal ─────────────────────────────────────────────────
function ImageSearchModal({ onClose, onAddProduct }) {
  const [file,      setFile]    = useState(null);
  const [preview,   setPreview] = useState(null);
  const [searching, setSearching] = useState(false);
  const [result,    setResult]  = useState(null);
  const [error,     setError]   = useState(null);
  const [dragOver,  setDragOver] = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please upload an image file (JPG, PNG, WEBP).'); return; }
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSearch = async () => {
    if (!file || searching) return;
    setSearching(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/catalog/visual-search', { method: 'POST', body: form });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const d = await r.json();
      if (d.error) { setError(d.error); setResult(null); }
      else setResult(d);
    } catch (e) {
      setError(e.message || 'Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (match) => {
    onAddProduct({
      product_id:   String(match.product_id),
      product_name: match.name,
      category:     match.category,
      unit:         match.unit,
      unit_price:   match.sell_price || 0,
      buy_price:    match.buy_price  || 0,
      quantity:     1,
      discount_pct: 0,
      specifications: '',
    });
    onClose();
  };

  return (
    <div className="qb-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qb-modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="qb-modal-header">
          <div>
            <div className="qb-modal-title">🔍 Search Product by Image</div>
            <div className="qb-modal-sub">Take a photo of any product to find it in the catalog</div>
          </div>
          <button className="qb-close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Upload zone */}
          {!preview ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('img-search-file').click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--border)'}`,
                borderRadius: 12, padding: '40px 24px', textAlign: 'center',
                cursor: 'pointer', background: dragOver ? 'var(--g5)' : 'var(--s3)',
                transition: '.15s',
              }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📷</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Drop a product photo here</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>or click to browse · JPG, PNG, WEBP</div>
              <input id="img-search-file" type="file" accept="image/*"
                style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </div>
          ) : (
            <div style={{ position: 'relative', textAlign: 'center', marginBottom: 16 }}>
              <img src={preview} alt="Product" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 10, border: '2px solid var(--border)', objectFit: 'contain' }} />
              <button
                onClick={() => { setFile(null); setPreview(null); setResult(null); setError(null); }}
                style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', fontSize: 14, lineHeight: '26px', textAlign: 'center' }}>
                ×
              </button>
            </div>
          )}

          {/* Search button */}
          {file && !result && (
            <button className="qb-save-btn" onClick={handleSearch} disabled={searching}
              style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}>
              {searching ? (
                <><span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8 }} />Identifying product…</>
              ) : '🔍 Find in Catalog'}
            </button>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid var(--r3)', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 13, color: 'var(--r2)' }}>
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div style={{ marginTop: 16 }}>
              {/* Identified product */}
              <div style={{ background: 'var(--g5)', border: '1px solid var(--g4)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>AI Identified</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{result.identified_product}</div>
                {result.identified_category && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    Category: {result.identified_category}
                    {result.identified_brand ? ` · Brand: ${result.identified_brand}` : ''}
                  </div>
                )}
              </div>

              {/* Match list */}
              {result.matches?.length > 0 ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
                    Top Catalog Matches — click to add to quote
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.matches.map((m, i) => {
                      const conf = m.confidence_pct || 0;
                      const confColor = conf >= 80 ? 'var(--g2)' : conf >= 60 ? 'var(--amber)' : 'var(--text3)';
                      return (
                        <div key={m.product_id || i}
                          onClick={() => handleSelect(m)}
                          style={{ padding: '12px 14px', borderRadius: 10, border: '1.5px solid var(--border)',
                            cursor: 'pointer', background: 'var(--surface)', transition: '.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = 'var(--g5)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                                {m.sku_code} · {m.category}
                              </div>
                              {m.reason && (
                                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic' }}>
                                  {m.reason}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--brand)' }}>
                                ₹{(m.sell_price || 0).toLocaleString('en-IN')}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text3)' }}>per {m.unit}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: confColor, marginTop: 4 }}>
                                {conf}% match
                              </div>
                            </div>
                          </div>
                          {/* Confidence bar */}
                          <div style={{ marginTop: 8, height: 3, background: 'var(--s3)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${conf}%`, background: confColor, borderRadius: 2, transition: '.3s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>
                  No catalog matches found. Try a clearer photo or a different angle.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt    = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtL   = (n) => { const v = Number(n); return v >= 100000 ? `₹${(v/100000).toFixed(2)}L` : fmt(v); };
const fmtPct = (n) => `${Number(n).toFixed(1)}%`;

// ── Status configs ─────────────────────────────────────────────────────────────
const QUOTE_STATUS = {
  DRAFT:       { label: 'Draft',       cls: 'ba' },
  SENT:        { label: 'Sent',        cls: 'bb' },
  NEGOTIATING: { label: 'Negotiating', cls: 'bt' },
  WON:         { label: 'Won',         cls: 'bg' },
  LOST:        { label: 'Lost',        cls: 'br' },
  EXPIRED:     { label: 'Expired',     cls: 'ba' },
  REVISED:     { label: 'Revised',     cls: 'bp' },
};

const EDITABLE_STATUSES  = ['DRAFT', 'SENT', 'NEGOTIATING', 'REVISED'];
const CUSTOMER_TYPES     = ['Architect', 'Contractor', 'Interior Firm', 'Developer', 'Retailer'];
const PAYMENT_TERMS      = ['100% Advance', '50% Advance + 50% on Delivery', 'Net 30 Days', 'Net 45 Days', 'Net 60 Days', 'Letter of Credit'];
const DELIVERY_TERMS     = ['Ex-Works', 'Door Delivery — Bangalore', 'FOR Destination', 'As per PO'];
const VALIDITY_OPTS      = [7, 14, 21, 30];

const BLANK_LINE = { product_id: '', product_name: '', category: '', quantity: 1, unit: 'sheet', unit_price: 0, discount_pct: 0, buy_price: 0, specifications: '' };
const BLANK_FORM = {
  customer_name: '', customer_type: 'Developer', contact_person: '', contact_phone: '',
  contact_email: '', gst_number: '', billing_address: '', site_location: '', project_name: '',
  architect_name: '',
  payment_terms: '50% Advance + 50% on Delivery', delivery_terms: 'Door Delivery — Bangalore',
  validity_days: 14, notes: '', gst_rate: 18, include_freight: false, freight_amount: 0,
};

function StatusBadge({ status }) {
  const cfg = QUOTE_STATUS[status] || { label: status, cls: 'ba' };
  return <span className={`bdg ${cfg.cls}`}>{cfg.label}</span>;
}

function MarginBar({ pct }) {
  const color = pct >= 20 ? 'var(--green)' : pct >= 14 ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--s4)', borderRadius: 99 }}>
        <div style={{ width: `${Math.min(pct * 2.5, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: '.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 36 }}>{fmtPct(pct)}</span>
    </div>
  );
}

// ── Quote List Row ─────────────────────────────────────────────────────────────
function QuoteRow({ q, onView, onEdit, onAskAI }) {
  const isExpiring = q.status === 'SENT' || q.status === 'NEGOTIATING';
  const daysLeft = q.valid_till ? Math.ceil((new Date(q.valid_till) - new Date()) / 86400000) : null;
  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => onView(q)}>
      <td>
        <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)' }}>{q.quote_number}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{q.created_at}</div>
      </td>
      <td>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{q.customer_name}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{q.customer_type} · {q.project_name || q.site_location}</div>
      </td>
      <td>
        <div style={{ fontSize: 12 }}>{q.line_items?.length || 0} items</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{[...new Set((q.line_items||[]).map(i=>i.category))].join(', ')}</div>
      </td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtL(q.total)}</td>
      <td style={{ minWidth: 100 }}>
        <MarginBar pct={q.avg_margin_pct || 0} />
      </td>
      <td>
        <StatusBadge status={q.status} />
        {isExpiring && daysLeft !== null && (
          <div style={{ fontSize: 10, color: daysLeft < 3 ? 'var(--red)' : 'var(--amber)', marginTop: 2 }}>
            {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
          </div>
        )}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="qb-view-btn" onClick={e => { e.stopPropagation(); onView(q); }}>View →</button>
          {onEdit && EDITABLE_STATUSES.includes(q.status) && (
            <button
              className="qb-view-btn"
              style={{ background: 'var(--g5)', color: 'var(--brand)', border: '1px solid var(--g4)', fontWeight: 700 }}
              onClick={e => { e.stopPropagation(); onEdit(q); }}
              title="Edit this quotation">
              ✎ Edit
            </button>
          )}
          {onAskAI && (
            <button className="qb-view-btn"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none' }}
              onClick={e => { e.stopPropagation(); onAskAI(q); }}
              title="Ask AI about this quote">
              🤖
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Line Item Row (in form) ────────────────────────────────────────────────────
function LineItemRow({ item, idx, products, onChange, onRemove, marginMode = 'line' }) {
  const [editMargin, setEditMargin] = useState(false);
  const [marginInput, setMarginInput] = useState('');

  const net      = item.unit_price * (1 - item.discount_pct / 100);
  const total    = net * item.quantity;
  const margin   = item.buy_price > 0 ? ((total - item.buy_price * item.quantity) / total * 100) : 0;
  const marginOk = margin >= 14;

  const handleProductPick = (pid) => {
    const p = products.find(x => String(x.product_id) === String(pid));
    if (p) onChange(idx, { ...item, product_id: pid, product_name: p.name, category: p.category, unit: p.unit, unit_price: p.sell_price, buy_price: p.buy_price });
    else onChange(idx, { ...item, product_id: pid });
  };

  const openMarginEdit = () => {
    if (item.buy_price <= 0 || item.unit_price <= 0) return;
    setMarginInput(String(Math.round(margin * 10) / 10));
    setEditMargin(true);
  };

  const applyMarginEdit = () => {
    const m = parseFloat(marginInput);
    if (!isNaN(m) && m >= 0 && m < 100 && item.unit_price > 0 && item.buy_price > 0) {
      const netTarget = item.buy_price / (1 - m / 100);
      const disc = Math.max(0, Math.min(50, (1 - netTarget / item.unit_price) * 100));
      onChange(idx, { ...item, discount_pct: Math.round(disc * 10) / 10 });
    }
    setEditMargin(false);
  };

  return (
    <tr className="qb-li-row">
      <td className="qb-li-cell" style={{ width: 32 }}>
        <span className="qb-li-num">{idx + 1}</span>
      </td>
      <td className="qb-li-cell" style={{ minWidth: 200 }}>
        <select className="qb-sel" value={item.product_id} onChange={e => handleProductPick(e.target.value)}>
          <option value="">— Select product —</option>
          {products.map(p => (
            <option key={p.product_id} value={p.product_id}>{p.name} ({p.unit})</option>
          ))}
        </select>
        {item.product_id && (
          <input className="qb-input" placeholder="Specifications / notes" value={item.specifications}
            onChange={e => onChange(idx, { ...item, specifications: e.target.value })}
            style={{ marginTop: 3, fontSize: 11 }} />
        )}
      </td>
      <td className="qb-li-cell">
        <input className="qb-input qb-num-input" type="number" min="0.01" step="0.01"
          value={item.quantity}
          onChange={e => onChange(idx, { ...item, quantity: parseFloat(e.target.value) || 1 })} />
      </td>
      <td className="qb-li-cell" style={{ fontSize: 12, color: 'var(--text2)' }}>{item.unit || '—'}</td>
      <td className="qb-li-cell">
        <input className="qb-input qb-num-input" type="number" min="0" step="1"
          value={item.unit_price} onChange={e => onChange(idx, { ...item, unit_price: parseFloat(e.target.value) || 0 })} />
      </td>
      <td className="qb-li-cell">
        <input className="qb-input qb-num-input" type="number" min="0" max="50" step="0.5"
          value={item.discount_pct} onChange={e => onChange(idx, { ...item, discount_pct: parseFloat(e.target.value) || 0 })} />
      </td>
      <td className="qb-li-cell" style={{ textAlign: 'right', fontWeight: 600 }}>{item.unit_price > 0 ? fmt(net) : '—'}</td>
      <td className="qb-li-cell" style={{ textAlign: 'right', fontWeight: 700 }}>{total > 0 ? fmtL(total) : '—'}</td>
      {/* Margin column — only shown in line-level mode */}
      {marginMode === 'line' && (
        <td className="qb-li-cell">
          {item.buy_price > 0 ? (
            editMargin ? (
              <div className="li-margin-edit">
                <input
                  className="qb-input qb-num-input" type="number" step="0.5"
                  value={marginInput}
                  onChange={e => setMarginInput(e.target.value)}
                  onBlur={applyMarginEdit}
                  onKeyDown={e => { if (e.key === 'Enter') applyMarginEdit(); if (e.key === 'Escape') setEditMargin(false); }}
                  autoFocus
                  style={{ width: 56 }}
                />
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>% ↵</span>
              </div>
            ) : (
              <div className="li-margin-display" onClick={openMarginEdit} title="Click to edit margin %">
                <MarginBar pct={margin} />
                <div className={`li-margin-pct${!marginOk ? ' critical' : ''}`}>
                  {fmtPct(margin)} {item.unit_price > 0 && item.buy_price > 0 ? '✎' : ''}
                </div>
                {!marginOk && <div className="li-margin-warn">⚠ Below 14% floor</div>}
              </div>
            )
          ) : null}
        </td>
      )}
      <td className="qb-li-cell">
        <button className="qb-rm-btn" onClick={() => onRemove(idx)} title="Remove line">×</button>
      </td>
    </tr>
  );
}

// ── Print helper — opens quotation content in a popup window to avoid printing
//    the full dashboard page. Falls back to body-class CSS isolation if popups blocked.
function _printQuotationBody() {
  const el = document.querySelector('.qb-print-body');
  if (!el) { window.print(); return; }

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    // Popup blocked — fall back to body-class CSS isolation
    document.body.classList.add('qb-printing');
    window.addEventListener('afterprint', () => document.body.classList.remove('qb-printing'), { once: true });
    window.print();
    return;
  }

  const headHtml = Array.from(document.head.children)
    .filter(n => n.tagName === 'LINK' || n.tagName === 'STYLE')
    .map(n => n.outerHTML)
    .join('\n');

  win.document.write(
    `<!DOCTYPE html><html><head>` +
    `<meta charset="utf-8">` +
    `<base href="${window.location.origin}/">` +
    `<title>Quotation</title>` +
    headHtml +
    `<style>` +
    `body{background:#fff!important;margin:0;padding:0}` +
    `@page{size:A4 portrait;margin:10mm 15mm}` +
    `.qb-print-body{box-shadow:none!important;border:none!important;margin:0!important;padding:16px!important}` +
    `</style>` +
    `</head><body>` +
    el.outerHTML +
    `</body></html>`
  );
  win.document.close();

  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
    win.close();
  };
  win.onload = () => setTimeout(go, 400);
  if (win.document.readyState === 'complete') setTimeout(go, 600);
}

// ── Quote Detail Modal ─────────────────────────────────────────────────────────
function QuoteDetail({ quote, onClose, onStatusUpdate, onGoChat, onEdit, onNavigate }) {
  const [status, setStatus] = useState(quote.status);
  const [updating, setUpdating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertedOrder, setConvertedOrder] = useState(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await fetch(`/api/quotes/${quote.quote_id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setStatus(newStatus);
      onStatusUpdate?.(quote.quote_id, newStatus);
    } catch (e) { setStatus(newStatus); }
    finally { setUpdating(false); }
  };

  const handleConvertToOrder = async () => {
    setConverting(true);
    try {
      const res  = await fetch(`/api/quotes/${quote.quote_id}/convert-to-order`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setConvertedOrder(data);
        setStatus('WON');
        onStatusUpdate?.(quote.quote_id, 'WON');
      }
    } catch (e) { console.error(e); }
    finally { setConverting(false); }
  };

  const handlePrint = _printQuotationBody;

  const daysLeft = quote.valid_till
    ? Math.ceil((new Date(quote.valid_till) - new Date()) / 86400000) : null;

  const { ref: detailModalRef, style: detailDragStyle } = useDraggable();

  if (showEmailDialog) {
    return (
      <EmailQuoteModal
        quoteId={quote.quote_id}
        quoteNumber={quote.quote_number}
        contactEmail={quote.contact_email}
        contactPerson={quote.contact_person}
        customerName={quote.customer_name}
        onClose={() => setShowEmailDialog(false)}
      />
    );
  }

  return (
    <div className="qb-modal-overlay">
      <div className="qb-modal" ref={detailModalRef} style={detailDragStyle}>
        {/* Header */}
        <div className="qb-modal-header" style={{ background: 'linear-gradient(135deg, #0f2744 0%, #1a3a5c 100%)', borderTop: 'none', borderRadius: '12px 12px 0 0' }}>
          <div>
            <div className="qb-modal-title" style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{quote.quote_number}</div>
            <div className="qb-modal-sub" style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 2 }}>{quote.project_name} · {quote.customer_name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={status} />
            <button className="qb-print-btn" onClick={handlePrint} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.25)' }}>🖨 Print / PDF</button>
            <button className="qb-print-btn" onClick={() => setShowEmailDialog(true)} style={{ background: 'rgba(16,185,129,.25)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,.4)' }}>📧 Send Email</button>
            <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
          </div>
        </div>

        {/* Printable quote body */}
        <div className="qb-print-body" id="qb-print">
          {/* Quote header */}
          <div className="qbp-header">
            <div className="qbp-logo">
              <div className="qbp-logo-mark">IQ</div>
              <div>
                <div className="qbp-company">InvenIQ — Building Materials</div>
                <div className="qbp-address">Bangalore · GST: 29AAACI1234Z1Z5 · +91-98765-43210</div>
              </div>
            </div>
            <div className="qbp-meta">
              <div className="qbp-title">QUOTATION</div>
              <table className="qbp-meta-table">
                <tbody>
                  <tr><td>Quote No.</td><td><strong>{quote.quote_number}</strong></td></tr>
                  <tr><td>Date</td><td>{quote.created_at}</td></tr>
                  <tr><td>Valid Till</td><td>
                    <span style={{ color: daysLeft < 3 ? 'var(--red)' : 'inherit' }}>
                      {quote.valid_till} {daysLeft !== null && daysLeft >= 0 ? `(${daysLeft}d left)` : daysLeft < 0 ? '(Expired)' : ''}
                    </span>
                  </td></tr>
                  <tr><td>Status</td><td><StatusBadge status={status} /></td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bill to / Ship to */}
          <div className="qbp-parties">
            <div className="qbp-party">
              <div className="qbp-party-label">Bill To</div>
              <div className="qbp-party-name">{quote.customer_name}</div>
              {quote.contact_person && <div>{quote.contact_person}</div>}
              {quote.contact_phone  && <div>📞 {quote.contact_phone}</div>}
              {quote.contact_email  && <div>✉ {quote.contact_email}</div>}
              {quote.gst_number     && <div>GST: {quote.gst_number}</div>}
              {quote.billing_address && <div style={{ marginTop: 4, color: 'var(--text2)' }}>{quote.billing_address}</div>}
            </div>
            <div className="qbp-party">
              <div className="qbp-party-label">Project / Site</div>
              {quote.project_name && <div className="qbp-party-name">{quote.project_name}</div>}
              {quote.site_location && <div>{quote.site_location}</div>}
              {quote.architect_name && <div>Architect: {quote.architect_name}</div>}
            </div>
          </div>

          {/* Line items table */}
          <table className="qbp-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product / Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Unit Price</th>
                <th>Disc %</th>
                <th>Net Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(quote.line_items || []).map((item, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{item.product_name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{item.category}</div>
                    {item.specifications && <div style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', marginTop: 2 }}>{item.specifications}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                  <td>{item.unit}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(item.unit_price)}</td>
                  <td style={{ textAlign: 'right' }}>{item.discount_pct > 0 ? `${item.discount_pct}%` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(item.net_price || item.unit_price)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtL(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="qbp-totals">
            <table className="qbp-totals-table">
              <tbody>
                <tr><td>Subtotal</td><td>{fmtL(quote.subtotal)}</td></tr>
                {(quote.freight_amount > 0) && <tr><td>Freight</td><td>{fmt(quote.freight_amount)}</td></tr>}
                <tr><td>GST ({quote.gst_rate}%)</td><td>{fmtL(quote.gst_amount)}</td></tr>
                <tr className="qbp-grand"><td>TOTAL</td><td>{fmtL(quote.total)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Terms */}
          <div className="qbp-terms">
            <div className="qbp-terms-col">
              <div className="qbp-terms-head">Terms & Conditions</div>
              <ul className="qbp-terms-list">
                <li><strong>Payment:</strong> {quote.payment_terms}</li>
                <li><strong>Delivery:</strong> {quote.delivery_terms}</li>
                <li><strong>Validity:</strong> {quote.validity_days} days from date of quotation</li>
                <li><strong>GST:</strong> {quote.gst_rate}% applicable as above</li>
                <li>Prices are subject to change based on manufacturer price revisions.</li>
                <li>Order confirmation with PO / advance payment required to block production slot.</li>
              </ul>
            </div>
            {quote.notes && (
              <div className="qbp-terms-col">
                <div className="qbp-terms-head">Notes</div>
                <div style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>{quote.notes}</div>
              </div>
            )}
          </div>

          {/* Signature */}
          <div className="qbp-signature">
            <div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 40, minWidth: 180 }}>
                For InvenIQ — Authorised Signatory
              </div>
            </div>
            <div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 40, minWidth: 180 }}>
                {quote.customer_name} — Acceptance Signature
              </div>
            </div>
          </div>
        </div>

        {/* Conversion success banner */}
        {convertedOrder && (
          <div className="no-print" style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)', borderRadius: 10, padding: '12px 18px', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 22 }}>✅</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#d1fae5', fontWeight: 800, fontSize: 14 }}>Sales Order Created: {convertedOrder.order_number}</div>
              <div style={{ color: '#6ee7b7', fontSize: 12, marginTop: 2 }}>
                {convertedOrder.customer_name} · {convertedOrder.converted_at} · Value: {fmtL(convertedOrder.total_value)}
              </div>
            </div>
            {onNavigate && (
              <button
                style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                onClick={() => { onClose(); onNavigate('louvers'); }}>
                View Sales Orders →
              </button>
            )}
          </div>
        )}

        {/* Action bar (no-print) */}
        <div className="qb-modal-actions no-print">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Edit button — only for editable statuses */}
            {onEdit && EDITABLE_STATUSES.includes(status) && (
              <button
                className="qb-action-btn"
                style={{ background: 'var(--g5)', color: 'var(--brand)', border: '1px solid var(--g4)', fontWeight: 700 }}
                onClick={() => { onClose(); onEdit(quote); }}>
                ✎ Edit Quotation
              </button>
            )}
            {/* Convert to Sales Order — only for WON quotes not yet converted */}
            {status === 'WON' && !convertedOrder && (
              <button
                className="qb-action-btn"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', fontWeight: 700 }}
                onClick={handleConvertToOrder}
                disabled={converting}>
                {converting ? '⏳ Converting…' : '🔄 Convert to Sales Order'}
              </button>
            )}
            {Object.keys(QUOTE_STATUS).filter(s => s !== status).map(s => (
              <button key={s} className="qb-action-btn"
                onClick={() => updateStatus(s)} disabled={updating}>
                → Mark {QUOTE_STATUS[s].label}
              </button>
            ))}
            {onGoChat && (
              <button className="qb-action-btn" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none' }}
                onClick={() => {
                  onClose();
                  onGoChat(`Analyse quotation ${quote.quote_number} for ${quote.customer_name} — project: ${quote.project_name || 'N/A'}, value: ${fmtL(quote.total)}, margin: ${quote.avg_margin_pct}%, status: ${status}. What is my win probability, negotiation strategy, and next steps?`);
                }}>
                🤖 Ask AI Strategy
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="qb-action-btn"
              style={{ background: 'linear-gradient(135deg,#0f4c81,#1a6ba0)', color: '#fff', border: 'none', fontWeight: 700 }}
              onClick={() => setShowEmailDialog(true)}>
              📧 Send Email
            </button>
            <button className="qb-print-btn" onClick={handlePrint}>🖨 Print / PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Smart-paste helpers ───────────────────────────────────────────────────────
const _EMAIL_RE  = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/;
// Indian 10-digit (6–9 start), optionally prefixed with +91 / 0
const _PHONE_RE  = /(?:\+?91[-.\s]?|0)?(?:[6-9]\d{9})|\+?\d{10,13}/;

function _extractContactFromText(raw) {
  const emailMatch = raw.match(_EMAIL_RE);
  const phoneMatch = raw.match(_PHONE_RE);
  if (!emailMatch && !phoneMatch) return null;
  const out = {};
  if (emailMatch) out.email = emailMatch[0].trim();
  if (phoneMatch) out.phone = phoneMatch[0].replace(/[\s\-.()+]/g, '').replace(/^0+91/, '91');
  // Derive clean customer name: strip found contact tokens, take first non-empty line
  let namePart = raw;
  if (emailMatch) namePart = namePart.replace(emailMatch[0], '');
  if (phoneMatch) namePart = namePart.replace(phoneMatch[0], '');
  const cleanName = namePart
    .split(/\r?\n/)
    .map(l => l.replace(/[|,;:\-_]+/g, ' ').trim())
    .find(l => l.length > 1) || '';
  out.cleanName = cleanName;
  return out;
}

// ── Customer Picker Input ──────────────────────────────────────────────────────
function CustomerPickerInput({ value, onChange, onSelectCustomer, onSmartPaste }) {
  const [customers, setCustomers]   = useState([]);
  const [open, setOpen]             = useState(false);
  const [search, setSearch]         = useState(value || '');
  const wrapRef                     = useRef(null);

  useEffect(() => {
    fetch('/api/customers')
      .then(r => r.json())
      .then(d => setCustomers(d.customers || []))
      .catch(() => {});
  }, []);

  useEffect(() => { setSearch(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = search.trim()
    ? customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : customers;

  const handleInput = (e) => {
    const v = e.target.value;
    setSearch(v);
    onChange(v);
    setOpen(true);
  };

  const handleSelect = (c) => {
    setSearch(c.name);
    onChange(c.name);
    onSelectCustomer(c.name, c.segment || 'Developer', c);
    setOpen(false);
  };

  const handleNewCustomer = () => {
    setSearch('');
    onChange('');
    setOpen(false);
  };

  // Smart paste: detect email / phone in pasted text, auto-fill contact fields
  const handlePaste = (e) => {
    const raw = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
    const extracted = _extractContactFromText(raw);
    if (!extracted) return;           // plain name paste — no interception needed
    e.preventDefault();
    if (onSmartPaste) onSmartPaste(extracted);
    const name = extracted.cleanName || search;
    setSearch(name);
    onChange(name);
    if (name) setOpen(true);
  };

  const showCreate = search.trim() && !customers.some(c => c.name.toLowerCase() === search.toLowerCase());

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="qb-input"
        value={search}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        onPaste={handlePaste}
        placeholder="Search customer or paste contact text to auto-fill"
        autoComplete="off"
      />
      {open && (
        <div className="qb-cust-dropdown">
          {showCreate && (
            <div className="qb-cust-item qb-cust-new-top" onMouseDown={() => { setOpen(false); }}>
              <span className="qb-cust-create-icon">✎</span>
              <span>Create: <strong>"{search}"</strong></span>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="qb-cust-section-hd">Existing Customers</div>
          )}
          {filtered.map(c => (
            <div key={c.name} className="qb-cust-item" onMouseDown={() => handleSelect(c)}>
              <div className="qb-cust-name">{c.name}</div>
              <span className="qb-cust-seg">{c.segment}</span>
            </div>
          ))}
          <div className="qb-cust-item qb-cust-new-bottom" onMouseDown={handleNewCustomer}>
            <span className="qb-cust-plus">+</span> New Customer (clear &amp; type)
          </div>
        </div>
      )}
    </div>
  );
}

// ── Print Preview Modal ────────────────────────────────────────────────────────
function PrintPreviewModal({ f, lines, subtotal, gstAmount, total, onClose, onSave, saving }) {
  const { ref: previewRef, style: previewDragStyle } = useDraggable();
  const validLines = lines.filter(l => l.product_name || l.product_id);
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const validTill = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (Number(f.validity_days) || 14));
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  })();

  return (
    <div className="qb-modal-overlay">
      <div className="qb-modal" ref={previewRef} style={{ maxWidth: 860, ...previewDragStyle }}>
        <div className="qb-modal-header" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f4c81 100%)', borderTop: 'none', borderRadius: '12px 12px 0 0' }}>
          <div>
            <div className="qb-modal-title" style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>🖨 Print Preview</div>
            <div className="qb-modal-sub" style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 2 }}>
              Review before saving · Drag header to move
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="qb-print-btn" onClick={_printQuotationBody}
              style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.25)' }}>
              🖨 Print / PDF
            </button>
            <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 140px)' }}>
          <div className="qb-print-body" style={{ margin: 0, boxShadow: 'none', border: 'none' }}>
            <div className="qbp-header">
              <div className="qbp-logo">
                <div className="qbp-logo-mark">IQ</div>
                <div>
                  <div className="qbp-company">InvenIQ — Building Materials</div>
                  <div className="qbp-address">Bangalore · GST: 29AAACI1234Z1Z5 · +91-98765-43210</div>
                </div>
              </div>
              <div className="qbp-meta">
                <div className="qbp-title">QUOTATION</div>
                <table className="qbp-meta-table">
                  <tbody>
                    <tr><td>Date</td><td><strong>{today}</strong></td></tr>
                    <tr><td>Valid Till</td><td>{validTill}</td></tr>
                    <tr><td>Customer</td><td><strong>{f.customer_name || '—'}</strong></td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="qbp-parties">
              <div className="qbp-party">
                <div className="qbp-party-label">Bill To</div>
                <div className="qbp-party-name">{f.customer_name || '—'}</div>
                {f.contact_person  && <div>{f.contact_person}</div>}
                {f.contact_phone   && <div>📞 {f.contact_phone}</div>}
                {f.contact_email   && <div>✉ {f.contact_email}</div>}
                {f.gst_number      && <div>GST: {f.gst_number}</div>}
                {f.billing_address && <div style={{ marginTop: 4, color: 'var(--text2)' }}>{f.billing_address}</div>}
              </div>
              <div className="qbp-party">
                <div className="qbp-party-label">Project / Site</div>
                {f.project_name  && <div className="qbp-party-name">{f.project_name}</div>}
                {f.site_location && <div>{f.site_location}</div>}
                {f.architect_name && <div>Architect: {f.architect_name}</div>}
              </div>
            </div>

            <table className="qbp-items-table">
              <thead>
                <tr>
                  <th>#</th><th>Product / Description</th><th>Qty</th><th>Unit</th>
                  <th>Unit Price</th><th>Disc %</th><th>Net Price</th><th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {validLines.map((item, i) => {
                  const net = item.unit_price * (1 - item.discount_pct / 100);
                  const lineTotal = net * item.quantity;
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{item.product_name || '—'}</strong>
                        {item.category && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{item.category}</div>}
                        {item.specifications && <div style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', marginTop: 2 }}>{item.specifications}</div>}
                      </td>
                      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                      <td>{item.unit || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{item.unit_price > 0 ? fmt(item.unit_price) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{item.discount_pct > 0 ? `${item.discount_pct}%` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{item.unit_price > 0 ? fmt(net) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{lineTotal > 0 ? fmtL(lineTotal) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="qbp-totals">
              <table className="qbp-totals-table">
                <tbody>
                  <tr><td>Subtotal</td><td>{fmtL(subtotal)}</td></tr>
                  {f.include_freight && Number(f.freight_amount) > 0 && (
                    <tr><td>Freight</td><td>{fmt(f.freight_amount)}</td></tr>
                  )}
                  <tr><td>GST ({f.gst_rate}%)</td><td>{fmtL(gstAmount)}</td></tr>
                  <tr className="qbp-grand"><td>TOTAL</td><td>{fmtL(total)}</td></tr>
                </tbody>
              </table>
            </div>

            {(f.payment_terms || f.delivery_terms || f.notes) && (
              <div className="qbp-terms">
                {f.payment_terms && <div className="qbp-term"><strong>Payment:</strong> {f.payment_terms}</div>}
                {f.delivery_terms && <div className="qbp-term"><strong>Delivery:</strong> {f.delivery_terms}</div>}
                {f.notes && <div className="qbp-term"><strong>Notes:</strong> {f.notes}</div>}
              </div>
            )}
          </div>
        </div>

        <div className="qb-form-footer" style={{ background: 'var(--s2)', borderTop: '1px solid var(--border)', padding: '14px 22px' }}>
          <button className="qb-cancel-btn" onClick={onClose}>← Continue Editing</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="qb-print-btn" onClick={_printQuotationBody}>🖨 Print / PDF</button>
            <button className="qb-draft-btn" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : '📋 Save as Draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Email Quote Modal ──────────────────────────────────────────────────────────
function EmailQuoteModal({ quoteId, quoteNumber, contactEmail, contactPerson, customerName, onClose }) {
  const { ref: emailRef, style: emailDragStyle } = useDraggable();
  const [recipient, setRecipient]   = useState(contactEmail || '');
  const [recipName, setRecipName]   = useState(contactPerson || customerName || '');
  const [subject, setSubject]       = useState(`Quotation ${quoteNumber} from InvenIQ — Building Materials`);
  const [message, setMessage]       = useState('');
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(false);
  const [sendError, setSendError]   = useState('');
  const [simulated, setSimulated]   = useState(false);

  const handleSend = async () => {
    if (!recipient.trim()) { setSendError('Recipient email is required.'); return; }
    setSending(true); setSendError('');
    try {
      const res = await fetch(`/api/quotes/${quoteId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_email: recipient.trim(),
          recipient_name:  recipName.trim(),
          subject:         subject.trim(),
          message:         message.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `Error ${res.status}`);
      setSimulated(!!d.simulated);
      setSent(true);
    } catch (e) {
      setSendError(e.message || 'Send failed. Check SMTP settings in backend/.env.');
    } finally {
      setSending(false);
    }
  };

  if (sent) return (
    <div className="qb-modal-overlay">
      <div className="pc-add-modal" ref={emailRef} style={{ maxWidth: 460, textAlign: 'center', padding: 40, ...emailDragStyle }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{simulated ? '📧' : '✅'}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: simulated ? 'var(--amber)' : 'var(--green)', marginBottom: 8 }}>
          {simulated ? 'Email Simulated' : 'Email Sent!'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
          {simulated
            ? 'SMTP is not configured — no email was sent. Add SMTP_USER / SMTP_PASSWORD to backend/.env to send real emails.'
            : `Quotation ${quoteNumber} sent to ${recipient}.`}
        </div>
        <button className="btn-primary" onClick={onClose} style={{ marginTop: 8 }}>Done</button>
      </div>
    </div>
  );

  return (
    <div className="qb-modal-overlay">
      <div className="pc-add-modal" ref={emailRef} style={{ maxWidth: 520, ...emailDragStyle }}>
        <div style={{ background: 'linear-gradient(135deg, #0f4c81 0%, #1a6ba0 100%)', borderRadius: '12px 12px 0 0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>📧 Send Quotation by Email</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 2 }}>
              {quoteNumber} · Drag header to move
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.7px', display: 'block', marginBottom: 5 }}>
                Recipient Email *
              </label>
              <input className="qb-input" type="email" placeholder="customer@example.com"
                value={recipient} onChange={e => setRecipient(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.7px', display: 'block', marginBottom: 5 }}>
                Recipient Name
              </label>
              <input className="qb-input" placeholder="Contact person name"
                value={recipName} onChange={e => setRecipName(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.7px', display: 'block', marginBottom: 5 }}>
              Subject
            </label>
            <input className="qb-input" placeholder="Email subject"
              value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.7px', display: 'block', marginBottom: 5 }}>
              Personal Message <span style={{ fontWeight: 400, color: 'var(--text3)', textTransform: 'none' }}>(optional)</span>
            </label>
            <textarea className="qb-input" rows={3} placeholder="Add a personal note to accompany the quotation…"
              value={message} onChange={e => setMessage(e.target.value)}
              style={{ resize: 'vertical', minHeight: 72 }} />
          </div>
          {sendError && (
            <div style={{ background: 'var(--r5)', border: '1px solid var(--r4)', borderRadius: 8, padding: '10px 14px', color: 'var(--r2)', fontSize: 13, marginBottom: 14 }}>
              ⚠ {sendError}
            </div>
          )}
          <div style={{ background: 'var(--a5)', border: '1px solid var(--a4)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--amber)', marginBottom: 16 }}>
            💡 Configure SMTP in <code>backend/.env</code> (SMTP_USER, SMTP_PASSWORD) to send real emails.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="qb-cancel-btn" onClick={onClose}>Skip</button>
            <button className="qb-save-btn" onClick={handleSend} disabled={sending || !recipient.trim()}>
              {sending ? '⏳ Sending…' : '📤 Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New Quote Form ─────────────────────────────────────────────────────────────
function NewQuoteForm({ products, onClose, onCreated, initialData, initialLines, editQuote }) {
  // Initialise form & lines from editQuote (edit mode) or blank/prefilled (create mode)
  const _initForm = () => {
    if (editQuote) {
      return {
        customer_name:   editQuote.customer_name   || '',
        customer_type:   editQuote.customer_type   || 'Developer',
        contact_person:  editQuote.contact_person  || '',
        contact_phone:   editQuote.contact_phone   || '',
        contact_email:   editQuote.contact_email   || '',
        gst_number:      editQuote.gst_number      || '',
        billing_address: editQuote.billing_address || '',
        site_location:   editQuote.site_location   || '',
        project_name:    editQuote.project_name    || '',
        architect_name:  editQuote.architect_name  || '',
        payment_terms:   editQuote.payment_terms   || '50% Advance + 50% on Delivery',
        delivery_terms:  editQuote.delivery_terms  || 'Door Delivery — Bangalore',
        validity_days:   editQuote.validity_days   || 14,
        notes:           editQuote.notes           || '',
        gst_rate:        editQuote.gst_rate        || 18,
        include_freight: editQuote.include_freight || false,
        freight_amount:  editQuote.freight_amount  || 0,
      };
    }
    return { ...BLANK_FORM, ...(initialData || {}) };
  };

  const _initLines = () => {
    if (editQuote?.line_items?.length) {
      return editQuote.line_items.map(li => ({
        product_id:     String(li.product_id || ''),
        product_name:   li.product_name   || '',
        category:       li.category       || '',
        quantity:       li.quantity       || 1,
        unit:           li.unit           || 'sheet',
        unit_price:     li.unit_price     || 0,
        discount_pct:   li.discount_pct   || 0,
        buy_price:      li.buy_price      || 0,
        specifications: li.specifications || '',
      }));
    }
    return initialLines?.length ? initialLines : [{ ...BLANK_LINE }];
  };

  const [f, setF]           = useState(_initForm);
  const [lines, setLines]   = useState(_initLines);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [created, setCreated] = useState(null);
  const [aiRec, setAiRec]   = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [draftSaved, setDraftSaved]     = useState(false);
  const [draftLabel, setDraftLabel]     = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysis, setAnalysis]         = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [savedQuoteId, setSavedQuoteId]         = useState(null);
  const [showEmailDialog, setShowEmailDialog]   = useState(false);
  const [showImageSearch, setShowImageSearch]   = useState(false);

  // Feature 2: Margin mode toggle
  const [marginMode, setMarginMode]           = useState('line');
  const [targetMarginPct, setTargetMarginPct] = useState(20);

  const up = (k, v) => setF(p => ({ ...p, [k]: v }));

  const updateLine = (idx, newItem) => setLines(prev => prev.map((l, i) => i === idx ? newItem : l));
  const addLine    = () => setLines(prev => [...prev, { ...BLANK_LINE }]);
  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx));
  const addLineFromProduct = (product) => setLines(prev => [...prev, { ...BLANK_LINE, ...product }]);

  // Auto-apply target margin to all lines whenever targetMarginPct changes (in bottom mode)
  useEffect(() => {
    if (marginMode !== 'bottom') return;
    const m = Number(targetMarginPct);
    if (isNaN(m) || m <= 0 || m >= 100) return;
    setLines(prev => prev.map(l => {
      if (l.buy_price <= 0 || l.unit_price <= 0) return l;
      const netTarget = l.buy_price / (1 - m / 100);
      const disc = Math.max(0, Math.min(50, (1 - netTarget / l.unit_price) * 100));
      return { ...l, discount_pct: Math.round(disc * 10) / 10 };
    }));
  }, [targetMarginPct, marginMode]);

  const subtotal   = lines.reduce((s, l) => {
    const net = l.unit_price * (1 - l.discount_pct / 100);
    return s + net * l.quantity;
  }, 0) + (f.include_freight ? Number(f.freight_amount) : 0);
  const gstAmount  = subtotal * f.gst_rate / 100;
  const total      = subtotal + gstAmount;
  const avgMargin  = lines.filter(l => l.buy_price > 0).length > 0
    ? lines.filter(l => l.buy_price > 0).reduce((s, l) => {
        const net = l.unit_price * (1 - l.discount_pct / 100);
        const t   = net * l.quantity;
        const c   = l.buy_price * l.quantity;
        return s + ((t - c) / t * 100);
      }, 0) / lines.filter(l => l.buy_price > 0).length : 0;

  // Average discount across lines that had buy_price (used in bottom-mode summary)
  const avgAppliedDisc = (() => {
    const linesWithData = lines.filter(l => l.buy_price > 0 && l.unit_price > 0 && l.discount_pct > 0);
    if (!linesWithData.length) return null;
    return linesWithData.reduce((s, l) => s + l.discount_pct, 0) / linesWithData.length;
  })();

  const fetchAIRec = async () => {
    if (!lines[0]?.product_id || !f.customer_type) return;
    setAiLoading(true);
    try {
      const r = await fetch(`/api/quotes/ai-price?product_id=${lines[0].product_id}&quantity=${lines[0].quantity}&customer_type=${encodeURIComponent(f.customer_type)}`);
      const d = await r.json();
      setAiRec(d);
    } catch { setAiRec(null); }
    finally { setAiLoading(false); }
  };

  const _buildPayload = () => ({
    ...f,
    validity_days:   Number(f.validity_days)  || 14,
    gst_rate:        Number(f.gst_rate)        || 18,
    freight_amount:  Number(f.freight_amount)  || 0,
    line_items: lines
      .filter(l => l.product_id && Number(l.quantity) > 0)
      .map(l => ({
        product_id:     String(l.product_id),
        product_name:   String(l.product_name || ''),
        category:       String(l.category    || ''),
        quantity:       Number(l.quantity),
        unit:           String(l.unit        || 'sheet'),
        unit_price:     Number(l.unit_price),
        discount_pct:   Number(l.discount_pct  || 0),
        buy_price:      Number(l.buy_price     || 0),
        specifications: String(l.specifications || ''),
      })),
  });

  const _postQuote = async () => {
    const payload = _buildPayload();
    const r = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      let detail = `Server error ${r.status}`;
      try {
        const err = await r.json();
        if (err.detail) {
          detail = Array.isArray(err.detail)
            ? err.detail.map(d => `${d.loc?.slice(-1)[0] || 'field'}: ${d.msg}`).join(' · ')
            : String(err.detail);
        }
      } catch { /* keep default detail */ }
      throw new Error(detail);
    }
    return r.json();
  };

  const _putQuote = async (quoteId) => {
    const payload = _buildPayload();
    const r = await fetch(`/api/quotes/${quoteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      let detail = `Server error ${r.status}`;
      try {
        const err = await r.json();
        if (err.detail) {
          detail = Array.isArray(err.detail)
            ? err.detail.map(d => `${d.loc?.slice(-1)[0] || 'field'}: ${d.msg}`).join(' · ')
            : String(err.detail);
        }
      } catch { /* keep default detail */ }
      throw new Error(detail);
    }
    return r.json();
  };

  const handleSave = async () => {
    if (!f.customer_name) { setSaveError('Customer name is required.'); return; }
    const validLines = lines.filter(l => l.product_id && Number(l.quantity) > 0);
    if (validLines.length === 0) { setSaveError('Add at least one line item with a product and quantity > 0.'); return; }
    setSaving(true); setSaveError('');
    try {
      const d = editQuote ? await _putQuote(editQuote.quote_id) : await _postQuote();
      setCreated(d.quote || d);
      onCreated?.();
    } catch (e) { setSaveError(e.message || 'Save failed — check backend connection.'); }
    finally { setSaving(false); }
  };

  const handleSaveDraft = async () => {
    if (!f.customer_name) { setSaveError('Customer name is required.'); return; }
    setSaving(true); setSaveError('');
    try {
      const d = editQuote ? await _putQuote(editQuote.quote_id) : await _postQuote();
      const qnum = d.quote?.quote_number || d.quote_number || editQuote?.quote_number || 'Draft';
      const qid  = d.quote?.quote_id     || d.quote_id     || editQuote?.quote_id     || null;
      setDraftSaved(true);
      setDraftLabel(qnum);
      setSavedQuoteId(qid);
      setShowPrintPreview(false);
      setShowEmailDialog(true);
      onCreated?.();
    } catch (e) { setSaveError(e.message || 'Save failed — check backend connection.'); }
    finally { setSaving(false); }
  };

  const fetchAnalysis = async () => {
    const validLines = lines.filter(l => l.product_id && l.unit_price > 0);
    if (validLines.length === 0) return;
    setAnalysisLoading(true);
    try {
      const payload = {
        customer_name: f.customer_name,
        customer_type: f.customer_type,
        project_name:  f.project_name,
        payment_terms: f.payment_terms,
        subtotal,
        gst_rate:       f.gst_rate,
        include_freight: f.include_freight,
        freight_amount: Number(f.freight_amount),
        notes:          f.notes,
        line_items: validLines.map(l => ({
          product_name: l.product_name,
          category:     l.category,
          quantity:     l.quantity,
          unit:         l.unit,
          unit_price:   l.unit_price,
          discount_pct: l.discount_pct,
          buy_price:    l.buy_price,
        })),
      };
      const r = await fetch('/api/quotes/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      setAnalysis(d);
      setShowAnalysis(true);
    } catch (e) { console.error(e); }
    finally { setAnalysisLoading(false); }
  };

  // ── All useDraggable hooks declared here unconditionally (Rules of Hooks) ────
  const { ref: successRef,  style: successDragStyle  } = useDraggable();
  const { ref: formModalRef, style: formDragStyle }    = useDraggable();

  // ── Success screen ─────────────────────────────────────────────────────────
  if (created) return (
    <div className="qb-modal-overlay">
      <div className="qb-modal" ref={successRef} style={{ maxWidth: 520, ...successDragStyle }}>
        <div className="qb-modal-header" style={{ background: 'linear-gradient(135deg, #14532d 0%, #15803d 100%)', borderTop: 'none', borderRadius: '12px 12px 0 0' }}>
          <div>
            <div className="qb-modal-title" style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>
              ✓ Quotation {editQuote ? 'Updated' : 'Created'}
            </div>
            <div className="qb-modal-sub" style={{ color: 'rgba(255,255,255,.8)', fontSize: 12, marginTop: 2 }}>
              {created.quote_number || created.quote?.quote_number}
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
        </div>
        <div style={{ padding: '28px 28px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
            <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>Total Value</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--brand)', fontFamily: 'var(--mono)' }}>{fmtL(created.total || created.grand_total)}</div>
            </div>
            <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>Avg Margin</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: (created.avg_margin_pct || 0) >= 14 ? 'var(--green)' : 'var(--r2)', fontFamily: 'var(--mono)' }}>
                {fmtPct(created.avg_margin_pct || 0)}
              </div>
            </div>
            <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 6 }}>Valid Till</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{created.valid_till || '—'}</div>
            </div>
          </div>
          <div style={{ background: 'var(--g5)', border: '1px solid var(--g4)', borderRadius: 8, padding: '12px 16px', marginBottom: 22, fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: 'var(--brand3)' }}>{f.customer_name}</span>
            {f.project_name && <span style={{ color: 'var(--text2)', marginLeft: 8 }}>· {f.project_name}</span>}
            {f.site_location && <span style={{ color: 'var(--text3)', marginLeft: 8, fontSize: 12 }}>📍 {f.site_location}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="qb-save-btn" style={{ flex: 1 }} onClick={onClose}>
              ✓ View All Quotations
            </button>
            <button className="qb-cancel-btn" style={{ flex: 1 }}
              onClick={() => { setCreated(null); setF({ ...BLANK_FORM }); setLines([{ ...BLANK_LINE }]); setDraftSaved(false); setAiRec(null); setShowAnalysis(false); setAnalysis(null); setSaveError(''); }}>
              + Create Another
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Main form ─────────────────────────────────────────────────────────────────
  const sectionStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '16px 18px',
    marginBottom: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,.04)',
  };
  const secTitleStyle = {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--brand)',
    textTransform: 'uppercase',
    letterSpacing: '.8px',
    marginBottom: 13,
    paddingBottom: 9,
    borderBottom: '2px solid var(--g3)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  // Print preview + email dialogs (rendered on top of the main form)
  if (showPrintPreview) {
    const sub = lines.reduce((s, l) => s + l.unit_price * (1 - l.discount_pct / 100) * l.quantity, 0)
      + (f.include_freight ? Number(f.freight_amount) : 0);
    const gst = sub * f.gst_rate / 100;
    return (
      <PrintPreviewModal
        f={f} lines={lines} subtotal={sub} gstAmount={gst} total={sub + gst}
        onClose={() => setShowPrintPreview(false)}
        onSave={handleSaveDraft}
        saving={saving}
      />
    );
  }

  if (showEmailDialog) {
    return (
      <EmailQuoteModal
        quoteId={savedQuoteId}
        quoteNumber={draftLabel}
        contactEmail={f.contact_email}
        contactPerson={f.contact_person}
        customerName={f.customer_name}
        onClose={() => { setShowEmailDialog(false); onClose(); }}
      />
    );
  }

  return (
    <div className="qb-modal-overlay">
      <div className="qb-modal qb-form-modal" ref={formModalRef} style={formDragStyle}>

        {/* ── Professional Modal Header ── */}
        <div className="qb-modal-header" style={{
          background: editQuote
            ? 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)'
            : 'linear-gradient(135deg, #0f2744 0%, #15803d 100%)',
          borderTop: 'none',
          borderRadius: '12px 12px 0 0',
          padding: '18px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-1px', flexShrink: 0 }}>IQ</div>
            <div>
              <div className="qb-modal-title" style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>
                {editQuote ? `✎ Edit Quotation — ${editQuote.quote_number}` : '+ New Quotation'}
              </div>
              {draftSaved && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.85)', marginTop: 2 }}>✓ Draft saved — {draftLabel}</div>
              )}
              {!draftSaved && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.65)', marginTop: 2 }}>
                  {editQuote ? `Editing ${editQuote.customer_name} · ${editQuote.status}` : 'InvenIQ — Building Materials · Professional Quotation'}
                </div>
              )}
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8, fontSize: 22 }}>×</button>
        </div>

        <div className="qb-form-body">
          {/* ── Left panel — Customer & Terms ── */}
          <div className="qb-form-left">

            {/* Customer Details card */}
            <div style={sectionStyle}>
              <div style={secTitleStyle}>👤 Customer Details</div>
              <label className="qb-label">Customer Name *</label>
              <CustomerPickerInput
                value={f.customer_name}
                onChange={v => up('customer_name', v)}
                onSelectCustomer={(name, type, cust) => {
                  up('customer_name', name);
                  if (CUSTOMER_TYPES.includes(type)) up('customer_type', type);
                  if (cust) {
                    if (cust.email)          up('contact_email',  cust.email);
                    if (cust.phone)          up('contact_phone',  cust.phone);
                    if (cust.contact_person) up('contact_person', cust.contact_person);
                  }
                }}
                onSmartPaste={({ email, phone, cleanName }) => {
                  if (email)     up('contact_email', email);
                  if (phone)     up('contact_phone', phone);
                  if (cleanName) up('customer_name', cleanName);
                }}
              />
              <label className="qb-label">Customer Type</label>
              <select className="qb-sel" value={f.customer_type} onChange={e => up('customer_type', e.target.value)}>
                {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <label className="qb-label">Contact Person</label>
              <input className="qb-input" value={f.contact_person} onChange={e => up('contact_person', e.target.value)} placeholder="Full name" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="qb-label">Phone</label>
                  <input className="qb-input" value={f.contact_phone} onChange={e => up('contact_phone', e.target.value)} placeholder="+91..." />
                </div>
                <div>
                  <label className="qb-label">Email</label>
                  <input className="qb-input" value={f.contact_email} onChange={e => up('contact_email', e.target.value)} placeholder="email@..." />
                </div>
              </div>
              <label className="qb-label">GST Number</label>
              <input className="qb-input" value={f.gst_number} onChange={e => up('gst_number', e.target.value)} placeholder="29AABCP1234R1Z5" />
              <label className="qb-label">Billing Address</label>
              <textarea className="qb-input" rows={2} value={f.billing_address} onChange={e => up('billing_address', e.target.value)} placeholder="Full billing address" style={{ resize: 'vertical', minHeight: 52 }} />
            </div>

            {/* Project card */}
            <div style={sectionStyle}>
              <div style={secTitleStyle}>🏗 Project Details</div>
              <label className="qb-label">Project Name</label>
              <input className="qb-input" value={f.project_name} onChange={e => up('project_name', e.target.value)} placeholder="e.g. Prestige Skyrise Tower A" />
              <label className="qb-label">Site / Delivery Location</label>
              <input className="qb-input" value={f.site_location} onChange={e => up('site_location', e.target.value)} placeholder="e.g. Whitefield, Bangalore" />
              <label className="qb-label">Architect / Consultant Name</label>
              <input className="qb-input" value={f.architect_name} onChange={e => up('architect_name', e.target.value)} placeholder="e.g. ABC Architects" />
            </div>

            {/* Terms card */}
            <div style={sectionStyle}>
              <div style={secTitleStyle}>📋 Commercial Terms</div>
              <label className="qb-label">Payment Terms</label>
              <select className="qb-sel" value={f.payment_terms} onChange={e => up('payment_terms', e.target.value)}>
                {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
              <label className="qb-label">Delivery Terms</label>
              <select className="qb-sel" value={f.delivery_terms} onChange={e => up('delivery_terms', e.target.value)}>
                {DELIVERY_TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="qb-label">Validity (days)</label>
                  <select className="qb-sel" value={f.validity_days} onChange={e => up('validity_days', Number(e.target.value))}>
                    {VALIDITY_OPTS.map(v => <option key={v} value={v}>{v} days</option>)}
                  </select>
                </div>
                <div>
                  <label className="qb-label">GST Rate (%)</label>
                  <select className="qb-sel" value={f.gst_rate} onChange={e => up('gst_rate', Number(e.target.value))}>
                    <option value={18}>18%</option>
                    <option value={12}>12%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              </div>
              <label className="qb-label">Notes / Special Conditions</label>
              <textarea className="qb-input" rows={3} value={f.notes} onChange={e => up('notes', e.target.value)} placeholder="Colour specs, certifications, special requirements…" style={{ resize: 'vertical', minHeight: 64 }} />
            </div>

            {/* Freight card */}
            <div style={{ ...sectionStyle, marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                <input type="checkbox" checked={f.include_freight} onChange={e => up('include_freight', e.target.checked)} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
                🚚 Include Freight Charge
              </label>
              {f.include_freight && (
                <>
                  <label className="qb-label" style={{ marginTop: 10 }}>Freight Amount (₹)</label>
                  <input className="qb-input" type="number" min={0} value={f.freight_amount} onChange={e => up('freight_amount', Number(e.target.value))} />
                </>
              )}
            </div>
          </div>

          {/* ── Right panel — AI + Line Items ── */}
          <div className="qb-form-right">
            {/* AI Pricing Recommendation */}
            {lines[0]?.product_id && (
              <div className="qb-ai-panel">
                <button className="qb-ai-btn" onClick={fetchAIRec} disabled={aiLoading}>
                  {aiLoading ? '⏳ Getting AI recommendation…' : '✨ Get AI Pricing Recommendation'}
                </button>
                {aiRec && (
                  <div className="qb-ai-rec">
                    <div className="qb-ai-rec-row">
                      <span>Recommended discount</span>
                      <strong style={{ color: 'var(--green)' }}>{aiRec.recommended_discount_pct}%</strong>
                    </div>
                    <div className="qb-ai-rec-row">
                      <span>Max safe discount</span>
                      <strong>{aiRec.max_safe_discount_pct}%</strong>
                    </div>
                    <div className="qb-ai-rec-row">
                      <span>Floor margin</span>
                      <strong>{aiRec.floor_margin_pct}%</strong>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{aiRec.rationale}</div>
                    {aiRec.warning && (
                      <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>⚠ {aiRec.warning_msg}</div>
                    )}
                    <button className="qb-apply-btn"
                      onClick={() => setLines(lines.map(l => ({ ...l, discount_pct: aiRec.recommended_discount_pct })))}>
                      Apply to all lines
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Line Items with Margin Mode toggle ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
              <div className="qb-form-sec-title" style={{ marginBottom: 0 }}>Line Items</div>

              {/* Feature 2: Margin mode radio */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--s3)', borderRadius: 8, padding: '5px 10px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 4 }}>Margin:</span>
                {[['line', '📊 Per Line'], ['bottom', '🎯 Overall Target']].map(([val, label]) => (
                  <label key={val} style={{
                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                    fontSize: 11, fontWeight: marginMode === val ? 700 : 500,
                    color: marginMode === val ? 'var(--brand)' : 'var(--text3)',
                    padding: '3px 8px', borderRadius: 6,
                    background: marginMode === val ? 'var(--g5)' : 'transparent',
                    border: marginMode === val ? '1px solid var(--g4)' : '1px solid transparent',
                    transition: 'all .15s',
                  }}>
                    <input
                      type="radio" name="marginMode" value={val}
                      checked={marginMode === val}
                      onChange={() => setMarginMode(val)}
                      style={{ display: 'none' }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="qb-li-scroll">
              <table className="qb-li-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>List Price</th>
                    <th>Disc %</th>
                    <th>Net Price</th>
                    <th>Amount</th>
                    {marginMode === 'line' && <th>Margin</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((item, idx) => (
                    <LineItemRow key={idx} item={item} idx={idx} products={products}
                      onChange={updateLine} onRemove={removeLine} marginMode={marginMode} />
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="qb-add-line-btn" onClick={addLine}>+ Add Line Item</button>
              <button
                className="qb-add-line-btn"
                onClick={() => setShowImageSearch(true)}
                title="Upload a product photo to find and add it"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', borderColor: 'transparent' }}>
                🔍 Search by Image
              </button>
            </div>

            {/* ── Image Search Modal ── */}
            {showImageSearch && (
              <ImageSearchModal
                onClose={() => setShowImageSearch(false)}
                onAddProduct={addLineFromProduct}
              />
            )}

            {/* ── Totals Summary ── */}
            <div className="qb-summary-box">
              <div className="qb-sum-row">
                <span>Subtotal (excl. GST)</span>
                <strong>{fmtL(subtotal)}</strong>
              </div>
              <div className="qb-sum-row">
                <span>GST ({f.gst_rate}%)</span>
                <strong>{fmtL(gstAmount)}</strong>
              </div>
              <div className="qb-sum-row qb-sum-total">
                <span>TOTAL</span>
                <strong>{fmtL(total)}</strong>
              </div>
              {avgMargin > 0 && (
                <div className="qb-sum-row" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                  <span>Avg Margin</span>
                  <strong style={{ color: avgMargin >= 14 ? 'var(--green)' : 'var(--red)' }}>
                    {fmtPct(avgMargin)} {avgMargin < 14 ? '⚠ Below floor' : '✓'}
                  </strong>
                </div>
              )}

              {/* Feature 2: Bottom-level margin target panel */}
              {marginMode === 'bottom' && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ background: 'var(--g5)', border: '1px solid var(--g4)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>
                      🎯 Overall Margin Target
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <input
                        type="number" min="0" max="60" step="0.5"
                        value={targetMarginPct}
                        onChange={e => setTargetMarginPct(Number(e.target.value) || 0)}
                        style={{
                          width: 70, height: 36, border: '2px solid var(--g4)', borderRadius: 8,
                          padding: '0 10px', fontSize: 18, fontWeight: 900, color: 'var(--brand)',
                          textAlign: 'center', background: 'var(--surface)', outline: 'none', fontFamily: 'var(--mono)',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--brand)'}
                        onBlur={e => e.target.style.borderColor = 'var(--g4)'}
                      />
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand)' }}>%</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>target margin</div>
                      </div>
                      {avgAppliedDisc !== null && (
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>Avg discount</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
                            {fmtPct(avgAppliedDisc)}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Per-line discount breakdown */}
                    {lines.filter(l => l.buy_price > 0 && l.unit_price > 0).map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginTop: 5, padding: '4px 0', borderTop: i === 0 ? '1px dashed var(--g4)' : 'none' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%', fontWeight: 500 }}>
                          {l.product_name || `Line ${i + 1}`}
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--brand3)' }}>
                          {fmtPct(l.discount_pct)} disc → {fmtPct(l.unit_price > 0 ? ((l.unit_price*(1-l.discount_pct/100) - l.buy_price) / (l.unit_price*(1-l.discount_pct/100)) * 100) : 0)} margin
                        </span>
                      </div>
                    ))}
                    {lines.filter(l => l.buy_price <= 0 || l.unit_price <= 0).length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' }}>
                        ⚠ Lines without buy price are excluded from margin calculation
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── AI Quote Analysis Panel ── */}
            <div className="qa-panel">
              <button
                className={`qa-toggle${showAnalysis ? ' open' : ''}`}
                onClick={showAnalysis ? () => setShowAnalysis(false) : fetchAnalysis}
                disabled={analysisLoading || lines.every(l => !l.product_id)}
              >
                {analysisLoading
                  ? <><span className="qa-spinner"></span> AI is analysing your quotation…</>
                  : showAnalysis
                    ? '▲ Hide AI Analysis'
                    : '✨ AI Quote Analysis — Win Score, Margin Health & Recommendations'}
              </button>

              {showAnalysis && analysis && (
                <div className="qa-body">
                  <div className="qa-score-row">
                    <div className="qa-score-block">
                      <div className="qa-score-num"
                        style={{ color: analysis.win_probability >= 70 ? 'var(--green)' : analysis.win_probability >= 50 ? 'var(--amber)' : 'var(--r2)' }}>
                        {analysis.win_probability}
                      </div>
                      <div className="qa-score-lbl">Win Score / 100</div>
                      {analysis.win_probability_rationale && (
                        <div className="qa-score-rationale">{analysis.win_probability_rationale}</div>
                      )}
                    </div>
                    <div className="qa-badges">
                      <span className={`bdg ${analysis.deal_health === 'good' ? 'bg' : analysis.deal_health === 'at_risk' ? 'ba' : 'br'}`}>
                        {analysis.deal_health === 'good' ? 'HEALTHY' : analysis.deal_health === 'at_risk' ? 'AT RISK' : 'CRITICAL'}
                      </span>
                      <span className="bdg bb">{(analysis.deal_size || 'small').toUpperCase()} DEAL</span>
                      <span className="bdg bt">AVG {analysis.avg_margin_pct}% MARGIN</span>
                      <span className="bdg bb">{analysis.data_source === 'openai' ? '✨ GPT-4o' : '⚙ Rule Engine'}</span>
                    </div>
                  </div>

                  {analysis.item_analysis?.length > 0 && (
                    <div className="qa-items">
                      <div className="qa-sec-title">Per-Item Margin Health</div>
                      {analysis.item_analysis.map((it, i) => (
                        <div key={i} className="qa-item-row">
                          <span className="qa-item-name">{it.product_name || `Item ${i + 1}`}</span>
                          <div style={{ flex: 1, margin: '0 8px' }}>
                            <MarginBar pct={it.margin_pct || 0} />
                          </div>
                          <span className={`qa-item-pct ${it.status}`}>
                            {it.margin_pct !== null && it.margin_pct !== undefined ? `${it.margin_pct}%` : '—'}
                          </span>
                          <span className={`bdg ${it.status === 'healthy' ? 'bg' : it.status === 'at_risk' ? 'ba' : it.status === 'critical' ? 'br' : 'bb'}`}
                            style={{ fontSize: 9, marginLeft: 4 }}>
                            {it.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {analysis.key_insights?.length > 0 && (
                    <div className="qa-section">
                      <div className="qa-sec-title">Key Insights</div>
                      {analysis.key_insights.map((ins, i) => (
                        <div key={i} className="qa-insight">
                          <span className="qa-insight-dot">•</span>{ins}
                        </div>
                      ))}
                    </div>
                  )}

                  {analysis.recommended_actions?.length > 0 && (
                    <div className="qa-section">
                      <div className="qa-sec-title">Recommended Actions</div>
                      {analysis.recommended_actions.map((act, i) => (
                        <div key={i} className="qa-action">
                          <span className={`bdg ${act.impact === 'high' ? 'br' : act.impact === 'medium' ? 'ba' : 'bb'}`}
                            style={{ fontSize: 9, flexShrink: 0, minWidth: 46, textAlign: 'center' }}>
                            {(act.impact || 'low').toUpperCase()}
                          </span>
                          <span className="qa-action-text">{act.action}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {analysis.pricing_strategy && (
                    <div className="qa-section">
                      <div className="qa-sec-title">Pricing Strategy</div>
                      <div className="qa-strategy">{analysis.pricing_strategy}</div>
                    </div>
                  )}

                  {analysis.upsell_opportunity && (
                    <div className="qa-upsell">
                      <span style={{ fontSize: 14 }}>💡</span>
                      <span><strong>Upsell opportunity:</strong> {analysis.upsell_opportunity}</span>
                    </div>
                  )}

                  <button className="qa-refresh-btn" onClick={fetchAnalysis} disabled={analysisLoading}>
                    ↻ Refresh Analysis
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {saveError && (
          <div style={{ margin: '0 0 8px', padding: '8px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>
            ⚠ {saveError}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="qb-form-footer" style={{ background: 'var(--s2)', borderTop: '1px solid var(--border)', padding: '14px 22px' }}>
          <button className="qb-cancel-btn" onClick={onClose}>Cancel</button>
          {total > 0 && (
            <div className="qb-footer-total">
              <span>Total:</span>
              <span className="qb-footer-total-val">{fmtL(total)}</span>
              {avgMargin > 0 && (
                <span className={`qb-footer-margin ${avgMargin >= 14 ? 'ok' : 'warn'}`}>
                  {fmtPct(avgMargin)} margin {avgMargin < 14 ? '⚠' : '✓'}
                </span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {draftSaved && (
              <button className="qb-draft-btn"
                style={{ borderColor: '#0f4c81', color: '#0f4c81', background: '#eff6ff' }}
                onClick={() => setShowEmailDialog(true)}>
                📧 Send Email
              </button>
            )}
            <button className="qb-draft-btn"
              onClick={() => { if (!f.customer_name) { setSaveError('Customer name is required.'); return; } setShowPrintPreview(true); }}
              disabled={saving}>
              {editQuote ? '📋 Preview & Save Changes' : '📋 Preview & Save Draft'}
            </button>
            <button className="qb-save-btn" onClick={handleSave} disabled={saving || !f.customer_name}
              style={{ background: editQuote ? 'linear-gradient(135deg, #1e3a5f, #2563eb)' : undefined }}>
              {saving ? (editQuote ? 'Updating…' : 'Creating…') : editQuote ? '✓ Update Quotation' : '✓ Create Quotation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main QuoteBuilder View ─────────────────────────────────────────────────────
export default function QuoteBuilder({ onGoChat, dbStatus, onNavigate }) {
  const [data, setData]           = useState(null);
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeQ, setActiveQ]       = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanPrefill, setScanPrefill] = useState(null);
  const [editQuote, setEditQuote]   = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch]         = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;
  const [refreshKey, setRefreshKey] = useState(0);

  const silentFetch = useCallback(() => {
    Promise.all([
      fetch('/api/quotes').then(r => r.json()),
      fetch('/api/catalog').then(r => r.json()),
    ]).then(([qd, cd]) => {
      setData(qd);
      setProducts(cd.products || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/quotes').then(r => r.json()),
      fetch('/api/catalog').then(r => r.json()),
    ]).then(([qd, cd]) => {
      setData(qd);
      setProducts(cd.products || []);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [refreshKey]);

  useAutoRefresh(silentFetch, 5 * 60_000);

  const handleEdit = (q) => {
    setEditQuote(q);
    setActiveQ(null);
    setShowForm(true);
  };

  const filteredQuotes = (data?.quotes || []).filter(q => {
    const matchStatus = statusFilter === 'ALL' || q.status === statusFilter;
    const matchSearch = !search || q.customer_name.toLowerCase().includes(search.toLowerCase())
      || q.quote_number.toLowerCase().includes(search.toLowerCase())
      || (q.project_name || '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });
  useEffect(() => { setPage(1); }, [statusFilter, search]);
  const pagedQuotes = filteredQuotes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kpis = data?.kpis || {};

  if (loading) return <PageLoader />;

  return (
    <div className="view">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">Quotation Builder</div>
          <div className="psub">Professional AI-powered quotations for louvers, laminates & building materials</div>
        </div>
        <div className="ph-actions">
          <DataSourceBadge source={data?.data_source} />
          <button className="scan-wa-btn" onClick={() => setShowScanner(true)}>📱 Scan WhatsApp</button>
          <button className="btn-primary" onClick={() => { setEditQuote(null); setShowForm(true); }}>+ New Quotation</button>
        </div>
      </div>

      {/* AI Banner */}
      {onGoChat && (
        <div className="ai-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <span style={{ fontSize: 22 }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Quote Intelligence Active</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                {kpis.quotes_expiring > 0
                  ? `⚠ ${kpis.quotes_expiring} quote${kpis.quotes_expiring > 1 ? 's' : ''} expiring this week — follow up now`
                  : 'No urgent expirations this week'}
                {' · '}Win rate: <strong>{kpis.win_rate_pct || 0}%</strong>
                {' · '}Pipeline: <strong>{fmtL(kpis.pipeline_value || 0)}</strong>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="ai-banner-btn" onClick={() => onGoChat('Which quotes should I urgently follow up on this week? Give me a prioritised call list with follow-up scripts for each contact.')}>
              📞 Follow-up List
            </button>
            <button className="ai-banner-btn" onClick={() => onGoChat('Analyse my quotation win rate and lost deals — what pricing or strategy patterns do you see? How can I improve my close rate?')}>
              📊 Win Rate Analysis
            </button>
            <button className="ai-banner-btn" onClick={() => onGoChat('Give me a complete pipeline health check — quotes by status, at-risk deals, margin analysis, and the 3 most likely deals to close this month.')}>
              🏗 Pipeline Health
            </button>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="kg g5">
        <div className="kc sb" style={{ cursor: 'pointer' }}
          onClick={() => onGoChat?.('What is my total quotation pipeline value? Break it down by status — Draft, Sent, Negotiating — and tell me which deals need action.')}>
          <div className="kt"><span className="kl">Pipeline Value</span></div>
          <div className="kv">{fmtL(kpis.pipeline_value || 0)}</div>
          <div className="ks">{kpis.total_quotes || 0} total quotes</div>
        </div>
        <div className="kc sg" style={{ cursor: 'pointer' }}
          onClick={() => onGoChat?.(`I have won ${fmtL(kpis.won_value || 0)} in quotations with a ${kpis.win_rate_pct || 0}% win rate. What patterns made these deals successful and how do I replicate them?`)}>
          <div className="kt"><span className="kl">Won (YTD)</span></div>
          <div className="kv">{fmtL(kpis.won_value || 0)}</div>
          <div className="ks">Win rate: {kpis.win_rate_pct || 0}%</div>
        </div>
        <div className="kc sr" style={{ cursor: 'pointer' }}
          onClick={() => onGoChat?.(`I have lost ${fmtL(kpis.lost_value || 0)} in quotations. Analyse my lost deals — what are the likely reasons and how should I adjust my pricing strategy?`)}>
          <div className="kt"><span className="kl">Lost (YTD)</span></div>
          <div className="kv">{fmtL(kpis.lost_value || 0)}</div>
          <div className="ks">Review pricing strategy</div>
        </div>
        <div className="kc st" style={{ cursor: 'pointer' }}
          onClick={() => onGoChat?.(`My average quotation margin is ${kpis.avg_margin_pct || 0}%. The floor is 14% and target is 20%. Which product categories are dragging margins down and what should I do?`)}>
          <div className="kt"><span className="kl">Avg Margin</span></div>
          <div className="kv">{kpis.avg_margin_pct || 0}%</div>
          <div className="ks">Floor: 14% · Target: 20%</div>
        </div>
        <div className="kc sa" style={{ cursor: 'pointer' }}
          onClick={() => onGoChat?.('Which quotes are expiring this week? Give me the customer names, contact numbers, quote values, and a follow-up script for each one.')}>
          <div className="kt"><span className="kl">Expiring Soon</span></div>
          <div className="kv" style={{ color: kpis.quotes_expiring > 0 ? 'var(--amber)' : undefined }}>
            {kpis.quotes_expiring || 0} quotes
          </div>
          <div className="ks">Follow up today</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <input className="view-search" placeholder="🔍  Search by customer, quote#, project…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="stabs">
          {['ALL', ...Object.keys(QUOTE_STATUS)].map(s => (
            <button key={s} className={`stab${statusFilter === s ? ' active' : ''}`}
              onClick={() => setStatusFilter(s)}>
              {s === 'ALL' ? 'All' : QUOTE_STATUS[s].label}
              {s !== 'ALL' && (
                <span className="stab-cnt">
                  {(data?.quotes || []).filter(q => q.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <ExportButton rows={filteredQuotes} filename="quotations" columns={[
          { key: 'quote_number', label: 'Quote #' }, { key: 'customer_name', label: 'Customer' },
          { key: 'project_name', label: 'Project' }, { key: 'total_value', label: 'Value (₹)' },
          { key: 'status', label: 'Status' }, { key: 'valid_until', label: 'Valid Until' },
          { key: 'created_at', label: 'Created' },
        ]} />
      </div>

      {/* Quotes table */}
      <div className="card-table">
        <table className="tbl">
          <thead>
            <tr>
              <th>Quote #</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Margin</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredQuotes.length === 0 ? (
              <tr><td colSpan={7}>
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                    {search || statusFilter !== 'ALL' ? 'No quotes match your filter' : 'No quotations yet'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
                    {search || statusFilter !== 'ALL'
                      ? 'Try a different search or status filter'
                      : 'Create your first professional quotation or scan a WhatsApp requirement'}
                  </div>
                  {!search && statusFilter === 'ALL' && (
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button className="btn-primary" onClick={() => { setEditQuote(null); setShowForm(true); }}>+ New Quotation</button>
                      <button className="scan-wa-btn" onClick={() => setShowScanner(true)}>📱 Scan WhatsApp</button>
                      {onGoChat && (
                        <button className="qb-action-btn" onClick={() => onGoChat('How do I build a winning quotation strategy for my building materials business? What should my pricing, margin floors, and follow-up process look like?')}>
                          🤖 Ask AI for Guidance
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </td></tr>
            ) : pagedQuotes.map(q => (
              <QuoteRow key={q.quote_id} q={q} onView={setActiveQ} onEdit={handleEdit}
                onAskAI={onGoChat ? (q) => onGoChat(`Analyse quotation ${q.quote_number} for ${q.customer_name} — value: ${fmtL(q.total)}, margin: ${q.avg_margin_pct || 0}%, status: ${q.status}, valid till: ${q.valid_till}. What is my win probability, what negotiation strategy should I use, and what follow-up should I do today?`) : null}
              />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={filteredQuotes.length} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* AI assistant prompt */}
      {onGoChat && (
        <div className="ai-cta-bar" onClick={() => onGoChat('What is my quotation win rate and how can I improve it?')}>
          <span>✨</span>
          <span>Ask AI: Analyse my win rate and pricing strategy →</span>
        </div>
      )}

      {/* Modals */}
      {activeQ && (
        <QuoteDetail quote={activeQ} onClose={() => setActiveQ(null)} onGoChat={onGoChat} onEdit={handleEdit}
          onNavigate={onNavigate}
          onStatusUpdate={(id, s) => setData(prev => ({
            ...prev,
            quotes: prev.quotes.map(q => q.quote_id === id ? { ...q, status: s } : q),
          }))} />
      )}
      {showForm && (
        <NewQuoteForm
          products={products}
          editQuote={editQuote}
          initialData={!editQuote ? scanPrefill?.initialData : undefined}
          initialLines={!editQuote ? scanPrefill?.initialLines : undefined}
          onClose={() => { setShowForm(false); setScanPrefill(null); setEditQuote(null); }}
          onCreated={() => { setShowForm(false); setScanPrefill(null); setEditQuote(null); setRefreshKey(k => k + 1); }}
        />
      )}
      {showScanner && (
        <WhatsAppScannerModal
          onClose={() => setShowScanner(false)}
          onBuildQuote={(initialData, initialLines) => {
            setScanPrefill({ initialData, initialLines });
            setEditQuote(null);
            setShowScanner(false);
            setShowForm(true);
          }}
        />
      )}
    </div>
  );
}
