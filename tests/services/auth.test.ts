/**
 * Tests for GoogleAuthService
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleAuthService } from '../../desktop/services/google-auth';
import * as database from '../../desktop/services/database';

// Mock database functions
vi.mock('../../desktop/services/database', () => ({
  saveTokens: vi.fn(),
  getTokens: vi.fn(),
  deleteTokens: vi.fn(),
  saveUserInfo: vi.fn(),
  getUserInfo: vi.fn(),
  deleteUserInfo: vi.fn(),
  getSetting: vi.fn((key: string) => {
    if (key === 'google_client_id') return null;
    if (key === 'google_client_secret') return null;
    return null;
  }),
  initDatabase: vi.fn(),
}));

// Mock Google OAuth
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    setCredentials: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }),
    generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/auth'),
  })),
}));

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    youtube: vi.fn(),
    oauth2: vi.fn().mockReturnValue({
      userinfo: {
        get: vi.fn().mockResolvedValue({
          data: {
            email: 'test@example.com',
            name: 'Test User',
            picture: 'https://example.com/avatar.jpg',
          },
        }),
      },
    }),
  },
}));

describe('GoogleAuthService', () => {
  let authService: GoogleAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new GoogleAuthService();
  });

  describe('isLoggedIn', () => {
    it('should return true when tokens exist', () => {
      vi.mocked(database.getTokens).mockReturnValue({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600000,
        scope: 'youtube',
      });

      expect(authService.isLoggedIn()).toBe(true);
    });

    it('should return false when tokens do not exist', () => {
      vi.mocked(database.getTokens).mockReturnValue(null);

      expect(authService.isLoggedIn()).toBe(false);
    });
  });

  describe('getUser', () => {
    it('should return user info when it exists', () => {
      const mockUser = {
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
      };
      vi.mocked(database.getUserInfo).mockReturnValue(mockUser);

      const user = authService.getUser();

      expect(user).toEqual(mockUser);
    });

    it('should return null when user info does not exist', () => {
      vi.mocked(database.getUserInfo).mockReturnValue(null);

      const user = authService.getUser();

      expect(user).toBeNull();
    });
  });

  describe('logout', () => {
    it('should delete tokens and user info', async () => {
      await authService.logout();

      expect(database.deleteTokens).toHaveBeenCalled();
      expect(database.deleteUserInfo).toHaveBeenCalled();
    });
  });

  describe('getOAuth2Client', () => {
    it('should return OAuth2Client instance', () => {
      const client = authService.getOAuth2Client();

      expect(client).toBeDefined();
      expect(client).toHaveProperty('setCredentials');
    });
  });
});
