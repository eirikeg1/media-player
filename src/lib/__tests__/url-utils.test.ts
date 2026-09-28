import { isValidUrl, redactCredentials } from '../url-utils';

describe('redactCredentials', () => {
  it('masks Xtream username and password query parameters', () => {
    expect(
      redactCredentials('http://panel.example.com/get.php?username=alice&password=s3cret&type=m3u'),
    ).toBe('http://panel.example.com/get.php?username=***&password=***&type=m3u');
  });

  it('masks parameters regardless of order and casing', () => {
    expect(redactCredentials('http://host/x?PASSWORD=s3cret&UserName=alice')).toBe(
      'http://host/x?PASSWORD=***&UserName=***',
    );
  });

  it('masks userinfo in the authority', () => {
    expect(redactCredentials('https://alice:s3cret@epg.example.com/xmltv.xml')).toBe(
      'https://***@epg.example.com/xmltv.xml',
    );
  });

  it('masks userinfo and query parameters together', () => {
    expect(redactCredentials('https://alice:s3cret@host/get.php?username=alice&password=p')).toBe(
      'https://***@host/get.php?username=***&password=***',
    );
  });

  it('masks a password that contains an "@" itself', () => {
    // The authority ends at the *last* "@", so a password like this one must not
    // leave its tail behind in the log.
    expect(redactCredentials('https://alice:p@ss@epg.example.com/xmltv.xml')).toBe(
      'https://***@epg.example.com/xmltv.xml',
    );
  });

  it('masks the other parameter names providers use for secrets', () => {
    expect(
      redactCredentials('http://host/api?user=alice&pass=s3cret&token=t&auth=a&pwd=p'),
    ).toBe('http://host/api?user=***&pass=***&token=***&auth=***&pwd=***');
  });

  it('masks Xtream path-style credentials', () => {
    expect(redactCredentials('http://host:8080/live/alice/s3cret/4242.ts')).toBe(
      'http://host:8080/live/***/***/4242.ts',
    );
    expect(redactCredentials('http://host/timeshift/alice/s3cret/90/2026-06-13:15-30/42.ts')).toBe(
      'http://host/timeshift/***/***/90/2026-06-13:15-30/42.ts',
    );
    expect(redactCredentials('http://host/movie/alice/s3cret/42.mkv')).toBe(
      'http://host/movie/***/***/42.mkv',
    );
  });

  it('masks a URL embedded in an error message', () => {
    // Store errors quote whatever the native side reported, and that is what
    // ends up in the UI and the console.
    expect(
      redactCredentials('Download failed: http://alice:s3cret@host/get.php?password=s3cret'),
    ).toBe('Download failed: http://***@host/get.php?password=***');
  });

  it('leaves URLs without credentials untouched', () => {
    const url = 'https://example.com/playlist.m3u?type=m3u_plus&output=ts';
    expect(redactCredentials(url)).toBe(url);
  });

  it('does not mistake a path or query "@" for userinfo', () => {
    const url = 'https://example.com/list?owner=a@b.com';
    expect(redactCredentials(url)).toBe(url);
  });

  it('returns unparseable input unchanged instead of throwing', () => {
    expect(redactCredentials('not a url')).toBe('not a url');
    expect(redactCredentials('')).toBe('');
  });
});

describe('isValidUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/playlist.m3u?user=a&pass=b')).toBe(true);
  });

  it('rejects other protocols, garbage and empty input', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});
