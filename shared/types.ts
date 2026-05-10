export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expiry_date?: number;
  scope?: string;
}

export interface UserInfo {
  email: string;
  name: string;
  picture: string;
}

export interface SearchOptions {
  order?: 'relevance' | 'date' | 'viewCount' | 'rating' | 'title';
  videoDuration?: 'short' | 'medium' | 'long';
  publishedAfter?: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  duration: number;
  publishedAt: string;
  viewCount: number;
  description: string;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  itemCount: number;
  thumbnail: string;
  description: string;
}

export interface PlaylistItem {
  videoId: string;
  title: string;
  thumbnail: string;
  channel: string;
  position: number;
  publishedAt: string;
}

export interface SubscriptionInfo {
  channelId: string;
  channelTitle: string;
  thumbnail: string;
  description: string;
}

export interface FormatInfo {
  formatId: string;
  ext: string;
  resolution: string;
  fps: number;
  vcodec: string;
  acodec: string;
  filesize: number | null;
  qualityLabel: string;
}

export interface DownloadOptions {
  format: string;
  quality: string;
  resolution?: string;
  startTime?: string;
  endTime?: string;
  outputDir?: string;
}

export interface QueueItem {
  id: number;
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  url: string;
  format: string;
  quality: string;
  resolution?: string;
  startTime?: string;
  endTime?: string;
  priority: number;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'scheduled';
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: string;
  eta: string;
  error?: string;
  tempFilePath?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface DownloadRecord {
  id: number;
  videoId: string;
  title: string;
  channel: string;
  channelId?: string;
  thumbnailUrl?: string;
  url: string;
  format: string;
  quality: string;
  resolution?: string;
  filePath: string;
  fileSize: number;
  duration: number;
  startTime?: string;
  endTime?: string;
  status: string;
  error?: string;
  downloadedAt: string;
}

export interface DownloadProgress {
  queueId: number;
  progress: number;
  speed: string;
  eta: string;
  downloadedBytes: number;
  totalBytes: number;
  status: string;
}

export interface LocalPlaylist {
  id: number;
  name: string;
  description: string;
  youtubePlaylistId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalPlaylistItem {
  id: number;
  playlistId: number;
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  duration: number;
  publishedAt: string;
  position: number;
  addedAt: string;
}

export interface LocalPlaylistVideoItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  duration: number;
  publishedAt?: string;
}

export interface DownloadRequest {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  url: string;
  format: string;
  quality: string;
  resolution?: string;
  startTime?: string;
  endTime?: string;
}

export interface ElectronAPI {
  auth: {
    hasCredentials: () => Promise<boolean>;
    setCredentials: (clientId: string, clientSecret: string) => Promise<void>;
    login: () => Promise<UserInfo>;
    logout: () => Promise<void>;
    getUser: () => Promise<UserInfo | null>;
    isLoggedIn: () => Promise<boolean>;
  };
  youtube: {
    search: (query: string, maxResults?: number, options?: SearchOptions) => Promise<VideoInfo[]>;
    getPlaylists: () => Promise<PlaylistInfo[]>;
    getPlaylistItems: (playlistId: string, maxResults?: number) => Promise<PlaylistItem[]>;
    getSubscriptions: (maxResults?: number) => Promise<SubscriptionInfo[]>;
    getChannelVideos: (channelId: string, maxResults?: number) => Promise<VideoInfo[]>;
    getVideoInfo: (videoId: string) => Promise<VideoInfo>;
    getFormats: (url: string) => Promise<FormatInfo[]>;
  };
  downloads: {
    start: (request: DownloadRequest) => Promise<QueueItem>;
    cancel: (queueId: number) => Promise<void>;
    pause: (queueId: number) => Promise<void>;
    resume: (queueId: number) => Promise<void>;
    retry: (queueId: number) => Promise<void>;
    getQueue: () => Promise<QueueItem[]>;
    getHistory: (limit?: number) => Promise<DownloadRecord[]>;
    deleteHistory: (ids: number[]) => Promise<void>;
    clearHistory: () => Promise<void>;
    onProgress: (callback: (progress: DownloadProgress) => void) => () => void;
    onComplete: (callback: (record: DownloadRecord) => void) => () => void;
    onError: (callback: (data: { queueId: number; error: string }) => void) => () => void;
  };
  playlists: {
    create: (name: string, description?: string) => Promise<LocalPlaylist>;
    getAll: () => Promise<LocalPlaylist[]>;
    get: (id: number) => Promise<LocalPlaylist | null>;
    update: (id: number, updates: { name?: string; description?: string }) => Promise<LocalPlaylist | null>;
    delete: (id: number) => Promise<void>;
    addItem: (playlistId: number, item: LocalPlaylistVideoItem) => Promise<LocalPlaylistItem>;
    removeItem: (playlistId: number, videoId: string) => Promise<void>;
    getItems: (playlistId: number) => Promise<LocalPlaylistItem[]>;
    reorderItem: (playlistId: number, videoId: string, newPosition: number) => Promise<void>;
    syncToYouTube: (playlistId: number) => Promise<{ success: boolean; youtubePlaylistId: string }>;
    pullFromYouTube: (youtubePlaylistId: string, localPlaylistId?: number) => Promise<LocalPlaylist | null>;
  };
  app: {
    openExternal: (url: string) => Promise<void>;
    selectDirectory: () => Promise<string | null>;
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
    getDataDir: () => Promise<string>;
    setDataDir: (dir: string) => Promise<void>;
    getSetting: (key: string) => Promise<string | null>;
    setSetting: (key: string, value: string) => Promise<void>;
    checkForUpdates: () => Promise<{ status: string; version?: string; url?: string; message?: string }>;
    downloadUpdate: (url: string) => Promise<{ success: boolean; path: string; size: number }>;
    onDownloadProgress: (callback: (data: { downloaded: number; total: number; percent: number }) => void) => () => void;
    checkTools: () => Promise<{ ytDlp: { installed: boolean; path: string; version?: string }; ffmpeg: { installed: boolean; path: string; version?: string } }>;
    getVideoFileUrl: (filePath: string) => Promise<{ url?: string; error?: string }>;
    fileExists: (filePath: string) => Promise<boolean>;
    convertToMp4: (filePath: string) => Promise<{ success?: boolean; outputPath?: string; error?: string; message?: string }>;
    openInSystemPlayer: (filePath: string) => Promise<void>;
    showInFinder: (filePath: string) => Promise<void>;
    onFullscreenChange: (callback: (isFullScreen: boolean) => void) => () => void;
  };
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
