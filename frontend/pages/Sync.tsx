import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, LinearProgress, Chip, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem,
  ListItemText, Checkbox, CircularProgress, Alert,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import ComputerIcon from '@mui/icons-material/Computer';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CancelIcon from '@mui/icons-material/Cancel';
import ShareIcon from '@mui/icons-material/Share';
import type { SyncPeerInfo, SyncManifest, SyncProgressInfo, SyncSessionRecord, LocalPlaylist } from '@shared/types';

export default function Sync() {
  const [peers, setPeers] = useState<SyncPeerInfo[]>([]);
  const [progress, setProgress] = useState<SyncProgressInfo | null>(null);
  const [history, setHistory] = useState<SyncSessionRecord[]>([]);
  const [sharedPlaylists, setSharedPlaylists] = useState<Set<number>>(new Set());
  const [allPlaylists, setAllPlaylists] = useState<LocalPlaylist[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [connectPeer, setConnectPeer] = useState<SyncPeerInfo | null>(null);
  const [manifest, setManifest] = useState<SyncManifest | null>(null);
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<number>>(new Set());
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
    const [peerList, hist, shared, playlists] = await Promise.all([
      window.api.sync.getPeers(),
      window.api.sync.getHistory(10),
      window.api.sync.getSharedPlaylists(),
      window.api.playlists.getAll(),
    ]);
    setPeers(peerList);
    setHistory(hist);
    setSharedPlaylists(new Set(shared));
    setAllPlaylists(playlists);
  }

  async function loadHistory() {
    const hist = await window.api.sync.getHistory(10);
    setHistory(hist);
  }

  async function handleConnect(peer: SyncPeerInfo) {
    setConnectPeer(peer);
    setManifest(null);
    setSelectedPlaylists(new Set());
    setError('');
    setLoading(true);
    try {
      const m = await window.api.sync.getManifest(peer);
      setManifest(m);
    } catch (err: any) {
      setError(`Failed to connect: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartSync() {
    if (!connectPeer || selectedPlaylists.size === 0) return;
    setError('');
    setSyncing(true);
    setConnectPeer(null);
    try {
      await window.api.sync.startSync(connectPeer, Array.from(selectedPlaylists));
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

  async function toggleShare(playlistId: number) {
    const next = new Set(sharedPlaylists);
    if (next.has(playlistId)) {
      next.delete(playlistId);
      await window.api.sync.unsharePlaylist(playlistId);
    } else {
      next.add(playlistId);
      await window.api.sync.sharePlaylist(playlistId);
    }
    setSharedPlaylists(next);
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

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h6" fontWeight={600}>Sync</Typography>
        <Button size="small" variant="outlined" startIcon={<ShareIcon />} onClick={() => setShareOpen(true)}>
          Sharing ({sharedPlaylists.size} playlists)
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Active Transfer */}
      {syncing && progress && progress.status === 'transferring' && (
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'primary.main' }} elevation={0}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle2">
              Syncing: {progress.currentTitle}
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

      {/* Paused session */}
      {progress && progress.status === 'paused' && (
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'warning.main' }} elevation={0}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle2" color="warning.main">
              Sync paused · {progress.completedFiles}/{progress.totalFiles} files
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
            No peers found on this network. Make sure another device is running ytd on the same Wi-Fi.
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
                  {peer.address} · {peer.libraryCount} videos · v{peer.version}
                </Typography>
              </Box>
              <Button size="small" variant="outlined" onClick={() => handleConnect(peer)} disabled={syncing}>
                Browse Playlists
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
                  <Typography variant="body2">
                    {session.direction === 'receive' ? 'From' : 'To'} {session.peerDeviceName} · {session.playlistsSynced}
                  </Typography>
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

      {/* Playlist Selector Dialog */}
      <Dialog open={!!connectPeer} onClose={() => setConnectPeer(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {connectPeer?.deviceName} — Available Playlists
        </DialogTitle>
        <DialogContent>
          {loading && <Box display="flex" justifyContent="center" py={3}><CircularProgress /></Box>}
          {!loading && manifest && (
            <List dense>
              {manifest.playlists.map(pl => (
                <ListItem key={pl.id} sx={{ borderRadius: 1 }}>
                  <Checkbox
                    checked={selectedPlaylists.has(pl.id)}
                    onChange={() => {
                      const next = new Set(selectedPlaylists);
                      if (next.has(pl.id)) next.delete(pl.id); else next.add(pl.id);
                      setSelectedPlaylists(next);
                    }}
                  />
                  <ListItemText
                    primary={pl.name}
                    secondary={`${pl.itemCount} videos · ${formatSize(pl.totalSize)}`}
                  />
                </ListItem>
              ))}
              {manifest.playlists.length === 0 && (
                <Typography color="text.secondary" textAlign="center" py={2}>
                  No shared playlists. The peer needs to share playlists first.
                </Typography>
              )}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConnectPeer(null)}>Cancel</Button>
          <Button variant="contained" disabled={selectedPlaylists.size === 0} onClick={handleStartSync}>
            Start Sync ({selectedPlaylists.size} playlists)
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share Settings Dialog */}
      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Share Playlists</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select which playlists other devices can see and sync from you.
          </Typography>
          <List dense>
            {allPlaylists.map(pl => (
              <ListItem key={pl.id} sx={{ borderRadius: 1 }}>
                <Checkbox checked={sharedPlaylists.has(pl.id)} onChange={() => toggleShare(pl.id)} />
                <ListItemText primary={pl.name} />
              </ListItem>
            ))}
            {allPlaylists.length === 0 && (
              <Typography color="text.secondary" textAlign="center">No playlists created yet.</Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
