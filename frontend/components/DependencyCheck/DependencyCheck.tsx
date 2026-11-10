/**
 * Dependency Check Component
 * Shows missing external dependencies with installation instructions
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Box,
  Link,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface ToolStatus {
  installed: boolean;
  path: string;
  version?: string;
}

interface DependencyStatus {
  ytDlp: ToolStatus;
  ffmpeg: ToolStatus;
  whisperLocal: boolean;
  whisperAPI: boolean;
}

export default function DependencyCheck() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DependencyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkDependencies();
  }, []);

  async function checkDependencies() {
    setLoading(true);
    try {
      const [tools, transcriptionAvail] = await Promise.all([
        window.api.app.checkTools(),
        window.api.transcripts.checkAvailability(),
      ]);

      const deps: DependencyStatus = {
        ytDlp: tools.ytDlp,
        ffmpeg: tools.ffmpeg,
        whisperLocal: transcriptionAvail.whisperLocal,
        whisperAPI: transcriptionAvail.whisperAPI,
      };

      setStatus(deps);

      // Show dialog if any critical dependencies are missing
      if (!deps.ytDlp.installed || !deps.ffmpeg.installed) {
        setOpen(true);
      }
    } catch (error) {
      console.error('Failed to check dependencies:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !status) return null;

  const criticalMissing = !status.ytDlp.installed || !status.ffmpeg.installed;
  const transcriptionDisabled = !status.whisperLocal && !status.whisperAPI;

  return (
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>
        {criticalMissing ? 'Missing Required Dependencies' : 'Optional Dependencies'}
      </DialogTitle>
      <DialogContent>
        {criticalMissing && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Action Required</AlertTitle>
            Some core features require external tools. Please install the missing dependencies below.
          </Alert>
        )}

        {!criticalMissing && transcriptionDisabled && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Transcription Feature Unavailable</AlertTitle>
            Install ffmpeg and Python Whisper to enable video transcription.
          </Alert>
        )}

        <List>
          {/* yt-dlp */}
          <ListItem>
            <ListItemIcon>
              {status.ytDlp.installed ? (
                <CheckCircleIcon color="success" />
              ) : (
                <ErrorIcon color="error" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="body1">yt-dlp</Typography>
                  <Chip
                    label="Required"
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                </Box>
              }
              secondary={
                status.ytDlp.installed ? (
                  `Version ${status.ytDlp.version} - ${status.ytDlp.path}`
                ) : (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Download videos from YouTube and other platforms
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace' }}>
                      brew install yt-dlp
                    </Typography>
                    <Link
                      href="https://github.com/yt-dlp/yt-dlp#installation"
                      target="_blank"
                      rel="noopener"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
                    >
                      Installation guide
                      <OpenInNewIcon fontSize="small" />
                    </Link>
                  </Box>
                )
              }
            />
          </ListItem>

          {/* ffmpeg */}
          <ListItem>
            <ListItemIcon>
              {status.ffmpeg.installed ? (
                <CheckCircleIcon color="success" />
              ) : (
                <ErrorIcon color="error" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="body1">ffmpeg</Typography>
                  <Chip
                    label="Required"
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                </Box>
              }
              secondary={
                status.ffmpeg.installed ? (
                  `Version ${status.ffmpeg.version} - ${status.ffmpeg.path}`
                ) : (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Convert and process video/audio files
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace' }}>
                      brew install ffmpeg
                    </Typography>
                    <Link
                      href="https://ffmpeg.org/download.html"
                      target="_blank"
                      rel="noopener"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
                    >
                      Installation guide
                      <OpenInNewIcon fontSize="small" />
                    </Link>
                  </Box>
                )
              }
            />
          </ListItem>

          {/* Python Whisper */}
          <ListItem>
            <ListItemIcon>
              {status.whisperLocal ? (
                <CheckCircleIcon color="success" />
              ) : (
                <WarningIcon color="warning" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="body1">Python Whisper</Typography>
                  <Chip
                    label="Optional"
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                </Box>
              }
              secondary={
                status.whisperLocal ? (
                  'Installed - Local video transcription available'
                ) : (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Transcribe videos locally (free, private)
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace' }}>
                      pip install openai-whisper
                    </Typography>
                    <Link
                      href="https://github.com/openai/whisper#setup"
                      target="_blank"
                      rel="noopener"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
                    >
                      Installation guide
                      <OpenInNewIcon fontSize="small" />
                    </Link>
                  </Box>
                )
              }
            />
          </ListItem>

          {/* OpenAI API (Alternative) */}
          <ListItem>
            <ListItemIcon>
              {status.whisperAPI ? (
                <CheckCircleIcon color="success" />
              ) : (
                <WarningIcon color="warning" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="body1">OpenAI API Key</Typography>
                  <Chip
                    label="Optional"
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                </Box>
              }
              secondary={
                status.whisperAPI ? (
                  'Configured - Cloud transcription available'
                ) : (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Alternative to local Whisper (faster, costs $0.006/min)
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Set OPENAI_API_KEY environment variable
                    </Typography>
                    <Link
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
                    >
                      Get API key
                      <OpenInNewIcon fontSize="small" />
                    </Link>
                  </Box>
                )
              }
            />
          </ListItem>
        </List>

        {!status.whisperLocal && !status.whisperAPI && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Video transcription requires either Python Whisper (local) or OpenAI API key (cloud).
            Downloads and playback work without these.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={checkDependencies}>Recheck</Button>
        <Button onClick={() => setOpen(false)} variant="contained">
          {criticalMissing ? 'I\'ll Install Later' : 'Got It'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
