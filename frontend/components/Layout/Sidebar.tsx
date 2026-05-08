import React, { useState, useEffect } from 'react';
import {
  Box, List, ListItemButton, ListItemIcon, ListItemText,
  Avatar, Typography, IconButton, Collapse, Badge,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SearchIcon from '@mui/icons-material/Search';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import type { UserInfo, LocalPlaylist } from '@shared/types';

export type Page = 'dashboard' | 'search' | 'browse' | 'playlists' | 'downloads' | 'history' | 'settings';

interface Props {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  user: UserInfo;
  onLogout: () => void;
  queueCount: number;
  onSelectPlaylist?: (playlistId: number) => void;
}

const navItems: Array<{ page: Page; label: string; icon: React.ReactNode }> = [
  { page: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { page: 'search', label: 'Search', icon: <SearchIcon /> },
  { page: 'browse', label: 'Library', icon: <VideoLibraryIcon /> },
  { page: 'downloads', label: 'Downloads', icon: <DownloadIcon /> },
  { page: 'history', label: 'History', icon: <HistoryIcon /> },
  { page: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

export default function Sidebar({ currentPage, onPageChange, user, onLogout, queueCount, onSelectPlaylist }: Props) {
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);
  const [playlists, setPlaylists] = useState<(LocalPlaylist & { itemCount?: number })[]>([]);

  useEffect(() => {
    loadPlaylists();
  }, []);

  useEffect(() => {
    if (currentPage === 'playlists') loadPlaylists();
  }, [currentPage]);

  async function loadPlaylists() {
    try {
      const data = await window.api.playlists.getAll();
      const withCounts = await Promise.all(data.map(async (pl) => {
        const items = await window.api.playlists.getItems(pl.id);
        return { ...pl, itemCount: items.length };
      }));
      setPlaylists(withCounts);
    } catch {}
  }

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

      <List sx={{ flex: 1, px: 1, overflow: 'auto' }}>
        {navItems.map(({ page, label, icon }) => (
          <ListItemButton
            key={page}
            selected={currentPage === page}
            onClick={() => onPageChange(page)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              '&.Mui-selected': { bgcolor: 'action.selected' },
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

        {/* Playlists Section */}
        <ListItemButton
          selected={currentPage === 'playlists'}
          onClick={() => { onPageChange('playlists'); setPlaylistsExpanded(!playlistsExpanded); }}
          sx={{ borderRadius: 2, mb: 0.5, '&.Mui-selected': { bgcolor: 'action.selected' } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: currentPage === 'playlists' ? 'primary.main' : 'text.secondary' }}>
            <QueueMusicIcon />
          </ListItemIcon>
          <ListItemText
            primary={`Playlists${playlists.length > 0 ? ` (${playlists.length})` : ''}`}
            primaryTypographyProps={{ fontSize: '0.875rem' }}
          />
          {playlists.length > 0 && (
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); setPlaylistsExpanded(!playlistsExpanded); }}
              sx={{ p: 0.25 }}
            >
              {playlistsExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          )}
        </ListItemButton>

        <Collapse in={playlistsExpanded && playlists.length > 0} timeout="auto">
          <List disablePadding sx={{ pl: 1 }}>
            {playlists.map((pl) => (
              <ListItemButton
                key={pl.id}
                onClick={() => { onPageChange('playlists'); onSelectPlaylist?.(pl.id); }}
                sx={{ borderRadius: 1.5, py: 0.5, mb: 0.25 }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <PlaylistPlayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                </ListItemIcon>
                <ListItemText
                  primary={pl.name}
                  primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {pl.itemCount ?? 0}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        </Collapse>
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
