import React, { useState, useEffect, useRef } from 'react';
import { Box, IconButton, Typography, Slider, Alert, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { DownloadRecord, LibraryItem } from '@shared/types';

interface Props {
  open: boolean;
  record: DownloadRecord | LibraryItem | null;
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
  const [seeking, setSeeking] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [size, setSize] = useState({ w: 420, h: 300 });
  const dragging = useRef(false);
  const resizing = useRef<string | null>(null);
  const dragStart = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });

  const recordFormat = record?.format || 'mp4';
  const isPlayable = record ? canPlayInline(recordFormat) : false;
  const isAudioOnly = recordFormat === 'mp3';

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
            setError(`Cannot play .${recordFormat} files inline. Use "Open in system player" instead.`);
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
    if (playing) { el.pause(); } else { el.play(); }
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
    if (el) { el.currentTime = value as number; }
    setSeeking(false);
  }

  function toggleMute() {
    const newMuted = !muted;
    setMuted(newMuted);
    if (videoRef.current) videoRef.current.muted = newMuted;
  }

  function openInSystem() {
    if (record?.filePath) window.api.app.openInSystemPlayer(record.filePath);
  }

  function showInFinder() {
    if (record?.filePath) window.api.app.showInFinder(record.filePath);
  }

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, x: position.x, y: position.y, w: size.w, h: size.h };

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const dx = ev.clientX - dragStart.current.mx;
      const dy = ev.clientY - dragStart.current.my;
      setPosition({
        x: Math.max(0, dragStart.current.x - dx),
        y: Math.max(0, dragStart.current.y - dy),
      });
    }
    function onUp() {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleResizeStart(e: React.MouseEvent, corner: string) {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = corner;
    dragStart.current = { mx: e.clientX, my: e.clientY, x: position.x, y: position.y, w: size.w, h: size.h };

    function onMove(ev: MouseEvent) {
      if (!resizing.current) return;
      const dx = ev.clientX - dragStart.current.mx;
      const dy = ev.clientY - dragStart.current.my;
      const c = resizing.current;

      let newW = dragStart.current.w;
      let newH = dragStart.current.h;
      let newX = dragStart.current.x;
      let newY = dragStart.current.y;

      if (c.includes('l')) { newW = Math.max(320, dragStart.current.w - dx); newX = dragStart.current.x + (dragStart.current.w - newW); }
      if (c.includes('r')) { newW = Math.max(320, dragStart.current.w + dx); }
      if (c.includes('b')) { newY = Math.max(0, dragStart.current.y - dy); newH = Math.max(200, dragStart.current.h + dy); }
      if (c.includes('t')) { newH = Math.max(200, dragStart.current.h - dy); }

      setSize({ w: Math.min(newW, 900), h: Math.min(newH, 700) });
      setPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
    }
    function onUp() {
      resizing.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  if (!open) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: position.y,
        right: position.x,
        width: size.w,
        height: size.h,
        zIndex: 1300,
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Resize corners */}
      <Box onMouseDown={(e) => handleResizeStart(e, 'tl')} sx={{ position: 'absolute', width: 12, height: 12, top: 0, left: 0, cursor: 'nw-resize', zIndex: 3 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 'tr')} sx={{ position: 'absolute', width: 12, height: 12, top: 0, right: 0, cursor: 'ne-resize', zIndex: 3 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 'bl')} sx={{ position: 'absolute', width: 12, height: 12, bottom: 0, left: 0, cursor: 'sw-resize', zIndex: 3 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 'br')} sx={{ position: 'absolute', width: 12, height: 12, bottom: 0, right: 0, cursor: 'se-resize', zIndex: 3 }} />

      {/* Resize edges */}
      <Box onMouseDown={(e) => handleResizeStart(e, 'l')} sx={{ position: 'absolute', top: 12, bottom: 12, left: 0, width: 5, cursor: 'ew-resize', zIndex: 2 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 'r')} sx={{ position: 'absolute', top: 12, bottom: 12, right: 0, width: 5, cursor: 'ew-resize', zIndex: 2 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 't')} sx={{ position: 'absolute', top: 0, left: 12, right: 12, height: 5, cursor: 'ns-resize', zIndex: 2 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 'b')} sx={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 5, cursor: 'ns-resize', zIndex: 2 }} />

      {/* Title bar — drag to move */}
      <Box
        onMouseDown={handleDragStart}
        sx={{
          px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.5,
          borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default',
          cursor: 'move', userSelect: 'none', flexShrink: 0,
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
        <Typography variant="caption" fontWeight={500} noWrap flex={1}>
          {record?.title || 'Player'}
        </Typography>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); openInSystem(); }} title="System player">
          <OpenInNewIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); showInFinder(); }} title="Finder">
          <FolderOpenIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close">
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
          <Box sx={{ flex: 1, bgcolor: '#000', position: 'relative', minHeight: 0 }}>
            {isAudioOnly ? (
              <Box display="flex" alignItems="center" justifyContent="center" height="100%" flexDirection="column" gap={1}>
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
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setPlaying(false)}
                onClick={togglePlay}
              />
            )}
          </Box>

          {/* Controls */}
          <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
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
