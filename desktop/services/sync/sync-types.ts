export interface PeerInfo {
  instanceId: string;
  deviceName: string;
  address: string;
  port: number;
  version: string;
  libraryCount: number;
}

export interface PeerManifest {
  peer: PeerInfo;
  playlists: PeerPlaylistInfo[];
}

export interface PeerPlaylistInfo {
  id: number;
  name: string;
  itemCount: number;
  totalSize: number;
}

export interface PeerPlaylistDetail {
  id: number;
  name: string;
  description: string;
  items: PeerVideoInfo[];
}

export interface PeerVideoInfo {
  videoId: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  url: string;
  format: string;
  resolution: string;
  fileSize: number;
  duration: number;
  hasFile: boolean;
}

export interface SyncProgress {
  sessionId: number;
  currentVideoId: string;
  currentTitle: string;
  fileProgress: number;
  speed: string;
  eta: string;
  downloadedBytes: number;
  totalFileBytes: number;
  completedFiles: number;
  totalFiles: number;
  totalTransferredBytes: number;
  totalSessionBytes: number;
  status: 'transferring' | 'completed' | 'paused' | 'failed' | 'cancelled';
}

export interface SyncSessionInfo {
  id: number;
  peerDeviceName: string;
  peerAddress: string;
  direction: 'send' | 'receive';
  status: 'in_progress' | 'completed' | 'paused' | 'failed' | 'cancelled';
  playlistsSynced: string;
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface SyncTransferInfo {
  id: number;
  sessionId: number;
  videoId: string;
  title: string;
  fileSize: number;
  transferredBytes: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
}
