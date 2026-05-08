import React from 'react';
import { Box, Typography, LinearProgress, IconButton, Chip } from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
import ReplayIcon from '@mui/icons-material/Replay';
import type { QueueItem } from '@shared/types';

interface Props {
  item: QueueItem;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
}

function getStatusColor(status: string): 'default' | 'primary' | 'success' | 'error' | 'warning' {
  switch (status) {
    case 'downloading': return 'primary';
    case 'completed': return 'success';
    case 'failed': return 'error';
    case 'paused': return 'warning';
    default: return 'default';
  }
}

export default function DownloadProgress({ item, onPause, onResume, onCancel, onRetry }: Props) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        gap: 1.5,
        alignItems: 'center',
      }}
    >
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt=""
          style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
        />
      )}

      <Box flex={1} overflow="hidden">
        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
          <Typography variant="body2" fontWeight={500} noWrap flex={1}>
            {item.title}
          </Typography>
          <Chip
            label={item.status}
            size="small"
            color={getStatusColor(item.status)}
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        </Box>

        {item.status === 'downloading' && (
          <>
            <LinearProgress
              variant="determinate"
              value={item.progress}
              sx={{ height: 4, borderRadius: 2, mb: 0.5 }}
            />
            <Box display="flex" gap={2}>
              <Typography variant="caption" color="text.secondary">
                {item.progress.toFixed(1)}%
              </Typography>
              {item.speed && (
                <Typography variant="caption" color="text.secondary">
                  {item.speed}
                </Typography>
              )}
              {item.eta && (
                <Typography variant="caption" color="text.secondary">
                  ETA: {item.eta}
                </Typography>
              )}
            </Box>
          </>
        )}

        {item.status === 'paused' && (
          <Typography variant="caption" color="warning.main">
            Paused at {item.progress.toFixed(1)}%
          </Typography>
        )}

        {item.status === 'failed' && (
          <Typography variant="caption" color="error.main" noWrap>
            {item.error || 'Download failed'}
          </Typography>
        )}

        {item.status === 'pending' && (
          <Typography variant="caption" color="text.secondary">
            Waiting in queue...
          </Typography>
        )}
      </Box>

      <Box display="flex" gap={0.5} flexShrink={0}>
        {item.status === 'downloading' && (
          <IconButton size="small" onClick={() => onPause(item.id)} title="Pause">
            <PauseIcon fontSize="small" />
          </IconButton>
        )}
        {item.status === 'paused' && (
          <IconButton size="small" onClick={() => onResume(item.id)} title="Resume">
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        )}
        {item.status === 'failed' && (
          <IconButton size="small" onClick={() => onRetry(item.id)} title="Retry">
            <ReplayIcon fontSize="small" />
          </IconButton>
        )}
        {(item.status === 'downloading' || item.status === 'paused' || item.status === 'pending') && (
          <IconButton size="small" onClick={() => onCancel(item.id)} title="Cancel">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
