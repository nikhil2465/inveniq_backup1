import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[InvenIQ] Uncaught error:', error, info.componentStack);
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', gap: 16,
          padding: '40px 24px', fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28,
            background: '#fee2e2', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24,
          }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', textAlign: 'center' }}>
            This view encountered an error
          </div>
          <div style={{
            color: '#6b7280', fontSize: 13, maxWidth: 420,
            textAlign: 'center', lineHeight: 1.6,
          }}>
            {this.state.error?.message || 'An unexpected error occurred. The rest of the application is still working.'}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={() => this.handleReset()}
              style={{
                background: '#15803d', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 22px', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, fontFamily: 'Inter, sans-serif',
              }}
            >
              ← Back to Overview
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb',
                borderRadius: 8, padding: '10px 22px', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, fontFamily: 'Inter, sans-serif',
              }}
            >
              Try Again
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{
              marginTop: 16, maxWidth: 600, width: '100%',
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 8, padding: '10px 14px',
            }}>
              <summary style={{ fontSize: 11, color: '#94a3b8', cursor: 'pointer', fontFamily: 'monospace' }}>
                Error details (dev only)
              </summary>
              <pre style={{ fontSize: 11, color: '#dc2626', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
