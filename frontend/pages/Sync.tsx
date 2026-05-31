import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, LinearProgress, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Alert,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import ComputerIcon from '@mui/icons-material/Computer';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CancelIcon from '@mui/icons-material/Cancel';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import type { SyncPeerInfo, SyncPreviewInfo, SyncProgressInfo, SyncSessionRecord } from '@shared/types';

export default function Sync() {
  const [peers, setPeers] = useState<SyncPeerInfo[]>([]);
  const [progress, setProgress] = useState<SyncProgressInfo | null>(null);
  const [history, setHistory] = useState<SyncSessionRecord[]>([]);
  const [previewPeer, setPreviewPeer] = useState<SyncPeerInfo | null>(null);
  const [preview, setPreview] = useState<SyncPreviewInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
    const cleanups = [
      window.api.sync.onPeerFound((peer) => {
        setPeers(prev => [...prev.filter(p => p.instanceId !== peer.instanceId), peer]);
      }),
      window.api.sync.onPeerLost((peerId) => {
        setPeers(prev => prev.filter(p => p.instanceId !== peerId));
      }),
      window.api.sync.onProgress((p) => {
        setProgress(p);
        if (p.status === 'completed' || p.status === 'failed' || p.status === 'cancelled') {
          setSyncing(false);
          loadHistory();
        }
      }),
      window.api.sync.onSessionUpdate(() => { loadHistory(); }),
    ];
    return () => cleanups.forEach(fn => fn());
  }, []);

  async function loadData() {
    const [peerList, hist] = await Promise.all([
      window.api.sync.getPeers(),
      window.api.sync.getHistory(10),
    ]);
    setPeers(peerList);
    setHistory(hist);
  }

  async function loadHistory() {
    const hist = await window.api.sync.getHistory(10);
    setHistory(hist);
  }

  async function handleSyncClick(peer: SyncPeerInfo) {
    setPreviewPeer(peer);
    setPreview(null);
    setError('');
    setLoading(true);
    try {
      const p = await window.api.sync.getSyncPreview(peer);
      setPreview(p);
    } catch (err: any) {
      setError(`Failed to connect: ${err.message}`);
      setPreviewPeer(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmSync() {
    if (!previewPeer) return;
    setError('');
    setSyncing(true);
    const peer = previewPeer;
    setPreviewPeer(null);
    setPreview(null);
    try {
      await window.api.sync.startSync(peer);
    } catch (err: any) {
      setError(`Sync failed: ${err.message}`);
      setSyncing(false);
    }
  }

  async function handlePause() {
    if (progress?.sessionId) await window.api.sync.pauseSync(progress.sessionId);
  }

  async function handleResume() {
    if (progress?.sessionId) {
      setSyncing(true);
      await window.api.sync.resumeSync(progress.sessionId);
    }
  }

  async function handleCancel() {
    if (progress?.sessionId) await window.api.sync.cancelSync(progress.sessionId);
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  function formatDate(iso: string): string {
    return new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const totalPreviewCount = (preview?.receive.count || 0) + (preview?.send.count || 0);

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>Sync</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Active Transfer */}
      {syncing && progress && progress.status === 'transferring' && (
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'primary.main' }} elevation={0}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle2" noWrap sx={{ maxWidth: '70%' }}>
              {progress.currentTitle}
            </Typography>
            <Box display="flex" gap={0.5}>
              <IconButton size="small" onClick={handlePause} title="Pause"><PauseIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={handleCancel} title="Cancel"><CancelIcon fontSize="small" /></IconButton>
            </Box>
          </Box>
          <LinearProgress variant="determinate" value={progress.fileProgress} sx={{ mb: 1, borderRadius: 1 }} />
          <Box display="flex" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              {progress.completedFiles}/{progress.totalFiles} files · {formatSize(progress.totalTransferredBytes)} / {formatSize(progress.totalSessionBytes)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {progress.speed} · ETA {progress.eta}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Paused */}
      {progress && progress.status === 'paused' && (
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'warning.main' }} elevation={0}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle2" color="warning.main">
              Paused · {progress.completedFiles}/{progress.totalFiles} files
            </Typography>
            <Box display="flex" gap={0.5}>
              <Button size="small" startIcon={<PlayArrowIcon />} onClick={handleResume}>Resume</Button>
              <Button size="small" color="error" onClick={handleCancel}>Cancel</Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Peers */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Available Peers</Typography>
      {peers.length === 0 ? (
        <Paper sx={{ p: 3, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider', textAlign: 'center' }} elevation={0}>
          <Typography color="text.secondary" variant="body2">
            No peers found. Make sure another device is running ytd on the same Wi-Fi.
          </Typography>
        </Paper>
      ) : (
        <Box display="flex" flexDirection="column" gap={1} mb={3}>
          {peers.map(peer => (
            <Paper key={peer.instanceId} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }} elevation={0}>
              <ComputerIcon color="primary" />
              <Box flex={1}>
                <Typography variant="body2" fontWeight={500}>{peer.deviceName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {peer.address} · {peer.libraryCount} videos
                </Typography>
              </Box>
              <Button size="small" variant="contained" startIcon={<SyncIcon />} onClick={() => handleSyncClick(peer)} disabled={syncing}>
                Sync
              </Button>
            </Paper>
          ))}
        </Box>
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Sync History</Typography>
          <Box display="flex" flexDirection="column" gap={1}>
            {history.map(session => (
              <Paper key={session.id} sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }} elevation={0}>
                <SyncIcon fontSize="small" color={session.status === 'completed' ? 'success' : session.status === 'failed' ? 'error' : 'disabled'} />
                <Box flex={1}>
                  <Typography variant="body2">{session.peerDeviceName} · {session.playlistsSynced}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(session.startedAt)} · {session.completedFiles}/{session.totalFiles} files · {formatSize(session.transferredBytes)}
                  </Typography>
                </Box>
                <Chip label={session.status} size="small" variant="outlined" color={session.status === 'completed' ? 'success' : session.status === 'failed' ? 'error' : 'default'} />
              </Paper>
            ))}
          </Box>
        </>
      )}

      {/* Sync Preview Dialog */}
      <Dialog open={!!previewPeer} onClose={() => { setPreviewPeer(null); setPreview(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Sync with {previewPeer?.deviceName}</DialogTitle>
        <DialogContent>
          {loading && <Box display="flex" justifyContent="center" py={3}><CircularProgress /></Box>}
          {!loading && preview && (
            <Box display="flex" flexDirection="column" gap={2} py={1}>
              {preview.receive.count > 0 && (
                <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'success.main' }} elevation={0}>
                  <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                    <DownloadIcon fontSize="small" color="success" />
                    <Typography variant="subtitle2">Receive {preview.receive.count} files ({formatSize(preview.receive.totalSize)})</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    From: {preview.receive.playlists.join(', ')}
                  </Typography>
                </Paper>
              )}
              {preview.send.count > 0 && (
                <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'info.main' }} elevation={0}>
                  <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                    <UploadIcon fontSize="small" color="info" />
                    <Typography variant="subtitle2">Send {preview.send.count} files ({formatSize(preview.send.totalSize)})</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    From: {preview.send.playlists.join(', ')}
                  </Typography>
                </Paper>
              )}
              {totalPreviewCount === 0 && (
                <Alert severity="success">Already in sync! Both devices have the same content.</Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPreviewPeer(null); setPreview(null); }}>Cancel</Button>
          <Button variant="contained" disabled={totalPreviewCount === 0 || loading} onClick={handleConfirmSync}>
            Start Sync
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
