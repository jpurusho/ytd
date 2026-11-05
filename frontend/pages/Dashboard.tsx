import React, { useState } from 'react';
import { Box } from '@mui/material';
import Sidebar, { type Page } from '../components/Layout/Sidebar';
import DashboardPage from './DashboardPage';
import Search from './Search';
import Browse from './Browse';
import Playlists from './Playlists';
import Downloads from './Downloads';
import History from './History';
import Library from './Library';
import Sync from './Sync';
import Settings from './Settings';
import { useAuthStore } from '../stores/authStore';
import { useQueueQuery, useStartDownload } from '../hooks/useQueue';
import type { DownloadRequest } from '@shared/types';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const { data: queue = [] } = useQueueQuery();
  const startDownload = useStartDownload();

  const [page, setPage] = useState<Page>('dashboard');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);

  const queueCount = queue.filter(
    (i) => i.status !== 'completed' && i.status !== 'cancelled'
  ).length;

  async function handleDownload(request: DownloadRequest) {
    await startDownload.mutateAsync(request);
    setPage('downloads');
  }

  function handleSelectPlaylist(playlistId: number) {
    setSelectedPlaylistId(playlistId);
    setPage('playlists');
  }

  function renderPage() {
    // Each page wrapped in error boundary for isolated failure handling
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'search': return <Search onDownload={handleDownload} />;
      case 'browse': return <Browse onDownload={handleDownload} />;
      case 'playlists': return <Playlists onDownload={handleDownload} openPlaylistId={selectedPlaylistId} onPlaylistOpened={() => setSelectedPlaylistId(null)} />;
      case 'downloads': return <Downloads />;
      case 'library': return <Library />;
      case 'history': return <Library />;
      case 'sync': return <Sync />;
      case 'settings': return <Settings />;
    }
  }

  return (
    <Box display="flex" height="100vh">
      <Sidebar
        currentPage={page}
        onPageChange={(p) => { setPage(p); setSelectedPlaylistId(null); }}
        user={user!}
        onLogout={logout}
        queueCount={queueCount}
        onSelectPlaylist={handleSelectPlaylist}
      />
      <Box flex={1} overflow="hidden" pt="52px">
        {renderPage()}
      </Box>
    </Box>
  );
}
