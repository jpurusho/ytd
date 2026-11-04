/**
 * Centralized error handling service for the frontend
 *
 * Provides consistent error display, logging, and recovery suggestions
 * for all errors in the application.
 */

export interface ErrorDetails {
  message: string;
  title?: string;
  details?: string;
  action?: {
    label: string;
    handler: () => void;
  };
  severity?: 'info' | 'warning' | 'error';
}

type ErrorListener = (error: ErrorDetails) => void;

class ErrorService {
  private listeners: Set<ErrorListener> = new Set();

  /**
   * Register a listener for error notifications
   * Used by toast notification system to display errors
   */
  onError(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Show an error to the user via toast notification
   */
  showError(error: ErrorDetails): void {
    // Notify all registered listeners (toast system)
    this.listeners.forEach(listener => listener(error));

    // Also log to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorService]', error.title || error.message, error.details);
    }
  }

  /**
   * Handle caught errors with user-friendly messages
   */
  handleError(error: unknown, context?: string): void {
    const errorDetails = this.parseError(error, context);
    this.showError(errorDetails);
  }

  /**
   * Parse any error into a user-friendly ErrorDetails object
   */
  private parseError(error: unknown, context?: string): ErrorDetails {
    // Handle Error objects
    if (error instanceof Error) {
      return {
        title: context || 'Error',
        message: error.message,
        details: error.stack,
        severity: 'error',
      };
    }

    // Handle string errors
    if (typeof error === 'string') {
      return {
        title: context || 'Error',
        message: error,
        severity: 'error',
      };
    }

    // Handle structured error objects
    if (error && typeof error === 'object' && 'message' in error) {
      return {
        title: context || 'Error',
        message: String(error.message),
        details: 'details' in error ? String(error.details) : undefined,
        severity: 'error',
      };
    }

    // Fallback for unknown error types
    return {
      title: context || 'Unknown Error',
      message: 'An unexpected error occurred',
      details: String(error),
      severity: 'error',
    };
  }

  /**
   * Show a success message to the user
   */
  showSuccess(message: string, title?: string): void {
    this.showError({
      title: title || 'Success',
      message,
      severity: 'info',
    });
  }

  /**
   * Show a warning message to the user
   */
  showWarning(message: string, title?: string): void {
    this.showError({
      title: title || 'Warning',
      message,
      severity: 'warning',
    });
  }

  /**
   * Create an error with a recovery action
   */
  showErrorWithAction(
    message: string,
    actionLabel: string,
    actionHandler: () => void,
    title?: string
  ): void {
    this.showError({
      title: title || 'Error',
      message,
      severity: 'error',
      action: {
        label: actionLabel,
        handler: actionHandler,
      },
    });
  }
}

// Singleton instance
export const errorService = new ErrorService();

/**
 * React hook for error handling
 * Usage: const handleError = useErrorHandler();
 */
export function useErrorHandler(context?: string) {
  return (error: unknown) => {
    errorService.handleError(error, context);
  };
}
