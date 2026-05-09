import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, List, ListItemButton, ListItemText, ListItemIcon,
  TextField, Box, Typography, Checkbox, Chip,
} from '@mui/material';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import AddIcon from '@mui/icons-material/Add';
import type { LocalPlaylist, VideoInfo } from '@shared/types';

interface Props {
  open: boolean;
  videos: VideoInfo[];
  onClose: () => void;
}

export default function AddToPlaylistDialog({ open, videos, onClose }: Props) {
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (open) {
      loadPlaylists();
      setSelected(new Set());
      setShowCreate(false);
      setNewName('');
    }
  }, [open]);

  async function loadPlaylists() {
    const data = await window.api.playlists.getAll();
    setPlaylists(data);
  }

  function togglePlaylist(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const created = await window.api.playlists.create(newName.trim());
    setNewName('');
    setShowCreate(false);
    await loadPlaylists();
    setSelected(new Set([...selected, created.id]));
  }

  async function handleAdd() {
    if (selected.size === 0 || videos.length === 0) return;
    setAdding(true);

    for (const playlistId of selected) {
      for (const video of videos) {
        await window.api.playlists.addItem(playlistId, {
          videoId: video.id,
          title: video.title,
          channel: video.channel,
          thumbnailUrl: video.thumbnail,
          duration: video.duration,
          publishedAt: video.publishedAt,
        });
      }
    }

    setAdding(false);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <PlaylistAddIcon />
          <span>Add to Playlist</span>
          {videos.length > 1 && (
            <Chip label={`${videos.length} videos`} size="small" color="primary" sx={{ ml: 'auto' }} />
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        {videos.length === 1 && (
          <Box sx={{ mb: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}>
            {videos[0].thumbnail && (
              <img src={videos[0].thumbnail} alt="" style={{ width: 60, height: 34, objectFit: 'cover', borderRadius: 4 }} />
            )}
            <Typography variant="body2" noWrap>{videos[0].title}</Typography>
          </Box>
        )}

        {playlists.length === 0 && !showCreate ? (
          <Box textAlign="center" py={2}>
            <Typography color="text.secondary" variant="body2" gutterBottom>
              No playlists yet
            </Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setShowCreate(true)}>
              Create one
            </Button>
          </Box>
        ) : (
          <List dense disablePadding>
            {playlists.map((pl) => (
              <ListItemButton key={pl.id} onClick={() => togglePlaylist(pl.id)} sx={{ borderRadius: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox size="small" checked={selected.has(pl.id)} edge="start" tabIndex={-1} />
                </ListItemIcon>
                <ListItemText primary={pl.name} secondary={pl.description || undefined} />
              </ListItemButton>
            ))}
          </List>
        )}

        {showCreate ? (
          <Box display="flex" gap={1} mt={1}>
            <TextField
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New playlist name"
              size="small"
              fullWidth
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <Button variant="contained" size="small" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </Box>
        ) : (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setShowCreate(true)} sx={{ mt: 1 }}>
            New Playlist
          </Button>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={selected.size === 0 || adding}
        >
          {adding ? 'Adding...' : `Add to ${selected.size || ''} Playlist${selected.size !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
