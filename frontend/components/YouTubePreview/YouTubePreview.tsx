import React, { useState, useRef, useCallback } from 'react';
import { Box, IconButton, Typography, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import LinkIcon from '@mui/icons-material/Link';
import CheckIcon from '@mui/icons-material/Check';
import type { VideoInfo } from '@shared/types';

interface Props {
  video: VideoInfo | null;
  onClose: () => void;
  onDownload: (video: VideoInfo) => void;
}

export default function YouTubePreview({ video, onClose, onDownload }: Props) {
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(420);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  if (!video) return null;

  function handleCopyLink() {
    const url = `https://www.youtube.com/watch?v=${video!.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    resizing.current = true;
    startX.current = e.clientX;
    startWidth.current = width;

    function onMouseMove(ev: MouseEvent) {
      if (!resizing.current) return;
      const delta = startX.current - ev.clientX;
      const newWidth = Math.min(Math.max(startWidth.current + delta, 320), 800);
      setWidth(newWidth);
    }

    function onMouseUp() {
      resizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width,
        zIndex: 1300,
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Resize handle — left edge */}
      <Box
        onMouseDown={handleResizeStart}
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 6,
          height: '100%',
          cursor: 'ew-resize',
          zIndex: 2,
          '&:hover': { bgcolor: 'primary.main', opacity: 0.3 },
        }}
      />

      {/* Title bar */}
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
        <Typography variant="caption" fontWeight={500} noWrap flex={1}>
          {video.title}
        </Typography>
        <Tooltip title={copied ? 'Copied!' : 'Copy link'}>
          <IconButton size="small" onClick={handleCopyLink}>
            {copied ? <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} /> : <LinkIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
        <IconButton size="small" color="primary" onClick={() => onDownload(video)} title="Download this video">
          <DownloadIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton size="small" onClick={onClose} title="Close preview">
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* YouTube embed */}
      <Box sx={{ position: 'relative', paddingTop: '56.25%', bgcolor: '#000' }}>
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
