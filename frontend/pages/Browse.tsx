import React, { useState, useEffect } from 'react';
import {
  Box, Tabs, Tab, Typography, Grid, Card, CardMedia, CardContent,
  CircularProgress, TextField, Button, Alert, Chip,
} from '@mui/material';
import VideoCard from '../components/VideoCard/VideoCard';
import FormatSelector from '../components/FormatSelector/FormatSelector';
import YouTubePreview from '../components/YouTubePreview/YouTubePreview';
import AddToPlaylistDialog from '../components/AddToPlaylistDialog/AddToPlaylistDialog';
import type { VideoInfo, PlaylistInfo, PlaylistItem, SubscriptionInfo, DownloadRequest } from '@shared/types';

interface Props {
  onDownload: (request: DownloadRequest) => void;
}

export default function Browse({ onDownload }: Props) {
  const [tab, setTab] = useState(0);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionInfo[]>([]);
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistInfo | null>(null);
  const [channelVideos, setChannelVideos] = useState<VideoInfo[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlVideo, setUrlVideo] = useState<VideoInfo | null>(null);
  const [urlError, setUrlError] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoInfo | null>(null);
  const [addToPlaylistVideo, setAddToPlaylistVideo] = useState<VideoInfo | null>(null);

  useEffect(() => {
    if (tab === 0 && playlists.length === 0) loadPlaylists();
    if (tab === 1 && subscriptions.length === 0) loadSubscriptions();
  }, [tab]);

  async function loadPlaylists() {
    setLoading(true);
    try {
      const data = await window.api.youtube.getPlaylists();
      setPlaylists(data);
    } catch (err) {
      console.error('Failed to load playlists:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSubscriptions() {
    setLoading(true);
    try {
      const data = await window.api.youtube.getSubscriptions(50);
      setSubscriptions(data);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function openPlaylist(playlist: PlaylistInfo) {
    setSelectedPlaylist(playlist);
    setLoading(true);
    try {
      const items = await window.api.youtube.getPlaylistItems(playlist.id);
      setPlaylistItems(items);
    } catch (err) {
      console.error('Failed to load playlist items:', err);
    } finally {
      setLoading(false);
    }
  }

  async function openChannel(sub: SubscriptionInfo) {
    setSelectedChannel(sub);
    setLoading(true);
    try {
      const videos = await window.api.youtube.getChannelVideos(sub.channelId, 20);
      setChannelVideos(videos);
    } catch (err) {
      console.error('Failed to load channel videos:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUrlFetch() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setUrlError('');
    setUrlVideo(null);
    setLoading(true);

    try {
      const videoIdMatch = trimmed.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (!videoIdMatch) {
        setUrlError('Invalid YouTube URL. Please enter a valid video URL.');
        setLoading(false);
        return;
      }
      const info = await window.api.youtube.getVideoInfo(videoIdMatch[1]);
      setUrlVideo(info);
    } catch (err: any) {
      setUrlError(err.message || 'Failed to fetch video info');
    } finally {
      setLoading(false);
    }
  }


  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setSelectedPlaylist(null); setSelectedChannel(null); }} sx={{ mb: 3 }}>
        <Tab label="Playlists" />
        <Tab label="Subscriptions" />
        <Tab label="Paste URL" />
      </Tabs>

      {loading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {/* Playlists Tab */}
      {tab === 0 && !loading && !selectedPlaylist && (
        <Grid container spacing={2}>
          {playlists.map((pl) => (
            <Grid item xs={12} sm={6} md={4} key={pl.id}>
              <Card
                sx={{ cursor: 'pointer', borderRadius: 2, border: '1px solid', borderColor: 'divider', '&:hover': { borderColor: 'primary.main' } }}
                elevation={0}
                onClick={() => openPlaylist(pl)}
              >
                <CardMedia component="img" height={120} image={pl.thumbnail} alt={pl.title} />
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="body2" fontWeight={500} noWrap>{pl.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{pl.itemCount} videos</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
          {playlists.length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary" textAlign="center">No playlists found</Typography>
            </Grid>
          )}
        </Grid>
      )}

      {/* Playlist Items */}
      {tab === 0 && !loading && selectedPlaylist && (
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Button size="small" onClick={() => setSelectedPlaylist(null)}>Back</Button>
            <Typography variant="h6">{selectedPlaylist.title}</Typography>
            <Chip label={`${playlistItems.length} videos`} size="small" />
          </Box>
          <Grid container spacing={2}>
            {playlistItems.map((item) => {
              const videoInfo: VideoInfo = {
                id: item.videoId,
                title: item.title,
                channel: item.channel,
                channelId: '',
                thumbnail: item.thumbnail,
                duration: 0,
                publishedAt: item.publishedAt,
                viewCount: 0,
                description: '',
              };
              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={item.videoId}>
                  <VideoCard video={videoInfo} onDownload={setSelectedVideo} onPreview={setPreviewVideo} onAddToPlaylist={setAddToPlaylistVideo} />
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* Subscriptions Tab */}
      {tab === 1 && !loading && !selectedChannel && (
        <Grid container spacing={2}>
          {subscriptions.map((sub) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={sub.channelId}>
              <Card
                sx={{ cursor: 'pointer', borderRadius: 2, border: '1px solid', borderColor: 'divider', '&:hover': { borderColor: 'primary.main' } }}
                elevation={0}
                onClick={() => openChannel(sub)}
              >
                <Box display="flex" alignItems="center" gap={1.5} p={1.5}>
                  <img src={sub.thumbnail} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                  <Box overflow="hidden">
                    <Typography variant="body2" fontWeight={500} noWrap>{sub.channelTitle}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>{sub.description}</Typography>
                  </Box>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Channel Videos */}
      {tab === 1 && !loading && selectedChannel && (
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Button size="small" onClick={() => setSelectedChannel(null)}>Back</Button>
            <Typography variant="h6">{selectedChannel.channelTitle}</Typography>
          </Box>
          <Grid container spacing={2}>
            {channelVideos.map((video) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
                <VideoCard video={video} onDownload={setSelectedVideo} onPreview={setPreviewVideo} onAddToPlaylist={setAddToPlaylistVideo} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Paste URL Tab */}
      {tab === 2 && !loading && (
        <Box maxWidth={600}>
          <Box display="flex" gap={1} mb={2}>
            <TextField
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste YouTube URL here..."
              fullWidth
              size="small"
              onKeyDown={(e) => { if (e.key === 'Enter') handleUrlFetch(); }}
            />
            <Button variant="contained" onClick={handleUrlFetch}>Fetch</Button>
          </Box>
          {urlError && <Alert severity="error" sx={{ mb: 2 }}>{urlError}</Alert>}
          {urlVideo && (
            <VideoCard video={urlVideo} onDownload={setSelectedVideo} onPreview={setPreviewVideo} onAddToPlaylist={setAddToPlaylistVideo} />
          )}
        </Box>
      )}

      <FormatSelector
        open={!!selectedVideo}
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onDownload={onDownload}
      />

      <YouTubePreview
        video={previewVideo}
        onClose={() => setPreviewVideo(null)}
        onDownload={(v) => { setPreviewVideo(null); setSelectedVideo(v); }}
      />

      <AddToPlaylistDialog
        open={!!addToPlaylistVideo}
        videos={addToPlaylistVideo ? [addToPlaylistVideo] : []}
        onClose={() => setAddToPlaylistVideo(null)}
      />
    </Box>
  );
}
