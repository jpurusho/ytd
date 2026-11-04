import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface Props {
  children: React.ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Page-level error boundary for individual routes
 * Shows inline error UI instead of full-screen
 */
export default class PageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(`PageErrorBoundary (${this.props.pageName}) caught:`, error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      const pageName = this.props.pageName || 'Page';
      return (
        <Box p={4} display="flex" alignItems="center" justifyContent="center" height="100%">
          <Paper
            elevation={2}
            sx={{
              p: 4,
              maxWidth: 500,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              alignItems: 'center',
            }}
          >
            <ErrorOutlineIcon sx={{ fontSize: 60, color: 'error.main' }} />
            <Typography variant="h6" color="error">
              {pageName} Error
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {this.state.error?.message || 'An unexpected error occurred on this page'}
            </Typography>
            <Button
              variant="contained"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </Button>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}
