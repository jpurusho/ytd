/**
 * Transcript Button Component
 * Trigger and show status of video transcription
 */
import React, { useState, useEffect } from 'react';
import {
  IconButton,
  Tooltip,
  CircularProgress,
  Badge,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Link,
} from '@mui/material';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CloudIcon from '@mui/icons-material/Cloud';
import type { Transcript, TranscriptOptions } from '@shared/types';

interface Props {
  videoId: string;
  size?: 'small' | 'medium';
  onComplete?: (transcript: Transcript) => void;
  onError?: (error: string) => void;
}

export default function TranscriptButton({ videoId, size = 'medium', onComplete, onError }: Props) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState(false);
  const [availability, setAvailability] = useState<{ whisperLocal: boolean; whisperAPI: boolean }>({
    whisperLocal: false,
    whisperAPI: false,
  });

  useEffect(() => {
    loadTranscript();
    checkAvailability();

    // Listen for transcript events
    const unsubProgress = window.api.transcripts.onProgress((data) => {
      if (data.videoId === videoId) {
        loadTranscript();
      }
    });

    const unsubComplete = window.api.transcripts.onComplete((data) => {
      if (data.videoId === videoId) {
        setTranscript(data.transcript);
        if (onComplete) {
          onComplete(data.transcript);
        }
      }
    });

    const unsubError = window.api.transcripts.onError((data) => {
      if (data.videoId === videoId) {
        loadTranscript();
        if (onError) {
          onError(data.error);
        }
      }
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [videoId]);

  async function checkAvailability() {
    try {
      const avail = await window.api.transcripts.checkAvailability();
      setAvailability(avail);
    } catch (error) {
      console.error('Failed to check transcription availability:', error);
    }
  }

  async function loadTranscript() {
    try {
      const data = await window.api.transcripts.get(videoId);
      setTranscript(data);
    } catch (error) {
      console.error('Failed to load transcript:', error);
    }
  }

  async function handleStart(options: TranscriptOptions) {
    setLoading(true);
    setMenuAnchor(null);
    try {
      await window.api.transcripts.start(videoId, options);
      await loadTranscript();
    } catch (error) {
      console.error('Failed to start transcription:', error);
      if (onError) {
        onError((error as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  function getIcon() {
    if (loading || (transcript && transcript.status === 'processing')) {
      const progress = transcript?.progress || 0;
      return (
        <CircularProgress
          size={size === 'small' ? 16 : 20}
          variant={progress > 0 ? 'determinate' : 'indeterminate'}
          value={progress}
        />
      );
    }

    if (transcript?.status === 'completed') {
      return (
        <Badge badgeContent={<CheckCircleIcon sx={{ fontSize: 12, color: 'success.main' }} />} overlap="circular">
          <SubtitlesIcon fontSize={size} />
        </Badge>
      );
    }

    if (transcript?.status === 'failed') {
      return (
        <Badge badgeContent={<ErrorIcon sx={{ fontSize: 12, color: 'error.main' }} />} overlap="circular">
          <SubtitlesIcon fontSize={size} color="error" />
        </Badge>
      );
    }

    return <SubtitlesIcon fontSize={size} />;
  }

  function getTooltip() {
    if (loading || transcript?.status === 'processing') {
      return `Transcribing... ${Math.round(transcript?.progress || 0)}%`;
    }
    if (transcript?.status === 'completed') {
      return 'Transcript ready';
    }
    if (transcript?.status === 'failed') {
      return `Transcription failed: ${transcript.error}`;
    }
    return 'Transcribe video';
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (transcript?.status === 'completed') {
      // Already transcribed - could open viewer
      if (onComplete && transcript) {
        onComplete(transcript);
      }
    } else if (!transcript || transcript.status === 'failed') {
      // Show options menu
      setMenuAnchor(e.currentTarget);
    }
  }

  return (
    <>
      <Tooltip title={getTooltip()}>
        <IconButton
          size={size}
          onClick={handleClick}
          disabled={loading || transcript?.status === 'processing'}
        >
          {getIcon()}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {!availability.whisperLocal && !availability.whisperAPI && (
          <Box sx={{ px: 2, py: 1.5, maxWidth: 280 }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Transcription requires either:
            </Typography>
            <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
              • pip install openai-whisper
            </Typography>
            <Typography variant="caption" display="block">
              • OpenAI API key in{' '}
              <Link href="#" onClick={(e) => { e.preventDefault(); /* TODO: open settings */ }}>
                Settings
              </Link>
            </Typography>
          </Box>
        )}
        <MenuItem
          onClick={() => handleStart({ method: 'auto', model: 'base' })}
          disabled={!availability.whisperLocal}
        >
          <ListItemIcon>
            <PlayCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Local (Base)"
            secondary={
              availability.whisperLocal
                ? "Fast, runs on your computer"
                : "Requires: pip install openai-whisper"
            }
          />
        </MenuItem>
        <MenuItem
          onClick={() => handleStart({ method: 'auto', model: 'small' })}
          disabled={!availability.whisperLocal}
        >
          <ListItemIcon>
            <PlayCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Local (Small)"
            secondary={
              availability.whisperLocal
                ? "Better accuracy, slower"
                : "Requires: pip install openai-whisper"
            }
          />
        </MenuItem>
        <MenuItem
          onClick={() => handleStart({ method: 'whisper-api' })}
          disabled={!availability.whisperAPI}
        >
          <ListItemIcon>
            <CloudIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="OpenAI Cloud"
            secondary={
              availability.whisperAPI
                ? "Fastest, requires API key"
                : "Requires: Set OPENAI_API_KEY in Settings"
            }
          />
        </MenuItem>
      </Menu>
    </>
  );
}
