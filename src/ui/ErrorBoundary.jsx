import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Optional: still log to console for devtools
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b', padding: 12, borderRadius: 8 }}>
            <strong>UI crashed:</strong>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{String(this.state.error?.message || this.state.error)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
