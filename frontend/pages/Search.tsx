import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, TextField, InputAdornment, Grid, Typography, CircularProgress, Button, Checkbox, Paper, List, ListItemButton, ListItemText, IconButton, ToggleButtonGroup, ToggleButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import HistoryIcon from '@mui/icons-material/History';
import VideoCard from '../components/VideoCard/VideoCard';
import FormatSelector from '../components/FormatSelector/FormatSelector';
import YouTubePreview from '../components/YouTubePreview/YouTubePreview';
import AddToPlaylistDialog from '../components/AddToPlaylistDialog/AddToPlaylistDialog';
import type { VideoInfo, DownloadRequest, SearchOptions } from '@shared/types';

type SortOrder = 'relevance' | 'date' | 'viewCount' | 'rating' | 'title';
type DurationFilter = '' | 'short' | 'medium' | 'long';
type DateFilter = '' | 'today' | 'week' | 'month' | 'year';

function getPublishedAfter(dateFilter: DateFilter): string | undefined {
  if (!dateFilter) return undefined;
  const d = new Date();
  if (dateFilter === 'today') { d.setHours(0, 0, 0, 0); }
  else if (dateFilter === 'week') { d.setDate(d.getDate() - 7); }
  else if (dateFilter === 'month') { d.setDate(d.getDate() - 30); }
  else if (dateFilter === 'year') { d.setFullYear(d.getFullYear() - 1); }
  return d.toISOString();
}

const tbSx = { px: 1.5, py: 0.25, fontSize: '0.72rem', textTransform: 'none' as const, minWidth: 0, lineHeight: 1.5 };

const SEARCH_HISTORY_KEY = 'ytd_search_history';
const MAX_HISTORY = 20;

function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveSearchHistory(query: string): void {
  const history = getSearchHistory();
  const filtered = history.filter((h) => h.toLowerCase() !== query.toLowerCase());
  filtered.unshift(query);
  const trimmed = filtered.slice(0, MAX_HISTORY);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(trimmed));
}

interface Props {
  onDownload: (request: DownloadRequest) => void;
}

const SEARCH_RESULTS_KEY = 'ytd_search_results';

interface CachedSearch {
  query: string;
  sortOrder: SortOrder;
  durationFilter: DurationFilter;
  dateFilter: DateFilter;
  results: VideoInfo[];
}

