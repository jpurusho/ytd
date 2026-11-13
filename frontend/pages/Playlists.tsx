import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Grid, Card, CardContent, IconButton, Button,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Alert, CircularProgress, List, ListItem, ListItemText,
  ListItemAvatar, Avatar, ListItemSecondaryAction, Checkbox,
  Select, MenuItem, FormControl, InputLabel,
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
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import ViewListIcon from '@mui/icons-material/ViewList';
import GridViewIcon from '@mui/icons-material/GridView';
import WatchLaterIcon from '@mui/icons-material/WatchLater';
import YouTubePreview from '../components/YouTubePreview/YouTubePreview';
import VideoPlayer from '../components/VideoPlayer/VideoPlayer';
import type { LocalPlaylist, LocalPlaylistItem, PlaylistInfo, DownloadRequest, VideoInfo, DownloadRecord } from '@shared/types';

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
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<LocalPlaylistItem | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'recently-added' | 'title'>('newest');
  const [dateFilter, setDateFilter] = useState<'all' | 'week' | 'month' | 'year' | 'older'>('all');

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
    setSelectedItems(new Set());
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
    setSelectedItems(prev => { const next = new Set(prev); next.delete(videoId); return next; });
  }

  async function handleBulkRemove() {
    if (!selectedPlaylist || selectedItems.size === 0) return;
    for (const videoId of selectedItems) {
      await window.api.playlists.removeItem(selectedPlaylist.id, videoId);
    }
    const items = await window.api.playlists.getItems(selectedPlaylist.id);
    setPlaylistItems(items);
    setSelectedItems(new Set());
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

  async function handleTryImportWatchLater() {
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await window.api.playlists.tryImportWatchLater();
      setSyncMessage(`Watch Later imported! Found ${result.count} videos.`);
      loadPlaylists();
      // Auto-open the imported playlist
      if (result.playlistId) {
        const pl = await window.api.playlists.get(result.playlistId);
        if (pl) {
          setTimeout(() => openPlaylist(pl), 500);
        }
      }
    } catch (err: any) {
      console.error('Failed to import Watch Later:', err);
      setSyncMessage(`Watch Later import failed: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 8000);
    }
  }

  const [previewVideo, setPreviewVideo] = useState<VideoInfo | null>(null);
  const [localFiles, setLocalFiles] = useState<Record<string, DownloadRecord>>({});
  const [playingLocal, setPlayingLocal] = useState<DownloadRecord | null>(null);

  useEffect(() => {
    if (selectedPlaylist && playlistItems.length > 0) {
      loadLocalFiles();
    }
  }, [playlistItems]);

  async function loadLocalFiles() {
    const map: Record<string, DownloadRecord> = {};
    for (const item of playlistItems) {
      const lib = await window.api.library.get(item.videoId);
      if (lib && lib.filePath) {
        const exists = await window.api.app.fileExists(lib.filePath);
        if (exists) {
          map[item.videoId] = {
            id: 0, videoId: lib.videoId, title: lib.title, channel: lib.channel,
            thumbnailUrl: lib.thumbnailUrl, url: lib.url, format: lib.format || 'mp4',
            quality: lib.quality || 'best', resolution: lib.resolution,
            filePath: lib.filePath, fileSize: lib.fileSize, duration: lib.duration,
            status: 'completed', downloadedAt: lib.downloadedAt || '',
          };
        }
      }
    }
    setLocalFiles(map);
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

  function handlePlayItem(item: LocalPlaylistItem) {
    setPreviewVideo({
      id: item.videoId,
      title: item.title,
      channel: item.channel,
      channelId: '',
      thumbnail: item.thumbnailUrl,
      duration: item.duration,
      publishedAt: '',
      viewCount: 0,
      description: '',
    });
  }

  function formatDuration(seconds: number): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function getVideoAge(publishedAt: string | undefined): string {
    if (!publishedAt) return 'Unknown';
    const published = new Date(publishedAt);
    const now = new Date();
    const diffMs = now.getTime() - published.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  }

  // Filter and sort playlist items
  const filteredAndSortedItems = React.useMemo(() => {
    let items = [...playlistItems];

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();

      switch (dateFilter) {
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          items = items.filter(item => item.publishedAt && new Date(item.publishedAt) >= cutoff);
          break;
        case 'month':
          cutoff.setMonth(now.getMonth() - 1);
          items = items.filter(item => item.publishedAt && new Date(item.publishedAt) >= cutoff);
          break;
        case 'year':
          cutoff.setFullYear(now.getFullYear() - 1);
          items = items.filter(item => item.publishedAt && new Date(item.publishedAt) >= cutoff);
          break;
        case 'older':
          cutoff.setFullYear(now.getFullYear() - 1);
          items = items.filter(item => item.publishedAt && new Date(item.publishedAt) < cutoff);
          break;
      }
    }

    // Apply sorting
    items.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          if (!a.publishedAt) return 1;
          if (!b.publishedAt) return -1;
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        case 'oldest':
          if (!a.publishedAt) return 1;
          if (!b.publishedAt) return -1;
          return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
        case 'recently-added':
          if (!a.addedAt) return 1;
          if (!b.addedAt) return -1;
          return new Date(b.addedAt + 'Z').getTime() - new Date(a.addedAt + 'Z').getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return items;
  }, [playlistItems, dateFilter, sortBy]);

  function handleDragStart(e: React.DragEvent, item: LocalPlaylistItem, index: number) {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.videoId);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }

  function handleDragLeave() {
    setDragOverIndex(null);
  }

  async function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    setDragOverIndex(null);

    if (!draggedItem || !selectedPlaylist) return;

    const currentIndex = playlistItems.findIndex(item => item.videoId === draggedItem.videoId);
    if (currentIndex === targetIndex) {
      setDraggedItem(null);
      return;
    }

    // Optimistically update UI
    const newItems = [...playlistItems];
    const [removed] = newItems.splice(currentIndex, 1);
    newItems.splice(targetIndex, 0, removed);
    setPlaylistItems(newItems);

    // Update order in database
    try {
      await window.api.playlists.reorderItem(selectedPlaylist.id, draggedItem.videoId, targetIndex);
    } catch (error) {
      console.error('Failed to reorder:', error);
      // Revert on error
      await openPlaylist(selectedPlaylist);
    }

    setDraggedItem(null);
  }

  function handleDragEnd() {
    setDraggedItem(null);
    setDragOverIndex(null);
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

        <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            {filteredAndSortedItems.length} of {playlistItems.length} videos
          </Typography>
          <Box display="flex" gap={1} alignItems="center">
            {selectedItems.size > 0 && (
              <Button size="small" color="error" variant="outlined" startIcon={<RemoveCircleOutlineIcon />} onClick={handleBulkRemove}>
                Remove {selectedItems.size} from playlist
              </Button>
            )}

            {/* Date Filter */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Age</InputLabel>
              <Select
                value={dateFilter}
                label="Age"
                onChange={(e) => setDateFilter(e.target.value as any)}
              >
                <MenuItem value="all">All dates</MenuItem>
                <MenuItem value="week">Last week</MenuItem>
                <MenuItem value="month">Last month</MenuItem>
                <MenuItem value="year">Last year</MenuItem>
                <MenuItem value="older">&gt;1 year old</MenuItem>
              </Select>
            </FormControl>

            {/* Sort Dropdown */}
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Sort by</InputLabel>
              <Select
                value={sortBy}
                label="Sort by"
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <MenuItem value="newest">Newest first</MenuItem>
                <MenuItem value="oldest">Oldest first</MenuItem>
                <MenuItem value="recently-added">Recently added</MenuItem>
                <MenuItem value="title">Title A-Z</MenuItem>
              </Select>
            </FormControl>

            {/* View Toggle */}
            <Box display="flex" gap={0.5} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 0.25 }}>
              <IconButton
                size="small"
                onClick={() => setViewMode('list')}
                sx={{
                  bgcolor: viewMode === 'list' ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: viewMode === 'list' ? 'action.selected' : 'action.hover' },
                }}
                title="List view"
              >
                <ViewListIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setViewMode('grid')}
                sx={{
                  bgcolor: viewMode === 'grid' ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: viewMode === 'grid' ? 'action.selected' : 'action.hover' },
                }}
                title="Grid view"
              >
                <GridViewIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Box>

        {playlistItems.length === 0 ? (
          <Box textAlign="center" py={4}>
            <Typography color="text.secondary">
              No videos yet. Add videos from Search or Browse.
            </Typography>
          </Box>
        ) : viewMode === 'list' ? (
          <List disablePadding>
            {filteredAndSortedItems.map((item, index) => (
              <ListItem
                key={item.videoId}
                draggable
                onDragStart={(e) => handleDragStart(e, item, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                sx={{
                  px: 1,
                  py: 0.75,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                  opacity: draggedItem?.videoId === item.videoId ? 0.5 : 1,
                  borderTop: dragOverIndex === index ? '2px solid' : 'none',
                  borderColor: 'primary.main',
                  cursor: 'grab',
                  '&:active': { cursor: 'grabbing' },
                }}
              >
                <Checkbox
                  size="small"
                  checked={selectedItems.has(item.videoId)}
                  onChange={() => {
                    const next = new Set(selectedItems);
                    if (next.has(item.videoId)) next.delete(item.videoId);
                    else next.add(item.videoId);
                    setSelectedItems(next);
                  }}
                  sx={{ mr: 0.5 }}
                />
                <Box sx={{ mr: 1, color: 'text.secondary' }}>
                  <DragIndicatorIcon fontSize="small" />
                </Box>
                <ListItemAvatar sx={{ minWidth: 80, cursor: 'pointer' }} onClick={() => handlePlayItem(item)}>
                  <Box sx={{ position: 'relative', '&:hover .play-overlay': { opacity: 1 } }}>
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4, display: 'block' }}
                    />
                    <Box className="play-overlay" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.4)', opacity: 0, transition: 'opacity 0.15s', borderRadius: 1 }}>
                      <PlayArrowIcon sx={{ color: '#fff', fontSize: 20 }} />
                    </Box>
                  </Box>
                </ListItemAvatar>
                <ListItemText
                  primary={item.title}
                  secondary={
                    <Box component="span" display="flex" gap={1} alignItems="center" flexWrap="wrap">
                      <span>{item.channel}{item.duration ? ` · ${formatDuration(item.duration)}` : ''}</span>
                      {item.publishedAt && (
                        <Chip
                          label={getVideoAge(item.publishedAt)}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            fontWeight: 500,
                            borderColor: new Date().getTime() - new Date(item.publishedAt).getTime() > 365 * 24 * 60 * 60 * 1000 ? 'warning.main' : 'divider',
                            color: new Date().getTime() - new Date(item.publishedAt).getTime() > 365 * 24 * 60 * 60 * 1000 ? 'warning.main' : 'text.secondary',
                          }}
                        />
                      )}
                      {localFiles[item.videoId] && (
                        <Chip label="Downloaded" size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.5 } }} />
                      )}
                      {item.addedAt && (
                        <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>
                          Added: {new Date(item.addedAt + 'Z').toLocaleDateString()}
                        </span>
                      )}
                    </Box>
                  }
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 500, noWrap: true }}
                  secondaryTypographyProps={{ variant: 'caption', component: 'div' }}
                />
                <ListItemSecondaryAction>
                  {localFiles[item.videoId] && (
                    <IconButton size="small" onClick={() => setPlayingLocal(localFiles[item.videoId])} title="Play local file" color="success">
                      <PlayCircleIcon fontSize="small" />
                    </IconButton>
                  )}
                  <IconButton size="small" onClick={() => handlePlayItem(item)} title="Preview on YouTube">
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
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
        ) : (
          <Grid container spacing={2}>
            {filteredAndSortedItems.map((item) => (
              <Grid item key={item.videoId} xs={12} sm={6} md={4} lg={3}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 1 }}>
                    <Checkbox
                      size="small"
                      checked={selectedItems.has(item.videoId)}
                      onChange={() => {
                        const next = new Set(selectedItems);
                        if (next.has(item.videoId)) next.delete(item.videoId);
                        else next.add(item.videoId);
                        setSelectedItems(next);
                      }}
                      sx={{
                        bgcolor: 'rgba(255, 255, 255, 0.9)',
                        borderRadius: 0.5,
                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 1)' },
                      }}
                    />
                  </Box>
                  <Box
                    sx={{
                      position: 'relative',
                      paddingTop: '56.25%',
                      cursor: 'pointer',
                      '&:hover .play-overlay': { opacity: 1 },
                    }}
                    onClick={() => handlePlayItem(item)}
                  >
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <Box
                      className="play-overlay"
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'rgba(0,0,0,0.5)',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                      }}
                    >
                      <PlayCircleIcon sx={{ color: '#fff', fontSize: 56 }} />
                    </Box>
                    {item.duration && (
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: 8,
                          right: 8,
                          bgcolor: 'rgba(0, 0, 0, 0.8)',
                          color: 'white',
                          px: 0.5,
                          py: 0.25,
                          borderRadius: 0.5,
                          fontSize: '0.75rem',
                        }}
                      >
                        {formatDuration(item.duration)}
                      </Box>
                    )}
                  </Box>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                      {item.channel}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                      {item.publishedAt && (
                        <Chip
                          label={getVideoAge(item.publishedAt)}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 500,
                            borderColor: new Date().getTime() - new Date(item.publishedAt).getTime() > 365 * 24 * 60 * 60 * 1000 ? 'warning.main' : 'divider',
                            color: new Date().getTime() - new Date(item.publishedAt).getTime() > 365 * 24 * 60 * 60 * 1000 ? 'warning.main' : 'text.secondary',
                          }}
                        />
                      )}
                      {localFiles[item.videoId] && (
                        <Chip label="Downloaded" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                    </Box>
                    <Box sx={{ mt: 'auto', display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {localFiles[item.videoId] && (
                        <IconButton size="small" onClick={() => setPlayingLocal(localFiles[item.videoId])} title="Play local file" color="success">
                          <PlayCircleIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton size="small" onClick={() => handlePlayItem(item)} title="Preview on YouTube">
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDownloadItem(item)} title="Download">
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleRemoveItem(item.videoId)} title="Remove" color="error">
                        <RemoveCircleOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        <YouTubePreview
          video={previewVideo}
          onClose={() => setPreviewVideo(null)}
          onDownload={(v) => {
            setPreviewVideo(null);
            onDownload({
              videoId: v.id, title: v.title, channel: v.channel, thumbnailUrl: v.thumbnail,
              url: `https://www.youtube.com/watch?v=${v.id}`, format: 'mp4', quality: 'best',
            });
          }}
        />

        <VideoPlayer
          open={!!playingLocal}
          record={playingLocal}
          onClose={() => setPlayingLocal(null)}
        />

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
          <Button
            size="small"
            variant="outlined"
            startIcon={syncing ? <CircularProgress size={16} /> : <WatchLaterIcon />}
            onClick={handleTryImportWatchLater}
            disabled={syncing}
            title="Try to import Watch Later playlist (may not work due to API limitations)"
          >
            Try Watch Later
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
