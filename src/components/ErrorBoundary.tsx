import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">Something went wrong</h1>
          <p className="text-zinc-400 max-w-md mb-8">
            We encountered an unexpected error. This usually happens if there's a problem loading data or saving your progress.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                // Clear potentially corrupted local storage
                localStorage.removeItem('sahrae_watch_progress');
                window.location.reload();
              }}
              className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-amber-950 font-bold rounded-lg hover:bg-amber-400 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Reset & Reload
            </button>
          </div>
          {this.state.error && (
            <div className="mt-12 p-4 bg-zinc-900 rounded-lg max-w-2xl w-full text-left overflow-auto">
              <p className="text-red-400 font-mono text-sm">{this.state.error.toString()}</p>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
