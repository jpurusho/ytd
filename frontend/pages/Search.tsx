import React, { useState, useCallback } from 'react';
import { Box, TextField, InputAdornment, Grid, Typography, CircularProgress, Button, Checkbox } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import VideoCard from '../components/VideoCard/VideoCard';
import FormatSelector from '../components/FormatSelector/FormatSelector';
import YouTubePreview from '../components/YouTubePreview/YouTubePreview';
import AddToPlaylistDialog from '../components/AddToPlaylistDialog/AddToPlaylistDialog';
import type { VideoInfo, DownloadRequest } from '@shared/types';

interface Props {
  onDownload: (request: DownloadRequest) => void;
}

export default function Search({ onDownload }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VideoInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoInfo | null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setSearched(true);
    setSelectedVideos(new Set());
    try {
      const videos = await window.api.youtube.search(trimmed, 20);
      setResults(videos);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  function toggleVideoSelect(videoId: string) {
    const next = new Set(selectedVideos);
    if (next.has(videoId)) next.delete(videoId);
    else next.add(videoId);
    setSelectedVideos(next);
  }

  function getSelectedVideoObjects(): VideoInfo[] {
    return results.filter(v => selectedVideos.has(v.id));
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box display="flex" gap={1} mb={3}>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search YouTube videos..."
          fullWidth
          size="small"
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Multi-select toolbar */}
      {results.length > 0 && (
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Button
            size="small"
            variant={multiSelect ? 'contained' : 'outlined'}
            onClick={() => { setMultiSelect(!multiSelect); setSelectedVideos(new Set()); }}
          >
            {multiSelect ? 'Done selecting' : 'Select multiple'}
          </Button>
          {multiSelect && selectedVideos.size > 0 && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<PlaylistAddIcon />}
              onClick={() => setPlaylistDialogOpen(true)}
            >
              Add {selectedVideos.size} to Playlist
            </Button>
          )}
          {multiSelect && (
            <Typography variant="caption" color="text.secondary">
              {selectedVideos.size} selected
            </Typography>
          )}
        </Box>
      )}

      {loading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {!loading && searched && results.length === 0 && (
        <Box textAlign="center" py={4}>
          <Typography color="text.secondary">No results found</Typography>
        </Box>
      )}

      {!loading && results.length > 0 && (
        <Grid container spacing={2}>
          {results.map((video) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
              {multiSelect ? (
                <Box
                  sx={{
                    position: 'relative',
                    border: selectedVideos.has(video.id) ? '2px solid' : '2px solid transparent',
                    borderColor: selectedVideos.has(video.id) ? 'primary.main' : 'transparent',
                    borderRadius: 2,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleVideoSelect(video.id)}
                >
                  <Checkbox
                    checked={selectedVideos.has(video.id)}
                    size="small"
                    sx={{ position: 'absolute', top: 4, left: 4, zIndex: 1, bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 1, p: 0.25 }}
                  />
                  <VideoCard video={video} onDownload={() => {}} />
                </Box>
              ) : (
                <VideoCard
                  video={video}
                  onDownload={setSelectedVideo}
                  onPreview={setPreviewVideo}
                  onAddToPlaylist={(v) => { setSelectedVideos(new Set([v.id])); setPlaylistDialogOpen(true); }}
                />
              )}
            </Grid>
          ))}
        </Grid>
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
        open={playlistDialogOpen}
        videos={playlistDialogOpen ? getSelectedVideoObjects() : []}
        onClose={() => { setPlaylistDialogOpen(false); setSelectedVideos(new Set()); setMultiSelect(false); }}
      />
    </Box>
  );
}
