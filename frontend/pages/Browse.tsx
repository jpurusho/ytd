import React, { useState, useEffect } from 'react';
import {
  Box, Tabs, Tab, Typography, Grid, Card, CardMedia, CardContent,
  CircularProgress, TextField, Button, Alert, Chip, InputAdornment,
  Checkbox,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
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
  const [channelNextPage, setChannelNextPage] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlVideo, setUrlVideo] = useState<VideoInfo | null>(null);
  const [urlError, setUrlError] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoInfo | null>(null);
  const [addToPlaylistVideo, setAddToPlaylistVideo] = useState<VideoInfo | null>(null);
  const [addToPlaylistVideos, setAddToPlaylistVideos] = useState<VideoInfo[]>([]);
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [subscriptionFilter, setSubscriptionFilter] = useState('');
  const [channelSearch, setChannelSearch] = useState('');
  const [channelSearchResults, setChannelSearchResults] = useState<SubscriptionInfo[]>([]);
  const [channelVideoFilter, setChannelVideoFilter] = useState('');
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());

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
    if (!sub.channelId) return;
    setSelectedChannel(sub);
    setChannelVideos([]);
    setChannelNextPage(undefined);
    setSelectedVideos(new Set());
    setChannelVideoFilter('');
    setLoading(true);
    try {
      const result = await window.api.youtube.getChannelVideos(sub.channelId, 50);
      setChannelVideos(result?.videos || []);
      setChannelNextPage(result?.nextPageToken);
    } catch (err) {
      console.error('Failed to load channel videos:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreChannelVideos() {
    if (!selectedChannel || !channelNextPage || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await window.api.youtube.getChannelVideos(selectedChannel.channelId, 50, channelNextPage);
      setChannelVideos(prev => [...prev, ...(result?.videos || [])]);
      setChannelNextPage(result?.nextPageToken);
    } catch (err) {
      console.error('Failed to load more videos:', err);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleChannelSearch() {
    if (!channelSearch.trim()) return;
    setLoading(true);
    try {
      const results = await window.api.youtube.searchChannels(channelSearch.trim(), 10);
      setChannelSearchResults(results);
    } catch (err) {
      console.error('Failed to search channels:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleVideoSelect(videoId: string) {
    const next = new Set(selectedVideos);
    if (next.has(videoId)) next.delete(videoId);
    else next.add(videoId);
    setSelectedVideos(next);
  }

  function handleBulkAddToPlaylist() {
    const videos = channelVideos.filter(v => selectedVideos.has(v.id));
    if (videos.length > 0) setAddToPlaylistVideos(videos);
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
        <Box>
          {playlists.length > 0 && (
            <TextField
              value={playlistFilter}
              onChange={(e) => setPlaylistFilter(e.target.value)}
              placeholder="Filter playlists..."
              size="small"
              fullWidth
              sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          )}
          <Grid container spacing={2}>
            {playlists
              .filter(pl => !playlistFilter || pl.title.toLowerCase().includes(playlistFilter.toLowerCase()))
              .map((pl) => (
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
        </Box>
      )}

      {/* Playlist Items */}
      {tab === 0 && !loading && selectedPlaylist && (
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Button size="small" onClick={() => setSelectedPlaylist(null)}>Back</Button>
            <Typography variant="h6">{selectedPlaylist.title}</Typography>
            <Chip label={`${playlistItems.length} videos`} size="small" />
          </Box>
          {playlistItems.length > 5 && (
            <TextField
              value={playlistFilter}
              onChange={(e) => setPlaylistFilter(e.target.value)}
              placeholder="Filter videos..."
              size="small"
              fullWidth
              sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          )}
          <Grid container spacing={2}>
            {playlistItems
              .filter(item => !playlistFilter || item.title.toLowerCase().includes(playlistFilter.toLowerCase()) || item.channel.toLowerCase().includes(playlistFilter.toLowerCase()))
              .map((item) => {
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
        <Box>
          <Box display="flex" gap={1} mb={2}>
            <TextField
              value={channelSearch}
              onChange={(e) => setChannelSearch(e.target.value)}
              placeholder="Search for a channel..."
              size="small"
              fullWidth
              onKeyDown={(e) => { if (e.key === 'Enter') handleChannelSearch(); }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            <Button variant="contained" size="small" onClick={handleChannelSearch} sx={{ whiteSpace: 'nowrap' }}>
              Search
            </Button>
          </Box>

          {channelSearchResults.length > 0 && (
            <Box mb={3}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Search Results</Typography>
              <Grid container spacing={2}>
                {channelSearchResults.map((sub) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={sub.channelId}>
                    <Card
                      sx={{ cursor: 'pointer', borderRadius: 2, border: '1px solid', borderColor: 'primary.main', '&:hover': { borderColor: 'primary.light' } }}
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
            </Box>
          )}

          {subscriptions.length > 0 && (
            <>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Your Subscriptions</Typography>
              <TextField
                value={subscriptionFilter}
                onChange={(e) => setSubscriptionFilter(e.target.value)}
                placeholder="Filter subscriptions..."
                size="small"
                fullWidth
                sx={{ mb: 2 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              />
            </>
          )}
          <Grid container spacing={2}>
            {subscriptions
              .filter(sub => !subscriptionFilter || sub.channelTitle.toLowerCase().includes(subscriptionFilter.toLowerCase()))
              .map((sub) => (
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
        </Box>
      )}

      {/* Channel Videos */}
      {tab === 1 && !loading && selectedChannel && (
        <Box>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Button size="small" onClick={() => { setSelectedChannel(null); setSelectedVideos(new Set()); }}>Back</Button>
            <Typography variant="h6" sx={{ flex: 1 }}>{selectedChannel.channelTitle}</Typography>
            <Chip label={`${channelVideos.length} videos`} size="small" />
            {selectedVideos.size > 0 && (
              <Button size="small" variant="outlined" startIcon={<PlaylistAddIcon />} onClick={handleBulkAddToPlaylist}>
                Add {selectedVideos.size} to Playlist
              </Button>
            )}
          </Box>

          {channelVideos.length > 5 && (
            <TextField
              value={channelVideoFilter}
              onChange={(e) => setChannelVideoFilter(e.target.value)}
              placeholder="Filter videos by title..."
              size="small"
              fullWidth
              sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          )}

          <Grid container spacing={2}>
            {channelVideos
              .filter(v => !channelVideoFilter || v.title.toLowerCase().includes(channelVideoFilter.toLowerCase()))
              .map((video) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
                <Box sx={{ position: 'relative' }}>
                  <Checkbox
                    size="small"
                    checked={selectedVideos.has(video.id)}
                    onChange={() => toggleVideoSelect(video.id)}
                    sx={{ position: 'absolute', top: 4, left: 4, zIndex: 1, bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 0.5, p: 0.25 }}
                  />
                  <VideoCard video={video} onDownload={setSelectedVideo} onPreview={setPreviewVideo} onAddToPlaylist={setAddToPlaylistVideo} />
                </Box>
              </Grid>
            ))}
          </Grid>

          {channelNextPage && (
            <Box display="flex" justifyContent="center" mt={3}>
              <Button
                variant="outlined"
                onClick={loadMoreChannelVideos}
                disabled={loadingMore}
                startIcon={loadingMore ? <CircularProgress size={16} /> : undefined}
              >
                {loadingMore ? 'Loading...' : 'Load More Videos'}
              </Button>
            </Box>
          )}
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

      <AddToPlaylistDialog
        open={addToPlaylistVideos.length > 0}
        videos={addToPlaylistVideos}
        onClose={() => { setAddToPlaylistVideos([]); setSelectedVideos(new Set()); }}
      />
    </Box>
  );
}
