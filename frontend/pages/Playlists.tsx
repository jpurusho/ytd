import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, IconButton, Button,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Alert, CircularProgress, List, ListItem, ListItemText,
  ListItemAvatar, Avatar, ListItemSecondaryAction,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import type { LocalPlaylist, LocalPlaylistItem, PlaylistInfo, DownloadRequest } from '@shared/types';

interface Props {
  onDownload: (request: DownloadRequest) => void;
  openPlaylistId?: number | null;
  onPlaylistOpened?: () => void;
}

export default function Playlists({ onDownload, openPlaylistId, onPlaylistOpened }: Props) {
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<LocalPlaylist | null>(null);
  const [playlistItems, setPlaylistItems] = useState<LocalPlaylistItem[]>([]);
  const [ytPlaylists, setYtPlaylists] = useState<PlaylistInfo[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlaylists();
  }, []);

  useEffect(() => {
    if (openPlaylistId) {
      window.api.playlists.get(openPlaylistId).then((pl) => {
        if (pl) {
          openPlaylist(pl);
          onPlaylistOpened?.();
        }
      });
    }
  }, [openPlaylistId]);

  const [playlistCounts, setPlaylistCounts] = useState<Record<number, number>>({});

  async function loadPlaylists() {
    const data = await window.api.playlists.getAll();
    setPlaylists(data);
    const counts: Record<number, number> = {};
    await Promise.all(data.map(async (pl) => {
      const items = await window.api.playlists.getItems(pl.id);
      counts[pl.id] = items.length;
    }));
    setPlaylistCounts(counts);
  }

  async function openPlaylist(pl: LocalPlaylist) {
    setSelectedPlaylist(pl);
    const items = await window.api.playlists.getItems(pl.id);
    setPlaylistItems(items);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await window.api.playlists.create(newName.trim(), newDesc.trim());
    setCreateOpen(false);
    setNewName('');
    setNewDesc('');
    loadPlaylists();
  }

  async function handleEdit() {
    if (!selectedPlaylist || !editName.trim()) return;
    await window.api.playlists.update(selectedPlaylist.id, { name: editName.trim(), description: editDesc.trim() });
    setEditOpen(false);
    const updated = await window.api.playlists.get(selectedPlaylist.id);
    if (updated) setSelectedPlaylist(updated);
    loadPlaylists();
  }

  async function handleDelete(id: number) {
    await window.api.playlists.delete(id);
    if (selectedPlaylist?.id === id) {
      setSelectedPlaylist(null);
      setPlaylistItems([]);
    }
    loadPlaylists();
  }

  async function handleRemoveItem(videoId: string) {
    if (!selectedPlaylist) return;
    await window.api.playlists.removeItem(selectedPlaylist.id, videoId);
    const items = await window.api.playlists.getItems(selectedPlaylist.id);
    setPlaylistItems(items);
  }

  async function handleSync(pl: LocalPlaylist) {
    setSyncing(true);
    setSyncMessage('');
    try {
      await window.api.playlists.syncToYouTube(pl.id);
      setSyncMessage('Synced successfully!');
      loadPlaylists();
      if (selectedPlaylist?.id === pl.id) {
        const items = await window.api.playlists.getItems(pl.id);
        setPlaylistItems(items);
        const updated = await window.api.playlists.get(pl.id);
        if (updated) setSelectedPlaylist(updated);
      }
    } catch (err: any) {
      const msg = err.message || 'Sync failed';
      if (msg.includes('Insufficient Permission')) {
        setSyncMessage('Permission denied. Please sign out and sign back in to grant YouTube write access.');
      } else {
        setSyncMessage(`Sync failed: ${msg}`);
      }
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 8000);
    }
  }

  async function handleImportFromYouTube() {
    setImportOpen(true);
    setLoading(true);
    try {
      const playlists = await window.api.youtube.getPlaylists();
      setYtPlaylists(playlists);
    } catch (err) {
      console.error('Failed to load YT playlists:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePullPlaylist(ytPlaylistId: string) {
    setImportOpen(false);
    setSyncing(true);
    try {
      await window.api.playlists.pullFromYouTube(ytPlaylistId);
      setSyncMessage('Playlist imported!');
      loadPlaylists();
    } catch (err: any) {
      setSyncMessage(`Import failed: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 4000);
    }
  }

  function handleDownloadItem(item: LocalPlaylistItem) {
    const request: DownloadRequest = {
      videoId: item.videoId,
      title: item.title,
      channel: item.channel,
      thumbnailUrl: item.thumbnailUrl,
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      format: 'mp4',
      quality: 'best',
    };
    onDownload(request);
  }

  function formatDuration(seconds: number): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ─── Playlist Detail View ─────────────────────────────────────────────────

  if (selectedPlaylist) {
    return (
      <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <IconButton size="small" onClick={() => { setSelectedPlaylist(null); setPlaylistItems([]); }}>
            <ArrowBackIcon />
          </IconButton>
          <Box flex={1}>
            <Typography variant="h6" fontWeight={600}>{selectedPlaylist.name}</Typography>
            {selectedPlaylist.description && (
              <Typography variant="body2" color="text.secondary">{selectedPlaylist.description}</Typography>
            )}
          </Box>
          <Box display="flex" gap={1}>
            {selectedPlaylist.youtubePlaylistId && (
              <Chip label="Linked to YouTube" size="small" color="primary" variant="outlined" />
            )}
            {selectedPlaylist.lastSyncedAt && (
              <Chip label={`Synced ${new Date(selectedPlaylist.lastSyncedAt).toLocaleDateString()}`} size="small" variant="outlined" />
            )}
            <IconButton size="small" onClick={() => { setEditName(selectedPlaylist.name); setEditDesc(selectedPlaylist.description); setEditOpen(true); }} title="Edit">
              <EditIcon fontSize="small" />
            </IconButton>
            <Button
              size="small"
              variant="outlined"
              startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
              onClick={() => handleSync(selectedPlaylist)}
              disabled={syncing}
            >
              Sync to YouTube
            </Button>
          </Box>
        </Box>

        {syncMessage && (
          <Alert severity={syncMessage.includes('failed') ? 'error' : 'success'} sx={{ mb: 2 }}>
            {syncMessage}
          </Alert>
        )}

        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          {playlistItems.length} videos
        </Typography>

        {playlistItems.length === 0 ? (
          <Box textAlign="center" py={4}>
            <Typography color="text.secondary">
              No videos yet. Add videos from Search or Browse.
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {playlistItems.map((item, index) => (
              <ListItem
                key={item.videoId}
                sx={{ px: 1, py: 0.75, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
              >
                <Box sx={{ mr: 1, color: 'text.secondary', cursor: 'grab' }}>
                  <DragIndicatorIcon fontSize="small" />
                </Box>
                <ListItemAvatar sx={{ minWidth: 80 }}>
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4 }}
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={item.title}
                  secondary={`${item.channel}${item.duration ? ` · ${formatDuration(item.duration)}` : ''}`}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 500, noWrap: true }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
                <ListItemSecondaryAction>
                  <IconButton size="small" onClick={() => handleDownloadItem(item)} title="Download">
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleRemoveItem(item.videoId)} title="Remove">
                    <RemoveCircleOutlineIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {/* Edit Dialog */}
        <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Edit Playlist</DialogTitle>
          <DialogContent>
            <TextField label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} fullWidth size="small" sx={{ mt: 1, mb: 2 }} />
            <TextField label="Description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} fullWidth size="small" multiline rows={2} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleEdit}>Save</Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // ─── Playlist List View ───────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h6" fontWeight={600}>My Playlists</Typography>
        <Box display="flex" gap={1}>
          <Button size="small" variant="outlined" startIcon={<CloudDownloadIcon />} onClick={handleImportFromYouTube}>
            Import from YouTube
          </Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            New Playlist
          </Button>
        </Box>
      </Box>

      {syncMessage && (
        <Alert severity={syncMessage.includes('failed') ? 'error' : 'success'} sx={{ mb: 2 }}>
          {syncMessage}
        </Alert>
      )}

      {playlists.length === 0 ? (
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary" gutterBottom>No playlists yet</Typography>
          <Typography variant="body2" color="text.secondary">
            Create a local playlist to organize videos, or import from YouTube.
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {playlists.map((pl) => (
            <Grid item xs={12} sm={6} md={4} key={pl.id}>
              <Card
                sx={{
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  '&:hover': { borderColor: 'primary.main' },
                }}
                elevation={0}
                onClick={() => openPlaylist(pl)}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box display="flex" alignItems="start" justifyContent="space-between">
                    <Box flex={1} overflow="hidden">
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body1" fontWeight={600} noWrap>{pl.name}</Typography>
                        <Chip
                          label={`${playlistCounts[pl.id] ?? 0} videos`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      </Box>
                      {pl.description && (
                        <Typography variant="caption" color="text.secondary" noWrap>{pl.description}</Typography>
                      )}
                    </Box>
                    <Box display="flex" gap={0.5} ml={1} onClick={(e) => e.stopPropagation()}>
                      {pl.youtubePlaylistId && (
                        <IconButton size="small" onClick={() => handleSync(pl)} disabled={syncing} title="Sync with YouTube">
                          <SyncIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton size="small" onClick={() => handleDelete(pl.id)} title="Delete">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  <Box display="flex" gap={1} mt={1}>
                    {pl.youtubePlaylistId && (
                      <Chip label="YouTube" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                    {pl.lastSyncedAt && (
                      <Chip label={`Synced`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Playlist</DialogTitle>
        <DialogContent>
          <TextField
            label="Playlist Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            fullWidth
            size="small"
            autoFocus
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Import from YouTube Dialog */}
      <Dialog open={importOpen} onClose={() => setImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import from YouTube</DialogTitle>
        <DialogContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={3}><CircularProgress /></Box>
          ) : (
            <List>
              {ytPlaylists.map((pl) => (
                <ListItem
                  key={pl.id}
                  sx={{ borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  onClick={() => handlePullPlaylist(pl.id)}
                >
                  <ListItemAvatar>
                    <Avatar src={pl.thumbnail} variant="rounded" />
                  </ListItemAvatar>
                  <ListItemText
                    primary={pl.title}
                    secondary={`${pl.itemCount} videos`}
                  />
                </ListItem>
              ))}
              {ytPlaylists.length === 0 && (
                <Typography color="text.secondary" textAlign="center" py={2}>
                  No playlists found on your YouTube account
                </Typography>
              )}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
