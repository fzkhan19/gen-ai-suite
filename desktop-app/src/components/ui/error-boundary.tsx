
"use client";

import { AlertTriangle } from "lucide-react";
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
            <h3 className="font-semibold text-red-500">Something went wrong</h3>
            <p className="text-xs text-red-400/80 max-w-[200px] truncate">
                {this.state.error?.message}
            </p>
        </div>
      );
    }

    return this.props.children;
  }
}
