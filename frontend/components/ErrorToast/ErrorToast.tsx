import React, { useState, useEffect } from 'react';
import { Snackbar, Alert, AlertTitle, Button } from '@mui/material';
import { errorService, type ErrorDetails } from '../../services/error-service';

/**
 * Toast notification system for displaying errors
 * Automatically subscribes to errorService and displays notifications
 */
export default function ErrorToast() {
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Subscribe to error service
    const unsubscribe = errorService.onError((errorDetails) => {
      setError(errorDetails);
      setOpen(true);
    });

    return unsubscribe;
  }, []);

  const handleClose = () => {
    setOpen(false);
  };

  const handleAction = () => {
    error?.action?.handler();
    handleClose();
  };

  if (!error) return null;

  return (
    <Snackbar
      open={open}
      autoHideDuration={error.severity === 'error' ? 6000 : 3000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert
        onClose={handleClose}
        severity={error.severity || 'error'}
        variant="filled"
        action={
          error.action ? (
            <Button color="inherit" size="small" onClick={handleAction}>
              {error.action.label}
            </Button>
          ) : undefined
        }
      >
        {error.title && <AlertTitle>{error.title}</AlertTitle>}
        {error.message}
      </Alert>
    </Snackbar>
  );
}
