import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[profile] Error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <div className="aiw-error">Something went wrong: {this.state.error}</div>;
    }
    return this.props.children;
  }
}
