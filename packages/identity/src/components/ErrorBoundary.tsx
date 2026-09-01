import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Host hook, called once with the error that tore the tree down. */
  onError?: (err: unknown) => void;
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
    console.error("[stawi/identity] Error:", error, info.componentStack);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="aiw-error" role="alert" aria-live="assertive">
          Something went wrong: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}
