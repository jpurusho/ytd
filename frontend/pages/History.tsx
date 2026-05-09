import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Button, TextField, InputAdornment,
  Chip, Checkbox, TableSortLabel, Toolbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import VideoPlayer from '../components/VideoPlayer/VideoPlayer';
import AddToPlaylistDialog from '../components/AddToPlaylistDialog/AddToPlaylistDialog';
import type { DownloadRecord, VideoInfo } from '@shared/types';

type SortField = 'title' | 'channel' | 'format' | 'fileSize' | 'resolution' | 'downloadedAt';
type SortOrder = 'asc' | 'desc';

export default function History() {
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [playingRecord, setPlayingRecord] = useState<DownloadRecord | null>(null);
  const [sortField, setSortField] = useState<SortField>('downloadedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [converting, setConverting] = useState<Set<number>>(new Set());
  const [addToPlaylistVideo, setAddToPlaylistVideo] = useState<VideoInfo | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    const data = await window.api.downloads.getHistory(500);
    setRecords(data);
    setSelected(new Set());
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    await window.api.downloads.deleteHistory(Array.from(selected));
    loadHistory();
  }

  async function handleClearAll() {
    await window.api.downloads.clearHistory();
    setRecords([]);
    setSelected(new Set());
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

  function toggleSelect(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(r => r.id)));
    }
  }

  const filtered = filter
    ? records.filter(r => r.title.toLowerCase().includes(filter.toLowerCase()) || r.channel.toLowerCase().includes(filter.toLowerCase()))
    : records;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'title': cmp = a.title.localeCompare(b.title); break;
      case 'channel': cmp = a.channel.localeCompare(b.channel); break;
      case 'format': cmp = a.format.localeCompare(b.format); break;
      case 'fileSize': cmp = a.fileSize - b.fileSize; break;
      case 'resolution': cmp = (parseInt(a.resolution || '0') || 0) - (parseInt(b.resolution || '0') || 0); break;
      case 'downloadedAt': cmp = a.downloadedAt.localeCompare(b.downloadedAt); break;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  function formatSize(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function formatDate(iso: string): string {
    const date = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6" fontWeight={600}>
          Download History
          {records.length > 0 && (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              ({records.length} total)
            </Typography>
          )}
        </Typography>
        <Box display="flex" gap={1}>
          {selected.size > 0 && (
            <Button size="small" color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={handleDeleteSelected}>
              Delete {selected.size} selected
            </Button>
          )}
          {records.length > 0 && (
            <Button size="small" color="error" onClick={handleClearAll}>
              Purge All
            </Button>
          )}
        </Box>
      </Box>

      {records.length > 0 && (
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
            {records.length === 0 ? 'No download history yet' : 'No matching results'}
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
              {sorted.map((record) => (
                <TableRow key={record.id} hover selected={selected.has(record.id)}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(record.id)} onChange={() => toggleSelect(record.id)} />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 250 }}>
                    <Typography variant="body2" noWrap>{record.title}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap color="text.secondary">{record.channel}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={record.format.toUpperCase()} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {record.resolution ? `${record.resolution}p` : 'best'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{formatSize(record.fileSize)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{formatDate(record.downloadedAt)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => setPlayingRecord(record)} title="Play">
                      <PlayArrowIcon fontSize="small" />
                    </IconButton>
                    {record.format !== 'mp4' && record.format !== 'mp3' && (
                      <IconButton
                        size="small"
                        color="primary"
                        disabled={converting.has(record.id)}
                        onClick={async () => {
                          setConverting(prev => new Set(prev).add(record.id));
                          const result = await window.api.app.convertToMp4(record.filePath);
                          setConverting(prev => { const next = new Set(prev); next.delete(record.id); return next; });
                          if (result.success && result.outputPath) {
                            window.api.app.showInFinder(result.outputPath);
                          }
                        }}
                        title="Convert to MP4"
                      >
                        <SwapHorizIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={() => openInFinder(record.filePath)} title="Show in Finder">
                      <FolderOpenIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setAddToPlaylistVideo({ id: record.videoId, title: record.title, channel: record.channel, channelId: '', thumbnail: record.thumbnailUrl || '', duration: 0, publishedAt: record.downloadedAt, viewCount: 0, description: '' })} title="Add to playlist">
                      <PlaylistAddIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => openInYouTube(record.videoId)} title="Open on YouTube">
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={async () => { await window.api.downloads.deleteHistory([record.id]); loadHistory(); }} title="Remove">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <VideoPlayer
        open={!!playingRecord}
        record={playingRecord}
        onClose={() => setPlayingRecord(null)}
      />

      <AddToPlaylistDialog
        open={!!addToPlaylistVideo}
        videos={addToPlaylistVideo ? [addToPlaylistVideo] : []}
        onClose={() => setAddToPlaylistVideo(null)}
      />
    </Box>
  );
}
