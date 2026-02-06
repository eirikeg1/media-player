import type { PlaylistCredentials } from '@/types/playlist.types';

// HTTP Status codes
const HTTP_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;

/**
 * Service for handling IPTV playlist operations
 * Provides static methods for fetching, parsing, and validating IPTV playlists
 */
export class PlaylistService {
  /**
   * Fetch playlist content from a URL.
   * Supports optional HTTP Basic Authentication via credentials parameter.
   * If your URL already contains authentication parameters, pass the full URL without credentials.
   */
  static async fetchPlaylistContent(
    url: string,
    credentials?: PlaylistCredentials
  ): Promise<string> {
    console.log('[PlaylistService] Starting fetch for URL:', url.substring(0, 50) + '...');

    if (!this.validateUrl(url)) {
      console.error('[PlaylistService] URL validation failed:', url);
      throw new Error('Invalid URL format. Please provide a valid HTTP or HTTPS URL.');
    }

    try {
      const fetchUrl = credentials
        ? this.buildAuthenticatedUrl(url, credentials)
        : url;

      console.log('[PlaylistService] Making fetch request...');
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-mpegURL',
          Accept: 'application/x-mpegURL, text/plain, */*',
        },
      });

      console.log('[PlaylistService] Fetch response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (!response.ok) {
        console.error('[PlaylistService] Response not OK:', response.status);
        if (
          response.status === HTTP_STATUS.UNAUTHORIZED ||
          response.status === HTTP_STATUS.FORBIDDEN
        ) {
          throw new Error('Authentication failed. Please check your credentials or URL.');
        } else if (response.status === HTTP_STATUS.NOT_FOUND) {
          throw new Error('Playlist not found. Please verify the URL.');
        } else if (response.status >= HTTP_STATUS.SERVER_ERROR) {
          throw new Error('Server error. Please try again later.');
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }

      console.log('[PlaylistService] Reading response text...');
      const content = await response.text();
      console.log('[PlaylistService] Content received, length:', content.length);

      if (!content || content.trim().length === 0) {
        console.error('[PlaylistService] Content is empty');
        throw new Error('Playlist content is empty');
      }

      console.log('[PlaylistService] Content preview:', content.substring(0, 100));
      return content;
    } catch (error) {
      console.error('[PlaylistService] Error during fetch:', error);
      if (error instanceof TypeError) {
        console.error('[PlaylistService] TypeError details:', error.message, error.stack);
        throw new Error('Network error. Please check your internet connection.');
      }
      if (error instanceof Error) {
        console.error('[PlaylistService] Error message:', error.message);
        throw error;
      }
      throw new Error('Unknown error occurred while fetching playlist');
    }
  }

  /**
   * Validate playlist URL format
   * @param url - The URL to validate
   * @returns True if valid HTTP/HTTPS URL
   */
  static validateUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Build URL with HTTP Basic Authentication credentials.
   * Converts: https://example.com/playlist.m3u + {user, pass}
   * To: https://user:pass@example.com/playlist.m3u
   *
   * Note: This is only for HTTP Basic Auth. If your URL already has
   * credentials as query parameters (e.g., ?username=X&password=Y),
   * use the URL directly without this method.
   */
  private static buildAuthenticatedUrl(
    url: string,
    credentials: PlaylistCredentials
  ): string {
    try {
      const urlObj = new URL(url);
      urlObj.username = encodeURIComponent(credentials.username);
      urlObj.password = encodeURIComponent(credentials.password);
      return urlObj.toString();
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed to parse URL for authentication:', error);
      }
      return url;
    }
  }

}
