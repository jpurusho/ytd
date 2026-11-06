/**
 * Transcript Search Page
 * Search across all video transcripts
 */
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Card,
  CardContent,
  CardMedia,
  CardActionArea,
  Grid,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import type { TranscriptSearchResult } from '@shared/types';

interface Props {
  onVideoSelect?: (videoId: string, timestamp?: number) => void;
}

export default function TranscriptSearch({ onVideoSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TranscriptSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [transcriptCount, setTranscriptCount] = useState(0);

  useEffect(() => {
    loadTranscriptCount();
  }, []);

  useEffect(() => {
    if (query.length >= 2) {
      const timer = setTimeout(() => {
        performSearch();
      }, 500); // Debounce search
      return () => clearTimeout(timer);
    } else {
      setResults([]);
      setSearched(false);
    }
  }, [query]);

  async function loadTranscriptCount() {
    try {
      const transcripts = await window.api.transcripts.getAll('completed');
      setTranscriptCount(transcripts.length);
    } catch (error) {
      console.error('Failed to load transcript count:', error);
    }
  }

  async function performSearch() {
    if (query.trim().length < 2) {
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const searchResults = await window.api.transcripts.search(query, 50);
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleResultClick(result: TranscriptSearchResult) {
    if (onVideoSelect) {
      onVideoSelect(result.videoId, result.timestamp);
    }
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box mb={3}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Search Transcripts
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Search across {transcriptCount.toLocaleString()} transcribed video
          {transcriptCount !== 1 ? 's' : ''}
        </Typography>

        <TextField
          fullWidth
          placeholder="Search for words or phrases in video transcripts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: loading && (
              <InputAdornment position="end">
                <CircularProgress size={20} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Search tips */}
      {!searched && transcriptCount === 0 && (
        <Alert severity="info" icon={<SubtitlesIcon />}>
          No transcripts available yet. Transcribe videos from your library to enable search.
        </Alert>
      )}

      {!searched && transcriptCount > 0 && (
        <Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            <strong>Search tips:</strong>
          </Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Chip label="Exact phrases" size="small" variant="outlined" />
            <Chip label="Multiple words" size="small" variant="outlined" />
            <Chip label="Case-insensitive" size="small" variant="outlined" />
          </Box>
        </Box>
      )}

      {/* Results */}
      {searched && !loading && (
        <Box mb={2}>
          <Typography variant="body2" color="text.secondary">
            Found {results.length} result{results.length !== 1 ? 's' : ''}
            {query && ` for "${query}"`}
          </Typography>
        </Box>
      )}

      {results.length > 0 && (
        <Grid container spacing={2}>
          {results.map((result, index) => (
            <Grid item xs={12} key={`${result.videoId}-${index}`}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardActionArea onClick={() => handleResultClick(result)}>
                  <Box display="flex" gap={2} p={2}>
                    {/* Thumbnail */}
                    {result.thumbnailUrl && (
                      <CardMedia
                        component="img"
                        sx={{ width: 160, height: 90, borderRadius: 1, flexShrink: 0 }}
                        image={result.thumbnailUrl}
                        alt={result.title}
                      />
                    )}

                    {/* Content */}
                    <Box flex={1} overflow="hidden">
                      <Typography variant="subtitle1" fontWeight={600} noWrap gutterBottom>
                        {result.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        gutterBottom
                      >
                        {result.channel}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 1,
                          '& mark': {
                            backgroundColor: 'warning.light',
                            color: 'text.primary',
                            fontWeight: 600,
                          },
                        }}
                        dangerouslySetInnerHTML={{ __html: result.snippet }}
                      />
                      {result.timestamp !== undefined && (
                        <Chip
                          label={formatTimestamp(result.timestamp)}
                          size="small"
                          variant="outlined"
                          sx={{ mt: 1 }}
                        />
                      )}
                    </Box>
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {searched && !loading && results.length === 0 && (
        <Alert severity="info">
          No results found for "{query}". Try different keywords or transcribe more videos.
        </Alert>
      )}
    </Box>
  );
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
