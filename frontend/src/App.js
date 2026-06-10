import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import PageLoader from './components/PageLoader';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';
import PWAInstallBanner from './components/PWAInstallBanner';
import Login from './views/Login';
import { isAuthenticated, getUser, setAuth, clearAuth, installFetchInterceptor, getAllowedModules } from './utils/authUtils';
import AIDockPanel from './components/AIDockPanel';

// Returns the best landing view given the user's allowed module list.
// null = unrestricted (admin) → overview; restricted → first preferred module available.
function getDefaultView(allowedModules) {
  if (!allowedModules) return 'overview';
  const preferred = ['designquote', 'overview', 'quotes', 'customers', 'catalog', 'chatbot', 'settings', 'about'];
  for (const v of preferred) {
    if (allowedModules.includes(v)) return v;
  }
  return allowedModules[0] || 'settings';
}

// Lazy-loaded views — each chunk only loads when first navigated to,
// reducing the initial JS bundle from ~2 MB to ~200 KB.
const Overview          = lazy(() => import('./views/Overview'));
const Inventory         = lazy(() => import('./views/Inventory'));
const DeadStock         = lazy(() => import('./views/DeadStock'));
const Inward            = lazy(() => import('./views/Inward'));
const Sales             = lazy(() => import('./views/Sales'));
const Customers         = lazy(() => import('./views/Customers'));
const Orders            = lazy(() => import('./views/Orders'));
const Procurement       = lazy(() => import('./views/Procurement'));
const POGRN             = lazy(() => import('./views/POGRN'));
const Freight           = lazy(() => import('./views/Freight'));
const Finance           = lazy(() => import('./views/Finance'));
const Demand            = lazy(() => import('./views/Demand'));
const AIAssistant       = lazy(() => import('./views/AIAssistant'));
const DistributorDiscount = lazy(() => import('./views/DistributorDiscount'));
const SalesOrders       = lazy(() => import('./views/SalesOrders'));
const CustomerClaims    = lazy(() => import('./views/CustomerClaims'));
const Analytics         = lazy(() => import('./views/Analytics'));
const ProductCatalog    = lazy(() => import('./views/ProductCatalog'));
const ProjectTracker    = lazy(() => import('./views/ProjectTracker'));
const QuoteBuilder      = lazy(() => import('./views/QuoteBuilder'));
const About             = lazy(() => import('./views/About'));
const Settings          = lazy(() => import('./views/Settings'));
const CreditManagement  = lazy(() => import('./views/CreditManagement'));
const CounterPOS        = lazy(() => import('./views/CounterPOS'));
const SchemeManagement  = lazy(() => import('./views/SchemeManagement'));
const Warehouse         = lazy(() => import('./views/Warehouse'));
const TallyExport       = lazy(() => import('./views/TallyExport'));
const SalesReturn       = lazy(() => import('./views/SalesReturn'));
const LandingCost       = lazy(() => import('./views/LandingCost'));
const DistributorPortal = lazy(() => import('./views/DistributorPortal'));
const DamageRecording      = lazy(() => import('./views/DamageRecording'));
const PurchaseRequisition  = lazy(() => import('./views/PurchaseRequisition'));
const QCInspection         = lazy(() => import('./views/QCInspection'));
const InvoiceMatching      = lazy(() => import('./views/InvoiceMatching'));
const DesignQuoteBuilder   = lazy(() => import('./views/DesignQuoteBuilder'));
const Invoices             = lazy(() => import('./views/Invoices'));
const Reports              = lazy(() => import('./views/Reports'));
const VIEW_TITLES = {
  credit:      'Credit Management — Limits · Overdue · PDC Tracking',
  pos:         'Counter POS — Walk-In Sales & Fast Billing',
  overview:    'Business Overview — AI Intelligence Dashboard',
  inventory:   'Stock Intelligence — AI Inventory Analysis',
  deadstock:   'Dead Stock & Ageing — Cash Recovery Plan',
  inward:      'Inward & Outward — Stock Movement Intelligence',
  sales:       'Sales Performance — Revenue & Margin Intelligence',
  customers:   'Customer Intelligence — Know Every Account',
  orders:      'Orders & Fulfilment Intelligence',
  claims:      'Customer Claims & Rebate Management — Volume · Accrual · Lumpsum',
  procurement: 'Supplier & Procurement Intelligence',
  pogrn:       'PO & GRN — End-to-End Procurement Lifecycle',
  freight:     'Freight Planning — AI-Optimized Logistics',
  finance:     'Profitability & Cash Intelligence — Owner View',
  demand:      'Demand Forecasting — What Will Sell Next?',
  chatbot:     'InvenIQ AI — Ask Anything About Your Business',
  discounts:   'Distributor Discount Calculator — Smart Pricing with Margin Guardrails',
  louvers:     'Sales Orders — Orders, Claims & Rebates Management',
  analytics:   'Analytics & Business Intelligence — Full Business View',
  catalog:     'Product Catalog — Louvers · Laminates · ACP · Cladding',
  projects:    'Project Tracker — Full Pipeline from Inquiry to Invoice',
  quotes:      'Quotation Builder — AI-Powered Professional Quotes',
  about:       'About InvenIQ — AI Inventory Intelligence Platform',
  settings:    'Settings & System Status — Configuration · Health · Module Registry',
  tally:        'Tally Prime Export — Export Data as Tally-Compatible CSV Files',
  schemes:      'Scheme Management — Promotions · Targets · Accruals',
  warehouse:    'Warehouse Management — Capacity · GRN Activity · Stock Distribution',
  salesreturn:  'Sales Return — UOM Conversion · Credit Notes · Accounting Entries',
  landingcost:  'Landing Cost — Labour · Custom Duty · Freight · All Charge Heads',
  distributor:  'My Stock Portal — Distributor Inventory View',
  damage:       'Damage Recording — GRN Inward · Transit SO · Insurance Claims · Accounting',
  pr:           'Purchase Requisition — Material Requests · Approval Workflow · PO Conversion',
  qc:           'QC Inspection — Post-GRN Quality Control · Accept to Inventory · RTV',
  invoicematch: 'Invoice Matching — 3-Way Match: PO · GRN · Invoice · AP Approval',
  designquote:  'Design Quote Studio — Hardware & Sanitary Fit-Out BOQ · Architect Fee Proposals',
  invoices:     'Sales Invoices — GST-Compliant Billing · IGST/CGST/SGST · Payments',
  reports:      'Management Reports — Sales · GST Summary · AR Aging · Stock Valuation',
};

