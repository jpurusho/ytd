import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types';

const api: ElectronAPI = {
  auth: {
    hasCredentials: () => ipcRenderer.invoke('auth:hasCredentials'),
    setCredentials: (clientId: string, clientSecret: string) => ipcRenderer.invoke('auth:setCredentials', clientId, clientSecret),
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    isLoggedIn: () => ipcRenderer.invoke('auth:isLoggedIn'),
  },
  youtube: {
    search: (query: string, maxResults?: number, options?: import('../shared/types').SearchOptions) => ipcRenderer.invoke('youtube:search', query, maxResults, options),
    getPlaylists: () => ipcRenderer.invoke('youtube:getPlaylists'),
    getPlaylistItems: (playlistId: string, maxResults?: number) => ipcRenderer.invoke('youtube:getPlaylistItems', playlistId, maxResults),
    getSubscriptions: (maxResults?: number) => ipcRenderer.invoke('youtube:getSubscriptions', maxResults),
    getChannelVideos: (channelId: string, maxResults?: number, pageToken?: string) => ipcRenderer.invoke('youtube:getChannelVideos', channelId, maxResults, pageToken),
    searchChannels: (query: string, maxResults?: number) => ipcRenderer.invoke('youtube:searchChannels', query, maxResults),
    getVideoInfo: (videoId: string) => ipcRenderer.invoke('youtube:getVideoInfo', videoId),
    getFormats: (url: string) => ipcRenderer.invoke('youtube:getFormats', url),
  },
  downloads: {
    start: (request) => ipcRenderer.invoke('downloads:start', request),
    cancel: (queueId: number) => ipcRenderer.invoke('downloads:cancel', queueId),
    pause: (queueId: number) => ipcRenderer.invoke('downloads:pause', queueId),
    resume: (queueId: number) => ipcRenderer.invoke('downloads:resume', queueId),
    retry: (queueId: number) => ipcRenderer.invoke('downloads:retry', queueId),
    getQueue: () => ipcRenderer.invoke('downloads:getQueue'),
    getHistory: (limit?: number) => ipcRenderer.invoke('downloads:getHistory', limit),
    deleteHistory: (ids: number[]) => ipcRenderer.invoke('downloads:deleteHistory', ids),
    clearHistory: () => ipcRenderer.invoke('downloads:clearHistory'),
    clearFailed: () => ipcRenderer.invoke('downloads:clearFailed'),
    rescanFolder: (folderPath: string) => ipcRenderer.invoke('downloads:rescanFolder', folderPath),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('download:progress', handler);
      return () => ipcRenderer.removeListener('download:progress', handler);
    },
    onComplete: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('download:complete', handler);
      return () => ipcRenderer.removeListener('download:complete', handler);
    },
    onError: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('download:error', handler);
      return () => ipcRenderer.removeListener('download:error', handler);
    },
  },
  library: {
    getAll: (opts?: any) => ipcRenderer.invoke('library:getAll', opts),
    get: (videoId: string) => ipcRenderer.invoke('library:get', videoId),
    delete: (videoIds: string[], deleteFiles?: boolean) => ipcRenderer.invoke('library:delete', videoIds, deleteFiles),
    getRecent: (limit: number) => ipcRenderer.invoke('library:getRecent', limit),
    getStats: () => ipcRenderer.invoke('library:getStats'),
  },
  playlists: {
    create: (name: string, description?: string) => ipcRenderer.invoke('playlists:create', name, description),
    getAll: () => ipcRenderer.invoke('playlists:getAll'),
    get: (id: number) => ipcRenderer.invoke('playlists:get', id),
    update: (id: number, updates: { name?: string; description?: string }) => ipcRenderer.invoke('playlists:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('playlists:delete', id),
    addItem: (playlistId: number, item) => ipcRenderer.invoke('playlists:addItem', playlistId, item),
    removeItem: (playlistId: number, videoId: string) => ipcRenderer.invoke('playlists:removeItem', playlistId, videoId),
    getItems: (playlistId: number) => ipcRenderer.invoke('playlists:getItems', playlistId),
    reorderItem: (playlistId: number, videoId: string, newPosition: number) => ipcRenderer.invoke('playlists:reorderItem', playlistId, videoId, newPosition),
    syncToYouTube: (playlistId: number) => ipcRenderer.invoke('playlists:syncToYouTube', playlistId),
    pullFromYouTube: (youtubePlaylistId: string, localPlaylistId?: number) => ipcRenderer.invoke('playlists:pullFromYouTube', youtubePlaylistId, localPlaylistId),
  },
  sync: {
    start: () => ipcRenderer.invoke('sync:start'),
    stop: () => ipcRenderer.invoke('sync:stop'),
    getPeers: () => ipcRenderer.invoke('sync:getPeers'),
    getManifest: (peer: any) => ipcRenderer.invoke('sync:getManifest', peer),
    getPlaylistDetail: (peer: any, playlistId: number) => ipcRenderer.invoke('sync:getPlaylistDetail', peer, playlistId),
    startSync: (peer: any, playlistIds: number[]) => ipcRenderer.invoke('sync:startSync', peer, playlistIds),
    pauseSync: (sessionId: number) => ipcRenderer.invoke('sync:pauseSync', sessionId),
    resumeSync: (sessionId: number) => ipcRenderer.invoke('sync:resumeSync', sessionId),
    cancelSync: (sessionId: number) => ipcRenderer.invoke('sync:cancelSync', sessionId),
    getHistory: (limit?: number) => ipcRenderer.invoke('sync:getHistory', limit),
    sharePlaylist: (playlistId: number) => ipcRenderer.invoke('sync:sharePlaylist', playlistId),
    unsharePlaylist: (playlistId: number) => ipcRenderer.invoke('sync:unsharePlaylist', playlistId),
    getSharedPlaylists: () => ipcRenderer.invoke('sync:getSharedPlaylists'),
    onProgress: (callback: any) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('sync:progress', handler);
      return () => ipcRenderer.removeListener('sync:progress', handler);
    },
    onSessionUpdate: (callback: any) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('sync:sessionUpdate', handler);
      return () => ipcRenderer.removeListener('sync:sessionUpdate', handler);
    },
    onPeerFound: (callback: any) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('sync:peerFound', handler);
      return () => ipcRenderer.removeListener('sync:peerFound', handler);
    },
    onPeerLost: (callback: any) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('sync:peerLost', handler);
      return () => ipcRenderer.removeListener('sync:peerLost', handler);
    },
  },
  app: {
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    selectDirectory: () => ipcRenderer.invoke('app:selectDirectory'),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    getDataDir: () => ipcRenderer.invoke('app:getDataDir'),
    setDataDir: (dir: string) => ipcRenderer.invoke('app:setDataDir', dir),
    getSetting: (key: string) => ipcRenderer.invoke('app:getSetting', key),
    setSetting: (key: string, value: string) => ipcRenderer.invoke('app:setSetting', key, value),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    downloadUpdate: (url: string) => ipcRenderer.invoke('app:downloadUpdate', url),
    onDownloadProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('app:downloadProgress', handler);
      return () => ipcRenderer.removeListener('app:downloadProgress', handler);
    },
    checkTools: () => ipcRenderer.invoke('app:checkTools'),
    getVideoFileUrl: (filePath: string) => ipcRenderer.invoke('app:getVideoFileUrl', filePath),
    fileExists: (filePath: string) => ipcRenderer.invoke('app:fileExists', filePath),
    convertToMp4: (filePath: string) => ipcRenderer.invoke('app:convertToMp4', filePath),
    openInSystemPlayer: (filePath: string) => ipcRenderer.invoke('app:openInSystemPlayer', filePath),
    showInFinder: (filePath: string) => ipcRenderer.invoke('app:showInFinder', filePath),
    onFullscreenChange: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, isFullScreen: boolean) => callback(isFullScreen);
      ipcRenderer.on('app:fullscreenChange', handler);
      return () => ipcRenderer.removeListener('app:fullscreenChange', handler);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
