/**
 * Vitest test setup file
 * Runs before each test suite
 */
import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Electron APIs for renderer tests
global.window = global.window || {};
(global.window as any).api = {
  auth: {
    login: vi.fn(),
    logout: vi.fn(),
    isLoggedIn: vi.fn(),
    getUser: vi.fn(),
  },
  youtube: {
    search: vi.fn(),
    getPlaylists: vi.fn(),
    getPlaylistItems: vi.fn(),
    getVideoInfo: vi.fn(),
    getFormats: vi.fn(),
    searchChannels: vi.fn(),
    unlikeVideo: vi.fn(),
  },
  downloads: {
    start: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    retry: vi.fn(),
    getQueue: vi.fn(),
    getHistory: vi.fn(),
    clearFailed: vi.fn(),
  },
  playlists: {
    getAll: vi.fn(),
    getItems: vi.fn(),
    create: vi.fn(),
    addVideo: vi.fn(),
    removeVideo: vi.fn(),
    delete: vi.fn(),
    syncToYouTube: vi.fn(),
    pullFromYouTube: vi.fn(),
  },
  app: {
    getVersion: vi.fn(),
    getPlatform: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    selectDirectory: vi.fn(),
    openPath: vi.fn(),
    getVideoFileUrl: vi.fn(),
    convertToMp4: vi.fn(),
    checkTools: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    onDownloadProgress: vi.fn(() => () => {}),
  },
};

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
};

// Mock localStorage (jsdom provides it, just spy on methods)
if (typeof global.localStorage !== 'undefined') {
  vi.spyOn(global.localStorage, 'getItem');
  vi.spyOn(global.localStorage, 'setItem');
  vi.spyOn(global.localStorage, 'removeItem');
  vi.spyOn(global.localStorage, 'clear');
}

// Mock IntersectionObserver (used by some MUI components)
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;
