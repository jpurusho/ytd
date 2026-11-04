import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { VideoInfo, PlaylistInfo, PlaylistItem, SubscriptionInfo, SearchOptions } from '../../shared/types';

export class YouTubeApiService {
  private youtube: youtube_v3.Youtube;

  constructor(auth: OAuth2Client) {
    this.youtube = google.youtube({ version: 'v3', auth });
  }

  async search(query: string, maxResults: number = 20, options: SearchOptions = {}): Promise<VideoInfo[]> {
    const params: youtube_v3.Params$Resource$Search$List = {
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults,
      order: options.order || 'relevance',
    };
    if (options.videoDuration) params.videoDuration = options.videoDuration;
    if (options.publishedAfter) params.publishedAfter = options.publishedAfter;

    const response = await this.youtube.search.list(params);

    const videoIds = (response.data.items || [])
      .map(item => item.id?.videoId)
      .filter((id): id is string => !!id);

    if (videoIds.length === 0) return [];

    const detailsResponse = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds,
    });

    return (detailsResponse.data.items || []).map(item => ({
      id: item.id || '',
      title: item.snippet?.title || '',
      channel: item.snippet?.channelTitle || '',
      channelId: item.snippet?.channelId || '',
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
      duration: parseDuration(item.contentDetails?.duration || ''),
      publishedAt: item.snippet?.publishedAt || '',
      viewCount: parseInt(item.statistics?.viewCount || '0', 10),
      description: item.snippet?.description || '',
    }));
  }

  async getPlaylists(): Promise<PlaylistInfo[]> {
    const items: PlaylistInfo[] = [];

    // Get special playlists from the user's channel (Liked Videos, Uploads, etc.)
    // Note: Watch Later (WL) is NOT accessible through YouTube Data API v3
    try {
      const channelResponse = await this.youtube.channels.list({
        part: ['contentDetails'],
        mine: true,
      });

      const relatedPlaylists = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists;
      console.log('[getPlaylists] Related playlists:', relatedPlaylists);

      // Add Liked Videos (LL) if available
      if (relatedPlaylists?.likes) {
        try {
          const likesResponse = await this.youtube.playlistItems.list({
            part: ['snippet'],
            playlistId: relatedPlaylists.likes,
            maxResults: 1,
          });
          const count = likesResponse.data.pageInfo?.totalResults || 0;
          console.log(`[getPlaylists] Liked Videos has ${count} videos`);
          if (count > 0) {
            items.push({
              id: relatedPlaylists.likes,
              title: 'Liked Videos',
              itemCount: count,
              thumbnail: '',
              description: 'Videos you have liked',
            });
          }
        } catch (err: any) {
          console.log('[getPlaylists] Failed to access Liked Videos:', err.message);
        }
      }

      // Note: Watch Later (WL) is not accessible through the public API
      // YouTube's Data API v3 does not expose Watch Later, even with full youtube scope
    } catch (err: any) {
      console.error('[getPlaylists] Error fetching channel playlists:', err.message);
    }

    // Then fetch user-created playlists
    let pageToken: string | undefined;
    do {
      const response = await this.youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        mine: true,
        maxResults: 50,
        pageToken,
      });

      for (const item of response.data.items || []) {
        items.push({
          id: item.id || '',
          title: item.snippet?.title || '',
          itemCount: item.contentDetails?.itemCount || 0,
          thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
          description: item.snippet?.description || '',
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return items;
  }

  async getPlaylistItems(playlistId: string, maxResults: number = 50): Promise<PlaylistItem[]> {
    console.log(`[getPlaylistItems] Fetching playlist ${playlistId}, maxResults=${maxResults}`);
    const items: PlaylistItem[] = [];
    let pageToken: string | undefined;
    let fetched = 0;

    do {
      const response = await this.youtube.playlistItems.list({
        part: ['snippet'],
        playlistId,
        maxResults: Math.min(50, maxResults - fetched),
        pageToken,
      });

      console.log(`[getPlaylistItems] ${playlistId} page: ${response.data.items?.length || 0} items, totalResults: ${response.data.pageInfo?.totalResults || 0}`);

      const videoIds = (response.data.items || [])
        .map(item => item.snippet?.resourceId?.videoId)
        .filter((id): id is string => !!id);

      console.log(`[getPlaylistItems] ${playlistId} valid videoIds: ${videoIds.length} out of ${response.data.items?.length || 0} items`);

      if (videoIds.length === 0) {
        // Check if there are more pages even if this page had no valid videos
        pageToken = response.data.nextPageToken || undefined;
        if (!pageToken) break;
        continue;
      }

      // Fetch full video details (duration, etc.) in batches
      const detailsResponse = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails'],
        id: videoIds,
      });

      const videoDetailsMap = new Map(
        (detailsResponse.data.items || []).map(v => [
          v.id || '',
          {
            duration: parseDuration(v.contentDetails?.duration || ''),
          }
        ])
      );

      for (const item of response.data.items || []) {
        const videoId = item.snippet?.resourceId?.videoId || '';
        if (!videoId) {
          console.log(`[getPlaylistItems] Skipping item with no videoId:`, item.snippet?.title);
          continue;
        }
        const details = videoDetailsMap.get(videoId);
        if (!details) {
          console.log(`[getPlaylistItems] Skipping ${videoId}: no details available (may be private/deleted)`);
          continue;
        }
        items.push({
          videoId,
          title: item.snippet?.title || '',
          thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
          channel: item.snippet?.videoOwnerChannelTitle || '',
          position: item.snippet?.position || 0,
          publishedAt: item.snippet?.publishedAt || '',
          duration: details.duration,
        });
        fetched++;
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && fetched < maxResults);

    console.log(`[getPlaylistItems] ${playlistId} total fetched: ${items.length} items`);
    return items;
  }

  async getSubscriptions(maxResults: number = 50): Promise<SubscriptionInfo[]> {
    const items: SubscriptionInfo[] = [];
    let pageToken: string | undefined;
    let fetched = 0;

    do {
      const response = await this.youtube.subscriptions.list({
        part: ['snippet'],
        mine: true,
        maxResults: Math.min(50, maxResults - fetched),
        pageToken,
        order: 'alphabetical',
      });

      for (const item of response.data.items || []) {
        items.push({
          channelId: item.snippet?.resourceId?.channelId || '',
          channelTitle: item.snippet?.title || '',
          thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
          description: item.snippet?.description || '',
        });
        fetched++;
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && fetched < maxResults);

    return items;
  }

  async getChannelVideos(channelId: string, maxResults: number = 50, pageToken?: string): Promise<{ videos: VideoInfo[]; nextPageToken?: string }> {
    // Get the channel's uploads playlist ID (UC... → UU...)
    const uploadsPlaylistId = channelId.startsWith('UC')
      ? 'UU' + channelId.slice(2)
      : channelId;

    // Use playlistItems.list — more reliable than search.list with channelId filter
    const response = await this.youtube.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId: uploadsPlaylistId,
      maxResults,
      pageToken: pageToken || undefined,
    });

    const videoIds = (response.data.items || [])
      .map(item => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
      .filter((id): id is string => !!id);

    if (videoIds.length === 0) return { videos: [], nextPageToken: response.data.nextPageToken || undefined };

    // Fetch full video details (duration, view count, etc.)
    const detailsResponse = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds,
    });

    const videos = (detailsResponse.data.items || []).map(item => ({
      id: item.id || '',
      title: item.snippet?.title || '',
      channel: item.snippet?.channelTitle || '',
      channelId: item.snippet?.channelId || '',
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
      duration: parseDuration(item.contentDetails?.duration || ''),
      publishedAt: item.snippet?.publishedAt || '',
      viewCount: parseInt(item.statistics?.viewCount || '0', 10),
      description: item.snippet?.description || '',
    }));

    return { videos, nextPageToken: response.data.nextPageToken || undefined };
  }

  async searchChannels(query: string, maxResults: number = 10): Promise<SubscriptionInfo[]> {
    const response = await this.youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['channel'],
      maxResults,
    });

    return (response.data.items || [])
      .map(item => ({
        channelId: item.id?.channelId || item.snippet?.channelId || '',
        channelTitle: item.snippet?.title || item.snippet?.channelTitle || '',
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
        description: item.snippet?.description || '',
      }))
      .filter(ch => ch.channelId);
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo> {
    const response = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: [videoId],
    });

    const item = response.data.items?.[0];
    if (!item) throw new Error('Video not found');

    return {
      id: item.id || '',
      title: item.snippet?.title || '',
      channel: item.snippet?.channelTitle || '',
      channelId: item.snippet?.channelId || '',
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
      duration: parseDuration(item.contentDetails?.duration || ''),
      publishedAt: item.snippet?.publishedAt || '',
      viewCount: parseInt(item.statistics?.viewCount || '0', 10),
      description: item.snippet?.description || '',
    };
  }

  // ─── Playlist Write Operations (for sync) ─────────────────────────────────

  async createPlaylist(title: string, description: string = ''): Promise<string> {
    const response = await this.youtube.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title, description },
        status: { privacyStatus: 'private' },
      },
    });
    return response.data.id || '';
  }

  async addVideoToPlaylist(playlistId: string, videoId: string): Promise<void> {
    await this.youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId },
        },
      },
    });
  }

  async removeVideoFromPlaylist(playlistItemId: string): Promise<void> {
    await this.youtube.playlistItems.delete({ id: playlistItemId });
  }

  async unlikeVideo(videoId: string): Promise<void> {
    // To unlike a video, we need to delete it from the Liked Videos playlist (LL)
    // First, find the playlistItemId for this video in the LL playlist
    const items = await this.getPlaylistItemsWithIds('LL');
    const item = items.find(i => i.videoId === videoId);

    if (item) {
      await this.youtube.playlistItems.delete({ id: item.playlistItemId });
      console.log(`[unlikeVideo] Unliked video ${videoId} (playlistItemId: ${item.playlistItemId})`);
    } else {
      console.log(`[unlikeVideo] Video ${videoId} not found in Liked Videos`);
    }
  }

  async getPlaylistItemsWithIds(playlistId: string): Promise<Array<{ playlistItemId: string; videoId: string }>> {
    const items: Array<{ playlistItemId: string; videoId: string }> = [];
    let pageToken: string | undefined;

    do {
      const response = await this.youtube.playlistItems.list({
        part: ['id', 'snippet'],
        playlistId,
        maxResults: 50,
        pageToken,
      });

      for (const item of response.data.items || []) {
        items.push({
          playlistItemId: item.id || '',
          videoId: item.snippet?.resourceId?.videoId || '',
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return items;
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    await this.youtube.playlists.delete({ id: playlistId });
  }
}

function parseDuration(iso8601: string): number {
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
