import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

class Boundary extends Component<{ children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    return this.state.err
      ? <pre style={{ padding: 16, whiteSpace: 'pre-wrap' }}>{String(this.state.err.stack)}</pre>
      : this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<Boundary><App /></Boundary>);