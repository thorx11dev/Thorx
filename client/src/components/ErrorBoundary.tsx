import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI. If omitted, the default THORX error card is shown. */
  fallback?: ReactNode;
  /** Scope label shown in the error card (e.g. "User Portal", "Admin Panel") */
  scope?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  /** True once the one-shot auto-reload has been scheduled for module-fetch errors. */
  autoReloadScheduled: boolean;
}

/**
 * React ErrorBoundary — catches any unhandled runtime error in the component
 * tree and renders a recovery UI instead of white-screening the entire app.
 *
 * Audit finding 2-H: no ErrorBoundary existed anywhere in the application.
 *
 * Usage:
 *   <ErrorBoundary scope="User Portal">
 *     <UserPortal />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, autoReloadScheduled: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, autoReloadScheduled: false };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Structured log — structured logger will pick this up in production
    // Only log details in development — never expose stack traces in production console
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary] Caught error:", {
        scope: this.props.scope ?? "unknown",
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      });
    }

    // A failed dynamic import (dev-proxy hiccup) leaves React.lazy permanently
    // in its rejected state — a state reset can never recover it because the
    // loader promise is cached. Reload the document once to get a fresh module
    // map; the portal pre-fetches every lazy chunk at boot, so the reloaded
    // page navigates without further network fetches.
    if (this.isModuleFetchError(error) && !this.state.autoReloadScheduled) {
      this.setState({ autoReloadScheduled: true });
      window.setTimeout(() => {
        window.location.reload();
      }, 1200);
    }
  }

  private isModuleFetchError(error?: Error): boolean {
    return !!error && error.message.includes("Failed to fetch dynamically imported module");
  }

  private handleReset = () => {
    // React.lazy caches a rejected loader, so re-rendering the children just
    // re-throws the identical error — only a fresh document (new module map)
    // can retry the fetch. "Try Again" therefore reloads for module errors.
    if (this.isModuleFetchError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <div className="max-w-md w-full border-2 border-black rounded-2xl p-8 bg-white shadow-[4px_4px_0px_#141413]">
            <div className="flex items-center justify-center w-16 h-16 bg-red-100 border-2 border-red-500 rounded-full mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tight text-zinc-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-zinc-500 mb-1">
              {this.props.scope
                ? `The ${this.props.scope} encountered an unexpected error.`
                : "An unexpected error occurred."}
            </p>
            <p className="text-xs text-zinc-400 mb-6">
              Your data is safe. Please refresh the page to continue.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 text-sm font-black uppercase bg-primary text-white rounded-lg border-2 border-black shadow-[2px_2px_0px_#141413] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-black uppercase bg-white text-zinc-900 rounded-lg border-2 border-black shadow-[2px_2px_0px_#141413] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
              >
                Full Refresh
              </button>
            </div>
            {this.state.autoReloadScheduled && (
              <p className="mt-3 text-xs font-semibold text-primary">
                Reconnecting automatically… if this persists, press Full Refresh.
              </p>
            )}
            {process.env.NODE_ENV !== "production" && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-xs font-bold text-zinc-400 cursor-pointer">
                  Error details (dev only)
                </summary>
                <pre className="mt-2 text-[10px] text-red-500 bg-red-50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
