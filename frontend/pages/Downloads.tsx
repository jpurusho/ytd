import React, { useState, useEffect } from 'react';
import { Box, Typography, Button } from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DownloadProgress from '../components/DownloadProgress/DownloadProgress';
import type { QueueItem, DownloadProgress as ProgressType } from '@shared/types';

export default function Downloads() {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    loadQueue();

    const unsubProgress = window.api.downloads.onProgress((progress: ProgressType) => {
      setQueue(prev => prev.map(item =>
        item.id === progress.queueId
          ? { ...item, progress: progress.progress, speed: progress.speed, eta: progress.eta, status: 'downloading' as const }
          : item
      ));
    });

    const unsubComplete = window.api.downloads.onComplete(() => {
      loadQueue();
    });

    const unsubError = window.api.downloads.onError(() => {
      loadQueue();
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, []);

  async function loadQueue() {
    const items = await window.api.downloads.getQueue();
    setQueue(items);
  }

  async function handlePause(id: number) {
    await window.api.downloads.pause(id);
    loadQueue();
  }

  async function handleResume(id: number) {
    await window.api.downloads.resume(id);
    loadQueue();
  }

  async function handleCancel(id: number) {
    await window.api.downloads.cancel(id);
    loadQueue();
  }

  async function handleRetry(id: number) {
    await window.api.downloads.retry(id);
    loadQueue();
  }

  const active = queue.filter(i => i.status === 'downloading' || i.status === 'paused');
  const pending = queue.filter(i => i.status === 'pending');
  const failed = queue.filter(i => i.status === 'failed');

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        Downloads
      </Typography>

      {queue.length === 0 && (
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">No downloads in queue</Typography>
          <Typography variant="caption" color="text.secondary">
            Search or browse videos to start downloading
          </Typography>
        </Box>
      )}

      {active.length > 0 && (
        <Box mb={3}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Active ({active.length})
          </Typography>
          <Box display="flex" flexDirection="column" gap={1}>
            {active.map(item => (
              <DownloadProgress
                key={item.id}
                item={item}
                onPause={handlePause}
                onResume={handleResume}
                onCancel={handleCancel}
                onRetry={handleRetry}
              />
            ))}
          </Box>
        </Box>
      )}

      {pending.length > 0 && (
        <Box mb={3}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Pending ({pending.length})
          </Typography>
          <Box display="flex" flexDirection="column" gap={1}>
            {pending.map(item => (
              <DownloadProgress
                key={item.id}
                item={item}
                onPause={handlePause}
                onResume={handleResume}
                onCancel={handleCancel}
                onRetry={handleRetry}
              />
            ))}
          </Box>
        </Box>
      )}

      {failed.length > 0 && (
        <Box mb={3}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle2" color="error.main">
              Failed ({failed.length})
            </Typography>
            <Button
              size="small"
              color="error"
              variant="outlined"
              startIcon={<DeleteSweepIcon />}
              onClick={async () => { await window.api.downloads.clearFailed(); loadQueue(); }}
            >
              Clear all failed
            </Button>
          </Box>
          <Box display="flex" flexDirection="column" gap={1}>
            {failed.map(item => (
              <DownloadProgress
                key={item.id}
                item={item}
                onPause={handlePause}
                onResume={handleResume}
                onCancel={handleCancel}
                onRetry={handleRetry}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
