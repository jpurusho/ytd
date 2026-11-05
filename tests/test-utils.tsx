/**
 * Custom test utilities for React component testing
 */
import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '../frontend/theme/ThemeContext';

/**
 * Custom render function that wraps components with providers
 */
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { customRender as render };

/**
 * Mock a successful API response
 */
export function mockApiSuccess<T>(data: T) {
  return Promise.resolve(data);
}

/**
 * Mock an API error
 */
export function mockApiError(message: string) {
  return Promise.reject(new Error(message));
}

/**
 * Wait for async operations to complete
 */
export function waitForAsync() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Create a mock video object for testing
 */
export function createMockVideo(overrides = {}) {
  return {
    videoId: 'test-video-id',
    title: 'Test Video',
    channel: 'Test Channel',
    channelId: 'test-channel-id',
    thumbnail: 'https://example.com/thumb.jpg',
    duration: 300,
    viewCount: 1000,
    publishedAt: '2024-01-01T00:00:00Z',
    description: 'Test description',
    ...overrides,
  };
}

/**
 * Create a mock playlist for testing
 */
export function createMockPlaylist(overrides = {}) {
  return {
    id: 1,
    name: 'Test Playlist',
    description: 'Test description',
    youtube_playlist_id: null,
    last_synced_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Create a mock download record for testing
 */
export function createMockDownload(overrides = {}) {
  return {
    id: 1,
    video_id: 'test-video-id',
    title: 'Test Video',
    channel: 'Test Channel',
    channel_id: 'test-channel-id',
    thumbnail_url: 'https://example.com/thumb.jpg',
    url: 'https://youtube.com/watch?v=test',
    format: 'mp4',
    quality: '1080p',
    resolution: '1920x1080',
    file_path: '/path/to/video.mp4',
    file_size: 1024000,
    duration: 300,
    status: 'completed',
    downloaded_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}
