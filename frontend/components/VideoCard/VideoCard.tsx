import React from 'react';
import { Card, CardMedia, CardContent, Typography, Box, IconButton, Chip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { VideoInfo } from '@shared/types';

export const VIDEO_DRAG_TYPE = 'application/x-ytd-video';

interface Props {
  video: VideoInfo;
  onDownload: (video: VideoInfo) => void;
  onPreview?: (video: VideoInfo) => void;
  onAddToPlaylist?: (video: VideoInfo) => void;
  disabled?: boolean;
  draggable?: boolean;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
  return `${count} views`;
}

export default function VideoCard({ video, onDownload, onPreview, onAddToPlaylist, disabled, draggable = true }: Props) {
  const isPrivate = disabled || video.title === 'Private video' || video.title === 'Deleted video';

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(VIDEO_DRAG_TYPE, JSON.stringify(video));
    e.dataTransfer.effectAllowed = 'copy';
  }

  if (isPrivate) {
    return (
      <Card
        sx={{
          display: 'flex', flexDirection: 'column', height: '100%',
          borderRadius: 2, border: '1px solid', borderColor: 'divider',
          opacity: 0.45, filter: 'grayscale(1)',
        }}
        elevation={0}
      >
        <CardMedia component="img" height={160} image={video.thumbnail || ''} alt="" sx={{ objectFit: 'cover' }} />
        <CardContent sx={{ flex: 1, p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Typography variant="body2" fontWeight={500} color="text.secondary">
            {video.title || 'Private video'}
          </Typography>
          <Chip label="Unavailable" size="small" variant="outlined" color="warning" sx={{ mt: 0.5, height: 18, fontSize: '0.65rem' }} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      draggable={draggable && !isPrivate}
      onDragStart={handleDragStart}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        transition: 'border-color 0.2s',
        cursor: draggable ? 'grab' : undefined,
        '&:hover': { borderColor: 'primary.main' },
      }}
      elevation={0}
    >
      <Box
        sx={{ position: 'relative', cursor: onPreview ? 'pointer' : 'default' }}
        onClick={() => onPreview?.(video)}
      >
        <CardMedia
          component="img"
          height={160}
          image={video.thumbnail}
          alt={video.title}
          sx={{ objectFit: 'cover' }}
        />
        {/* Play overlay on hover */}
        {onPreview && (
          <Box
            sx={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.3)', opacity: 0,
              transition: 'opacity 0.2s',
              '&:hover': { opacity: 1 },
            }}
          >
            <PlayCircleOutlineIcon sx={{ fontSize: 48, color: '#fff' }} />
          </Box>
        )}
        {video.duration > 0 && (
          <Chip
            label={formatDuration(video.duration)}
            size="small"
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              bgcolor: 'rgba(0,0,0,0.8)',
              color: '#fff',
              fontSize: '0.75rem',
              height: 24,
            }}
          />
        )}
      </Box>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography
          variant="body2"
          fontWeight={500}
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.3,
            mb: 0.5,
          }}
        >
          {video.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {video.channel}
        </Typography>
        <Box display="flex" alignItems="center" justifyContent="space-between" mt="auto" pt={1}>
          <Typography variant="caption" color="text.secondary">
            {formatViews(video.viewCount)}
          </Typography>
          <Box>
            <IconButton
              size="small"
              color="primary"
              onClick={() => onDownload(video)}
              title="Download"
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
            {onAddToPlaylist && (
              <IconButton
                size="small"
                onClick={() => onAddToPlaylist(video)}
                title="Add to playlist"
              >
                <PlaylistAddIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
