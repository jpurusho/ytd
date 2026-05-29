import React, { useState, useEffect } from 'react';
import {
  Box, List, ListItemButton, ListItemIcon, ListItemText,
  Avatar, Typography, IconButton, Collapse, Menu, MenuItem,
  TextField,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SearchIcon from '@mui/icons-material/Search';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import DownloadIcon from '@mui/icons-material/Download';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { UserInfo, LocalPlaylist, VideoInfo, LocalPlaylistVideoItem } from '@shared/types';
import { VIDEO_DRAG_TYPE } from '../VideoCard/VideoCard';

export type Page = 'dashboard' | 'search' | 'browse' | 'playlists' | 'downloads' | 'history' | 'library' | 'settings';

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
  { page: 'library', label: 'Library', icon: <VideoLibraryIcon /> },
  { page: 'browse', label: 'Browse', icon: <QueueMusicIcon /> },
  { page: 'downloads', label: 'Downloads', icon: <DownloadIcon /> },
  { page: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

export default function Sidebar({ currentPage, onPageChange, user, onLogout, queueCount, onSelectPlaylist }: Props) {
  const [playlistsExpanded, setPlaylistsExpanded] = useState(true);
  const [playlists, setPlaylists] = useState<(LocalPlaylist & { itemCount?: number })[]>([]);
  const [version, setVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateUrl, setUpdateUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadedPath, setDownloadedPath] = useState('');
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; playlistId: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverPlaylistId, setDragOverPlaylistId] = useState<number | null>(null);

  useEffect(() => {
    loadPlaylists();
    window.api.app.getVersion().then(setVersion);
    window.api.app.checkForUpdates().then((result) => {
      if (result.status === 'available') {
        setUpdateAvailable(result.version || null);
        setUpdateUrl(result.url || '');
      }
    });
  }, []);

  function handlePlaylistDragOver(e: React.DragEvent, playlistId: number) {
    if (e.dataTransfer.types.includes(VIDEO_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragOverPlaylistId(playlistId);
    }
  }

  function handlePlaylistDragLeave() {
    setDragOverPlaylistId(null);
  }

  async function handlePlaylistDrop(e: React.DragEvent, playlistId: number) {
    e.preventDefault();
    setDragOverPlaylistId(null);

    const data = e.dataTransfer.getData(VIDEO_DRAG_TYPE);
    if (!data) return;

    try {
      const parsed = JSON.parse(data);
      const videos: VideoInfo[] = Array.isArray(parsed) ? parsed : [parsed];

      for (const video of videos) {
        const item: LocalPlaylistVideoItem = {
          videoId: video.id,
          title: video.title,
          channel: video.channel,
          thumbnailUrl: video.thumbnail,
          duration: video.duration,
          publishedAt: video.publishedAt,
        };
        await window.api.playlists.addItem(playlistId, item);
      }
      loadPlaylists();
    } catch (err) {
      console.error('Failed to add video to playlist:', err);
    }
  }

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

  async function handleCreate() {
    if (!newName.trim()) { setCreating(false); return; }
    await window.api.playlists.create(newName.trim());
    setNewName('');
    setCreating(false);
    loadPlaylists();
  }

  async function handleRename() {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return; }
    await window.api.playlists.update(renaming, { name: renameValue.trim() });
    setRenaming(null);
    setRenameValue('');
    loadPlaylists();
  }

  async function handleDelete(id: number) {
    await window.api.playlists.delete(id);
    setContextMenu(null);
    loadPlaylists();
  }

  function handleContextMenu(e: React.MouseEvent, playlistId: number) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, playlistId });
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
      <Box sx={{ px: 2, py: 2 }}>
        <Box display="flex" alignItems="center" gap={1}>
          <img src="./icon.png" alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <Typography variant="h6" fontWeight={700} color="primary">
            YTD
          </Typography>
          {version && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              v{version}
            </Typography>
          )}
        </Box>
        {updateAvailable && !downloadedPath && (
          <Box sx={{ mt: 0.5, ml: 4.5 }}>
            {!downloading ? (
              <Typography
                variant="caption"
                color="primary"
                sx={{ cursor: 'pointer' }}
                onClick={async () => {
                  if (!updateUrl) return;
                  setDownloading(true);
                  setDownloadPercent(0);
                  const unsub = window.api.app.onDownloadProgress((data) => setDownloadPercent(data.percent));
                  try {
                    const result = await window.api.app.downloadUpdate(updateUrl);
                    setDownloadedPath(result.path);
                  } catch {}
                  setDownloading(false);
                  unsub();
                }}
              >
                v{updateAvailable} available — download
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Downloading... {downloadPercent}%
              </Typography>
            )}
          </Box>
        )}
        {downloadedPath && (
          <Box sx={{ mt: 0.5, ml: 4.5 }}>
            <Typography variant="caption" color="success.main" sx={{ display: 'block' }}>
              Downloaded! To install:
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem', lineHeight: 1.4 }}>
              1. Quit ytd{'\n'}
              2. Extract the .zip{'\n'}
              3. Replace ytd.app in /Applications{'\n'}
              4. Run: xattr -rc /Applications/ytd.app
            </Typography>
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer', display: 'block', mt: 0.25 }}
              onClick={() => window.api.app.showInFinder(downloadedPath)}
            >
              Show in Finder
            </Typography>
          </Box>
        )}
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
          onClick={() => { onPageChange('playlists'); }}
          sx={{ borderRadius: 2, mb: 0.5, '&.Mui-selected': { bgcolor: 'action.selected' } }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: currentPage === 'playlists' ? 'primary.main' : 'text.secondary' }}>
            <QueueMusicIcon />
          </ListItemIcon>
          <ListItemText
            primary={`Playlists`}
            primaryTypographyProps={{ fontSize: '0.875rem' }}
          />
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setCreating(true); }}
            title="New playlist"
            sx={{ p: 0.25, mr: 0.25 }}
          >
            <AddIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setPlaylistsExpanded(!playlistsExpanded); }}
            sx={{ p: 0.25 }}
          >
            {playlistsExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </ListItemButton>

        <Collapse in={playlistsExpanded} timeout="auto">
          <List disablePadding sx={{ pl: 1 }}>
            {/* Inline create field */}
            {creating && (
              <Box sx={{ px: 1, py: 0.5 }}>
                <TextField
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Playlist name"
                  size="small"
                  fullWidth
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                  onBlur={handleCreate}
                  inputProps={{ style: { fontSize: '0.8rem', padding: '4px 8px' } }}
                />
              </Box>
            )}

            {playlists.map((pl) => (
              <ListItemButton
                key={pl.id}
                onClick={() => { onPageChange('playlists'); onSelectPlaylist?.(pl.id); }}
                onContextMenu={(e) => handleContextMenu(e, pl.id)}
                onDragOver={(e) => handlePlaylistDragOver(e, pl.id)}
                onDragLeave={handlePlaylistDragLeave}
                onDrop={(e) => handlePlaylistDrop(e, pl.id)}
                sx={{
                  borderRadius: 1.5,
                  py: 0.5,
                  mb: 0.25,
                  bgcolor: dragOverPlaylistId === pl.id ? 'action.hover' : undefined,
                  border: dragOverPlaylistId === pl.id ? '2px solid' : '2px solid transparent',
                  borderColor: dragOverPlaylistId === pl.id ? 'primary.main' : 'transparent',
                  transition: 'background-color 0.15s, border-color 0.15s',
                }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <PlaylistPlayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                </ListItemIcon>
                {renaming === pl.id ? (
                  <TextField
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    size="small"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(null); }}
                    onBlur={handleRename}
                    onClick={(e) => e.stopPropagation()}
                    inputProps={{ style: { fontSize: '0.8rem', padding: '2px 6px' } }}
                    sx={{ flex: 1 }}
                  />
                ) : (
                  <ListItemText
                    primary={pl.name}
                    primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
                  />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', ml: 0.5 }}>
                  {pl.itemCount ?? 0}
                </Typography>
              </ListItemButton>
            ))}

            {playlists.length === 0 && !creating && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block' }}>
                No playlists yet
              </Typography>
            )}
          </List>
        </Collapse>

        {/* Right-click context menu */}
        <Menu
          open={contextMenu !== null}
          onClose={() => setContextMenu(null)}
          anchorReference="anchorPosition"
          anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        >
          <MenuItem onClick={() => {
            const pl = playlists.find(p => p.id === contextMenu?.playlistId);
            if (pl) { setRenaming(pl.id); setRenameValue(pl.name); }
            setContextMenu(null);
          }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { if (contextMenu) handleDelete(contextMenu.playlistId); }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>
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
