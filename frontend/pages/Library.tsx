import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Button, TextField, InputAdornment,
  Chip, Checkbox, TableSortLabel, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControlLabel, Menu, MenuItem, ListItemIcon, ListItemText,
  Popover,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VideoPlayer from '../components/VideoPlayer/VideoPlayer';
import AddToPlaylistDialog from '../components/AddToPlaylistDialog/AddToPlaylistDialog';
import type { LibraryItem, DownloadRecord, VideoInfo } from '@shared/types';

type SortField = 'title' | 'channel' | 'format' | 'fileSize' | 'resolution' | 'downloadedAt' | 'addedAt' | 'duration';
type SortOrder = 'asc' | 'desc';

interface ColumnDef {
  id: SortField;
  label: string;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'title', label: 'Title', defaultVisible: true },
  { id: 'channel', label: 'Channel', defaultVisible: true },
  { id: 'format', label: 'Format', defaultVisible: true },
  { id: 'resolution', label: 'Quality', defaultVisible: true },
  { id: 'fileSize', label: 'Size', defaultVisible: true },
  { id: 'duration', label: 'Duration', defaultVisible: false },
  { id: 'downloadedAt', label: 'Downloaded', defaultVisible: true },
  { id: 'addedAt', label: 'Added', defaultVisible: false },
];

function loadVisibleColumns(): Set<SortField> {
  try {
    const saved = localStorage.getItem('ytd-library-columns');
    if (saved) return new Set(JSON.parse(saved));
  } catch {}
  return new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id));
}

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
  const [visibleColumns, setVisibleColumns] = useState<Set<SortField>>(loadVisibleColumns);
  const [columnAnchor, setColumnAnchor] = useState<null | HTMLElement>(null);

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
      case 'duration': cmp = a.duration - b.duration; break;
      case 'downloadedAt': cmp = (a.downloadedAt || '').localeCompare(b.downloadedAt || ''); break;
      case 'addedAt': cmp = a.addedAt.localeCompare(b.addedAt); break;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  function toggleColumn(col: SortField) {
    const next = new Set(visibleColumns);
    if (next.has(col)) { if (next.size > 2) next.delete(col); }
    else next.add(col);
    setVisibleColumns(next);
    localStorage.setItem('ytd-library-columns', JSON.stringify([...next]));
  }

  function formatDuration(seconds: number): string {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

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
        <Box display="flex" gap={1} mb={2}>
          <TextField
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title or channel..."
            size="small"
            fullWidth
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            }}
          />
          <IconButton size="small" onClick={(e) => setColumnAnchor(e.currentTarget)} title="Choose columns">
            <ViewColumnIcon fontSize="small" />
          </IconButton>
        </Box>
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
                {ALL_COLUMNS.filter(c => visibleColumns.has(c.id)).map(col => (
                  <TableCell key={col.id}>
                    <TableSortLabel active={sortField === col.id} direction={sortField === col.id ? sortOrder : 'asc'} onClick={() => handleSort(col.id)}>
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((item) => (
                <TableRow key={item.videoId} hover selected={selected.has(item.videoId)} sx={{ opacity: item.filePath ? 1 : 0.5 }}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(item.videoId)} onChange={() => toggleSelect(item.videoId)} />
                  </TableCell>
                  {visibleColumns.has('title') && (
                    <TableCell sx={{ maxWidth: 250 }}>
                      <Typography variant="body2" noWrap>{item.title}</Typography>
                    </TableCell>
                  )}
                  {visibleColumns.has('channel') && (
                    <TableCell>
                      <Typography variant="body2" noWrap color="text.secondary">{item.channel}</Typography>
                    </TableCell>
                  )}
                  {visibleColumns.has('format') && (
                    <TableCell>
                      {item.format && <Chip label={item.format.toUpperCase()} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />}
                    </TableCell>
                  )}
                  {visibleColumns.has('resolution') && (
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {item.resolution ? `${item.resolution}p` : '—'}
                      </Typography>
                    </TableCell>
                  )}
                  {visibleColumns.has('fileSize') && (
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{formatSize(item.fileSize)}</Typography>
                    </TableCell>
                  )}
                  {visibleColumns.has('duration') && (
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{formatDuration(item.duration)}</Typography>
                    </TableCell>
                  )}
                  {visibleColumns.has('downloadedAt') && (
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{formatDate(item.downloadedAt)}</Typography>
                    </TableCell>
                  )}
                  {visibleColumns.has('addedAt') && (
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{formatDate(item.addedAt)}</Typography>
                    </TableCell>
                  )}
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

      <Popover
        open={!!columnAnchor}
        anchorEl={columnAnchor}
        onClose={() => setColumnAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, minWidth: 160 }}>
          <Typography variant="caption" color="text.secondary" sx={{ px: 1, pb: 0.5, display: 'block' }}>Show Columns</Typography>
          {ALL_COLUMNS.map(col => (
            <MenuItem key={col.id} dense onClick={() => toggleColumn(col.id)}>
              <Checkbox size="small" checked={visibleColumns.has(col.id)} sx={{ p: 0.5, mr: 1 }} />
              <ListItemText primaryTypographyProps={{ variant: 'body2' }}>{col.label}</ListItemText>
            </MenuItem>
          ))}
        </Box>
      </Popover>

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
