/**
 * Service for handling IPTV playlist operations.
 *
 * Downloading and parsing playlists lives in the Rust backend
 * (`RustChannelService.fetchAndImportPlaylist`); what remains here is the
 * validation the UI and store run before handing a URL over.
 */
export class PlaylistService {
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
}
