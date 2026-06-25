import React, { useState, useEffect, useRef, useCallback } from 'react';
import SkeletonView from '../components/SkeletonLoader';
import DataSourceBadge from '../components/DataSourceBadge';
import { ExportButton } from '../utils/exportUtils';
import { useAutoRefresh } from '../utils/useAutoRefresh';
import { createChart, baseOpts, axisColors } from '../utils/chartHelpers';

/* ── Export column definitions ──────────────────────────────────────────────── */
const SHEET_COLS = [
  { key: 'product_name',      label: 'Product' },
  { key: 'category',          label: 'Category' },
  { key: 'brand',             label: 'Brand' },
  { key: 'sku_code',          label: 'SKU' },
  { key: 'mat_cost',          label: 'Material Cost' },
  { key: 'labor_cost',        label: 'Labour Cost' },
  { key: 'overhead_cost',     label: 'Overhead Cost' },
  { key: 'total_cost',        label: 'Total Cost' },
  { key: 'sell_price',        label: 'Sell Price' },
  { key: 'actual_margin_pct', label: 'Actual Margin %' },
  { key: 'target_margin_pct', label: 'Target Margin %' },
  { key: 'status',            label: 'Status' },
];
const PROJ_COLS = [
  { key: 'project_name',  label: 'Project' },
  { key: 'client_name',   label: 'Client' },
  { key: 'project_ref',   label: 'Reference' },
  { key: 'budgeted_cost', label: 'Budget (INR)' },
  { key: 'actual_cost',   label: 'Actual (INR)' },
  { key: 'variance',      label: 'Variance (INR)' },
  { key: 'progress_pct',  label: 'Progress %' },
  { key: 'status',        label: 'Status' },
];
const VAR_COLS = [
  { key: 'category',     label: 'Category' },
  { key: 'budgeted',     label: 'Target Cost (INR)' },
  { key: 'actual',       label: 'Actual Cost (INR)' },
  { key: 'variance',     label: 'Variance (INR)' },
  { key: 'variance_pct', label: 'Variance %' },
  { key: 'sheet_count',  label: 'Sheets' },
];

/* ── Formatters ─────────────────────────────────────────────────────────────── */
const fmtInr = n => {
  const v = Number(n) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};
const fmtPct = n => `${(Number(n) || 0).toFixed(1)}%`;

/* ── Status badge using the shared .bdg system ──────────────────────────────── */
const BADGE_CLS = {
  'Active':         'bg',
  'Pending Review': 'ba',
  'Archived':       'bsl',
  'On Track':       'bg',
  'Over Budget':    'br',
  'Under Budget':   'bb',
};
const StatusBadge = ({ status }) => (
  <span className={`bdg ${BADGE_CLS[status] || 'bsl'}`}>{status}</span>
);

/* ── Shared form field ──────────────────────────────────────────────────────── */
const Field = ({ label, half, children }) => (
  <div className={`form-group${half ? '' : ''}`}>
    <label className="form-label">{label}</label>
    {children}
  </div>
);

/* ── Cost Preview Box ───────────────────────────────────────────────────────── */
function CostPreview({ mat, lab, ovh, sell, target }) {
  const total  = mat + lab + ovh;
  const margin = sell > 0 ? ((sell - total) / sell * 100) : 0;
  const ok     = margin >= target;
  return (
    <div className="sum-box" style={{ marginTop: 4, marginBottom: 6 }}>
      <div className="sum-row">
        <span>Total Landed Cost</span>
        <span className="sum-val" style={{ fontFamily: 'var(--mono)' }}>{fmtInr(total)}</span>
      </div>
      <div className="sum-row">
        <span>Actual Gross Margin</span>
        <span className="sum-val" style={{ color: ok ? 'var(--g2)' : 'var(--r2)', fontFamily: 'var(--mono)' }}>
          {fmtPct(margin)}
        </span>
      </div>
      <div className="sum-row total">
        <span>vs Target ({fmtPct(target)})</span>
        <span className="sum-val" style={{ color: ok ? 'var(--g2)' : 'var(--r2)' }}>
          {ok ? `✅ +${fmtPct(margin - target)} above target` : `⚠️ ${fmtPct(target - margin)} below target`}
        </span>
      </div>
    </div>
  );
}

