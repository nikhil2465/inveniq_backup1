import React, { useState, useRef, useEffect } from 'react';

/**
 * Login screen for InvenIQ — dark-branded, accessible, keyboard-friendly.
 * Calls POST /api/auth/login; on success invokes onLoginSuccess(token, user).
 */
export default function Login({ onLoginSuccess }) {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const usernameRef               = useRef(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Invalid username or password.');
        setLoading(false);
        return;
      }
      onLoginSuccess(data.access_token, data.user);
    } catch {
      setError('Unable to connect to server. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Logo / brand */}
        <div style={styles.brandRow}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect width="36" height="36" rx="10" fill="#15803d"/>
            <path d="M8 26L14 10h3l4 10 4-10h3l6 16h-3.5l-4-10.8-4 10.8H19l-4-10.8L11.5 26H8z"
                  fill="white" fillOpacity=".95"/>
          </svg>
          <span style={styles.brandName}>InvenIQ</span>
        </div>
        <p style={styles.tagline}>Inventory Intelligence Platform</p>

        <h1 style={styles.heading}>Sign in to your account</h1>

        {error && (
          <div style={styles.errorBox} role="alert">
            <span style={styles.errorIcon}>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          <label style={styles.label} htmlFor="login-username">Username</label>
          <input
            id="login-username"
            ref={usernameRef}
            style={styles.input}
            type="text"
            autoComplete="username"
            placeholder="Enter username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            disabled={loading}
          />

          <label style={styles.label} htmlFor="login-password">Password</label>
          <div style={styles.pwdWrapper}>
            <input
              id="login-password"
              style={{ ...styles.input, paddingRight: '2.8rem', margin: 0 }}
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              style={styles.eyeBtn}
              onClick={() => setShowPwd(v => !v)}
              aria-label={showPwd ? 'Hide password' : 'Show password'}
              tabIndex={0}
            >
              {showPwd ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          <button type="submit" style={loading ? { ...styles.submitBtn, opacity: 0.7 } : styles.submitBtn} disabled={loading}>
            {loading ? (
              <span style={styles.spinnerRow}>
                <span style={styles.spinner} /> Signing in…
              </span>
            ) : 'Sign in'}
          </button>
        </form>

      </div>

      <p style={styles.footer}>InvenIQ · © 2026</p>

      <style>{`
        @keyframes iq-spin { to { transform: rotate(360deg); } }
        @keyframes iq-fadein { from { opacity:0; transform:translateY(16px);} to { opacity:1; transform:translateY(0);} }
      `}</style>
    </div>
  );
}

const styles = {
  overlay: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0a0f0a 0%, #0d1a0e 50%, #0a120b 100%)',
    padding: '1.5rem',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#111b12',
    border: '1px solid #1e3320',
    borderRadius: '16px',
    padding: '2.5rem 2rem',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    animation: 'iq-fadein 0.35s ease both',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.35rem',
  },
  brandName: {
    fontSize: '1.6rem',
    fontWeight: 800,
    color: '#e9fbe9',
    letterSpacing: '-0.02em',
    fontFamily: 'Inter, sans-serif',
  },
  tagline: {
    fontSize: '0.82rem',
    color: '#5a8f60',
    marginBottom: '2rem',
    fontFamily: 'Inter, sans-serif',
  },
  heading: {
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#c8e6c9',
    marginBottom: '1.25rem',
    fontFamily: 'Inter, sans-serif',
  },
  errorBox: {
    background: '#1f0909',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    borderRadius: '8px',
    padding: '0.65rem 0.9rem',
    fontSize: '0.83rem',
    marginBottom: '1rem',
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  errorIcon: { fontSize: '1rem' },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
  },
  label: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: '#6dbf6d',
    marginBottom: '0.35rem',
    marginTop: '0.85rem',
    fontFamily: 'Inter, sans-serif',
    letterSpacing: '0.01em',
  },
  input: {
    width: '100%',
    padding: '0.65rem 0.85rem',
    background: '#0d160e',
    border: '1px solid #1e3320',
    borderRadius: '8px',
    color: '#e9fbe9',
    fontSize: '0.9rem',
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
    marginBottom: '0.1rem',
  },
  pwdWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  eyeBtn: {
    position: 'absolute',
    right: '0.6rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#4a7a4e',
    padding: '0.2rem',
    display: 'flex',
    alignItems: 'center',
    lineHeight: 1,
  },
  submitBtn: {
    marginTop: '1.5rem',
    width: '100%',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    letterSpacing: '0.01em',
    transition: 'opacity 0.15s',
  },
  spinnerRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'iq-spin 0.6s linear infinite',
  },
  demoBox: {
    marginTop: '1.75rem',
    background: '#0a120b',
    border: '1px solid #1a2e1b',
    borderRadius: '8px',
    padding: '0.85rem 1rem',
  },
  demoLabel: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: '#4a7a4e',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: '0.5rem',
    fontFamily: 'Inter, sans-serif',
  },
  demoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  demoKey: {
    fontSize: '0.78rem',
    color: '#5a8f60',
    width: '64px',
    fontFamily: 'Inter, sans-serif',
  },
  demoVal: {
    fontSize: '0.78rem',
    color: '#a7d7a8',
    fontFamily: 'JetBrains Mono, monospace',
    background: '#0d160e',
    padding: '0.08rem 0.35rem',
    borderRadius: '3px',
    border: '1px solid #1e3320',
  },
  demoTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '0.2rem',
  },
  demoTh: {
    fontSize: '0.68rem',
    fontWeight: 700,
    color: '#3d6641',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '0.2rem 0.3rem',
    textAlign: 'left',
    fontFamily: 'Inter, sans-serif',
    borderBottom: '1px solid #1a2e1b',
  },
  demoTr: {
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  demoTd: {
    fontSize: '0.75rem',
    color: '#5a8f60',
    padding: '0.25rem 0.3rem',
    fontFamily: 'Inter, sans-serif',
    borderBottom: '1px solid #111d13',
  },
  footer: {
    marginTop: '1.5rem',
    fontSize: '0.73rem',
    color: '#2d4f30',
    fontFamily: 'Inter, sans-serif',
    textAlign: 'center',
  },
};
