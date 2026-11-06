/**
 * Transcript Viewer Component
 * Displays video transcript with timestamps and search
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  Menu,
  MenuItem,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { Transcript, TranscriptSegment } from '@shared/types';

interface Props {
  videoId: string;
  currentTime?: number;
  onSeek?: (time: number) => void;
  onClose?: () => void;
}

export default function TranscriptViewer({ videoId, currentTime = 0, onSeek, onClose }: Props) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTranscript();
  }, [videoId]);

  // Auto-scroll to current segment
  useEffect(() => {
    if (currentTime !== undefined && segments.length > 0) {
      const index = segments.findIndex(
        (seg, i) => seg.start <= currentTime && (i === segments.length - 1 || segments[i + 1].start > currentTime)
      );
      if (index !== -1) {
        setActiveSegmentIndex(index);
        // Auto-scroll to active segment
        const element = document.getElementById(`segment-${index}`);
        if (element && listRef.current) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [currentTime, segments]);

  async function loadTranscript() {
    setLoading(true);
    try {
      const data = await window.api.transcripts.get(videoId);
      if (data && data.status === 'completed') {
        setTranscript(data);
        const parsed = JSON.parse(data.transcriptJson) as TranscriptSegment[];
        setSegments(parsed);
      } else {
        setTranscript(data);
      }
    } catch (error) {
      console.error('Failed to load transcript:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSegmentClick(segment: TranscriptSegment, index: number) {
    setActiveSegmentIndex(index);
    if (onSeek) {
      onSeek(segment.start);
    }
  }

  async function handleExport(format: 'txt' | 'srt' | 'vtt') {
    try {
      const content = await window.api.transcripts.export(videoId, format);

      // Create a download link
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcript-${videoId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export transcript:', error);
    }
    setMenuAnchor(null);
  }

  async function handleCopy() {
    if (transcript) {
      await navigator.clipboard.writeText(transcript.transcriptText);
    }
    setMenuAnchor(null);
  }

  const filteredSegments = segments.filter(seg =>
    searchQuery ? seg.text.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100%" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (!transcript) {
    return (
      <Box p={3}>
        <Alert severity="info">
          No transcript available for this video. Click "Transcribe" to generate one.
        </Alert>
      </Box>
    );
  }

  if (transcript.status === 'pending' || transcript.status === 'processing') {
    return (
      <Box p={3}>
        <Alert severity="info" icon={<CircularProgress size={20} />}>
          Transcription in progress... {Math.round(transcript.progress)}%
        </Alert>
      </Box>
    );
  }

  if (transcript.status === 'failed') {
    return (
      <Box p={3}>
        <Alert severity="error">
          Transcription failed: {transcript.error || 'Unknown error'}
        </Alert>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" height="100%">
      {/* Header */}
      <Box
        display="flex"
        alignItems="center"
        gap={1}
        p={2}
        borderBottom={1}
        borderColor="divider"
      >
        <Typography variant="h6" fontWeight={600} flex={1}>
          Transcript
        </Typography>
        <Chip
          label={transcript.language?.toUpperCase() || 'EN'}
          size="small"
          variant="outlined"
        />
        <Chip
          label={`${transcript.wordCount?.toLocaleString() || 0} words`}
          size="small"
          variant="outlined"
        />
        <Tooltip title="More options">
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
        </Tooltip>
        {onClose && (
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {/* Search */}
      <Box p={2} borderBottom={1} borderColor="divider">
        <TextField
          fullWidth
          size="small"
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        {searchQuery && (
          <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
            {filteredSegments.length} of {segments.length} segments
          </Typography>
        )}
      </Box>

      {/* Transcript segments */}
      <Box ref={listRef} flex={1} overflow="auto">
        <List dense>
          {filteredSegments.map((segment, index) => {
            const originalIndex = segments.indexOf(segment);
            const isActive = originalIndex === activeSegmentIndex;
            const timeLabel = formatTimestamp(segment.start);

            return (
              <ListItem
                key={originalIndex}
                id={`segment-${originalIndex}`}
                disablePadding
                sx={{
                  bgcolor: isActive ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ListItemButton onClick={() => handleSegmentClick(segment, originalIndex)}>
                  <Box display="flex" gap={2} width="100%">
                    <Typography
                      variant="caption"
                      color="primary"
                      sx={{ minWidth: 60, fontFamily: 'monospace', flexShrink: 0 }}
                    >
                      {timeLabel}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        flex: 1,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {segment.text}
                    </Typography>
                  </Box>
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* Export menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => handleExport('txt')}>
          <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
          Export as TXT
        </MenuItem>
        <MenuItem onClick={() => handleExport('srt')}>
          <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
          Export as SRT
        </MenuItem>
        <MenuItem onClick={() => handleExport('vtt')}>
          <DownloadIcon fontSize="small" sx={{ mr: 1 }} />
          Export as VTT
        </MenuItem>
        <MenuItem onClick={handleCopy}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} />
          Copy to clipboard
        </MenuItem>
      </Menu>
    </Box>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
