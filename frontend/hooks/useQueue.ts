/**
 * React Query hooks for download queue
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { QueueItem, DownloadRequest } from '@shared/types';
import { errorService } from '../services/error-service';

export function useQueueQuery() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Listen for queue updates from main process (event-driven!)
    const unsubscribe = window.api.downloads.onQueueUpdate((queue) => {
      queryClient.setQueryData(['queue'], queue);
    });

    return unsubscribe;
  }, [queryClient]);

  return useQuery({
    queryKey: ['queue'],
    queryFn: () => window.api.downloads.getQueue(),
    // No more polling! Updates come via events
  });
}

export function useStartDownload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: DownloadRequest) => window.api.downloads.start(request),
    onSuccess: () => {
      // Invalidate queue to refetch
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (error: Error) => {
      errorService.handleError(error, 'Failed to start download');
    },
  });
}

export function usePauseDownload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (queueId: number) => window.api.downloads.pause(queueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (error: Error) => {
      errorService.handleError(error, 'Failed to pause download');
    },
  });
}

export function useResumeDownload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (queueId: number) => window.api.downloads.resume(queueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (error: Error) => {
      errorService.handleError(error, 'Failed to resume download');
    },
  });
}

export function useCancelDownload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (queueId: number) => window.api.downloads.cancel(queueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (error: Error) => {
      errorService.handleError(error, 'Failed to cancel download');
    },
  });
}
