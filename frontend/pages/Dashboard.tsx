import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import Sidebar, { type Page } from '../components/Layout/Sidebar';
import DashboardPage from './DashboardPage';
import Search from './Search';
import Browse from './Browse';
import Playlists from './Playlists';
import Downloads from './Downloads';
import History from './History';
import Settings from './Settings';
import type { UserInfo, DownloadRequest, QueueItem } from '@shared/types';

interface Props {
  user: UserInfo;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: Props) {
  const [page, setPage] = useState<Page>('dashboard');
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    loadQueueCount();
    const interval = setInterval(loadQueueCount, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadQueueCount() {
    try {
      const queue = await window.api.downloads.getQueue();
      setQueueCount(queue.filter(i => i.status !== 'completed' && i.status !== 'cancelled').length);
    } catch {}
  }

  async function handleLogout() {
    await window.api.auth.logout();
    onLogout();
  }

  async function handleDownload(request: DownloadRequest) {
    await window.api.downloads.start(request);
    loadQueueCount();
    setPage('downloads');
  }

  function renderPage() {
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'search': return <Search onDownload={handleDownload} />;
      case 'browse': return <Browse onDownload={handleDownload} />;
      case 'playlists': return <Playlists onDownload={handleDownload} />;
      case 'downloads': return <Downloads />;
      case 'history': return <History />;
      case 'settings': return <Settings />;
    }
  }

  return (
    <Box display="flex" height="100vh">
      <Sidebar
        currentPage={page}
        onPageChange={setPage}
        user={user}
        onLogout={handleLogout}
        queueCount={queueCount}
      />
      <Box flex={1} overflow="hidden" pt="52px">
        {renderPage()}
      </Box>
    </Box>
  );
}
