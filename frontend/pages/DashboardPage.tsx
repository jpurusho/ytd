import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, IconButton, Chip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import StorageIcon from '@mui/icons-material/Storage';
import TodayIcon from '@mui/icons-material/Today';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import VideoPlayer from '../components/VideoPlayer/VideoPlayer';
import YouTubePreview from '../components/YouTubePreview/YouTubePreview';
import AddToPlaylistDialog from '../components/AddToPlaylistDialog/AddToPlaylistDialog';
import type { DownloadRecord, VideoInfo, LibraryItem } from '@shared/types';

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalItems: 0, totalSize: 0, downloadedCount: 0 });
  const [recent, setRecent] = useState<DownloadRecord[]>([]);
  const [fileStatus, setFileStatus] = useState<Record<number, boolean>>({});
  const [playingRecord, setPlayingRecord] = useState<DownloadRecord | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoInfo | null>(null);
  const [addToPlaylistVideo, setAddToPlaylistVideo] = useState<VideoInfo | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [libraryStats, history] = await Promise.all([
        window.api.library.getStats(),
        window.api.downloads.getHistory(5),
      ]);
      setStats(libraryStats);
      setRecent(history);

      const statusMap: Record<number, boolean> = {};
      await Promise.all(history.map(async (r) => {
        if (r.filePath) {
          statusMap[r.id] = await window.api.app.fileExists(r.filePath);
        } else {
          statusMap[r.id] = false;
        }
      }));
      setFileStatus(statusMap);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
        Dashboard
      </Typography>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }} elevation={0}>
            <Box display="flex" alignItems="center" gap={1.5}>
              <DownloadIcon color="primary" />
              <Box>
                <Typography variant="h5" fontWeight={700}>{stats.totalItems}</Typography>
                <Typography variant="caption" color="text.secondary">Library Videos</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }} elevation={0}>
            <Box display="flex" alignItems="center" gap={1.5}>
              <StorageIcon color="secondary" />
              <Box>
                <Typography variant="h5" fontWeight={700}>{formatSize(stats.totalSize)}</Typography>
                <Typography variant="caption" color="text.secondary">Storage Used</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }} elevation={0}>
            <Box display="flex" alignItems="center" gap={1.5}>
              <TodayIcon color="success" />
              <Box>
                <Typography variant="h5" fontWeight={700}>{stats.downloadedCount}</Typography>
                <Typography variant="caption" color="text.secondary">Downloaded</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle2" color="text.secondary">
          Recent Downloads
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Last 5 from history
        </Typography>
      </Box>

      {recent.length === 0 ? (
        <Typography variant="body2" color="text.secondary" py={2}>
          No downloads yet. Search or browse to get started.
        </Typography>
      ) : (
        <Box display="flex" flexDirection="column" gap={1}>
          {recent.map((record) => {
            const exists = fileStatus[record.id] !== false;
            const missing = fileStatus[record.id] === false;

            return (
              <Paper
                key={record.id}
                sx={{
                  p: 1.5, borderRadius: 2, border: '1px solid',
                  borderColor: missing ? 'error.main' : 'divider',
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  transition: 'border-color 0.2s, opacity 0.2s',
                  opacity: missing ? 0.55 : 1,
                  '&:hover': { borderColor: missing ? 'error.main' : 'primary.main' },
                }}
                elevation={0}
              >
                <Box
                sx={{
                  position: 'relative', flexShrink: 0, cursor: missing ? 'default' : 'pointer', borderRadius: 1, overflow: 'hidden',
                  width: 80, height: 45, bgcolor: 'action.hover',
                  '&:hover .play-overlay': { opacity: missing ? 0 : 1 },
                }}
                onClick={() => {
                  if (missing) return;
                  if (record.format === 'mp3') {
                    setPlayingRecord(record);
                  } else {
                    setPreviewVideo({ id: record.videoId, title: record.title, channel: record.channel, channelId: '', thumbnail: record.thumbnailUrl || '', duration: 0, publishedAt: '', viewCount: 0, description: '' });
                  }
                }}
              >
                {record.thumbnailUrl ? (
                  <img
                    src={record.thumbnailUrl}
                    alt=""
                    style={{ width: 80, height: 45, objectFit: 'cover', display: 'block', filter: missing ? 'grayscale(1)' : 'none' }}
                  />
                ) : (
                  <Box sx={{ width: 80, height: 45, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MusicNoteIcon sx={{ color: 'text.secondary' }} />
                  </Box>
                )}
                {record.format === 'mp3' && (
                  <Box sx={{ position: 'absolute', top: 2, left: 2, bgcolor: 'rgba(0,0,0,0.7)', borderRadius: 0.5, px: 0.5, display: 'flex', alignItems: 'center' }}>
                    <MusicNoteIcon sx={{ color: '#fff', fontSize: 12 }} />
                  </Box>
                )}
                {!missing && (
                  <Box className="play-overlay" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.4)', opacity: 0, transition: 'opacity 0.2s' }}>
                    <PlayArrowIcon sx={{ color: '#fff', fontSize: 24 }} />
                  </Box>
                )}
              </Box>
                <Box flex={1} overflow="hidden">
                  <Typography variant="body2" fontWeight={500} noWrap>{record.title}</Typography>
                  <Box display="flex" gap={1} alignItems="center" mt={0.25}>
                    <Typography variant="caption" color="text.secondary">{record.channel}</Typography>
                    <Chip label={record.format.toUpperCase()} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.5 } }} />
                    {record.resolution && (
                      <Chip label={`${record.resolution}p`} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.5 } }} />
                    )}
                    <Typography variant="caption" color="text.secondary">{formatSize(record.fileSize)}</Typography>
                    {missing && (
                      <Chip label="File missing" size="small" color="error" variant="outlined" sx={{ height: 16, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.5 } }} />
                    )}
                  </Box>
                </Box>
                <Box display="flex" gap={0.5} flexShrink={0}>
                  <IconButton
                    size="small"
                    onClick={() => setPlayingRecord(record)}
                    title={missing ? 'File missing' : 'Play'}
                    disabled={missing}
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => window.api.app.showInFinder(record.filePath)}
                    title="Show in Finder"
                    disabled={missing}
                  >
                    <FolderOpenIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => setAddToPlaylistVideo({ id: record.videoId, title: record.title, channel: record.channel, channelId: '', thumbnail: record.thumbnailUrl || '', duration: 0, publishedAt: record.downloadedAt, viewCount: 0, description: '' })} title="Add to playlist">
                    <PlaylistAddIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => window.api.app.openExternal(`https://www.youtube.com/watch?v=${record.videoId}`)} title="Open on YouTube">
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <VideoPlayer
        open={!!playingRecord}
        record={playingRecord}
        onClose={() => setPlayingRecord(null)}
      />

      <YouTubePreview
        video={previewVideo}
        onClose={() => setPreviewVideo(null)}
        onDownload={() => setPreviewVideo(null)}
      />

      <AddToPlaylistDialog
        open={!!addToPlaylistVideo}
        videos={addToPlaylistVideo ? [addToPlaylistVideo] : []}
        onClose={() => setAddToPlaylistVideo(null)}
      />
    </Box>
  );
}
