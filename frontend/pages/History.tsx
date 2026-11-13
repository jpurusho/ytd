import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Button, TextField, InputAdornment,
  Chip, Checkbox, TableSortLabel, Toolbar, Menu, MenuItem, ListItemIcon,
  ListItemText, Divider, Snackbar,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenWithIcon from '@mui/icons-material/OpenWith';
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
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRecord, setMenuRecord] = useState<DownloadRecord | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [transcriptStatus, setTranscriptStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    // Check transcript status for all records
    async function checkTranscripts() {
      const status: Record<string, boolean> = {};
      for (const record of records) {
        if (record.videoId) {
          try {
            const transcript = await window.api.transcripts.get(record.videoId);
            status[record.videoId] = transcript?.status === 'completed';
          } catch {
            status[record.videoId] = false;
          }
        }
      }
      setTranscriptStatus(status);
    }
    if (records.length > 0) {
      checkTranscripts();
    }
  }, [records]);

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

  function openInSystemPlayer(filePath: string) {
    window.api.app.openInSystemPlayer(filePath);
  }

  function handleCopyURL() {
    if (!menuRecord?.videoId) return;
    const url = `https://www.youtube.com/watch?v=${menuRecord.videoId}`;
    navigator.clipboard.writeText(url);
    setSnackbarMessage('Video URL copied to clipboard');
    setMenuAnchor(null);
  }

  async function handleTranscribe() {
    if (!menuRecord?.videoId) return;
    setMenuAnchor(null);
    try {
      const availability = await window.api.transcripts.checkAvailability();
      if (!availability.whisperLocal && !availability.whisperAPI) {
        setSnackbarMessage('Transcription requires Whisper (brew install openai-whisper) or OpenAI API key');
        return;
      }

      await window.api.transcripts.start(menuRecord.videoId, { method: 'auto', model: 'base' });
      setSnackbarMessage('Transcription started');

      setTimeout(async () => {
        try {
          const transcript = await window.api.transcripts.get(menuRecord.videoId!);
          setTranscriptStatus(prev => ({ ...prev, [menuRecord.videoId!]: transcript?.status === 'completed' }));
        } catch {}
      }, 2000);
    } catch (error) {
      setSnackbarMessage(`Failed to start transcription: ${(error as Error).message}`);
    }
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
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuAnchor(e.currentTarget);
                        setMenuRecord(record);
                      }}
                    >
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
        open={!!playingRecord}
        record={playingRecord}
        onClose={() => setPlayingRecord(null)}
      />

      <AddToPlaylistDialog
        open={!!addToPlaylistVideo}
        videos={addToPlaylistVideo ? [addToPlaylistVideo] : []}
        onClose={() => setAddToPlaylistVideo(null)}
      />

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => { setMenuAnchor(null); setMenuRecord(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {menuRecord?.filePath && (
          <MenuItem onClick={() => { setPlayingRecord(menuRecord); setMenuAnchor(null); }}>
            <ListItemIcon><PlayArrowIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Play</ListItemText>
          </MenuItem>
        )}
        {menuRecord?.filePath && (
          <MenuItem onClick={() => { openInSystemPlayer(menuRecord.filePath); setMenuAnchor(null); }}>
            <ListItemIcon><OpenWithIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Open in System Player</ListItemText>
          </MenuItem>
        )}
        {menuRecord?.filePath && (
          <MenuItem onClick={() => { openInFinder(menuRecord.filePath); setMenuAnchor(null); }}>
            <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Show in Finder</ListItemText>
          </MenuItem>
        )}
        <Divider />
        {menuRecord && (
          <MenuItem onClick={() => {
            setAddToPlaylistVideo({
              id: menuRecord.videoId,
              title: menuRecord.title,
              channel: menuRecord.channel,
              channelId: '',
              thumbnail: menuRecord.thumbnailUrl || '',
              duration: 0,
              publishedAt: menuRecord.downloadedAt,
              viewCount: 0,
              description: ''
            });
            setMenuAnchor(null);
          }}>
            <ListItemIcon><PlaylistAddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Add to Playlist</ListItemText>
          </MenuItem>
        )}
        {menuRecord?.videoId && (
          <MenuItem onClick={handleTranscribe}>
            <ListItemIcon>
              <SubtitlesIcon fontSize="small" color={transcriptStatus[menuRecord.videoId] ? 'success' : 'inherit'} />
            </ListItemIcon>
            <ListItemText>
              {transcriptStatus[menuRecord.videoId] ? 'View Transcript' : 'Transcribe'}
            </ListItemText>
          </MenuItem>
        )}
        <Divider />
        {menuRecord?.format && menuRecord.format !== 'mp4' && menuRecord.format !== 'mp3' && (
          <MenuItem onClick={async () => {
            if (!menuRecord?.filePath) return;
            setMenuAnchor(null);
            setConverting(prev => new Set(prev).add(menuRecord.id));
            const result = await window.api.app.convertToMp4(menuRecord.filePath);
            setConverting(prev => { const next = new Set(prev); next.delete(menuRecord.id); return next; });
            if (result.success && result.outputPath) window.api.app.showInFinder(result.outputPath);
          }}>
            <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Convert to MP4</ListItemText>
          </MenuItem>
        )}
        <Divider />
        {menuRecord?.videoId && (
          <MenuItem onClick={handleCopyURL}>
            <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Copy Video URL</ListItemText>
          </MenuItem>
        )}
        {menuRecord?.videoId && (
          <MenuItem onClick={() => { openInYouTube(menuRecord.videoId); setMenuAnchor(null); }}>
            <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Open on YouTube</ListItemText>
          </MenuItem>
        )}
        <Divider />
        {menuRecord && (
          <MenuItem onClick={async () => {
            await window.api.downloads.deleteHistory([menuRecord.id]);
            setMenuAnchor(null);
            loadHistory();
          }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText sx={{ color: 'error.main' }}>Remove from History</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage('')}
        message={snackbarMessage}
      />
    </Box>
  );
}
