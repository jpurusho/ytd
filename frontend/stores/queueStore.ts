/**
 * Download queue state management with Zustand
 * Replaces polling with event-driven updates
 */
import { create } from 'zustand';
import type { QueueItem } from '@shared/types';

interface QueueState {
  queue: QueueItem[];
  loading: boolean;

  // Computed
  activeCount: number;
  pendingCount: number;

  // Actions
  setQueue: (queue: QueueItem[]) => void;
  setLoading: (loading: boolean) => void;
  loadQueue: () => Promise<void>;
  updateItem: (queueId: number, updates: Partial<QueueItem>) => void;
  removeItem: (queueId: number) => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  loading: false,

  get activeCount() {
    return get().queue.filter(
      (i) => i.status === 'downloading' || i.status === 'pending'
    ).length;
  },

  get pendingCount() {
    return get().queue.filter((i) => i.status === 'pending').length;
  },

  setQueue: (queue) => set({ queue }),
  setLoading: (loading) => set({ loading }),

  loadQueue: async () => {
    try {
      set({ loading: true });
      const queue = await window.api.downloads.getQueue();
      set({ queue, loading: false });
    } catch (error) {
      console.error('Failed to load queue:', error);
      set({ loading: false });
    }
  },

  updateItem: (queueId, updates) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === queueId ? { ...item, ...updates } : item
      ),
    }));
  },

  removeItem: (queueId) => {
    set((state) => ({
      queue: state.queue.filter((item) => item.id !== queueId),
    }));
  },
}));

// Set up IPC event listeners for real-time updates
if (typeof window !== 'undefined' && window.api) {
  // Listen for queue updates from main process
  // This will be implemented after we add event emitters
}
