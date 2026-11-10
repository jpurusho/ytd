/**
 * Transcript Analysis Component
 * Claude-powered AI analysis of transcripts
 */
import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import TagIcon from '@mui/icons-material/Tag';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  videoId: string;
  onSeek?: (time: number) => void;
}

export default function TranscriptAnalysis({ videoId, onSeek }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);

  const [summary, setSummary] = useState('');
  const [chapters, setChapters] = useState<Array<{ timestamp: number; title: string; description: string }>>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const [activeTab, setActiveTab] = useState<'summary' | 'chapters' | 'topics' | 'qa'>('summary');

  async function checkAvailability() {
    const isAvailable = await window.api.claude.isAvailable();
    setAvailable(isAvailable);
    if (!isAvailable) {
      setError('Claude API key not configured. Add it in Settings.');
    }
  }

  async function handleSummarize() {
    setLoading(true);
    setError('');
    try {
      const result = await window.api.claude.summarize(videoId);
      setSummary(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateChapters() {
    setLoading(true);
    setError('');
    try {
      const result = await window.api.claude.generateChapters(videoId);
      setChapters(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExtractTopics() {
    setLoading(true);
    setError('');
    try {
      const result = await window.api.claude.extractTopics(videoId);
      setTopics(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAskQuestion() {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await window.api.claude.askQuestion(videoId, question);
      setAnswer(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    checkAvailability();
    setOpen(true);
  }

  return (
    <>
      <Button
        startIcon={<AutoAwesomeIcon />}
        variant="outlined"
        size="small"
        onClick={handleOpen}
      >
        AI Analysis
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              <SmartToyIcon />
              <Typography variant="h6">AI Analysis with Claude</Typography>
            </Box>
            <IconButton size="small" onClick={() => setOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {!available && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Claude API key not configured. Add your Anthropic API key in Settings to use AI analysis.
            </Alert>
          )}

          {/* Tabs */}
          <Box display="flex" gap={1} mb={2} flexWrap="wrap">
            <Chip
              label="Summary"
              onClick={() => setActiveTab('summary')}
              color={activeTab === 'summary' ? 'primary' : 'default'}
              variant={activeTab === 'summary' ? 'filled' : 'outlined'}
            />
            <Chip
              label="Chapters"
              onClick={() => setActiveTab('chapters')}
              color={activeTab === 'chapters' ? 'primary' : 'default'}
              variant={activeTab === 'chapters' ? 'filled' : 'outlined'}
            />
            <Chip
              label="Topics"
              onClick={() => setActiveTab('topics')}
              color={activeTab === 'topics' ? 'primary' : 'default'}
              variant={activeTab === 'topics' ? 'filled' : 'outlined'}
            />
            <Chip
              label="Q&A"
              onClick={() => setActiveTab('qa')}
              color={activeTab === 'qa' ? 'primary' : 'default'}
              variant={activeTab === 'qa' ? 'filled' : 'outlined'}
            />
          </Box>

          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <Box>
              <Button
                variant="contained"
                onClick={handleSummarize}
                disabled={loading || !available}
                fullWidth
                sx={{ mb: 2 }}
              >
                {loading ? <CircularProgress size={20} /> : 'Generate Summary'}
              </Button>
              {summary && (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {summary}
                </Typography>
              )}
            </Box>
          )}

          {/* Chapters Tab */}
          {activeTab === 'chapters' && (
            <Box>
              <Button
                variant="contained"
                onClick={handleGenerateChapters}
                disabled={loading || !available}
                fullWidth
                sx={{ mb: 2 }}
              >
                {loading ? <CircularProgress size={20} /> : 'Generate Chapters'}
              </Button>
              {chapters.length > 0 && (
                <List dense>
                  {chapters.map((chapter, index) => (
                    <ListItem
                      key={index}
                      button={!!onSeek}
                      onClick={() => onSeek && onSeek(chapter.timestamp)}
                    >
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Chip
                              label={formatTimestamp(chapter.timestamp)}
                              size="small"
                              variant="outlined"
                            />
                            <Typography variant="body2" fontWeight={600}>
                              {chapter.title}
                            </Typography>
                          </Box>
                        }
                        secondary={chapter.description}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          )}

          {/* Topics Tab */}
          {activeTab === 'topics' && (
            <Box>
              <Button
                variant="contained"
                onClick={handleExtractTopics}
                disabled={loading || !available}
                fullWidth
                sx={{ mb: 2 }}
              >
                {loading ? <CircularProgress size={20} /> : 'Extract Topics'}
              </Button>
              {topics.length > 0 && (
                <Box display="flex" gap={1} flexWrap="wrap">
                  {topics.map((topic, index) => (
                    <Chip key={index} label={topic} icon={<TagIcon />} />
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* Q&A Tab */}
          {activeTab === 'qa' && (
            <Box>
              <TextField
                fullWidth
                multiline
                rows={2}
                placeholder="Ask a question about this video..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Button
                variant="contained"
                onClick={handleAskQuestion}
                disabled={loading || !available || !question.trim()}
                fullWidth
                sx={{ mb: 2 }}
              >
                {loading ? <CircularProgress size={20} /> : 'Ask Claude'}
              </Button>
              {answer && (
                <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {answer}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
