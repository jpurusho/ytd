import * as fs from 'fs';
import * as path from 'path';

export interface EmbeddedConfig {
  clientId: string;
  clientSecret: string;
}

let cached: EmbeddedConfig | null = null;

export function loadEmbeddedConfig(): EmbeddedConfig {
  if (cached) return cached;

  const candidates = [
    path.join(__dirname, '../oauth-config.json'),
    path.join(__dirname, '../../oauth-config.json'),
    path.join(__dirname, '../../dist/oauth-config.json'),
  ];

  for (const configPath of candidates) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        cached = {
          clientId: config.clientId || '',
          clientSecret: config.clientSecret || '',
        };
        return cached;
      }
    } catch {}
  }

  cached = { clientId: '', clientSecret: '' };
  return cached;
}
