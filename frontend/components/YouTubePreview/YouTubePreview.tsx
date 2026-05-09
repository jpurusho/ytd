import React, { useState } from 'react';
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

  if (!video) return null;

  function handleCopyLink() {
    const url = `https://www.youtube.com/watch?v=${video!.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 400,
        minWidth: 300,
        maxWidth: '80vw',
        zIndex: 1300,
        borderRadius: 2,
        overflow: 'auto',
        resize: 'both',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
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
