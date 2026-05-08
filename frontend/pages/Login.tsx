import React, { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import type { UserInfo } from '@shared/types';

interface Props {
  onLogin: (user: UserInfo) => void;
}

export default function Login({ onLogin }: Props) {
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.api.auth.hasCredentials().then(setHasCredentials);
  }, []);

  async function handleSetCredentials() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Both Client ID and Client Secret are required');
      return;
    }
    await window.api.auth.setCredentials(clientId.trim(), clientSecret.trim());
    setHasCredentials(true);
    setError('');
  }

  async function handleLogin() {
    setLoading(true);
    setError('');
    try {
      const user = await window.api.auth.login();
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (hasCredentials === null) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      height="100vh"
      sx={{ background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)' }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 5,
          maxWidth: 440,
          width: '100%',
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          textAlign: 'center',
        }}
      >
        <Box sx={{ mb: 2 }}>
          <img
            src="./icon.png"
            alt="ytd"
            style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          YTD
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          YouTube Downloader
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
            {error}
          </Alert>
        )}

        {!hasCredentials ? (
          <Box display="flex" flexDirection="column" gap={2}>
            <Typography variant="body2" color="text.secondary" textAlign="left">
              Set up Google OAuth credentials to get started.
              You'll need a Client ID and Secret from the Google Cloud Console
              with YouTube Data API v3 enabled.
            </Typography>
            <TextField
              label="Google Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label="Google Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              fullWidth
              size="small"
              type="password"
            />
            <Button variant="contained" onClick={handleSetCredentials} fullWidth>
              Save Credentials
            </Button>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2}>
            <Typography variant="body2" color="text.secondary">
              Sign in with your Google account to access your YouTube playlists,
              subscriptions, and download videos.
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={handleLogin}
              disabled={loading}
              sx={{ py: 1.5, fontSize: '1rem' }}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign in with Google'}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