export default function App() {
  // Auth state — initialised from localStorage so page reload stays logged in.
  // allowedModules: null = unrestricted (admin); string[] = restricted client list.
  const [authState, setAuthState] = useState(() => {
    const allowedModules = getAllowedModules();
    return { authenticated: isAuthenticated(), user: getUser(), allowedModules };
  });

  // Default view: overview for unrestricted; first preferred allowed view for restricted users.
  const [activeView, setActiveView] = useState(() => getDefaultView(getAllowedModules()));
  const [period, setPeriod]                     = useState('Today');
  const [pendingChatQuery, setPendingChatQuery] = useState('');
  const [dbStatus, setDbStatus]                 = useState({ status: 'checking', source: null, checkedAt: null });
  const [alerts, setAlerts]                     = useState([]);
  const [sidebarOpen, setSidebarOpen]           = useState(false);
  const [goMode, setGoMode]                     = useState(false);

  // AI side panel state — open/minimized are independent of activeView
  const [aiOpen, setAiOpen]   = useState(false);
  const [aiMin,  setAiMin]    = useState(false);

  // Install the global fetch interceptor once — adds Bearer token to every /api/* call
  // and fires 'inveniq:auth-expired' on 401 so the handler below can force logout.
  useEffect(() => {
    installFetchInterceptor();
    const handleExpired = () => {
      setAuthState({ authenticated: false, user: null, allowedModules: null });
    };
    window.addEventListener('inveniq:auth-expired', handleExpired);
    return () => window.removeEventListener('inveniq:auth-expired', handleExpired);
  }, []);

  // Restore saved theme preference on load
  useEffect(() => {
    const saved = localStorage.getItem('inviq-theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark-mode');
    } else if (saved === 'light') {
      document.documentElement.classList.add('light-mode');
    }
  }, []);

  // Poll /api/health every 60 s to know if MySQL is live or demo mode
  // Only when authenticated — health endpoint is public but no point polling pre-login.
  useEffect(() => {
    if (!authState.authenticated) return;
    let cancelled = false;
    const check = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8_000);
      try {
        const res = await fetch('/api/health', { signal: ctrl.signal });
        if (!res.ok) throw new Error('non-2xx');
        const data = await res.json();
        if (!cancelled) {
          setDbStatus({
            status: data.mysql_connected ? 'live' : 'demo',
            source: data.data_source || 'mock',
            checkedAt: new Date().toISOString(),
          });
        }
      } catch {
        if (!cancelled) {
          setDbStatus({ status: 'demo', source: 'mock', checkedAt: new Date().toISOString() });
        }
      } finally {
        clearTimeout(timer);
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [authState.authenticated]);

  // Poll /api/alerts every 5 min for notification bell — only when authenticated
  useEffect(() => {
    if (!authState.authenticated) return;
    let cancelled = false;
    const fetchAlerts = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8_000);
      try {
        const res = await fetch('/api/alerts', { signal: ctrl.signal });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setAlerts(data.alerts || []);
        }
      } catch { /* non-fatal */ } finally {
        clearTimeout(timer);
      }
    };
    fetchAlerts();
    const id = setInterval(fetchAlerts, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [authState.authenticated]);

  // Scroll main content back to top whenever the user navigates to a new view
  useEffect(() => {
    const el = document.querySelector('.main');
    if (el) el.scrollTop = 0;
  }, [activeView]);

  // GitHub-style keyboard navigation: press "g" then a letter.
  // Restricted users can only navigate to their allowed modules via shortcut.
  useEffect(() => {
    const allowedMods = authState.allowedModules;
    const GO_MAP = {
      h: 'overview',  i: 'inventory', s: 'sales',      c: 'customers',
      o: 'orders',    f: 'finance',   d: 'demand',      p: 'procurement',
      r: 'freight',   w: 'inward',    z: 'deadstock',   a: 'analytics',
      q: 'quotes',    x: 'chatbot',   e: 'settings',    u: 'pogrn',
      l: 'louvers',   n: 'discounts', t: 'projects',    m: 'claims',
      b: 'catalog',   k: 'credit',    v: 'pos',         y: 'schemes',
      j: 'about',     g: 'warehouse', '1': 'tally',
      '2': 'salesreturn', '3': 'landingcost', '4': 'distributor', '5': 'damage',
      '6': 'pr', '7': 'qc', '8': 'invoicematch', '9': 'invoices', '0': 'reports', '-': 'designquote',
    };
    let active = false;
    let goTimer = null;
    const exitGoMode = () => {
      active = false;
      setGoMode(false);
      clearTimeout(goTimer);
    };
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if (e.target?.contentEditable === 'true') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { exitGoMode(); return; }
      if (e.key === 'g' && !active) {
        active = true;
        setGoMode(true);
        clearTimeout(goTimer);
        goTimer = setTimeout(exitGoMode, 2000);
        return;
      }
      if (active) {
        exitGoMode();
        const view = GO_MAP[e.key];
        // Enforce module restriction — restricted users can only navigate to allowed views
        if (view && (!allowedMods || allowedMods.includes(view))) {
          setActiveView(view);
          setSidebarOpen(false);
        }
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); clearTimeout(goTimer); };
  }, [authState.allowedModules]);

  const handleLoginSuccess = useCallback((token, user, refreshToken = null) => {
    setAuth(token, user, refreshToken);
    // Parse allowed_modules from the user object (mirrors what the JWT contains)
    const raw = user.allowed_modules;
    const allowedModules = (!raw || raw === 'all')
      ? null
      : typeof raw === 'string' ? raw.split(',').map(m => m.trim()).filter(Boolean) : raw || null;
    setAuthState({ authenticated: true, user, allowedModules });
    // Land restricted users on their first accessible view instead of overview
    setActiveView(getDefaultView(allowedModules));
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setAuthState({ authenticated: false, user: null, allowedModules: null });
    // Fire-and-forget — server-side logout is stateless, ignore errors
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }, []);

  // goChat opens the side panel with a pre-composed prompt instead of full-screen navigation
  const goChat = useCallback((query) => {
    setPendingChatQuery(query);
    setAiOpen(true);
    setAiMin(false);
  }, []);

  const clearPendingQuery = useCallback(() => setPendingChatQuery(''), []);

  // Navigation interceptor — chatbot item opens the side panel instead of replacing the view
  const handleNavigate = useCallback((view) => {
    if (view === 'chatbot') {
      setAiOpen(true);
      setAiMin(false);
    } else {
      setActiveView(view);
    }
    setSidebarOpen(false);
  }, []);

  // Show login screen when not authenticated — conditional JSX, not early return
  // (all hooks above have already run unconditionally — this is safe per React rules)
  if (!authState.authenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div>
      {/* Mobile sidebar backdrop */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        activeView={activeView}
        onNavigate={handleNavigate}
        dbStatus={dbStatus}
        isOpen={sidebarOpen}
        alerts={alerts}
        allowedModules={authState.allowedModules}
        currentUser={authState.user}
      />
      <Topbar
        title={VIEW_TITLES[activeView] || 'InvenIQ — Enterprise Inventory Intelligence'}
        period={period}
        onPeriodChange={setPeriod}
        alerts={alerts}
        onGoChat={goChat}
        onNavigate={handleNavigate}
        dbStatus={dbStatus}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onLogout={handleLogout}
        currentUser={authState.user}
        allowedModules={authState.allowedModules}
        aiPanelOpen={aiOpen && !aiMin}
        aiPanelMin={aiOpen && aiMin}
      />
      <ToastContainer />
      <AIDockPanel
        open={aiOpen}
        minimized={aiMin}
        onClose={() => { setAiOpen(false); setAiMin(false); }}
        onMinimize={() => setAiMin(true)}
        onExpand={() => { setAiOpen(true); setAiMin(false); }}
        pendingQuery={pendingChatQuery}
        onPendingQueryConsumed={clearPendingQuery}
      />
      <PWAInstallBanner />
      {goMode && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,.92)', color: '#e2e8f0', padding: '10px 20px',
          borderRadius: 10, fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 10, zIndex: 9999,
          boxShadow: '0 8px 32px rgba(0,0,0,.4)', backdropFilter: 'blur(8px)',
          animation: 'goModeIn .15s ease',
        }}>
          <span style={{ background: '#16a34a', padding: '2px 8px', borderRadius: 6, fontSize: 11, color: '#fff' }}>g</span>
          Type a key · h=home · i=inventory · s=sales · c=customers · f=finance · x=AI · e=settings · b=catalog · k=credit · v=pos · y=schemes · g=warehouse · 1=tally · 2=sales-ret · 3=landing · 4=dist · 5=damage · 6=pr · 7=qc · 8=invoice-match · 9=invoices · 0=reports · -=design-quote
          <span style={{ marginLeft: 8, opacity: .6, fontSize: 11 }}>· Press <strong>?</strong> for full shortcuts</span>
        </div>
      )}
      <main className={`main${aiOpen && !aiMin ? ' sp-open' : ''}${aiOpen && aiMin ? ' sp-min' : ''}`}>
        <Suspense fallback={<PageLoader />}>
          <ErrorBoundary key={activeView} onReset={() => setActiveView('overview')}>
            {activeView === 'overview'    && <Overview     onGoChat={goChat} dbStatus={dbStatus} onNavigate={setActiveView} period={period} />}
            {activeView === 'inventory'   && <Inventory    onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'deadstock'   && <DeadStock    onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'inward'      && <Inward       onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'sales'       && <Sales        onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'customers'   && <Customers    onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'orders'      && <Orders       onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'claims'      && <CustomerClaims onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'procurement' && <Procurement  onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'pogrn'       && <POGRN        onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'freight'     && <Freight      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'finance'     && <Finance      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'demand'      && <Demand       onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'chatbot'     && (
              <AIAssistant
                pendingQuery={pendingChatQuery}
                onPendingQueryConsumed={clearPendingQuery}
                dbStatus={dbStatus}
              />
            )}
            {activeView === 'discounts'   && <DistributorDiscount onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'louvers'     && <SalesOrders         onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'analytics'   && <Analytics           onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'catalog'     && <ProductCatalog      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'projects'    && <ProjectTracker      onGoChat={goChat} dbStatus={dbStatus} period={period} onNavigate={setActiveView} />}
            {activeView === 'quotes'      && <QuoteBuilder        onGoChat={goChat} dbStatus={dbStatus} period={period} onNavigate={setActiveView} />}
            {activeView === 'credit'      && <CreditManagement  onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'pos'         && <CounterPOS        onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'schemes'     && <SchemeManagement  onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'warehouse'   && <Warehouse         onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'about'        && <About onGoChat={goChat} />}
            {activeView === 'settings'    && <Settings onGoChat={goChat} onNavigate={setActiveView} dbStatus={dbStatus} currentUser={authState.user} allowedModules={authState.allowedModules} />}
            {activeView === 'tally'       && <TallyExport onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'salesreturn' && <SalesReturn onGoChat={goChat} dbStatus={dbStatus} period={period} onNavigate={setActiveView} />}
            {activeView === 'landingcost' && <LandingCost onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'distributor' && <DistributorPortal onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'damage'        && <DamageRecording      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'pr'            && <PurchaseRequisition  onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'qc'            && <QCInspection         onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'invoicematch'  && <InvoiceMatching      onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'designquote'  && <DesignQuoteBuilder   onGoChat={goChat} dbStatus={dbStatus} currentUser={authState.user} />}
            {activeView === 'invoices'     && <Invoices             onGoChat={goChat} dbStatus={dbStatus} period={period} />}
            {activeView === 'reports'      && <Reports              onGoChat={goChat} dbStatus={dbStatus} period={period} />}
          </ErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
