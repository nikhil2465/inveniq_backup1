import React, { useState, useCallback, useEffect, useRef } from 'react';

let _showToast = null;

export function showToast(msg, type = 'info', duration = 4000) {
  if (_showToast) _showToast({ msg, type, duration });
}

const ICONS = {
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
};

function ToastItem({ id, msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`toast ${type}`} role="alert">
      <span style={{ fontSize: 16, flexShrink: 0 }}>{ICONS[type] || '•'}</span>
      <div className="toast-body">
        <div className="toast-msg">{msg}</div>
      </div>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 0 0 4px', flexShrink: 0 }}
        aria-label="Dismiss"
      >✕</button>
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const show = useCallback(({ msg, type }) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, msg, type }]);
  }, []);

  useEffect(() => { _showToast = show; return () => { _showToast = null; }; }, [show]);

  const close = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastItem key={t.id} {...t} onClose={() => close(t.id)} />
      ))}
    </div>
  );
}
