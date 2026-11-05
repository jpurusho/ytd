import React, { useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import ErrorToast from './components/ErrorToast/ErrorToast';
import { QueryProvider } from './providers/QueryProvider';
import { useAuthStore } from './stores/authStore';

function AppContent() {
  const { user, loading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <ErrorToast />
      {user ? <Dashboard /> : <Login />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AppContent />
      </QueryProvider>
    </ErrorBoundary>
  );
}
