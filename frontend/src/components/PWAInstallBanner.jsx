import React, { useState, useEffect } from 'react';

const DISMISS_KEY = 'inveniq-pwa-dismissed';
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;
const isDismissed = () => {
  const ts = localStorage.getItem(DISMISS_KEY);
  return ts ? Date.now() - Number(ts) < DISMISS_TTL : false;
};

export default function PWAInstallBanner() {
  const [prompt, setPrompt]   = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    if (isIOS()) {
      setIosMode(true);
      setVisible(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
  };

  return (
    <div style={S.banner}>
      <div style={S.left}>
        <div style={S.logo}>
          <svg viewBox="0 0 24 24" width={28} height={28} fill="none">
            <rect x="1" y="1" width="10" height="10" rx="2" fill="white" opacity=".95"/>
            <rect x="13" y="1" width="10" height="10" rx="2" fill="white" opacity=".6"/>
            <rect x="1" y="13" width="10" height="10" rx="2" fill="white" opacity=".6"/>
            <rect x="13" y="13" width="10" height="10" rx="2" fill="white" opacity=".95"/>
          </svg>
        </div>
        <div>
          <div style={S.title}>Install InvenIQ</div>
          {iosMode
            ? <div style={S.sub}>Tap <strong style={S.em}>Share</strong> then <strong style={S.em}>Add to Home Screen</strong></div>
            : <div style={S.sub}>Works offline &middot; Fast &middot; No App Store needed</div>
          }
        </div>
      </div>
      <div style={S.right}>
        {!iosMode && (
          <button onClick={install} style={S.installBtn}>Install</button>
        )}
        <button onClick={dismiss} style={S.closeBtn} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}

const S = {
  banner: {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
    color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', gap: 12,
    boxShadow: '0 -4px 24px rgba(0,0,0,.28)',
    borderTop: '1px solid rgba(255,255,255,.12)',
  },
  left:  { display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 },
  logo:  { flexShrink: 0 },
  title: { fontWeight: 700, fontSize: 15, marginBottom: 3, letterSpacing: '-.01em' },
  sub:   { fontSize: 13, opacity: 0.88, fontWeight: 400 },
  em:    { fontWeight: 700, color: '#bbf7d0' },
  right: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  installBtn: {
    background: '#fff', color: '#15803d', border: 'none',
    borderRadius: 8, padding: '8px 22px',
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff',
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontSize: 14, fontWeight: 600,
  },
};
