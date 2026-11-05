/**
 * Auth state management with Zustand
 * Replaces prop drilling of user state
 */
import { create } from 'zustand';
import type { UserInfo } from '@shared/types';

interface AuthState {
  user: UserInfo | null;
  loading: boolean;

  // Actions
  setUser: (user: UserInfo | null) => void;
  setLoading: (loading: boolean) => void;
  login: (user: UserInfo) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  login: (user) => set({ user, loading: false }),

  logout: async () => {
    await window.api.auth.logout();
    set({ user: null });
  },

  checkAuth: async () => {
    try {
      set({ loading: true });
      const loggedIn = await window.api.auth.isLoggedIn();
      if (loggedIn) {
        const userInfo = await window.api.auth.getUser();
        set({ user: userInfo, loading: false });
      } else {
        set({ user: null, loading: false });
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      set({ user: null, loading: false });
    }
  },
}));
