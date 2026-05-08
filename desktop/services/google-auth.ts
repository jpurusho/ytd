import { shell } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import * as http from 'http';
import { saveTokens, getTokens, clearTokens, saveUserInfo, getUserInfo, clearUserInfo, getSetting, setSetting } from './database';
import { loadEmbeddedConfig } from './embedded-config';
import type { UserInfo, AuthTokens } from '../../shared/types';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const PORT_MIN = 48620;
const PORT_MAX = 48640;

function resolveCredentials(): { clientId: string; clientSecret: string } {
  const dbId = getSetting('google_client_id');
  const dbSecret = getSetting('google_client_secret');
  if (dbId && dbSecret) return { clientId: dbId, clientSecret: dbSecret };

  const embedded = loadEmbeddedConfig();
  if (embedded.clientId && embedded.clientSecret) return { clientId: embedded.clientId, clientSecret: embedded.clientSecret };

  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  };
}

function setupTokenListener(client: OAuth2Client): void {
  client.on('tokens', (newTokens) => {
    const existing = getTokens();
    const merged: AuthTokens = {
      access_token: newTokens.access_token || existing?.access_token || '',
      refresh_token: newTokens.refresh_token || existing?.refresh_token,
      token_type: newTokens.token_type || existing?.token_type,
      expiry_date: newTokens.expiry_date || existing?.expiry_date,
      scope: newTokens.scope || existing?.scope,
    };
    saveTokens(merged);
  });
}

export class GoogleAuthService {
  private oauth2Client: OAuth2Client;
  private redirectUri: string = '';

  constructor() {
    const { clientId, clientSecret } = resolveCredentials();
    this.redirectUri = `http://localhost:${PORT_MIN}/callback`;

    this.oauth2Client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri: this.redirectUri,
    });

    const tokens = getTokens();
    if (tokens) {
      this.oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date,
        scope: tokens.scope,
      });
    }

    setupTokenListener(this.oauth2Client);
  }

  getOAuth2Client(): OAuth2Client {
    return this.oauth2Client;
  }

  hasCredentials(): boolean {
    const { clientId, clientSecret } = resolveCredentials();
    return !!(clientId && clientSecret);
  }

  setCredentials(clientId: string, clientSecret: string): void {
    setSetting('google_client_id', clientId);
    setSetting('google_client_secret', clientSecret);

    this.oauth2Client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri: this.redirectUri,
    });

    const tokens = getTokens();
    if (tokens) {
      this.oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date,
        scope: tokens.scope,
      });
    }

    setupTokenListener(this.oauth2Client);
  }

  async login(): Promise<UserInfo> {
    const { port, code } = await this.getAuthCodeViaBrowser();

    const redirectUri = `http://localhost:${port}/callback`;
    const { tokens } = await this.oauth2Client.getToken({ code, redirect_uri: redirectUri });

    this.oauth2Client.setCredentials(tokens);

    const authTokens: AuthTokens = {
      access_token: tokens.access_token || '',
      refresh_token: tokens.refresh_token ?? undefined,
      token_type: tokens.token_type ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
      scope: tokens.scope ?? undefined,
    };
    saveTokens(authTokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data } = await oauth2.userinfo.get();

    const userInfo: UserInfo = {
      email: data.email || '',
      name: data.name || '',
      picture: data.picture || '',
    };
    saveUserInfo(userInfo);

    return userInfo;
  }

  async logout(): Promise<void> {
    try {
      await this.oauth2Client.revokeCredentials();
    } catch {}
    this.oauth2Client.setCredentials({});
    clearTokens();
    clearUserInfo();
  }

  async getCurrentUser(): Promise<UserInfo | null> {
    const tokens = getTokens();
    if (!tokens) return null;

    const cached = getUserInfo();
    if (cached) return cached;

    try {
      this.oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();
      const userInfo: UserInfo = {
        email: data.email || '',
        name: data.name || '',
        picture: data.picture || '',
      };
      saveUserInfo(userInfo);
      return userInfo;
    } catch {
      return null;
    }
  }

  isLoggedIn(): boolean {
    const tokens = getTokens();
    return tokens !== null;
  }

  private getAuthCodeViaBrowser(): Promise<{ code: string; port: number }> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      let server: http.Server;

      const successHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                   display: flex; align-items: center; justify-content: center; height: 100vh;
                   margin: 0; background: #0f0f23; color: #e2e8f0; }
            .card { text-align: center; padding: 3rem; border-radius: 1rem;
                    background: #1a1a2e; border: 1px solid #2a2a4e; max-width: 400px; }
            h2 { color: #ff4444; margin-bottom: 0.5rem; }
            p { color: #94a3b8; margin-top: 0.5rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Signed in successfully</h2>
            <p>You can close this tab and return to ytd.</p>
          </div>
        </body>
        </html>`;

      const errorHtml = (msg: string) => `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                   display: flex; align-items: center; justify-content: center; height: 100vh;
                   margin: 0; background: #0f0f23; color: #e2e8f0; }
            .card { text-align: center; padding: 3rem; border-radius: 1rem;
                    background: #1a1a2e; border: 1px solid #4a2020; max-width: 400px; }
            h2 { color: #ef4444; margin-bottom: 0.5rem; }
            p { color: #94a3b8; margin-top: 0.5rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication failed</h2>
            <p>${msg}</p>
            <p>Close this tab and try again in ytd.</p>
          </div>
        </body>
        </html>`;

      const tryPort = (port: number) => {
        server = http.createServer((req, res) => {
          const url = new URL(req.url || '/', `http://localhost:${port}`);

          if (url.pathname === '/callback') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            if (code && !resolved) {
              resolved = true;
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(successHtml);
              setTimeout(() => server.close(), 1000);
              resolve({ code, port });
            } else if (error) {
              resolved = true;
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(errorHtml(error));
              setTimeout(() => server.close(), 1000);
              reject(new Error(`OAuth error: ${error}`));
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(errorHtml('No authorization code received'));
            }
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        });

        server.listen(port, '127.0.0.1', () => {
          const redirectUri = `http://localhost:${port}/callback`;
          const creds = resolveCredentials();
          this.oauth2Client = new OAuth2Client({
            clientId: creds.clientId,
            clientSecret: creds.clientSecret,
            redirectUri,
          });
          this.redirectUri = redirectUri;
          setupTokenListener(this.oauth2Client);

          const tokens = getTokens();
          if (tokens) {
            this.oauth2Client.setCredentials({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
            });
          }

          const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent',
            redirect_uri: redirectUri,
          });

          shell.openExternal(authUrl);
        });

        server.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE' && port < PORT_MAX) {
            tryPort(port + 1);
          } else {
            reject(new Error(`Cannot start callback server: ${err.message}`));
          }
        });

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            server.close();
            reject(new Error('Login timed out. Please try again.'));
          }
        }, 5 * 60 * 1000);
      };

      tryPort(PORT_MIN);
    });
  }
}
