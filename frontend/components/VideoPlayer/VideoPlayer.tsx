import React, { useState, useEffect, useRef } from 'react';
import { Box, IconButton, Typography, Slider, Alert, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import type { DownloadRecord } from '@shared/types';

interface Props {
  open: boolean;
  record: DownloadRecord | null;
  onClose: () => void;
}

const PLAYABLE_FORMATS = new Set(['mp4', 'webm', 'mp3', 'ogg', 'wav']);

function canPlayInline(format: string): boolean {
  return PLAYABLE_FORMATS.has(format.toLowerCase());
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoPlayer({ open, record, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sizeIndex, setSizeIndex] = useState(0);
  const [seeking, setSeeking] = useState(false);

  const isPlayable = record ? canPlayInline(record.format) : false;
  const isAudioOnly = record?.format === 'mp3';

  useEffect(() => {
    if (open && record?.filePath) {
      setLoading(true);
      setError('');
      setVideoUrl('');
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      window.api.app.getVideoFileUrl(record.filePath).then((result) => {
        if (result.error) {
          setError(result.error);
          setLoading(false);
        } else if (result.url) {
          if (!isPlayable) {
            setError(`Cannot play .${record.format} files inline. Use "Open in system player" instead.`);
            setLoading(false);
          } else {
            setVideoUrl(result.url);
            setLoading(false);
          }
        }
      });
    } else {
      setVideoUrl('');
      setError('');
    }
  }, [open, record]);

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play();
    }
    setPlaying(!playing);
  }

  function handleTimeUpdate() {
    if (seeking) return;
    const el = videoRef.current;
    if (el) setCurrentTime(el.currentTime);
  }

  function handleLoadedMetadata() {
    const el = videoRef.current;
    if (el) setDuration(el.duration);
  }

  function handleSeekChange(_: any, value: number | number[]) {
    setSeeking(true);
    setCurrentTime(value as number);
  }

  function handleSeekCommit(_: any, value: number | number[]) {
    const el = videoRef.current;
    if (el) {
      el.currentTime = value as number;
    }
    setSeeking(false);
  }

  function handleVolumeChange(_: any, value: number | number[]) {
    const vol = value as number;
    setVolume(vol);
    setMuted(vol === 0);
    if (videoRef.current) videoRef.current.volume = vol;
  }

  function toggleMute() {
    const newMuted = !muted;
    setMuted(newMuted);
    if (videoRef.current) videoRef.current.muted = newMuted;
  }

  function handleFullscreen() {
    videoRef.current?.requestFullscreen();
  }

  function openInSystem() {
    if (record?.filePath) window.api.app.openInSystemPlayer(record.filePath);
  }

  function showInFinder() {
    if (record?.filePath) window.api.app.showInFinder(record.filePath);
  }

  const sizes = [360, 500, 700];
  const sizeLabels = ['S', 'M', 'L'];
  const playerWidth = sizes[sizeIndex];

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: playerWidth,
        zIndex: 1300,
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: open ? 'block' : 'none',
        transition: 'width 0.2s ease',
        resize: 'both',
        minWidth: 300,
        maxWidth: '80vw',
      }}
    >
      {/* Title Bar — draggable feel */}
      <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
        <Typography variant="caption" fontWeight={500} noWrap flex={1}>
          {record?.title || 'Player'}
        </Typography>
        <IconButton size="small" onClick={() => setSizeIndex((sizeIndex + 1) % sizes.length)} title={`Size: ${sizeLabels[sizeIndex]} → ${sizeLabels[(sizeIndex + 1) % sizes.length]}`}>
          <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}>{sizeLabels[sizeIndex]}</Typography>
        </IconButton>
        <IconButton size="small" onClick={openInSystem} title="Open in system player">
          <OpenInNewIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={showInFinder} title="Show in Finder">
          <FolderOpenIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={onClose} title="Close">
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* Error State */}
      {error && (
        <Box sx={{ p: 2 }}>
          <Alert severity="warning" sx={{ fontSize: '0.75rem' }}>{error}</Alert>
          <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} onClick={openInSystem} sx={{ mt: 1 }}>
            Open in System Player
          </Button>
        </Box>
      )}

      {/* Video/Audio Content */}
      {videoUrl && !error && (
        <>
          <Box sx={{ bgcolor: '#000', position: 'relative' }}>
            {isAudioOnly ? (
              <Box display="flex" alignItems="center" justifyContent="center" py={3} flexDirection="column" gap={1}>
                {record?.thumbnailUrl && (
                  <img src={record.thumbnailUrl} alt="" style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 4 }} />
                )}
                <Typography color="#aaa" variant="caption">Audio</Typography>
                <audio
                  ref={videoRef as any}
                  src={videoUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setPlaying(false)}
                />
              </Box>
            ) : (
              <video
                ref={videoRef}
                src={videoUrl}
                style={{ width: '100%', display: 'block' }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setPlaying(false)}
                onClick={togglePlay}
              />
            )}
          </Box>

          {/* Controls */}
          <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size="small" onClick={togglePlay} sx={{ p: 0.5 }}>
              {playing ? <PauseIcon sx={{ fontSize: 18 }} /> : <PlayArrowIcon sx={{ fontSize: 18 }} />}
            </IconButton>

            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 35, fontSize: '0.7rem' }}>
              {formatTime(currentTime)}
            </Typography>

            <Slider
              value={currentTime}
              max={duration || 100}
              onChange={handleSeekChange}
              onChangeCommitted={handleSeekCommit}
              size="small"
              sx={{ flex: 1, '& .MuiSlider-thumb': { width: 10, height: 10 } }}
            />

            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 35, fontSize: '0.7rem' }}>
              {formatTime(duration)}
            </Typography>

            <IconButton size="small" onClick={toggleMute} sx={{ p: 0.5 }}>
              {muted ? <VolumeOffIcon sx={{ fontSize: 16 }} /> : <VolumeUpIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Box>
        </>
      )}
    </Box>
  );
}
