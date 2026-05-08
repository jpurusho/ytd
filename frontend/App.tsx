import React, { useState, useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import type { UserInfo } from '@shared/types';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const loggedIn = await window.api.auth.isLoggedIn();
      if (loggedIn) {
        const userInfo = await window.api.auth.getUser();
        setUser(userInfo);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(userInfo: UserInfo) {
    setUser(userInfo);
  }

  function handleLogout() {
    setUser(null);
  }

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <ErrorBoundary>
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </ErrorBoundary>
  );
}