function getCachedResults(): CachedSearch | null {
  try {
    const raw = localStorage.getItem(SEARCH_RESULTS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function cacheResults(query: string, sortOrder: SortOrder, durationFilter: DurationFilter, dateFilter: DateFilter, results: VideoInfo[]): void {
  localStorage.setItem(SEARCH_RESULTS_KEY, JSON.stringify({ query, sortOrder, durationFilter, dateFilter, results }));
}

export default function Search({ onDownload }: Props) {
  const cached = getCachedResults();
  const [query, setQuery] = useState(() => cached?.query || (getSearchHistory()[0] ?? ''));
  const [results, setResults] = useState<VideoInfo[]>(cached?.results || []);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(!!cached?.results?.length);
  const [sortOrder, setSortOrder] = useState<SortOrder>(cached?.sortOrder ?? 'relevance');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>(cached?.durationFilter ?? '');
  const [dateFilter, setDateFilter] = useState<DateFilter>(cached?.dateFilter ?? '');
  const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoInfo | null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function updateSuggestions(value: string) {
    const history = getSearchHistory();
    if (!value.trim()) {
      setSuggestions(history.slice(0, 10));
    } else {
      const lower = value.toLowerCase();
      setSuggestions(history.filter((h) => h.toLowerCase().includes(lower)));
    }
  }

  function handleInputFocus() {
    updateSuggestions(query);
    setShowSuggestions(true);
  }

  function handleInputChange(value: string) {
    setQuery(value);
    updateSuggestions(value);
    setShowSuggestions(true);
  }

  function selectSuggestion(suggestion: string) {
    setQuery(suggestion);
    setShowSuggestions(false);
  }

  const handleSearch = useCallback(async (overrides: { order?: SortOrder; duration?: DurationFilter; date?: DateFilter } = {}) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const effectiveSort = overrides.order ?? sortOrder;
    const effectiveDuration = overrides.duration !== undefined ? overrides.duration : durationFilter;
    const effectiveDate = overrides.date !== undefined ? overrides.date : dateFilter;

    const options: SearchOptions = { order: effectiveSort };
    if (effectiveDuration) options.videoDuration = effectiveDuration;
    const publishedAfter = getPublishedAfter(effectiveDate);
    if (publishedAfter) options.publishedAfter = publishedAfter;

    setShowSuggestions(false);
    if (!Object.keys(overrides).length) saveSearchHistory(trimmed);

    setLoading(true);
    setSearched(true);
    setSelectedVideos(new Set());
    try {
      const videos = await window.api.youtube.search(trimmed, 20, options);
      setResults(videos);
      cacheResults(trimmed, effectiveSort, effectiveDuration, effectiveDate, videos);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, sortOrder, durationFilter, dateFilter]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') setShowSuggestions(false);
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
      <Box display="flex" gap={1} mb={3} sx={{ position: 'relative' }}>
        <TextField
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder="Search YouTube videos..."
          fullWidth
          size="small"
          autoFocus
          inputRef={inputRef}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => { setQuery(''); setResults([]); setSearched(false); setSortOrder('relevance'); setDurationFilter(''); setDateFilter(''); localStorage.removeItem(SEARCH_RESULTS_KEY); }} title="Clear search">
                  <ClearIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <Paper
            ref={suggestionsRef}
            elevation={4}
            sx={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 10,
              maxHeight: 300,
              overflow: 'auto',
              mt: 0.5,
            }}
          >
            <List dense disablePadding>
              {suggestions.map((suggestion, idx) => (
                <ListItemButton
                  key={idx}
                  onClick={() => selectSuggestion(suggestion)}
                  sx={{ px: 2, py: 0.75 }}
                >
                  <HistoryIcon sx={{ fontSize: 16, mr: 1.5, color: 'text.secondary' }} />
                  <ListItemText
                    primary={suggestion}
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
      </Box>

      {/* Filter / sort bar */}
      <Box display="flex" alignItems="center" gap={2} mb={2} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Sort</Typography>
          <ToggleButtonGroup
            value={sortOrder}
            exclusive
            size="small"
            onChange={(_: React.MouseEvent, v: SortOrder | null) => {
              if (!v) return;
              setSortOrder(v);
              if (searched && query.trim()) handleSearch({ order: v });
            }}
          >
            <ToggleButton value="relevance" sx={tbSx}>Relevance</ToggleButton>
            <ToggleButton value="date" sx={tbSx}>Date</ToggleButton>
            <ToggleButton value="viewCount" sx={tbSx}>Views</ToggleButton>
            <ToggleButton value="rating" sx={tbSx}>Rating</ToggleButton>
            <ToggleButton value="title" sx={tbSx}>Title</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Duration</Typography>
          <ToggleButtonGroup
            value={durationFilter}
            exclusive
            size="small"
            onChange={(_: React.MouseEvent, v: DurationFilter | null) => {
              const val = v ?? '';
              setDurationFilter(val);
              if (searched && query.trim()) handleSearch({ duration: val });
            }}
          >
            <ToggleButton value="" sx={tbSx}>Any</ToggleButton>
            <ToggleButton value="short" sx={tbSx}>Short &lt;4m</ToggleButton>
            <ToggleButton value="medium" sx={tbSx}>Medium</ToggleButton>
            <ToggleButton value="long" sx={tbSx}>Long &gt;20m</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Upload date</Typography>
          <ToggleButtonGroup
            value={dateFilter}
            exclusive
            size="small"
            onChange={(_: React.MouseEvent, v: DateFilter | null) => {
              const val = v ?? '';
              setDateFilter(val);
              if (searched && query.trim()) handleSearch({ date: val });
            }}
          >
            <ToggleButton value="" sx={tbSx}>Any</ToggleButton>
            <ToggleButton value="today" sx={tbSx}>Today</ToggleButton>
            <ToggleButton value="week" sx={tbSx}>This week</ToggleButton>
            <ToggleButton value="month" sx={tbSx}>This month</ToggleButton>
            <ToggleButton value="year" sx={tbSx}>This year</ToggleButton>
          </ToggleButtonGroup>
        </Box>
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
                  <VideoCard video={video} onDownload={() => {}} dragVideos={getSelectedVideoObjects()} />
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
