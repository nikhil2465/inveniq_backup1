import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { ExportButton } from '../utils/exportUtils';
import Pagination from '../components/Pagination';
import DataSourceBadge from '../components/DataSourceBadge';
import PageLoader from '../components/PageLoader';
import { useDraggable } from '../components/DraggableModal';

// ── GST Utilities — Indian GST split logic (CGST+SGST intrastate / IGST interstate) ──
// Company GSTIN state code — update this in Company Profile → used for all tax determination
const _COMPANY_STATE_CODE = '29'; // 29 = Karnataka (update via Company Profile API)
const _gstStateCode = (gstin) => (gstin || '').slice(0, 2);
const _isIgst = (customerGstin) => {
  if (!customerGstin || customerGstin.length < 15) return false; // no GSTIN → assume intrastate
  return _gstStateCode(customerGstin) !== _COMPANY_STATE_CODE;
};
// Returns { cgst, sgst, igst, type } for a given taxable amount and rate
const _gstSplit = (taxableAmt, ratePct, customerGstin) => {
  const total = (taxableAmt * ratePct) / 100;
  if (_isIgst(customerGstin)) return { cgst: 0, sgst: 0, igst: total, type: 'IGST' };
  return { cgst: total / 2, sgst: total / 2, igst: 0, type: 'CGST+SGST' };
};
// Format date as DD/MM/YYYY (HAIA standard — Indian commercial format)
const _fmtDate = (d) => {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return d; // return as-is if not parseable
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
};

