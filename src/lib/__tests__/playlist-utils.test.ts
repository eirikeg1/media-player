import {
  generatePlaylistId,
  sanitizePlaylistName,
  formatDate,
  getTimeElapsed,
  extractDomain,
  extractCleanUrl,
  isValidUrl,
} from '../playlist-utils';

describe('generatePlaylistId', () => {
  it('returns format playlist-{timestamp}-{random}', () => {
    const id = generatePlaylistId();
    expect(id).toMatch(/^playlist-\d+-[a-z0-9]{7}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generatePlaylistId()));
    expect(ids.size).toBe(20);
  });
});

describe('sanitizePlaylistName', () => {
  it('trims whitespace', () => {
    expect(sanitizePlaylistName('  My Playlist  ')).toBe('My Playlist');
  });

  it('truncates to 100 characters', () => {
    const longName = 'A'.repeat(150);
    expect(sanitizePlaylistName(longName)).toHaveLength(100);
  });

  it('preserves names under the limit', () => {
    expect(sanitizePlaylistName('Short')).toBe('Short');
  });
});

describe('formatDate', () => {
  it('returns a locale-formatted string', () => {
    const date = new Date('2024-01-15T14:30:00Z');
    const formatted = formatDate(date);
    // Should contain the year and month at minimum
    expect(formatted).toContain('2024');
    expect(formatted).toContain('Jan');
  });
});

describe('getTimeElapsed', () => {
  it('returns "Just now" for recent dates', () => {
    expect(getTimeElapsed(new Date())).toBe('Just now');
  });

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    expect(getTimeElapsed(fiveMinAgo)).toBe('5 minutes ago');
  });

  it('returns singular minute', () => {
    const oneMinAgo = new Date(Date.now() - 1 * 60_000);
    expect(getTimeElapsed(oneMinAgo)).toBe('1 minute ago');
  });

  it('returns hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000);
    expect(getTimeElapsed(threeHoursAgo)).toBe('3 hours ago');
  });

  it('returns days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    expect(getTimeElapsed(twoDaysAgo)).toBe('2 days ago');
  });
});

describe('extractDomain', () => {
  it('extracts hostname from valid URL', () => {
    expect(extractDomain('https://example.com/playlist.m3u')).toBe('example.com');
  });

  it('returns original string for malformed input', () => {
    expect(extractDomain('not-a-url')).toBe('not-a-url');
  });
});

describe('extractCleanUrl', () => {
  it('strips query parameters', () => {
    expect(extractCleanUrl('https://example.com/playlist.m3u?token=123')).toBe(
      'example.com/playlist.m3u',
    );
  });

  it('returns original string for malformed input', () => {
    expect(extractCleanUrl('bad')).toBe('bad');
  });
});

describe('isValidUrl', () => {
  it('accepts http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
  });

  it('rejects ftp URLs', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });

  it('rejects non-URLs', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });
});
