import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Button, FormControl,
  InputLabel, Select, MenuItem, Divider, Alert, Chip,
  Switch, FormControlLabel,
} from '@mui/material';
import FolderSyncIcon from '@mui/icons-material/SyncAlt';
import { useAppTheme } from '../theme/ThemeContext';
import { errorService } from '../services/error-service';

export default function Settings() {
  const { currentTheme, setThemeId, availableThemes } = useAppTheme();
  const [outputDir, setOutputDir] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState('3');
  const [useBrowserCookies, setUseBrowserCookies] = useState(false);
  const [cookieBrowser, setCookieBrowser] = useState('chrome');
  const [toolStatus, setToolStatus] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<{ updated: number; stillMissing: number } | null>(null);
  const [version, setVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<{ status: string; version?: string; url?: string; message?: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadedPath, setDownloadedPath] = useState('');

  // API Keys
  const [openaiKey, setOpenaiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);

  useEffect(() => {
    loadSettings();
    window.api.app.getVersion().then(setVersion);
    window.api.app.checkTools().then(setToolStatus);
  }, []);

  async function loadSettings() {
    const dir = await window.api.app.getSetting('output_dir');
    if (dir) setOutputDir(dir);
    else {
      // Default to ~/Downloads for all platforms (main process will resolve ~)
      setOutputDir('~/Downloads');
    }

    const concurrent = await window.api.app.getSetting('max_concurrent');
    if (concurrent) setMaxConcurrent(concurrent);

    const cookies = await window.api.app.getSetting('use_browser_cookies');
    if (cookies === 'true') setUseBrowserCookies(true);

    const browser = await window.api.app.getSetting('cookie_browser');
    if (browser) setCookieBrowser(browser);

    // Load API keys
    const openai = await window.api.app.getSetting('openai_api_key');
    if (openai) setOpenaiKey(openai);

    const claude = await window.api.app.getSetting('claude_api_key');
    if (claude) setClaudeKey(claude);
  }

  async function handleSaveAPIKeys() {
    if (openaiKey.trim()) {
      await window.api.app.setSetting('openai_api_key', openaiKey.trim());
    }
    if (claudeKey.trim()) {
      await window.api.app.setSetting('claude_api_key', claudeKey.trim());
    }
    showSaved();
  }

  async function handleSelectDir() {
    const dir = await window.api.app.selectDirectory();
    if (dir) {
      setOutputDir(dir);
      await window.api.app.setSetting('output_dir', dir);
      showSaved();
    }
  }

  async function handleSaveConcurrent() {
    await window.api.app.setSetting('max_concurrent', maxConcurrent);
    showSaved();
  }

  function showSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto', maxWidth: 700 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
        Settings
      </Typography>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved</Alert>}

      {/* Output Directory */}
      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }} elevation={0}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Download Location</Typography>
        <Box display="flex" gap={1} mb={1.5}>
          <TextField value={outputDir} size="small" fullWidth disabled />
          <Button variant="outlined" onClick={handleSelectDir}>Browse</Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          If you moved downloaded files to a different folder, rescan to update the history so the Dashboard and History pages stop showing them as missing.
        </Typography>
        <Box display="flex" alignItems="center" gap={1.5}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FolderSyncIcon />}
            disabled={rescanning}
            onClick={async () => {
              const folder = await window.api.app.selectDirectory();
              if (!folder) return;
              setRescanning(true);
              setRescanResult(null);
              const result = await window.api.downloads.rescanFolder(folder);
              setRescanResult(result);
              setRescanning(false);
            }}
          >
            {rescanning ? 'Scanning...' : 'Rescan folder for moved files'}
          </Button>
          {rescanResult && (
            <Typography variant="caption" color={rescanResult.updated > 0 ? 'success.main' : 'text.secondary'}>
              {rescanResult.updated} record{rescanResult.updated !== 1 ? 's' : ''} updated
              {rescanResult.stillMissing > 0 ? `, ${rescanResult.stillMissing} still missing` : ''}
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Concurrent Downloads */}
      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }} elevation={0}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Simultaneous Downloads</Typography>
        <Box display="flex" gap={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select value={maxConcurrent} onChange={(e) => setMaxConcurrent(e.target.value)}>
              <MenuItem value="1">1</MenuItem>
              <MenuItem value="2">2</MenuItem>
              <MenuItem value="3">3</MenuItem>
              <MenuItem value="4">4</MenuItem>
              <MenuItem value="5">5</MenuItem>
            </Select>
          </FormControl>
          <Button variant="outlined" size="small" onClick={handleSaveConcurrent}>Save</Button>
        </Box>
      </Paper>

      {/* Browser Cookies Auth */}
      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }} elevation={0}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Browser Authentication</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Use your browser's YouTube login cookies to download restricted videos (age-restricted, region-locked, etc.)
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          <FormControlLabel
            control={
              <Switch
                checked={useBrowserCookies}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setUseBrowserCookies(val);
                  await window.api.app.setSetting('use_browser_cookies', val ? 'true' : 'false');
                  showSaved();
                }}
                size="small"
              />
            }
            label={<Typography variant="body2">Use browser cookies</Typography>}
          />
          {useBrowserCookies && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={cookieBrowser}
                onChange={async (e) => {
                  const val = e.target.value;
                  setCookieBrowser(val);
                  await window.api.app.setSetting('cookie_browser', val);
                  showSaved();
                }}
              >
                <MenuItem value="chrome">Chrome</MenuItem>
                <MenuItem value="firefox">Firefox</MenuItem>
                <MenuItem value="safari">Safari</MenuItem>
                <MenuItem value="edge">Edge</MenuItem>
                <MenuItem value="brave">Brave</MenuItem>
              </Select>
            </FormControl>
          )}
        </Box>
      </Paper>

      {/* Theme */}
      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }} elevation={0}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Theme</Typography>
        <FormControl fullWidth size="small">
          <Select value={currentTheme.id} onChange={(e) => setThemeId(e.target.value)}>
            {availableThemes.map(theme => (
              <MenuItem key={theme.id} value={theme.id}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: theme.colors.primary }} />
                  {theme.name}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      {/* Tools Status */}
      {toolStatus && (
        <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }} elevation={0}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>External Tools</Typography>
          <Box display="flex" flexDirection="column" gap={1}>
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                label={toolStatus.ytDlp.installed ? 'Installed' : 'Missing'}
                size="small"
                color={toolStatus.ytDlp.installed ? 'success' : 'error'}
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
              <Typography variant="body2">
                yt-dlp {toolStatus.ytDlp.version && `v${toolStatus.ytDlp.version}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">{toolStatus.ytDlp.path}</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                label={toolStatus.ffmpeg.installed ? 'Installed' : 'Missing'}
                size="small"
                color={toolStatus.ffmpeg.installed ? 'success' : 'error'}
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
              <Typography variant="body2">
                ffmpeg {toolStatus.ffmpeg.version && `v${toolStatus.ffmpeg.version}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">{toolStatus.ffmpeg.path}</Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* API Keys */}
      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }} elevation={0}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>API Keys</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Configure API keys for optional cloud services
        </Typography>

        {/* OpenAI API Key */}
        <Box mb={2}>
          <Typography variant="body2" component="div" sx={{ mb: 1, fontWeight: 500 }}>
            OpenAI API Key
            <Chip label="Optional" size="small" sx={{ ml: 1, height: 18, fontSize: '0.7rem' }} />
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            For faster cloud transcription ($0.006/min). Default is free local Whisper.
          </Typography>
          <Box display="flex" gap={1}>
            <TextField
              size="small"
              fullWidth
              type={showOpenaiKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowOpenaiKey(!showOpenaiKey)}
            >
              {showOpenaiKey ? 'Hide' : 'Show'}
            </Button>
          </Box>
        </Box>

        {/* Claude API Key */}
        <Box mb={2}>
          <Typography variant="body2" component="div" sx={{ mb: 1, fontWeight: 500 }}>
            Anthropic Claude API Key
            <Chip label="Optional" size="small" sx={{ ml: 1, height: 18, fontSize: '0.7rem' }} />
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            For AI-powered transcript analysis (summarize, Q&A, chapters).
          </Typography>
          <Box display="flex" gap={1}>
            <TextField
              size="small"
              fullWidth
              type={showClaudeKey ? 'text' : 'password'}
              placeholder="sk-ant-..."
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowClaudeKey(!showClaudeKey)}
            >
              {showClaudeKey ? 'Hide' : 'Show'}
            </Button>
          </Box>
        </Box>

        <Button
          variant="contained"
          size="small"
          onClick={handleSaveAPIKeys}
          disabled={!openaiKey.trim() && !claudeKey.trim()}
        >
          Save API Keys
        </Button>
      </Paper>

      {/* Version & Updates */}
      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }} elevation={0}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>About</Typography>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <Typography variant="body2">ytd v{version}</Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={checkingUpdate}
            onClick={async () => {
              setCheckingUpdate(true);
              const result = await window.api.app.checkForUpdates();
              setUpdateStatus(result);
              setCheckingUpdate(false);
            }}
          >
            {checkingUpdate ? 'Checking...' : 'Check for Updates'}
          </Button>
          {updateStatus?.status === 'up-to-date' && (
            <Chip label="Up to date" size="small" color="success" sx={{ height: 22, fontSize: '0.75rem' }} />
          )}
          {updateStatus?.status === 'available' && !downloading && !downloadedPath && (
            <Chip
              label={`v${updateStatus.version} — download`}
              size="small"
              color="info"
              onClick={async () => {
                if (!updateStatus.url) return;
                setDownloading(true);
                setDownloadPercent(0);
                const unsub = window.api.app.onDownloadProgress((data) => setDownloadPercent(data.percent));
                try {
                  const result = await window.api.app.downloadUpdate(updateStatus.url);

                  // Check if code signing error requires manual download
                  if (result.requiresManualDownload && result.downloadUrl) {
                    window.api.app.openExternal(result.downloadUrl);
                    setUpdateStatus({
                      status: 'manual-update',
                      version: result.version,
                      url: result.downloadUrl
                    });
                  } else {
                    setDownloadedPath(result.path);
                  }
                } catch (error) {
                  errorService.handleError(error, 'Failed to download update');
                } finally {
                  setDownloading(false);
                  unsub();
                }
              }}
              sx={{ height: 22, fontSize: '0.75rem', cursor: 'pointer' }}
            />
          )}
          {updateStatus?.status === 'manual-update' && (
            <Chip
              label={`v${updateStatus.version} — view on GitHub`}
              size="small"
              color="warning"
              onClick={() => {
                if (updateStatus.url) window.api.app.openExternal(updateStatus.url);
              }}
              sx={{ height: 22, fontSize: '0.75rem', cursor: 'pointer' }}
            />
          )}
          {downloading && (
            <Chip label={`Downloading... ${downloadPercent}%`} size="small" color="info" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
          )}
          {updateStatus?.status === 'error' && (
            <Chip label={updateStatus.message} size="small" color="warning" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
          )}
        </Box>
        {updateStatus?.status === 'manual-update' && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'warning.lighter', border: '1px solid', borderColor: 'warning.light' }}>
            <Typography variant="caption" color="warning.dark" fontWeight={600}>
              v{updateStatus.version} is a source-code release
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.6 }}>
              No pre-built binary available. To update:<br/>
              1. cd ~/experimental/ytd<br/>
              2. git pull origin main<br/>
              3. npm install<br/>
              4. npm run build<br/>
              5. npm start
            </Typography>
          </Box>
        )}
        {downloadedPath && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="success.main" fontWeight={500}>
              Downloaded! To install:
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.6 }}>
              1. Quit ytd<br/>
              2. Extract the .zip in Downloads<br/>
              3. Replace ytd.app in /Applications<br/>
              4. Run: xattr -rc /Applications/ytd.app<br/>
              5. Open ytd
            </Typography>
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer', display: 'block', mt: 0.5 }}
              onClick={() => window.api.app.showInFinder(downloadedPath)}
            >
              Show in Finder
            </Typography>
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Electron + React + TypeScript + SQLite
        </Typography>
      </Paper>
    </Box>
  );
}
