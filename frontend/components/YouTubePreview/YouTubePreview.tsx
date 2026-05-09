import React, { useState, useRef } from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import LinkIcon from '@mui/icons-material/Link';
import CheckIcon from '@mui/icons-material/Check';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { VideoInfo } from '@shared/types';

interface Props {
  video: VideoInfo | null;
  onClose: () => void;
  onDownload: (video: VideoInfo) => void;
}

export default function YouTubePreview({ video, onClose, onDownload }: Props) {
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [size, setSize] = useState({ w: 420, h: 280 });
  const dragging = useRef(false);
  const resizing = useRef<string | null>(null);
  const dragStart = useRef({ mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0 });

  if (!video) return null;

  function handleCopyLink() {
    const url = `https://www.youtube.com/watch?v=${video!.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, x: position.x, y: position.y, w: size.w, h: size.h };

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const dx = ev.clientX - dragStart.current.mx;
      const dy = ev.clientY - dragStart.current.my;
      // right increases when mouse moves left, bottom increases when mouse moves up
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

  const cornerStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    width: 12,
    height: 12,
    zIndex: 3,
    cursor,
  });

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
      <Box onMouseDown={(e) => handleResizeStart(e, 'tl')} sx={{ ...cornerStyle('nw-resize'), top: 0, left: 0 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 'tr')} sx={{ ...cornerStyle('ne-resize'), top: 0, right: 0 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 'bl')} sx={{ ...cornerStyle('sw-resize'), bottom: 0, left: 0 }} />
      <Box onMouseDown={(e) => handleResizeStart(e, 'br')} sx={{ ...cornerStyle('se-resize'), bottom: 0, right: 0 }} />

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
          {video.title}
        </Typography>
        <Tooltip title={copied ? 'Copied!' : 'Copy link'}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleCopyLink(); }}>
            {copied ? <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} /> : <LinkIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
        <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); onDownload(video); }} title="Download">
          <DownloadIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close">
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* YouTube embed */}
      <Box sx={{ flex: 1, position: 'relative', bgcolor: '#000' }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      </Box>
    </Box>
  );
}
