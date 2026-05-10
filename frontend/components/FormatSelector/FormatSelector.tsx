import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, TextField, FormControl, InputLabel, Select, MenuItem,
  Typography, CircularProgress, Alert, Chip, Slider,
} from '@mui/material';
import type { VideoInfo, FormatInfo, DownloadRequest } from '@shared/types';

interface Props {
  open: boolean;
  video: VideoInfo | null;
  onClose: () => void;
  onDownload: (request: DownloadRequest) => void;
}

const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4 (Video)' },
  { value: 'webm', label: 'WebM (Video)' },
  { value: 'mp3', label: 'MP3 (Audio Only)' },
];

const QUALITY_OPTIONS = [
  { value: '', label: 'Best Available' },
  { value: '2160', label: '4K (2160p)' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
];

function classifyFormatError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('enoent') || lower.includes('spawn') || lower.includes('failed to run yt-dlp'))
    return 'yt-dlp is not installed or could not be found. Check Settings → External Tools.';
  if (lower.includes('private video') || lower.includes('private'))
    return 'This is a private video and cannot be downloaded.';
  if (lower.includes('sign in') || lower.includes('age'))
    return 'This video requires sign-in or age verification.';
  if (lower.includes('unavailable') || lower.includes('not available'))
    return 'This video is unavailable.';
  if (lower.includes('members'))
    return 'This is a members-only video.';
  if (lower.includes('premiere') || lower.includes('live event'))
    return 'This video has not aired yet.';
  if (lower.includes('geo') || lower.includes('country'))
    return 'This video is not available in your region.';
  if (lower.includes('copyright'))
    return 'This video is blocked due to copyright.';
  if (lower.includes('drm'))
    return 'This video is DRM-protected and cannot be downloaded.';
  return 'Unable to access this video. It may be private, deleted, or restricted.';
}

function secondsToHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function hmsToSeconds(hms: string): number {
  if (!hms) return 0;
  const parts = hms.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export default function FormatSelector({ open, video, onClose, onDownload }: Props) {
  const [format, setFormat] = useState('mp4');
  const [resolution, setResolution] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [rangeValues, setRangeValues] = useState<number[]>([0, 100]);
  const [formats, setFormats] = useState<FormatInfo[]>([]);
  const [loadingFormats, setLoadingFormats] = useState(false);
  const [formatError, setFormatError] = useState('');

  const videoDuration = video?.duration || 0;

  useEffect(() => {
    if (open && video) {
      setLoadingFormats(true);
      setFormatError('');
      setRangeValues([0, video.duration || 100]);
      setStartTime('');
      setEndTime('');
      const url = `https://www.youtube.com/watch?v=${video.id}`;
      window.api.youtube.getFormats(url)
        .then(setFormats)
        .catch((err) => {
          const msg = err.message || 'Failed to load formats';
          setFormatError(classifyFormatError(msg));
        })
        .finally(() => setLoadingFormats(false));
    }
  }, [open, video]);

  function handleRangeChange(_: any, newValue: number | number[]) {
    const [start, end] = newValue as number[];
    setRangeValues([start, end]);
    setStartTime(start > 0 ? secondsToHMS(start) : '');
    setEndTime(end < videoDuration ? secondsToHMS(end) : '');
  }

  function handleStartTimeInput(value: string) {
    setStartTime(value);
    const seconds = hmsToSeconds(value);
    if (seconds >= 0 && seconds < rangeValues[1]) {
      setRangeValues([seconds, rangeValues[1]]);
    }
  }

  function handleEndTimeInput(value: string) {
    setEndTime(value);
    const seconds = hmsToSeconds(value);
    if (seconds > rangeValues[0] && seconds <= videoDuration) {
      setRangeValues([rangeValues[0], seconds]);
    }
  }

  function handleDownload() {
    if (!video) return;

    const request: DownloadRequest = {
      videoId: video.id,
      title: video.title,
      channel: video.channel,
      thumbnailUrl: video.thumbnail,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      format,
      quality: resolution || 'best',
      resolution: resolution || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    };

    onDownload(request);
    onClose();
    setStartTime('');
    setEndTime('');
  }

  const availableResolutions = formats
    .filter(f => f.vcodec !== 'none')
    .map(f => f.resolution)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      return numB - numA;
    });

  const selectedDuration = rangeValues[1] - rangeValues[0];
  const isSegment = startTime || endTime;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Download Options</DialogTitle>
      <DialogContent>
        {video && (
          <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
            <img
              src={video.thumbnail}
              alt={video.title}
              style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 4 }}
            />
            <Box>
              <Typography variant="body2" fontWeight={500} sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {video.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {video.channel} &middot; {secondsToHMS(videoDuration)}
              </Typography>
            </Box>
          </Box>
        )}

        {formatError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {formatError}
          </Alert>
        )}

        {loadingFormats && (
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">Detecting available formats...</Typography>
          </Box>
        )}

        {availableResolutions.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Available resolutions:
            </Typography>
            <Box display="flex" gap={0.5} flexWrap="wrap">
              {availableResolutions.map(r => (
                <Chip key={r} label={r} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>
        )}

        <Box display="flex" flexDirection="column" gap={2} mt={2}>
          <FormControl fullWidth size="small">
            <InputLabel>Format</InputLabel>
            <Select value={format} onChange={(e) => setFormat(e.target.value)} label="Format">
              {FORMAT_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {format !== 'mp3' && (
            <FormControl fullWidth size="small">
              <InputLabel>Quality</InputLabel>
              <Select value={resolution} onChange={(e) => setResolution(e.target.value)} label="Quality">
                {QUALITY_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Time Range Section */}
          <Box sx={{ mt: 1, p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
              <Typography variant="subtitle2">
                Time Range
              </Typography>
              {isSegment ? (
                <Chip
                  label={`${secondsToHMS(selectedDuration)} selected`}
                  size="small"
                  color="primary"
                  sx={{ height: 22, fontSize: '0.75rem' }}
                />
              ) : (
                <Typography variant="caption" color="text.secondary">Full video</Typography>
              )}
            </Box>

            {/* Range Slider */}
            {videoDuration > 0 && (
              <Box sx={{ px: 1, mb: 1 }}>
                <Slider
                  value={rangeValues}
                  onChange={handleRangeChange}
                  min={0}
                  max={videoDuration}
                  step={1}
                  valueLabelDisplay="auto"
                  valueLabelFormat={secondsToHMS}
                  disableSwap
                  sx={{
                    '& .MuiSlider-thumb': { width: 14, height: 14 },
                    '& .MuiSlider-track': { height: 6 },
                    '& .MuiSlider-rail': { height: 6, opacity: 0.3 },
                  }}
                />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">0:00</Typography>
                  <Typography variant="caption" color="text.secondary">{secondsToHMS(videoDuration)}</Typography>
                </Box>
              </Box>
            )}

            {/* Text inputs for precise control */}
            <Box display="flex" gap={2} mt={1}>
              <TextField
                label="Start"
                value={startTime}
                onChange={(e) => handleStartTimeInput(e.target.value)}
                size="small"
                placeholder="00:00"
                fullWidth
                helperText="HH:MM:SS or MM:SS"
              />
              <TextField
                label="End"
                value={endTime}
                onChange={(e) => handleEndTimeInput(e.target.value)}
                size="small"
                placeholder={secondsToHMS(videoDuration)}
                fullWidth
                helperText="Leave empty for end"
              />
            </Box>

            {!videoDuration && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Slider unavailable — video duration unknown. Use text inputs instead.
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{formatError ? 'Close' : 'Cancel'}</Button>
        {!formatError && (
          <Button variant="contained" onClick={handleDownload}>
            {isSegment ? `Download Segment (${secondsToHMS(selectedDuration)})` : 'Download'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
