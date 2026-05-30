import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Button, TextField, InputAdornment,
  Chip, Checkbox, TableSortLabel, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControlLabel, Menu, MenuItem, ListItemIcon, ListItemText,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VideoPlayer from '../components/VideoPlayer/VideoPlayer';
import AddToPlaylistDialog from '../components/AddToPlaylistDialog/AddToPlaylistDialog';
import type { LibraryItem, DownloadRecord, VideoInfo } from '@shared/types';

type SortField = 'title' | 'channel' | 'format' | 'fileSize' | 'resolution' | 'downloadedAt';
type SortOrder = 'asc' | 'desc';

export default function Library() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState('');
  const [playingItem, setPlayingItem] = useState<LibraryItem | null>(null);
  const [sortField, setSortField] = useState<SortField>('downloadedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState<Set<string>>(new Set());
  const [addToPlaylistVideo, setAddToPlaylistVideo] = useState<VideoInfo | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuItem, setMenuItem] = useState<LibraryItem | null>(null);

  useEffect(() => {
    loadLibrary();
  }, []);

  async function loadLibrary() {
    const data = await window.api.library.getAll({ limit: 1000 });
    setItems(data);
    setSelected(new Set());
  }

  function handleDeleteClick() {
    if (selected.size === 0) return;
    setDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    await window.api.library.delete(Array.from(selected), deleteFiles);
    setDeleteDialogOpen(false);
    setDeleteFiles(false);
    loadLibrary();
  }

  function openInYouTube(videoId: string) {
    window.api.app.openExternal(`https://www.youtube.com/watch?v=${videoId}`);
  }

  function openInFinder(filePath: string) {
    window.api.app.showInFinder(filePath);
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'downloadedAt' ? 'desc' : 'asc');
    }
  }

  function toggleSelect(videoId: string) {
    const next = new Set(selected);
    if (next.has(videoId)) next.delete(videoId);
    else next.add(videoId);
    setSelected(next);
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(r => r.videoId)));
    }
  }

  const filtered = filter
    ? items.filter(r => r.title.toLowerCase().includes(filter.toLowerCase()) || r.channel.toLowerCase().includes(filter.toLowerCase()))
    : items;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'title': cmp = a.title.localeCompare(b.title); break;
      case 'channel': cmp = a.channel.localeCompare(b.channel); break;
      case 'format': cmp = (a.format || '').localeCompare(b.format || ''); break;
      case 'fileSize': cmp = a.fileSize - b.fileSize; break;
      case 'resolution': cmp = (parseInt(a.resolution || '0') || 0) - (parseInt(b.resolution || '0') || 0); break;
      case 'downloadedAt': cmp = (a.downloadedAt || '').localeCompare(b.downloadedAt || ''); break;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  function formatSize(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes > 0) return `${bytes} B`;
    return '—';
  }

  function formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function itemToPlayRecord(item: LibraryItem): DownloadRecord | null {
    if (!item.filePath) return null;
    return {
      id: 0,
      videoId: item.videoId,
      title: item.title,
      channel: item.channel,
      thumbnailUrl: item.thumbnailUrl,
      url: item.url,
      format: item.format || 'mp4',
      quality: item.quality || 'best',
      resolution: item.resolution,
      filePath: item.filePath,
      fileSize: item.fileSize,
      duration: item.duration,
      status: 'completed',
      downloadedAt: item.downloadedAt || item.addedAt,
    };
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6" fontWeight={600}>
          Library
          {items.length > 0 && (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              ({items.length} videos)
            </Typography>
          )}
        </Typography>
        <Box display="flex" gap={1}>
          {selected.size > 0 && (
            <Button size="small" color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={handleDeleteClick}>
              Delete {selected.size} selected
            </Button>
          )}
        </Box>
      </Box>

      {items.length > 0 && (
        <TextField
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title or channel..."
          size="small"
          fullWidth
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          }}
        />
      )}

      {sorted.length === 0 ? (
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">
            {items.length === 0 ? 'Your library is empty. Download a video to get started.' : 'No matching results'}
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    indeterminate={selected.size > 0 && selected.size < filtered.length}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'title'} direction={sortField === 'title' ? sortOrder : 'asc'} onClick={() => handleSort('title')}>
                    Title
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'channel'} direction={sortField === 'channel' ? sortOrder : 'asc'} onClick={() => handleSort('channel')}>
                    Channel
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'format'} direction={sortField === 'format' ? sortOrder : 'asc'} onClick={() => handleSort('format')}>
                    Format
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'resolution'} direction={sortField === 'resolution' ? sortOrder : 'asc'} onClick={() => handleSort('resolution')}>
                    Quality
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'fileSize'} direction={sortField === 'fileSize' ? sortOrder : 'asc'} onClick={() => handleSort('fileSize')}>
                    Size
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === 'downloadedAt'} direction={sortField === 'downloadedAt' ? sortOrder : 'asc'} onClick={() => handleSort('downloadedAt')}>
                    Downloaded
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((item) => (
                <TableRow key={item.videoId} hover selected={selected.has(item.videoId)} sx={{ opacity: item.filePath ? 1 : 0.5 }}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(item.videoId)} onChange={() => toggleSelect(item.videoId)} />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 250 }}>
                    <Typography variant="body2" noWrap>{item.title}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap color="text.secondary">{item.channel}</Typography>
                  </TableCell>
                  <TableCell>
                    {item.format && <Chip label={item.format.toUpperCase()} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {item.resolution ? `${item.resolution}p` : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{formatSize(item.fileSize)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{formatDate(item.downloadedAt)}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {item.filePath && (
                      <IconButton size="small" onClick={() => setPlayingItem(item)} title="Play">
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={(e) => { setMenuAnchor(e.currentTarget); setMenuItem(item); }}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <VideoPlayer
        open={!!playingItem}
        record={playingItem ? itemToPlayRecord(playingItem) : null}
        onClose={() => setPlayingItem(null)}
      />

      <AddToPlaylistDialog
        open={!!addToPlaylistVideo}
        videos={addToPlaylistVideo ? [addToPlaylistVideo] : []}
        onClose={() => setAddToPlaylistVideo(null)}
      />

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => { setMenuAnchor(null); setMenuItem(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {menuItem?.filePath && (
          <MenuItem onClick={() => { openInFinder(menuItem!.filePath!); setMenuAnchor(null); }}>
            <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Show in Finder</ListItemText>
          </MenuItem>
        )}
        {menuItem?.filePath && menuItem.format && menuItem.format !== 'mp4' && menuItem.format !== 'mp3' && (
          <MenuItem onClick={async () => {
            if (!menuItem?.filePath) return;
            setMenuAnchor(null);
            setConverting(prev => new Set(prev).add(menuItem.videoId));
            const result = await window.api.app.convertToMp4(menuItem.filePath);
            setConverting(prev => { const next = new Set(prev); next.delete(menuItem.videoId); return next; });
            if (result.success && result.outputPath) window.api.app.showInFinder(result.outputPath);
          }}>
            <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Convert to MP4</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { if (menuItem) setAddToPlaylistVideo({ id: menuItem.videoId, title: menuItem.title, channel: menuItem.channel, channelId: '', thumbnail: menuItem.thumbnailUrl || '', duration: menuItem.duration, publishedAt: menuItem.downloadedAt || '', viewCount: 0, description: '' }); setMenuAnchor(null); }}>
          <ListItemIcon><PlaylistAddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Add to Playlist</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuItem) openInYouTube(menuItem.videoId); setMenuAnchor(null); }}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Open on YouTube</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuItem) { setSelected(new Set([menuItem.videoId])); setDeleteDialogOpen(true); } setMenuAnchor(null); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={deleteDialogOpen} onClose={() => { setDeleteDialogOpen(false); setDeleteFiles(false); }}>
        <DialogTitle>Delete from Library</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Remove {selected.size} {selected.size === 1 ? 'video' : 'videos'} from your library?
            This will also remove them from any playlists.
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} />}
            label="Also delete downloaded files from disk"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setDeleteFiles(false); }}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
