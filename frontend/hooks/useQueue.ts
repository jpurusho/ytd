/**
 * React Query hooks for download queue
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueueItem, DownloadRequest } from '@shared/types';
import { errorService } from '../services/error-service';

export function useQueueQuery() {
  return useQuery({
    queryKey: ['queue'],
    queryFn: () => window.api.downloads.getQueue(),
    refetchInterval: 3000, // Poll every 3s (will replace with events later)
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
