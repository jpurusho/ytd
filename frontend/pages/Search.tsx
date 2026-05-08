import React, { useState, useCallback } from 'react';
import { Box, TextField, InputAdornment, Grid, Typography, CircularProgress } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import VideoCard from '../components/VideoCard/VideoCard';
import FormatSelector from '../components/FormatSelector/FormatSelector';
import YouTubePreview from '../components/YouTubePreview/YouTubePreview';
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

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setSearched(true);
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

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
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
        sx={{ mb: 3 }}
      />

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
              <VideoCard video={video} onDownload={setSelectedVideo} onPreview={setPreviewVideo} />
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
    </Box>
  );
}
