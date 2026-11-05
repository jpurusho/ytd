/**
 * Playlist state management with Zustand
 */
import { create } from 'zustand';
import type { LocalPlaylist } from '@shared/types';

interface PlaylistWithCount extends LocalPlaylist {
  itemCount: number;
}

interface PlaylistState {
  playlists: PlaylistWithCount[];
  loading: boolean;

  // Actions
  setPlaylists: (playlists: PlaylistWithCount[]) => void;
  setLoading: (loading: boolean) => void;
  loadPlaylists: () => Promise<void>;
  addPlaylist: (playlist: PlaylistWithCount) => void;
  removePlaylist: (id: number) => void;
  updatePlaylist: (id: number, updates: Partial<PlaylistWithCount>) => void;
}

export const usePlaylistStore = create<PlaylistState>((set) => ({
  playlists: [],
  loading: false,

  setPlaylists: (playlists) => set({ playlists }),
  setLoading: (loading) => set({ loading }),

  loadPlaylists: async () => {
    try {
      set({ loading: true });
      const data = await window.api.playlists.getAll();
      const withCounts = await Promise.all(
        data.map(async (pl) => {
          const items = await window.api.playlists.getItems(pl.id);
          return { ...pl, itemCount: items.length };
        })
      );
      set({ playlists: withCounts, loading: false });
    } catch (error) {
      console.error('Failed to load playlists:', error);
      set({ loading: false });
    }
  },

  addPlaylist: (playlist) => {
    set((state) => ({
      playlists: [...state.playlists, playlist],
    }));
  },

  removePlaylist: (id) => {
    set((state) => ({
      playlists: state.playlists.filter((p) => p.id !== id),
    }));
  },

  updatePlaylist: (id, updates) => {
    set((state) => ({
      playlists: state.playlists.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }));
  },
}));
