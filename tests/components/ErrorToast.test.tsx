/**
 * Tests for ErrorToast component
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '../test-utils';
import ErrorToast from '../../frontend/components/ErrorToast/ErrorToast';
import { errorService } from '../../frontend/services/error-service';

describe('ErrorToast', () => {
  it('should not render when no error', () => {
    const { container } = render(<ErrorToast />);

    // Snackbar is hidden by default
    expect(container.querySelector('[role="presentation"]')).not.toBeInTheDocument();
  });

  it('should display error when errorService emits', async () => {
    render(<ErrorToast />);

    // Trigger an error
    errorService.showError({
      title: 'Test Error',
      message: 'Something went wrong',
      severity: 'error',
    });

    // Wait for toast to appear
    await waitFor(() => {
      expect(screen.getByText('Test Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  it('should display success message', async () => {
    render(<ErrorToast />);

    errorService.showSuccess('Operation completed', 'Success');

    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Operation completed')).toBeInTheDocument();
    });
  });

  it('should display warning message', async () => {
    render(<ErrorToast />);

    errorService.showWarning('Be careful', 'Warning');

    await waitFor(() => {
      expect(screen.getByText('Warning')).toBeInTheDocument();
      expect(screen.getByText('Be careful')).toBeInTheDocument();
    });
  });

  it('should call action handler when action button clicked', async () => {
    const actionHandler = vi.fn();
    render(<ErrorToast />);

    errorService.showError({
      title: 'Error',
      message: 'Something failed',
      severity: 'error',
      action: {
        label: 'Retry',
        handler: actionHandler,
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    const retryButton = screen.getByText('Retry');
    retryButton.click();

    expect(actionHandler).toHaveBeenCalled();
  });
});
