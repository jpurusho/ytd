/**
 * App settings state management with Zustand
 */
import { create } from 'zustand';

interface SettingsState {
  outputDir: string;
  maxConcurrent: number;
  useBrowserCookies: boolean;
  cookieBrowser: string;

  // Actions
  setOutputDir: (dir: string) => void;
  setMaxConcurrent: (max: number) => void;
  setUseBrowserCookies: (use: boolean) => void;
  setCookieBrowser: (browser: string) => void;
  loadSettings: () => Promise<void>;
  saveSetting: (key: string, value: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  outputDir: '~/Downloads',
  maxConcurrent: 3,
  useBrowserCookies: false,
  cookieBrowser: 'chrome',

  setOutputDir: (outputDir) => set({ outputDir }),
  setMaxConcurrent: (maxConcurrent) => set({ maxConcurrent }),
  setUseBrowserCookies: (useBrowserCookies) => set({ useBrowserCookies }),
  setCookieBrowser: (cookieBrowser) => set({ cookieBrowser }),

  loadSettings: async () => {
    try {
      const dir = await window.api.app.getSetting('output_dir');
      if (dir) set({ outputDir: dir });

      const concurrent = await window.api.app.getSetting('max_concurrent');
      if (concurrent) set({ maxConcurrent: parseInt(concurrent, 10) });

      const cookies = await window.api.app.getSetting('use_browser_cookies');
      if (cookies === 'true') set({ useBrowserCookies: true });

      const browser = await window.api.app.getSetting('cookie_browser');
      if (browser) set({ cookieBrowser: browser });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSetting: async (key, value) => {
    await window.api.app.setSetting(key, value);
  },
}));
