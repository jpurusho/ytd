import React from 'react';
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Avatar, Typography, IconButton } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SearchIcon from '@mui/icons-material/Search';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import type { UserInfo } from '@shared/types';

export type Page = 'dashboard' | 'search' | 'browse' | 'playlists' | 'downloads' | 'history' | 'settings';

interface Props {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  user: UserInfo;
  onLogout: () => void;
  queueCount: number;
}

const navItems: Array<{ page: Page; label: string; icon: React.ReactNode }> = [
  { page: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { page: 'search', label: 'Search', icon: <SearchIcon /> },
  { page: 'browse', label: 'Library', icon: <VideoLibraryIcon /> },
  { page: 'playlists', label: 'Playlists', icon: <QueueMusicIcon /> },
  { page: 'downloads', label: 'Downloads', icon: <DownloadIcon /> },
  { page: 'history', label: 'History', icon: <HistoryIcon /> },
  { page: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

export default function Sidebar({ currentPage, onPageChange, user, onLogout, queueCount }: Props) {
  return (
    <Box
      sx={{
        width: 220,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
        pt: '52px',
      }}
    >
      <Box sx={{ px: 2, py: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <img src="./icon.png" alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <Typography variant="h6" fontWeight={700} color="primary">
          YTD
        </Typography>
      </Box>

      <List sx={{ flex: 1, px: 1 }}>
        {navItems.map(({ page, label, icon }) => (
          <ListItemButton
            key={page}
            selected={currentPage === page}
            onClick={() => onPageChange(page)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              '&.Mui-selected': {
                bgcolor: 'action.selected',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: currentPage === page ? 'primary.main' : 'text.secondary' }}>
              {icon}
            </ListItemIcon>
            <ListItemText
              primary={page === 'downloads' && queueCount > 0 ? `${label} (${queueCount})` : label}
              primaryTypographyProps={{ fontSize: '0.875rem' }}
            />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar src={user.picture} sx={{ width: 32, height: 32 }} />
        <Box flex={1} overflow="hidden">
          <Typography variant="body2" noWrap fontWeight={500}>
            {user.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {user.email}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onLogout} title="Sign out">
          <LogoutIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}