/* ── Cost Sheet Modal ─────────────────────────────────────────────────────────
   Uses the shared .modal-overlay / .modal / .modal-hd / .modal-bd / .modal-ft system
────────────────────────────────────────────────────────────────────────────── */
function CostSheetModal({ sheet, onClose, onSave }) {
  const blank = { product_name: '', category: 'CP Fittings', brand: '', sku_code: '',
    mat_cost: 0, labor_cost: 0, overhead_cost: 0, sell_price: 0,
    target_margin_pct: 20, status: 'Active', notes: '', approved_by: '' };
  const [form, setForm]     = useState(sheet ? { ...blank, ...sheet } : blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.product_name.trim()) { setErr('Product name is required'); return; }
    setSaving(true); setErr('');
    try {
      const url    = sheet ? `/api/costing/cost-sheets/${sheet.id}` : '/api/costing/cost-sheets';
      const res    = await fetch(url, { method: sheet ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Save failed'); }
      onSave(await res.json());
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <div className="modal-hd-left">
            <div className="modal-hd-icon" style={{ background: '#059669' }}>💰</div>
            <div>
              <div className="modal-title">{sheet ? 'Edit Cost Sheet' : 'New Cost Sheet'}</div>
              <div className="modal-sub">Per-unit cost structure · margin targeting</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div className="form-row">
            <Field label="Product Name *">
              <input className="form-input" value={form.product_name}
                onChange={e => set('product_name', e.target.value)} placeholder="e.g. Jaquar Kubix Shower Set" />
            </Field>
            <Field label="Category">
              <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                {['CP Fittings','Hardware','Sanitary Ware','Laminates','Paints','Tiles','Plumbing','Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Brand">
              <input className="form-input" value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="e.g. Jaquar" />
            </Field>
            <Field label="SKU Code">
              <input className="form-input" value={form.sku_code} onChange={e => set('sku_code', e.target.value)} placeholder="e.g. JAQ-KUB-001" />
            </Field>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.6px', fontFamily: 'var(--mono)', marginBottom: 6, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            Cost Breakdown (per unit)
          </div>
          <div className="form-row form-row-3">
            {[['mat_cost','Material Cost (₹)'],['labor_cost','Labour Cost (₹)'],['overhead_cost','Overhead Cost (₹)']].map(([k, lbl]) => (
              <Field key={k} label={lbl}>
                <input type="number" className="form-input" min={0} value={form[k]}
                  onChange={e => set(k, parseFloat(e.target.value) || 0)} />
              </Field>
            ))}
          </div>
          <div className="form-row">
            <Field label="Sell Price (₹)">
              <input type="number" className="form-input" min={0} value={form.sell_price}
                onChange={e => set('sell_price', parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Target Margin %">
              <input type="number" className="form-input" min={0} max={100} value={form.target_margin_pct}
                onChange={e => set('target_margin_pct', parseFloat(e.target.value) || 0)} />
            </Field>
          </div>
          <CostPreview mat={Number(form.mat_cost)||0} lab={Number(form.labor_cost)||0}
            ovh={Number(form.overhead_cost)||0} sell={Number(form.sell_price)||0}
            target={Number(form.target_margin_pct)||0} />
          <div className="form-row">
            <Field label="Status">
              <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                {['Active','Pending Review','Archived'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            {sheet && (
              <Field label="Approved By">
                <input className="form-input" value={form.approved_by || ''}
                  onChange={e => set('approved_by', e.target.value)} placeholder="e.g. CFO" />
              </Field>
            )}
          </div>
          <Field label="Notes">
            <textarea className="form-input" style={{ resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }}
              value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes…" />
          </Field>
          {err && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7,
              padding: '8px 12px', fontSize: 13, color: 'var(--r2)' }}>{err}</div>
          )}
        </div>
        <div className="modal-ft">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : sheet ? 'Save Changes' : 'Create Cost Sheet'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Project Budget Modal ──────────────────────────────────────────────────── */
function ProjectModal({ project, onClose, onSave }) {
  const blank = { project_name: '', client_name: '', project_ref: '',
    budgeted_cost: 0, actual_cost: 0, progress_pct: 0, notes: '', start_date: '', target_date: '' };
  const [form, setForm]     = useState(project ? { ...blank, ...project } : blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const bud  = Number(form.budgeted_cost) || 0;
  const act  = Number(form.actual_cost)   || 0;
  const varV = act - bud;
  const varP = bud > 0 ? (varV / bud * 100) : 0;

  const handleSave = async () => {
    if (!form.project_name.trim()) { setErr('Project name is required'); return; }
    setSaving(true); setErr('');
    try {
      const url = project ? `/api/costing/project-budgets/${project.id}` : '/api/costing/project-budgets';
      const res = await fetch(url, { method: project ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Save failed'); }
      onSave(await res.json());
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <div className="modal-hd-left">
            <div className="modal-hd-icon" style={{ background: '#059669' }}>🏗️</div>
            <div>
              <div className="modal-title">{project ? 'Edit Project Budget' : 'New Project Budget'}</div>
              <div className="modal-sub">Track budget vs actual spend across the project lifecycle</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div className="form-row">
            <Field label="Project Name *">
              <input className="form-input" value={form.project_name}
                onChange={e => set('project_name', e.target.value)} placeholder="e.g. Brigade Lakefront — 24 Units" />
            </Field>
            <Field label="Client Name">
              <input className="form-input" value={form.client_name}
                onChange={e => set('client_name', e.target.value)} placeholder="e.g. Brigade Enterprises" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Project Reference">
              <input className="form-input" value={form.project_ref}
                onChange={e => set('project_ref', e.target.value)} placeholder="e.g. BL-2026-001" />
            </Field>
            <Field label="Work Progress %">
              <input type="number" className="form-input" min={0} max={100} value={form.progress_pct}
                onChange={e => set('progress_pct', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Budgeted Cost (₹)">
              <input type="number" className="form-input" min={0} value={form.budgeted_cost}
                onChange={e => set('budgeted_cost', parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Actual Cost to Date (₹)">
              <input type="number" className="form-input" min={0} value={form.actual_cost}
                onChange={e => set('actual_cost', parseFloat(e.target.value) || 0)} />
            </Field>
          </div>
          {/* Live variance preview */}
          <div className="sum-box" style={{ marginTop: 4, marginBottom: 6 }}>
            <div className="sum-row">
              <span>Variance (₹)</span>
              <span className="sum-val" style={{ color: varV > 0 ? 'var(--r2)' : 'var(--b2)', fontFamily: 'var(--mono)' }}>
                {varV >= 0 ? '+' : ''}{fmtInr(varV)}
              </span>
            </div>
            <div className="sum-row total">
              <span>Auto Status</span>
              <span className="sum-val" style={{ color: varP > 2 ? 'var(--r2)' : varP < -2 ? 'var(--b2)' : 'var(--g2)' }}>
                {varP > 2 ? `🔴 Over Budget (+${fmtPct(varP)})` : varP < -2 ? `🔵 Under Budget (${fmtPct(varP)})` : '🟢 On Track'}
              </span>
            </div>
          </div>
          <div className="form-row">
            <Field label="Start Date">
              <input type="date" className="form-input" value={form.start_date || ''}
                onChange={e => set('start_date', e.target.value)} />
            </Field>
            <Field label="Target Completion">
              <input type="date" className="form-input" value={form.target_date || ''}
                onChange={e => set('target_date', e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="form-input" style={{ resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }}
              value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes about this project…" />
          </Field>
          {err && (
            <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 7,
              padding: '8px 12px', fontSize: 13, color: 'var(--r2)' }}>{err}</div>
          )}
        </div>
        <div className="modal-ft">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────────── */
export default function Costing({ onGoChat, period }) {
  const [activeTab, setActiveTab]   = useState('overview');
  const [summary, setSummary]       = useState(null);
  const [sheets, setSheets]         = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [projects, setProjects]     = useState([]);
  const [variances, setVariances]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [dataSource, setDataSource] = useState('demo');
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('All');
  const [sortCol, setSortCol]       = useState('updated_at');
  const [sortAsc, setSortAsc]       = useState(false);
  const [sheetModal, setSheetModal] = useState(null);
  const [projModal, setProjModal]   = useState(null);
  const [archiveId, setArchiveId]   = useState(null);
  const [archiving, setArchiving]   = useState(false);

  const marginRef = useRef(null);
  const budgetRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const qs = search    ? `&search=${encodeURIComponent(search)}` : '';
      const cf = catFilter !== 'All' ? `&category=${encodeURIComponent(catFilter)}` : '';
      const [s, sh, pr, va] = await Promise.all([
        fetch('/api/costing/summary').then(r => r.json()),
        fetch(`/api/costing/cost-sheets?period=${encodeURIComponent(period)}${qs}${cf}`).then(r => r.json()),
        fetch('/api/costing/project-budgets').then(r => r.json()),
        fetch('/api/costing/variance').then(r => r.json()),
      ]);
      setSummary(s);
      setSheets(sh.cost_sheets || []);
      setCategories(['All', ...(sh.categories || [])]);
      setProjects(pr.project_budgets || []);
      setVariances(va.variances || []);
      setDataSource(s.data_source || 'demo');
      setError('');
    } catch (e) {
      setError('Failed to load costing data — ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [period, search, catFilter]);

  useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);
  useAutoRefresh(fetchAll);

  /* ── Margin by Category chart ── */
  useEffect(() => {
    if (!sheets.length || activeTab !== 'overview') return;
    const byCategory = {};
    sheets.forEach(s => {
      if (!byCategory[s.category]) byCategory[s.category] = { actual: [], target: [] };
      byCategory[s.category].actual.push(Number(s.actual_margin_pct) || 0);
      byCategory[s.category].target.push(Number(s.target_margin_pct) || 0);
    });
    const cats    = Object.keys(byCategory);
    const avg     = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const actuals = cats.map(c => parseFloat(avg(byCategory[c].actual).toFixed(1)));
    const targets = cats.map(c => parseFloat(avg(byCategory[c].target).toFixed(1)));
    const c = axisColors();
    return createChart(marginRef, {
      type: 'bar',
      data: {
        labels: cats,
        datasets: [
          { label: 'Actual Margin %', data: actuals, backgroundColor: '#059669cc', borderRadius: 4, borderSkipped: false },
          { label: 'Target Margin %', data: targets, backgroundColor: '#2563eba0', borderRadius: 4, borderSkipped: false },
        ],
      },
      options: baseOpts({
        scales: {
          x: { grid: { color: c.grid }, ticks: { color: c.label, font: { size: 9 } } },
          y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => v + '%' }, min: 0 },
        },
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 9 }, color: c.label, padding: 10, boxWidth: 10 } } },
      }),
    });
  }, [sheets, activeTab]);

  /* ── Project Budget vs Actual chart ── */
  useEffect(() => {
    if (!projects.length || activeTab !== 'overview') return;
    const top = [...projects].sort((a, b) => Number(b.budgeted_cost) - Number(a.budgeted_cost)).slice(0, 6);
    const c   = axisColors();
    const actualColors = top.map(p =>
      Number(p.actual_cost) > Number(p.budgeted_cost) * 1.02 ? '#dc2626cc' : '#059669cc'
    );
    return createChart(budgetRef, {
      type: 'bar',
      data: {
        labels: top.map(p => p.project_name.length > 22 ? p.project_name.slice(0, 22) + '…' : p.project_name),
        datasets: [
          { label: 'Budget (₹L)',  data: top.map(p => +(Number(p.budgeted_cost)/1e5).toFixed(2)), backgroundColor: '#2563eba0', borderRadius: 4, borderSkipped: false },
          { label: 'Actual (₹L)',  data: top.map(p => +(Number(p.actual_cost)/1e5).toFixed(2)),   backgroundColor: actualColors, borderRadius: 4, borderSkipped: false },
        ],
      },
      options: baseOpts({
        indexAxis: 'y',
        scales: {
          x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 9, family: 'JetBrains Mono' }, callback: v => '₹' + v + 'L' } },
          y: { grid: { color: c.grid }, ticks: { color: c.label, font: { size: 9 } } },
        },
        plugins: { legend: { display: true, position: 'top', labels: { font: { size: 9 }, color: c.label, padding: 10, boxWidth: 10 } } },
      }),
    });
  }, [projects, activeTab]);

  /* ── Sort helpers ── */
  const handleSort = col => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
  };
  const SortTh = ({ col, label, right }) => (
    <th onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', textAlign: right ? 'right' : 'left' }}>
      {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span style={{ opacity: .25 }}>↕</span>}
    </th>
  );

  const sortedSheets = [...sheets].sort((a, b) => {
    const av = a[sortCol]; const bv = b[sortCol];
    const cmp = typeof av === 'number' ? av - bv : String(av || '').localeCompare(String(bv || ''));
    return sortAsc ? cmp : -cmp;
  });

  /* ── Derived alerts for Overview ── */
  const lowMargin   = sheets.filter(s => s.actual_margin_pct < s.target_margin_pct)
                            .sort((a, b) => a.actual_margin_pct - b.actual_margin_pct).slice(0, 5);
  const overBudget  = projects.filter(p => p.status === 'Over Budget')
                              .sort((a, b) => Number(b.actual_cost) - Number(b.budgeted_cost) - (Number(a.actual_cost) - Number(a.budgeted_cost)));
  const pendingRev  = sheets.filter(s => s.status === 'Pending Review');

  /* ── Archive ── */
  const handleArchive = async id => {
    setArchiving(true);
    try {
      await fetch(`/api/costing/cost-sheets/${id}`, { method: 'DELETE' });
      setSheets(prev => prev.filter(s => s.id !== id));
      setArchiveId(null);
    } finally { setArchiving(false); }
  };

  const onSheetSaved = saved => {
    setSheets(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      return idx >= 0 ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev];
    });
    setSheetModal(null);
    fetchAll();
  };
  const onProjSaved = saved => {
    setProjects(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      return idx >= 0 ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev];
    });
    setProjModal(null);
    fetchAll();
  };

  /* ── Loading ── */
  if (loading) return <SkeletonView />;

  const exportData = activeTab === 'products' ? sheets : activeTab === 'projects' ? projects : variances;
  const exportCols = activeTab === 'products' ? SHEET_COLS : activeTab === 'projects' ? PROJ_COLS : VAR_COLS;

  return (
    <div className="view">

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="ph">
        <div className="ph-left">
          <div className="pg">💰 Costing Intelligence</div>
          <div className="psub">
            Product cost sheets · Project budgets · Margin &amp; variance analysis
            {' '}<DataSourceBadge source={dataSource} />
          </div>
        </div>
        <div className="ph-actions">
          {onGoChat && (
            <button className="btn-primary"
              onClick={() => onGoChat('Give me a complete costing intelligence report — average margins, over-budget projects, pending reviews, and the top 3 actions I should take to improve profitability.')}>
              ✨ AI Cost Brief
            </button>
          )}
          <ExportButton rows={exportData} columns={exportCols}
            filename={`costing_${activeTab}`} label="Export CSV" />
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--r3)', border: '1px solid var(--r4)', borderRadius: 8,
          padding: '10px 16px', color: 'var(--r2)', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── KPI Strip — .kg g4 ───────────────────────────────────────────────── */}
      {summary && (
        <div className="kg g4">
          <div className="kc sg" style={{ cursor: 'pointer' }}
            onClick={() => onGoChat?.('Analyze our average gross margin across all product categories and what can be done to improve it.')}>
            <div className="kt"><div className="kl">Avg Gross Margin</div><span style={{ fontSize: 9, opacity: .5 }}>✨</span></div>
            <div className="kv">{fmtPct(summary.avg_margin_pct)}</div>
            <div className="kd up">{summary.total_sheets} active cost sheets</div>
            <div className="ks">Industry benchmark 18–28%</div>
          </div>
          <div className="kc sa" style={{ cursor: 'pointer' }}
            onClick={() => onGoChat?.('Which cost sheets are pending review and what changes need to be made?')}>
            <div className="kt"><div className="kl">Pending Reviews</div><span style={{ fontSize: 9, opacity: .5 }}>✨</span></div>
            <div className="kv">{summary.pending_reviews}</div>
            <div className="kd wn">Cost sheets awaiting approval</div>
            <div className="ks">Review pricing before next cycle</div>
          </div>
          <div className="kc sb" style={{ cursor: 'pointer' }}
            onClick={() => onGoChat?.(`We have ${summary.total_projects} active projects with total budget of ${fmtInr(summary.total_budgeted)}. What is the financial exposure and how should we manage it?`)}>
            <div className="kt"><div className="kl">Total Budgeted</div><span style={{ fontSize: 9, opacity: .5 }}>✨</span></div>
            <div className="kv">{fmtInr(summary.total_budgeted)}</div>
            <div className="kd fl">{summary.total_projects} active projects</div>
            <div className="ks">Actual spend: {fmtInr(summary.total_actual)}</div>
          </div>
          <div className={`kc ${summary.budget_variance_pct > 2 ? 'sr' : 'sg'}`} style={{ cursor: 'pointer' }}
            onClick={() => onGoChat?.(`Budget variance is ${summary.budget_variance_pct > 0 ? '+' : ''}${fmtPct(summary.budget_variance_pct)} with ${summary.over_budget_projects} over-budget projects. What should we do?`)}>
            <div className="kt"><div className="kl">Budget Variance</div><span style={{ fontSize: 9, opacity: .5 }}>✨</span></div>
            <div className="kv" style={{ color: summary.budget_variance_pct > 2 ? 'var(--r2)' : 'var(--g2)' }}>
              {summary.budget_variance_pct >= 0 ? '+' : ''}{fmtPct(summary.budget_variance_pct)}
            </div>
            <div className={`kd ${summary.over_budget_projects > 0 ? 'dn' : 'up'}`}>
              {summary.over_budget_projects} project(s) over budget
            </div>
            <div className="ks">Alert threshold: &gt;+5%</div>
          </div>
        </div>
      )}

      {/* ── AI Opportunity Strip ──────────────────────────────────────────────── */}
      <div className="ai-opp-strip">
        <span className="ai-opp-label">AI Opportunities</span>
        {[
          { icon: '📊', text: 'Margin squeeze — identify products below target and fix pricing', q: 'Which products are below their target margin and what pricing or cost changes will fix it?' },
          { icon: '🏗️', text: 'Over-budget projects — change-order or value-engineer now',    q: 'Which projects are over budget? What change-orders or cost-reduction strategies should I apply?' },
          { icon: '💡', text: 'Category benchmarks — am I aligned with industry standards?',   q: 'How do our margin percentages compare with industry benchmarks for CP fittings, hardware, and laminates?' },
          { icon: '🔍', text: 'Overhead allocation — am I overloading certain products?',      q: 'Is our overhead allocation method correct? Which product categories carry excess overhead cost?' },
          { icon: '📈', text: 'Profitability forecast — project 3-month margin outlook',       q: 'Based on current cost sheets and project pipeline, what is our expected margin for the next 3 months?' },
        ].map((o, i) => (
          <button key={i} className="ai-opp-chip" onClick={() => onGoChat?.(o.q)}>
            <span>{o.icon}</span><span>{o.text}</span><span className="ai-opp-chip-arrow">→</span>
          </button>
        ))}
      </div>

      {/* ── Tab Navigation — .vtabs ──────────────────────────────────────────── */}
      <div className="vtabs" style={{ marginBottom: 14 }}>
        {[['overview','Overview'],['products','Product Costing'],['projects','Project Budgets'],['variance','Variance Analysis']].map(([id, lbl]) => (
          <div key={id} className={`vtab${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}>{lbl}</div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Charts row */}
          <div className="gl g55" style={{ marginBottom: 14 }}>
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">Margin by Category</div>
                  <div className="csub">Actual (emerald) vs Target (blue) gross margin %</div>
                </div>
                {onGoChat && (
                  <button className="export-btn"
                    onClick={() => onGoChat('Which product categories have the worst margin gap and what should I do to close it?')}>
                    ✨ AI Analyse
                  </button>
                )}
              </div>
              <div style={{ height: 200, position: 'relative' }}><canvas ref={marginRef} /></div>
            </div>
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">Project Budget vs Actual</div>
                  <div className="csub">Top projects by budget · ₹ Lakhs · Red = over budget</div>
                </div>
                {onGoChat && (
                  <button className="export-btn"
                    onClick={() => onGoChat('Which projects are most at risk of cost overrun and what corrective actions should I take?')}>
                    ✨ AI Analyse
                  </button>
                )}
              </div>
              <div style={{ height: 200, position: 'relative' }}><canvas ref={budgetRef} /></div>
            </div>
          </div>

          {/* Alert panels */}
          <div className="gl g55">
            {/* Low Margin Products */}
            <div className="card">
              <div className="ch">
                <div>
                  <div className="ctit">⚠️ Below-Target Margin Products</div>
                  <div className="csub">{lowMargin.length} product(s) earning less than target</div>
                </div>
                {lowMargin.length > 0 && (
                  <button className="export-btn"
                    onClick={() => onGoChat(`These products are below target margin: ${lowMargin.map(s => `${s.product_name} (${fmtPct(s.actual_margin_pct)} vs ${fmtPct(s.target_margin_pct)} target)`).join(', ')}. What pricing or cost changes will fix this?`)}>
                    ✨ Fix with AI
                  </button>
                )}
              </div>
              {lowMargin.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--g2)', fontSize: 13 }}>
                  ✅ All products are meeting their target margins
                </div>
              ) : (
                lowMargin.map(s => {
                  const gap = s.target_margin_pct - s.actual_margin_pct;
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.product_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                          {s.category} · {s.brand || 'No brand'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: 'var(--r2)', fontFamily: 'var(--mono)', fontSize: 14 }}>
                          {fmtPct(s.actual_margin_pct)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                          target {fmtPct(s.target_margin_pct)} · gap {fmtPct(gap)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Over-Budget Projects + Pending Reviews */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card">
                <div className="ch">
                  <div>
                    <div className="ctit">🔴 Over-Budget Projects</div>
                    <div className="csub">{overBudget.length} project(s) exceeding approved budget</div>
                  </div>
                </div>
                {overBudget.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--g2)', fontSize: 13 }}>
                    ✅ All projects are within budget
                  </div>
                ) : (
                  overBudget.slice(0, 3).map(p => {
                    const ov = Number(p.actual_cost) - Number(p.budgeted_cost);
                    const pct = Number(p.budgeted_cost) > 0 ? (ov / Number(p.budgeted_cost) * 100) : 0;
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{p.project_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                            {p.client_name || '—'} · {p.progress_pct}% complete
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: 'var(--r2)', fontSize: 13, fontFamily: 'var(--mono)' }}>
                            +{fmtInr(ov)}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--r2)', fontFamily: 'var(--mono)', opacity: .8 }}>
                            +{fmtPct(pct)} overrun
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="card">
                <div className="ch">
                  <div>
                    <div className="ctit">🕐 Pending Reviews</div>
                    <div className="csub">{pendingRev.length} cost sheet(s) awaiting approval</div>
                  </div>
                </div>
                {pendingRev.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--g2)', fontSize: 13 }}>
                    ✅ No cost sheets pending review
                  </div>
                ) : (
                  pendingRev.slice(0, 4).map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{s.product_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{s.category}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="cost-act-btn" onClick={() => setSheetModal(s)} style={{ fontSize: 12, padding: '3px 8px' }}>✏️ Review</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB: PRODUCT COSTING
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'products' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="cost-tbl-toolbar">
            <input className="cost-search" placeholder="Search product, brand, SKU…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="cost-filter-sel" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
            <button className="btn-primary" style={{ marginLeft: 'auto' }}
              onClick={() => setSheetModal('new')}>+ New Cost Sheet</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="cost-tbl">
              <thead>
                <tr>
                  <SortTh col="product_name"      label="Product" />
                  <SortTh col="category"           label="Category" />
                  <SortTh col="brand"              label="Brand" />
                  <SortTh col="total_cost"         label="Total Cost"  right />
                  <SortTh col="sell_price"         label="Sell Price"  right />
                  <SortTh col="actual_margin_pct"  label="Margin %"    right />
                  <SortTh col="target_margin_pct"  label="Target %"    right />
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedSheets.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)' }}>
                    No cost sheets found.
                  </td></tr>
                )}
                {sortedSheets.map(s => {
                  const below = s.actual_margin_pct < s.target_margin_pct;
                  return (
                    <tr key={s.id} style={below ? { background: 'var(--r5,rgba(239,68,68,.04))' } : {}}>
                      <td>
                        <div style={{ fontWeight: 600, color: below ? 'var(--r2)' : 'var(--text)' }}>
                          {below && '⚠️ '}{s.product_name}
                        </div>
                        {s.sku_code && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{s.sku_code}</div>}
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 12 }}>{s.category}</td>
                      <td style={{ color: 'var(--text2)', fontSize: 12 }}>{s.brand || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtInr(s.total_cost)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtInr(s.sell_price)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: below ? 'var(--r2)' : 'var(--g2)' }}>
                        {fmtPct(s.actual_margin_pct)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 11 }}>
                        {fmtPct(s.target_margin_pct)}
                      </td>
                      <td><StatusBadge status={s.status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                          <button className="cost-act-btn" title="Edit" onClick={() => setSheetModal(s)}>✏️</button>
                          <button className="cost-act-btn cost-act-del" title="Archive" onClick={() => setArchiveId(s.id)}>🗑️</button>
                          <button className="cost-act-btn" title="Ask AI"
                            onClick={() => onGoChat?.(`Analyze costing for ${s.product_name} — margin is ${fmtPct(s.actual_margin_pct)} vs target ${fmtPct(s.target_margin_pct)}. What should I change?`)}>🤖</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sheets.length > 0 && (
            <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)',
              borderTop: '1px solid var(--border)', display: 'flex', gap: 16 }}>
              <span>{sheets.length} sheets</span>
              <span style={{ color: 'var(--r2)' }}>
                {sheets.filter(s => s.actual_margin_pct < s.target_margin_pct).length} below target
              </span>
              <span style={{ color: 'var(--a2)' }}>{pendingRev.length} pending review</span>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB: PROJECT BUDGETS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'projects' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-primary" onClick={() => setProjModal('new')}>+ New Project</button>
          </div>
          <div className="cost-proj-grid">
            {projects.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--text3)' }}>
                No projects yet — add your first project budget.
              </div>
            )}
            {[...projects].sort((a, b) => {
              const rank = s => s === 'Over Budget' ? 2 : s === 'On Track' ? 1 : 0;
              return rank(b.status) - rank(a.status);
            }).map(p => {
              const bud     = Number(p.budgeted_cost) || 0;
              const act     = Number(p.actual_cost)   || 0;
              const spendPct = bud > 0 ? Math.min(100, act / bud * 100) : 0;
              const prog     = Number(p.progress_pct) || 0;
              const variance = Number(p.variance) || (act - bud);
              const isOver   = p.status === 'Over Budget';
              const isUnder  = p.status === 'Under Budget';
              return (
                <div className="card" key={p.id} style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{p.project_name}</div>
                      {p.client_name && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{p.client_name}</div>}
                      {p.project_ref && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 1 }}>{p.project_ref}</div>}
                    </div>
                    <StatusBadge status={p.status} />
                  </div>

                  {/* 3 KPIs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: 'Budget',   val: fmtInr(bud),      color: undefined },
                      { label: 'Actual',   val: fmtInr(act),      color: isOver ? 'var(--r2)' : isUnder ? 'var(--b2)' : undefined },
                      { label: 'Variance', val: (variance >= 0 ? '+' : '') + fmtInr(variance), color: variance > 0 ? 'var(--r2)' : 'var(--b2)' },
                    ].map(k => (
                      <div key={k.label} style={{ textAlign: 'center', padding: '7px 4px', background: 'var(--s2)', borderRadius: 7, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>{k.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: k.color || 'var(--text)' }}>{k.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Progress bars */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>
                      <span>Spend vs Budget</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: isOver ? 'var(--r2)' : 'var(--text2)' }}>{spendPct.toFixed(0)}%</span>
                    </div>
                    <div className="kbar" style={{ height: 6 }}>
                      <div className="kbf" style={{ width: `${spendPct}%`, background: isOver ? 'var(--r2)' : '#059669' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', margin: '6px 0 3px' }}>
                      <span>Work Progress</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{prog}%</span>
                    </div>
                    <div className="kbar" style={{ height: 6 }}>
                      <div className="kbf" style={{ width: `${prog}%`, background: 'var(--b2)' }} />
                    </div>
                    {spendPct > prog + 10 && (
                      <div style={{ marginTop: 5, fontSize: 10, color: 'var(--a2)', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                        ⚠️ Spend {(spendPct - prog).toFixed(0)}pp ahead of progress
                      </div>
                    )}
                  </div>

                  {p.notes && <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 6 }}>{p.notes}</div>}

                  {(p.start_date || p.target_date) && (
                    <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>
                      {p.start_date  && <span>📅 {p.start_date}</span>}
                      {p.target_date && <span>🏁 {p.target_date}</span>}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-secondary" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
                      onClick={() => setProjModal(p)}>✏️ Edit</button>
                    <button className="btn-secondary" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
                      onClick={() => onGoChat?.(`Analyze the budget for ${p.project_name} for ${p.client_name || 'client'} — status: ${p.status}, variance: ${fmtInr(variance)}`)}>🤖 Ask AI</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB: VARIANCE ANALYSIS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'variance' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="ch" style={{ padding: '14px 18px 12px', margin: 0, borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="ctit">Category Cost Variance</div>
              <div className="csub">Target cost = what you can spend to achieve target margin at current sell price · Positive = margin being squeezed</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="cost-tbl">
              <thead>
                <tr>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Target Cost</th>
                  <th style={{ textAlign: 'right' }}>Actual Cost</th>
                  <th style={{ textAlign: 'right' }}>Variance (₹)</th>
                  <th style={{ textAlign: 'right' }}>Variance %</th>
                  <th style={{ textAlign: 'center' }}>Sheets</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {variances.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)' }}>
                    No variance data available.
                  </td></tr>
                )}
                {variances.map(v => {
                  const pos    = v.variance > 0;
                  const maxVar = Math.max(...variances.map(x => Math.abs(x.variance)), 1);
                  const barPct = Math.abs(v.variance) / maxVar * 100;
                  return (
                    <tr key={v.category}>
                      <td style={{ fontWeight: 700 }}>{v.category}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtInr(v.budgeted)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtInr(v.actual)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: pos ? 'var(--r2)' : 'var(--b2)' }}>
                        {pos ? '+' : ''}{fmtInr(v.variance)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: pos ? 'var(--r2)' : 'var(--b2)' }}>
                        {pos ? '+' : ''}{fmtPct(v.variance_pct)}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text2)' }}>{v.sheet_count}</td>
                      <td style={{ minWidth: 140 }}>
                        <div className="kbar" style={{ height: 6, marginBottom: 4 }}>
                          <div className="kbf" style={{ width: `${barPct}%`, background: pos ? 'var(--r2)' : 'var(--b2)', opacity: .7 }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                          {pos ? '⚠️ cost too high' : '✅ within target'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '9px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            Variance = Actual Cost − Target Cost · Negative = achieving better-than-target margin
          </div>
        </div>
      )}

      {/* ── AI CTA Bar ───────────────────────────────────────────────────────── */}
      <div className="ai-cta-bar no-print" style={{ marginTop: 16 }}
        onClick={() => onGoChat?.('Give me a full costing intelligence brief — average product margins, over-budget projects, pending reviews, and the top 3 actions to take this week to improve profitability.')}>
        💰 Need margin benchmarks, cost optimisation strategies, or a project cost analysis? Ask AI →
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {(sheetModal === 'new' || (sheetModal && typeof sheetModal === 'object')) && (
        <CostSheetModal
          sheet={sheetModal === 'new' ? null : sheetModal}
          onClose={() => setSheetModal(null)}
          onSave={onSheetSaved}
        />
      )}
      {(projModal === 'new' || (projModal && typeof projModal === 'object')) && (
        <ProjectModal
          project={projModal === 'new' ? null : projModal}
          onClose={() => setProjModal(null)}
          onSave={onProjSaved}
        />
      )}

      {/* Archive Confirm */}
      {archiveId !== null && (
        <div className="modal-overlay" onClick={() => setArchiveId(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <div className="modal-title">🗑️ Archive Cost Sheet</div>
              <button className="modal-close" onClick={() => setArchiveId(null)}>✕</button>
            </div>
            <div className="modal-bd">
              <p style={{ margin: 0, color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>
                This cost sheet will be marked as <strong>Archived</strong> and hidden from active views.
                You can restore it by filtering by "Archived" status.
              </p>
            </div>
            <div className="modal-ft">
              <button className="btn-secondary" onClick={() => setArchiveId(null)}>Cancel</button>
              <button className="btn-primary" style={{ background: 'var(--r2)', borderColor: 'var(--r2)' }}
                onClick={() => handleArchive(archiveId)} disabled={archiving}>
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
