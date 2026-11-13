# ADR 0010: Enhanced PATH for Homebrew-Installed Tools

Date: 2026-11-13

## Context

The packaged Electron app doesn't inherit the user's shell PATH environment variable. When users install tools via Homebrew (e.g., `brew install openai-whisper`), these tools land in `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel), which aren't in the packaged app's PATH.

Initial approach tried hardcoding path checks (`fs.existsSync('/opt/homebrew/bin/whisper')`), which was brittle and non-standard.

## Decision

Use the **standard Node.js practice** of augmenting the environment's PATH variable when spawning child processes:

```typescript
private getEnhancedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const brewPaths = [
    '/opt/homebrew/bin',  // Apple Silicon Homebrew
    '/usr/local/bin',     // Intel Mac Homebrew
  ];
  
  const currentPath = env.PATH || '';
  const pathsToAdd = brewPaths.filter(p => !currentPath.includes(p));
  
  if (pathsToAdd.length > 0) {
    env.PATH = `${pathsToAdd.join(':')}:${currentPath}`;
  }
  
  return env;
}

// Use when spawning:
spawn(command, args, { env: this.getEnhancedEnv() })
```

## Consequences

**Positive:**
- Standard Node.js practice for environment management
- Single source of truth for PATH enhancement
- Works with `which` command and any tool that respects PATH
- Easy to extend for other common installation locations
- No hardcoded absolute paths scattered through codebase

**Negative:**
- Must remember to use `{ env: this.getEnhancedEnv() }` when spawning
- Adds slight overhead to every process spawn

**Applications:**
- WhisperTranscriptionService: Detects and runs brew-installed whisper
- Future services that rely on Homebrew tools (ffmpeg, yt-dlp, etc.)
