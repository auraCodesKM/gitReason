import { Component } from "react";

export class GraphErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Codebase graph failed to render:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <ul className="analyze-diagram-fallback graph-error-fallback">
          {(this.props.nodes || []).map((n) => (
            <li key={n.id}>
              {this.props.onOpenFile ? (
                <button type="button" onClick={() => this.props.onOpenFile(n.path)}>{n.label}</button>
              ) : (
                <span>{n.label}</span>
              )}
              <span className="analyze-diagram-fallback-path">{n.path}</span>
            </li>
          ))}
        </ul>
      );
    }
    return this.props.children;
  }
}