// ── WhatsApp Scanner Modal ─────────────────────────────────────────────────────
function WhatsAppScannerModal({ onClose, onBuildQuote }) {
  const [files,            setFiles]           = useState([]);
  const [previews,         setPreviews]        = useState([]);
  const [scanning,         setScanning]        = useState(false);
  const [result,           setResult]          = useState(null);
  const [error,            setError]           = useState(null);
  const [selectedProducts, setSelectedProducts] = useState({});
  const [dragOver,         setDragOver]        = useState(false);
  const [textInput,        setTextInput]       = useState('');
  const [contactPhone,     setContactPhone]    = useState('');
  const [contactEmail,     setContactEmail]    = useState('');
  // Per-item overrides: qty edits + skip flags (reset on every new scan)
  const [itemQty,          setItemQty]         = useState({});
  const [skippedItems,     setSkippedItems]    = useState(new Set());
  const fileRef = useRef();

  const canScan = !scanning && (files.length > 0 || textInput.trim());

  const addFiles = (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setResult(null); setError(null);
    arr.forEach(f => {
      setFiles(prev => prev.find(x => x.name === f.name && x.size === f.size) ? prev : [...prev, f]);
      if (f.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => setPreviews(prev => [...prev, { name: f.name, url: e.target.result, isImage: true }]);
        reader.readAsDataURL(f);
      } else {
        setPreviews(prev => [...prev, { name: f.name, url: null, isImage: false }]);
      }
    });
  };

  const removeFile = (idx) => {
    setFiles(p => p.filter((_, i) => i !== idx));
    setPreviews(p => p.filter((_, i) => i !== idx));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleScan = async () => {
    if (!canScan) return;
    setScanning(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach(f => form.append('file', f));
      if (textInput.trim()) form.append('text_input', textInput.trim());
      const r = await fetch('/api/quotes/scan-whatsapp', { method: 'POST', body: form });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const d = await r.json();
      setResult(d);
      setItemQty({});
      setSkippedItems(new Set());
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
      setItemQty({});
      setSkippedItems(new Set());
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
      notes: [ext.special_requirements, ext.delivery_notes, ext.budget_indication]
        .filter(Boolean).join(' · '),
    };
    const initialLines = [];
    (result.matched_products || []).forEach((mp, i) => {
      // Honour explicit skip — item excluded from quote
      if (skippedItems.has(i)) return;
      const pid  = selectedProducts[i];
      const prod = (mp.matches || []).find(p => String(p.product_id) === String(pid)) || mp.best_match;
      // Quantity: respect inline edit override, then AI-extracted qty
      const qty = itemQty[i] !== undefined ? itemQty[i] : (mp.required?.quantity || 1);
      if (prod) {
        initialLines.push({
          product_id:     String(prod.product_id),
          product_name:   prod.name || prod.item_name || '',
          category:       prod.category || '',
          quantity:       qty,
          unit:           prod.unit || mp.required?.unit || 'Nos',
          unit_price:     prod.sell_price || prod.mrp || 0,
          buy_price:      prod.buy_price || 0,
          discount_pct:   0,
          specifications: mp.required?.specifications || '',
        });
        return;
      }
      // No catalog match — placeholder so the item still appears in the quote for manual pricing
      if (mp.required?.description) {
        initialLines.push({
          product_id:     '',
          product_name:   mp.catalog_name || mp.required.description,
          category:       mp.required?.inferred_category || '',
          quantity:       qty,
          unit:           mp.required?.unit || 'Nos',
          unit_price:     0,
          buy_price:      0,
          discount_pct:   0,
          specifications: mp.required?.specifications || '',
        });
      }
    });
    onBuildQuote(initialData, initialLines.length > 0 ? initialLines : [{ ...BLANK_LINE }]);
  };

  const [savedToCatalog, setSavedToCatalog] = useState(new Set());
  const [savingCatalog,  setSavingCatalog]  = useState(null);

  const handleSaveToCatalog = async (mp, i) => {
    setSavingCatalog(i);
    const req = mp.required || {};
    const desc = (req.description || '').toLowerCase();

    // ── Smart HSN inference ─────────────────────────────────────────────────
    const inferHsn = () => {
      if (/tap|mixer|shower|faucet|stop cock|health faucet|bath spout|kitchen tap|basin mixer|bib cock/.test(desc)) return '8481';
      if (/wc|toilet|closet|ewc|water closet|basin|wash basin|bathtub|urinal/.test(desc)) return '6910';
      if (/towel|soap|mirror|floor drain|shower enclosure|accessories/.test(desc)) return '3922';
      if (/hinge|channel|drawer|tandem|handle|knob|pull|lock|latch|cam lock/.test(desc)) return '8302';
      if (/padlock|mortise lock|deadbolt/.test(desc)) return '8301';
      if (/cpvc|pvc pipe|drainage pipe|upvc pipe/.test(desc)) return '3917';
      if (/tile|vitrified|ceramic|mosaic|pgvt/.test(desc)) return '6907';
      if (/marble|granite|natural stone/.test(desc)) return '2515';
      if (/waterproof/.test(desc)) return '3214';
      if (/install|labour|plumb|fitting charges|amc/.test(desc)) return '9954';
      return req.inferred_hsn || '8302';
    };

    // ── Smart category inference ────────────────────────────────────────────
    const inferCategory = () => {
      if (/basin mixer|kitchen mixer|shower|stop cock|health faucet|bath spout|bib cock/.test(desc)) return 'CP Fittings — Taps & Mixers';
      if (/wc|toilet|closet|ewc/.test(desc)) return 'Sanitary Ware — WC / EWC';
      if (/wash basin|pedestal basin|counter.?top basin|wall.?hung basin/.test(desc)) return 'Sanitary Ware — Wash Basin';
      if (/bathtub|jacuzzi/.test(desc)) return 'Sanitary Ware — Bathtub / Jacuzzi';
      if (/towel|soap|mirror|floor drain|shower enclosure|robe hook/.test(desc)) return 'Bathroom Accessories';
      if (/kitchen sink|sink/.test(desc)) return 'Kitchen Fittings — Sink & Mixer';
      if (/hinge/.test(desc)) return 'Hardware — Hinges & Channels';
      if (/channel|drawer|tandem/.test(desc)) return 'Hardware — Drawer Systems';
      if (/handle|knob|pull/.test(desc)) return 'Hardware — Handles & Knobs';
      if (/lock|latch/.test(desc)) return 'Hardware — Locks & Latches';
      if (/cpvc|pvc|pipe|drainage/.test(desc)) return 'Plumbing — CPVC / PVC Pipes';
      if (/tile|vitrified|ceramic|pgvt/.test(desc)) return 'Tiles & Stone';
      if (/marble|granite/.test(desc)) return 'Tiles & Stone';
      if (/waterproof/.test(desc)) return 'Waterproofing';
      if (/install|labour|plumb/.test(desc)) return 'Installation & Labour';
      return req.inferred_category || 'Others';
    };

    // ── Smart brand extraction ──────────────────────────────────────────────
    const inferBrand = () => {
      const brandMap = [
        ['jaquar', 'Jaquar'], ['grohe', 'Grohe'], ['kohler', 'Kohler'],
        ['hindware', 'Hindware'], ['parryware', 'Parryware'], ['cera', 'Cera'],
        ['american standard', 'American Standard'], ['toto', 'TOTO'],
        ['roca', 'Roca'], ['essco', 'Essco'], ['marc', 'Marc'],
        ['hettich', 'Hettich'], ['blum', 'Blum'], ['hafele', 'Häfele'],
        ['ebco', 'Ebco'], ['godrej', 'Godrej'], ['yale', 'Yale'],
        ['astral', 'Astral'], ['supreme', 'Supreme'], ['finolex', 'Finolex'],
        ['kajaria', 'Kajaria'], ['somany', 'Somany'], ['johnson', 'Johnson Tiles'],
        ['franke', 'Franke'], ['dorset', 'Dorset'],
      ];
      for (const [kw, name] of brandMap) {
        if (desc.includes(kw)) return name;
      }
      return '';
    };

    const inferFinish = () => {
      if (/pvd gold|gold finish/.test(desc)) return 'PVD Gold';
      if (/pvd black|black finish|matt black/.test(desc)) return 'PVD Matt Black';
      if (/rose gold/.test(desc)) return 'Rose Gold';
      if (/brushed nickel|brushed/.test(desc)) return 'Brushed Nickel';
      if (/chrome|cp finish/.test(desc)) return 'Chrome';
      if (/stainless|ss finish/.test(desc)) return 'Stainless Steel';
      return '';
    };

    const product = {
      name:         req.description || 'Unknown Product',
      brand:        inferBrand(),
      category:     inferCategory(),
      sub_category: '',
      unit:         req.unit || 'Nos',
      size:         req.specifications || '',
      finish:       inferFinish(),
      buy_price:    0,
      sell_price:   0,
      gst_rate:     18,
      hsn_code:     inferHsn(),
      applications: [req.notes, req.inferred_category].filter(Boolean),
      features:     [],
      tags:         [inferBrand(), inferCategory()].filter(Boolean),
      stock_status: 'in_stock',
      lead_time:    '3–5 days',
      moq:          1,
    };
    try {
      const r = await fetch('/api/catalog/add-product', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      if (r.ok || r.status === 201) {
        setSavedToCatalog(s => new Set([...s, i]));
      } else {
        const err = await r.json().catch(() => ({}));
        console.error('Catalog add failed:', r.status, err);
      }
    } catch (e) {
      console.error('Catalog add error:', e);
    }
    setSavingCatalog(null);
  };

  const CONF_COLOR  = { exact: '#7c3aed', high: 'var(--green)', medium: 'var(--amber)', low: 'var(--r2)', none: 'var(--text3)' };
  const CONF_LABEL  = { exact: '✓ Exact SKU', high: 'High match', medium: 'Medium match', low: 'Low match', none: 'Nearest available' };

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
              onClick={() => fileRef.current?.click()}
            >
              <div className="scan-drop-icon">📎</div>
              <div className="scan-drop-label">Drop files here or click to browse</div>
              <div className="scan-drop-sub">JPG · PNG · PDF · DOCX · XLSX · CSV · TXT — multiple files supported</div>
            </div>

            <input
              ref={fileRef} type="file" accept="*/*" multiple
              style={{ display: 'none' }}
              onChange={e => addFiles(e.target.files)}
            />

            {/* File chips */}
            {previews.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {previews.map((pv, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 7, padding: pv.isImage ? '2px 5px 2px 2px' : '4px 7px', maxWidth: 180 }}>
                    {pv.isImage
                      ? <img src={pv.url} alt={pv.name} style={{ height: 38, width: 52, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      : <span style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {pv.name}</span>
                    }
                    <button onClick={e => { e.stopPropagation(); removeFile(idx); }}
                      style={{ background: 'rgba(239,68,68,.15)', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 11, borderRadius: 3, padding: '1px 5px', fontWeight: 700, lineHeight: 1.2, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
                <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>{files.length} file{files.length !== 1 ? 's' : ''}</span>
              </div>
            )}

            {/* OR divider */}
            <div className="scan-or-divider"><span>OR</span></div>

            {/* Typed / pasted text input */}
            <textarea
              className="scan-text-input"
              placeholder={'Paste requirement text, WhatsApp message, or BOQ here…\n\nExamples:\n• "Need 3 sets of Jaquar Ornamix shower panels + 2 single-lever basin mixers"\n• "Master bath: Kohler WC + Grohe overhead shower. Guest bath: 1 Hindware basin mixer"\n• "24 flats — 3 bathrooms each — Jaquar Essco range, contractor price"\n• Any WhatsApp message, email, or unformatted list of items'}
              value={textInput}
              onChange={e => { setTextInput(e.target.value); setResult(null); setError(null); }}
              rows={5}
            />

            <div className="scan-actions">
              {canScan && (
                <button className="btn-primary" onClick={handleScan}>
                  {files.length > 1 ? `✨ Scan ${files.length} Files` : '✨ Scan & Extract Requirements'}
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
              <div className="scan-tip">🔢 Item code list (e.g. STDS50-I-35 10 nos)</div>
              <div className="scan-tip">⚡ Bare codes auto-matched without AI</div>
            </div>
          </div>

          {/* Results panel */}
          {result && (
            <div className="scan-results-panel">
              {result.demo_note && (
                <div className="scan-demo-notice">💡 {result.demo_note}</div>
              )}
              {/* Scan method badge */}
              {result.scan_method && (
                <div style={{ fontSize: 10, color: result.scan_method.startsWith('direct') ? '#7c3aed' : 'var(--green)', fontWeight: 700, marginBottom: 8, background: result.scan_method.startsWith('direct') ? 'rgba(124,58,237,0.08)' : 'rgba(22,163,74,0.07)', border: `1px solid ${result.scan_method.startsWith('direct') ? 'rgba(124,58,237,0.25)' : 'rgba(22,163,74,0.2)'}`, borderRadius: 6, padding: '4px 10px', display: 'inline-block' }}>
                  {result.scan_method.startsWith('direct') ? '⚡ Direct catalog lookup — no AI needed' : `✅ AI extracted + catalog matched`}
                </div>
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
              {result.extracted.delivery_notes && (
                <div className="scan-special" style={{ borderLeftColor: 'var(--blue)' }}>
                  🚚 {result.extracted.delivery_notes}
                </div>
              )}
              {result.extracted.budget_indication && (
                <div className="scan-special" style={{ borderLeftColor: 'var(--amber)' }}>
                  💰 Budget: {result.extracted.budget_indication}
                </div>
              )}

              {/* Product matches */}
              <div className="scan-section-hd" style={{ marginTop: 16 }}>
                Product Matches
                <span className="scan-count">{(result.matched_products || []).length - skippedItems.size} active · {(result.matched_products || []).length} total</span>
              </div>

              {/* Accept-All-Exact shortcut */}
              {(result.matched_products || []).some(mp => mp.confidence === 'exact') && (
                <button
                  onClick={() => {
                    const sel = {};
                    (result.matched_products || []).forEach((mp, i) => {
                      if (mp.confidence === 'exact' && mp.best_match)
                        sel[i] = mp.best_match.product_id;
                    });
                    setSelectedProducts(p => ({ ...p, ...sel }));
                  }}
                  style={{ width: '100%', marginBottom: 10, padding: '7px 0', background: 'rgba(124,58,237,0.07)', color: '#7c3aed', border: '1.5px solid rgba(124,58,237,0.25)', borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  ⚡ Auto-select All Exact SKU Matches
                </button>
              )}

              {(result.matched_products || []).map((mp, i) => {
                const isExact   = mp.confidence === 'exact';
                const isNone    = mp.confidence === 'none';
                const isSkipped = skippedItems.has(i);
                const itemCode  = mp.required?.item_code || '';
                const matchedSku = mp.matched_sku || mp.best_match?.sku_code || mp.best_match?.item_code || '';
                const catalogName = mp.catalog_name || mp.best_match?.item_name || mp.best_match?.name || '';
                const custDesc   = mp.required?.description || '';
                const showCustDesc = custDesc && custDesc !== catalogName && !custDesc.match(/^[A-Z0-9\-/\\_. ]{3,20}$/i);
                const displaySku = matchedSku || itemCode;
                // Correct GST rate from backend (per-HSN, not hardcoded 18%)
                const gstRate    = mp.gst_pct ?? 18;
                // Quantity: respect inline edit, else AI-extracted
                const displayQty = itemQty[i] !== undefined ? itemQty[i] : (mp.required?.quantity || 1);
                return (
                <div key={i} className={`scan-product-card${isNone ? ' scan-card-none' : ''}${isExact ? ' scan-card-exact' : ''}${isSkipped ? ' scan-card-skipped' : ''}`}
                  style={isExact && !isSkipped ? { borderColor: '#7c3aed', borderWidth: 2 } : {}}>

                  {/* ── Primary row: SKU chip + PRODUCT NAME (always) ────────── */}
                  <div className="scan-req-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                    <span className="bdg ba" style={{ flexShrink: 0 }}>REQUIRED</span>

                    {/* SKU chip — customer code OR catalog resolved SKU */}
                    {displaySku && (
                      <span style={{
                        fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 800, flexShrink: 0,
                        background: isExact ? 'rgba(124,58,237,0.12)' : 'var(--bg3)',
                        color: isExact ? '#7c3aed' : 'var(--text2)', borderRadius: 4, padding: '2px 8px',
                        border: isExact ? '1px solid rgba(124,58,237,0.35)' : '1px solid var(--border)',
                      }}>
                        {displaySku}
                      </span>
                    )}
                    {/* Show catalog SKU separately when it differs from customer's code */}
                    {matchedSku && itemCode && matchedSku !== itemCode && (
                      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#7c3aed', background: 'rgba(124,58,237,0.06)', borderRadius: 4, padding: '2px 6px', border: '1px solid rgba(124,58,237,0.2)', flexShrink: 0 }}>
                        = {matchedSku}
                      </span>
                    )}

                    {/* PRODUCT NAME — always the resolved catalog name (primary display) */}
                    {catalogName ? (
                      <span style={{ fontWeight: 700, fontSize: 13, color: isExact ? '#7c3aed' : 'var(--text)', flex: 1 }}>
                        {catalogName}
                      </span>
                    ) : (
                      <span className="scan-req-desc">{custDesc}</span>
                    )}

                    {/* Inline quantity editor */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <input
                        type="number"
                        min="0.1"
                        step="1"
                        value={displayQty}
                        disabled={isSkipped}
                        onChange={e => setItemQty(q => ({ ...q, [i]: parseFloat(e.target.value) || 1 }))}
                        className="scan-qty-input"
                      />
                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>{mp.required?.unit || 'Nos'}</span>
                    </span>

                    {/* Confidence badge */}
                    <span className="scan-conf" style={{ color: CONF_COLOR[mp.confidence] || 'var(--text3)', fontWeight: isExact ? 800 : 600, flexShrink: 0 }}>
                      {CONF_LABEL[mp.confidence] || mp.confidence}
                    </span>

                    {/* Skip toggle */}
                    <button
                      className="scan-skip-btn"
                      onClick={() => setSkippedItems(s => {
                        const n = new Set(s);
                        if (n.has(i)) n.delete(i); else n.add(i);
                        return n;
                      })}>
                      {isSkipped ? '↩ Un-skip' : '⊘ Skip'}
                    </button>

                    {/* + Catalog button (hidden when skipped) */}
                    {!isSkipped && (savedToCatalog.has(i) ? (
                      <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>✓ Saved</span>
                    ) : (
                      <button disabled={savingCatalog === i} onClick={() => handleSaveToCatalog(mp, i)}
                        style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {savingCatalog === i ? '⏳' : '➕ Catalog'}
                      </button>
                    ))}
                  </div>

                  {/* Customer's original description — only when meaningfully different from resolved name */}
                  {showCustDesc && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, fontStyle: 'italic' }}>
                      Customer: {custDesc}
                    </div>
                  )}

                  {mp.required?.specifications && (
                    <div className="scan-req-specs">{mp.required.specifications}</div>
                  )}
                  {mp.required?.notes && (
                    <div className="scan-req-specs" style={{ fontStyle: 'normal', color: 'var(--text2)' }}>
                      📝 {mp.required.notes}
                    </div>
                  )}
                  {/* Category and HSN chips */}
                  {(mp.required?.inferred_category || mp.required?.inferred_hsn || mp.best_match?.category) && (
                    <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                      {(mp.required?.inferred_category || mp.best_match?.category) && (
                        <span style={{ fontSize: 10, background: 'var(--b3)', color: 'var(--b2)', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>
                          {mp.required?.inferred_category || mp.best_match?.category}
                        </span>
                      )}
                      {(mp.required?.inferred_hsn || mp.best_match?.hsn_code) && (
                        <span style={{ fontSize: 10, background: 'var(--bg3)', color: 'var(--text3)', borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                          HSN {mp.required?.inferred_hsn || mp.best_match?.hsn_code} · {gstRate}% GST
                        </span>
                      )}
                      {mp.best_match?.size && (
                        <span style={{ fontSize: 10, background: 'rgba(8,145,178,0.08)', color: '#0891b2', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
                          {mp.best_match.size}
                        </span>
                      )}
                      {mp.best_match?.finish && (
                        <span style={{ fontSize: 10, background: 'var(--bg3)', color: 'var(--text3)', borderRadius: 4, padding: '2px 7px' }}>
                          {mp.best_match.finish}
                        </span>
                      )}
                    </div>
                  )}
                  {isNone && (
                    <div className="scan-no-match-note">
                      ⚠ Not found in catalog — showing nearest available products. Select one or skip.
                    </div>
                  )}
                  {/* Exact match confirmation banner */}
                  {isExact && catalogName && (
                    <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 3, fontWeight: 700 }}>
                      ✓ Catalog match: {matchedSku || displaySku} → {catalogName}
                    </div>
                  )}
                  {!isExact && !isNone && catalogName && catalogName !== custDesc && (
                    <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 3, fontWeight: 600 }}>
                      Nearest catalog: {matchedSku && <span style={{ fontFamily: 'var(--mono)', marginRight: 4 }}>{matchedSku}</span>}{catalogName}
                    </div>
                  )}
                  {/* Skipped overlay */}
                  {isSkipped ? (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', padding: '6px 0' }}>
                      ⊘ Skipped — will not be included in the quote. Click ↩ Un-skip to restore.
                    </div>
                  ) : (
                  <div className="scan-match-row">
                    {mp.matches?.length > 0 ? mp.matches.map((match, mi) => (
                      <div
                        key={match.product_id}
                        className={`scan-match-chip${String(selectedProducts[i]) === String(match.product_id) ? ' selected' : ''}${isNone ? ' chip-none' : ''}`}
                        onClick={() => setSelectedProducts(p => ({ ...p, [i]: match.product_id }))}
                        style={isExact && mi === 0 ? { borderColor: '#7c3aed', background: 'rgba(124,58,237,0.06)' } : {}}
                      >
                        {isExact && mi === 0 && <div style={{ fontSize: 9, color: '#7c3aed', fontWeight: 800, marginBottom: 2 }}>✓ EXACT MATCH</div>}
                        <div className="scan-chip-name">{match.name}</div>
                        {match.sku_code && <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 2 }}>{match.sku_code}</div>}
                        <div className="scan-chip-meta">
                          ₹{((match.sell_price || match.mrp) || 0).toLocaleString('en-IN')}/{match.unit || 'Nos'} · {match.margin_pct || 0}% margin
                        </div>
                      </div>
                    )) : (
                      <div className="scan-no-match">Not in catalog — will appear as manual line item (₹0). Set price in the quote editor.</div>
                    )}
                  </div>
                  )}
                </div>
              );
              })}

              <button className="qb-save-btn scan-build-btn" onClick={handleBuildQuote}>
                ✓ Build Quotation with Selected Products →
              </button>
              <button
                onClick={() => {
                  // Save to localStorage for DQB to pick up
                  const items = (result?.matched_products || []).map((mp, i) => {
                    const pid = selectedProducts[i];
                    const prod = (mp.matches || []).find(p => String(p.product_id) === String(pid)) || mp.best_match;
                    const req = mp.required || {};
                    return {
                      item_name:   req.description || (prod?.name || ''),
                      description: req.specifications || '',
                      item_type:   'cp_fittings',
                      unit:        req.unit || 'Nos',
                      qty:         req.quantity || 1,
                      specifications: req.specifications || '',
                      material_preference: prod?.brand || '',
                      inferred_hsn: req.inferred_hsn || '8302',
                      inferred_category: req.inferred_category || '',
                    };
                  }).filter(x => x.item_name);
                  const ext = result?.extracted || {};
                  localStorage.setItem('inveniq_qb_to_dqb', JSON.stringify({
                    timestamp: new Date().toISOString(),
                    source: 'QB',
                    client_name: ext.customer_name || '',
                    project_name: ext.project_name || '',
                    project_address: ext.site_location || '',
                    project_type: 'Residential',
                    items,
                  }));
                  alert('Items saved! Go to Design Quote Studio → Import from QB to use them in a BOQ.');
                }}
                style={{ width: '100%', marginTop: 8, padding: '9px 0', background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1.5px solid rgba(168,85,247,0.3)', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                🔗 Also Send to Design Studio (BOQ)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Merge Quotes Modal ────────────────────────────────────────────────────────
function MergeQuotesModal({ quotes, selectedIds, onClose, onOpenInEditor, onMerged }) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const fmtL  = (n) => { const v = Number(n || 0); return v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; };
  const fmt   = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const selected   = quotes.filter(q => selectedIds.includes(q.quote_id));
  const base       = selected[0] || {};
  const allItems   = selected.flatMap(q => (q.line_items || []).map(li => ({ ...li, _from: q.quote_number })));
  const totalValue = selected.reduce((s, q) => s + (parseFloat(q.grand_total) || 0), 0);

  // Build merged data (no DB call — fully client-side)
  const buildMerged = () => {
    const initialData = {
      customer_name:  base.customer_name  || '',
      customer_type:  base.customer_type  || '',
      contact_person: base.contact_person || '',
      contact_phone:  base.contact_phone  || '',
      contact_email:  base.contact_email  || '',
      project_name:   `[Merged] ${base.project_name || ''}`,
      site_location:  base.site_location  || '',
      payment_terms:  base.payment_terms  || '',
      delivery_terms: base.delivery_terms || '',
      gst_rate:       parseFloat(base.gst_rate) || 18,
      validity_days:  parseInt(base.validity_days) || 30,
      notes:          `Merged from: ${selected.map(q => q.quote_number).join(', ')}`,
    };
    const initialLines = allItems.map(li => ({
      product_id:    li.product_id    || '',
      product_name:  li.product_name  || '',
      category:      li.category      || '',
      quantity:      parseFloat(li.quantity)    || 1,
      unit:          li.unit          || '',
      unit_price:    parseFloat(li.unit_price)  || 0,
      buy_price:     parseFloat(li.buy_price)   || 0,
      discount_pct:  parseFloat(li.discount_pct)|| 0,
      specifications:li.specifications || '',
    }));
    return { initialData, initialLines };
  };

  // "Open in Editor" — no save, just open the form pre-filled
  const handleOpenEditor = () => {
    const { initialData, initialLines } = buildMerged();
    onOpenInEditor(initialData, initialLines);
  };

  // "Save as Draft" — calls API, saves immediately
  const handleSaveDraft = async () => {
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/quotes/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_ids: selectedIds }),
      });
      if (!r.ok) throw new Error(`Save failed (${r.status})`);
      onMerged(await r.json());
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="qb-modal-overlay">
      <div style={{ background: 'var(--card)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.4)', width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🔀 Merge {selected.length} Quotations — Preview</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Review all {allItems.length} items below, then choose how to proceed
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text3)', padding: '2px 6px' }}>✕</button>
        </div>

        {/* Source quotes summary */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0, background: 'rgba(37,99,235,0.03)' }}>
          {selected.map((q, i) => (
            <div key={q.quote_id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', background: 'var(--hover)', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12 }}>
              {i === 0 && <span style={{ fontSize: 9, fontWeight: 800, background: '#2563eb', color: '#fff', borderRadius: 3, padding: '1px 5px' }}>BASE</span>}
              <span style={{ fontWeight: 700, color: '#2563eb', fontFamily: 'var(--mono)' }}>{q.quote_number}</span>
              <span style={{ color: 'var(--text2)' }}>{q.customer_name}</span>
              <span style={{ color: 'var(--text3)' }}>{(q.line_items || []).length} items · {fmtL(q.grand_total)}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, alignSelf: 'center', color: '#2563eb' }}>
            Combined: {fmtL(totalValue)}
          </div>
        </div>

        {/* Scrollable items table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ background: 'var(--hover)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text3)', width: 30 }}>#</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text3)' }}>PRODUCT / DESCRIPTION</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text3)', width: 42 }}>QTY</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text3)', width: 48 }}>UNIT</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: 'var(--text3)', width: 80 }}>UNIT PRICE</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: 'var(--text3)', width: 50 }}>DISC%</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: 'var(--text3)', width: 80 }}>AMOUNT</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#2563eb', width: 90 }}>FROM</th>
              </tr>
            </thead>
            <tbody>
              {allItems.map((li, i) => {
                const qty  = parseFloat(li.quantity)   || 0;
                const rate = parseFloat(li.unit_price) || 0;
                const disc = parseFloat(li.discount_pct) || 0;
                const amt  = qty * rate * (1 - disc / 100);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text3)', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 600 }}>{li.product_name || '—'}</div>
                      {li.specifications && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{li.specifications}</div>}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{qty > 0 ? qty : '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>{li.unit || '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{rate > 0 ? fmt(rate) : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: disc > 0 ? '#d97706' : 'var(--text3)' }}>{disc > 0 ? `${disc}%` : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--mono)' }}>{amt > 0 ? fmt(amt) : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 10, background: 'rgba(37,99,235,0.1)', color: '#2563eb', borderRadius: 4, padding: '2px 6px', fontWeight: 600, fontFamily: 'var(--mono)' }}>{li._from}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {allItems.length} items · Customer: <strong style={{ color: 'var(--text)' }}>{base.customer_name || '—'}</strong>
          </div>
          {error && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '5px 10px', fontSize: 11 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: '7px 14px', background: 'var(--hover)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Cancel
            </button>
            <button onClick={handleSaveDraft} disabled={saving}
              style={{ padding: '7px 16px', background: 'var(--hover)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.4)', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: saving ? 0.6 : 1 }}>
              {saving ? '⏳ Saving…' : '📋 Save as Draft'}
            </button>
            <button onClick={handleOpenEditor}
              style={{ padding: '8px 18px', background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              ✏️ Open in Editor →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Deal Score Badge ──────────────────────────────────────────────────────────
function DealScoreBadge({ margin, status }) {
  if (status === 'WON')  return <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>● Won</span>;
  if (status === 'LOST') return <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>● Lost</span>;
  if (margin >= 18) return <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>● Good</span>;
  if (margin >= 14) return <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>● At Risk</span>;
  return <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>● Critical</span>;
}

// ── Win/Loss Reason Modal ─────────────────────────────────────────────────────
function WinLossReasonModal({ status, quote, onConfirm, onClose }) {
  const isLost = status === 'LOST';
  const [reason,      setReason]      = useState('Price too high');
  const [competitor,  setCompetitor]  = useState('');
  const [notes,       setNotes]       = useState('');
  const [clinched,    setClinched]    = useState('');

  const LOST_REASONS = ['Price too high', 'Competitor won', 'Budget constraint', 'Bad timing', 'No response', 'Scope mismatch', 'Other'];

  const handleConfirm = () => {
    let tag = '';
    if (isLost) {
      tag = `[LOST: ${reason}${competitor.trim() ? ` · Competitor: ${competitor.trim()}` : ''}]`;
    } else {
      tag = clinched.trim() ? `[WON: ${clinched.trim()}]` : '[WON]';
    }
    const existingNotes = (quote.notes || '').replace(/\[(?:LOST|WON)[^\]]*\]\s*/g, '').trim();
    const combined = [tag, existingNotes, notes.trim()].filter(Boolean).join('\n');
    onConfirm(combined);
  };

  return (
    <div className="qb-modal-overlay">
      <div style={{ background: 'var(--card)', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.35)', overflow: 'hidden' }}>
        <div style={{ background: isLost ? 'linear-gradient(135deg,#7f1d1d,#b91c1c)' : 'linear-gradient(135deg,#14532d,#16a34a)', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>{isLost ? '📉 Mark as Lost' : '🏆 Mark as Won'}</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 2 }}>{quote.quote_number} · {quote.customer_name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLost ? (
            <>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 6 }}>Reason for Loss *</label>
                <select className="qb-sel" value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
                  {LOST_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 6 }}>Competitor Name (if known)</label>
                <input className="qb-input" value={competitor} onChange={e => setCompetitor(e.target.value)} placeholder="e.g. ABC Aluminium, Market price" />
              </div>
            </>
          ) : (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 6 }}>What clinched the deal? (optional)</label>
              <input className="qb-input" value={clinched} onChange={e => setClinched(e.target.value)} placeholder="e.g. Price, delivery time, relationship, product quality…" />
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .7, display: 'block', marginBottom: 6 }}>Additional Notes</label>
            <textarea className="qb-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any extra context…" style={{ resize: 'vertical', fontFamily: 'inherit', minHeight: 56 }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="qb-cancel-btn" onClick={onClose}>Cancel</button>
            <button className="qb-save-btn" onClick={handleConfirm}
              style={{ background: isLost ? 'linear-gradient(135deg,#7f1d1d,#b91c1c)' : 'linear-gradient(135deg,#14532d,#16a34a)' }}>
              {isLost ? '📉 Confirm Loss' : '🏆 Confirm Win'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Kanban View ───────────────────────────────────────────────────────
const KANBAN_COLS = [
  { key: 'DRAFT',       label: 'Draft',       color: '#6b7280', bg: '#f3f4f6' },
  { key: 'SENT',        label: 'Sent',         color: '#2563eb', bg: '#dbeafe' },
  { key: 'NEGOTIATING', label: 'Negotiating',  color: '#d97706', bg: '#fef3c7' },
  { key: 'WON',         label: 'Won',          color: '#16a34a', bg: '#dcfce7' },
  { key: 'LOST',        label: 'Lost',         color: '#dc2626', bg: '#fee2e2' },
];

function PipelineKanbanView({ quotes, onView, onClone }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, minHeight: 300 }}>
      {KANBAN_COLS.map(col => {
        const cards = quotes.filter(q => q.status === col.key);
        const colTotal = cards.reduce((s, q) => s + (parseFloat(q.total || q.grand_total) || 0), 0);
        return (
          <div key={col.key} style={{ minWidth: 220, flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Column header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: col.bg, borderRadius: '8px 8px 0 0', border: `1px solid ${col.color}30`, borderBottom: `2px solid ${col.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 12, color: col.color }}>{col.label}</span>
                <span style={{ background: col.color, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{cards.length}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: col.color }}>{fmtL(colTotal)}</span>
            </div>
            {/* Cards */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', background: 'var(--hover)', borderRadius: '0 0 8px 8px', border: `1px solid ${col.color}20`, borderTop: 'none', paddingInline: 8, minHeight: 80 }}>
              {cards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--text3)', fontSize: 12 }}>No quotes</div>
              ) : cards.map(q => {
                const daysLeft = q.valid_till ? Math.ceil((new Date(q.valid_till) - new Date()) / 86400000) : null;
                return (
                  <div key={q.quote_id} onClick={() => onView(q)}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', transition: 'box-shadow .15s' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.12)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--brand)', fontFamily: 'var(--mono)', marginBottom: 3 }}>{q.quote_number}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.customer_name}</div>
                    {q.project_name && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.project_name}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtL(q.total || q.grand_total)}</span>
                      <DealScoreBadge margin={q.avg_margin_pct || 0} status={q.status} />
                    </div>
                    <MarginBar pct={q.avg_margin_pct || 0} />
                    {daysLeft !== null && (col.key === 'SENT' || col.key === 'NEGOTIATING') && (
                      <div style={{ fontSize: 10, marginTop: 5, color: daysLeft < 3 ? 'var(--red)' : daysLeft < 7 ? 'var(--amber)' : 'var(--text3)' }}>
                        {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                      <button className="qb-view-btn" style={{ flex: 1, padding: '3px 0', fontSize: 11 }} onClick={() => onView(q)}>View →</button>
                      <button className="qb-view-btn" style={{ fontSize: 11, padding: '3px 8px' }} title="Clone" onClick={() => onClone(q)}>⧉</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Product File Lookup Modal ──────────────────────────────────────────────────
function ProductFileLookupModal({ onClose, onAddLines }) {
  const [files,       setFiles]       = useState([]);
  const [selFile,     setSelFile]     = useState('');
  const [categories,  setCats]        = useState([]);
  const [selCat,      setSelCat]      = useState('');
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState({});
  const [reqText,     setReqText]     = useState('');
  const [reqLoading,  setReqLoading]  = useState(false);
  const [uploadFile,  setUploadFile]  = useState(null);
  const [uploading,   setUploading]   = useState(false);
  const [uploadMsg,   setUploadMsg]   = useState('');
  const [mode,        setMode]        = useState('search');
  const [smartFields, setSmartFields] = useState({ item_code:'', category:'', size:'', finish:'', mrp_min:'', mrp_max:'' });
  const fileRef = React.useRef();

  React.useEffect(() => {
    fetch('/api/product-files').then(r => r.json()).then(d => {
      const loaded = (d.files || []).filter(f => f.count > 0);
      setFiles(loaded);
      if (loaded.length) setSelFile(loaded[0].filename);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!selFile) return;
    fetch('/api/product-files/categories?file=' + encodeURIComponent(selFile)).then(r => r.json()).then(d => {
      setCats(d.categories || []); setSelCat('');
    }).catch(() => {});
  }, [selFile]);

  const doSearch = async () => {
    setLoading(true); setResults([]); setSelected({});
    try {
      const p = new URLSearchParams({ q: query, limit: 60 });
      if (selFile) p.set('file', selFile);
      if (selCat)  p.set('category', selCat);
      const d = await fetch('/api/product-files/search?' + p).then(r => r.json());
      setResults(d.results || []);
    } catch {}
    finally { setLoading(false); }
  };

  const doSmartMatch = async () => {
    setLoading(true); setResults([]); setSelected({});
    try {
      const body = { ...smartFields, query, limit: 60, ai: true };
      const d = await fetch('/api/product-files/smart-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json());
      const TIER = { exact: 'Exact Match', strong: 'Strong Match', near: 'Near Match' };
      const combined = Object.entries(TIER).flatMap(([key, label]) =>
        (d[key] || []).map(r => ({ ...r, _tier: label }))
      );
      setResults(combined);
    } catch {}
    finally { setLoading(false); }
  };

  const buildFromReq = async () => {
    if (!reqText.trim()) return;
    setReqLoading(true); setResults([]); setSelected({});
    try {
      const d = await fetch('/api/product-files/ai-build-quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement: reqText }),
      }).then(r => r.json());
      const items = d.line_items || [];
      setResults(items);
      const auto = {}; items.forEach((_, i) => { auto[i] = items[i].quantity || 1; });
      setSelected(auto);
    } catch {}
    finally { setReqLoading(false); }
  };

  const doUpload = async () => {
    if (!uploadFile) return;
    setUploading(true); setUploadMsg('');
    try {
      const fd = new FormData(); fd.append('file', uploadFile);
      const d = await fetch('/api/product-files/upload', { method: 'POST', body: fd }).then(r => r.json());
      setUploadMsg('Loaded ' + d.count + ' products from ' + d.filename);
      setFiles(prev => [...prev.filter(x => x.filename !== d.filename), { filename: d.filename, count: d.count }]);
      setSelFile(d.filename); setUploadFile(null);
    } catch { setUploadMsg('Upload failed'); }
    finally { setUploading(false); }
  };

  const toggleRow = (i) => setSelected(s => ({ ...s, [i]: s[i] !== undefined ? undefined : (results[i]?.quantity || 1) }));
  const allSel    = results.length > 0 && results.every((_, i) => selected[i] !== undefined);
  const toggleAll = () => { if (allSel) setSelected({}); else { const a = {}; results.forEach((_, i) => { a[i] = results[i]?.quantity || 1; }); setSelected(a); } };
  const selCount  = Object.values(selected).filter(v => v !== undefined).length;

  const addSelected = () => {
    const lines = Object.entries(selected).filter(([, qty]) => qty !== undefined).map(([i, qty]) => {
      const r = results[Number(i)];
      return {
        product_id:     r.item_code || '',
        product_name:   r.item_name || r.product_name || '',
        category:       r.category || '',
        brand:          r.brand || '',
        unit:           r.unit || 'Nos',
        quantity:       Number(qty) || 1,
        unit_price:     parseFloat(String(r.mrp || r.unit_price || 0).replace(/[^0-9.]/g, '')) || 0,
        buy_price:      0,
        discount_pct:   0,
        hsn_code:       r.hsn_code || '',
        specifications: [r.size, r.finish].filter(Boolean).join(' / '),
      };
    });
    if (lines.length) onAddLines(lines);
    onClose();
  };

  const S = { background: 'var(--input, var(--bg))', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', width: '100%', boxSizing: 'border-box' };
  const TIER_COLOR = { 'Exact Match': '#16a34a', 'Strong Match': '#2563eb', 'Near Match': '#d97706' };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }} onClick={onClose}>
      <div style={{ background:'var(--card)',borderRadius:12,boxShadow:'0 20px 60px rgba(0,0,0,.4)',width:'100%',maxWidth:960,maxHeight:'93vh',display:'flex',flexDirection:'column' }} onClick={e => e.stopPropagation()}>

        <div style={{ padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:800,fontSize:15 }}>Product File Lookup</div>
            <div style={{ fontSize:11,color:'var(--text2)',marginTop:2 }}>
              Search Ebco ({files.find(f=>f.filename.includes('Ebco'))?.count||0} products), Sanjay Hardware and any uploaded files — match by code, name, size, finish, MRP or describe in plain text.
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(220,38,38,0.1)',border:'1px solid rgba(220,38,38,0.3)',color:'#dc2626',borderRadius:7,padding:'5px 12px',cursor:'pointer',fontWeight:700 }}>Close</button>
        </div>

        <div style={{ flex:1,overflowY:'auto',padding:18 }}>
          <div style={{ display:'flex',gap:6,marginBottom:16,flexWrap:'wrap' }}>
            {[['search','Search by Name / Code'],['smart','Smart Match (any field)'],['ai','AI: Describe Requirement'],['upload','Upload New File']].map(([m,lbl]) => (
              <button key={m} onClick={() => setMode(m)} style={{ fontSize:11,fontWeight:700,padding:'5px 14px',borderRadius:20,cursor:'pointer',border:'1.5px solid var(--border)',background:mode===m?'rgba(37,99,235,0.1)':'transparent',color:mode===m?'#2563eb':'var(--text2)' }}>{lbl}</button>
            ))}
          </div>

          {mode === 'search' && (
            <>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:10,marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:10,color:'var(--text2)',fontWeight:600,marginBottom:4 }}>FILE</div>
                  <select style={S} value={selFile} onChange={e => setSelFile(e.target.value)}>
                    <option value="">All files ({files.reduce((s,f)=>s+f.count,0)} products)</option>
                    {files.map(f => <option key={f.filename} value={f.filename}>{f.filename} ({f.count})</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:10,color:'var(--text2)',fontWeight:600,marginBottom:4 }}>CATEGORY</div>
                  <select style={S} value={selCat} onChange={e => setSelCat(e.target.value)}>
                    <option value="">All categories</option>
                    {categories.map(c => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
                  </select>
                </div>
                <div style={{ display:'flex',alignItems:'flex-end' }}>
                  <button onClick={doSearch} disabled={loading} style={{ background:'linear-gradient(135deg,#2563eb,#1d4ed8)',color:'#fff',border:'none',borderRadius:8,padding:'7px 18px',fontSize:12,cursor:'pointer',fontWeight:700,opacity:loading?0.6:1 }}>
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
              <input style={{ ...S, marginBottom:12 }} placeholder="Item code (e.g. BMDS40), item name, or keyword..."
                value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key==='Enter' && doSearch()} />
            </>
          )}

          {mode === 'smart' && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,color:'var(--text2)',marginBottom:8 }}>
                Fill any fields you know — item code, size, finish, MRP range. AI finds exact and nearest matches even without the product name.
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:10 }}>
                {[['item_code','Item Code'],['category','Category'],['size','Size (e.g. 400mm)'],['finish','Finish (e.g. Chrome)'],['mrp_min','Min MRP (Rs.)'],['mrp_max','Max MRP (Rs.)']].map(([k,ph]) => (
                  <div key={k}>
                    <div style={{ fontSize:10,color:'var(--text2)',fontWeight:600,marginBottom:4 }}>{ph.toUpperCase()}</div>
                    <input style={S} placeholder={ph} value={smartFields[k]||''} onChange={e => setSmartFields(f => ({...f,[k]:e.target.value}))} />
                  </div>
                ))}
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <input style={{ ...S,flex:1 }} placeholder="Optional: describe in plain text too..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key==='Enter' && doSmartMatch()} />
                <button onClick={doSmartMatch} disabled={loading} style={{ background:'linear-gradient(135deg,#7c3aed,#6d28d9)',color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontSize:12,cursor:'pointer',fontWeight:700,opacity:loading?0.6:1,whiteSpace:'nowrap' }}>
                  {loading ? 'Matching...' : 'Smart Match'}
                </button>
              </div>
            </div>
          )}

          {mode === 'ai' && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,color:'var(--text2)',marginBottom:6 }}>Describe what you need in plain language. AI extracts items and finds matches automatically.</div>
              <textarea style={{ ...S, height:90, resize:'vertical' }}
                placeholder={'Examples:\n"Soft-close hinges for 10-door kitchen, full overlay"\n"Jaquar CP fittings for 3 bathrooms, standard range"\n"Drawer slides 400mm and 500mm, 20 pairs each"'}
                value={reqText} onChange={e => setReqText(e.target.value)} />
              <button onClick={buildFromReq} disabled={reqLoading || !reqText.trim()}
                style={{ background:'linear-gradient(135deg,#2563eb,#1d4ed8)',color:'#fff',border:'none',borderRadius:8,padding:'8px 20px',fontSize:12,cursor:'pointer',fontWeight:700,marginTop:8,opacity:(reqLoading||!reqText.trim())?0.5:1 }}>
                {reqLoading ? 'AI Working...' : 'Build Product List with AI'}
              </button>
            </div>
          )}

          {mode === 'upload' && (
            <div style={{ marginBottom:14,background:'var(--bg)',border:'1px dashed var(--border)',borderRadius:10,padding:16 }}>
              <div style={{ fontWeight:700,marginBottom:6 }}>Upload Product File (CSV or XLSX)</div>
              <div style={{ fontSize:11,color:'var(--text2)',marginBottom:10 }}>Auto-detected columns: Item Code, Item Name, Category, Size, Finish, PCS/Set, SPU, MRP, HSN Code, Brand, Unit</div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }} onChange={e => setUploadFile(e.target.files[0])} />
              <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                <button onClick={() => fileRef.current.click()} style={{ background:'rgba(37,99,235,0.1)',color:'#2563eb',border:'1px solid rgba(37,99,235,0.3)',borderRadius:8,padding:'7px 16px',fontSize:12,cursor:'pointer',fontWeight:700 }}>Choose File</button>
                {uploadFile && <span style={{ fontSize:12,color:'var(--text2)' }}>{uploadFile.name}</span>}
                {uploadFile && <button onClick={doUpload} disabled={uploading} style={{ background:'linear-gradient(135deg,#059669,#10b981)',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontSize:12,cursor:'pointer',fontWeight:700 }}>{uploading?'Uploading...':'Upload'}</button>}
              </div>
              {uploadMsg && <div style={{ marginTop:8,fontSize:12,color:uploadMsg.startsWith('Loaded')?'#16a34a':'#dc2626',fontWeight:600 }}>{uploadMsg}</div>}
            </div>
          )}

          {results.length > 0 && (
            <>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
                <div style={{ fontSize:12,fontWeight:700 }}>{results.length} product{results.length!==1?'s':''} found</div>
                <div style={{ display:'flex',gap:8 }}>
                  <button onClick={toggleAll} style={{ fontSize:11,padding:'4px 12px',borderRadius:20,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',fontWeight:600 }}>
                    {allSel ? 'Deselect All' : 'Select All'}
                  </button>
                  {selCount > 0 && (
                    <button onClick={addSelected} style={{ background:'linear-gradient(135deg,#059669,#16a34a)',color:'#fff',border:'none',borderRadius:8,padding:'6px 18px',fontSize:12,cursor:'pointer',fontWeight:800 }}>
                      Add {selCount} to Quotation
                    </button>
                  )}
                </div>
              </div>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--bg)',borderBottom:'2px solid var(--border)' }}>
                    <th style={{ padding:'7px 8px',width:30 }}><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>
                    <th style={{ padding:'7px 8px',textAlign:'left',color:'var(--text2)',fontWeight:600,width:90 }}>Match</th>
                    <th style={{ padding:'7px 8px',textAlign:'left',color:'var(--text2)',fontWeight:600 }}>Item Code</th>
                    <th style={{ padding:'7px 8px',textAlign:'left',color:'var(--text2)',fontWeight:600 }}>Item Name</th>
                    <th style={{ padding:'7px 8px',textAlign:'left',color:'var(--text2)',fontWeight:600 }}>Category</th>
                    <th style={{ padding:'7px 8px',textAlign:'left',color:'var(--text2)',fontWeight:600 }}>Size</th>
                    <th style={{ padding:'7px 8px',textAlign:'left',color:'var(--text2)',fontWeight:600 }}>Finish</th>
                    <th style={{ padding:'7px 8px',textAlign:'center',color:'var(--text2)',fontWeight:600 }}>PCS/Set</th>
                    <th style={{ padding:'7px 8px',textAlign:'right',color:'var(--text2)',fontWeight:600 }}>MRP</th>
                    <th style={{ padding:'7px 8px',textAlign:'center',color:'var(--text2)',fontWeight:600 }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} onClick={() => toggleRow(i)} style={{ borderBottom:'1px solid var(--border)',cursor:'pointer',background:selected[i]!==undefined?'rgba(37,99,235,0.05)':'transparent' }}>
                      <td style={{ padding:'7px 8px' }}><input type="checkbox" checked={selected[i]!==undefined} onChange={()=>toggleRow(i)} onClick={e=>e.stopPropagation()} /></td>
                      <td style={{ padding:'7px 8px' }}>
                        {r._tier && <span style={{ fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:10,background:(TIER_COLOR[r._tier]||'#6b7280')+'18',color:TIER_COLOR[r._tier]||'#6b7280',border:'1px solid '+(TIER_COLOR[r._tier]||'#6b7280')+'30',whiteSpace:'nowrap' }}>{r._tier}</span>}
                      </td>
                      <td style={{ padding:'7px 8px',fontWeight:700,color:'#2563eb',fontFamily:'monospace',fontSize:11 }}>{r.item_code||'—'}</td>
                      <td style={{ padding:'7px 8px',fontWeight:600,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.item_name||r.product_name||'—'}</td>
                      <td style={{ padding:'7px 8px',color:'var(--text2)',fontSize:11 }}>{r.category||'—'}</td>
                      <td style={{ padding:'7px 8px',color:'var(--text2)',fontSize:11,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.size||'—'}</td>
                      <td style={{ padding:'7px 8px',color:'var(--text2)',fontSize:11 }}>{r.finish||'—'}</td>
                      <td style={{ padding:'7px 8px',textAlign:'center',color:'var(--text2)',fontSize:11 }}>{r['pcs_/_set']||r['pcs / set']||r.unit||'—'}</td>
                      <td style={{ padding:'7px 8px',textAlign:'right',fontWeight:700 }}>
                        {(r.mrp||r.unit_price) ? 'Rs.' + Number(String(r.mrp||r.unit_price||0).replace(/[^0-9.]/g,'')).toLocaleString('en-IN') : '—'}
                      </td>
                      <td style={{ padding:'7px 8px',textAlign:'center' }} onClick={e => e.stopPropagation()}>
                        {selected[i] !== undefined && (
                          <input type="number" min="1" value={selected[i]} onChange={e => setSelected(s => ({...s,[i]:Math.max(1,+e.target.value)}))}
                            style={{ width:50,padding:'2px 4px',border:'1px solid var(--border)',borderRadius:4,fontSize:12,textAlign:'center',background:'var(--bg)' }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selCount > 0 && (
                <div style={{ position:'sticky',bottom:0,padding:'10px 0',borderTop:'1px solid var(--border)',background:'var(--card)',display:'flex',justifyContent:'flex-end',gap:10,marginTop:12 }}>
                  <span style={{ fontSize:12,color:'var(--text2)',alignSelf:'center' }}>{selCount} item{selCount!==1?'s':''} selected</span>
                  <button onClick={addSelected} style={{ background:'linear-gradient(135deg,#059669,#16a34a)',color:'#fff',border:'none',borderRadius:9,padding:'10px 24px',fontSize:13,cursor:'pointer',fontWeight:800,boxShadow:'0 4px 12px rgba(5,150,105,0.4)' }}>
                    Add {selCount} Item{selCount!==1?'s':''} to Quotation
                  </button>
                </div>
              )}
            </>
          )}

          {results.length === 0 && !loading && !reqLoading && (mode === 'search' || mode === 'smart') && (
            <div style={{ textAlign:'center',padding:'28px 20px',color:'var(--text2)' }}>
              <div style={{ fontWeight:700,marginBottom:4 }}>{mode==='smart' ? 'Fill any field above and click Smart Match' : 'Enter a keyword or code and click Search'}</div>
              <div style={{ fontSize:12 }}>Files loaded: {files.map(f => f.filename + ' (' + f.count + ')').join(' / ') || 'None'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Image Product Search Modal ─────────────────────────────────────────────────
function ImageSearchModal({ onClose, onAddProduct }) {
  const [images,    setImages]   = useState([]); // [{file, preview, result, searching, error}]
  const [dragOver,  setDragOver] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const fileRef = useRef();

  const addImages = (fileList) => {
    const arr = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    if (!arr.length) return;
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => {
        setImages(prev => {
          if (prev.find(x => x.file.name === f.name && x.file.size === f.size)) return prev;
          return [...prev, { file: f, preview: e.target.result, result: null, searching: false, error: null, retryAfter: 0 }];
        });
      };
      reader.readAsDataURL(f);
    });
  };

  const removeImage = (i) => {
    setImages(prev => { const n = prev.filter((_, j) => j !== i); if (activeIdx >= n.length) setActiveIdx(Math.max(0, n.length - 1)); return n; });
  };

  const _tickRef = useRef({});  // holds per-image countdown interval IDs

  const searchOne = async (i) => {
    // Clear any existing countdown timer for this slot
    if (_tickRef.current[i]) { clearInterval(_tickRef.current[i]); delete _tickRef.current[i]; }

    setImages(prev => prev.map((x, j) => j === i ? { ...x, searching: true, error: null, retryAfter: 0 } : x));
    try {
      const fd = new FormData();
      fd.append('file', images[i].file);
      const r = await fetch('/api/catalog/visual-search', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const d = await r.json();

      if (d.error === 'rate_limit') {
        // Backend hit rate limit even after its internal retry — show countdown + auto-retry
        const secs = d.retry_after || 45;
        setImages(prev => prev.map((x, j) => j === i ? { ...x, error: 'rate_limit', retryAfter: secs, searching: false } : x));
        let remaining = secs;
        _tickRef.current[i] = setInterval(() => {
          remaining--;
          setImages(prev => prev.map((x, j) => j === i ? { ...x, retryAfter: Math.max(0, remaining) } : x));
          if (remaining <= 0) {
            clearInterval(_tickRef.current[i]);
            delete _tickRef.current[i];
            searchOne(i);  // auto-retry
          }
        }, 1000);
      } else {
        setImages(prev => prev.map((x, j) => j === i
          ? { ...x, result: d.error ? null : d, error: d.error || null, retryAfter: 0, searching: false }
          : x));
      }
    } catch (e) {
      setImages(prev => prev.map((x, j) => j === i ? { ...x, error: e.message || 'Search failed', retryAfter: 0, searching: false } : x));
    }
  };

  const searchAll = () => images.forEach((_, i) => { if (!images[i].result && !images[i].searching) searchOne(i); });

  const handleSelect = (match) => {
    onAddProduct({
      product_id:     String(match.product_id),
      product_name:   match.name,
      category:       match.category,
      brand:          match.brand || '',
      unit:           match.unit,
      unit_price:     match.sell_price || 0,
      buy_price:      match.buy_price  || 0,
      quantity:       1,
      discount_pct:   0,
      specifications: match.reason || '',
      hsn_code:       '',
      line_type:      'product',
    });
    onClose();
  };

  const active = images[activeIdx];
  const allSearched = images.length > 0 && images.every(x => x.result || x.error);

  return (
    <div className="qb-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qb-modal" style={{ maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="qb-modal-header" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', borderTop: 'none', borderRadius: '12px 12px 0 0', flexShrink: 0 }}>
          <div>
            <div className="qb-modal-title" style={{ color: '#fff', fontSize: 15 }}>📷 Visual Product Search — Hardware & Sanitary</div>
            <div className="qb-modal-sub" style={{ color: 'rgba(255,255,255,.75)' }}>Upload {images.length > 1 ? `${images.length} images` : 'product photos'} — AI identifies & matches to catalog</div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left — image strip + upload */}
          <div style={{ width: 160, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg2)' }}>
            {/* Thumbnails */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {images.map((img, i) => (
                <div key={i} onClick={() => setActiveIdx(i)} style={{
                  position: 'relative', borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                  border: `2px solid ${activeIdx === i ? 'var(--brand)' : 'var(--border)'}`,
                  background: 'var(--bg3)', flexShrink: 0,
                }}>
                  <img src={img.preview} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
                    {img.result && <span style={{ background: '#16a34a', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>✓</span>}
                    {img.searching && <span style={{ background: 'var(--b2)', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 3 }}>...</span>}
                    {img.error && <span style={{ background: 'var(--red)', color: '#fff', fontSize: 9, padding: '1px 4px', borderRadius: 3 }}>✗</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeImage(i); }} style={{
                    position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,.55)', color: '#fff',
                    border: 'none', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontSize: 10, fontWeight: 700
                  }}>✕</button>
                </div>
              ))}
              {images.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 11, padding: '20px 8px', lineHeight: 1.5 }}>
                  Add product photos to search
                </div>
              )}
            </div>
            {/* Add photos button */}
            <div style={{ padding: '8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addImages(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 8, padding: '10px 6px', textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? 'var(--g5)' : 'transparent', transition: '.15s',
                }}>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => addImages(e.target.files)} />
                <div style={{ fontSize: 18, marginBottom: 3 }}>📷</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>+ Add Photos</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>JPG PNG WEBP</div>
              </div>
            </div>
          </div>

          {/* Right — current image + results */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {images.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, color: 'var(--text3)' }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>📷</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Drop product photos here</div>
                <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
                  Take photos of taps, showers, WC, handles, hinges, tiles — AI identifies the product and finds it in your catalog
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); addImages(e.dataTransfer.files); }}
                  onClick={() => fileRef.current?.click()}
                  style={{ marginTop: 20, padding: '12px 28px', background: 'var(--b2)', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none', transition: '.15s' }}>
                  📂 Browse Photos
                </div>
              </div>
            ) : active ? (
              <>
                {/* Image preview */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  <img src={active.preview} alt="" style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 8, objectFit: 'contain', display: 'block', margin: '0 auto', border: '1px solid var(--border)' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                    {!active.result && !active.searching && (
                      <button className="btn-primary" onClick={() => searchOne(activeIdx)}
                        style={{ height: 32, padding: '0 20px', fontSize: 12 }}>
                        🔍 Identify This Product
                      </button>
                    )}
                    {images.length > 1 && !allSearched && (
                      <button onClick={searchAll}
                        style={{ height: 32, padding: '0 16px', fontSize: 12, border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', cursor: 'pointer', fontWeight: 600, color: 'var(--text2)' }}>
                        🔍 Search All {images.length} Images
                      </button>
                    )}
                    {active.searching && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--b2)', fontWeight: 600 }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--b4)', borderTop: '2px solid var(--b2)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        Identifying product with AI…
                      </div>
                    )}
                  </div>
                </div>

                {/* Results panel */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                  {active.error && (() => {
                    const isRateLimit = active.error === 'rate_limit';
                    const isAuth = active.error.includes('API_KEY') || active.error.includes('Unauthorized');
                    const isTimeout = active.error.includes('timed out') || active.error.includes('Timeout');
                    const isServer = active.error.includes('Server error');
                    const isPhotoQuality = !isRateLimit && !isAuth && !isTimeout && !isServer;
                    return (
                      <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>
                        {isRateLimit ? (
                          <>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>⏳ OpenAI rate limit reached</div>
                            {active.retryAfter > 0 ? (
                              <div style={{ marginBottom: 8 }}>Auto-retrying in <strong>{active.retryAfter}s</strong>…
                                <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>
                                  (catalog has been optimised to avoid future rate limits)
                                </span>
                              </div>
                            ) : (
                              <div style={{ marginBottom: 8 }}>Retrying now…</div>
                            )}
                            <button
                              onClick={() => { setImages(prev => prev.map((x, j) => j === activeIdx ? { ...x, error: null, retryAfter: 0 } : x)); searchOne(activeIdx); }}
                              style={{ padding: '4px 14px', fontSize: 11, cursor: 'pointer', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', fontWeight: 700 }}>
                              ↺ Retry Now
                            </button>
                          </>
                        ) : (
                          <div>{active.error}{isPhotoQuality ? ' — try a clearer photo' : ''}</div>
                        )}
                      </div>
                    );
                  })()}
                  {active.result && (
                    <>
                      <div style={{ background: 'linear-gradient(135deg,var(--b3),var(--g3))', border: '1px solid var(--b4)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--b2)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 }}>🤖 AI Identified</div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{active.result.identified_product}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          {active.result.identified_category && (
                            <span style={{ fontSize: 10, background: 'var(--b3)', color: 'var(--b2)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{active.result.identified_category}</span>
                          )}
                          {active.result.identified_brand && (
                            <span style={{ fontSize: 10, background: 'var(--g3)', color: 'var(--green)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{active.result.identified_brand}</span>
                          )}
                        </div>
                      </div>

                      {active.result.matches?.length > 0 ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
                            Catalog Matches — click to add to quote
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {active.result.matches.map((m, mi) => {
                              const conf = m.confidence_pct || 0;
                              const confColor = conf >= 80 ? '#16a34a' : conf >= 55 ? '#d97706' : '#6b7280';
                              return (
                                <div key={m.product_id || mi} onClick={() => handleSelect(m)}
                                  style={{ padding: '11px 13px', borderRadius: 10, border: `1.5px solid var(--border)`, cursor: 'pointer', background: 'var(--surface)', transition: '.15s' }}
                                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = 'var(--g5)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 700, fontSize: 12 }}>{m.name}</div>
                                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{m.category}{m.brand ? ` · ${m.brand}` : ''}</div>
                                      {m.reason && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontStyle: 'italic', lineHeight: 1.4 }}>{m.reason}</div>}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--brand)' }}>₹{(m.sell_price || 0).toLocaleString('en-IN')}</div>
                                      <div style={{ fontSize: 9, color: 'var(--text3)' }}>per {m.unit}</div>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: confColor, marginTop: 2 }}>{conf}% match</div>
                                    </div>
                                  </div>
                                  <div style={{ marginTop: 6, height: 2, background: 'var(--bg3)', borderRadius: 2 }}>
                                    <div style={{ height: '100%', width: `${conf}%`, background: confColor, borderRadius: 2, transition: '.3s' }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 12 }}>
                          No catalog matches. Try uploading a clearer product photo.
                        </div>
                      )}
                    </>
                  )}
                  {!active.result && !active.searching && !active.error && (
                    <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text3)', fontSize: 12, lineHeight: 1.6 }}>
                      Click "Identify This Product" above to search the catalog for this item
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
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

// ── Hardware & Sanitary Industry Constants ────────────────────────────────────
const CUSTOMER_TYPES = [
  'Contractor', 'Plumber', 'Builder / Developer', 'Interior Designer',
  'Architect', 'Dealer / Retailer', 'End Consumer', 'Hotel / Hospitality',
  'Government / Institution', 'Corporate / Commercial',
];
const PAYMENT_TERMS = [
  '30% Advance + 60% on Delivery + 10% on Installation',
  '50% Advance + 50% on Delivery',
  '100% Advance',
  'Net 30 Days',
  'Net 45 Days',
  'Net 60 Days',
  'Letter of Credit (LC)',
  'As per Agreement',
];
const DELIVERY_TERMS = [
  'Door Delivery (Inclusive)',
  'Ex-Works — Store Pickup',
  'Door Delivery + Unloading Assistance',
  'Site Delivery with Installation',
  'FOR Destination',
  'As per PO',
];
const SCOPE_OPTIONS = [
  'Supply Only',
  'Supply + Delivery',
  'Supply + Installation',
  'Complete Fitout (Supply + Installation + Testing)',
  'AMC / Maintenance Only',
];
const WARRANTY_CLAUSES = [
  '1 Year Manufacturer Warranty — CP Fittings',
  '5 Years Manufacturer Warranty — Sanitary Ware (against manufacturing defects)',
  '1 Year CP Fittings + 5 Years Sanitary Ware',
  '2 Years on Hardware (Hinges, Channels, Locks)',
  'As per Manufacturer Warranty Card',
  'No Warranty (As-Is Supply)',
];
const VALIDITY_OPTS = [7, 14, 21, 30, 45, 60];
const ROOM_OPTIONS  = [
  'Master Bathroom', 'Guest Bathroom', 'Common Bathroom', "Kids' Bathroom",
  'Kitchen', 'Utility Area', 'Balcony / Terrace', 'Basement / Parking',
  'Common Area', 'All Areas',
];

// HSN codes & GST for hardware/sanitary categories
const HSN_MAP = {
  'CP Fittings — Taps & Mixers':       { hsn: '8481', gst: 18 },
  'CP Fittings — Showers & Overhead':  { hsn: '3922', gst: 18 },
  'CP Fittings — Accessories':         { hsn: '3922', gst: 18 },
  'Sanitary Ware — WC / EWC':         { hsn: '6910', gst: 18 },
  'Sanitary Ware — Wash Basin':        { hsn: '6910', gst: 18 },
  'Sanitary Ware — Bathtub / Jacuzzi': { hsn: '3922', gst: 18 },
  'Sanitary Ware — Urinal':            { hsn: '6910', gst: 18 },
  'Bathroom Accessories':              { hsn: '3922', gst: 18 },
  'Kitchen Fittings — Sink & Mixer':   { hsn: '8481', gst: 18 },
  'Hardware — Hinges & Channels':      { hsn: '8302', gst: 18 },
  'Hardware — Handles & Knobs':        { hsn: '8302', gst: 18 },
  'Hardware — Locks & Latches':        { hsn: '8301', gst: 18 },
  'Hardware — Drawer Systems':         { hsn: '8302', gst: 18 },
  'Plumbing — CPVC / PVC Pipes':       { hsn: '3917', gst: 18 },
  'Plumbing — GI / MS Pipes':          { hsn: '7306', gst: 18 },
  'Plumbing — Valves & Stop Cocks':    { hsn: '8481', gst: 18 },
  'Floor Drains & Floor Traps':        { hsn: '3922', gst: 18 },
  'Tiles & Stone':                     { hsn: '6907', gst: 18 },
  'Waterproofing':                     { hsn: '3214', gst: 18 },
  'Installation & Labour':             { hsn: '9954', gst: 18 },
  'AMC / Maintenance Services':        { hsn: '9987', gst: 18 },
  'Others':                            { hsn: '8302', gst: 18 },
};

const BRANDS_BY_CAT = {
  'CP Fittings — Taps & Mixers':      ['Jaquar', 'Grohe', 'Kohler', 'Hindware', 'Parryware', 'American Standard', 'TOTO', 'Roca', 'Cera', 'Marc', 'Usha Shriram', 'Oleanna', 'Essco'],
  'CP Fittings — Showers & Overhead': ['Jaquar', 'Grohe', 'Kohler', 'Hindware', 'American Standard', 'TOTO', 'Parryware'],
  'Sanitary Ware — WC / EWC':        ['Kohler', 'Hindware', 'Jaquar', 'Parryware', 'Cera', 'American Standard', 'TOTO', 'Roca', 'Somany'],
  'Sanitary Ware — Wash Basin':       ['Kohler', 'Hindware', 'Jaquar', 'Parryware', 'Cera', 'TOTO', 'Roca'],
  'Sanitary Ware — Bathtub / Jacuzzi':['Kohler', 'Hindware', 'Jaquar', 'American Standard', 'Cera'],
  'Kitchen Fittings — Sink & Mixer':  ['Franke', 'Kohler', 'Jaquar', 'Grohe', 'Hindware', 'Hafele', 'Faber'],
  'Hardware — Hinges & Channels':     ['Hettich', 'Blum', 'Hafele', 'Ebco', 'Godrej', 'Euro', 'Dorma', 'Assa Abloy', 'Sugatsune'],
  'Hardware — Handles & Knobs':       ['Hafele', 'Hettich', 'Godrej', 'Dorset', 'Ebco', 'Sugatsune', 'Häfele'],
  'Hardware — Locks & Latches':       ['Godrej', 'Yale', 'Dorset', 'Assa Abloy', 'Dorma', 'Ozone', 'Samsung'],
  'Hardware — Drawer Systems':        ['Hettich', 'Blum', 'Hafele', 'Ebco', 'GTV'],
  'Tiles & Stone':                    ['Kajaria', 'Somany', 'Johnson', 'Asian Granito', 'RAK', 'Simpolo', 'Nitco', 'Orientbell', 'Pgvt'],
  'Plumbing — CPVC / PVC Pipes':      ['Astral', 'Supreme', 'Finolex', 'Wavin', 'Prince', 'Ashirvad'],
};

// ── Quote Variants / Pricing Tiers ────────────────────────────────────────────
const QUOTE_VARIANTS = [
  { key: 'economy',  label: 'Economy',  mult: 0.82, color: '#16a34a', icon: '💚', desc: 'Indian economy brands — Essco, Parryware entry, Ebco, Prince pipes' },
  { key: 'standard', label: 'Standard', mult: 1.00, color: '#2563eb', icon: '🔵', desc: 'Mid-segment — Jaquar Florentine, Hindware, Hettich, Astral' },
  { key: 'premium',  label: 'Premium',  mult: 1.45, color: '#7c3aed', icon: '💜', desc: 'Top Indian + entry European — Jaquar Artize, Kohler, Grohe Eurosmart, Hafele' },
  { key: 'luxury',   label: 'Luxury',   mult: 2.20, color: '#b45309', icon: '🏆', desc: 'Full European/Japanese — Grohe Allure, TOTO, Duravit, Blum' },
];

// ── T&C Template Library ───────────────────────────────────────────────────────
const TC_TEMPLATES = {
  standard: {
    label: 'Standard Hardware & Sanitary Supply',
    text: `1. Prices are valid for the validity period mentioned; subject to change without notice thereafter.
2. GST extra as applicable at the time of billing.
3. Material claims for breakage/damage must be reported within 48 hours of delivery with photographic evidence.
4. Warranty as per manufacturer terms — warranty cards provided with delivery.
5. Installation by authorized plumbers/technicians only; improper installation voids warranty.
6. Payment as per agreed terms; delayed payments attract 18% p.a. interest.
7. Goods once supplied cannot be returned unless found defective at time of delivery.
8. Subject to Bangalore jurisdiction only.`,
  },
  builder: {
    label: 'Builder / Developer (Bulk Supply)',
    text: `1. Bulk pricing applicable for the quantity specified; any reduction in quantity voids rate agreement.
2. GST extra. TDS deduction (if applicable) to be notified before invoicing.
3. Prices valid for 30 days; re-pricing required post validity for subsequent batches.
4. Material delivery in mutually agreed batches — site storage responsibility of buyer.
5. Claims for damages/shortages within 24 hours of delivery with joint inspection report.
6. Payment: 30% advance before dispatch; 60% on delivery; 10% within 15 days of installation completion.
7. Warranty: Manufacturer warranty only — no supplier warranty beyond manufacturer terms.
8. Disputes subject to Bangalore jurisdiction. Force majeure as per standard clause.`,
  },
  contractor: {
    label: 'Contractor / Plumber Rate Terms',
    text: `1. Contractor pricing applicable — not for resale at quoted rates.
2. GST as per prevailing rates at time of billing.
3. Material damage/shortage claims within 48 hours of delivery.
4. Returns accepted only for manufacturing defects within 7 days of delivery with original packaging.
5. Warranty cards to be handed over to end customer; contractor responsible for installation.
6. Credit extended to approved contractors only — new contractors: cash/advance basis.
7. Outstanding invoices attract 18% p.a. from due date.
8. Jurisdiction: Bangalore courts.`,
  },
  endconsumer: {
    label: 'End Consumer / Retail',
    text: `1. Prices include delivery to site address mentioned; extra charges for upper floors/remote areas.
2. GST included in quoted price (GST invoice provided).
3. Please inspect all items at time of delivery — no claims for visible damage thereafter.
4. Manufacturer warranty as per warranty card — installation must be done by licensed plumber.
5. No returns/exchanges after 48 hours of delivery unless manufacturing defect.
6. Payment: Full advance / as mutually agreed.
7. For installation service enquiries, contact our service desk.`,
  },
  hospitality: {
    label: 'Hotel / Hospitality Project',
    text: `1. Prices quoted for the project scope mentioned; changes in scope require revised quotation.
2. GST extra. Procurement through official PO only.
3. All materials to comply with hotel/brand standards specified by client.
4. Site delivery with unloading assistance included.
5. Brand-approved installation teams mandatory for warranty to be valid.
6. Snag list to be resolved within 72 hours of final inspection.
7. Retention of 5% against defect liability period of 12 months.
8. Disputes subject to jurisdiction as per contract agreement.`,
  },
};

// ── Quick-Add Product Bundles ──────────────────────────────────────────────────
const PRODUCT_BUNDLES = [
  {
    id: 'master_bath_std',
    label: '🛁 Master Bathroom — Standard',
    desc: 'Basin mixer + overhead shower + health faucet + WC + accessories',
    items: [
      { product_name: 'Single Lever Basin Mixer — Chrome', category: 'CP Fittings — Taps & Mixers', brand: 'Jaquar', quantity: 1, unit: 'Nos', unit_price: 4500, hsn_code: '8481', line_type: 'product', specifications: 'Florentine series, 35mm cartridge' },
      { product_name: 'Overhead Shower 6" Round with SS Arm', category: 'CP Fittings — Showers & Overhead', brand: 'Jaquar', quantity: 1, unit: 'Set', unit_price: 2800, hsn_code: '8481', line_type: 'product', specifications: 'ABS showerhead, SS arm 450mm' },
      { product_name: 'Health Faucet Set with Holder & Hose', category: 'CP Fittings — Accessories', brand: 'Jaquar', quantity: 1, unit: 'Set', unit_price: 750, hsn_code: '8481', line_type: 'product', specifications: '1.2m flexible hose, ABS body, chrome' },
      { product_name: 'Wall-Hung EWC with Soft-Close Seat', category: 'Sanitary Ware — WC / EWC', brand: 'Hindware', quantity: 1, unit: 'Set', unit_price: 12500, hsn_code: '6910', line_type: 'product', specifications: 'Dual flush 3/6L, concealed cistern' },
      { product_name: 'Bathroom Accessories Set 5-Piece', category: 'Bathroom Accessories', brand: 'Jaquar', quantity: 1, unit: 'Set', unit_price: 2200, hsn_code: '3922', line_type: 'product', specifications: 'Towel bar 24" + ring + hook + soap dish + TP holder, chrome' },
    ],
    room: 'Master Bathroom',
  },
  {
    id: 'guest_bath_eco',
    label: '🚿 Guest Bathroom — Economy',
    desc: 'Bib cock + health faucet + WC + accessories',
    items: [
      { product_name: 'Bib Cock — Chrome', category: 'CP Fittings — Taps & Mixers', brand: 'Jaquar Essco', quantity: 1, unit: 'Nos', unit_price: 850, hsn_code: '8481', line_type: 'product', specifications: 'Wall-mounted, 15mm' },
      { product_name: 'Health Faucet with Holder', category: 'CP Fittings — Accessories', brand: 'Jaquar Essco', quantity: 1, unit: 'Set', unit_price: 380, hsn_code: '8481', line_type: 'product', specifications: 'Chrome, ABS body' },
      { product_name: 'Two-Piece WC with Seat Cover', category: 'Sanitary Ware — WC / EWC', brand: 'Parryware', quantity: 1, unit: 'Set', unit_price: 4800, hsn_code: '6910', line_type: 'product', specifications: 'S-trap, 6L flush, white' },
      { product_name: 'Towel Ring + Soap Dish — Chrome', category: 'Bathroom Accessories', brand: '', quantity: 1, unit: 'Set', unit_price: 650, hsn_code: '3922', line_type: 'product', specifications: 'Wall-mounted, chrome finish' },
    ],
    room: 'Guest Bathroom',
  },
  {
    id: 'kitchen_std',
    label: '🍳 Kitchen Fitting — Standard',
    desc: 'Kitchen sink + mixer tap + soap dispenser',
    items: [
      { product_name: 'SS Kitchen Sink 1.5 Bowl', category: 'Kitchen Fittings — Sink & Mixer', brand: 'Franke', quantity: 1, unit: 'Nos', unit_price: 8500, hsn_code: '7324', line_type: 'product', specifications: '304 SS, sound deadening, drain basket included' },
      { product_name: 'Kitchen Sink Mixer — Pull-Out', category: 'Kitchen Fittings — Sink & Mixer', brand: 'Jaquar', quantity: 1, unit: 'Nos', unit_price: 5200, hsn_code: '8481', line_type: 'product', specifications: 'Single lever, pull-out spray, chrome' },
      { product_name: 'Liquid Soap Dispenser', category: 'Bathroom Accessories', brand: '', quantity: 1, unit: 'Nos', unit_price: 450, hsn_code: '3922', line_type: 'product', specifications: '300ml, chrome, wall-mounted' },
    ],
    room: 'Kitchen',
  },
  {
    id: 'hardware_kitchen',
    label: '⚙️ Kitchen Hardware Package',
    desc: 'Soft-close hinges + channels + handles (per 10ft kitchen)',
    items: [
      { product_name: 'Soft-Close Hinge (Clip-Top)', category: 'Hardware — Hinges & Channels', brand: 'Hettich', quantity: 20, unit: 'Nos', unit_price: 220, hsn_code: '8302', line_type: 'product', specifications: '110° full overlay, clip-top' },
      { product_name: 'Soft-Close Drawer Channel 18"', category: 'Hardware — Drawer Systems', brand: 'Hettich', quantity: 8, unit: 'Pair', unit_price: 580, hsn_code: '8302', line_type: 'product', specifications: 'Full extension, undermount soft-close' },
      { product_name: 'Bar Handle SS 160mm', category: 'Hardware — Handles & Knobs', brand: 'Häfele', quantity: 15, unit: 'Nos', unit_price: 280, hsn_code: '8302', line_type: 'product', specifications: 'Stainless steel, 160mm C-C' },
    ],
    room: 'Kitchen',
  },
  {
    id: 'complete_bathroom_prm',
    label: '✨ Complete Bathroom — Premium',
    desc: 'Premium CP + basin + WC + shower enclosure + accessories',
    items: [
      { product_name: 'Single Lever Basin Mixer — PVD Gold', category: 'CP Fittings — Taps & Mixers', brand: 'Grohe', quantity: 1, unit: 'Nos', unit_price: 9500, hsn_code: '8481', line_type: 'product', specifications: 'Eurosmart Cosmopolitan, PVD Gold' },
      { product_name: 'Overhead Shower System 300mm', category: 'CP Fittings — Showers & Overhead', brand: 'Grohe', quantity: 1, unit: 'Set', unit_price: 14500, hsn_code: '8481', line_type: 'product', specifications: '300mm rain shower + thermostatic mixer' },
      { product_name: 'Counter-Top Wash Basin', category: 'Sanitary Ware — Wash Basin', brand: 'Kohler', quantity: 1, unit: 'Nos', unit_price: 6800, hsn_code: '6910', line_type: 'product', specifications: 'White, counter-top, semi-recessed' },
      { product_name: 'One-Piece EWC with Soft-Close Seat', category: 'Sanitary Ware — WC / EWC', brand: 'Kohler', quantity: 1, unit: 'Set', unit_price: 18000, hsn_code: '6910', line_type: 'product', specifications: 'One-piece, dual flush, soft-close seat' },
      { product_name: 'Shower Enclosure 900×900mm', category: 'Bathroom Accessories', brand: '', quantity: 1, unit: 'Nos', unit_price: 15000, hsn_code: '3922', line_type: 'product', specifications: '8mm toughened glass, chrome frame, sliding door' },
      { product_name: 'Premium Accessories Set 6-Piece', category: 'Bathroom Accessories', brand: 'Grohe', quantity: 1, unit: 'Set', unit_price: 6500, hsn_code: '3922', line_type: 'product', specifications: 'PVD Gold — towel bar 600mm + ring + 2 hooks + soap holder + TP holder' },
    ],
    room: 'Master Bathroom',
  },
];

// Standard T&C for hardware & sanitary industry (default)
const HC_TC = TC_TEMPLATES.standard.text;

const BLANK_LINE = {
  product_id: '', product_name: '', category: '', brand: '', room: '',
  quantity: 1, unit: 'Nos', unit_price: 0, discount_pct: 0, buy_price: 0,
  specifications: '', hsn_code: '', line_type: 'product',
};
const BLANK_FORM = {
  customer_name: '', customer_type: 'Contractor', contact_person: '', contact_phone: '',
  contact_email: '', gst_number: '', billing_address: '', site_location: '', project_name: '',
  architect_name: '', no_of_units: '', no_of_bathrooms: '',
  po_reference: '',      // Customer's Purchase Order number (mandatory in Indian B2B)
  challan_number: '',    // Delivery Challan number (separate from tax invoice in India)
  scope_of_work: 'Supply + Delivery',
  payment_terms: '30% Advance + 60% on Delivery + 10% on Installation',
  delivery_terms: 'Door Delivery (Inclusive)',
  warranty_clause: '1 Year CP Fittings + 5 Years Sanitary Ware',
  validity_days: 14, notes: '', gst_rate: 18,
  include_freight: false, freight_amount: 0,
  include_installation: false, installation_amount: 0,
  include_amc: false, amc_amount: 0, amc_years: 1,
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
function QuoteRow({ q, onView, onEdit, onAskAI, onClone, isSelected, onToggleSelect }) {
  const isExpiring = q.status === 'SENT' || q.status === 'NEGOTIATING';
  const daysLeft   = q.valid_till ? Math.ceil((new Date(q.valid_till) - new Date()) / 86400000) : null;

  // Parse follow-up date from notes field  [FOLLOWUP: YYYY-MM-DD]
  const followupMatch = (q.notes || '').match(/\[FOLLOWUP:\s*(\d{4}-\d{2}-\d{2})\]/);
  const followupDate  = followupMatch ? followupMatch[1] : null;
  const followupDays  = followupDate ? Math.ceil((new Date(followupDate) - new Date()) / 86400000) : null;
  const followupUrgent = followupDays !== null && followupDays <= 2;

  // Parse tags from notes field  [TAGS: a, b, c]
  const tagsMatch = (q.notes || '').match(/\[TAGS:\s*([^\]]+)\]/);
  const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean) : [];

  return (
    <tr style={{ cursor: 'pointer', background: isSelected ? 'rgba(37,99,235,0.05)' : undefined }} onClick={() => onView(q)}>
      <td onClick={e => e.stopPropagation()} style={{ width: 32, textAlign: 'center' }}>
        <input type="checkbox" checked={!!isSelected} onChange={() => onToggleSelect(q.quote_id)}
          style={{ cursor: 'pointer', width: 14, height: 14 }} />
      </td>
      <td>
        <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)' }}>{q.quote_number}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{q.created_at}</div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
            {tags.map(t => <span key={t} style={{ fontSize: 9, background: 'var(--s3)', color: 'var(--text2)', borderRadius: 3, padding: '1px 5px', fontWeight: 600 }}>{t}</span>)}
          </div>
        )}
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
      {/* Deal Score column */}
      <td style={{ minWidth: 70 }}>
        <DealScoreBadge margin={q.avg_margin_pct || 0} status={q.status} />
      </td>
      <td>
        <StatusBadge status={q.status} />
        {isExpiring && daysLeft !== null && (
          <div style={{ fontSize: 10, color: daysLeft < 3 ? 'var(--red)' : 'var(--amber)', marginTop: 2 }}>
            {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
          </div>
        )}
        {followupDate && (
          <div style={{ fontSize: 10, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, color: followupUrgent ? 'var(--amber)' : 'var(--text3)' }}>
            {followupUrgent ? '🔔' : '📅'} Follow-up {followupDays === 0 ? 'today' : followupDays < 0 ? `${Math.abs(followupDays)}d ago` : `in ${followupDays}d`}
          </div>
        )}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="qb-view-btn" onClick={e => { e.stopPropagation(); onView(q); }}>View →</button>
          {onEdit && EDITABLE_STATUSES.includes(q.status) && (
            <button className="qb-view-btn"
              style={{ background: 'var(--g5)', color: 'var(--brand)', border: '1px solid var(--g4)', fontWeight: 700 }}
              onClick={e => { e.stopPropagation(); onEdit(q); }} title="Edit this quotation">
              ✎ Edit
            </button>
          )}
          {onClone && (
            <button className="qb-view-btn"
              style={{ color: 'var(--text2)' }}
              onClick={e => { e.stopPropagation(); onClone(q); }} title="Clone this quotation">
              ⧉
            </button>
          )}
          {onAskAI && (
            <button className="qb-view-btn"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none' }}
              onClick={e => { e.stopPropagation(); onAskAI(q); }} title="Ask AI about this quote">
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
    if (p) {
      const hsnEntry = HSN_MAP[p.category] || {};
      onChange(idx, { ...item, product_id: pid, product_name: p.name, category: p.category, unit: p.unit || 'Nos', unit_price: p.sell_price, buy_price: p.buy_price, hsn_code: p.hsn_code || hsnEntry.hsn || '' });
    } else {
      onChange(idx, { ...item, product_id: pid });
    }
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
      <td className="qb-li-cell" style={{ minWidth: 220 }}>
        {/* Line type badge */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
          {['product','installation','amc','other'].map(t => (
            <button key={t} onClick={() => onChange(idx, { ...item, line_type: t })}
              style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: item.line_type === t ? 'var(--b2)' : 'var(--bg3)',
                color: item.line_type === t ? '#fff' : 'var(--text3)' }}>
              {t === 'product' ? 'Product' : t === 'installation' ? 'Install' : t === 'amc' ? 'AMC' : 'Other'}
            </button>
          ))}
        </div>
        <select className="qb-sel" value={item.product_id} onChange={e => handleProductPick(e.target.value)}>
          <option value="">— Select from catalog —</option>
          {products.map(p => (
            <option key={p.product_id} value={p.product_id}>{p.name} ({p.unit})</option>
          ))}
        </select>
        {!item.product_id && (
          <input className="qb-input" placeholder="Or type product / service name" value={item.product_name}
            onChange={e => onChange(idx, { ...item, product_name: e.target.value })}
            style={{ marginTop: 3, fontSize: 11 }} />
        )}
        {/* Brand */}
        <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
          <select className="qb-sel" style={{ fontSize: 10, flex: 1 }}
            value={item.brand || ''}
            onChange={e => onChange(idx, { ...item, brand: e.target.value })}>
            <option value="">Brand</option>
            {(BRANDS_BY_CAT[item.category] || ['Jaquar','Grohe','Kohler','Hindware','Hettich','Hafele','Kajaria','Astral','Others']).map(b => (
              <option key={b}>{b}</option>
            ))}
            <option value="Others">Others</option>
          </select>
          <select className="qb-sel" style={{ fontSize: 10, flex: 1 }}
            value={item.room || ''}
            onChange={e => onChange(idx, { ...item, room: e.target.value })}>
            <option value="">Room</option>
            {ROOM_OPTIONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <input className="qb-input" placeholder="Model / specs / finish / notes" value={item.specifications}
          onChange={e => onChange(idx, { ...item, specifications: e.target.value })}
          style={{ marginTop: 3, fontSize: 11 }} />
        {/* HSN code */}
        <input className="qb-input" placeholder="HSN Code" value={item.hsn_code || ''}
          onChange={e => onChange(idx, { ...item, hsn_code: e.target.value })}
          style={{ marginTop: 3, fontSize: 10, color: 'var(--text3)' }} />
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
function QuoteDetail({ quote, onClose, onStatusUpdate, onGoChat, onEdit, onNavigate, onClone }) {
  const [status, setStatus]           = useState(quote.status);
  const [updating, setUpdating]       = useState(false);
  const [converting, setConverting]   = useState(false);
  const [convertedOrder, setConvertedOrder] = useState(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [winLossTarget, setWinLossTarget]     = useState(null);
  const [showFollowUpScript, setShowFollowUpScript] = useState(false);
  const [followUpScript, setFollowUpScript]         = useState('');
  const [generatingScript, setGeneratingScript]     = useState(false);

  // ── WhatsApp Share ─────────────────────────────────────────────────────────
  const shareOnWhatsApp = () => {
    const linesSummary = (quote.line_items || []).slice(0, 5).map((l, i) =>
      `  ${i + 1}. ${l.product_name || l.category} — ${l.quantity} ${l.unit || 'Nos'} @ ₹${Number(l.net_price || l.unit_price || 0).toLocaleString('en-IN')}`
    ).join('\n');
    const moreItems = (quote.line_items?.length || 0) > 5 ? `\n  ...and ${quote.line_items.length - 5} more items` : '';
    const text = `*Quotation — ${quote.quote_number}*
InvenIQ Hardware & Sanitary

*Customer:* ${quote.customer_name}
*Project:* ${quote.project_name || quote.site_location || 'N/A'}
*Date:* ${quote.created_at || new Date().toLocaleDateString('en-IN')}
*Valid Till:* ${quote.valid_till || 'As agreed'}

*Items:*
${linesSummary}${moreItems}

*Subtotal:* ₹${Number(quote.subtotal || 0).toLocaleString('en-IN')}
*GST (${quote.gst_rate || 18}%):* ₹${Number(quote.gst_amount || 0).toLocaleString('en-IN')}
*TOTAL: ₹${Number(quote.grand_total || quote.total || 0).toLocaleString('en-IN')}*

*Scope:* ${quote.scope_of_work || 'Supply + Delivery'}
*Payment:* ${quote.payment_terms || 'As agreed'}
*Warranty:* ${quote.warranty_clause || 'As per manufacturer'}

Please confirm to proceed. Thank you!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  // ── AI Follow-up Script Generator ─────────────────────────────────────────
  const generateFollowUp = async () => {
    setGeneratingScript(true);
    setShowFollowUpScript(true);
    const daysSinceCreated = quote.created_at
      ? Math.floor((Date.now() - new Date(quote.created_at).getTime()) / 86400000) : 0;
    const prompt = `Generate a professional WhatsApp follow-up message for a hardware & sanitary supply quotation.

Quote Details:
- Quote Number: ${quote.quote_number}
- Customer: ${quote.customer_name} (${quote.customer_type || 'Customer'})
- Contact Person: ${quote.contact_person || 'the decision maker'}
- Project: ${quote.project_name || 'their project'}
- Quote Value: ₹${Number(quote.grand_total || quote.total || 0).toLocaleString('en-IN')}
- Status: ${status}
- Sent ${daysSinceCreated} day(s) ago
- Valid till: ${quote.valid_till || 'end of validity period'}

Generate:
1. A WhatsApp message (2-3 sentences, professional but warm, in Indian business style)
2. A follow-up email subject line
3. 2 objection-handling one-liners if they say "price is high" or "still comparing"

Keep it concise and actionable. Include the quote number.`;

    try {
      const r = await fetch('/api/chat/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, history: [] }),
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split('\n')) {
          if (line.startsWith('data: ')) {
            try { const ev = JSON.parse(line.slice(6)); if (ev.type === 'token') text += ev.content || ''; } catch {}
          }
        }
      }
      setFollowUpScript(text || 'Could not generate script. Try again or check AI configuration.');
    } catch {
      setFollowUpScript('AI follow-up generation failed. Check OPENAI_API_KEY in backend/.env.');
    }
    setGeneratingScript(false);
  };

  const updateStatus = async (newStatus, notesOverride) => {
    setUpdating(true);
    try {
      const body = { status: newStatus };
      if (notesOverride !== undefined) body.remarks = notesOverride;
      await fetch(`/api/quotes/${quote.quote_id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setStatus(newStatus);
      onStatusUpdate?.(quote.quote_id, newStatus);
    } catch (e) { setStatus(newStatus); }
    finally { setUpdating(false); }
  };

  const handleStatusClick = (newStatus) => {
    if (newStatus === 'LOST' || newStatus === 'WON') {
      setWinLossTarget(newStatus);
    } else {
      updateStatus(newStatus);
    }
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
    <div className="qb-modal-overlay" style={{ alignItems: 'center' }}>
      <div className="qb-modal" ref={detailModalRef}
        style={{ ...detailDragStyle, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header — fixed, never scrolls */}
        <div className="qb-modal-header" style={{ background: 'linear-gradient(135deg, #0f2744 0%, #1a3a5c 100%)', borderTop: 'none', borderRadius: '12px 12px 0 0', flexShrink: 0 }}>
          <div>
            <div className="qb-modal-title" style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{quote.quote_number}</div>
            <div className="qb-modal-sub" style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 2 }}>{quote.project_name} · {quote.customer_name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={status} />
            <button className="qb-print-btn" onClick={shareOnWhatsApp} style={{ background: 'rgba(37,211,102,.2)', color: '#6ee7b7', border: '1px solid rgba(37,211,102,.35)' }}>📱 WhatsApp</button>
            <button className="qb-print-btn" onClick={handlePrint} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.25)' }}>🖨 Print / PDF</button>
            <button className="qb-print-btn" onClick={() => setShowEmailDialog(true)} style={{ background: 'rgba(16,185,129,.25)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,.4)' }}>📧 Send Email</button>
            <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8 }}>×</button>
          </div>
        </div>

        {/* Printable quote body — scrollable area */}
        <div className="qb-print-body" id="qb-print"
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'var(--border2) transparent' }}>
          {/* Quote header */}
          <div className="qbp-header">
            <div className="qbp-logo">
              <div className="qbp-logo-mark">IQ</div>
              <div>
                <div className="qbp-company">InvenIQ — Hardware & Sanitary</div>
                <div className="qbp-address">Bangalore · GST: 29AAACI1234Z1Z5 · +91-98765-43210</div>
              </div>
            </div>
            <div className="qbp-meta">
              <div className="qbp-title">QUOTATION</div>
              <table className="qbp-meta-table">
                <tbody>
                  <tr><td>Quote No.</td><td><strong>{quote.quote_number}</strong></td></tr>
                  <tr><td>Date</td><td>{_fmtDate(quote.created_at)}</td></tr>
                  <tr><td>Valid Till</td><td>
                    <span style={{ color: daysLeft < 3 ? 'var(--red)' : 'inherit' }}>
                      {_fmtDate(quote.valid_till)} {daysLeft !== null && daysLeft >= 0 ? `(${daysLeft}d left)` : daysLeft < 0 ? '(Expired)' : ''}
                    </span>
                  </td></tr>
                  {quote.po_reference && <tr><td>Customer PO Ref.</td><td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{quote.po_reference}</td></tr>}
                  {quote.challan_number && <tr><td>DC / Challan No.</td><td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{quote.challan_number}</td></tr>}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong>{item.product_name}</strong>
                      {item.brand && <span style={{ fontSize: 10, background: 'var(--b3)', color: 'var(--b2)', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>{item.brand}</span>}
                      {item.room && <span style={{ fontSize: 10, background: 'var(--g3)', color: 'var(--green)', borderRadius: 3, padding: '1px 6px', fontWeight: 700 }}>{item.room}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{item.category}{item.hsn_code ? ` · HSN ${item.hsn_code}` : ''}</div>
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
                <tr><td>Subtotal (excl. GST)</td><td>{fmtL(quote.subtotal)}</td></tr>
                {quote.freight_amount > 0 && <tr><td>Freight / Transport</td><td>{fmt(quote.freight_amount)}</td></tr>}
                {quote.installation_amount > 0 && <tr><td>Installation Labour</td><td>{fmt(quote.installation_amount)}</td></tr>}
                {quote.amc_amount > 0 && <tr><td>AMC ({quote.amc_years || 1} yr)</td><td>{fmt(Number(quote.amc_amount) * Number(quote.amc_years || 1))}</td></tr>}
                {/* HAIA P0: Always show CGST+SGST or IGST split — mandatory on Indian quotations */}
                {(() => {
                  const taxable = Number(quote.subtotal || 0);
                  const rate    = Number(quote.gst_rate || 18);
                  const split   = _gstSplit(taxable, rate, quote.gst_number);
                  return split.type === 'IGST' ? (
                    <tr style={{ color: 'var(--text2)', fontSize: 13 }}><td>IGST @ {rate}%</td><td>{fmtL(split.igst)}</td></tr>
                  ) : (
                    <>
                      <tr style={{ color: 'var(--text2)', fontSize: 13 }}><td>CGST @ {rate / 2}%</td><td>{fmtL(split.cgst)}</td></tr>
                      <tr style={{ color: 'var(--text2)', fontSize: 13 }}><td>SGST @ {rate / 2}%</td><td>{fmtL(split.sgst)}</td></tr>
                    </>
                  );
                })()}
                <tr className="qbp-grand"><td>GRAND TOTAL</td><td>{fmtL(quote.grand_total || quote.total)}</td></tr>
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
                {quote.scope_of_work && <li><strong>Scope:</strong> {quote.scope_of_work}</li>}
                {quote.warranty_clause && <li><strong>Warranty:</strong> {quote.warranty_clause}</li>}
                <li><strong>Validity:</strong> {quote.validity_days} days from date of quotation</li>
                <li><strong>GST:</strong> {quote.gst_rate}% applicable as above (extra as actual)</li>
                <li>Breakage/damage claims must be reported within 48 hours of delivery with photos.</li>
                <li>Installation by authorized plumbers/technicians only; warranty void otherwise.</li>
                <li>Prices subject to change without notice if order not confirmed within validity period.</li>
                <li>Subject to Bangalore jurisdiction.</li>
              </ul>
            </div>
            {(quote.notes || quote.architect_name || quote.no_of_units) && (
              <div className="qbp-terms-col">
                <div className="qbp-terms-head">Project Notes</div>
                <div style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.7 }}>
                  {quote.architect_name && <div><strong>Architect/Designer:</strong> {quote.architect_name}</div>}
                  {quote.no_of_units && <div><strong>Units:</strong> {quote.no_of_units} {quote.no_of_bathrooms ? `(${quote.no_of_bathrooms} bathrooms/unit)` : ''}</div>}
                  {quote.notes && <div style={{ marginTop: 6 }}>{quote.notes}</div>}
                </div>
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

        {/* Conversion success banner — pinned above action bar */}
        {convertedOrder && (
          <div className="no-print" style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)', borderRadius: 10, padding: '12px 18px', margin: '0 12px 0', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
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

        {/* Win/Loss reason modal — rendered inside detail, above overlay */}
        {winLossTarget && (
          <WinLossReasonModal
            status={winLossTarget}
            quote={quote}
            onClose={() => setWinLossTarget(null)}
            onConfirm={(notes) => {
              setWinLossTarget(null);
              updateStatus(winLossTarget, notes);
            }}
          />
        )}

        {/* Action bar — pinned at bottom, never scrolls */}
        <div className="qb-modal-actions no-print" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Clone */}
            {onClone && (
              <button className="qb-action-btn"
                style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}
                onClick={() => { onClone(quote); onClose(); }}
                title="Duplicate this quotation">
                ⧉ Clone
              </button>
            )}
            {/* Edit */}
            {onEdit && EDITABLE_STATUSES.includes(status) && (
              <button className="qb-action-btn"
                style={{ background: 'var(--g5)', color: 'var(--brand)', border: '1px solid var(--g4)', fontWeight: 700 }}
                onClick={() => { onClose(); onEdit(quote); }}>
                ✎ Edit Quotation
              </button>
            )}
            {/* Convert to Sales Order */}
            {status === 'WON' && !convertedOrder && (
              <button className="qb-action-btn"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', fontWeight: 700 }}
                onClick={handleConvertToOrder} disabled={converting}>
                {converting ? '⏳ Converting…' : '🔄 Convert to Sales Order'}
              </button>
            )}
            {/* Status change buttons — WON/LOST trigger reason modal */}
            {Object.keys(QUOTE_STATUS).filter(s => s !== status).map(s => (
              <button key={s} className="qb-action-btn"
                onClick={() => handleStatusClick(s)} disabled={updating}
                style={s === 'WON' ? { background: 'rgba(22,163,74,.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,.3)' }
                     : s === 'LOST' ? { background: 'rgba(220,38,38,.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,.25)' }
                     : {}}>
                {s === 'WON' ? '🏆' : s === 'LOST' ? '📉' : '→'} Mark {QUOTE_STATUS[s].label}
              </button>
            ))}
            {onGoChat && (
              <button className="qb-action-btn" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none' }}
                onClick={() => { onClose(); onGoChat(`Analyse quotation ${quote.quote_number} for ${quote.customer_name} — project: ${quote.project_name || 'N/A'}, value: ${fmtL(quote.total)}, margin: ${quote.avg_margin_pct}%, status: ${status}. What is my win probability, negotiation strategy, and next steps?`); }}>
                🤖 Ask AI Strategy
              </button>
            )}
            {/* Follow-up script */}
            <button className="qb-action-btn"
              style={{ background: showFollowUpScript ? 'var(--amber)' : 'rgba(245,158,11,.1)', color: showFollowUpScript ? '#fff' : '#d97706', border: '1px solid rgba(245,158,11,.3)', fontWeight: 700 }}
              onClick={() => showFollowUpScript ? setShowFollowUpScript(false) : generateFollowUp()}
              disabled={generatingScript}>
              {generatingScript ? '⏳ Generating…' : '💬 Follow-up Script'}
            </button>
            {/* WhatsApp share */}
            <button className="qb-action-btn"
              style={{ background: 'rgba(37,211,102,.12)', color: '#25d366', border: '1px solid rgba(37,211,102,.35)', fontWeight: 700 }}
              onClick={shareOnWhatsApp}>
              📱 Share on WhatsApp
            </button>
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

        {/* Follow-up Script Panel */}
        {showFollowUpScript && (
          <div style={{ padding: '14px 20px', background: 'rgba(245,158,11,.06)', borderTop: '2px solid rgba(245,158,11,.3)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#d97706' }}>💬 AI Follow-up Script — {quote.quote_number}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { navigator.clipboard?.writeText(followUpScript); }}
                  style={{ fontSize: 11, padding: '3px 10px', border: '1px solid rgba(245,158,11,.4)', borderRadius: 5, background: 'transparent', color: '#d97706', cursor: 'pointer', fontWeight: 700 }}>
                  📋 Copy
                </button>
                <button onClick={() => setShowFollowUpScript(false)}
                  style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 5, background: 'transparent', color: 'var(--text3)', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            </div>
            {generatingScript ? (
              <div style={{ fontSize: 12, color: '#d97706', fontStyle: 'italic' }}>Generating personalised follow-up script…</div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto', padding: '8px 12px', background: 'var(--surface)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, fontFamily: 'var(--mono)' }}>
                {followUpScript}
              </div>
            )}
          </div>
        )}
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
    <div className="qb-modal-overlay" style={{ alignItems: 'center' }}>
      <div className="qb-modal" ref={previewRef} style={{ maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...previewDragStyle }}>
        <div className="qb-modal-header" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f4c81 100%)', borderTop: 'none', borderRadius: '12px 12px 0 0', flexShrink: 0 }}>
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

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'var(--border2) transparent' }}>
          <div className="qb-print-body" style={{ margin: 0, boxShadow: 'none', border: 'none' }}>
            <div className="qbp-header">
              <div className="qbp-logo">
                <div className="qbp-logo-mark">IQ</div>
                <div>
                  <div className="qbp-company">InvenIQ — Hardware & Sanitary</div>
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
                  <tr><td>Subtotal (Material)</td><td>{fmtL(subtotal - (f.include_freight ? Number(f.freight_amount) : 0) - (f.include_installation ? Number(f.installation_amount) : 0) - (f.include_amc ? Number(f.amc_amount) * Number(f.amc_years || 1) : 0))}</td></tr>
                  {f.include_freight && Number(f.freight_amount) > 0 && (
                    <tr><td>Freight / Transport</td><td>{fmt(f.freight_amount)}</td></tr>
                  )}
                  {f.include_installation && Number(f.installation_amount) > 0 && (
                    <tr><td>Installation (incl. GST)</td><td>{fmt(f.installation_amount)}</td></tr>
                  )}
                  {f.include_amc && Number(f.amc_amount) > 0 && (
                    <tr><td>AMC ({f.amc_years || 1} yr)</td><td>{fmt(Number(f.amc_amount) * Number(f.amc_years || 1))}</td></tr>
                  )}
                  {/* HAIA P0: CGST+SGST vs IGST in print preview */}
                  {(() => {
                    const split = _gstSplit(subtotal, f.gst_rate || 18, f.gst_number);
                    return split.type === 'IGST' ? (
                      <tr><td>IGST @ {f.gst_rate}%</td><td>{fmtL(split.igst)}</td></tr>
                    ) : (
                      <>
                        <tr><td>CGST @ {(f.gst_rate || 18) / 2}%</td><td>{fmtL(split.cgst)}</td></tr>
                        <tr><td>SGST @ {(f.gst_rate || 18) / 2}%</td><td>{fmtL(split.sgst)}</td></tr>
                      </>
                    );
                  })()}
                  <tr className="qbp-grand"><td>GRAND TOTAL</td><td>{fmtL(total)}</td></tr>
                </tbody>
              </table>
            </div>

            {(f.payment_terms || f.delivery_terms || f.notes || f.scope_of_work || f.warranty_clause) && (
              <div className="qbp-terms">
                {f.scope_of_work   && <div className="qbp-term"><strong>Scope:</strong> {f.scope_of_work}</div>}
                {f.payment_terms   && <div className="qbp-term"><strong>Payment:</strong> {f.payment_terms}</div>}
                {f.delivery_terms  && <div className="qbp-term"><strong>Delivery:</strong> {f.delivery_terms}</div>}
                {f.warranty_clause && <div className="qbp-term"><strong>Warranty:</strong> {f.warranty_clause}</div>}
                {f.notes           && <div className="qbp-term"><strong>Notes:</strong> {f.notes}</div>}
              </div>
            )}
          </div>
        </div>

        <div className="qb-form-footer" style={{ background: 'var(--s2)', borderTop: '1px solid var(--border)', padding: '14px 22px', flexShrink: 0 }}>
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
  const [subject, setSubject]       = useState(`Quotation ${quoteNumber} from InvenIQ — Hardware & Sanitary`);
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
        po_reference:    editQuote.po_reference    || '',
        challan_number:  editQuote.challan_number  || '',
        payment_terms:        editQuote.payment_terms        || '30% Advance + 60% on Delivery + 10% on Installation',
        delivery_terms:       editQuote.delivery_terms       || 'Door Delivery (Inclusive)',
        warranty_clause:      editQuote.warranty_clause      || '1 Year CP Fittings + 5 Years Sanitary Ware',
        scope_of_work:        editQuote.scope_of_work        || 'Supply + Delivery',
        no_of_units:          editQuote.no_of_units          || '',
        no_of_bathrooms:      editQuote.no_of_bathrooms      || '',
        validity_days:        editQuote.validity_days        || 14,
        notes:                editQuote.notes                || '',
        gst_rate:             editQuote.gst_rate             || 18,
        include_freight:      editQuote.include_freight      || false,
        freight_amount:       editQuote.freight_amount       || 0,
        include_installation: editQuote.include_installation || false,
        installation_amount:  editQuote.installation_amount  || 0,
        include_amc:          editQuote.include_amc          || false,
        amc_amount:           editQuote.amc_amount           || 0,
        amc_years:            editQuote.amc_years            || 1,
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
        brand:          li.brand          || '',
        room:           li.room           || '',
        quantity:       li.quantity       || 1,
        unit:           li.unit           || 'Nos',
        unit_price:     li.unit_price     || 0,
        discount_pct:   li.discount_pct   || 0,
        buy_price:      li.buy_price      || 0,
        specifications: li.specifications || '',
        hsn_code:       li.hsn_code       || '',
        line_type:      li.line_type      || 'product',
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
  const [showImageSearch,   setShowImageSearch]   = useState(false);
  const [showProductLookup, setShowProductLookup] = useState(false);

  // Variant / tier pricing
  const [activeVariant, setActiveVariant] = useState('standard');
  const variantMult = QUOTE_VARIANTS.find(v => v.key === activeVariant)?.mult ?? 1.0;

  // Bundle quick-add menu
  const [showBundleMenu, setShowBundleMenu] = useState(false);

  // Room-wise grouped view
  const [showRoomView, setShowRoomView] = useState(false);

  // T&C template key
  const [tcKey, setTcKey] = useState('standard');

  // Feature 2: Margin mode toggle
  const [marginMode, setMarginMode]           = useState('line');
  const [targetMarginPct, setTargetMarginPct] = useState(20);

  // Add a full product bundle as line items
  const addBundle = (bundle) => {
    const newItems = bundle.items.map(item => ({
      ...BLANK_LINE,
      ...item,
      room: item.room || bundle.room || '',
      discount_pct: 0,
      buy_price: 0,
    }));
    setLines(prev => [...prev, ...newItems]);
    setShowBundleMenu(false);
  };

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
  }, 0) + (f.include_freight ? Number(f.freight_amount) : 0)
           + (f.include_installation ? Number(f.installation_amount) : 0)
           + (f.include_amc ? Number(f.amc_amount) * Number(f.amc_years || 1) : 0);
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
    validity_days:        Number(f.validity_days)         || 14,
    gst_rate:             Number(f.gst_rate)              || 18,
    freight_amount:       Number(f.freight_amount)        || 0,
    installation_amount:  Number(f.installation_amount)   || 0,
    amc_amount:           Number(f.amc_amount)            || 0,
    amc_years:            Number(f.amc_years)             || 1,
    line_items: lines
      .filter(l => (l.product_id || l.product_name) && Number(l.quantity) > 0)
      .map(l => ({
        product_id:     String(l.product_id   || ''),
        product_name:   String(l.product_name || ''),
        category:       String(l.category     || ''),
        brand:          String(l.brand        || ''),
        room:           String(l.room         || ''),
        quantity:       Number(l.quantity),
        unit:           String(l.unit         || 'Nos'),
        unit_price:     Number(l.unit_price),
        discount_pct:   Number(l.discount_pct  || 0),
        buy_price:      Number(l.buy_price     || 0),
        specifications: String(l.specifications || ''),
        hsn_code:       String(l.hsn_code      || ''),
        line_type:      String(l.line_type     || 'product'),
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
                  {editQuote ? `Editing ${editQuote.customer_name} · ${editQuote.status}` : 'InvenIQ — Hardware & Sanitary · Professional Quotation'}
                </div>
              )}
            </div>
          </div>
          <button className="qb-close-btn" onClick={onClose} style={{ color: '#fff', opacity: .8, fontSize: 22 }}>×</button>
        </div>

        {/* ── Pricing Tier Selector ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: '2px solid var(--border)', background: 'var(--bg2)', padding: '0 20px', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginRight: 12, textTransform: 'uppercase', letterSpacing: '.6px', whiteSpace: 'nowrap' }}>Pricing Tier:</span>
          {QUOTE_VARIANTS.map(v => (
            <button key={v.key} onClick={() => setActiveVariant(v.key)}
              title={v.desc}
              style={{
                padding: '10px 16px', fontSize: 12, fontWeight: activeVariant === v.key ? 800 : 500,
                border: 'none', background: 'none', cursor: 'pointer',
                color: activeVariant === v.key ? v.color : 'var(--text3)',
                borderBottom: activeVariant === v.key ? `3px solid ${v.color}` : '3px solid transparent',
                marginBottom: -2, transition: 'all .15s', whiteSpace: 'nowrap',
              }}>
              {v.icon} {v.label}
              {activeVariant === v.key && variantMult !== 1.0 && (
                <span style={{ fontSize: 10, marginLeft: 5, opacity: .75 }}>
                  {variantMult > 1 ? `×${variantMult.toFixed(2)}` : `×${variantMult.toFixed(2)}`}
                </span>
              )}
            </button>
          ))}
          {activeVariant !== 'standard' && (
            <div style={{ marginLeft: 'auto', fontSize: 11, color: QUOTE_VARIANTS.find(v => v.key === activeVariant)?.color, fontWeight: 700, padding: '0 8px' }}>
              {QUOTE_VARIANTS.find(v => v.key === activeVariant)?.desc}
            </div>
          )}
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
              <input className="qb-input" value={f.project_name} onChange={e => up('project_name', e.target.value)} placeholder="e.g. Prestige Skyrise Tower A, 3BHK Residential" />
              <label className="qb-label">Site / Delivery Location</label>
              <input className="qb-input" value={f.site_location} onChange={e => up('site_location', e.target.value)} placeholder="e.g. Whitefield, Bangalore" />
              <label className="qb-label">Architect / Interior Designer</label>
              <input className="qb-input" value={f.architect_name} onChange={e => up('architect_name', e.target.value)} placeholder="e.g. Studio Forma, Ar. Meera Iyer" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="qb-label">No. of Units / Flats</label>
                  <input className="qb-input" type="number" min={1} value={f.no_of_units || ''} onChange={e => up('no_of_units', e.target.value)} placeholder="e.g. 24" />
                </div>
                <div>
                  <label className="qb-label">Bathrooms per Unit</label>
                  <input className="qb-input" type="number" min={1} value={f.no_of_bathrooms || ''} onChange={e => up('no_of_bathrooms', e.target.value)} placeholder="e.g. 3" />
                </div>
              </div>
              <label className="qb-label">Scope of Work</label>
              <select className="qb-sel" value={f.scope_of_work || 'Supply + Delivery'} onChange={e => up('scope_of_work', e.target.value)}>
                {SCOPE_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>

              {/* HAIA P0: PO Reference + Challan Number — mandatory in Indian B2B hardware trade */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <div>
                  <label className="qb-label">Customer PO Ref. No.</label>
                  <input className="qb-input" value={f.po_reference || ''} onChange={e => up('po_reference', e.target.value)} placeholder="e.g. PO/2026/1234" />
                </div>
                <div>
                  <label className="qb-label">DC / Challan No.</label>
                  <input className="qb-input" value={f.challan_number || ''} onChange={e => up('challan_number', e.target.value)} placeholder="e.g. DC/2026/0089" />
                </div>
              </div>
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
              <label className="qb-label">Warranty Terms</label>
              <select className="qb-sel" value={f.warranty_clause || ''} onChange={e => up('warranty_clause', e.target.value)}>
                {WARRANTY_CLAUSES.map(t => <option key={t}>{t}</option>)}
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
                    <option value={18}>18% — CP Fittings / Hardware / Sanitary</option>
                    <option value={12}>12% — Others</option>
                    <option value={5}>5% — Basic Plumbing</option>
                    <option value={28}>28% — Luxury / Jacuzzi</option>
                    <option value={0}>0% — Exempt</option>
                  </select>
                </div>
              </div>
              {/* T&C Template Selector */}
              <label className="qb-label" style={{ marginTop: 10 }}>📄 T&C Template</label>
              <select className="qb-sel" value={tcKey} onChange={e => setTcKey(e.target.value)}>
                {Object.entries(TC_TEMPLATES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, marginBottom: 8, lineHeight: 1.5, padding: '5px 8px', background: 'var(--bg2)', borderRadius: 5, fontFamily: 'var(--mono)' }}>
                {TC_TEMPLATES[tcKey]?.text.split('\n')[0]}…
              </div>

              <label className="qb-label">Notes / Special Conditions</label>
              <textarea className="qb-input" rows={3} value={f.notes} onChange={e => up('notes', e.target.value)} placeholder="Colour specs, certifications, special requirements…" style={{ resize: 'vertical', minHeight: 64 }} />

              {/* Follow-up Date */}
              <label className="qb-label" style={{ marginTop: 10 }}>🔔 Follow-up Reminder Date</label>
              <input className="qb-input" type="date"
                value={(f.notes || '').match(/\[FOLLOWUP:\s*(\d{4}-\d{2}-\d{2})\]/)?.[1] || ''}
                onChange={e => {
                  const cleaned = (f.notes || '').replace(/\n?\[FOLLOWUP:[^\]]*\]/g, '').trim();
                  up('notes', e.target.value ? cleaned + `\n[FOLLOWUP: ${e.target.value}]` : cleaned);
                }}
              />

              {/* Internal Tags */}
              <label className="qb-label" style={{ marginTop: 10 }}>🏷 Internal Tags</label>
              <input className="qb-input"
                value={((f.notes || '').match(/\[TAGS:\s*([^\]]+)\]/)?.[1] || '')}
                onChange={e => {
                  const cleaned = (f.notes || '').replace(/\n?\[TAGS:[^\]]*\]/g, '').trim();
                  up('notes', e.target.value.trim() ? cleaned + `\n[TAGS: ${e.target.value.trim()}]` : cleaned);
                }}
                placeholder="e.g. premium, residential, referral (comma separated)"
              />
            </div>

            {/* Freight / Installation / AMC card */}
            <div style={{ ...sectionStyle, marginBottom: 0 }}>
              <div style={secTitleStyle}>⚙ Additional Charges</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                <input type="checkbox" checked={f.include_freight} onChange={e => up('include_freight', e.target.checked)} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
                🚚 Include Freight / Transport Charge
              </label>
              {f.include_freight && (
                <>
                  <label className="qb-label" style={{ marginTop: 8 }}>Freight Amount (₹)</label>
                  <input className="qb-input" type="number" min={0} value={f.freight_amount} onChange={e => up('freight_amount', Number(e.target.value))} />
                </>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 10 }}>
                <input type="checkbox" checked={f.include_installation || false} onChange={e => up('include_installation', e.target.checked)} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
                🔧 Include Installation / Labour Charges
              </label>
              {f.include_installation && (
                <>
                  <label className="qb-label" style={{ marginTop: 8 }}>Installation Amount (₹, incl. GST)</label>
                  <input className="qb-input" type="number" min={0} value={f.installation_amount || 0} onChange={e => up('installation_amount', Number(e.target.value))} />
                </>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 10 }}>
                <input type="checkbox" checked={f.include_amc || false} onChange={e => up('include_amc', e.target.checked)} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
                🛡 Include AMC (Annual Maintenance Contract)
              </label>
              {f.include_amc && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div>
                    <label className="qb-label">AMC Amount (₹/year)</label>
                    <input className="qb-input" type="number" min={0} value={f.amc_amount || 0} onChange={e => up('amc_amount', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="qb-label">AMC Period (years)</label>
                    <select className="qb-sel" value={f.amc_years || 1} onChange={e => up('amc_years', Number(e.target.value))}>
                      {[1,2,3,5].map(y => <option key={y} value={y}>{y} Year{y > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                </div>
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

            {/* ── Line Items toolbar ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="qb-form-sec-title" style={{ marginBottom: 0 }}>Line Items</div>
                {/* Room view toggle */}
                <button onClick={() => setShowRoomView(r => !r)}
                  style={{ fontSize: 11, padding: '4px 10px', border: '1.5px solid var(--border)', borderRadius: 6, background: showRoomView ? 'var(--b3)' : 'var(--surface)', color: showRoomView ? 'var(--b2)' : 'var(--text3)', cursor: 'pointer', fontWeight: 600, transition: 'all .15s' }}
                  title="Toggle room-wise grouped view with subtotals">
                  🏠 {showRoomView ? 'Room View' : 'Room View'}
                </button>
              </div>

              {/* Margin mode radio */}
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
                    <input type="radio" name="marginMode" value={val} checked={marginMode === val} onChange={() => setMarginMode(val)} style={{ display: 'none' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* ── Room-wise grouped view ── */}
            {showRoomView ? (() => {
              const roomGroups = {};
              lines.forEach((item, idx) => {
                const r = item.room || 'Unassigned';
                if (!roomGroups[r]) roomGroups[r] = [];
                roomGroups[r].push({ item, idx });
              });
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
                  {Object.entries(roomGroups).map(([room, entries]) => {
                    const roomSubtotal = entries.reduce((s, { item: l }) =>
                      s + l.unit_price * (1 - l.discount_pct / 100) * l.quantity, 0);
                    return (
                      <div key={room} style={{ border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span>🏠</span>{room}
                            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>{entries.length} item{entries.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13, color: 'var(--brand)' }}>{fmtL(roomSubtotal)}</div>
                        </div>
                        <table className="qb-li-table" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th>#</th><th>Product</th><th>Qty</th><th>Unit</th>
                              <th>List Price</th><th>Disc %</th><th>Net Price</th><th>Amount</th>
                              {marginMode === 'line' && <th>Margin</th>}
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map(({ item, idx }) => (
                              <LineItemRow key={idx} item={item} idx={idx} products={products}
                                onChange={updateLine} onRemove={removeLine} marginMode={marginMode} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
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
            )}

            {/* ── Add items toolbar ── */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <button className="qb-add-line-btn" onClick={addLine}>+ Add Line Item</button>

              {/* Bundle quick-add */}
              <div style={{ position: 'relative' }}>
                <button className="qb-add-line-btn"
                  onClick={() => setShowBundleMenu(b => !b)}
                  style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#fff', borderColor: 'transparent' }}>
                  📦 Quick-Add Bundle {showBundleMenu ? '▲' : '▼'}
                </button>
                {showBundleMenu && (
                  <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 500, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '8px 0', minWidth: 320 }}>
                    {PRODUCT_BUNDLES.map(bundle => (
                      <div key={bundle.id} onClick={() => addBundle(bundle)}
                        style={{ padding: '10px 16px', cursor: 'pointer', transition: 'background .15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{bundle.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{bundle.desc} · {bundle.items.length} items</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="qb-add-line-btn"
                onClick={() => setShowImageSearch(true)}
                title="Upload product photos to find and add items from catalog"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', borderColor: 'transparent' }}>
                📷 Search by Photo
              </button>

              <button
                className="qb-add-line-btn"
                onClick={() => setShowProductLookup(true)}
                title="Search Ebco, Sanjay Hardware and other product files by code, name, size, finish or MRP"
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', borderColor: 'transparent' }}>
                Product File Lookup
              </button>
            </div>

            {/* ── Product File Lookup Modal ── */}
            {showProductLookup && (
              <ProductFileLookupModal
                onClose={() => setShowProductLookup(false)}
                onAddLines={(lines) => lines.forEach(l => addLineFromProduct(l))}
              />
            )}

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
              {/* HAIA P0: CGST+SGST vs IGST split in live preview */}
              {(() => {
                const split = _gstSplit(subtotal, f.gst_rate || 18, f.gst_number);
                return split.type === 'IGST' ? (
                  <div className="qb-sum-row" style={{ fontSize: 12, color: 'var(--text2)' }}>
                    <span>IGST @ {f.gst_rate}% <span style={{ fontSize: 10, background: 'var(--b3)', color: 'var(--b2)', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 4 }}>Interstate</span></span>
                    <strong>{fmtL(split.igst)}</strong>
                  </div>
                ) : (
                  <>
                    <div className="qb-sum-row" style={{ fontSize: 12, color: 'var(--text2)' }}>
                      <span>CGST @ {(f.gst_rate || 18) / 2}%</span>
                      <strong>{fmtL(split.cgst)}</strong>
                    </div>
                    <div className="qb-sum-row" style={{ fontSize: 12, color: 'var(--text2)' }}>
                      <span>SGST @ {(f.gst_rate || 18) / 2}% <span style={{ fontSize: 10, background: 'var(--g3)', color: 'var(--green)', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 4 }}>Intrastate</span></span>
                      <strong>{fmtL(split.sgst)}</strong>
                    </div>
                  </>
                );
              })()}
              <div className="qb-sum-row qb-sum-total">
                <span>GRAND TOTAL</span>
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
  const [selectedIds, setSelectedIds]       = useState([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showKanban,    setShowKanban]      = useState(false);

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── Clone handler ──
  const handleClone = async (q) => {
    try {
      const r = await fetch(`/api/quotes/${q.quote_id}/clone`, { method: 'POST' });
      if (!r.ok) throw new Error();
      const cloned = await r.json();
      setScanPrefill({ initialData: cloned, initialLines: cloned.line_items || [] });
    } catch {
      // Fallback: clone from existing data directly
      const { quote_id, quote_number, created_at, valid_till, updated_at, total, margin_pct, ...rest } = q;
      setScanPrefill({
        initialData: { ...rest, project_name: `[Copy] ${q.project_name || ''}`, status: 'DRAFT' },
        initialLines: (q.line_items || []).map(({ item_id, ...li }) => li),
      });
    }
    setEditQuote(null);
    setShowForm(true);
  };

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

      {/* ── Hero Banner ─────────────────────────────────────────────────── */}
      {(() => {
        const allQ    = data?.quotes || [];
        const wonQ    = allQ.filter(q => q.status === 'WON');
        const lostQ   = allQ.filter(q => q.status === 'LOST');
        const decided = wonQ.length + lostQ.length;
        const winRate = decided > 0 ? Math.round(wonQ.length / decided * 100) : null;
        const sentQ   = allQ.filter(q => ['SENT','NEGOTIATING','DRAFT'].includes(q.status));
        const avgDeal = sentQ.length > 0 ? Math.round(sentQ.reduce((s,q) => s+(q.total||0), 0) / sentQ.length) : 0;
        const kpiTiles = [
          { icon:'💰', label:'Pipeline',    value: fmtL(kpis.pipeline_value || 0),  sub:`${kpis.total_quotes || 0} quotes total`,    accent:'#7dd3fc', click: () => onGoChat?.('What is my total quotation pipeline value? Break it down by status and tell me which deals need action.') },
          { icon:'🏆', label:'Won YTD',     value: fmtL(kpis.won_value || 0),       sub:`${wonQ.length} deals closed`,               accent:'#86efac', click: () => onGoChat?.(`I have won ${fmtL(kpis.won_value || 0)}. What patterns made these deals successful?`) },
          { icon:'📉', label:'Lost YTD',    value: fmtL(kpis.lost_value || 0),      sub:`${lostQ.length} deals lost`,                accent:'#fda4af', click: () => onGoChat?.(`I have lost ${fmtL(kpis.lost_value || 0)} in quotes. What are the likely reasons?`) },
          { icon:'🎯', label:'Win Rate',    value: winRate !== null ? `${winRate}%` : '—', sub:'Won ÷ (Won+Lost)',                    accent: winRate >= 50 ? '#86efac' : winRate >= 30 ? '#fde68a' : '#fda4af', click: () => onGoChat?.('My win rate — how can I improve my close rate?') },
          { icon:'📊', label:'Avg Margin',  value: `${kpis.avg_margin_pct || 0}%`,  sub:'Floor 14% · Target 20%',                    accent:'#c4b5fd', click: () => onGoChat?.(`My average margin is ${kpis.avg_margin_pct || 0}%. Which categories are dragging it down?`) },
          { icon:'💼', label:'Avg Deal',    value: fmtL(avgDeal),                   sub:'active pipeline avg',                       accent:'#67e8f9', click: () => onGoChat?.(`My average deal size is ${fmtL(avgDeal)}. How can I increase it through upselling?`) },
          { icon:'⏰', label:'Expiring',    value: kpis.quotes_expiring || 0,       sub:'follow up today',                           accent: (kpis.quotes_expiring || 0) > 0 ? '#fde68a' : '#bfdbfe', warn: (kpis.quotes_expiring || 0) > 0, click: () => onGoChat?.('Which quotes are expiring this week? Give me a follow-up script for each.') },
        ];
        return (
          <div style={{ background:'#000e1f', padding:'36px 40px 0', position:'relative', overflow:'hidden', fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>

            {/* Single ambient glow — top right */}
            <div style={{ position:'absolute',top:-160,right:-160,width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle at center,rgba(59,130,246,0.28) 0%,rgba(29,78,216,0.12) 40%,transparent 70%)',pointerEvents:'none' }} />
            {/* Bottom-left counter-glow */}
            <div style={{ position:'absolute',bottom:-80,left:-60,width:360,height:360,borderRadius:'50%',background:'radial-gradient(circle at center,rgba(14,165,233,0.09) 0%,transparent 65%)',pointerEvents:'none' }} />
            {/* Dot grid */}
            <div style={{ position:'absolute',inset:0,backgroundImage:'radial-gradient(rgba(59,130,246,0.1) 1px,transparent 1px)',backgroundSize:'28px 28px',pointerEvents:'none' }} />

            {/* ── Title row ── */}
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:16,position:'relative',zIndex:1 }}>
              <div style={{ display:'flex',alignItems:'center',gap:18 }}>
                <div style={{ width:58,height:58,borderRadius:16,background:'rgba(59,130,246,0.15)',border:'1px solid rgba(59,130,246,0.35)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,flexShrink:0,boxShadow:'0 0 0 1px rgba(59,130,246,0.1), 0 8px 32px rgba(29,78,216,0.4)' }}>📋</div>
                <div>
                  <div style={{ fontSize:30,fontWeight:900,color:'#ffffff',letterSpacing:'-1px',lineHeight:1,marginBottom:6 }}>Quotation Builder</div>
                  <div style={{ fontSize:12,color:'rgba(255,255,255,0.42)',letterSpacing:0.4,fontWeight:500 }}>AI-Powered · Hardware & Sanitary Ware · Building Materials · GST-Ready Prints</div>
                  <div style={{ display:'flex',alignItems:'center',gap:10,marginTop:8 }}>
                    <DataSourceBadge source={data?.data_source} />
                    {kpis.quotes_expiring > 0 && (
                      <span style={{ fontSize:10,fontWeight:700,color:'#fbbf24',background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.25)',borderRadius:20,padding:'2px 9px',letterSpacing:0.3 }}>⚠ {kpis.quotes_expiring} expiring this week</span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',paddingTop:4 }}>
                <button className="scan-wa-btn" onClick={() => setShowScanner(true)} style={{ background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.75)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:9,padding:'9px 16px',fontSize:12,cursor:'pointer',fontWeight:600 }}>📱 Scan WhatsApp</button>
                {selectedIds.length > 0 && (
                  <button onClick={() => setShowMergeModal(true)} style={{ background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.75)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:9,padding:'9px 16px',fontSize:12,cursor:'pointer',fontWeight:600 }}>🔀 Merge ({selectedIds.length})</button>
                )}
                <button onClick={() => setShowKanban(v => !v)} style={{ background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.75)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:9,padding:'9px 16px',fontSize:12,cursor:'pointer',fontWeight:600 }}>{showKanban ? '📋 List' : '🗂 Kanban'}</button>
                <button className="btn-primary" onClick={() => { setEditQuote(null); setShowForm(true); }} style={{ background:'#3b82f6',color:'#fff',border:'none',borderRadius:9,padding:'10px 24px',fontSize:13,cursor:'pointer',fontWeight:800,boxShadow:'0 4px 20px rgba(59,130,246,0.55)',letterSpacing:'-0.2px' }}>+ New Quotation</button>
              </div>
            </div>

            {/* ── AI strip ── */}
            {onGoChat && (
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:20,background:'rgba(59,130,246,0.07)',border:'1px solid rgba(59,130,246,0.18)',borderRadius:10,padding:'10px 18px',position:'relative',zIndex:1,flexWrap:'wrap' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                  <div style={{ width:30,height:30,borderRadius:8,background:'rgba(59,130,246,0.2)',border:'1px solid rgba(59,130,246,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0 }}>🤖</div>
                  <div>
                    <div style={{ fontSize:12,fontWeight:700,color:'#fff',letterSpacing:'-0.1px' }}>Quote Intelligence Active</div>
                    <div style={{ fontSize:10.5,color:'rgba(255,255,255,0.45)',marginTop:2 }}>
                      {kpis.quotes_expiring > 0 ? `⚠ ${kpis.quotes_expiring} expiring — follow up now` : 'No urgent expirations'}
                      {' · '}Win rate: <strong style={{ color:'#93c5fd' }}>{kpis.win_rate_pct || 0}%</strong>
                      {' · '}Pipeline: <strong style={{ color:'#93c5fd' }}>{fmtL(kpis.pipeline_value || 0)}</strong>
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex',gap:6,flexShrink:0,flexWrap:'wrap' }}>
                  {[
                    ['📞 Follow-up List',   'Which quotes should I urgently follow up on this week? Give me a prioritised call list.'],
                    ['📊 Win Rate Analysis','Analyse my quotation win rate and lost deals — pricing and strategy patterns?'],
                    ['🏗 Pipeline Health',  'Give me a complete pipeline health check — at-risk deals, margin analysis, top 3 likely to close.'],
                  ].map(([lbl, q]) => (
                    <button key={lbl} onClick={() => onGoChat(q)} style={{ background:'rgba(59,130,246,0.12)',color:'rgba(255,255,255,0.75)',border:'1px solid rgba(59,130,246,0.22)',borderRadius:8,padding:'5px 12px',fontSize:11,cursor:'pointer',fontWeight:600 }}>{lbl}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── KPI strip ── */}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:10,marginTop:22,position:'relative',zIndex:1 }}>
              {kpiTiles.map(k => (
                <div key={k.label} onClick={k.click}
                  style={{ background:'rgba(255,255,255,0.04)',borderRadius:'12px 12px 0 0',padding:'14px 16px',borderTop:`2.5px solid ${k.accent}`,borderLeft:'1px solid rgba(255,255,255,0.07)',borderRight:'1px solid rgba(255,255,255,0.07)',borderBottom:'none',cursor:k.click?'pointer':'default',transition:'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}>
                  <div style={{ display:'flex',alignItems:'center',gap:5,marginBottom:8 }}>
                    <span style={{ fontSize:12 }}>{k.icon}</span>
                    <span style={{ fontSize:9,color:'rgba(255,255,255,0.35)',fontWeight:700,textTransform:'uppercase',letterSpacing:1.2 }}>{k.label}</span>
                  </div>
                  <div style={{ fontSize:20,fontWeight:900,color:'#eff6ff',lineHeight:1,letterSpacing:'-0.7px' }}>{k.value}</div>
                  <div style={{ fontSize:10,color:'rgba(255,255,255,0.28)',marginTop:5,letterSpacing:0.2 }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
        {/* View toggle: List ↔ Kanban */}
        <button onClick={() => setShowKanban(k => !k)}
          title={showKanban ? 'Switch to List view' : 'Switch to Kanban view'}
          style={{ padding: '6px 12px', background: showKanban ? 'rgba(37,99,235,.1)' : 'var(--hover)', color: showKanban ? 'var(--brand)' : 'var(--text2)', border: `1px solid ${showKanban ? 'rgba(37,99,235,.4)' : 'var(--border)'}`, borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
          {showKanban ? '📋 List' : '🗂 Kanban'}
        </button>
        {selectedIds.length >= 2 && (
          <button onClick={() => setShowMergeModal(true)}
            style={{ padding: '7px 14px', background: 'linear-gradient(135deg,#1e3a5f,#2563eb)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
            🔀 Merge {selectedIds.length} Quotes
          </button>
        )}
        {selectedIds.length > 0 && (
          <button onClick={() => setSelectedIds([])}
            style={{ padding: '6px 12px', background: 'var(--hover)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
            Clear ({selectedIds.length})
          </button>
        )}
        <ExportButton rows={filteredQuotes} filename="quotations" columns={[
          { key: 'quote_number', label: 'Quote #' }, { key: 'customer_name', label: 'Customer' },
          { key: 'project_name', label: 'Project' }, { key: 'total_value', label: 'Value (₹)' },
          { key: 'status', label: 'Status' }, { key: 'valid_until', label: 'Valid Until' },
          { key: 'created_at', label: 'Created' },
        ]} />
      </div>

      {/* Kanban view */}
      {showKanban && (
        <PipelineKanbanView quotes={filteredQuotes} onView={setActiveQ} onClone={handleClone} />
      )}

      {/* Quotes table (list view) */}
      {!showKanban && (<><div className="card-table">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox"
                  checked={pagedQuotes.length > 0 && pagedQuotes.every(q => selectedIds.includes(q.quote_id))}
                  onChange={() => {
                    const visible = pagedQuotes.map(q => q.quote_id);
                    const allSel = visible.every(id => selectedIds.includes(id));
                    setSelectedIds(prev => allSel ? prev.filter(id => !visible.includes(id)) : [...new Set([...prev, ...visible])]);
                  }}
                  style={{ cursor: 'pointer' }} title="Select all on this page" />
              </th>
              <th>Quote #</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Margin</th>
              <th>Score</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredQuotes.length === 0 ? (
              <tr><td colSpan={9}>
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
                        <button className="qb-action-btn" onClick={() => onGoChat('How do I build a winning quotation strategy for my hardware and sanitary business? What should my pricing by customer type (contractor vs plumber vs builder), margin floors, and follow-up process look like?')}>
                          🤖 Ask AI for Guidance
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </td></tr>
            ) : pagedQuotes.map(q => (
              <QuoteRow key={q.quote_id} q={q} onView={setActiveQ} onEdit={handleEdit}
                onClone={handleClone}
                isSelected={selectedIds.includes(q.quote_id)}
                onToggleSelect={toggleSelect}
                onAskAI={onGoChat ? (q) => onGoChat(`Analyse quotation ${q.quote_number} for ${q.customer_name} — value: ${fmtL(q.total)}, margin: ${q.avg_margin_pct || 0}%, status: ${q.status}, valid till: ${q.valid_till}. What is my win probability, what negotiation strategy should I use, and what follow-up should I do today?`) : null}
              />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={filteredQuotes.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </>)}

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
          onNavigate={onNavigate} onClone={handleClone}
          onStatusUpdate={(id, s) => setData(prev => ({
            ...prev,
            quotes: prev.quotes.map(q => q.quote_id === id ? { ...q, status: s } : q),
          }))} />
      )}
      {showMergeModal && (
        <MergeQuotesModal
          quotes={data?.quotes || []}
          selectedIds={selectedIds}
          onClose={() => setShowMergeModal(false)}
          onOpenInEditor={(initialData, initialLines) => {
            // Close merge modal and open NewQuoteForm pre-filled with merged data
            setShowMergeModal(false);
            setSelectedIds([]);
            setScanPrefill({ initialData, initialLines });
            setEditQuote(null);
            setShowForm(true);
          }}
          onMerged={(merged) => {
            // "Save as Draft" path — quote already saved, just refresh the list
            setShowMergeModal(false);
            setSelectedIds([]);
            setData(prev => ({
              ...prev,
              quotes: [{ ...merged, total: merged.grand_total, avg_margin_pct: 0, line_items: merged.line_items || [] }, ...(prev?.quotes || [])],
            }));
          }}
        />
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
